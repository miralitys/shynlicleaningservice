"use strict";

const { audit, routes: mainRoutes } = require("./audit-city-editorial");
const { cities } = require("../lib/site/city-batch-one-data");
const release = require("../lib/site/city-batch-one-release.json");

async function auditBatchOne(base, baseline, output) {
  return audit(base, baseline, output, {
    cities, release, routes: [...mainRoutes, ...Object.keys(cities).map(slug => `/${slug}`)],
    expectedReviews: 23, batchOneRules: true, title: "City Pages Batch One", versionPrefix: "cities-b1",
    codeFiles: ["lib/site/city-batch-one-data.js", "lib/site/city-batch-one.js", "lib/site/city-editorial.js"],
  });
}
if (require.main === module) auditBatchOne(...process.argv.slice(2)).then(result => { if (result.failures.length) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { auditBatchOne };
