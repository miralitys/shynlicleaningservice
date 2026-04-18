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

test("renders blog hub topic links and stable CTA button styles on /blog", () => {
  const html = sanitizeHtml(sourceHtml, "/blog");

  assert.match(html, /href="\/blog\/checklists"/);
  assert.match(html, /Find the cleaning guide you actually need\./);
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
