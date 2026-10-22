"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("parse5");
const { inspectHtml, visibleText, CITY_PAGES } = require("../lib/site/structured-data");

const COMPARISONS = ["/plainfield", "/aurora", "/bolingbrook", "/yorkville", "/oswego", "/lombard", "/batavia"];
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function nodes(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.childNodes || []).flatMap(child => nodes(child, predicate))];
}
function mainText(html, { excludeReviews = false } = {}) {
  const main = inspectHtml(html).main;
  function text(node) {
    if (excludeReviews && attribute(node, "id") === "naperville-reviews") return "";
    if (["header", "footer", "nav", "script", "style", "svg", "template"].includes(node.tagName)
      || attribute(node, "aria-hidden") === "true") return "";
    if (node.nodeName === "#text") return node.value;
    return ` ${(node.childNodes || []).map(text).join(" ")} `;
  }
  return text(main).replace(/\s+/g, " ").trim();
}
function shingles(html, options) {
  let text = mainText(html, options).normalize("NFKC").toLowerCase();
  for (const name of CITY_PAGES.map(([, name]) => name).sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "city");
  }
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  return new Set(words.slice(4).map((_, index) => words.slice(index, index + 5).join(" ")));
}
function similarity(left, right, options) {
  const a = shingles(left, options), b = shingles(right, options);
  const intersection = [...a].filter(value => b.has(value)).length;
  return 100 * intersection / (a.size + b.size - intersection || 1);
}
function markup(html, predicate) {
  return nodes(parse(html, { sourceCodeLocationInfo: true }), predicate).map(node => {
    const location = node.sourceCodeLocation;
    return html.slice(location.startOffset, location.endOffset);
  });
}
async function audit(baseUrl, baselineDirectory) {
  const load = async route => {
    const response = await fetch(baseUrl + route);
    if (response.status !== 200) throw new Error(`${route}: HTTP ${response.status}`);
    return response.text();
  };
  const html = await load("/naperville");
  const result = { deployed: false, wordCount: mainText(html).split(/\s+/).length,
    editorialWordCount: mainText(html, { excludeReviews: true }).split(/\s+/).length,
    wordCountNote: "The user requested fuller copy after previewing the first draft; total includes all 24 review cards. No font sizes were increased.",
    similarities: {}, similaritiesWithoutReviews: {}, nonNapervilleDifferences: [], protectedDifferences: [], sitemapDifferences: [] };
  for (const route of COMPARISONS) {
    const other = await load(route);
    result.similarities[route] = Number(similarity(html, other).toFixed(2));
    result.similaritiesWithoutReviews[route] = Number(similarity(html, other, { excludeReviews: true }).toFixed(2));
  }
  result.hasUnverifiedReviewCount = /300\+|300 plus/i.test(html);
  result.hasFoxValley = /Fox Valley/i.test(html);
  result.reviews = markup(html, node => Boolean(attribute(node, "data-naperville-review"))).length;
  result.faq = inspectHtml(html).faq;
  result.schemas = inspectHtml(html).scripts.map(node => JSON.parse(node.childNodes.map(child => child.value || "").join("")));
  const liveXml = await load("/sitemap.xml");
  const sitemapRows = xml => nodes(parse(xml), node => node.tagName === "url").map(node => ({
    path: new URL(visibleText(nodes(node, item => item.tagName === "loc")[0])).pathname,
    lastmod: visibleText(nodes(node, item => item.tagName === "lastmod")[0]),
  }));
  if (baselineDirectory) {
    const manifest = JSON.parse(fs.readFileSync(path.join(baselineDirectory, "manifest.json"), "utf8"));
    for (const item of manifest.filter(item => item.route !== "/naperville")) {
      if (await load(item.route) !== fs.readFileSync(path.join(baselineDirectory, item.file), "utf8")) result.nonNapervilleDifferences.push(item.route);
    }
    result.comparedOutsideNaperville = manifest.length - 1;
    const entry = manifest.find(item => item.route === "/naperville");
    const previous = fs.readFileSync(path.join(baselineDirectory, entry.file), "utf8");
    const hasClass = (node, name) => attribute(node, "class")?.split(/\s+/).includes(name);
    const protectedBlocks = {
      header: node => node.tagName === "header", footer: node => node.tagName === "footer",
      nearbyAreas: node => hasClass(node, "sg-areas"), quote: node => hasClass(node, "sg-quote"),
      styles: node => node.tagName === "style" && !["naperville-copy-fit", "naperville-review-style"].includes(attribute(node, "id")) || node.tagName === "link" && attribute(node, "rel") === "stylesheet",
      images: node => node.tagName === "img",
      runtimeScripts: node => node.tagName === "script" && attribute(node, "type") !== "application/ld+json",
      otherSchemas: node => node.tagName === "script" && attribute(node, "type") === "application/ld+json" && attribute(node, "id") !== "schema-faq",
      robotsCanonical: node => node.tagName === "meta" && attribute(node, "name") === "robots" || node.tagName === "link" && attribute(node, "rel") === "canonical",
    };
    for (const [name, predicate] of Object.entries(protectedBlocks)) {
      if (JSON.stringify(markup(html, predicate)) !== JSON.stringify(markup(previous, predicate))) result.protectedDifferences.push(name);
    }
    const before = sitemapRows(fs.readFileSync(path.join(baselineDirectory, "sitemap.xml"), "utf8"));
    const after = sitemapRows(liveXml);
    result.sitemapUrlsUnchanged = JSON.stringify(after.map(item => item.path)) === JSON.stringify(before.map(item => item.path));
    result.sitemapDifferences = after.filter(item => item.lastmod !== before.find(old => old.path === item.path)?.lastmod);
  }
  return result;
}

if (require.main === module) {
  audit(process.argv[2] || "http://127.0.0.1:58103", process.argv[3]).then(result => {
    const out = path.join(__dirname, "../docs/naperville-pilot/verification.json");
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
    if (result.editorialWordCount < 450 || result.hasUnverifiedReviewCount || result.hasFoxValley || Object.values(result.similarities).some(value => value >= 40)
      || result.nonNapervilleDifferences.length || result.protectedDifferences.length || result.sitemapDifferences.some(item => item.path !== "/naperville")) process.exitCode = 1;
  }).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { audit, similarity, mainText, markup, COMPARISONS };
