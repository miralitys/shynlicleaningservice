"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { parse } = require("parse5");
const { createHash } = require("node:crypto");
const routes = require("../routes.json");

function inspect(html) {
  const nodes = [];
  const text = node => {
    nodes.push(node);
    if (["script", "style", "template"].includes(node.tagName)) return "";
    const value = node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join(" ");
    node.auditText = value.replace(/\s+/g, " ").trim();
    return value;
  };
  const document = parse(html, { sourceCodeLocationInfo: true });
  const body = text(document).replace(/\s+/g, " ").trim();
  const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
  const source = node => html.slice(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset);
  const labels = nodes.filter(node => node.tagName && /^(Customer Reviews|Google reviews)$/i.test(node.auditText || "") && !node.childNodes?.some(child => child.tagName && child.auditText === node.auditText));
  const schemas = [];
  function schemaValues(value, location) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (["aggregateRating", "reviewCount"].includes(key)) schemas.push({ location: `${location}.${key}`, value: child });
      schemaValues(child, `${location}.${key}`);
    }
  }
  const ld = [];
  function scripts(node) {
    if (node.tagName === "script" && attr(node, "type") === "application/ld+json") {
      ld.push(source(node));
      schemaValues(JSON.parse(node.childNodes.map(child => child.value || "").join("")), "$" );
    }
    for (const child of node.childNodes || []) scripts(child);
  }
  scripts(document);
  return {
    hash: createHash("sha256").update(html).digest("hex"),
    legacy: body.match(/300\+\s+(?:Customer\s+)?Reviews|Customer\s+Reviews\s+300\+/gi) || [],
    completed: body.match(/300\+\s+cleanings\s+completed/gi) || [],
    labels: labels.map(node => ({ text: node.auditText, parent: node.parentNode.tagName, class: attr(node.parentNode, "class"), snippet: source(node.parentNode).slice(0, 600) })),
    schemas, ld,
  };
}

async function capture(base, directory) {
  await fs.mkdir(directory, { recursive: true });
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  const sitemapRoutes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
  const all = [...new Set([...sitemapRoutes, ...Object.keys(routes)])].sort();
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < all.length) {
      const route = all[cursor++];
      const response = await fetch(base + route, { signal: AbortSignal.timeout(90000) });
      const html = await response.text();
      const file = `${String(all.indexOf(route)).padStart(3, "0")}.html`;
      await fs.writeFile(path.join(directory, file), html);
      results.push({ route, status: response.status, finalPath: new URL(response.url).pathname, file, ...inspect(html) });
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  results.sort((a, b) => a.route.localeCompare(b.route));
  await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify({ base, capturedAt: new Date().toISOString(), sitemapRoutes, results }, null, 2));
  console.log(JSON.stringify({ pages: results.length, legacy: results.filter(item => item.legacy.length).map(({ route, legacy, labels }) => ({ route, legacy, labels })), schemaCounts: results.filter(item => item.schemas.length).map(({ route, schemas }) => ({ route, schemas })), completed: results.filter(item => item.completed.length).map(({ route, completed }) => ({ route, completed })) }, null, 2));
}

async function compare(beforeDirectory, afterDirectory, outputFile) {
  const before = JSON.parse(await fs.readFile(path.join(beforeDirectory, "manifest.json"), "utf8"));
  const after = JSON.parse(await fs.readFile(path.join(afterDirectory, "manifest.json"), "utf8"));
  const { applyReviewBadges } = require("../lib/site/review-badges");
  const changed = [], unexpected = [], schemaChanges = [], cleaningCountChanges = [];
  for (const entry of before.results) {
    const next = after.results.find(item => item.route === entry.route);
    if (!next) throw new Error(`Missing route: ${entry.route}`);
    const oldHtml = await fs.readFile(path.join(beforeDirectory, entry.file), "utf8");
    const newHtml = await fs.readFile(path.join(afterDirectory, next.file), "utf8");
    if (oldHtml !== newHtml) changed.push({ route: entry.route, old: entry.legacy, new: "58 Google reviews" });
    if (applyReviewBadges(oldHtml) !== newHtml) unexpected.push(entry.route);
    if (JSON.stringify(entry.ld) !== JSON.stringify(next.ld)) schemaChanges.push(entry.route);
    if (JSON.stringify(entry.completed) !== JSON.stringify(next.completed)) cleaningCountChanges.push(entry.route);
  }
  const sourceFiles = ["lib/site/review-badges.js", "lib/site/sanitize.js"];
  const hash = createHash("sha256");
  for (const file of sourceFiles) hash.update(await fs.readFile(path.join(__dirname, "..", file)));
  const report = {
    version: `review-badges-${hash.digest("hex").slice(0, 12)}`,
    deployed: new URL(after.base).hostname === "shynlicleaningservice.com",
    baseline: before.base,
    preview: after.base,
    checkedAt: new Date().toISOString(),
    sitemapPages: before.sitemapRoutes.length,
    totalPages: before.results.length,
    changed,
    unchangedPages: before.results.length - changed.length,
    remainingLegacy: after.results.filter(entry => entry.legacy.length).map(entry => entry.route),
    unexpectedHtmlChanges: unexpected,
    schemaChanges,
    schemaReviewCounts: before.results.filter(entry => entry.schemas.length).map(({ route, schemas }) => ({ route, schemas })),
    cleaningCountChanges,
    preservedCleaningCounts: before.results.filter(entry => entry.completed.length).map(({ route, completed }) => ({ route, occurrences: completed.length })),
    failedResponses: after.results.filter(entry => entry.status !== 200).map(({ route, status }) => ({ route, status })),
  };
  await fs.writeFile(outputFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (unexpected.length || schemaChanges.length || cleaningCountChanges.length || report.remainingLegacy.length || report.failedResponses.length) process.exitCode = 1;
}

if (require.main === module) {
  const run = process.argv[2] === "--compare"
    ? compare(process.argv[3], process.argv[4], process.argv[5])
    : capture(process.argv[2], process.argv[3]);
  run.catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { inspect, capture, compare };
