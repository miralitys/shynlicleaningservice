"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { serviceCityLastmod } = require("../lib/site/service-city");
const file = path.join(__dirname, "../lib/site/service-city-release.json");
const release = JSON.parse(fs.readFileSync(file, "utf8"));
const date = process.argv[2];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
if (date !== today || serviceCityLastmod({ deployedAt: date }).length !== 8) throw new Error("Use the actual Chicago deployment date, not the preview date.");
if (release.deployedAt && release.deployedAt !== date) throw new Error("Do not refresh the publication date of an existing edition.");
fs.writeFileSync(file, JSON.stringify({ deployedAt: date }, null, 2) + "\n");
console.log(`Deployment date recorded for eight service-city pages only: ${date}`);
