"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { napervilleLastmod } = require("../lib/site/naperville-pilot");
const releasePath = path.join(__dirname, "../lib/site/naperville-release.json");
const release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
const date = process.argv[2];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
if (date !== today || !napervilleLastmod({ deployedAt: date }).length) throw new Error("Pass the actual Chicago deployment date (YYYY-MM-DD), not a local preview date.");
if (release.deployedAt && release.deployedAt !== date) throw new Error("This content release already has a deployment date. Do not refresh its date on subsequent deployments.");
fs.writeFileSync(releasePath, JSON.stringify({ ...release, deployedAt: date }, null, 2) + "\n");
console.log(`Recorded ${date} for /naperville only. No other sitemap dates were overridden.`);
