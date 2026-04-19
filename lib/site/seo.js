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

  function insertIntoHead(html, snippet) {
    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${snippet}</head>`);
    }
    return `${snippet}${html}`;
  }

  function insertIntoMetaBlock(html, snippet) {
    if (/<!--\/metatextblock-->/i.test(html)) {
      return html.replace(/<!--\/metatextblock-->/i, `${snippet} <!--/metatextblock-->`);
    }
    return insertIntoHead(html, snippet);
  }

  function stripHtmlTags(value) {
    return String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildLocalBusinessIdentity() {
    return {
      "@type": "LocalBusiness",
      "@id": `${SITE_ORIGIN}/#localbusiness`,
      name: "Shynli Cleaning",
      url: `${SITE_ORIGIN}/`,
      telephone: "+1(630)812-7077",
      image: `${SITE_ORIGIN}/images/tild3663-3735-4236-a133-346266656365__photo.png`,
    };
  }

  function replaceOrInsertMetaTag(html, matcher, tagFactory) {
    if (matcher.test(html)) {
      return html.replace(matcher, tagFactory());
    }
    return insertIntoMetaBlock(html, tagFactory());
  }

  function setTitleTag(html, title) {
    if (!title) return html;
    const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (/<title>[\s\S]*?<\/title>/i.test(html)) {
      return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
    }
    return insertIntoMetaBlock(html, `<title>${safeTitle}</title>`);
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
    return insertIntoMetaBlock(html, `<link rel="canonical" href="${safeUrl}">`);
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
    const localBusiness = buildLocalBusinessIdentity();
    return {
      "@context": "https://schema.org",
      "@graph": [
        localBusiness,
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

  function buildContactSchema(routePath) {
    if (normalizeRoute(routePath) !== "/contacts") return null;
    return {
      "@context": "https://schema.org",
      ...buildLocalBusinessIdentity(),
    };
  }

  function buildServiceSchema(routePath, routeSeo = {}) {
    const normalizedRoute = normalizeRoute(routePath);
    if (!normalizedRoute.startsWith("/services/")) return null;

    const serviceName = getRouteLabel(normalizedRoute);
    return {
      "@context": "https://schema.org",
      "@type": "Service",
      name: serviceName,
      serviceType: serviceName,
      description: routeSeo.description || `${serviceName} from Shynli Cleaning.`,
      url: toAbsoluteUrl(normalizedRoute),
      areaServed: "Chicago suburbs",
      provider: buildLocalBusinessIdentity(),
    };
  }

  function buildFaqSchema(html, routePath) {
    if (normalizeRoute(routePath) !== "/faq") return null;

    const items = [];
    const seenQuestions = new Set();
    const faqPattern =
      /<button class="faq-no-bg-question[^"]*"[^>]*>[\s\S]*?<span class="faq-no-bg-question-text[^"]*">([\s\S]*?)<\/span>[\s\S]*?<\/button>\s*<div class="faq-no-bg-answer[^"]*">([\s\S]*?)<\/div>/gi;

    for (const match of html.matchAll(faqPattern)) {
      const question = stripHtmlTags(match[1]);
      const answer = stripHtmlTags(match[2]);
      if (!question || !answer || seenQuestions.has(question)) continue;
      seenQuestions.add(question);
      items.push({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      });
    }

    if (items.length === 0) return null;
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items,
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
    buildContactSchema,
    buildFaqSchema,
    setCanonicalLink,
    setMetaContent,
    setTitleTag,
    buildServiceSchema,
    upsertJsonLd,
  };
}

module.exports = {
  createSiteSeoHelpers,
};
