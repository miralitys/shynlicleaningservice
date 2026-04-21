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

const PRIORITY_ARTICLE_PATHS = new Set([
  "/blog/airbnb/how-to-clean-after-parties-in-airbnb",
  "/blog/airbnb/how-to-clean-and-stage-airbnb-fast",
  "/blog/airbnb/how-to-create-a-cleaning-checklist-for-co-hosts",
  "/blog/airbnb/how-to-remove-odors-quickly-before-guests-arrive",
  "/blog/bathroom/how-to-clean-bathroom-cabinets-sticky-residue",
  "/blog/bathroom/how-to-clean-bathroom-exhaust-fan-dust",
  "/blog/bathroom/how-to-clean-behind-toilet-base",
  "/blog/bathroom/how-to-descale-shower-head-vinegar-vs-alternatives",
  "/blog/bathroom/how-to-keep-bathroom-smelling-fresh-between-cleanings",
  "/blog/bathroom/how-to-whiten-bathroom-grout-without-bleach",
  "/blog/checklists/deep-cleaning-checklist-for-first-time-clients",
  "/blog/cleaning-hacks/best-order-to-clean-a-room-step-by-step",
  "/blog/cleaning-hacks/how-to-declutter-before-deep-cleaning",
  "/blog/cleaning-hacks/how-to-make-house-smell-clean-without-heavy-fragrance",
  "/blog/cleaning-hacks/top-cleaning-mistakes-that-waste-time",
  "/blog/dust/best-way-to-clean-light-switches-and-door-handles",
  "/blog/dust/how-to-clean-ceiling-fans-without-dust-falling",
  "/blog/dust/how-to-clean-playroom-quickly",
  "/blog/floors/best-mop-for-laminate-floors-no-streaks",
  "/blog/floors/how-often-should-you-mop-floors",
  "/blog/floors/how-to-clean-area-rugs-at-home",
  "/blog/floors/how-to-clean-baseboards-fast-without-bending",
  "/blog/floors/how-to-clean-tile-floors-and-grout",
  "/blog/floors/how-to-remove-paint-drops-from-floor-safely",
  "/blog/floors/how-to-stop-floors-from-feeling-sticky-after-mopping",
  "/blog/kitchen/how-to-clean-pantry-shelves-dust-and-spills",
  "/blog/move-in-move-out/apartment-move-out-cleaning-vs-house-move-out-cleaning",
  "/blog/move-in-move-out/is-professional-move-out-cleaning-worth-it",
  "/blog/move-in-move-out/what-to-do-if-you-need-last-minute-move-out-cleaning",
  "/blog/pet-hair/enzyme-cleaner-vs-vinegar-for-pet-accidents",
  "/blog/pet-hair/how-to-keep-house-clean-with-2-dogs",
  "/blog/pet-hair/how-to-prevent-pet-odor-between-cleanings",
  "/blog/pet-hair/how-to-remove-pet-hair-from-stairs-carpet",
  "/blog/seasonal/cleaning-before-selling-house-checklist",
  "/blog/seasonal/cleaning-routine-during-back-to-school-season",
  "/blog/seasonal/how-to-clean-after-new-baby-at-home",
  "/blog/services/cleaning-cost-for-2-bathrooms-vs-3-bathrooms",
  "/blog/services/house-cleaning-cost-per-hour-vs-flat-rate",
  "/blog/services/recurring-cleaning-discount-how-it-works",
  "/blog/services/tip-guide-for-house-cleaners-how-much-to-tip",
  "/blog/services/why-prices-vary-between-cleaning-companies",
  "/blog/whats-included/do-cleaners-clean-inside-fridge",
]);

test("blog rendering leaves no managed article with only one internal blog referrer", () => {
  const inboundByPath = new Map(BLOG_ARTICLES.map((article) => [article.path, new Set()]));
  const pages = [
    "/blog",
    ...new Set(BLOG_ARTICLES.map((article) => article.categoryPath)),
    ...BLOG_ARTICLES.map((article) => article.path),
  ];

  for (const route of pages) {
    const html = sanitizeHtml(sourceHtml, route);
    const blogHrefs = [...html.matchAll(/href="(\/blog\/[^"]+)"/g)].map((match) => normalizeRoute(match[1]));

    for (const href of blogHrefs) {
      if (!inboundByPath.has(href) || href === route) continue;
      inboundByPath.get(href).add(route);
    }
  }

  const weakSingleReferrerPages = [];
  const underlinkedPriorityPages = [];

  for (const article of BLOG_ARTICLES) {
    const referrerCount = inboundByPath.get(article.path).size;
    if (referrerCount === 1) {
      weakSingleReferrerPages.push(article.path);
    }
    if (PRIORITY_ARTICLE_PATHS.has(article.path) && referrerCount < 2) {
      underlinkedPriorityPages.push(article.path);
    }
  }

  assert.deepEqual(weakSingleReferrerPages, []);
  assert.deepEqual(underlinkedPriorityPages, []);
});
