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
const INTRO = "Choose a thorough first clean, help with everyday upkeep, or an appointment around moving day. Tell us what needs attention, and we will confirm the scope before your visit.";
const HOMES = "We clean Naperville condos, apartments, and houses, including homes with five bedrooms. A typical home we visit has three bedrooms and 2.5 bathrooms. We serve ZIP codes 60540, 60563, 60564, and 60565. The room count helps describe your home, but the condition of those rooms matters too. A kitchen used for daily cooking may need a different level of attention from a guest room that is rarely used. In living spaces, the work includes dusting furniture, vacuuming carpets and rugs, and mopping hard floors. Bathroom work covers toilets, sinks, tubs, showers, and mirrors. Let us know if a particular room is your priority. If you request a bed linen change, leave the fresh sheets where the cleaner can find them. Put fragile belongings and sensitive paperwork aside rather than leaving them on surfaces you want cleaned.";
const PREPARATION = "We bring all cleaning supplies and equipment. Before the first cleaning, we ask where our cleaners can park. Clear counters and floor space, put valuables away, and secure pets if they are anxious around vacuums or open doors. You do not need to stay home if you provide access instructions. Allow roughly 2 to 4 hours for regular cleaning or 4 to 6 for a deep clean. These are guide ranges, not a fixed appointment length. We confirm estimated timing before the visit based on your home's size, condition, and booked services.";
const PRICING = 'Your quote reflects the service, home size, bathroom count, condition, frequency, and selected extras. Use our <a href="/pricing">pricing page</a> to compare options, then enter your own details in the quote form. Extra interior work on a regular visit, such as cleaning inside an oven, refrigerator, or empty cabinets, should be selected rather than assumed. Tell us about these requests before the appointment so the agreed scope includes them. Regular visits maintain the result between appointments; a first visit may need deeper work if buildup has been left for a while. We will confirm what is included before service, so you can check that the booking matches the work you want done.';
const SERVICES = [
  ["deep-cleaning", "Deep Cleaning", "A reset for homes that have not been professionally cleaned in months, or before starting recurring service. The work includes detailed dusting, hand-wiped baseboards and door frames, kitchen degreasing, and close attention to bathroom tile and grout."],
  ["regular-cleaning", "Regular House Cleaning", "Ongoing help for busy households that want the kitchen, bathrooms, and floors maintained between visits. Each appointment covers light dusting, vacuuming and mopping, appliance exteriors, the inside of the microwave, bathroom fixtures, and trash removal."],
  ["move-in-move-out-cleaning", "Move-In / Move-Out Cleaning", "For renters, buyers, and property managers preparing a home for its next occupant or a final walkthrough. Work includes floors, closets, interior doors, and kitchen appliance interiors, with inside cabinets and drawers cleaned when empty."],
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
  const reviews = evidence.reviews.filter(review => review.quote.trim());
  const card = review => `<article class="clients-say-home__card" data-naperville-review="${review.reviewId}"><div class="clients-say-home__stars" aria-label="5 out of 5 stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div><p class="clients-say-home__text">${escape(review.quote)}</p><div class="clients-say-home__person"><div class="clients-say-home__avatar" aria-hidden="true">${escape(review.name[0])}</div><div><a class="clients-say-home__name" href="${evidence.source}" rel="noopener">${escape(review.name)}</a><div class="clients-say-home__meta">Google review excerpt</div></div></div></article>`;
  const group = position => node => hasClass(node, "clients-say-home__group") && hasClass(node.parentNode, `clients-say-home__track--${position}`);
  return replaceNodes(template, [
    [group("top"), inner(reviews.slice(0, 12).map(card).join(""))],
    [group("bottom"), inner(reviews.slice(12).map(card).join(""))],
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
    [node => node.tagName === "p" && hasClass(node.parentNode, "sg-info-tile--muted"), inner("For recurring appointments, we aim to keep the same cleaner whenever scheduling allows.")],
    [node => node.tagName === "p" && hasClass(node.parentNode, "sg-info-tile") && !hasClass(node.parentNode, "sg-info-tile--muted"), inner("Tell us which rooms need the most attention before we arrive. A short priority list helps the cleaner focus on the bathroom, kitchen, or living space that matters most to you.")],
    [node => node.tagName === "p" && hasClass(node.parentNode, "sg-hero-panel__statement"), inner("You do not need to scrub the house first. Leave the cleaning to us rather than washing floors or sinks before your appointment.")],
  ]);
  const serviceSection = section("sg-section--services");
  const serviceCards = find(serviceSection, byClass("sg-services__grid")).childNodes.filter(node => node.tagName === "a");
  const cards = SERVICES.map(([slug, title, copy], index) => replaceNodes(original(serviceCards.find(node => attribute(node, "href") === `/services/${slug}`)), [
    [byClass("sg-service-card__number"), inner(`0${index + 1}`)],
    [node => node.tagName === "h3", inner(escape(title))],
    [node => node.tagName === "p", inner(copy)],
  ])).join("\n");
  const services = replaceNodes(original(serviceSection), [
    [byClass("sg-services__intro"), inner("Deep cleaning is our most booked service in Naperville. It tackles buildup before ongoing upkeep begins. If your home is already maintained, regular visits focus on the everyday work. An empty-home appointment is a different job, with access to the spaces normally covered by belongings.")],
    [byClass("sg-services__grid"), inner(cards)],
    [node => node.tagName === "span" && hasClass(node.parentNode, "sg-services__secondary"), inner("Explore other service pages:")],
  ]);
  const homes = replaceNodes(original(section("sg-recurring")), [
    [node => node.tagName === "h2", inner('Homes We Clean in <span class="sg-accent">Naperville</span>')],
    [byClass("sg-section-lead"), inner(HOMES)],
    [byClass("sg-benefits"), source => replaceNodes(source, [[node => node.tagName === "span" && node.parentNode?.tagName === "li" && !hasClass(node, "sg-benefit__number"), inner("Put fragile items aside")]]).replace("reduce long-term costs", "Leave out requested fresh linens").replace("avoid frequent deep cleanings", "Keep walkways clear")],
    [byClass("sg-note"), inner("For a move-out appointment, plan the cleaning after your belongings are removed and before the final walkthrough. For move-in, our service guide recommends booking one or two days before moving day. Empty cupboards and accessible floors let the cleaner reach areas that would otherwise be covered by boxes or furniture.")],
  ]);
  const pricing = replaceNodes(original(section("sg-pricing")), [
    [byClass("sg-section-lead"), inner(PRICING)],
    [byClass("sg-pricing__grid"), () => ""],
    [byClass("sg-pricing__statement"), () => ""],
    [byClass("sg-pricing__fineprint"), () => ""],
  ]);
  const team = replaceNodes(original(section("sg-team")), [
    [node => node.tagName === "h2", inner('What Matters for Cleaning in <span class="sg-accent">Naperville</span>')],
    [byClass("sg-team__list"), source => replaceNodes(source, [[node => node.tagName === "span" && hasClass(node.parentNode, "sg-team__item") && !hasClass(node, "sg-team__dot"), inner("Prepare the rooms")]]).replace("Carefully selected cleaners", "Arrange entry in advance").replace("Flexible weekly, bi-weekly, or one-time service", "Confirm the visit length")],
    [byClass("sg-note"), inner(PREPARATION)],
  ]);
  const faqItem = ([question, answer]) => `<details class="sg-faq__item"><summary><span class="sg-faq__question">${escape(question)}</span></summary><p class="sg-faq__answer">${escape(answer)}</p></details>`;
  const faqHtml = replaceNodes(original(section("sg-faq")), [[byClass("sg-faq__panel"), inner(`<div class="sg-faq__column">${FAQ.slice(0, 4).map(faqItem).join("")}</div><div class="sg-faq__column">${FAQ.slice(4).map(faqItem).join("")}</div>`)]]);
  const areas = replaceNodes(original(section("sg-areas")), [
    [node => node.tagName === "label" && attribute(node, "for") === "sgZip", () => ""],
    [node => node.tagName === "input" && attribute(node, "id") === "sgZip", source => source.replace("<input ", '<input aria-label="ZIP code" ')],
  ]);
  const body = [hero, services, homes, renderReviews(reviewTemplate), pricing, team, areas, faqHtml, original(section("sg-quote"))].join("\n");
  const location = main.sourceCodeLocation;
  let output = html.slice(0, location.startOffset) + '<main data-naperville-pilot="true">' + body + html.slice(location.endTag.startOffset);
  if (find(document, node => attribute(node, "id") === "sg-city-modal-title")) {
    output = replaceNodes(output, [[node => attribute(node, "id") === "sg-city-modal-title", () => ""]]);
    output = output.replace('aria-labelledby="sg-city-modal-title"', 'aria-label="Service areas by city"');
  }
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
