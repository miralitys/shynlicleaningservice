const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { BLOG_ARTICLES } = require("../lib/site/blog-articles");
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  assert.match(
    html,
    /var CURRENT_CATEGORY = \{"label":"Bathroom","aliases":\["bathroom","bathrooms"\]\};/
  );
});

test("renders featured bathroom article links on /blog/bathroom", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/bathroom");

  assert.match(html, /how-to-remove-hard-water-stains-from-shower-glass/);
  assert.match(html, /how-to-remove-soap-scum-from-shower-doors/);
  assert.match(html, /best-way-to-clean-grout-in-shower/);
  assert.match(html, /Bathroom <span style="color: rgb\(158, 68, 90\);">Cleaning Guides<\/span>/);
});

test("renders featured floors article links on /blog/floors", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/floors");

  assert.match(html, /how-to-clean-hardwood-floors-without-streaks/);
  assert.match(html, /best-way-to-clean-laminate-floors/);
  assert.match(html, /how-to-clean-vinyl-plank-floors/);
  assert.match(html, /Floor <span style="color: rgb\(158, 68, 90\);">Cleaning Guides<\/span>/);
});

test("renders featured dust article links on /blog/dust", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/dust");

  assert.match(html, /how-to-reduce-dust-in-house-fast/);
  assert.match(html, /cleaning-routine-for-allergies-at-home/);
  assert.match(html, /how-to-clean-ceiling-fans-without-dust-falling/);
});

test("renders featured checklist article link on /blog/checklists", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/checklists");

  assert.match(html, /house-cleaning-checklist-for-busy-homeowners/);
  assert.match(html, /weekly-cleaning-checklist-for-a-3-bedroom-house/);
  assert.match(html, /Start with the strongest guides in this topic\./);
});

test("renders featured what's included article links on /blog/whats-included", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/whats-included");

  assert.match(html, /what-is-included-in-regular-house-cleaning/);
  assert.match(html, /what-is-included-in-a-deep-cleaning-service/);
  assert.match(html, /deep-cleaning-vs-regular-cleaning-difference/);
  assert.match(html, /move-out-cleaning-vs-deep-cleaning/);
  assert.match(html, /how-long-does-a-deep-cleaning-take/);
  assert.match(html, /What’s <span style="color: rgb\(158, 68, 90\);">Included<\/span>/);
});

test("renders featured services article links on /blog/services", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/services");

  assert.match(html, /what-affects-house-cleaning-price/);
  assert.match(html, /how-much-does-deep-cleaning-cost-for-a-house/);
  assert.match(html, /how-much-does-move-out-cleaning-cost/);
  assert.match(html, /house-cleaning-cost-per-hour-vs-flat-rate/);
  assert.match(html, /is-it-cheaper-to-do-biweekly-cleaning/);
  assert.match(html, /Cleaning <span style="color: rgb\(158, 68, 90\);">Services<\/span>/);
});

