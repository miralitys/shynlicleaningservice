"use strict";

const citySeo = require("./city-seo-data.json");
const release = require("./city-seo-release.json");

function citySeoLastmod({ deployedAt } = release) {
  if (typeof deployedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deployedAt)) return [];
  const date = new Date(deployedAt);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== deployedAt) return [];
  return Object.keys(citySeo).map(route => [route, deployedAt]);
}

module.exports = { citySeo, citySeoLastmod };
