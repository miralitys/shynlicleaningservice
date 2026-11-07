"use strict";

const { parseFragment } = require("parse5");
const { createHash } = require("node:crypto");
const release = require("./blog-safety-release.json");
const { validDate } = require("./blog-editorial");

const sources = Object.freeze({
  cdc: "https://www.cdc.gov/hygiene/about/when-and-how-to-clean-and-disinfect-a-facility.html",
  bleach: "https://www.cdc.gov/hygiene/about/cleaning-and-disinfecting-with-bleach.html",
  mold: "https://www.epa.gov/mold/brief-guide-mold-moisture-and-your-home",
  pink: "https://www.ag.ndsu.edu/news/newsreleases/2010/aug-9-2010/red-substance-in-tub-toilet-is-bacteria/",
  wood: "https://woodfloors.org/maintenance/",
  allergy: "https://stacks.cdc.gov/view/cdc/43223/cdc_43223_DS1.pdf",
  delta: "https://www.deltafaucet.com/node/264",
  grout: "https://www.custombuildingproducts.com/frequently-asked-questions",
  oven: "https://products.geappliances.com/appliance/gea-support-search-content?contentId=17327",
  appliance: "https://www.geappliances.com/ge/lifestyles/how-to-clean-appliances",
  enzyme: "https://www.naturesmiracle.com/products/stain-and-odor/urine-destroyer-for-dogs",
  urine: "https://www.skoutshonor.com/blogs/resources/dog-pee-on-hardwood-floors",
});

const link = (key, label) => `<a href="${sources[key]}">${label}</a>`;
const chemicalSafety = `<p>Never mix cleaners or disinfectants, especially with bleach. Dangerous fumes can result. Follow label directions for ventilation and protective equipment. See ${link("bleach", "CDC bleach safety guidance")}.</p>`;
const woodCare = `<p>Use a cleaner approved for the specific floor finish. Avoid wet mops and steam mops; remove spills promptly without leaving standing liquid. See ${link("wood", "National Wood Flooring Association maintenance guidance")}.</p>`;
const allergyCare = `<p>For dust-mite exposure control, wash sheets and pillowcases weekly using detergent and a fabric-appropriate cycle. The ${link("allergy", "AAAAI/ACAAI dust-mite practice parameter (PDF)")} supports weekly warm-water washing and warns about scalding risks from hotter household water. Do not raise the water-heater setting to follow a laundry tip.</p><p>Cleaning may help reduce allergen exposure, but it cannot guarantee symptom relief or replace medical assessment or treatment. Ask a clinician about persistent or worsening symptoms.</p>`;

