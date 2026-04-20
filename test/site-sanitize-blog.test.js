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
  buildContactSchema() {
    return null;
  },
  buildFaqSchema() {
    return null;
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
  buildServiceSchema() {
    return null;
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

function getSoftLinkTargets(html) {
  return [...html.matchAll(/class="shynli-blog-article__soft-link"[^>]*data-soft-link-target="([^"]+)"/g)].map(
    (match) => match[1]
  );
}

function splitTopLevelArticleSections(html) {
  const sectionMarker = '<section class="shynli-blog-article__section"';
  const sections = [];

  let start = String(html || "").indexOf(sectionMarker);
  while (start !== -1) {
    let depth = 0;
    let position = start;
    let end = -1;

    while (position < html.length) {
      const nextOpen = html.indexOf("<section", position);
      const nextClose = html.indexOf("</section>", position);

      if (nextClose === -1) {
        throw new Error("Unbalanced section markup while parsing article sections in test.");
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        position = nextOpen + "<section".length;
        continue;
      }

      depth -= 1;
      position = nextClose + "</section>".length;
      if (depth === 0) {
        end = position;
        break;
      }
    }

    if (end === -1) {
      throw new Error("Could not find the end of a top-level article section in test.");
    }

    sections.push(html.slice(start, end));
    start = html.indexOf(sectionMarker, end);
  }

  return sections;
}

function getSoftLinkSectionCount(html) {
  return splitTopLevelArticleSections(html).filter((section) => /data-soft-link-slot=/.test(section))
    .length;
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

test("renders featured kitchen article links on /blog/kitchen", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/kitchen");

  assert.match(html, /how-to-clean-greasy-kitchen-cabinets/);
  assert.match(html, /how-to-clean-stainless-steel-appliances-without-streaks/);
  assert.match(html, /how-to-clean-microwave-inside-fast/);
});

test("renders featured pet hair article links on /blog/pet-hair", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/pet-hair");

  assert.match(html, /how-to-remove-pet-hair-from-stairs-carpet/);
  assert.match(html, /how-to-remove-dog-hair-from-couch-fabric/);
  assert.match(html, /best-vacuum-tips-for-pet-hair/);
});

test("renders featured move-in move-out article links on /blog/move-in-move-out", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/move-in-move-out");

  assert.match(html, /move-out-cleaning-checklist-for-renters/);
  assert.match(html, /what-landlords-check-during-move-out-inspection-cleaning/);
  assert.match(html, /how-clean-should-apartment-be-when-moving-out/);
  assert.match(html, /Move-In \/ Move-Out <span style="color: rgb\(158, 68, 90\);">Guides<\/span>/);
});

test("renders featured airbnb article links on /blog/airbnb", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/airbnb");

  assert.match(html, /airbnb-turnover-cleaning-checklist-with-photos/);
  assert.match(html, /how-to-schedule-airbnb-cleanings-between-guests/);
  assert.match(html, /how-to-set-cleaning-fees-for-airbnb/);
  assert.match(html, /Airbnb <span style="color: rgb\(158, 68, 90\);">Cleaning Guides<\/span>/);
});

test("renders featured seasonal article links on /blog/seasonal", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/seasonal");

  assert.match(html, /cleaning-checklist-before-thanksgiving-hosting/);
  assert.match(html, /post-holiday-deep-cleaning-checklist/);
  assert.match(html, /spring-deep-cleaning-for-families/);
  assert.match(html, /Seasonal <span style="color: rgb\(158, 68, 90\);">Cleaning Guides<\/span>/);
});

test("renders featured cleaning hacks article links on /blog/cleaning-hacks", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/cleaning-hacks");

  assert.match(html, /fastest-way-to-clean-a-bathroom-in-20-minutes/);
  assert.match(html, /fastest-way-to-clean-kitchen-in-30-minutes/);
  assert.match(html, /15-minute-daily-cleaning-routine/);
  assert.match(html, /Cleaning <span style="color: rgb\(158, 68, 90\);">Hacks<\/span>/);
});

test("renders article-level related guides that strengthen same-category links", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/airbnb/airbnb-turnover-cleaning-checklist-with-photos");
  const relatedSectionMatch = html.match(
    /<section class="shynli-blog-featured shynli-blog-featured--related">([\s\S]*?)<\/section>/
  );

  assert.ok(relatedSectionMatch, "expected a related guides section on blog articles");
  const relatedSection = relatedSectionMatch[1];

  assert.match(relatedSection, /Related guides from this topic/);
  assert.match(relatedSection, /how-to-clean-after-parties-in-airbnb/);
  assert.match(relatedSection, /how-to-clean-and-stage-airbnb-fast/);
  assert.match(relatedSection, /how-to-create-a-cleaning-checklist-for-co-hosts/);
  assert.doesNotMatch(relatedSection, /airbnb-turnover-cleaning-checklist-with-photos/);
});

