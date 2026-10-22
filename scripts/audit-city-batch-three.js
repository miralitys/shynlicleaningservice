"use strict";

const { audit, routes: mainRoutes } = require("./audit-city-editorial");
const { cities: batchOneCities } = require("../lib/site/city-batch-one-data");
const { cities: batchTwoCities } = require("../lib/site/city-batch-two-data");
const { cities } = require("../lib/site/city-batch-three-data");
const release = require("../lib/site/city-batch-three-release.json");

function validateWater(slug, text) {
  if (/\b(?:hard|soft) water\b|softened|softening/i.test(text)) return false;
  const allowed = { northaurora: "16", channahon: "18-20" }[slug];
  const claims = [...text.matchAll(/([\d.-]+) grains per gallon/gi)].map(match => match[1]);
  if (allowed ? claims.length !== 2 || claims.some(value => value !== allowed) : /hardness|grains per gallon/i.test(text)) return false;
  return slug !== "homerglen" || /public water is Lake Michigan water delivered by Illinois American Water/.test(text) && /not the water source at every home/.test(text);
}
async function auditBatchThree(base, baseline, output) {
  return audit(base, baseline, output, {
    cities, release, routes: [...mainRoutes, ...Object.keys(batchOneCities).map(slug => `/${slug}`), ...Object.keys(batchTwoCities).map(slug => `/${slug}`), ...Object.keys(cities).map(slug => `/${slug}`)],
    expectedReviews: 23, batchOneRules: true, noWaterSlugs: ["bigrock", "montgomery", "bristol"], validateWater,
    title: "City Pages Batch Three", versionPrefix: "cities-b3",
    codeFiles: ["lib/site/city-batch-three-data.js", "lib/site/city-batch-three.js", "lib/site/city-editorial.js"],
  });
}
if (require.main === module) auditBatchThree(...process.argv.slice(2)).then(result => { if (result.failures.length) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { auditBatchThree, validateWater };
