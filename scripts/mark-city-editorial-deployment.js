"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cityEditorialLastmod } = require("../lib/site/city-editorial");
const releasePath = path.join(__dirname, "../lib/site/city-editorial-release.json");
const release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
const date = process.argv[2];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
if (date !== today || cityEditorialLastmod({ deployedAt: date }).length !== 7) throw new Error("Pass the actual Chicago deployment date (YYYY-MM-DD), not a preview date.");
if (release.deployedAt && release.deployedAt !== date) throw new Error("This edition already has a publication date; do not refresh it on later deployments.");
fs.writeFileSync(releasePath, JSON.stringify({ ...release, deployedAt: date }, null, 2) + "\n");
console.log(`Publication date recorded for seven target city pages only: ${date}`);
