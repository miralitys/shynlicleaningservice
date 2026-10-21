"use strict";

const { parse } = require("parse5");
const routes = require("../../routes.json");
const { SERVICE_AREA_ZIP_MAP } = require("../service-area-zips");

const CITY_PAGES = [...new Map(Object.values(SERVICE_AREA_ZIP_MAP).flat()
  .filter(({ url }) => Object.hasOwn(routes, url)).map(({ city, url }) => [url, city]))]
  .sort((left, right) => left[1].localeCompare(right[1]));
const SERVICE_PAGES = Object.keys(routes).filter((route) => /^\/services\/[^/]+$/.test(route)).sort();
const BUSINESS_TYPES = new Set(["LocalBusiness", "HouseCleaningService", "HouseCleaningBusiness"]);
const BLOCK_TAGS = new Set(["p", "div", "section", "article", "li", "ul", "ol", "h1", "h2", "h3", "h4", "br", "table", "tr", "td", "summary"]);

function attribute(node, name) {
  return node.attrs?.find((attr) => attr.name === name)?.value || "";
}

function descendants(node, predicate) {
  const found = [];
  function visit(current) {
    if (predicate(current)) found.push(current);
    for (const child of current.childNodes || []) visit(child);
  }
  visit(node);
  return found;
}

function visibleText(node) {
  function text(current) {
    if (current.nodeName === "#text") return current.value;
    if (["script", "style", "svg", "template"].includes(current.tagName)
      || attribute(current, "aria-hidden") === "true"
      || /(?:^|[\s_-])icon(?:[\s_-]|$)/i.test(attribute(current, "class"))) return "";
    const content = (current.childNodes || []).map(text).join("");
    return BLOCK_TAGS.has(current.tagName) ? ` ${content} ` : content;
  }
  return text(node).replace(/\s+/gu, " ").trim();
}

function faqAncestor(node) {
  for (let current = node; current; current = current.parentNode) {
    if (/faq/i.test(`${attribute(current, "class")} ${attribute(current, "id")}`)) return true;
  }
  return false;
}

