"use strict";

const { audit, routes: mainRoutes } = require("./audit-city-editorial");
const { cities: batchOneCities } = require("../lib/site/city-batch-one-data");
const { cities } = require("../lib/site/city-batch-two-data");
const release = require("../lib/site/city-batch-two-release.json");

async function auditBatchTwo(base, baseline, output) {
  return audit(base, baseline, output, {
    cities, release, routes: [...mainRoutes, ...Object.keys(batchOneCities).map(slug => `/${slug}`), ...Object.keys(cities).map(slug => `/${slug}`)],
    expectedReviews: 23, batchOneRules: true, noWaterSlug: "plano", title: "City Pages Batch Two", versionPrefix: "cities-b2",
    codeFiles: ["lib/site/city-batch-two-data.js", "lib/site/city-batch-two.js", "lib/site/city-editorial.js"],
  });
}
if (require.main === module) auditBatchTwo(...process.argv.slice(2)).then(result => { if (result.failures.length) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { auditBatchTwo };