const plans = {
  "/blog/airbnb/best-disinfecting-routine-for-short-term-rentals": {
    guidance: `<p>Clean surfaces before disinfecting. Use an EPA-registered disinfectant suitable for the surface and intended use. Follow its label, keeping the surface visibly wet for the full contact time. There is no single contact time for every product. See ${link("cdc", "CDC cleaning and disinfection guidance")}.</p>${chemicalSafety}`,
  },
  "/blog/bathroom/how-to-remove-mold-from-bathroom-caulk": {
    replacements: [["The safest way to remove mold from bathroom caulk is to clean the surface carefully, treat the affected line with the right mildew-targeting product, and then reassess whether the discoloration has penetrated too deeply to clean fully.", "For a small area of surface mold on intact bathroom caulk, follow a compatible cleaner's label and reassess the sealant afterward. Failed caulk, recurring growth, or extensive contamination needs assessment rather than repeated surface treatment."], ["Do not mix bathroom chemicals in a small enclosed space.", "Never mix cleaning products or disinfectants, regardless of room size or ventilation."]],
    guidance: `<p>Fix the moisture problem as well as cleaning the affected area. EPA advises further assessment for substantial water damage, mold over about 10 square feet, or suspected HVAC contamination. Do not run an HVAC system suspected of mold contamination. See ${link("mold", "EPA's household mold guide")}.</p><p>Wear appropriate protection and follow product directions. Surface cleaning cannot repair failed sealant or hidden water damage. Mold remediation is not the same as routine house cleaning.</p>${chemicalSafety}`,
  },
  "/blog/bathroom/how-to-remove-pink-mold-bathroom": {
    replacements: [["What people call pink mold in the bathroom is often a pink or orange biofilm that grows where moisture, soap residue, and poor drying conditions keep the surface damp. It should be cleaned early because it spreads fastest on wet plastic, caulk, grout edges, and shower corners.", "What people call pink mold in the bathroom is often a bacterial biofilm rather than mold. Clean the affected surface and reduce moisture and soap residue; color alone cannot identify the organism."], ["Do not mix strong cleaners in a small enclosed bathroom.", "Never mix cleaning products or disinfectants, regardless of room size or ventilation."]],
    guidance: `<p>${link("pink", "North Dakota State University Extension")} identifies Serratia marcescens as a cause of pink bathroom residue. That does not establish the organism in every pink stain. Clean the surface and address conditions that leave it damp; do not diagnose contamination by color alone.</p>${chemicalSafety}`,
  },
  "/blog/bathroom/how-to-whiten-bathroom-grout-without-bleach": {
    guidance: `<p>Check the grout, sealer and surrounding tile manufacturer's care instructions. ${link("grout", "CUSTOM Building Products")} warns that acids and abrasive household cleaners can damage grout and stone. Removing surface residue may improve appearance, but it cannot guarantee the original color or repair deteriorated grout.</p>${chemicalSafety}`,
  },
  "/blog/bathroom/how-to-descale-shower-head-vinegar-vs-alternatives": {
    guidance: `<p>Follow the instructions for your specific shower head and finish. ${link("delta", "Delta's mineral-deposit guidance")} distinguishes wiping Touch-Clean spray holes from soaking certain non-Touch-Clean heads in equal parts white vinegar and water. This is a product-specific example, not a method approved for every shower head. Do not invent a universal soaking time.</p>${chemicalSafety}`,
  },
  "/blog/checklists/bedroom-cleaning-checklist-for-allergies": {
    replacements: [["When that layer keeps building, the result is not just a room that feels dusty. It is sneezing at bedtime, congestion in the morning, itchy eyes, and the feeling that sleep never fully resets you.", "For people sensitive to indoor allergens, exposure may contribute to symptoms. Symptoms have other possible causes and need medical assessment rather than a diagnosis based on room dust."], ["A checklist fixes that because it makes the hidden zones part of the normal routine instead of optional extra work.", "A checklist can make overlooked areas part of the routine, but it cannot guarantee allergy relief."]],
    guidance: allergyCare,
  },
  "/blog/dust/cleaning-routine-for-allergies-at-home": { guidance: allergyCare },
  "/blog/dust/how-often-to-wash-bedding-for-allergies": {
    replacements: [["Refresh sheets and pillowcases on a dependable repeated schedule.", "Wash sheets and pillowcases weekly for dust-mite exposure control, following their fabric-care instructions."], ["bedding gets refreshed without actually being sanitized", "bedding care does not follow the fabric's washing instructions"], ["the bedroom usually feels better long before it looks different.", "the routine can help reduce allergen exposure, without guaranteeing symptom relief."]],
    guidance: allergyCare,
  },
  "/blog/floors/how-to-clean-hardwood-floors-without-streaks": { guidance: woodCare },
  "/blog/floors/how-to-remove-sticky-residue-from-hardwood-floor": {
    guidance: `${woodCare}<p>Stop if residue removal reveals peeling, discoloration or finish damage. Cleaning is not refinishing; ask the flooring manufacturer or a flooring professional before trying a stronger treatment.</p>`,
  },
  "/blog/floors/vinegar-on-hardwood-floors-is-it-safe": {
    replacements: [["If testing vinegar anyway, keep dilution controlled and moisture minimal.", "Do not experiment with vinegar; use a cleaner approved by the flooring or finish manufacturer."], ["Usually yes, because hardwood finish protection is much more sensitive than most tile surfaces.", "Do not assume so. Check the tile, grout and sealer instructions; acidic cleaners can damage acid-sensitive materials."], ["The bigger concern is repeated finish stress and inconsistent DIY use rather than one perfect tiny pass.", "Compatibility depends on the finish. Do not treat a small trial or a diluted mixture as proof that vinegar is safe for the floor."]],
    guidance: woodCare,
  },
  "/blog/kitchen/how-to-clean-oven-without-harsh-chemicals": {
    replacements: [["Wipe fresh oven spills before they become repeatedly baked in.", "Once the oven is off and fully cool, remove spills using the method allowed by its manual."], ["Yes, but it usually depends on patience, softening time, and repeated controlled passes.", "The allowed method depends on the model and coating. Check the manual before using homemade mixtures, commercial cleaners or a self-cleaning cycle."]],
    guidance: `<p>Start with the ${link("appliance", "manufacturer's instructions for the exact appliance model")}. Manual-clean, self-cleaning and specialty-coated ovens can require different methods. Work only after the oven is switched off and fully cool, and follow the manual before removing racks or treating the cavity.</p><p>${link("oven", "GE's oven-door guidance")} permits several methods in the situations it describes, but warns against getting water or cleaner on the door gasket. Do not generalize a door-cleaning recipe to every oven cavity, coating or model. Do not combine a cleaner with a self-cleaning cycle unless the manual expressly allows it.</p>${chemicalSafety}`,
  },
  "/blog/pet-hair/how-to-remove-pet-urine-smell-from-hardwood": {
    guidance: `${woodCare}<p>Product approval matters: ${link("urine", "Skout's Honor's hardwood guidance")} limits its named cleaners to wood with a water-safe sealant, not untreated or unsealed wood. Its product instructions are not instructions for other brands.</p><p>Blot promptly without flooding seams. Persistent odor, dark staining or damaged finish may require a flooring professional; routine surface cleaning cannot promise removal of contamination within the boards or below them.</p>`,
  },
  "/blog/pet-hair/enzyme-cleaner-vs-vinegar-for-pet-accidents": {
    replacements: [["If the real problem is biological residue and repeat odor, enzyme-based cleanup is usually the more purpose-built approach.", "A product labeled for the residue and surface may be appropriate, but an enzyme claim alone does not establish compatibility or guarantee odor removal."]],
    guidance: `<p>Choose the exact product for the surface, then follow its label for testing, application, dwell time and drying. For example, ${link("enzyme", "Nature's Miracle Urine Destroyer for Dogs")} excludes untreated hardwood and several specialty materials. This is a limitation of that product, not a universal instruction for every enzyme cleaner.</p><p>Do not substitute vinegar, assume all enzyme formulas work alike, or borrow another product's contact time. Deep or recurring odor may require assessment beyond surface cleaning. Keep people and pets away as directed on the product label.</p>${chemicalSafety}`,
  },
};

