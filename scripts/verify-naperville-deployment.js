"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("parse5");
const { audit } = require("./audit-naperville-pilot");
const { visibleText } = require("../lib/site/structured-data");
const origin = "https://shynlicleaningservice.com";

function nodes(node, name) {
  return [...(node.tagName === name ? [node] : []), ...(node.childNodes || []).flatMap(child => nodes(child, name))];
}
async function read(route) {
  const response = await fetch(origin + route, { signal: AbortSignal.timeout(30000) });
  if (response.status !== 200 || response.url !== origin + route) throw new Error(`${route}: HTTP ${response.status} or redirect`);
  return response.text();
}
async function main() {
  const [mode, directory] = process.argv.slice(2);
  if (!["before", "after"].includes(mode) || !directory) throw new Error("Usage: node scripts/verify-naperville-deployment.js before|after BASELINE_DIRECTORY");
  if (mode === "before") {
    if (fs.existsSync(directory)) throw new Error("Use a fresh baseline directory; never overwrite predeployment evidence.");
    fs.mkdirSync(directory, { recursive: true });
    const xml = await read("/sitemap.xml");
    const rows = nodes(parse(xml), "url").map(node => ({
      route: new URL(visibleText(nodes(node, "loc")[0])).pathname,
      lastmod: visibleText(nodes(node, "lastmod")[0]),
    }));
    fs.writeFileSync(path.join(directory, "sitemap.xml"), xml);
    fs.writeFileSync(path.join(directory, "robots.txt"), await read("/robots.txt"));
    const manifest = [];
    for (const row of [...rows, { route: "/quote" }]) {
      const file = `${manifest.length}.html`;
      fs.writeFileSync(path.join(directory, file), await read(row.route));
      manifest.push({ ...row, file });
      if (manifest.length % 50 === 0) console.log(`Captured ${manifest.length}/${rows.length + 1}`);
    }
    fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    const preserved = Object.fromEntries(rows.filter(row => row.route !== "/naperville" && !row.route.startsWith("/blog")).map(row => [row.route, row.lastmod]));
    fs.writeFileSync(path.join(__dirname, "../lib/site/sitemap-preserved-lastmod.json"), JSON.stringify(preserved, null, 2) + "\n");
    console.log(JSON.stringify({ captured: manifest.length, preservedDates: Object.keys(preserved).length }));
    return;
  }
  const result = await audit(origin, directory);
  result.deployed = true;
  result.checkedAt = new Date().toISOString();
  result.robotsUnchanged = await read("/robots.txt") === fs.readFileSync(path.join(directory, "robots.txt"), "utf8");
  const report = path.join(__dirname, "../output/playwright/naperville-pilot/live-deployment-verification.json");
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ compared: result.comparedOutsideNaperville, nonNapervilleDifferences: result.nonNapervilleDifferences, protectedDifferences: result.protectedDifferences, sitemapDifferences: result.sitemapDifferences, sitemapUrlsUnchanged: result.sitemapUrlsUnchanged, robotsUnchanged: result.robotsUnchanged, report }));
  if (!result.robotsUnchanged || !result.sitemapUrlsUnchanged || result.nonNapervilleDifferences.length || result.protectedDifferences.length || result.sitemapDifferences.some(row => row.path !== "/naperville")) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
