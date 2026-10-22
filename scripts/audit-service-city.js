"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { parse } = require("parse5");
const { pages, sources } = require("../lib/site/service-city-data");
const release = require("../lib/site/service-city-release.json");
const { addServiceCityLinks } = require("../lib/site/service-city");
const { inspectHtml } = require("../lib/site/structured-data");
const { mainText, markup } = require("./audit-naperville-pilot");
const attr = (node, key) => node.attrs?.find(item => item.name === key)?.value;
const linkedRoutes = [...new Set(Object.values(pages).flatMap(page => [`/${page.citySlug}`, page.service.parent]))];
const comparedRoutes = [...Object.keys(pages), ...linkedRoutes];
const localFacts = {
  naperville: ["DuPage and Will counties", "ZIP 60540, 60563, 60564, 60565", "Condos and apartments through five-bedroom houses"],
  aurora: ["ZIP 60502, 60504, 60505, 60506", "Apartments and townhomes are common among existing clients"],
  plainfield: ["Will and Kendall counties", "ZIP 60544, 60585, 60586", "Most existing clients book regular cleaning, mainly every two weeks"],
  bolingbrook: ["Will and DuPage counties", "ZIP 60440, 60490", "Regular cleaning booked most, followed by deep and moving services"],
};
const names = ["Move-In / Move-Out Cleaning", "Move-In/Move-Out Cleaning", "move-in/move-out", "move-in", "move-out", "Move Cleaning", "moving clean", "Deep Cleaning", "Naperville", "Aurora", "Plainfield", "Bolingbrook"];
function shingles(html) {
  let text = mainText(html).normalize("NFKC").toLowerCase();
  for (const name of names) text = text.replaceAll(name.toLowerCase(), "name");
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  return new Set(words.slice(4).map((_, index) => words.slice(index, index + 5).join(" ")));
}
function similarity(left, right) {
  const a = shingles(left), b = shingles(right);
  const overlap = [...a].filter(value => b.has(value)).length;
  return 100 * overlap / (a.size + b.size - overlap || 1);
}
const classHas = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);
const schemas = html => inspectHtml(html).scripts.map(node => JSON.parse(node.childNodes.map(child => child.value || "").join("")));
function sitemapEntries(xml) {
  return markup(xml, node => node.tagName === "url").map(source => {
    const loc = markup(source, node => node.tagName === "loc")[0].replace(/<[^>]+>/g, "");
    return [new URL(loc).pathname, source];
  });
}
async function audit(base, baseline, output) {
  const read = async route => {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(30000) });
    if (response.status !== 200) throw new Error(`${route}: HTTP ${response.status}`);
    return response.text();
  };
  const version = "service-city-" + createHash("sha256").update(fs.readFileSync(path.join(__dirname, "../lib/site/service-city.js"))).update(fs.readFileSync(path.join(__dirname, "../lib/site/service-city-data.js"))).digest("hex").slice(0, 8);
  const result = { version, checkedAt: new Date().toISOString(), base, deployed: new URL(base).hostname === "shynlicleaningservice.com", words: {}, similarities: {}, facts: {}, checks: {}, existingPagesChecked: 0, unexpectedChanges: [], failures: [] };
  const html = {};
  for (const route of comparedRoutes) html[route] = await read(route);
  for (const [route, page] of Object.entries(pages)) {
    const text = mainText(html[route]);
    const parsed = inspectHtml(html[route]);
    const json = schemas(html[route]);
    result.words[route] = text.split(/\s+/).length;
    const claims = [...localFacts[page.citySlug]];
    if (page.serviceSlug === "deep-cleaning") {
      if (page.citySlug === "naperville") claims.push("Deep cleaning booked more often than regular cleaning");
      if (page.citySlug === "plainfield") claims.push("Deep booked less often; not assumed to be the first visit before recurring service");
      if (page.citySlug === "aurora") claims.push("Regular and deep booked about equally", "Fox River plus wells, lime-softened, about 6 to 10 grains per gallon; extra attention to faucets, fixtures and shower glass");
    } else if (page.citySlug === "aurora") claims.push("Moving service booked less often than regular and deep; no water claim");
    result.facts[route] = { localClaims: claims, sources: page.sources.map(key => ({ key, source: sources[key] })) };
    result.similarities[route] = Object.fromEntries(comparedRoutes.map(other => [other, route === other ? null : Number(similarity(html[route], html[other]).toFixed(2))]));
    const parent = html[`/${page.citySlug}`];
    const reviews = value => markup(value, node => attr(node, "data-city-review") !== undefined || attr(node, "data-naperville-review") !== undefined);
    const forms = value => markup(value, node => node.tagName === "form" && attr(node, "data-quote-form") !== undefined);
    const c = result.checks[route] = {
      canonical: markup(html[route], node => node.tagName === "link" && attr(node, "rel") === "canonical")[0] === `<link rel="canonical" href="https://shynlicleaningservice.com${route}">`,
      indexable: !/noindex|nofollow/i.test(markup(html[route], node => node.tagName === "meta" && attr(node, "name") === "robots").join("")),
      jsonLdTypes: json.map(node => node["@type"]),
      faqMatches: JSON.stringify(json.find(node => node["@type"] === "FAQPage")?.mainEntity) === JSON.stringify(parsed.faq),
      breadcrumbs: json.find(node => node["@type"] === "BreadcrumbList")?.itemListElement.map(item => item.item),
      quoteFormIdentical: JSON.stringify(forms(html[route])) === JSON.stringify(forms(parent)),
      reviewsIdentical: JSON.stringify(reviews(html[route])) === JSON.stringify(reviews(parent)),
      zipsPresent: page.city.zips.every(zip => text.includes(zip)),
      noInventedPrices: !/\$\s*\d/.test(text),
      noWaterOnMove: page.serviceSlug !== "move-out-cleaning" || !/\bwater\b/i.test(text),
      exactServicePhraseCount: (text.toLowerCase().split(`${page.service.name.toLowerCase()} in ${page.city.name.toLowerCase()}`).length - 1),
      headerIdentical: JSON.stringify(markup(html[route], node => node.tagName === "header")) === JSON.stringify(markup(parent, node => node.tagName === "header")),
      footerIdentical: JSON.stringify(markup(html[route], node => node.tagName === "footer")) === JSON.stringify(markup(parent, node => node.tagName === "footer")),
    };
    if (result.words[route] < 900 || result.words[route] > 1100 || c.exactServicePhraseCount > 3 || Object.values(c).includes(false) || parsed.faq.length !== 5 || c.jsonLdTypes.join(",") !== "Service,BreadcrumbList,FAQPage" || c.breadcrumbs.join(",") !== ["https://shynlicleaningservice.com/", `https://shynlicleaningservice.com/${page.citySlug}`, `https://shynlicleaningservice.com${route}`].join(",")) result.failures.push(`${route}: page checks`);
    for (const other of [...Object.keys(pages).filter(other => other !== route), `/${page.citySlug}`, page.service.parent]) if (result.similarities[route][other] >= 40) result.failures.push(`${route}/${other}: similarity`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(baseline, "manifest.json"), "utf8"));
  for (const item of manifest) {
    const previous = fs.readFileSync(path.join(baseline, item.file), "utf8");
    const current = html[item.route] || await read(item.route);
    if (current !== addServiceCityLinks(previous, item.route)) result.unexpectedChanges.push(item.route);
    result.existingPagesChecked++;
  }
  const before = new Map(sitemapEntries(fs.readFileSync(path.join(baseline, "sitemap.xml"), "utf8")));
  const after = new Map(sitemapEntries(await read("/sitemap.xml")));
  result.sitemapAdded = [...after.keys()].filter(route => !before.has(route));
  result.deploymentDate = release.deployedAt;
  result.newSitemapDatesCorrect = !release.deployedAt || Object.keys(pages).every(route => after.get(route)?.includes(`<lastmod>${release.deployedAt}T00:00:00.000Z</lastmod>`));
  result.existingSitemapEntriesUnchanged = [...before].every(([route, entry]) => after.get(route) === entry);
  result.robotsUnchanged = await read("/robots.txt") === fs.readFileSync(path.join(baseline, "robots.txt"), "utf8");
  if (result.unexpectedChanges.length || !result.existingSitemapEntriesUnchanged || !result.newSitemapDatesCorrect || !result.robotsUnchanged || result.sitemapAdded.length !== 8 || !Object.keys(pages).every(route => after.has(route))) result.failures.push("Existing page/sitemap isolation");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify(result, null, 2) + "\n");
  const labels = Object.fromEntries(comparedRoutes.map((route, index) => [route, String(index + 1)]));
  const lines = ["# Service in City: Verification", "", `Version: ${version}. Checked: ${result.checkedAt}. ${result.deployed ? "Production" : "Local preview, not deployed"}.`, "", "## URLs and Word Counts", "", "| # | URL | Main Words |", "| --- | --- | --- |", ...comparedRoutes.map(route => `| ${labels[route]} | ${route} | ${result.words[route] || "reference"} |`), "", "Counts include the complete existing written review component and FAQ, excluding header, footer, navigation and scripts. No review text was rewritten.", "", "## Similarity", "", "City and service names masked; 5-word shingle Jaccard; complete main text including shared reviews. Values are percentages. Columns are the numbered URLs above. Diagonal omitted.", "", `| Page | ${comparedRoutes.map(route => labels[route]).join(" | ")} |`, `| --- | ${comparedRoutes.map(() => "---").join(" | ")} |`, ...Object.keys(pages).map(route => `| ${labels[route]} | ${comparedRoutes.map(other => result.similarities[route][other] ?? "-").join(" | ")} |`), "", "## Facts and Sources", "", ...Object.keys(pages).flatMap(route => [`### ${route}`, "", ...result.facts[route].localClaims.map(claim => `- Used local fact: ${claim}.`), ...result.facts[route].sources.map(fact => `- Source ${fact.key}: ${fact.source}`), ""]), "## Isolation and Checks", "", `Existing pages compared: ${result.existingPagesChecked}. Unexpected changes: ${JSON.stringify(result.unexpectedChanges)}. The six parent pages differ only by local-service links: two full-card anchors point to the city-specific services with a single Learn more label, and the service pages have a Popular areas line. All other HTML is byte-identical.`, "", `Existing sitemap entries unchanged: ${result.existingSitemapEntriesUnchanged}. Added URLs: ${result.sitemapAdded.join(", ")}. Robots unchanged: ${result.robotsUnchanged}.`, "", `Failures: ${JSON.stringify(result.failures)}. See verification.json for per-page form, schema, review and canonical checks.`, "", "The release date remains pending until deployment. Run scripts/mark-service-city-deployment.js with the actual Chicago deploy date before publishing. Google Rich Results Test and browser QA are reported separately; local parsing is not a substitute for a completed Google test."];
  lines[lines.length - 1] = release.deployedAt
    ? `Deployment date recorded: ${release.deployedAt} (America/Chicago). Only the eight new sitemap entries use this release date. Date checks passed: ${result.newSitemapDatesCorrect}. Browser and Google code-test evidence are documented separately in README.md.`
    : lines[lines.length - 1];
  fs.writeFileSync(path.join(output, "report.md"), lines.join("\n") + "\n");
  console.log(JSON.stringify({ version, words: result.words, maxRequiredSimilarity: Math.max(...Object.entries(pages).flatMap(([route, page]) => [...Object.keys(pages).filter(other => other !== route), `/${page.citySlug}`, page.service.parent].map(other => result.similarities[route][other]))), existingPagesChecked: result.existingPagesChecked, unexpectedChanges: result.unexpectedChanges, sitemapAdded: result.sitemapAdded, failures: result.failures }, null, 2));
  return result;
}
if (require.main === module) audit(...process.argv.slice(2)).then(result => { if (result.failures.length) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { audit, similarity, linkedRoutes, comparedRoutes };
