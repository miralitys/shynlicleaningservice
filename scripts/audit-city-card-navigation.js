"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("parse5");

const cityRoutes = ["/naperville", "/aurora", "/plainfield", "/bolingbrook"];
const attr = (node, key) => node.attrs?.find(item => item.name === key)?.value;
function nodes(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.childNodes || []).flatMap(child => nodes(child, predicate))];
}
function expectedHtml(html, route) {
  if (!cityRoutes.includes(route)) return html;
  const cards = nodes(parse(html, { sourceCodeLocationInfo: true }), node => node.tagName === "div" && attr(node, "data-service-city-card"));
  if (cards.length !== 2) throw new Error(`${route}: expected the two published pre-change card wrappers`);
  const patches = cards.map(card => {
    const slug = attr(card, "data-service-city-card");
    if (!["deep-cleaning", "move-out-cleaning"].includes(slug)) throw new Error(`${route}: unexpected card service`);
    const location = card.sourceCodeLocation;
    const cta = nodes(card, node => attr(node, "class") === "sg-service-card__cta")[0]?.sourceCodeLocation;
    if (!cta) throw new Error(`${route}: missing original Learn more container`);
    const source = (html.slice(location.startOffset, cta.startOffset)
      + '<span class="sg-service-card__cta">Learn more</span>'
      + html.slice(cta.endOffset, location.endOffset))
      .replace(/^<div\b/, "<a")
      .replace(/ data-service-city-card=/, ` href="${route}/${slug}" data-service-city-card=`)
      .replace(/<\/div>$/, "</a>");
    return { start: location.startOffset, end: location.endOffset, source };
  });
  return patches.sort((a, b) => b.start - a.start).reduce((result, patch) => result.slice(0, patch.start) + patch.source + result.slice(patch.end), html);
}
async function audit(base, baseline, output) {
  const manifest = JSON.parse(fs.readFileSync(path.join(baseline, "manifest.json"), "utf8"));
  const read = async route => {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(30000) });
    if (response.status !== 200) throw new Error(`${route}: HTTP ${response.status}`);
    return response.text();
  };
  const result = { checkedAt: new Date().toISOString(), base, pages: manifest.length, changed: [], unchanged: 0, sitemapUnchanged: false, robotsUnchanged: false, failures: [] };
  for (const item of manifest) {
    const before = fs.readFileSync(path.join(baseline, item.file), "utf8");
    const after = await read(item.route);
    if (after !== expectedHtml(before, item.route)) result.failures.push(item.route);
    if (after === before) result.unchanged++;
    else result.changed.push(item.route);
  }
  result.sitemapUnchanged = await read("/sitemap.xml") === fs.readFileSync(path.join(baseline, "sitemap.xml"), "utf8");
  result.robotsUnchanged = await read("/robots.txt") === fs.readFileSync(path.join(baseline, "robots.txt"), "utf8");
  if (!result.sitemapUnchanged || !result.robotsUnchanged) result.failures.push("sitemap or robots");
  if (result.changed.length !== 4 || !cityRoutes.every(route => result.changed.includes(route))) result.failures.push("changed-page allowlist");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "isolation.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  return result;
}
if (require.main === module) audit(...process.argv.slice(2)).then(result => { if (result.failures.length) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { audit, expectedHtml };
