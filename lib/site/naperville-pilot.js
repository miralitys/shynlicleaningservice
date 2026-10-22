"use strict";

const { parse } = require("parse5");
const evidence = require("./naperville-reviews.json");
const release = require("./naperville-release.json");
const FAQ = Object.freeze([
  ["Do you clean condos and apartments in Naperville?", "Yes. We clean condos and apartments as well as houses."],
  ["Which ZIP codes in Naperville do you serve?", "We serve 60540, 60563, 60564, and 60565."],
  ["Can you do a deep cleaning before or after a move?", "Yes. Deep cleaning and move-in/move-out cleaning are among our most booked services in Naperville, and both are available before or after a move."],
  ["Do you bring supplies?", "We bring all cleaning supplies and equipment."],
  ["Where will the cleaners park?", "Before the first cleaning, we ask where our cleaners can park."],
  ["Do you offer one-time cleaning?", "Yes. You can book a one-time clean without starting a recurring plan."],
  ["Can I book recurring cleaning?", "Yes. You can book weekly, bi-weekly, or monthly recurring cleaning."],
]);
const INTRO = "Shynli Cleaning serves Naperville apartments, condos, and five-bedroom houses with deep cleaning, regular visits, and move-in or move-out appointments in DuPage and Will counties.";
const HOMES = "We clean a range of Naperville homes, from condos and apartments to five-bedroom houses. The typical home we clean here has three bedrooms and 2.5 bathrooms; that is a typical appointment, not a description of every home. Our Naperville ZIP codes are 60540, 60563, 60564, and 60565. We serve Naperville and nearby communities in DuPage and Will counties.";
const WATER = "Naperville receives Lake Michigan water through the DuPage Water Commission. For your cleaning visit, we bring all the cleaning supplies and equipment, so those are not items you need to provide. Before the first appointment, we also ask where the cleaners can park at your condo, apartment, or house.";
const PRICING = 'See our <a href="/pricing">pricing page</a> for cleaning options and prices. For deep cleaning, regular visits, or a move-in/move-out appointment in Naperville, use that same page rather than a separate city price list. Continue to the quote form to get started.';
const SERVICES = [
  ["deep-cleaning", "Deep Cleaning", "Deep cleaning is the most frequently booked service in Naperville, ahead of regular cleaning. It is also an option before or after a move."],
  ["regular-cleaning", "Regular House Cleaning", "Regular cleaning comes next in Naperville's booking order, after deep cleaning and before move-in/move-out. Choose this service when you are looking for regular visits rather than a cleaning around a move."],
  ["move-in-move-out-cleaning", "Move-In / Move-Out Cleaning", "Move-in/move-out is the third most booked service here. If your cleaning is connected with moving, both this service and deep cleaning are available before or after the move."],
];

const escape = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const hasClass = (node, name) => attribute(node, "class")?.split(/\s+/).includes(name);
const byClass = name => node => hasClass(node, name);
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.childNodes || []) { const match = find(child, predicate); if (match) return match; }
  return null;
}
function replaceNodes(html, replacements) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const patches = replacements.map(([predicate, render]) => {
    const node = find(document, predicate);
    if (!node?.sourceCodeLocation) throw new Error("Naperville pilot template node not found");
    const { startOffset: start, endOffset: end } = node.sourceCodeLocation;
    return { start, end, html: render(html.slice(start, end), node) };
  });
  return patches.sort((a, b) => b.start - a.start).reduce((output, patch) => output.slice(0, patch.start) + patch.html + output.slice(patch.end), html);
}
const inner = content => (source, node) => {
  const location = node.sourceCodeLocation;
  return source.slice(0, location.startTag.endOffset - location.startOffset) + content + source.slice(location.endTag.startOffset - location.startOffset);
};

