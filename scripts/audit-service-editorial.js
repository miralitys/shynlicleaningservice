"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { parse } = require("parse5");
const { inspectHtml, visibleText } = require("../lib/site/structured-data");
const { pages, sources } = require("../lib/site/service-editorial-data");
const release = require("../lib/site/service-editorial-release.json");

const attr = (node, key) => node.attrs?.find(item => item.name === key)?.value;
function mainText(html, { excludeReviews = false, excludeFaq = false } = {}) {
  const { main } = inspectHtml(html);
  function text(node) {
    if (["header", "footer", "nav", "script", "style", "svg", "template"].includes(node.tagName) || attr(node, "aria-hidden") === "true") return "";
    if (excludeReviews && /(?:^|\s)clients-say-home(?:\s|$)/.test(attr(node, "class") || "")) return "";
    if (excludeFaq && /(?:^|\s)(?:se-faq|faq)(?:\s|$)/.test(attr(node, "class") || "")) return "";
    if (node.nodeName === "#text") return node.value;
    return ` ${(node.childNodes || []).map(text).join(" ")} `;
  }
  return text(main).replace(/\s+/g, " ").trim();
}
const wordCount = text => text ? text.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length : 0;
function similarity(left, right) {
  function shingles(html) {
    const words = mainText(html).toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) || [];
    return new Set(words.slice(4).map((_, index) => words.slice(index, index + 5).join(" ")));
  }
  const a = shingles(left), b = shingles(right), intersection = [...a].filter(value => b.has(value)).length;
  return Number((100 * intersection / (a.size + b.size - intersection || 1)).toFixed(2));
}