test("renders a compact inline quote panel right after the quick answer section", () => {
  const html = sanitizeHtml(sourceHtml, "/blog/airbnb/airbnb-turnover-cleaning-checklist-with-photos");

  const quickAnswerIndex = html.indexOf('id="quick-answer"');
  const inlineQuoteIndex = html.indexOf('shynli-blog-quote-panel shynli-blog-quote-panel--inline');
  const nextSectionIndex = html.indexOf("Why This Airbnb Cleaning Issue Matters");

  assert.ok(quickAnswerIndex >= 0, "expected quick answer section");
  assert.ok(inlineQuoteIndex > quickAnswerIndex, "expected inline quote panel after quick answer");
  assert.ok(nextSectionIndex > inlineQuoteIndex, "expected inline quote panel before the next section");
  assert.match(html, /Get a quick quote while this is fresh/);
  assert.match(html, /class="shynli-blog-quote-form shynli-blog-quote-form--inline" data-blog-quote-form/);
  assert.match(
    html,
    /id="quick-answer"[\s\S]*?<\/section><div class="shynli-blog-quote-panel shynli-blog-quote-panel--inline">[\s\S]*?<section class="shynli-blog-article__section" id="why-it-happens"/
  );
  assert.match(html, /\.shynli-blog-featured--related \.shynli-blog-featured__grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:12px;\}/);
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

test("keeps summary cards and following sections structurally separate in article layouts", () => {
  const html = sanitizeHtml(
    sourceHtml,
    "/blog/whats-included/what-is-included-in-a-deep-cleaning-service"
  );

  assert.match(
    html,
    /<div class="shynli-blog-article__summary-grid">[\s\S]*<\/div>\s*<div class="shynli-blog-article__action-row">[\s\S]*<\/div>\s*<\/section>\s*<section class="shynli-blog-article__section" id="what-makes-it-deep">/
  );
});

test("renders exactly three soft internal links on every managed blog article", () => {
  for (const article of BLOG_ARTICLES) {
    const html = sanitizeHtml(sourceHtml, article.path);
    const targets = getSoftLinkTargets(html);

    assert.equal(
      targets.length,
      3,
      `Expected exactly three soft internal links for ${article.path}, got ${targets.length}`
    );
    assert.equal(
      new Set(targets).size,
      3,
      `Expected three unique internal-link targets for ${article.path}`
    );
    assert.ok(
      targets.every((target) => target !== article.path),
      `Expected ${article.path} not to self-link in soft internal links`
    );
    assert.equal(
      getSoftLinkSectionCount(html),
      3,
      `Expected soft internal links to be distributed across three sections for ${article.path}`
    );
  }
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

test("renders all kitchen articles with live route structure and long-form content", () => {
  const kitchenArticles = BLOG_ARTICLES.filter((article) => article.categoryPath === "/blog/kitchen");

  for (const article of kitchenArticles) {
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

test("renders all pet hair articles with live route structure and long-form content", () => {
  const petHairArticles = BLOG_ARTICLES.filter((article) => article.categoryPath === "/blog/pet-hair");

  for (const article of petHairArticles) {
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

test("renders all move-in move-out articles with live route structure and long-form content", () => {
  const moveArticles = BLOG_ARTICLES.filter(
    (article) => article.categoryPath === "/blog/move-in-move-out"
  );

  for (const article of moveArticles) {
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

test("renders all airbnb articles with live route structure and long-form content", () => {
  const airbnbArticles = BLOG_ARTICLES.filter((article) => article.categoryPath === "/blog/airbnb");

  for (const article of airbnbArticles) {
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

test("renders all seasonal articles with live route structure and long-form content", () => {
  const seasonalArticles = BLOG_ARTICLES.filter((article) => article.categoryPath === "/blog/seasonal");

  for (const article of seasonalArticles) {
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

test("renders all cleaning hacks articles with live route structure and long-form content", () => {
  const cleaningHacksArticles = BLOG_ARTICLES.filter(
    (article) => article.categoryPath === "/blog/cleaning-hacks"
  );

  for (const article of cleaningHacksArticles) {
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