function renderReviews(template) {
  if (!template) return "";
  template = template.replace("<style>", '<style id="naperville-review-style">');
  const card = review => `<article class="clients-say-home__card" data-naperville-review="${review.reviewId}"><div class="clients-say-home__stars" aria-label="5 out of 5 stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div><p class="clients-say-home__text">${review.quote ? escape(review.quote) : "5-star Google rating. No written comment."}</p><div class="clients-say-home__person"><div class="clients-say-home__avatar" aria-hidden="true">${escape(review.name[0])}</div><div><a class="clients-say-home__name" href="${evidence.source}" rel="noopener">${escape(review.name)}</a><div class="clients-say-home__meta">Google ${review.quote ? "review excerpt" : "rating only"}</div></div></div></article>`;
  const group = position => node => hasClass(node, "clients-say-home__group") && hasClass(node.parentNode, `clients-say-home__track--${position}`);
  return replaceNodes(template, [
    [group("top"), inner(evidence.reviews.slice(0, 12).map(card).join(""))],
    [group("bottom"), inner(evidence.reviews.slice(12).map(card).join(""))],
  ]);
}

function applyNapervillePilot(html, route, reviewTemplate = "") {
  if (route !== "/naperville" || html.includes('data-naperville-pilot="true"')) return html;
  const document = parse(html, { sourceCodeLocationInfo: true });
  const main = find(document, node => node.tagName === "main");
  if (!main || !find(main, byClass("sg-hero"))) return html;
  const original = node => html.slice(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset);
  const section = name => find(main, byClass(name));
  if (!["sg-areas", "sg-quote", "sg-recurring", "sg-team", "sg-pricing", "sg-faq"].every(section)) return html;

  const hero = replaceNodes(original(section("sg-hero")), [
    [byClass("sg-hero__lead"), inner(INTRO)],
    [byClass("sg-hero__trust"), inner("Serving Naperville and nearby communities in DuPage and Will counties")],
    [byClass("sg-review-stack"), source => source.replace('aria-label="300 plus customer reviews"', 'aria-label="58 Google reviews"').replace('>300+</div>', '>58</div>').replace('>Customer Reviews</div>', '>Google reviews</div>')],
    [byClass("sg-rating"), source => source.replace('aria-label="5 out of 5 rating"', 'aria-label="5 out of 5 on Google"')],
    [byClass("sg-hero-panel__hint"), inner("Tell us about your Naperville home")],
    [node => node.tagName === "p" && hasClass(node.parentNode, "sg-info-tile--muted"), inner("From a condo or apartment to a five-bedroom house, we clean homes across Naperville.")],
    [node => node.tagName === "p" && hasClass(node.parentNode, "sg-info-tile") && !hasClass(node.parentNode, "sg-info-tile--muted"), inner("Deep cleaning is our most booked service in Naperville, followed by regular cleaning and move-in/move-out appointments. A typical home we clean here has three bedrooms and 2.5 bathrooms.")],
    [node => node.tagName === "p" && hasClass(node.parentNode, "sg-hero-panel__statement"), inner("We bring all cleaning supplies and equipment. Before your first cleaning, we ask where our cleaners can park.")],
  ]);
  const serviceSection = section("sg-section--services");
  const serviceCards = find(serviceSection, byClass("sg-services__grid")).childNodes.filter(node => node.tagName === "a");
  const cards = SERVICES.map(([slug, title, copy], index) => replaceNodes(original(serviceCards.find(node => attribute(node, "href") === `/services/${slug}`)), [
    [byClass("sg-service-card__number"), inner(`0${index + 1}`)],
    [node => node.tagName === "h3", inner(escape(title))],
    [node => node.tagName === "p", inner(copy)],
  ])).join("\n");
  const services = replaceNodes(original(serviceSection), [
    [byClass("sg-services__intro"), inner("Naperville books deep cleaning most often, followed by regular cleaning and move-in/move-out service. Choose the option that matches the visit you want to arrange.")],
    [byClass("sg-services__grid"), inner(cards)],
    [node => node.tagName === "span" && hasClass(node.parentNode, "sg-services__secondary"), inner("Explore other service pages:")],
  ]);
  const homes = replaceNodes(original(section("sg-recurring")), [
    [node => node.tagName === "h2", inner('Homes We Clean in <span class="sg-accent">Naperville</span>')],
    [byClass("sg-section-lead"), inner(HOMES)],
    [byClass("sg-benefits"), source => replaceNodes(source, [[node => node.tagName === "span" && node.parentNode?.tagName === "li" && !hasClass(node, "sg-benefit__number"), inner("Condos, apartments, and houses")]]).replace("reduce long-term costs", "Typical home: 3 bedrooms, 2.5 bathrooms").replace("avoid frequent deep cleanings", "Deep, regular, and move-related cleaning")],
    [byClass("sg-note"), inner("We serve Naperville and nearby communities in DuPage and Will counties.")],
  ]);
  const pricing = replaceNodes(original(section("sg-pricing")), [
    [byClass("sg-section-lead"), inner(PRICING)],
    [byClass("sg-pricing__grid"), () => ""],
    [byClass("sg-pricing__statement"), () => ""],
    [byClass("sg-pricing__fineprint"), () => ""],
  ]);
  const team = replaceNodes(original(section("sg-team")), [
    [node => node.tagName === "h2", inner('What Matters for Cleaning in <span class="sg-accent">Naperville</span>')],
    [byClass("sg-team__list"), source => replaceNodes(source, [[node => node.tagName === "span" && hasClass(node.parentNode, "sg-team__item") && !hasClass(node, "sg-team__dot"), inner("All cleaning supplies and equipment")]]).replace("Carefully selected cleaners", "Parking discussed before your first visit").replace("Flexible weekly, bi-weekly, or one-time service", "DuPage and Will counties")],
    [byClass("sg-note"), inner(WATER)],
  ]);
  const faqItem = ([question, answer]) => `<details class="sg-faq__item"><summary><span class="sg-faq__question">${escape(question)}</span></summary><p class="sg-faq__answer">${escape(answer)}</p></details>`;
  const faqHtml = replaceNodes(original(section("sg-faq")), [[byClass("sg-faq__panel"), inner(`<div class="sg-faq__column">${FAQ.slice(0, 4).map(faqItem).join("")}</div><div class="sg-faq__column">${FAQ.slice(4).map(faqItem).join("")}</div>`)]]);
  const body = [hero, services, homes, renderReviews(reviewTemplate), pricing, team, original(section("sg-areas")), faqHtml, original(section("sg-quote"))].join("\n");
  const location = main.sourceCodeLocation;
  let output = html.slice(0, location.startOffset) + '<main data-naperville-pilot="true">' + body + html.slice(location.endTag.startOffset);
  const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })) };
  if (find(document, node => node.tagName === "script" && attribute(node, "id") === "schema-faq")) {
    output = replaceNodes(output, [[node => node.tagName === "script" && attribute(node, "id") === "schema-faq", () => `<script type="application/ld+json" id="schema-faq">${JSON.stringify(faqSchema).replace(/</g, "\\u003c")}</script>`]]);
  }
  return output.replace(/<\/head>/i, `<style id="naperville-copy-fit">
main[data-naperville-pilot] .sg-service-card{height:auto;min-height:288px;}
main[data-naperville-pilot] .sg-pricing__header{top:auto;display:block;width:min(760px,100%);margin:0 auto;text-align:center;}
main[data-naperville-pilot] .sg-pricing__header .sg-section-lead{width:100%;max-width:100%;margin:16px auto 0;text-align:center;}
main[data-naperville-pilot] .sg-pricing__buttons{margin-top:28px;}
main[data-naperville-pilot] .sg-team__list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px;height:auto;margin:36px auto 48px;}
main[data-naperville-pilot] .sg-team__item:nth-child(n){position:static;inset:auto;width:auto;min-width:0;align-items:flex-start;line-height:1.3;}
main[data-naperville-pilot] .sg-team__item>span:not(.sg-team__dot){min-width:0;overflow-wrap:break-word;}
#naperville-reviews .clients-say-home__track{animation:none;transform:none;will-change:auto;}
#naperville-reviews .clients-say-home__rail{overflow-x:auto;scrollbar-width:thin;}
#naperville-reviews .clients-say-home__stack::before,#naperville-reviews .clients-say-home__stack::after{display:none;}
@media(max-width:959px){main[data-naperville-pilot] .sg-team__list{grid-template-columns:1fr;width:min(440px,100%);gap:24px;}}
@media(max-width:767px){main[data-naperville-pilot] .sg-service-card{height:auto;min-height:203px;}main[data-naperville-pilot] .sg-pricing__buttons{margin-top:24px;}}
</style></head>`);
}

function napervilleLastmod(deployment = release) {
  const value = deployment.deployedAt;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value ? [["/naperville", value]] : [];
}

module.exports = { applyNapervillePilot, napervilleLastmod, FAQ };