async function audit(base, baselineDirectory, outputDirectory) {
  const baseline = JSON.parse(await fs.readFile(path.join(baselineDirectory, "manifest.json"), "utf8"));
  await fs.mkdir(outputDirectory, { recursive: true });
  const existingServices = Object.keys(require("../routes.json")).filter(route => /^\/services\/[^/]+$/.test(route)).sort();
  const report = { version: release.edition, deployedAt: release.deployedAt, preview: base, checkedAt: new Date().toISOString(), pages: {}, comparisonRoutes: existingServices, similarities: {}, changedPages: [], unexpectedChanges: [] };
  const rendered = {};
  let cursor = 0;
  async function worker() {
    while (cursor < baseline.results.length) {
      const entry = baseline.results[cursor++];
      const response = await fetch(base + entry.route);
      if (response.status !== 200) throw new Error(`${entry.route}: HTTP ${response.status}`);
      const html = await response.text();
      const old = await fs.readFile(path.join(baselineDirectory, entry.file), "utf8");
      if (html !== old) {
        report.changedPages.push(entry.route);
        if (!Object.hasOwn(pages, entry.route)) report.unexpectedChanges.push(entry.route);
      }
      if (existingServices.includes(entry.route)) rendered[entry.route] = html;
      if (!Object.hasOwn(pages, entry.route)) continue;
      const facts = inspectHtml(html), page = pages[entry.route];
      const schemas = facts.scripts.map(node => JSON.parse(node.childNodes.map(child => child.value || "").join("")));
      const text = mainText(html);
      const main = facts.main;
      report.pages[entry.route] = {
        beforeWords: wordCount(mainText(old)), afterWords: wordCount(text),
        editorialWordsExcludingReviews: wordCount(mainText(html, { excludeReviews: true })),
        beforeHadMain: inspectHtml(old).main.tagName === "main", mainCount: facts.nodes.filter(node => node.tagName === "main").length,
        title: facts.nodes.find(node => node.tagName === "title")?.childNodes.map(node => node.value || "").join(""),
        canonical: attr(facts.nodes.find(node => node.tagName === "link" && attr(node, "rel") === "canonical"), "href"),
        description: attr(facts.nodes.find(node => node.tagName === "meta" && attr(node, "name") === "description"), "content"),
        schemaTypes: schemas.map(value => value["@type"]), faqMatchesSchema: JSON.stringify(facts.faq) === JSON.stringify(schemas.find(value => value["@type"] === "FAQPage")?.mainEntity),
        forbiddenSchema: /"(?:aggregateRating|reviewCount|offers)"\s*:/.test(JSON.stringify(schemas)),
        forbiddenCopy: /300\+|\bhundreds\b|\bCOI\b|insurance certificates|Page Under Development|[\u2013\u2014]|nestled|look no further|top-notch/i.test(text),
        badge: facts.nodes.some(node => attr(node, "aria-label") === "58 Google reviews"),
        reviews: facts.nodes.filter(node => attr(node, "data-service-review")).length,
        requiredLinks: ["/pricing", "/quote", "/service-areas", ...page.related.map(([, href]) => href)].every(href => facts.serviceLinks.has(href)),
        quoteForms: facts.nodes.filter(node => node.tagName === "form" && attr(node, "action") === "/quote" && attr(node, "method") === "get").length,
        sourceReferences: [...new Set(["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "REVIEWS", ...(entry.route.endsWith("airbnb-cleaning") ? ["A1"] : entry.route.endsWith("commercial-cleaning") ? ["B1"] : ["P1"]), ...page.sections.flatMap(section => section.sources), ...page.checklistSources, ...page.scopeSources, ...page.quoteSources, ...page.faqSources])].map(key => ({ key, source: sources[key] || key })),
      };
      await fs.writeFile(path.join(outputDirectory, entry.route.split("/").pop() + ".html"), html);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  for (const route of existingServices) report.similarities[route] = Object.fromEntries(existingServices.map(other => [other, route === other ? 100 : similarity(rendered[route], rendered[other])]));
  report.changedPages.sort(); report.unexpectedChanges.sort();
  const sitemapRows = xml => inspectHtml(xml).nodes.filter(node => node.tagName === "url").map(node => ({
    route: new URL(visibleText(node.childNodes.find(child => child.tagName === "loc"))).pathname,
    lastmod: visibleText(node.childNodes.find(child => child.tagName === "lastmod")),
  }));
  const liveSitemap = await fs.readFile(path.join(baselineDirectory, "sitemap.xml"), "utf8")
    .catch(async () => (await fetch("https://shynlicleaningservice.com/sitemap.xml")).text());
  const previewSitemap = await (await fetch(base + "/sitemap.xml")).text();
  const beforeSitemap = sitemapRows(liveSitemap), afterSitemap = sitemapRows(previewSitemap);
  report.sitemapUrlsUnchanged = JSON.stringify(beforeSitemap.map(item => item.route)) === JSON.stringify(afterSitemap.map(item => item.route));
  report.sitemapChanges = afterSitemap.filter(item => item.lastmod !== beforeSitemap.find(old => old.route === item.route)?.lastmod);
  await fs.writeFile(path.join(outputDirectory, "sitemap-before.xml"), liveSitemap);
  await fs.writeFile(path.join(outputDirectory, "sitemap-preview.xml"), previewSitemap);
  const hash = createHash("sha256");
  for (const file of ["lib/site/service-editorial-data.js", "lib/site/service-editorial.js", "css/service-editorial.css", "css/service-editorial-home.css", "js/service-editorial.js"]) hash.update(await fs.readFile(path.join(__dirname, "..", file)));
  report.sourceFingerprint = hash.digest("hex");
  report.wordCountMethod = "Server-rendered main text, including all accordion answers and six written review excerpts; scripts, styles, SVG, hidden decorations and header/footer/nav excluded. Before post-construction uses body fallback because no main existed. Also reports editorial count without reviews.";
  await fs.writeFile(path.join(outputDirectory, "audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (report.unexpectedChanges.length || !report.sitemapUrlsUnchanged || report.sitemapChanges.some(item => !Object.hasOwn(pages, item.route)) || Object.entries(report.pages).some(([route, page]) => page.mainCount !== 1 || page.forbiddenCopy || page.forbiddenSchema || !page.faqMatchesSchema || !page.requiredLinks || page.canonical !== "https://shynlicleaningservice.com" + route || !page.badge || page.reviews !== 6 || page.quoteForms !== 1)
    || Object.keys(pages).some(route => existingServices.some(other => other !== route && report.similarities[route][other] >= 40))) process.exitCode = 1;
  return report;
}

if (require.main === module) audit(process.argv[2], process.argv[3], process.argv[4]).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { audit, mainText, similarity, wordCount };
