"use strict";

function createSiteSeoHelpers(deps = {}) {
  const {
    BREADCRUMB_LABELS,
    NOINDEX_ROUTES,
    ROUTE_META_OVERRIDES,
    SITE_ORIGIN,
    escapeHtmlAttribute,
    normalizeRoute,
  } = deps;

  function toAbsoluteUrl(routePath) {
    const normalizedRoute = normalizeRoute(routePath);
    return `${SITE_ORIGIN}${normalizedRoute === "/" ? "/" : normalizedRoute}`;
  }

  function slugToTitle(value) {
    return String(value || "")
      .split("-")
      .filter(Boolean)
      .map((part) => {
        const lower = part.toLowerCase();
        if (lower === "faq") return "FAQ";
        if (lower === "oauth") return "OAuth";
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(" ");
  }

  function getRouteLabel(routePath) {
    if (BREADCRUMB_LABELS.has(routePath)) return BREADCRUMB_LABELS.get(routePath);
    const parts = normalizeRoute(routePath).split("/").filter(Boolean);
    if (parts.length === 0) return "Home";
    return slugToTitle(parts[parts.length - 1]);
  }

  function replaceOrInsertMetaTag(html, matcher, tagFactory) {
    if (matcher.test(html)) {
      return html.replace(matcher, tagFactory());
    }
    return html.replace(/<!--\/metatextblock-->/i, `${tagFactory()} <!--/metatextblock-->`);
  }

  function setTitleTag(html, title) {
    if (!title) return html;
    const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (/<title>[\s\S]*?<\/title>/i.test(html)) {
      return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
    }
    return html.replace(/<!--\/metatextblock-->/i, `<title>${safeTitle}</title> <!--/metatextblock-->`);
  }

  function setMetaContent(html, key, value, attr = "name") {
    if (!value) return html;
    const safeValue = escapeHtmlAttribute(value);
    const matcher = new RegExp(`<meta[^>]+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`, "i");
    return replaceOrInsertMetaTag(
      html,
      matcher,
      () => `<meta ${attr}="${key}" content="${safeValue}" />`
    );
  }

  function setCanonicalLink(html, url) {
    if (!url) return html;
    const safeUrl = escapeHtmlAttribute(url);
    if (/<link[^>]+rel="canonical"[^>]*>/i.test(html)) {
      return html.replace(
        /<link[^>]+rel="canonical"[^>]*>/i,
        `<link rel="canonical" href="${safeUrl}">`
      );
    }
    return html.replace(/<!--\/metatextblock-->/i, `<link rel="canonical" href="${safeUrl}"> <!--/metatextblock-->`);
  }

  function upsertJsonLd(html, id, payload) {
    const script = `<script type="application/ld+json" id="${id}">${JSON.stringify(payload)}</script>`;
    const matcher = new RegExp(`<script[^>]+id="${id}"[^>]*>[\\s\\S]*?<\\/script>`, "i");
    if (matcher.test(html)) {
      return html.replace(matcher, script);
    }
    return html.replace(/<\/head>/i, `${script}</head>`);
  }

  function buildBreadcrumbSchema(routePath) {
    const normalized = normalizeRoute(routePath);
    if (normalized === "/" || normalized === "/quote" || normalized === "/oauth/callback") return null;

    const parts = normalized.split("/").filter(Boolean);
    const itemListElement = [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${SITE_ORIGIN}/`,
      },
    ];

    let currentPath = "";
    for (const [index, part] of parts.entries()) {
      currentPath += `/${part}`;
      itemListElement.push({
        "@type": "ListItem",
        position: index + 2,
        name: getRouteLabel(currentPath),
        item: toAbsoluteUrl(currentPath),
      });
    }

    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement,
    };
  }

  function buildHomeSchemas() {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "LocalBusiness",
          "@id": `${SITE_ORIGIN}/#localbusiness`,
          name: "Shynli Cleaning",
          url: `${SITE_ORIGIN}/`,
          telephone: "+1(630)812-7077",
          image: `${SITE_ORIGIN}/images/tild3663-3735-4236-a133-346266656365__photo.png`,
        },
        {
          "@type": "WebSite",
          "@id": `${SITE_ORIGIN}/#website`,
          url: `${SITE_ORIGIN}/`,
          name: "Shynli Cleaning",
          publisher: { "@id": `${SITE_ORIGIN}/#localbusiness` },
        },
      ],
    };
  }

  function deriveRouteSeo(html, routePath) {
    const normalizedRoute = normalizeRoute(routePath);
    const overrides = ROUTE_META_OVERRIDES[normalizedRoute] || {};
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
    const existingTitle = titleMatch ? titleMatch[1].trim() : "";
    const existingDesc = descMatch ? descMatch[1].trim() : "";
    const title = overrides.title || existingTitle;
    const description = overrides.description || existingDesc;
    const canonical = overrides.canonical || toAbsoluteUrl(normalizedRoute);
    const ogUrl = overrides.ogUrl || canonical;
    const ogTitle = overrides.ogTitle || title;
    const ogDescription = overrides.ogDescription || description;
    const robots = overrides.robots || (NOINDEX_ROUTES.has(normalizedRoute) ? "noindex,follow" : "");
    return { title, description, canonical, ogUrl, ogTitle, ogDescription, robots };
  }

  return {
    buildBreadcrumbSchema,
    buildHomeSchemas,
    deriveRouteSeo,
    setCanonicalLink,
    setMetaContent,
    setTitleTag,
    upsertJsonLd,
  };
}

module.exports = {
  createSiteSeoHelpers,
};
