"use strict";

const { applyCityEditorial } = require("./city-editorial");
const { cities } = require("./city-batch-three-data");
const evidence = require("./naperville-reviews.json");
const release = require("./city-batch-three-release.json");

function cityBatchThreeLastmod(deployment = release) {
  const date = deployment.deployedAt;
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
    ? Object.keys(cities).map(slug => [`/${slug}`, date]) : [];
}
function applyCityBatchThree(html, route, reviewTemplate = "") {
  if (!Object.hasOwn(cities, route.slice(1))) return html;
  return applyCityEditorial(html, route, reviewTemplate, {
    cities,
    reviews: evidence.reviews.filter(review => review.quote.trim()),
    publishedDate: cityBatchThreeLastmod().find(([path]) => path === route)?.[1],
  });
}

module.exports = { applyCityBatchThree, cityBatchThreeLastmod };
