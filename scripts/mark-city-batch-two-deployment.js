"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cityBatchTwoLastmod } = require("../lib/site/city-batch-two");
const releasePath = path.join(__dirname, "../lib/site/city-batch-two-release.json");
const release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
const date = process.argv[2];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
if (date !== today || cityBatchTwoLastmod({ deployedAt: date }).length !== 10) throw new Error("Use the actual Chicago deployment date, not a preview date.");
if (release.deployedAt && release.deployedAt !== date) throw new Error("Do not refresh an already published edition's date.");
fs.writeFileSync(releasePath, JSON.stringify({ ...release, deployedAt: date }, null, 2) + "\n");
console.log(`Publication date recorded for ten batch-two pages only: ${date}`);
