"use strict";

const { parse } = require("parse5");
const { pages, cities, services } = require("./service-city-data");
const release = require("./service-city-release.json");

const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const cls = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);
const escape = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function descendants(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.childNodes || []).flatMap(child => descendants(child, predicate))];
}
function replace(html, predicate, render) {
  return descendants(parse(html, { sourceCodeLocationInfo: true }), predicate)
    .filter(node => node.sourceCodeLocation)
    .sort((a, b) => b.sourceCodeLocation.startOffset - a.sourceCodeLocation.startOffset)
    .reduce((result, node) => {
      const { startOffset: start, endOffset: end } = node.sourceCodeLocation;
      return result.slice(0, start) + render(result.slice(start, end), node) + result.slice(end);
    }, html);
}
const inner = content => (source, node) => {
  const loc = node.sourceCodeLocation;
  return source.slice(0, loc.startTag.endOffset - loc.startOffset) + content + source.slice(loc.endTag.startOffset - loc.startOffset);
};
function extract(html, predicate) {
  const node = descendants(parse(html, { sourceCodeLocationInfo: true }), predicate)[0];
  if (!node?.sourceCodeLocation) throw new Error("Service-city template block missing");
  return html.slice(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset);
}
function serviceCityLastmod(deployment = release) {
  const date = deployment.deployedAt;
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
    ? Object.keys(pages).map(route => [route, date]) : [];
}
function serviceCityRoutes(routes) {
  return Object.entries(pages).map(([route, page]) => [route, routes[`/${page.citySlug}`]]);
}

function addServiceCityLinks(html, route) {
  const city = cities[route.slice(1)];
  if (city && !html.includes('data-service-city-card="')) {
    return replace(html, node => node.tagName === "a" && cls(node, "sg-service-card") && Object.values(services).some(service => service.parent === attr(node, "href")), (source, node) => {
      const serviceSlug = Object.keys(services).find(slug => services[slug].parent === attr(node, "href"));
      return source.replace(/ href="[^"]+"/, ` href="${route}/${serviceSlug}" data-service-city-card="${serviceSlug}"`);
    });
  }
  const serviceSlug = Object.keys(services).find(slug => services[slug].parent === route);
  if (!serviceSlug || html.includes('data-service-city-popular="')) return html;
  const links = Object.entries(cities).map(([slug, item]) => `<a href="/${slug}/${serviceSlug}" style="color:inherit">${item.name}</a>`).join(" · ");
  return html.replace(/<\/main>/i, `<p data-service-city-popular="${serviceSlug}" style="max-width:1120px;margin:24px auto;padding:0 20px;text-align:center;line-height:1.7">Popular areas: ${links}</p></main>`);
}

