"use strict";

const { audit, routes: mainRoutes } = require("./audit-city-editorial");
const { cities: batchOneCities } = require("../lib/site/city-batch-one-data");
const { cities: batchTwoCities } = require("../lib/site/city-batch-two-data");
const { cities: batchThreeCities } = require("../lib/site/city-batch-three-data");
const { cities } = require("../lib/site/city-batch-four-data");
const release = require("../lib/site/city-batch-four-release.json");

function validateWater(slug, text) {
  if (/\b(?:hard|soft) water\b|softened|softening/i.test(text)) return false;
  const claims = [...text.matchAll(/([\d.-]+) grains per gallon/gi)].map(match => match[1]);
  if (slug === "elmhurst") return claims.length === 2 && claims.every(value => value === "8") && (text.match(/hardness of about 8 grains per gallon/g) || []).length === 2;
  if (/hardness|grains per gallon/i.test(text)) return false;
  return slug !== "wayne" || !/Lake Michigan|water report|city water/i.test(text) && (text.match(/Most homes in Wayne are on private wells/g) || []).length === 2;
}
async function auditBatchFour(base, baseline, output) {
  return audit(base, baseline, output, {
    cities, release, routes: [...mainRoutes, ...[batchOneCities, batchTwoCities, batchThreeCities, cities].flatMap(batch => Object.keys(batch).map(slug => `/${slug}`))],
    expectedReviews: 23, batchOneRules: true, noWaterSlugs: ["hinsdale"], validateWater,
    title: "City Pages Batch Four", versionPrefix: "cities-b4",
    codeFiles: ["lib/site/city-batch-four-data.js", "lib/site/city-batch-four.js", "lib/site/city-editorial.js"],
  });
}
if (require.main === module) auditBatchFour(...process.argv.slice(2)).then(result => { if (result.failures.length) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { auditBatchFour, validateWater };
