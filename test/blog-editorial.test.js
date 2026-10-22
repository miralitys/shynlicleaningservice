"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseFragment } = require("parse5");
const { BLOG_ARTICLES } = require("../lib/site/blog-articles");
const history = require("../lib/site/blog-content-history.json");
const plans = require("../lib/site/blog-service-links.json");
const release = require("../lib/site/blog-editorial-release.json");
const { articleDates, articleParagraphs, textContent, validDate, applyServiceLinks } = require("../lib/site/blog-editorial");
const { startServer, stopServer } = require("./server-test-helpers");
const { inspectHtml } = require("../lib/site/structured-data");

const allowed = new Set(["regular-cleaning", "deep-cleaning", "move-in-move-out-cleaning", "airbnb-cleaning", "commercial-cleaning", "post-construction-cleaning"].map((slug) => `/services/${slug}`));
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
function links(node) {
  const result = [];
  function visit(child) {
    if (child.tagName === "a" && attr(child, "data-service-link") === "contextual") result.push(child);
    for (const item of child.childNodes || []) visit(item);
  }
  visit(node);
  return result;
}

test("every article has per-article Git provenance, without assuming every URL was published in April", () => {
  assert.equal(Object.keys(history).length, BLOG_ARTICLES.length);
  for (const article of BLOG_ARTICLES) {
    const entry = history[article.path];
    assert.ok(validDate(entry.publishedAt), article.path);
    assert.ok(validDate(entry.modifiedAt), article.path);
    assert.ok(entry.modifiedAt >= entry.publishedAt, article.path);
    for (const evidence of [entry.publicationEvidence, entry.lastContentChangeEvidence]) {
      assert.match(evidence.commit, /^[a-f0-9]{40}$/);
      assert.match(evidence.source, /^lib\/site\//);
      assert.equal(evidence.at.slice(0, 10), evidence === entry.publicationEvidence ? entry.publishedAt : entry.modifiedAt);
    }
    assert.equal(article.publishedAt, entry.publishedAt);
  }
  const revised = BLOG_ARTICLES.find((article) => article.path.endsWith("/safer-cleaning-products-what-to-ask-before-booking"));
  assert.equal(revised.publishedAt, "2026-06-03");
});

test("contextual links use real service URLs, fit separate paragraphs and never occupy a paragraph's first sentence", () => {
  let total = 0;
  const anchors = new Set();
  for (const article of BLOG_ARTICLES) {
    const plan = plans[article.path];
    const paragraphs = articleParagraphs(article.bodyHtml);
    const added = paragraphs.flatMap((paragraph) => links(paragraph).map((link) => ({ paragraph, link })));
    if (!plan.links.length) {
      assert.ok(plan.skipReason, article.path);
      assert.equal(added.length, 0, article.path);
      assert.equal(article.pendingContentUpdate, false, article.path);
      continue;
    }
    assert.equal(article.editorialLinkCount, plan.links.length, article.path);
    assert.ok(added.length >= 2 && added.length <= 4, article.path);
    assert.equal(new Set(added.map((item) => item.paragraph)).size, added.length, article.path);
    for (const { paragraph, link } of added) {
      const href = attr(link, "href");
      assert.ok(allowed.has(href), `${article.path}: ${href}`);
      assert.equal((paragraph.childNodes || []).filter((node) => node.tagName === "a").length <= 1, true);
      const before = article.bodyHtml.slice(paragraph.sourceCodeLocation.startTag.endOffset, link.sourceCodeLocation.startOffset);
      const precedingText = textContent(parseFragment(before));
      assert.match(precedingText, /[.!?]/, `${article.path}: link before the first sentence ended`);
      assert.ok(textContent(link).trim().length > 1);
      anchors.add(textContent(link).toLowerCase());
      total++;
    }
    assert.equal(applyServiceLinks(article).bodyHtml, article.bodyHtml, article.path);
  }
  assert.equal(total, 388);
  assert.ok(anchors.size > 25);
});

test("dates do not claim an unpublished edit was deployed, and a release only updates matching edited bodies", () => {
  const changed = BLOG_ARTICLES.find((article) => article.editorialLinkCount);
  const untouched = BLOG_ARTICLES.find((article) => !article.editorialLinkCount);
  const pending = articleDates(changed, { deployedAt: null, articleBodyHashes: {} });
  assert.equal(pending.modifiedAt, history[changed.path].modifiedAt);
  assert.equal(pending.pendingContentUpdate, true);
  if (release.deployedAt) assert.equal(changed.modifiedAt, release.deployedAt);
  const simulated = { deployedAt: "2026-10-21", articleBodyHashes: { [changed.path]: changed.editorialBodyHash } };
  const published = articleDates(changed, simulated);
  assert.equal(published.modifiedAt, "2026-10-21");
  assert.equal(published.publishedAt, changed.publishedAt);
  assert.equal(published.updatedLabel, "Updated October 21, 2026");
  assert.equal(published.pendingContentUpdate, false);
  assert.equal(articleDates(untouched, simulated).modifiedAt, history[untouched.path].modifiedAt);
  assert.equal(articleDates(changed, { ...simulated, articleBodyHashes: {} }).modifiedAt, history[changed.path].modifiedAt);
  assert.equal(articleDates(changed, { ...simulated, deployedAt: "2026-02-30" }).modifiedAt, history[changed.path].modifiedAt);
  assert.equal(createHash("sha256").update(changed.bodyHtml).digest("hex"), changed.editorialBodyHash);
});

test("all blog pages expose parsable Article dates and matching sitemap lastmod; Updated appears only for real date differences", async () => {
  const app = await startServer();
  try {
    const sitemap = await (await fetch(app.baseUrl + "/sitemap.xml")).text();
    for (const article of BLOG_ARTICLES) {
      const response = await fetch(app.baseUrl + article.path);
      assert.equal(response.status, 200, article.path);
      const html = await response.text();
      const schemas = inspectHtml(html).scripts.map((script) => JSON.parse(textContent(script)));
      const schema = schemas.find((value) => value["@type"] === "Article" || value["@type"] === "BlogPosting");
      assert.ok(schema, article.path);
      assert.equal(schema.datePublished, article.publishedAt);
      assert.equal(schema.dateModified, article.modifiedAt);
      assert.equal(schema.author.name, "Shynli Cleaning Service");
      assert.equal(schema.author["@type"], "Organization");
      assert.equal(schema.publisher.name, "Shynli Cleaning Service");
      assert.ok(schema.publisher.logo.url.startsWith("https://shynlicleaningservice.com/images/"));
      assert.equal(schema.mainEntityOfPage, `https://shynlicleaningservice.com${article.path}`);
      const entry = sitemap.split(`<loc>https://shynlicleaningservice.com${article.path}</loc>`)[1]?.split("</url>")[0];
      assert.ok(entry?.includes(`<lastmod>${article.modifiedAt}T00:00:00.000Z</lastmod>`), article.path);
      if (article.modifiedAt === article.publishedAt) assert.doesNotMatch(html, /<time[^>]*>Updated /);
      else assert.ok(html.includes(`<time datetime="${article.modifiedAt}">${article.updatedLabel}</time>`), article.path);
    }
  } finally {
    await stopServer(app.child);
  }
});

test("a recorded deployment date reaches schema, visible Updated and sitemap only for edited articles and their hubs", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shynli-blog-release-"));
  const preload = path.join(directory, "release.cjs");
  const filename = require.resolve("../lib/site/blog-editorial-release.json");
  const simulated = { deployedAt: "2026-10-21", articleBodyHashes: Object.fromEntries(BLOG_ARTICLES.filter((article) => article.editorialLinkCount).map((article) => [article.path, article.editorialBodyHash])) };
  fs.writeFileSync(preload, `require.cache[${JSON.stringify(filename)}] = { id: ${JSON.stringify(filename)}, filename: ${JSON.stringify(filename)}, loaded: true, exports: ${JSON.stringify(simulated)} };`);
  let app;
  try {
    app = await startServer({ nodeArgs: ["--require", preload] });
    const sitemap = await (await fetch(app.baseUrl + "/sitemap.xml")).text();
    for (const article of BLOG_ARTICLES) {
      const expected = article.editorialLinkCount ? simulated.deployedAt : history[article.path].modifiedAt;
      const html = await (await fetch(app.baseUrl + article.path)).text();
      const schemas = inspectHtml(html).scripts.map((script) => JSON.parse(textContent(script)));
      const schema = schemas.find((value) => value["@type"] === "Article");
      assert.equal(schema.datePublished, article.publishedAt, article.path);
      assert.equal(schema.dateModified, expected, article.path);
      const entry = sitemap.split(`<loc>https://shynlicleaningservice.com${article.path}</loc>`)[1]?.split("</url>")[0];
      assert.ok(entry?.includes(`<lastmod>${expected}T00:00:00.000Z</lastmod>`), article.path);
      if (article.editorialLinkCount) assert.ok(html.includes('<time datetime="2026-10-21">Updated October 21, 2026</time>'), article.path);
    }
    for (const route of ["/blog", ...new Set(BLOG_ARTICLES.map((article) => article.categoryPath))]) {
      const entry = sitemap.split(`<loc>https://shynlicleaningservice.com${route}</loc>`)[1]?.split("</url>")[0];
      assert.ok(entry?.includes("<lastmod>2026-10-21T00:00:00.000Z</lastmod>"), route);
    }
  } finally {
    if (app) await stopServer(app.child);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
