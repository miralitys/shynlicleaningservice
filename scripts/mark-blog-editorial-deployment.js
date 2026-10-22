"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { BLOG_ARTICLES } = require("../lib/site/blog-articles");
const { validDate } = require("../lib/site/blog-editorial");
const releasePath = path.join(__dirname, "../lib/site/blog-editorial-release.json");
const release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
const date = process.argv[2];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

if (!validDate(date) || date !== today) {
  throw new Error("Pass the actual deployment date in Chicago (YYYY-MM-DD). Do not run this for a local preview.");
}
if (release.deployedAt && release.deployedAt !== date) {
  throw new Error("This editorial release already has a publication date; do not refresh it on later deployments.");
}
const edited = BLOG_ARTICLES.filter((article) => article.editorialLinkCount > 0);
if (!edited.length || edited.some((article) => article.modifiedAt > date)) throw new Error("Invalid editorial release date or missing edited articles");
const hashes = Object.fromEntries(edited.map((article) => [article.path, article.editorialBodyHash]));
if (release.deployedAt && JSON.stringify(release.articleBodyHashes) !== JSON.stringify(hashes)) {
  throw new Error("Published article content changed. Prepare a new editorial release instead of changing its original date.");
}
fs.writeFileSync(releasePath, JSON.stringify({ ...release, deployedAt: date, articleBodyHashes: hashes }, null, 2) + "\n");
console.log(`Recorded ${date} for ${edited.length} edited articles. Publication dates and untouched articles were preserved.`);
