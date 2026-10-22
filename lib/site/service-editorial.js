"use strict";

const { parse } = require("parse5");
const { pages, shared } = require("./service-editorial-data");
const { CITY_PAGES } = require("./structured-data");
const { applyImageAlts } = require("./image-alts");
const evidence = require("./naperville-reviews.json");
const release = require("./service-editorial-release.json");
const homeTemplate = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../page108488156.html"), "utf8");

const attr = (node, key) => node.attrs?.find(item => item.name === key)?.value;
const cls = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);
const escape = text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function nodes(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.childNodes || []).flatMap(child => nodes(child, predicate))];
}
function replace(html, predicate, render) {
  return nodes(parse(html, { sourceCodeLocationInfo: true }), predicate)
    .sort((a, b) => b.sourceCodeLocation.startOffset - a.sourceCodeLocation.startOffset)
    .reduce((output, node) => {
      const loc = node.sourceCodeLocation;
      return output.slice(0, loc.startOffset) + render(html.slice(loc.startOffset, loc.endOffset), node) + output.slice(loc.endOffset);
    }, html);
}
const inner = value => (source, node) => {
  const loc = node.sourceCodeLocation;
  return source.slice(0, loc.startTag.endOffset - loc.startOffset) + value + source.slice(loc.endTag.startOffset - loc.startOffset);
};
function extract(html, predicate) {
  const node = nodes(parse(html, { sourceCodeLocationInfo: true }), predicate)[0];
  if (!node) throw new Error("Service editorial template block missing");
  const loc = node.sourceCodeLocation;
  return html.slice(loc.startOffset, loc.endOffset);
}
function serviceEditorialLastmod(deployment = release) {
  const date = deployment.deployedAt;
  return /^\d{4}-\d{2}-\d{2}$/.test(date || "") && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
    ? Object.keys(pages).map(route => [route, date]) : [];
}

function renderReviews(template) {
  const names = ["Amy K.", "Erika B.", "Mariana S.", "Judy V.", "Suzana D.", "Suganya S."];
  const reviews = names.map(name => evidence.reviews.find(review => review.name === name && review.quote.trim()));
  if (reviews.some(review => !review)) throw new Error("Verified written service review missing");
  const card = review => `<article class="clients-say-home__card" data-service-review="${escape(review.reviewId)}"><div class="clients-say-home__stars" aria-label="5 out of 5 stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div><p class="clients-say-home__text">${escape(review.quote)}</p><div class="clients-say-home__person"><div class="clients-say-home__avatar" aria-hidden="true">${escape(review.name[0])}</div><div><a class="clients-say-home__name" href="${evidence.source}" rel="noopener">${escape(review.name)}</a><div class="clients-say-home__meta">Google review excerpt</div></div></div></article>`;
  return replace(template, node => cls(node, "clients-say-home__group"), (source, node) => {
    const start = cls(node.parentNode, "clients-say-home__track--top") ? 0 : 3;
    const cards = reviews.slice(start, start + 3).map(card).join("");
    const copy = cards.replace(/ data-service-review="[^"]*"/g, "").replace(/<a /g, '<a tabindex="-1" ');
    const other = reviews.slice(start === 0 ? 3 : 0, start === 0 ? 6 : 3).map(card).join("").replace(/ data-service-review="[^"]*"/g, "").replace(/<a /g, '<a tabindex="-1" ');
    return `<div class="clients-say-home__group">${cards}</div><div class="clients-say-home__group" aria-hidden="true" inert>${other}${copy}</div>`;
  });
}