test("renders long-form checklist article route with more than 3000 words", () => {
  const html = sanitizeHtml(
    sourceHtml,
    "/blog/checklists/house-cleaning-checklist-for-busy-homeowners"
  );

  assert.match(html, /Cleaning <span style="color: rgb\(158, 68, 90\);">Checklists<\/span>/);
  assert.match(html, /<h1 class="shynli-blog-article__title">House Cleaning Checklist for Busy Homeowners<\/h1>/);
  assert.match(html, /Quick navigation/);
  assert.match(html, /Quick Answer: House Cleaning Checklist for Busy Homeowners/);
  assert.match(html, /Printable House Cleaning Checklist/);
  assert.match(
    html,
    /class="shynli-blog-article__toc-link" href="\/blog\/checklists\/house-cleaning-checklist-for-busy-homeowners#quick-answer" data-target-id="quick-answer"/
  );
  assert.match(html, /data-blog-print/);
  assert.match(html, /Want the result without doing the whole checklist yourself\?/);
  assert.doesNotMatch(html, /Recent Posts/);
  assert.doesNotMatch(html, /All Blog Posts/);
  assert.doesNotMatch(html, /data-feed-recid="1769860233"/);
  assert.doesNotMatch(html, /The article feed below stays filtered to this category/);
  assert.match(html, /\.shynli-blog-article__toc\{position:sticky;top:110px;.*max-height:calc\(100vh - 140px\);overflow:auto;/);
  assert.match(html, /\.shynli-blog-article__callout\{display:grid;gap:10px;padding:22px 24px;border-radius:22px;background:#efe7de;/);
  assert.match(html, /\.shynli-blog-article__summary-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:14px;/);
  assert.ok(
    getWordCount(html) > 3000,
    `Expected long-form article to exceed 3000 words, got ${getWordCount(html)}`
  );
});

test("renders second checklist article route with printable weekly plan", () => {
  const html = sanitizeHtml(
    sourceHtml,
    "/blog/checklists/weekly-cleaning-checklist-for-a-3-bedroom-house"
  );

  assert.match(html, /Cleaning <span style="color: rgb\(158, 68, 90\);">Checklists<\/span>/);
  assert.match(html, /<h1 class="shynli-blog-article__title">Weekly Cleaning Checklist for a 3 Bedroom House<\/h1>/);
  assert.match(html, /Quick Answer: Weekly Cleaning Checklist for a 3 Bedroom House/);
  assert.match(html, /Printable Weekly Cleaning Checklist/);
  assert.match(
    html,
    /class="shynli-blog-article__toc-link" href="\/blog\/checklists\/weekly-cleaning-checklist-for-a-3-bedroom-house#quick-answer" data-target-id="quick-answer"/
  );
  assert.match(html, /Need help resetting a 3 bedroom house every week\?/);
  assert.match(html, /What to Clean Every Week in a 3 Bedroom House/);
  assert.match(html, /Weekly Bedroom Cleaning Checklist/);
  assert.match(html, /Weekly Bathroom Cleaning Checklist/);
  assert.match(html, /data-blog-print/);
  assert.ok(
    getWordCount(html) > 2800,
    `Expected second long-form article to exceed 2800 words, got ${getWordCount(html)}`
  );
});

test("renders all checklist articles with live route structure and long-form content", () => {
  const checklistArticles = BLOG_ARTICLES.filter((article) => article.categoryPath === "/blog/checklists");

  for (const article of checklistArticles) {
    const html = sanitizeHtml(sourceHtml, article.path);

    assert.match(
      html,
      new RegExp(`<h1 class="shynli-blog-article__title">${escapeRegex(article.title)}<\\/h1>`)
    );
    assert.match(html, /Quick navigation/);
    assert.match(html, /class="shynli-blog-article__toc-link"/);
    assert.match(html, /data-blog-print/);
    assert.match(html, /shynli-blog-quote-panel/);
    assert.ok(
      getWordCount(html) > 2200,
      `Expected ${article.path} to exceed 2200 words, got ${getWordCount(html)}`
    );
  }
});

test("renders all what's included articles with live route structure and long-form content", () => {
  const whatsIncludedArticles = BLOG_ARTICLES.filter(
    (article) => article.categoryPath === "/blog/whats-included"
  );

  for (const article of whatsIncludedArticles) {
    const html = sanitizeHtml(sourceHtml, article.path);

    assert.match(
      html,
      new RegExp(`<h1 class="shynli-blog-article__title">${escapeRegex(article.title)}<\\/h1>`)
    );
    assert.match(html, /Quick navigation/);
    assert.match(html, /class="shynli-blog-article__toc-link"/);
    assert.match(html, /shynli-blog-quote-panel/);
    assert.ok(
      getWordCount(html) > 1700,
      `Expected ${article.path} to exceed 1700 words, got ${getWordCount(html)}`
    );
  }
});

test("renders all bathroom articles with live route structure and long-form content", () => {
  const bathroomArticles = BLOG_ARTICLES.filter((article) => article.categoryPath === "/blog/bathroom");

  for (const article of bathroomArticles) {
    const html = sanitizeHtml(sourceHtml, article.path);

    assert.match(
      html,
      new RegExp(`<h1 class="shynli-blog-article__title">${escapeRegex(article.title)}<\\/h1>`)
    );
    assert.match(html, /Quick navigation/);
    assert.match(html, /class="shynli-blog-article__toc-link"/);
    assert.match(html, /shynli-blog-quote-panel/);
    assert.ok(
      getWordCount(html) > 1400,
      `Expected ${article.path} to exceed 1400 words, got ${getWordCount(html)}`
    );
  }
});

test("renders all dust articles with live route structure and long-form content", () => {
  const dustArticles = BLOG_ARTICLES.filter((article) => article.categoryPath === "/blog/dust");

  for (const article of dustArticles) {
    const html = sanitizeHtml(sourceHtml, article.path);

    assert.match(
      html,
      new RegExp(`<h1 class="shynli-blog-article__title">${escapeRegex(article.title)}<\\/h1>`)
    );
    assert.match(html, /Quick navigation/);
    assert.match(html, /class="shynli-blog-article__toc-link"/);
    assert.match(html, /shynli-blog-quote-panel/);
    assert.ok(
      getWordCount(html) > 1400,
      `Expected ${article.path} to exceed 1400 words, got ${getWordCount(html)}`
    );
  }
});

test("renders all floors articles with live route structure and long-form content", () => {
  const floorsArticles = BLOG_ARTICLES.filter((article) => article.categoryPath === "/blog/floors");

  for (const article of floorsArticles) {
    const html = sanitizeHtml(sourceHtml, article.path);

    assert.match(
      html,
      new RegExp(`<h1 class="shynli-blog-article__title">${escapeRegex(article.title)}<\\/h1>`)
    );
    assert.match(html, /Quick navigation/);
    assert.match(html, /class="shynli-blog-article__toc-link"/);
    assert.match(html, /shynli-blog-quote-panel/);
    assert.ok(
      getWordCount(html) > 1400,
      `Expected ${article.path} to exceed 1400 words, got ${getWordCount(html)}`
    );
  }
});

test("renders all services articles with live route structure and long-form content", () => {
  const servicesArticles = BLOG_ARTICLES.filter((article) => article.categoryPath === "/blog/services");

  for (const article of servicesArticles) {
    const html = sanitizeHtml(sourceHtml, article.path);

    assert.match(
      html,
      new RegExp(`<h1 class="shynli-blog-article__title">${escapeRegex(article.title)}<\\/h1>`)
    );
    assert.match(html, /Quick navigation/);
    assert.match(html, /class="shynli-blog-article__toc-link"/);
    assert.match(html, /shynli-blog-quote-panel/);
    assert.ok(
      getWordCount(html) > 1700,
      `Expected ${article.path} to exceed 1700 words, got ${getWordCount(html)}`
    );
  }
});