function renderServiceCity(html, route) {
  const page = pages[route];
  if (!page) return html;
  const { city, service } = page;
  const title = `${service.name} in ${city.name}, IL`;
  const site = "https://shynlicleaningservice.com";
  const canonical = site + route;
  let hero = extract(html, node => cls(node, "sg-hero"));
  hero = replace(hero, node => node.tagName === "h1", inner(`${escape(service.name)} in <span class="sg-accent">${city.name}</span>, IL`));
  hero = replace(hero, node => cls(node, "sg-hero__lead"), inner(escape(page.intro)));
  hero = replace(hero, node => cls(node, "sg-hero__trust"), inner("One-time service, with the scope confirmed before your visit"));
  hero = replace(hero, node => cls(node, "sg-info-tile"), (source, node) => replace(source, item => item.tagName === "p", inner(escape(cls(node, "sg-info-tile--muted") ? page.tile : page.statement))));
  hero = replace(hero, node => node.tagName === "p" && cls(node.parentNode, "sg-hero-panel__statement"), inner("Check the room checklist and request any additional interior work before the appointment."));
  const section = (heading, content, extra = "") => `<section class="sg-section service-city-section ${extra}"><div class="sg-container"><h2 class="sg-section-title">${escape(heading)}</h2>${content}</div></section>`;
  const paragraph = text => `<p class="sg-section-lead">${escape(text)}</p>`;
  const rooms = page.rooms.map(([name, text]) => `<div><h3>${escape(name)}</h3><p>${escape(text)}</p></div>`).join("");
  const faq = [...page.faq, ["Do you bring cleaning supplies?", "Yes. We bring all cleaning supplies and equipment for the visit."]];
  const faqItem = ([question, answer]) => `<details class="sg-faq__item"><summary><span class="sg-faq__question">${escape(question)}</span></summary><p class="sg-faq__answer">${escape(answer)}</p></details>`;
  const faqHtml = `<section class="sg-section sg-faq"><div class="sg-container"><h2 class="sg-section-title">${escape(service.name)} questions</h2><div class="sg-faq__panel"><div class="sg-faq__column">${faq.slice(0, 3).map(faqItem).join("")}</div><div class="sg-faq__column">${faq.slice(3).map(faqItem).join("")}</div></div></div></section>`;
  let quote = extract(html, node => cls(node, "sg-quote"));
  quote = replace(quote, node => node.tagName === "h2", inner(`Request a ${page.serviceSlug === "deep-cleaning" ? "Deep" : "Move"} Cleaning Quote`));
  const reviews = extract(html, node => ["naperville-reviews", "city-editorial-reviews"].includes(attr(node, "id")));
  const body = [hero,
    section(page.whoTitle, paragraph(page.who)),
    section("What is included", `<div class="service-city-rooms">${rooms}</div>${paragraph(page.scope)}`),
    section(page.preparationTitle, paragraph(page.preparation)),
    section("Price the work you want done", `${paragraph(page.pricing)}<div class="sg-pricing__buttons"><a class="sg-button" href="/pricing">See Pricing Options</a><a class="sg-button sg-button--outline" href="/quote">Get a Quote</a></div>`),
    reviews, faqHtml, quote,
    `<nav class="service-city-back sg-container" aria-label="Related cleaning pages"><a class="sg-button" href="/${page.citySlug}">All cleaning services in ${city.name}</a><a class="sg-button sg-button--outline" href="${service.parent}">Full ${escape(service.name)} checklist</a></nav>`,
  ].join("\n");
  let result = replace(html, node => node.tagName === "main", () => `<main data-service-city="${route}">${body}</main>`);
  result = replace(result, node => node.tagName === "title", inner(`${escape(title)} | Shynli Cleaning`));
  result = replace(result, node => node.tagName === "meta" && (attr(node, "name") === "description" || ["og:title", "og:description", "og:url", "twitter:title", "twitter:description", "twitter:url"].includes(attr(node, "property") || attr(node, "name"))), (source, node) => {
    const key = attr(node, "property") || attr(node, "name");
    const content = key.endsWith("url") ? canonical : key.endsWith("title") ? `${title} | Shynli Cleaning` : page.intro;
    return source.replace(/content="[^"]*"/, `content="${escape(content)}"`);
  });
  result = replace(result, node => node.tagName === "link" && attr(node, "rel") === "canonical", () => `<link rel="canonical" href="${canonical}">`);
  result = replace(result, node => node.tagName === "script" && attr(node, "type") === "application/ld+json", () => "");
  const serviceSchema = {
    "@context": "https://schema.org", "@type": "Service", "@id": `${canonical}#service`, name: title, serviceType: service.name,
    url: canonical, description: page.intro, provider: { "@id": `${site}/#localbusiness` },
    areaServed: { "@type": "City", name: `${city.name}, IL` },
    ...(page.citySlug === "aurora" ? { sameAs: ["https://www.google.com/maps?cid=5408416184318024401"] } : {}),
  };
  const schemas = [serviceSchema, {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: site + "/" },
      { "@type": "ListItem", position: 2, name: city.name, item: `${site}/${page.citySlug}` },
      { "@type": "ListItem", position: 3, name: service.name, item: canonical },
    ],
  }, { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })) }];
  const schemaHtml = schemas.map(schema => `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`).join("");
  // The city template's existing base keeps relative assets rooted on nested URLs.
  if (!descendants(parse(result), node => node.tagName === "base").length) result = result.replace(/<head([^>]*)>/i, '<head$1><base href="/">');
  result = result.replace(/<\/head>/i, `${schemaHtml}<style id="service-city-fit">
main[data-service-city] .sg-hero{padding-bottom:28px;}
main[data-service-city] .service-city-section{padding:32px 0;}
main[data-service-city] .service-city-section .sg-container{max-width:1120px;}
main[data-service-city] .service-city-section .sg-section-lead{max-width:900px;margin:16px 0 0;}
main[data-service-city] .service-city-rooms{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px;margin:24px 0;}
main[data-service-city] .service-city-rooms h3{font-family:"Playfair Display",Georgia,serif;font-size:26px;font-weight:400;line-height:1.2;margin:0 0 16px;}
main[data-service-city] .service-city-rooms p{font-size:16px;line-height:1.65;margin:0;color:var(--sg-muted);}
main[data-service-city] .sg-pricing__buttons{margin-top:24px;}
main[data-service-city] .sg-faq{padding:20px 0 28px;}
main[data-service-city] .sg-faq .sg-section-title{margin-bottom:28px;}
main[data-service-city] .sg-faq__panel{padding:32px 36px;}
main[data-service-city] .sg-quote{padding:32px 0 24px;}
main[data-service-city] .sg-quote .sg-section-title{margin-bottom:28px;}
main[data-service-city] .service-city-back{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;max-width:980px;padding-top:20px;padding-bottom:32px;}
main[data-service-city] .service-city-back .sg-button{width:100%;height:100%;min-height:64px;padding:16px 24px;box-sizing:border-box;line-height:1.45;text-align:center;white-space:normal;}
main[data-service-city] .service-city-back .sg-button:focus-visible{outline:2px solid var(--sg-rose-dark);outline-offset:4px;}
@media(max-width:767px){main[data-service-city] .sg-hero{padding-bottom:0;}main[data-service-city] .service-city-section{padding:22px 0;}main[data-service-city] .service-city-rooms{grid-template-columns:1fr;gap:24px;margin:20px 0;}main[data-service-city] .sg-faq{padding:20px 0 22px;}main[data-service-city] .sg-faq .sg-section-title{margin-bottom:20px;}main[data-service-city] .sg-faq__panel{padding:24px 18px;}main[data-service-city] .sg-quote{padding:22px 0 20px;}main[data-service-city] .sg-quote .sg-section-title{margin-bottom:24px;}main[data-service-city] .service-city-back{grid-template-columns:1fr;gap:12px;padding-top:16px;padding-bottom:28px;}main[data-service-city] .sg-hero h1{font-size:36px;line-height:1.15;}main[data-service-city] .sg-section-title{font-size:30px;}}
</style></head>`);
  return result;
}

module.exports = { addServiceCityLinks, renderServiceCity, serviceCityLastmod, serviceCityRoutes };
