const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createSiteSanitizer } = require("../lib/site/sanitize");

function normalizeRoute(rawPath) {
  let value = rawPath || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

const siteSeoHelpers = {
  deriveRouteSeo() {
    return {
      title: "",
      description: "",
      robots: "index,follow",
      ogUrl: "",
      ogTitle: "",
      ogDescription: "",
      canonical: "",
    };
  },
  setTitleTag(html) {
    return html;
  },
  setMetaContent(html) {
    return html;
  },
  setCanonicalLink(html) {
    return html;
  },
  upsertJsonLd(html) {
    return html;
  },
  buildHomeSchemas() {
    return "";
  },
  buildBreadcrumbSchema() {
    return null;
  },
};

const sourceHtml = fs.readFileSync(path.join(__dirname, "..", "page108872586.html"), "utf8");
const sanitizeHtml = createSiteSanitizer({
  GOOGLE_PLACES_API_KEY: "",
  normalizeRoute,
  siteSeoHelpers,
}).sanitizeHtml;

function getWordCount(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

test("renders blog hub topic links and stable CTA button styles on /blog", () => {
  const html = sanitizeHtml(sourceHtml, "/blog");

  assert.match(html, /href="\/blog\/checklists"/);
  assert.match(html, /Find the cleaning guide you actually need\./);
  assert.doesNotMatch(html, /Recent Posts/);
  assert.doesNotMatch(html, /All Blog Posts/);
  assert.doesNotMatch(html, /data-feed-recid="1769860233"/);
  assert.match(
    html,
    /\.shynli-blog-quote-button\{display:flex;align-items:center;justify-content:center;width:100%;min-height:68px/
  );
});

test("renders category-specific heading and filter runtime on /blog/bathroom", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/bathroom");

  assert.match(html, /Bathroom <span style="color: rgb\(158, 68, 90\);">Cleaning Guides<\/span>/);
  assert.match(html, /Bathroom cleaning advice people actually search when the room stops feeling clean\./);
  assert.match(html, /CURRENT_CATEGORY=\{"label":"Bathroom","aliases":\["bathroom","bathrooms"\]\}/);
});

test("renders featured checklist article link on /blog/checklists", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/checklists");

  assert.match(html, /house-cleaning-checklist-for-busy-homeowners/);
  assert.match(html, /Start with the strongest guide in this topic\./);
});

test("renders long-form checklist article route with more than 3000 words", () => {
  const html = sanitizeHtml(
    sourceHtml,
    "/blog/checklists/house-cleaning-checklist-for-busy-homeowners"
  );

  assert.match(html, /Cleaning <span style="color: rgb\(158, 68, 90\);">Checklists<\/span>/);
  assert.match(html, /<h1 class="shynli-blog-article__title">House Cleaning Checklist for Busy Homeowners<\/h1>/);
  assert.match(html, /Quick navigation/);
  assert.match(html, /Want the result without doing the whole checklist yourself\?/);
  assert.doesNotMatch(html, /Recent Posts/);
  assert.doesNotMatch(html, /All Blog Posts/);
  assert.doesNotMatch(html, /data-feed-recid="1769860233"/);
  assert.doesNotMatch(html, /The article feed below stays filtered to this category/);
  assert.match(html, /\.shynli-blog-article__toc\{position:sticky;top:110px;.*max-height:calc\(100vh - 140px\);overflow:auto;/);
  assert.match(html, /\.shynli-blog-article__callout\{display:grid;gap:10px;padding:22px 24px;border-radius:22px;background:#efe7de;/);
  assert.ok(
    getWordCount(html) > 3000,
    `Expected long-form article to exceed 3000 words, got ${getWordCount(html)}`
  );
});