function inspectHtml(html) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const nodes = descendants(document, (node) => Boolean(node.tagName));
  const main = nodes.find((node) => node.tagName === "main")
    || nodes.find((node) => node.tagName === "body") || document;
  const byId = new Map(nodes.filter((node) => attribute(node, "id")).map((node) => [attribute(node, "id"), node]));
  const faq = [];
  const seen = new Set();
  function add(question, answer) {
    if (!question || !answer || seen.has(question)) return;
    seen.add(question);
    faq.push({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } });
  }
  for (const node of nodes) {
    if (node.tagName === "details" && faqAncestor(node)) {
      const summary = (node.childNodes || []).find((child) => child.tagName === "summary");
      if (!summary) continue;
      const label = descendants(summary, (child) => /(?:faq.*question|question.*text)/i.test(attribute(child, "class")))[0] || summary;
      add(visibleText(label), (node.childNodes || []).filter((child) => child !== summary).map(visibleText).join(" ").replace(/\s+/g, " ").trim());
    }
    if (node.tagName === "button" && /(?:^|\s)faq-(?:no-bg-)?question(?:\s|$)/.test(attribute(node, "class"))) {
      const label = descendants(node, (child) => /(?:question-text|faq__question)/.test(attribute(child, "class")))[0]
        || (node.childNodes || []).find((child) => child.tagName === "span") || node;
      const controlled = byId.get(attribute(node, "aria-controls"));
      const siblings = node.parentNode?.childNodes || [];
      const answer = controlled || siblings.slice(siblings.indexOf(node) + 1)
        .find((child) => /(?:^|\s)faq-(?:no-bg-)?answer(?:\s|$)/.test(attribute(child, "class")));
      if (answer) add(visibleText(label), visibleText(answer));
    }
  }
  const scripts = nodes.filter((node) => node.tagName === "script" && attribute(node, "type").toLowerCase() === "application/ld+json");
  return {
    nodes, main, scripts, faq,
    text: visibleText(main),
    serviceLinks: new Set(descendants(main, (node) => node.tagName === "a").map((node) => attribute(node, "href").split(/[?#]/)[0])),
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createStructuredDataHelpers({ siteOrigin, getRouteLabel }) {
  const businessId = `${siteOrigin}/#localbusiness`;
  const provider = () => ({ "@id": businessId });
  const cityArray = () => CITY_PAGES.map(([, city]) => ({ "@type": "City", name: `${city}, IL` }));
  const cityByPath = new Map(CITY_PAGES);
  const absolute = (route) => `${siteOrigin}${route}`;
  function catalog(paths) {
    return {
      "@type": "OfferCatalog", name: "Cleaning services",
      itemListElement: paths.map((route) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: getRouteLabel(route), url: absolute(route) },
      })),
    };
  }
  function buildHomeSchemas() {
    return {
      "@context": "https://schema.org",
      "@graph": [{
        "@type": "LocalBusiness", "@id": businessId,
        name: "Shynli Cleaning Service", url: `${siteOrigin}/`, telephone: "+1-630-812-7077",
        image: `${siteOrigin}/images/shynli-og-photo.png`,
        logo: `${siteOrigin}/images/tild3531-6535-4863-b761-323963303436__logo_2.png`,
        priceRange: "$$",
        description: "House cleaning in the western Chicago suburbs. Regular, deep, and move-in or move-out cleaning for local homes.",
        address: { "@type": "PostalAddress", addressLocality: "Naperville", addressRegion: "IL", addressCountry: "US" },
        areaServed: cityArray(), hasOfferCatalog: catalog(SERVICE_PAGES),
      }, {
        "@type": "WebSite", "@id": `${siteOrigin}/#website`, url: `${siteOrigin}/`,
        name: "Shynli Cleaning", publisher: provider(),
      }],
    };
  }
  function startingOffers(facts, route) {
    if (/^\/services\/regular-cleaning(?:\/|$)/.test(route)) {
      const offers = [...facts.text.matchAll(/\b(Weekly|Bi-Weekly|Monthly) Cleaning\s*\$(\d+(?:\.\d{1,2})?)/gi)];
      if (offers.length) return [...new Map(offers.map((match) => [match[1].toLowerCase(), {
        "@type": "Offer", name: `${match[1]} Cleaning`, priceCurrency: "USD", price: match[2], url: absolute(route),
      }])).values()];
    }
    const hero = facts.nodes.find((node) => /(?:^|\s)(?:dc|move|lp|shynli-service-ads)-hero(?:\s|__|$)/.test(attribute(node, "class")))
      || facts.nodes.find((node) => /(?:^|\s)shynli-service-ads-hero-offer(?:\s|$)/.test(attribute(node, "class")));
    const match = hero && visibleText(hero).match(/\bFrom\s*\$(\d+(?:\.\d{1,2})?)/i);
    return match ? [{ "@type": "Offer", name: "Starting price", priceCurrency: "USD", price: match[1], url: absolute(route) }] : [];
  }
  function buildPageService(route, routeSeo, facts) {
    const city = cityByPath.get(route);
    if (!city && !route.startsWith("/services/")) return null;
    const service = {
      "@context": "https://schema.org", "@type": "Service", "@id": `${absolute(route)}#service`,
      name: city ? `House Cleaning in ${city}, IL` : getRouteLabel(route.replace(/\/ads(?:-v2|-lp)?$/, "")),
      serviceType: city ? "House cleaning" : getRouteLabel(route.replace(/\/ads(?:-v2|-lp)?$/, "")),
      description: routeSeo.description,
      url: absolute(route), provider: provider(),
      areaServed: city ? { "@type": "City", name: `${city}, IL` } : cityArray(),
    };
    if (city) {
      const linked = SERVICE_PAGES.filter((path) => facts.serviceLinks.has(path) || facts.serviceLinks.has(absolute(path)));
      if (linked.length) service.hasOfferCatalog = catalog(linked);
    } else {
      const offers = startingOffers(facts, route);
      if (offers.length) service.offers = offers;
    }
    return service;
  }
  function normalizeLegacy(value, facts, key = "") {
    if (Array.isArray(value)) return value.map((item) => normalizeLegacy(item, facts, key)).filter((item) => item !== null);
    if (!value || typeof value !== "object") return value;
    const types = [].concat(value["@type"] || []);
    if (types.some((type) => BUSINESS_TYPES.has(type))
      || (types.includes("Organization") && /shynli/i.test(value.name || ""))) return provider();
    if (types.includes("FAQPage")) return null;
    const output = {};
    for (const [property, child] of Object.entries(value)) {
      const normalized = normalizeLegacy(child, facts, property);
      if (normalized !== null) output[property] = normalized;
    }
    if (types.includes("Service")) {
      output.provider = provider();
      if (key !== "itemOffered") output.areaServed = cityArray();
      if (!output.name && output.serviceType) output.name = output.serviceType;
    }
    if (types.includes("Offer")) {
      const label = String(value.name || value.itemOffered?.name || "").replace(/ Recurring Cleaning$/i, " Cleaning");
      const context = label && facts.text.match(new RegExp(`${escapeRegExp(label)}[^$]{0,90}\\$([\\d,.]+)`, "i"));
      if (output.price !== undefined && (!context || Number(context[1].replace(/,/g, "")) !== Number(output.price))) {
        delete output.price;
        delete output.priceSpecification;
      }
      if (output.priceSpecification && output.price === undefined) {
        // Old ranges are not evidence of a starting price on the rendered page.
        delete output.priceSpecification;
      }
    }
    if (output["@graph"]) {
      output["@graph"] = output["@graph"].filter((node) => Object.keys(node).some((property) => !["@id", "@context"].includes(property)));
      if (!output["@graph"].length) return null;
    }
    return output;
  }
  function renderScript(id, value) {
    return `<script type="application/ld+json" id="${id}">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
  }
  function finalizeStructuredData(html, route, routeSeo) {
    const facts = inspectHtml(html);
    const replacements = [];
    for (const script of facts.scripts) {
      const id = attribute(script, "id");
      const location = script.sourceCodeLocation;
      if (!location) continue;
      let value;
      try { value = JSON.parse((script.childNodes || []).map((node) => node.value || "").join("")); }
      catch { continue; }
      const rebuilt = id === "schema-home" || id === "schema-service" && (cityByPath.has(route) || route.startsWith("/services/"));
      const normalized = rebuilt ? null : normalizeLegacy(value, facts);
      const meaningful = normalized && Object.keys(normalized).some((key) => !["@id", "@context"].includes(key));
      replacements.push({ start: location.startOffset, end: location.endOffset,
        text: meaningful ? renderScript(id || "schema-existing", normalized) : "" });
    }
    let output = html;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
      output = output.slice(0, replacement.start) + replacement.text + output.slice(replacement.end);
    }
    const generated = [];
    if (route === "/") generated.push(renderScript("schema-home", buildHomeSchemas()));
    const service = buildPageService(route, routeSeo, facts);
    if (service) generated.push(renderScript("schema-service", service));
    if (facts.faq.length) generated.push(renderScript("schema-faq", {
      "@context": "https://schema.org", "@type": "FAQPage", mainEntity: facts.faq,
    }));
    if (generated.length) output = output.replace(/<\/head>/i, () => `${generated.join("")}</head>`);
    return output;
  }
  return { buildHomeSchemas, finalizeStructuredData };
}

module.exports = { CITY_PAGES, SERVICE_PAGES, createStructuredDataHelpers, inspectHtml, visibleText };
