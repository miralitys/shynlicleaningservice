"use strict";

const { parse } = require("parse5");
const { cities, sharedFaq } = require("./city-editorial-data");
const evidence = require("./naperville-reviews.json");
const release = require("./city-editorial-release.json");
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const cls = (node, name) => attr(node, "class")?.split(/\s+/).includes(name);
const byClass = name => node => cls(node, name);
const escape = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.childNodes || []) { const match = find(child, predicate); if (match) return match; }
  return null;
}
function replaceNodes(html, replacements) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const patches = replacements.map(([predicate, render]) => {
    const node = find(document, predicate);
    if (!node?.sourceCodeLocation) throw new Error("City editorial template node not found");
    const { startOffset: start, endOffset: end } = node.sourceCodeLocation;
    return { start, end, html: render(html.slice(start, end), node) };
  });
  return patches.sort((a, b) => b.start - a.start).reduce((output, patch) => output.slice(0, patch.start) + patch.html + output.slice(patch.end), html);
}
const inner = content => (source, node) => {
  const location = node.sourceCodeLocation;
  return source.slice(0, location.startTag.endOffset - location.startOffset) + content + source.slice(location.endTag.startOffset - location.startOffset);
};
const additionalReviews = [
  { name: "Mona A.", quote: "Great experience! They are the best!", reviewId: "owner-brief-mona-a" },
  { name: "Siddique A.", quote: "Great people great service... definitely recommend them", reviewId: "owner-brief-siddique-a" },
];
function cityReviews(city) {
  const all = [...evidence.reviews.filter(review => review.quote.trim()), ...additionalReviews];
  return [...city.reviewsFirst.map(name => all.find(review => review.name === name)), ...all.filter(review => !city.reviewsFirst.includes(review.name))];
}
function renderReviews(template, city, reviewItems) {
  if (!template) throw new Error("City editorial requires the existing review component");
  const reviews = reviewItems || cityReviews(city);
  const split = reviewItems ? 12 : 13;
  const card = review => `<article class="clients-say-home__card" data-city-review="${review.reviewId}"><div class="clients-say-home__stars" aria-label="5 out of 5 stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div><p class="clients-say-home__text">${escape(review.quote)}</p><div class="clients-say-home__person"><div class="clients-say-home__avatar" aria-hidden="true">${escape(review.name[0])}</div><div><a class="clients-say-home__name" href="${evidence.source}" rel="noopener">${escape(review.name)}</a><div class="clients-say-home__meta">Google review excerpt</div></div></div></article>`;
  const group = position => node => cls(node, "clients-say-home__group") && cls(node.parentNode, `clients-say-home__track--${position}`);
  return replaceNodes(template, [
    [group("top"), inner(reviews.slice(0, split).map(card).join(""))],
    [group("bottom"), inner(reviews.slice(split).map(card).join(""))],
  ]);
}
const labels = { "regular-cleaning": "Regular House Cleaning", "deep-cleaning": "Deep Cleaning", "move-in-move-out-cleaning": "Move-In / Move-Out Cleaning" };
function cityEditorialLastmod(deployment = release) {
  const date = deployment.deployedAt;
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
    ? Object.keys(cities).map(slug => [`/${slug}`, date]) : [];
}
function applyCityEditorial(html, route, reviewTemplate = "", options) {
  const slug = route.slice(1);
  const routeCities = options?.cities || cities;
  if (!Object.hasOwn(routeCities, slug) || html.includes('data-city-editorial="true"')) return html;
  const city = routeCities[slug];
  const document = parse(html, { sourceCodeLocationInfo: true });
  const main = find(document, node => node.tagName === "main");
  const section = name => find(main, byClass(name));
  if (!main || !["sg-hero", "sg-section--services", "sg-areas", "sg-quote", "sg-recurring", "sg-team", "sg-pricing", "sg-faq"].every(section)) return html;
  const original = node => html.slice(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset);
  const hero = replaceNodes(original(section("sg-hero")), [
    [byClass("sg-hero__lead"), inner(escape(city.intro))],
    [byClass("sg-hero__trust"), inner(escape(city.trust || (city.counties ? `Serving ${city.name} in ${city.counties}` : `Cleaning appointments in ${city.name}`)))],
    [byClass("sg-review-stack"), source => source.replace('aria-label="300 plus customer reviews"', 'aria-label="58 Google reviews"').replace('>300+</div>', '>58</div>').replace('>Customer Reviews</div>', '>Google reviews</div>')],
    [byClass("sg-rating"), source => source.replace('aria-label="5 out of 5 rating"', 'aria-label="5 out of 5 on Google"')],
    [byClass("sg-hero-panel__hint"), inner(`Tell us about your ${city.name} home`)],
    [node => node.tagName === "p" && cls(node.parentNode, "sg-info-tile--muted"), inner(escape(city.tiles[0]))],
    [node => node.tagName === "p" && cls(node.parentNode, "sg-info-tile") && !cls(node.parentNode, "sg-info-tile--muted"), inner(escape(city.tiles[1]))],
    [node => node.tagName === "p" && cls(node.parentNode, "sg-hero-panel__statement"), inner(escape(city.statement))],
  ]);
  const serviceSection = section("sg-section--services");
  const serviceCards = find(serviceSection, byClass("sg-services__grid")).childNodes.filter(node => node.tagName === "a");
  const cards = city.order.map((service, index) => replaceNodes(original(serviceCards.find(node => attr(node, "href") === `/services/${service}`)), [
    [byClass("sg-service-card__number"), inner(`0${index + 1}`)],
    [node => node.tagName === "h3", inner(labels[service])],
    [node => node.tagName === "p", inner(escape(city.cards[service]))],
  ])).join("\n");
  const services = replaceNodes(original(serviceSection), [
    [byClass("sg-services__intro"), inner(escape(city.servicesIntro))],
    [byClass("sg-services__grid"), inner(cards)],
    [node => node.tagName === "span" && cls(node.parentNode, "sg-services__secondary"), inner("Explore other service pages:")],
  ]);
  const homes = replaceNodes(original(section("sg-recurring")), [
    [node => node.tagName === "h2", inner(`Homes We Clean in <span class="sg-accent">${city.name}</span>`)],
    [byClass("sg-section-lead"), inner(escape(city.homes))],
    [byClass("sg-benefits"), inner(city.benefits.map((text, index) => `<li class="sg-benefit sg-reveal"><span class="sg-benefit__number">0${index + 1}</span><span>${escape(text)}</span></li>`).join("\n"))],
    [byClass("sg-note"), inner(escape(city.homesNote))],
  ]);
  const pricing = replaceNodes(original(section("sg-pricing")), [
    [byClass("sg-section-lead"), inner(escape(city.pricing).replace("pricing page", '<a href="/pricing">pricing page</a>'))],
    [byClass("sg-pricing__grid"), () => ""], [byClass("sg-pricing__statement"), () => ""], [byClass("sg-pricing__fineprint"), () => ""],
  ]);
  const team = replaceNodes(original(section("sg-team")), [
    [node => node.tagName === "h2", inner(`What Matters for Cleaning in <span class="sg-accent">${city.name}</span>`)],
    [byClass("sg-team__list"), source => source.replace("Locally scheduled cleaning appointments", "Prepare the rooms").replace("Carefully selected cleaners", "Arrange entry in advance").replace("Flexible weekly, bi-weekly, or one-time service", "Confirm the visit length")],
    [byClass("sg-note"), inner(escape(city.preparation))],
  ]);
  const faq = [...city.faq, ...sharedFaq];
  const faqItem = ([question, answer]) => `<details class="sg-faq__item"><summary><span class="sg-faq__question">${escape(question)}</span></summary><p class="sg-faq__answer">${escape(answer)}</p></details>`;
  const faqHtml = replaceNodes(original(section("sg-faq")), [[byClass("sg-faq__panel"), inner(`<div class="sg-faq__column">${faq.slice(0, 4).map(faqItem).join("")}</div><div class="sg-faq__column">${faq.slice(4).map(faqItem).join("")}</div>`)]]);
  const body = [hero, services, homes, renderReviews(reviewTemplate, city, options?.reviews), pricing, team, original(section("sg-areas")), faqHtml, original(section("sg-quote"))].join("\n");
  const location = main.sourceCodeLocation;
  let output = html.slice(0, location.startOffset) + '<main data-city-editorial="true">' + body + html.slice(location.endTag.startOffset);
  const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })) };
  const faqScript = `<script type="application/ld+json" id="schema-faq">${JSON.stringify(faqSchema).replace(/</g, "\\u003c")}</script>`;
  output = find(document, node => node.tagName === "script" && attr(node, "id") === "schema-faq")
    ? replaceNodes(output, [[node => node.tagName === "script" && attr(node, "id") === "schema-faq", () => faqScript]])
    : output.replace(/<\/head>/i, faqScript + "</head>");
  const publishedDate = options ? options.publishedDate : cityEditorialLastmod().find(([path]) => path === route)?.[1];
  if (publishedDate) {
    // Keep existing schema nodes; update modification dates only when a release date is recorded.
    const scripts = [];
    const collect = node => {
      if (node.tagName === "script" && attr(node, "type") === "application/ld+json" && /"dateModified"\s*:/.test((node.childNodes || []).map(child => child.value || "").join(""))) scripts.push(attr(node, "id"));
      for (const child of node.childNodes || []) collect(child);
    };
    collect(parse(output));
    const updateDates = value => {
      if (!value || typeof value !== "object") return;
      if (Object.hasOwn(value, "dateModified")) value.dateModified = publishedDate;
      for (const child of Object.values(value)) updateDates(child);
    };
    for (const id of scripts) output = replaceNodes(output, [[node => node.tagName === "script" && attr(node, "id") === id, (source, node) => {
      const schema = JSON.parse((node.childNodes || []).map(child => child.value || "").join(""));
      updateDates(schema);
      return inner(JSON.stringify(schema).replace(/</g, "\\u003c"))(source, node);
    }]]);
  }
  return output.replace(/<\/head>/i, `<style id="city-editorial-fit">
main[data-city-editorial] .sg-service-card{height:auto;min-height:288px;}
main[data-city-editorial] .sg-pricing__header{top:auto;display:block;width:min(760px,100%);margin:0 auto;text-align:center;}
main[data-city-editorial] .sg-pricing__header .sg-section-lead{width:100%;max-width:100%;margin:16px auto 0;text-align:center;}
main[data-city-editorial] .sg-pricing__buttons{margin-top:28px;}
main[data-city-editorial] .sg-team__list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px;height:auto;margin:36px auto 48px;}
main[data-city-editorial] .sg-team__item:nth-child(n){position:static;inset:auto;width:auto;min-width:0;align-items:flex-start;line-height:1.3;}
main[data-city-editorial] .sg-team__item>span:not(.sg-team__dot){min-width:0;overflow-wrap:break-word;}
#city-editorial-reviews .clients-say-home__track{animation:none;transform:none;will-change:auto;}
#city-editorial-reviews .clients-say-home__rail{overflow-x:auto;scrollbar-width:thin;}
#city-editorial-reviews .clients-say-home__stack::before,#city-editorial-reviews .clients-say-home__stack::after{display:none;}
@media(max-width:959px){main[data-city-editorial] .sg-team__list{grid-template-columns:1fr;width:min(440px,100%);gap:24px;}}
@media(max-width:767px){main[data-city-editorial] .sg-service-card{height:auto;min-height:203px;}main[data-city-editorial] .sg-pricing__buttons{margin-top:24px;}}
</style></head>`);
}

module.exports = { applyCityEditorial, cityEditorialLastmod, cityReviews };
