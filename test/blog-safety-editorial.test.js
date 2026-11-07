"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseFragment } = require("parse5");
const { BLOG_ARTICLES } = require("../lib/site/blog-articles");
const { applySafetyEditorial, safetyDates, SAFETY_ARTICLE_PATHS, SAFETY_SOURCES } = require("../lib/site/blog-safety-editorial");
const release = require("../lib/site/blog-safety-release.json");
const { articleDates, textContent } = require("../lib/site/blog-editorial");
const { inspectHtml } = require("../lib/site/structured-data");
const { startServer, stopServer } = require("./server-test-helpers");

const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;
const flatten = node => [node, ...(node.childNodes || []).flatMap(flatten)];

test("safety revisions are limited to 14 articles and preserve publication metadata", () => {
  assert.equal(SAFETY_ARTICLE_PATHS.length, 14);
  assert.equal(Object.keys(release.articleBodyHashes).length, 14);
  for (const article of BLOG_ARTICLES) {
    const expected = articleDates(article);
    assert.equal(article.publishedAt, expected.publishedAt, article.path);
    const revised = SAFETY_ARTICLE_PATHS.includes(article.path);
    assert.equal(article.modifiedAt, revised ? release.deployedAt : expected.modifiedAt, article.path);
    assert.equal(article.updatedLabel, revised ? "Updated November 7, 2026" : expected.updatedLabel, article.path);
    assert.equal(applySafetyEditorial(article), article, `idempotence: ${article.path}`);
    const nodes = flatten(parseFragment(article.bodyHtml));
    const sections = nodes.filter(n => attr(n, "id") === "safety-and-sources");
    const scoped = SAFETY_ARTICLE_PATHS.includes(article.path);
    assert.equal(sections.length, scoped ? 1 : 0, article.path);
    if (!scoped) continue;
    const links = flatten(sections[0]).filter(n => n.tagName === "a");
    assert.ok(links.length >= 1, article.path);
    for (const link of links) {
      assert.ok(Object.values(SAFETY_SOURCES).includes(attr(link, "href")), article.path);
      assert.ok(textContent(link).length > 8);
    }
    assert.equal(article.toc.filter(item => item.id === "safety-and-sources").length, 1);
  }
});

test("safety dates require a matching body and valid release date", () => {
  const article = BLOG_ARTICLES.find(a => SAFETY_ARTICLE_PATHS.includes(a.path));
  assert.equal(safetyDates(article).safetyRevisionPending, false);
  for (const deployment of [
    { deployedAt: null },
    { deployedAt: "2026-02-30", articleBodyHashes: release.articleBodyHashes },
    { deployedAt: "2026-01-01", articleBodyHashes: release.articleBodyHashes },
    { ...release, articleBodyHashes: {} },
  ]) {
    const pending = safetyDates(article, deployment);
    assert.equal(pending.modifiedAt, article.modifiedAt);
    assert.equal(pending.safetyRevisionPending, true);
  }
  assert.equal(safetyDates({ ...article, bodyHtml: article.bodyHtml + "changed" }).safetyRevisionPending, true);
});

test("unsafe or overconfident instructions are replaced rather than contradicted by a disclaimer", () => {
  const find = slug => BLOG_ARTICLES.find(a => a.path.endsWith(`/${slug}`)).bodyHtml;
  assert.doesNotMatch(find("vinegar-on-hardwood-floors-is-it-safe"), /If testing vinegar anyway|one perfect tiny pass/);
  assert.doesNotMatch(find("how-to-remove-mold-from-bathroom-caulk"), /The safest way to remove mold|Do not mix bathroom chemicals in a small enclosed space/);
  assert.doesNotMatch(find("how-to-remove-pink-mold-bathroom"), /Do not mix strong cleaners in a small enclosed bathroom/);
  assert.doesNotMatch(find("bedroom-cleaning-checklist-for-allergies"), /It is sneezing at bedtime|A checklist fixes that/);
  assert.match(find("how-often-to-wash-bedding-for-allergies"), /Wash sheets and pillowcases weekly/);
  assert.match(find("best-disinfecting-routine-for-short-term-rentals"), /visibly wet for the full contact time/);
  assert.match(find("how-to-remove-pet-urine-smell-from-hardwood"), /routine surface cleaning cannot promise removal/);
});

test("all revised pages render sources while preserving Article metadata and schema types", async () => {
  const app = await startServer({ env: { HTML_CACHE_WARM_MODE: "off" } });
  try {
    for (const path of SAFETY_ARTICLE_PATHS) {
      const article = BLOG_ARTICLES.find(a => a.path === path);
      const response = await fetch(app.baseUrl + path);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.match(html, /By <a href="\/about-us" rel="author">Shynli Cleaning Service<\/a>/);
      const facts = inspectHtml(html);
      assert.equal(facts.nodes.filter(n => n.tagName === "section" && attr(n, "id") === "safety-and-sources").length, 1, path);
      const schemas = facts.scripts.map(s => JSON.parse(textContent(s)));
      const schema = schemas.find(s => s["@type"] === "Article");
      assert.equal(schema.author.name, "Shynli Cleaning Service");
      assert.equal(schema.datePublished, article.publishedAt);
      assert.equal(schema.dateModified, article.modifiedAt);
      assert.deepEqual(schemas.map(s => s["@type"]).sort(), ["Article", "BreadcrumbList"], path);
      assert.ok(facts.nodes.some(n => n.tagName === "section" && attr(n, "id") === "faq"), path);
    }
  } finally {
    await stopServer(app.child);
  }
});