function safetyDates(article, deployment = release) {
  const bodyHash = createHash("sha256").update(article.bodyHtml).digest("hex");
  const published = validDate(deployment.deployedAt) && deployment.deployedAt >= article.modifiedAt
    && deployment.articleBodyHashes?.[article.path] === bodyHash;
  if (!published) return { ...article, safetyRevisionPending: true };
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  }).format(new Date(`${deployment.deployedAt}T12:00:00Z`));
  return { ...article, modifiedAt: deployment.deployedAt, updatedLabel: `Updated ${label}`, safetyRevisionPending: false };
}

function applySafetyEditorial(article) {
  const plan = plans[article.path];
  if (!plan || article.bodyHtml.includes('id="safety-and-sources"')) return article;
  let bodyHtml = article.bodyHtml;
  for (const [before, after] of plan.replacements || []) {
    if (!bodyHtml.includes(before)) throw new Error(`Missing safety edit anchor: ${article.path}: ${before}`);
    bodyHtml = bodyHtml.replaceAll(before, after);
  }
  let anchor;
  const anchorIds = ["before-you-start", "before-arrival", "bedding-and-soft-surfaces"];
  function visit(node) {
    if (!anchor && node.tagName === "section" && node.attrs?.some(a => a.name === "id" && anchorIds.includes(a.value))) anchor = node;
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parseFragment(bodyHtml, { sourceCodeLocationInfo: true }));
  if (!anchor) throw new Error(`Missing safety section anchor: ${article.path}`);
  const index = anchor.sourceCodeLocation.startOffset;
  const section = `<section class="shynli-blog-article__section" id="safety-and-sources"><h2>Safety and Source Guidance</h2>${plan.guidance}</section>\n\n`;
  bodyHtml = bodyHtml.slice(0, index) + section + bodyHtml.slice(index);
  const toc = [...article.toc];
  const position = toc.findIndex(item => anchorIds.includes(item.id));
  toc.splice(position < 0 ? 1 : position, 0, { id: "safety-and-sources", label: "Safety and source guidance" });
  return safetyDates({ ...article, bodyHtml, toc });
}

module.exports = { applySafetyEditorial, safetyDates, SAFETY_ARTICLE_PATHS: Object.freeze(Object.keys(plans)), SAFETY_SOURCES: sources };
