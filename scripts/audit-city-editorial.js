"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { parse } = require("parse5");
const { cities: defaultCities } = require("../lib/site/city-editorial-data");
const defaultRelease = require("../lib/site/city-editorial-release.json");
const { mainText, markup, similarity } = require("./audit-naperville-pilot");
const { inspectHtml, visibleText } = require("../lib/site/structured-data");
const routes = ["/naperville", ...Object.keys(defaultCities).map(slug => `/${slug}`)];
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const cls = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);
const occurrences = (text, value) => value ? text.split(value).length - 1 : 0;
function modificationDates(value) {
  if (!value || typeof value !== "object") return [];
  return [...(Object.hasOwn(value, "dateModified") ? [value.dateModified] : []), ...Object.values(value).flatMap(modificationDates)];
}
function counts(html, city) {
  const text = mainText(html);
  const withoutFaq = mainText(html.replace(markup(html, node => cls(node, "sg-faq"))[0], ""));
  const count = value => ({
    bookingPreference: (value.match(/most booked|booked most|booked about equally/gi) || []).length,
    countyStatement: occurrences(value, city.counties),
    supplies: (value.match(/bring all cleaning supplies and equipment/gi) || []).length,
    parking: (value.match(/ask where (?:our )?cleaners can park/gi) || []).length,
    typicalHome: (value.match(/typical (?:\w+ )?(?:home|appointment)|typically with (?:four|five)/gi) || []).length,
  });
  return { body: count(text), outsideFaq: count(withoutFaq) };
}
const protectedNodes = {
  title: node => node.tagName === "title",
  description: node => node.tagName === "meta" && attr(node, "name") === "description",
  h1: node => node.tagName === "h1",
  canonical: node => node.tagName === "link" && attr(node, "rel") === "canonical",
  robots: node => node.tagName === "meta" && attr(node, "name") === "robots",
  header: node => node.tagName === "header", footer: node => node.tagName === "footer",
  areasAndZipForm: node => cls(node, "sg-areas"), quoteForm: node => cls(node, "sg-quote"),
  images: node => node.tagName === "img",
  runtimeScripts: node => node.tagName === "script" && attr(node, "type") !== "application/ld+json",
  originalStyles: node => node.tagName === "style" && attr(node, "id") !== "city-editorial-fit" && !cls(node.parentNode, "clients-say-home") || node.tagName === "link" && attr(node, "rel") === "stylesheet",
};
async function audit(base, baselineDirectory, outputDirectory, options = {}) {
  const cities = options.cities || defaultCities;
  const release = options.release || defaultRelease;
  const auditRoutes = options.routes || routes;
  const read = async route => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(base + route, { signal: AbortSignal.timeout(30000) });
        if (response.status !== 200) throw new Error(`${route}: HTTP ${response.status}`);
        return await response.text();
      } catch (error) { if (attempt === 2) throw error; }
    }
  };
  const manifest = JSON.parse(fs.readFileSync(path.join(baselineDirectory, "manifest.json"), "utf8"));
  const originals = Object.fromEntries(manifest.map(item => [item.route, fs.readFileSync(path.join(baselineDirectory, item.file), "utf8")]));
  const html = {};
  const hash = createHash("sha256");
  for (const file of options.codeFiles || ["lib/site/city-editorial-data.js", "lib/site/city-editorial.js"]) hash.update(fs.readFileSync(path.join(__dirname, "..", file)));
  const contentHash = hash.digest("hex").slice(0, 8);
  const result = { version: `${options.versionPrefix || "cities"}-${contentHash}`, baseCommit: execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim(), checkedAt: new Date().toISOString(), base, deployed: new URL(base).hostname === "shynlicleaningservice.com", releaseDate: release.deployedAt, pages: {}, similarity: {}, unchangedOutsideTarget: 0, outsideDifferences: [], sitemapUrlsUnchanged: false, sitemapDateChanges: [], failures: [] };
  for (const route of auditRoutes) html[route] = await read(route);
  for (const route of auditRoutes) result.similarity[route] = Object.fromEntries(auditRoutes.map(other => [other, route === other ? 100 : Number(similarity(html[route], html[other]).toFixed(2))]));
  for (const [slug, city] of Object.entries(cities)) {
    const route = `/${slug}`, current = html[route];
    const facts = inspectHtml(current);
    const scripts = facts.scripts.map(node => JSON.parse((node.childNodes || []).map(child => child.value || "").join("")));
    const faq = scripts.find(schema => schema["@type"] === "FAQPage");
    const text = mainText(current);
    const page = result.pages[route] = {
      words: text.split(/\s+/).length, repeatedFacts: counts(current, city),
      protectedDifferences: Object.entries(protectedNodes).filter(([, predicate]) => JSON.stringify(markup(current, predicate)) !== JSON.stringify(markup(originals[route], predicate))).map(([name]) => name),
      factsFromBrief: (city.facts || [["local facts", city.sourceLine]]).map(([id, line]) => ({ source: `User brief / ${city.name.toUpperCase()} / ${id}`, line })),
      reviews: markup(current, node => attr(node, "data-city-review") !== undefined).length,
      reviewOrder: markup(current, node => cls(node, "clients-say-home__name")).map(source => visibleText(parse(source))),
      faqMatchesJsonLd: JSON.stringify(faq.mainEntity) === JSON.stringify(facts.faq), jsonLdParses: true,
      legacyPhrasesAbsent: !/300\+|300 plus|Fox Valley/i.test(current),
      availabilityWording: occurrences(text, "we check the schedule and confirm the soonest date"),
      localKeywordCount: (text.toLowerCase().match(new RegExp(`house cleaning in ${city.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g")) || []).length,
      ratingMatchesNaperville: JSON.stringify(markup(current, node => cls(node, "sg-rating"))) === JSON.stringify(markup(html["/naperville"], node => cls(node, "sg-rating"))),
      dateModifiedValues: scripts.flatMap(modificationDates),
      serviceOrder: markup(current, node => cls(node, "sg-service-card")).map(source => attr(parse(source).childNodes.find(node => node.tagName === "html").childNodes.find(node => node.tagName === "body").childNodes[0], "href")),
    };
    if (page.words < 1300 || page.words > 1400) result.failures.push(`${route}: word count ${page.words}`);
    if (page.protectedDifferences.length) result.failures.push(`${route}: protected ${page.protectedDifferences}`);
    if (Object.values(page.repeatedFacts.outsideFaq).some(value => value > 1)) result.failures.push(`${route}: repeated facts`);
    if (!page.legacyPhrasesAbsent || !page.faqMatchesJsonLd || page.reviews !== (options.expectedReviews ?? 25)) result.failures.push(`${route}: content validation`);
    if (options.batchOneRules) {
      const extractReviews = value => markup(value, node => cls(node, "clients-say-home__name") || cls(node, "clients-say-home__text")).map(source => visibleText(parse(source)));
      page.reviewsMatchNaperville = JSON.stringify(extractReviews(current)) === JSON.stringify(extractReviews(html["/naperville"]));
      page.prohibitedClaimsAbsent = !/300\+|Fox Valley|typical home|most booked|booked most/i.test(current);
      page.noUnsupportedWaterClaim = slug === "warrenville" || !/hard water|soft water|hardness|grains per gallon|softened|softening/i.test(text);
      page.factsUsed = { county: city.trust || city.counties, zips: city.zips, water: city.faq.find(([question]) => /water/i.test(question))?.[1] || null };
      if (!page.reviewsMatchNaperville || !page.prohibitedClaimsAbsent || !page.noUnsupportedWaterClaim) result.failures.push(`${route}: batch-one facts/reviews`);
      if (slug === "lockport" && /\bwater\b/i.test(text)) result.failures.push(`${route}: unexpected water paragraph`);
    }
    if (page.localKeywordCount > 3 || !page.ratingMatchesNaperville) result.failures.push(`${route}: keyword or rating validation`);
    if (release.deployedAt && page.dateModifiedValues.some(value => value !== release.deployedAt)) result.failures.push(`${route}: incorrect dateModified`);
    const priorSchemas = inspectHtml(originals[route]).scripts.map(node => JSON.parse((node.childNodes || []).map(child => child.value || "").join("")));
    const unchangedSchemas = values => JSON.stringify(values.filter(schema => schema["@type"] !== "FAQPage"), (key, value) => key === "dateModified" ? undefined : value);
    if (unchangedSchemas(priorSchemas) !== unchangedSchemas(scripts)) result.failures.push(`${route}: unexpected non-FAQ schema change`);
    if (JSON.stringify(page.serviceOrder) !== JSON.stringify(city.order.map(service => `/services/${service}`))) result.failures.push(`${route}: service order`);
    if (!city.reviewsFirst.every((name, index) => page.reviewOrder[index] === name)) result.failures.push(`${route}: local review order`);
  }
  for (const [route, values] of Object.entries(result.similarity)) for (const [other, value] of Object.entries(values)) if (route !== other && value >= 40) result.failures.push(`Similarity ${route} / ${other}: ${value}`);
  for (const item of manifest.filter(item => !cities[item.route.slice(1)])) {
    const current = html[item.route] || await read(item.route);
    if (current !== originals[item.route]) result.outsideDifferences.push(item.route);
    else result.unchangedOutsideTarget++;
  }
  if (await read("/robots.txt") !== fs.readFileSync(path.join(baselineDirectory, "robots.txt"), "utf8")) result.outsideDifferences.push("/robots.txt");
  const sitemapRows = xml => markup(xml, node => node.tagName === "url").map(source => ({
    url: visibleText(parse(markup(source, node => node.tagName === "loc")[0])),
    lastmod: visibleText(parse(markup(source, node => node.tagName === "lastmod")[0] || "")),
  }));
  const oldRows = sitemapRows(fs.readFileSync(path.join(baselineDirectory, "sitemap.xml"), "utf8"));
  const newRows = sitemapRows(await read("/sitemap.xml"));
  result.sitemapUrlsUnchanged = JSON.stringify(oldRows.map(row => row.url)) === JSON.stringify(newRows.map(row => row.url));
  result.sitemapDateChanges = newRows.filter(row => row.lastmod !== oldRows.find(old => old.url === row.url)?.lastmod);
  if (release.deployedAt) for (const slug of Object.keys(cities)) {
    if (newRows.find(row => new URL(row.url).pathname === `/${slug}`)?.lastmod !== `${release.deployedAt}T00:00:00.000Z`) result.failures.push(`/${slug}: incorrect sitemap lastmod`);
  }
  if (result.outsideDifferences.length || !result.sitemapUrlsUnchanged || result.sitemapDateChanges.some(row => !cities[new URL(row.url).pathname.slice(1)])) result.failures.push("Outside scope changes");
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "verification.json"), JSON.stringify(result, null, 2) + "\n");
  const names = auditRoutes.map(route => route.slice(1));
  const matrix = ["| City | " + names.join(" | ") + " |", "| --- | " + names.map(() => "---:").join(" | ") + " |", ...auditRoutes.map(route => `| ${route.slice(1)} | ${auditRoutes.map(other => route === other ? "100 (same page)" : result.similarity[route][other].toFixed(2) + "%").join(" | ")} |`)];
  const lines = [`# ${options.title || "Seven City Pages"}: Verification`, "", `Version: ${result.version}, commit ${result.baseCommit}. Checked: ${result.checkedAt}. ${result.deployed ? "Production verification." : "Local verification, not yet deployed."} Publication date: ${result.releaseDate || "pending"}.`, "", "## Similarity", "", "Main text only; header/footer/navigation excluded, city names masked, five-word shingle Jaccard. Diagonal represents the same page, not a pair of different pages.", "", ...matrix, "", "## Word Counts And Repeated Facts", "", "| Page | Words | Booking preference | Counties | Supplies | Parking | Typical home |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"];
  for (const [route, page] of Object.entries(result.pages)) lines.push(`| ${route} | ${page.words} | ${Object.values(page.repeatedFacts.outsideFaq).join(" | ")} |`);
  lines.push("", "Counts are outside FAQ. Full body counts, including question wording and answers, are in verification.json. A zero means that the brief supplies no fact, not a missing template paragraph.", "", "## Facts Used");
  for (const [route, page] of Object.entries(result.pages)) lines.push("", `### ${route}`, "", ...page.factsFromBrief.map(fact => `- ${fact.source}: ${fact.line}`), ...(page.factsUsed ? ["", `Used: ${JSON.stringify(page.factsUsed)}. No housing-size or service-popularity fact is asserted.`] : []));
  lines.push("", "## Isolation", "", `${result.unchangedOutsideTarget} non-target pages matched byte for byte. Outside differences: ${JSON.stringify(result.outsideDifferences)}. Sitemap URLs unchanged: ${result.sitemapUrlsUnchanged}. Sitemap date changes: ${JSON.stringify(result.sitemapDateChanges)}.`, "", `Failures: ${JSON.stringify(result.failures)}.`, "", "Service-task sources and browser checks are described in README.md.");
  fs.writeFileSync(path.join(outputDirectory, "report.md"), lines.join("\n") + "\n");
  console.log(JSON.stringify({ words: Object.fromEntries(Object.entries(result.pages).map(([route, page]) => [route, page.words])), unchangedOutsideTarget: result.unchangedOutsideTarget, outsideDifferences: result.outsideDifferences, failures: result.failures }, null, 2));
  return result;
}
if (require.main === module) audit(...process.argv.slice(2)).then(result => { if (result.failures.length) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { audit, counts, protectedNodes, routes };