function applyServiceEditorial(html, route, reviewsTemplate, quoteRuntime = "") {
  const page = pages[route];
  if (!page || html.includes('data-service-editorial="')) return html;
  const commercial = route === "/services/commercial-cleaning";
  const post = route === "/services/post-construction-cleaning";
  let hero = extract(html, node => node.tagName === "section" && cls(node, commercial ? "hero-section" : "hero"));
  hero = replace(hero, node => node.tagName === "h1", inner(escape(`${page.name} Services`)));
  hero = replace(hero, node => node.tagName === "p" && (cls(node, "hero__lead") || cls(node.parentNode, "hero-copy")), inner(escape(page.intro)));
  hero = replace(hero, node => node.tagName === "a" && attr(node, "href") === "/quote", inner("Request a Quote"));
  hero = replace(hero, node => cls(node, "hero__hint") || node.tagName === "span" && cls(node.parentNode, "quote-cluster"), inner("Tell us about your space"));
  if (post) hero = replace(hero, node => node.tagName === "img" && cls(node.parentNode, "hero__media"), () => '<img src="/images/shynli-service-post-construction-cleaning.png" srcset="/images/shynli-service-post-construction-cleaning.w750.webp 750w" sizes="100vw" alt="Illustration of cleaners working in a home after construction" width="750" height="750">');
  const paragraph = text => `<p>${escape(text)}</p>`;
  const section = (heading, content, className = "") => `<section class="se-section ${className}"><div class="se-container"><h2>${escape(heading)}</h2>${content}</div></section>`;
  const intro = page.sections.map(item => section(item.title, item.paragraphs.map(paragraph).join(""))).join("");
  const roomImages = commercial ? [
    "/images/tild3238-6662-4337-a363-396238396235__shynli_cleaning_2_7.png",
    "/images/tild3639-3431-4737-b736-663238643665__shynli_cleaning_2_8.png",
    "/images/tild6164-3638-4561-a362-626530386230__shynli_cleaning_2_9.png",
    "/images/tild3131-6539-4639-b134-316165356365__shynli_cleaning_2_10.png",
  ] : ["/images/shynli-move-area-living-room.png", "/images/shynli-move-area-bedroom.png", "/images/shynli-move-area-bathroom.png", "/images/shynli-move-area-kitchen.png"];
  if (post) [roomImages[1], roomImages[3]] = [roomImages[3], roomImages[1]];
  const rooms = page.rooms.map(([name, items], index) => `<details class="se-room" open><summary><img src="${roomImages[index]}" alt="" width="64" height="64"><span>${escape(name)}</span></summary><ul>${items.map(item => `<li>${escape(item)}</li>`).join("")}</ul></details>`).join("");
  const checklist = section(`What's included in ${page.name}`, `<div class="se-rooms">${rooms}</div>${page.scope ? paragraph(page.scope) : ""}`);
  const benefitCopy = [
    ["Locally owned", "A residential and commercial cleaning company."],
    ["Local team", "Your visit is handled by our team, not contractors."],
    ["Professional supplies<br>and equipment", "We bring what is needed for the cleaning."],
    ["No deposit", "Payment is due after the cleaning."],
    ["Fully insured<br>up to <strong>$1 million</strong>", ""],
    ["Safe for families and pets", "Safer options on request. You may provide your own products."],
    ["Three reminders before each visit", "48 hours, 24 hours and 1 hour before the appointment."],
  ];
  let supplies = extract(homeTemplate, node => cls(node, "benefits"));
  let benefitIndex = 0;
  supplies = replace(supplies, node => node.tagName === "article", () => {
    const [heading, copy] = benefitCopy[6 - benefitIndex++];
    return `<article><h3>${heading}</h3>${copy ? paragraph(copy) : ""}</article>`;
  });
  supplies = replace(supplies, node => cls(node, "benefits-map-cta"), () => "");
  const extraText = post
    ? shared.extras.replace("inside the oven, fridge and cabinets;", "inside the oven and fridge; additional interior cabinet cleaning;").replace("interior window glass and tracks;", "full interior window glass washing;")
    : route === "/services/airbnb-cleaning" ? shared.extras.replace("interior window glass and tracks; ", "") : shared.extras;
  const extras = section(post ? "Extra work outside the construction scope" : "Additional services to discuss", paragraph(extraText) + '<p>See <a href="/pricing">add-on pricing</a> and ask the manager to include the extras you need in the quote.</p>');
  const exclusions = section("What we do not do", paragraph(shared.exclusions));
  const terms = section("Before and after the appointment", paragraph("If something is missed, contact us within 24 hours and we fix it.") + paragraph(shared.cancellation));
  const pricing = section("Get an individual quote", paragraph(page.quote) + '<p>Check our <a href="/service-areas">service areas</a> for coverage. Use the form below or <a href="/quote">continue to the quote form</a> to get started.</p>');
  let faq = extract(homeTemplate, node => cls(node, "faq"));
  faq = replace(faq, node => cls(node, "faq-grid"), inner(page.faq.map(([question, answer], index) => `<article class="faq-item"><button class="faq-question" type="button" aria-expanded="false" aria-controls="service-answer-${index}" data-service-faq-button><span class="faq-question-text">${escape(question)}</span><span class="faq-icon" aria-hidden="true"></span></button><div class="faq-answer" id="service-answer-${index}">${escape(answer)}</div></article>`).join("")));
  let form = extract(homeTemplate, node => cls(node, "lead"));
  form = replace(form, node => node.tagName === "h2", inner(escape(page.quoteTitle)));
  form = replace(form, node => node.tagName === "h3" && cls(node.parentNode, "lead-form"), inner(escape(page.formTitle)));
  form = replace(form, node => node.tagName === "p" && cls(node.parentNode, "lead-form") && !cls(node, "lead-form__terms"), inner("Tell the manager what you need cleaned."));
  form = replace(form, node => node.tagName === "h3" && cls(node.parentNode, "lead__copy"), inner("We answer calls and texts every day, 9 AM to 7 PM Central."));
  form = form.replace('class="lead-form" data-lead-form', 'class="lead-form" data-lead-form action="/quote" method="get"');
  const related = section("Compare related services", `<div class="se-actions">${page.related.map(([label, href]) => `<a class="button button--ghost" href="${href}">${escape(label)}</a>`).join("")}</div>`);
  const body = [hero, intro, checklist, supplies, extras, exclusions, terms, pricing, renderReviews(reviewsTemplate), faq, form, related].join("\n");
  let output = replace(html, node => node.tagName === "main", () => `<main id="main" data-service-editorial="${route}">${body}</main>`);
  if (quoteRuntime) output = output.includes('id="shynli-quote-start-widget-runtime"')
    ? output.replace(/<script id="shynli-quote-start-widget-runtime">[\s\S]*?<\/script>/, quoteRuntime)
    : output.replace(/<\/body>/i, quoteRuntime + "</body>");
  output = replace(output, node => node.tagName === "script" && attr(node, "type") === "application/ld+json", () => "");
  const site = "https://shynlicleaningservice.com", canonical = site + route;
  const schemas = [
    { "@context": "https://schema.org", "@type": "Service", "@id": `${canonical}#service`, name: page.name, serviceType: page.name, description: page.description, url: canonical, provider: { "@id": `${site}/#localbusiness` }, areaServed: CITY_PAGES.map(([, name]) => ({ "@type": "City", name: `${name}, IL` })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${site}/` },
      { "@type": "ListItem", position: 2, name: "Services", item: `${site}/#services-title` },
      { "@type": "ListItem", position: 3, name: page.name, item: canonical },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: page.faq.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })) },
  ];
  output = output.replace(/<\/body>/i, '<script src="/js/service-editorial.js?v=three-services-20261022" defer></script></body>');
  return applyImageAlts(output.replace(/<\/head>/i, `<link rel="stylesheet" href="/css/service-editorial-home.css?v=three-services-20261022"><link rel="stylesheet" href="/css/service-editorial.css?v=three-services-20261022">${schemas.map(value => `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`).join("")}</head>`), route);
}

module.exports = { applyServiceEditorial, serviceEditorialLastmod };
