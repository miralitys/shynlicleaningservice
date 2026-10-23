"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { inspectHtml, visibleText } = require("../lib/site/structured-data");
const { originalImagePath } = require("../lib/site/modern-images");
const routes = require("../routes.json");
const attr = (n, k) => n.attrs?.find(a => a.name === k)?.value;
const retired = /callrail|calltrk|AW-18018853979|clarity\.ms|\bclarity\s*\(/i;
function facts(html) {
  const parsed = inspectHtml(html), nodes = parsed.nodes;
  const scripts = nodes.filter(n => n.tagName === "script");
  const scriptText = n => (n.childNodes || []).map(c => c.value || "").join("");
  const allText = n => ["script", "style", "svg", "template"].includes(n.tagName) ? "" : n.nodeName === "#text" ? n.value : (n.childNodes || []).map(allText).join(" ");
  const controls = nodes.filter(n => ["form", "input", "select", "textarea", "button"].includes(n.tagName)).map(n => ({ tag: n.tagName, attrs: (n.attrs || []).filter(a => !["style", "class"].includes(a.name)) }));
  const preservedLinks = nodes.filter(n => n.tagName === "a").map(n => ({ href: attr(n, "href"), rel: attr(n, "rel"), target: attr(n, "target"), text: visibleText(n) }));
  const images = nodes.filter(n => n.tagName === "img").map(n => ({ src: attr(n, "src"), original: originalImagePath(attr(n, "src")), width: attr(n, "width"), height: attr(n, "height"), loading: attr(n, "loading"), alt: attr(n, "alt"), ariaHidden: attr(n, "aria-hidden") }));
  return {
    text: allText(nodes.find(n => n.tagName === "html")).replace(/\s+/g, " ").trim(), controls, preservedLinks, images,
    metadata: nodes.filter(n => ["meta", "title"].includes(n.tagName) || n.tagName === "link" && /canonical|icon/.test(attr(n, "rel") || "")).map(n => ({ tag: n.tagName, attrs: n.attrs, text: scriptText(n) })),
    scripts: scripts.filter(n => !retired.test(attr(n, "id") || "") && !retired.test(attr(n, "src") || "")).map(n => ({ attrs: n.attrs, body: scriptText(n) })),
    retiredHtml: retired.test(html), ownTracking: html.includes("shynli-tracking-bootstrap"), gtm: html.includes("GTM-5P88N7LD"),
    phoneLinks: nodes.filter(n => n.tagName === "a" && /^tel:/.test(attr(n, "href") || "")).map(n => attr(n, "href")),
  };
}
async function audit(base, baseline, output) {
  const manifest = JSON.parse(await fs.readFile(path.join(baseline, "manifest.json"), "utf8"));
  await fs.mkdir(output, { recursive: true });
  const report = { base, checkedAt: new Date().toISOString(), pages: [], failures: [], templates: {} };
  for (const entry of manifest.results) {
    const response = await fetch(base + entry.route, { signal: AbortSignal.timeout(90000) });
    const html = await response.text(), before = facts(await fs.readFile(path.join(baseline, entry.file), "utf8")), after = facts(html);
    const same = key => JSON.stringify(before[key]) === JSON.stringify(after[key]);
    const row = { route: entry.route, template: routes[entry.route] || "generated", status: response.status, retiredHtml: after.retiredHtml, callRail: /callrail|calltrk/i.test(html), adsCode: /AW-18018853979/.test(html), clarityCode: /clarity\.ms|\bclarity\s*\(/i.test(html), gtm: after.gtm, ownTracking: after.ownTracking, textUnchanged: same("text"), formsUnchanged: same("controls"), linksUnchanged: same("preservedLinks"), metadataUnchanged: same("metadata"), keptScriptsUnchanged: same("scripts"), phonesUnchanged: same("phoneLinks"), imageCount: after.images.length, invalidImages: after.images.filter(i => !i.width || !i.height || !i.loading || /\.(?:png|jpe?g)(?:[?#]|$)/i.test(i.src || "")), altsUnchanged: JSON.stringify(before.images.map(i=>[i.alt,i.ariaHidden]))===JSON.stringify(after.images.map(i=>[i.alt,i.ariaHidden])) };
    report.pages.push(row);
    report.templates[row.template] ||= [];
    report.templates[row.template].push(entry.route);
    if (row.status !== 200 || row.retiredHtml || !row.textUnchanged || !row.formsUnchanged || !row.linksUnchanged || !row.metadataUnchanged || !row.keptScriptsUnchanged || !row.phonesUnchanged || row.invalidImages.length || !row.altsUnchanged || before.gtm !== after.gtm || before.ownTracking !== after.ownTracking) report.failures.push(row);
    await fs.writeFile(path.join(output, entry.file), html);
  }
  const sitemap = await (await fetch(base + "/sitemap.xml")).text(), oldSitemap = await fs.readFile(path.join(baseline, "sitemap.xml"), "utf8");
  const robots = await (await fetch(base + "/robots.txt")).text(), oldRobots = await fs.readFile(path.join(baseline, "robots.txt"), "utf8");
  report.sitemapUnchanged = sitemap === oldSitemap; report.robotsUnchanged = robots === oldRobots;
  await fs.writeFile(path.join(output, "audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ pages: report.pages.length, templates: Object.keys(report.templates).length, failures: report.failures, sitemapUnchanged: report.sitemapUnchanged, robotsUnchanged: report.robotsUnchanged }, null, 2));
  if (report.failures.length || !report.sitemapUnchanged || !report.robotsUnchanged) process.exitCode = 1;
}
if (require.main === module) audit(...process.argv.slice(2)).catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { facts, audit };
