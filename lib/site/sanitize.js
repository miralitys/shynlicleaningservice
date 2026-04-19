"use strict";

const { BLOG_ARTICLES } = require("./blog-articles");

function createSiteSanitizer(deps = {}) {
  const {
    GOOGLE_ANALYTICS_MEASUREMENT_ID,
    GOOGLE_PLACES_API_KEY,
    normalizeRoute,
    siteSeoHelpers,
  } = deps;

const DEEP_CLEANING_ADDONS_SECTION = `
<style id="deep-cleaning-addons-static-style">
#deep-cleaning-addons-static{background:#faf9f6;padding:0 0 56px;}
#deep-cleaning-addons-static .dc-addons{max-width:1200px;margin:0 auto;padding:0 20px;box-sizing:border-box;color:#313131;}
#deep-cleaning-addons-static .dc-addons__title{margin:0;text-align:center;font-family:'Playfair Display',serif;font-size:48px;line-height:1.14;font-weight:400;}
#deep-cleaning-addons-static .dc-addons__title-accent{color:#9e435a;}
#deep-cleaning-addons-static .dc-addons__subtitle{margin:14px 0 38px;text-align:center;font-family:'Montserrat',sans-serif;font-size:18px;line-height:1.35;font-weight:400;}
#deep-cleaning-addons-static .dc-addons__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px 80px;align-items:start;}
#deep-cleaning-addons-static .dc-addons__group-title{margin:0 0 26px;font-family:'Playfair Display',serif;font-size:32px;line-height:1.12;font-weight:400;color:#ddd8d2;}
#deep-cleaning-addons-static .dc-addons__list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:24px;}
#deep-cleaning-addons-static .dc-addons__item{display:grid;grid-template-columns:40px minmax(0,1fr);gap:16px;align-items:start;}
#deep-cleaning-addons-static .dc-addons__item-label{font-family:'Montserrat',sans-serif;font-size:18px;line-height:1.35;font-weight:400;color:#313131;}
#deep-cleaning-addons-static .dc-addons__item-label strong{font-weight:700;}
#deep-cleaning-addons-static .dc-addons__icon{width:32px;height:32px;display:block;flex:none;margin-top:2px;}
#deep-cleaning-addons-static .dc-addons__note{margin:52px 0 30px;display:grid;grid-template-columns:56px minmax(0,1fr);gap:16px;align-items:start;}
#deep-cleaning-addons-static .dc-addons__note-box{background:#d8cfc4;border-radius:24px;padding:24px 28px;min-height:72px;display:flex;align-items:center;box-sizing:border-box;}
#deep-cleaning-addons-static .dc-addons__note-text{font-family:'Playfair Display',serif;font-size:32px;line-height:1.15;font-weight:400;color:#313131;}
#deep-cleaning-addons-static .dc-addons__cta{display:flex;flex-direction:column;align-items:center;gap:10px;}
#deep-cleaning-addons-static .dc-addons__button{display:inline-flex;align-items:center;justify-content:center;min-width:300px;min-height:70px;padding:0 32px;border-radius:999px;background:#9e435a;color:#faf9f6;text-decoration:none;font-family:'Montserrat',sans-serif;font-size:16px;font-weight:500;line-height:1;box-sizing:border-box;transition:background-color .2s ease;}
#deep-cleaning-addons-static .dc-addons__button:hover{background:#6e2e3e;color:#faf9f6;}
#deep-cleaning-addons-static .dc-addons__helper{font-family:'Montserrat',sans-serif;font-size:12px;line-height:1.35;font-weight:400;color:#6a665f;text-align:center;}
@media (max-width:959px){
  #deep-cleaning-addons-static .dc-addons__title{font-size:42px;}
  #deep-cleaning-addons-static .dc-addons__grid{gap:40px 48px;}
  #deep-cleaning-addons-static .dc-addons__note-text{font-size:28px;}
}
@media (max-width:639px){
  #deep-cleaning-addons-static{padding:0 0 44px;}
  #deep-cleaning-addons-static .dc-addons{padding:0 16px;}
  #deep-cleaning-addons-static .dc-addons__title{font-size:34px;}
  #deep-cleaning-addons-static .dc-addons__subtitle{font-size:16px;margin:12px 0 30px;}
  #deep-cleaning-addons-static .dc-addons__grid{grid-template-columns:1fr;gap:28px;}
  #deep-cleaning-addons-static .dc-addons__group-title{font-size:26px;margin-bottom:20px;}
  #deep-cleaning-addons-static .dc-addons__list{gap:20px;}
  #deep-cleaning-addons-static .dc-addons__item{grid-template-columns:34px minmax(0,1fr);gap:14px;}
  #deep-cleaning-addons-static .dc-addons__item-label{font-size:16px;line-height:1.32;}
  #deep-cleaning-addons-static .dc-addons__icon{width:28px;height:28px;}
  #deep-cleaning-addons-static .dc-addons__note{margin:36px 0 24px;grid-template-columns:48px minmax(0,1fr);gap:12px;}
  #deep-cleaning-addons-static .dc-addons__note-box{padding:20px 22px;border-radius:22px;}
  #deep-cleaning-addons-static .dc-addons__note-text{font-size:24px;line-height:1.14;}
  #deep-cleaning-addons-static .dc-addons__button{min-width:100%;min-height:58px;font-size:15px;}
  #deep-cleaning-addons-static .dc-addons__helper{font-size:11px;}
}
@media (max-width:479px){
  #deep-cleaning-addons-static .dc-addons__title{font-size:24px;line-height:1.18;}
  #deep-cleaning-addons-static .dc-addons__title-accent{display:block;}
  #deep-cleaning-addons-static .dc-addons__subtitle{font-size:13px;line-height:1.4;margin:10px 0 22px;}
  #deep-cleaning-addons-static .dc-addons__group-title{font-size:22px;line-height:1.1;color:#d7d0c7;}
  #deep-cleaning-addons-static .dc-addons__item{grid-template-columns:28px minmax(0,1fr);gap:12px;}
  #deep-cleaning-addons-static .dc-addons__item-label{font-size:14px;line-height:1.3;}
  #deep-cleaning-addons-static .dc-addons__icon{width:24px;height:24px;margin-top:1px;}
  #deep-cleaning-addons-static .dc-addons__note{margin:30px 0 22px;grid-template-columns:42px minmax(0,1fr);gap:10px;}
  #deep-cleaning-addons-static .dc-addons__note-box{padding:18px 18px 20px;border-radius:20px;}
  #deep-cleaning-addons-static .dc-addons__note-text{font-size:17px;line-height:1.18;}
  #deep-cleaning-addons-static .dc-addons__button{min-height:52px;font-size:14px;padding:0 20px;}
}
</style>
<section id="deep-cleaning-addons-static">
  <div class="dc-addons">
    <h2 class="dc-addons__title">Take Your Deep Cleaning <span class="dc-addons__title-accent">Even Further</span></h2>
    <p class="dc-addons__subtitle">Add these services to any deep cleaning</p>
    <div class="dc-addons__grid">
      <div class="dc-addons__group">
        <h3 class="dc-addons__group-title">Interior Add-Ons:</h3>
        <ul class="dc-addons__list">
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Inside Fridge — <strong>$45</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Inside Oven — <strong>$45</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Interior Windows — <strong>$6 per window</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Wet Baseboards — <strong>$22</strong></span>
          </li>
        </ul>
      </div>
      <div class="dc-addons__group">
        <h3 class="dc-addons__group-title">Extra Focus:</h3>
        <ul class="dc-addons__list">
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Inside Cabinets (empty) — <strong>$45</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Polishing wooden furniture — <strong>$20</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Bed linen replacement — <strong>$8</strong></span>
          </li>
          <li class="dc-addons__item">
            <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
            <span class="dc-addons__item-label">Doors — <strong>$22</strong></span>
          </li>
        </ul>
      </div>
    </div>
    <div class="dc-addons__note">
      <svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>
      <div class="dc-addons__note-box">
        <div class="dc-addons__note-text">Most add-ons are recommended after your first recurring visit.</div>
      </div>
    </div>
    <div class="dc-addons__cta">
      <a class="dc-addons__button" href="/quote">Start with Deep Cleaning</a>
      <div class="dc-addons__helper">Recommended before recurring service</div>
    </div>
  </div>
</section>
`;

function rebuildDeepCleaningAddonsSection(html, routePath) {
  if (normalizeRoute(routePath) !== "/services/deep-cleaning") return html;
  if (html.includes('id="deep-cleaning-addons-static"')) return html;

  const oldSectionPattern = /<div id="rec1778752123"[\s\S]*?(?=<div id="rec1778752133")/i;
  if (!oldSectionPattern.test(html)) return html;

  return html.replace(oldSectionPattern, DEEP_CLEANING_ADDONS_SECTION);
}

const BLOG_ROUTE = "/blog";
const BLOG_HUB_SECTION_PATTERN = /<section id="blog-topics-hub" class="shynli-blog-hub">[\s\S]*?<\/section>(?=\s*<div id="rec1769860233")/i;
const BLOG_EMPTY_FEEDS_PATTERN = /<div id="rec1769860233"[\s\S]*?(?=<div id="rec1795404693")/i;
const BLOG_LEGACY_FEED_SECTION_PATTERN = /<div id="rec1783295923"[\s\S]*?(?=<div id="rec1795404693")/i;
const BLOG_RUNTIME_SCRIPT_PATTERN = /<script id="shynli-blog-topic-hub-script">[\s\S]*?<\/script>/i;
const BLOG_HERO_HEADING_PATTERN = /<h1 class='tn-atom'field='tn_text_1768231764218'>[\s\S]*?<\/h1>/i;
const BLOG_CATEGORY_DETAILS = Object.freeze([
  {
    path: "/blog/checklists",
    label: "Checklists",
    cardCopy: "Room-by-room plans, recurring reset routines, and practical lists you can actually follow.",
    heroLead: "Cleaning",
    heroAccent: "Checklists",
    sectionTitle: "Checklists that keep the work clear and the home consistent.",
    sectionText:
      "Use this section for recurring routines, room-by-room plans, prep lists, and the kind of practical checklists people search when they need a reliable cleaning workflow.",
    searchIntents: [
      "Weekly house cleaning checklist",
      "Bathroom cleaning checklist",
      "Move-out cleaning checklist",
    ],
    quoteTitle: "Need help instead of another checklist?",
    quoteText:
      "Leave your name and phone, and continue straight to a quote with your details already filled in.",
    filterAliases: ["checklists", "checklist"],
  },
  {
    path: "/blog/whats-included",
    label: "What's Included",
    cardCopy: "Clear answers on what a standard, deep, recurring, or move-out clean usually covers.",
    heroLead: "What’s",
    heroAccent: "Included",
    sectionTitle: "Clear scope answers before you book a cleaning service.",
    sectionText:
      "This section is built for homeowners searching what a cleaner actually does, what is included in a visit, and where the line is between standard, deep, and turnover service.",
    searchIntents: [
      "What is included in house cleaning",
      "What does deep cleaning include",
      "What is included in move-out cleaning",
    ],
    quoteTitle: "Want the scope explained for your home?",
    quoteText:
      "Leave your contact details and move into the quote flow with your information already saved.",
    filterAliases: ["whats included", "what is included", "included"],
  },
  {
    path: "/blog/services",
    label: "Services",
    cardCopy: "Comparisons, service selection guides, and when each cleaning format makes the most sense.",
    heroLead: "Cleaning",
    heroAccent: "Services",
    sectionTitle: "Choose the right service before you book the wrong one.",
    sectionText:
      "This cluster explains the difference between service types, how to think about frequency, and which cleaning format fits the current state of the home.",
    searchIntents: [
      "Regular cleaning vs deep cleaning",
      "How often should I schedule cleaning",
      "Best house cleaning service for busy families",
    ],
    quoteTitle: "Need help choosing the right service?",
    quoteText:
      "Leave your details and continue to a quote so we can price the right service, not just the fastest one.",
    filterAliases: ["services", "service"],
  },
  {
    path: "/blog/bathroom",
    label: "Bathroom",
    cardCopy: "Grout, soap scum, mirrors, fixtures, and what keeps bathrooms feeling reset longer.",
    heroLead: "Bathroom",
    heroAccent: "Cleaning Guides",
    sectionTitle: "Bathroom cleaning advice people actually search when the room stops feeling clean.",
    sectionText:
      "Use this section for soap scum, mirrors, grout, fixtures, vents, and the difference between keeping up with a bathroom weekly and resetting it properly.",
    searchIntents: [
      "How to clean soap scum from shower glass",
      "Bathroom deep cleaning checklist",
      "What a cleaner does in a bathroom",
    ],
    quoteTitle: "Want a bathroom reset without doing it yourself?",
    quoteText:
      "Leave your name and phone, and continue straight to a quote with your details prefilled.",
    filterAliases: ["bathroom", "bathrooms"],
  },
  {
    path: "/blog/kitchen",
    label: "Kitchen",
    cardCopy: "Cabinets, counters, ovens, sinks, and the high-traffic details homeowners notice fastest.",
    heroLead: "Kitchen",
    heroAccent: "Cleaning Guides",
    sectionTitle: "Kitchen cleaning content for the surfaces that show wear the fastest.",
    sectionText:
      "This section focuses on counters, sinks, appliances, cabinets, greasy buildup, food splatter zones, and the details that make a kitchen feel truly reset.",
    searchIntents: [
      "How to clean greasy kitchen cabinets",
      "Kitchen cleaning checklist",
      "What a deep kitchen clean includes",
    ],
    quoteTitle: "Need a professional kitchen reset?",
    quoteText:
      "Drop your details here and continue to the quote flow with your contact information already entered.",
    filterAliases: ["kitchen", "kitchens"],
  },
  {
    path: "/blog/floors",
    label: "Floors",
    cardCopy: "Hardwood, tile, vinyl, mopping frequency, and how to clean without shortening floor life.",
    heroLead: "Floor",
    heroAccent: "Cleaning Guides",
    sectionTitle: "Floor care advice for homes with real traffic, pets, and everyday buildup.",
    sectionText:
      "Use this section for hardwood, tile, vinyl, dust trails, corners, baseboards, and how often floors usually need more than a quick pass.",
    searchIntents: [
      "How often should floors be mopped",
      "Best way to clean hardwood floors at home",
      "Tile floor deep cleaning tips",
    ],
    quoteTitle: "Want cleaner floors without chasing dust every day?",
    quoteText:
      "Leave your contact details and continue to a quote with your information already in place.",
    filterAliases: ["floors", "floor", "hardwood", "tile", "vinyl"],
  },
  {
    path: "/blog/dust",
    label: "Dust",
    cardCopy: "Dusting routines, overlooked surfaces, baseboards, blinds, and indoor air feel.",
    heroLead: "Dusting",
    heroAccent: "Guides",
    sectionTitle: "Dust control advice for homes that look fine until the details catch the light.",
    sectionText:
      "This section is for shelves, blinds, vents, trim, baseboards, high surfaces, and routines that keep a home from feeling dusty again too quickly.",
    searchIntents: [
      "How to keep dust down in a house",
      "Best dusting order for a home",
      "What cleaners dust during a regular visit",
    ],
    quoteTitle: "Prefer help instead of another dusting cycle?",
    quoteText:
      "Leave your details and move directly into the quote flow with your information already saved.",
    filterAliases: ["dust", "dusting"],
  },
  {
    path: "/blog/pet-hair",
    label: "Pet Hair",
    cardCopy: "Shedding control, upholstery cleanup, fur on stairs and corners, and daily maintenance ideas.",
    heroLead: "Pet Hair",
    heroAccent: "Cleaning Guides",
    sectionTitle: "Useful cleaning content for homes where shedding changes the whole routine.",
    sectionText:
      "Use this section for fur on floors, furniture, stairs, corners, and the practical upkeep questions that come with pets living fully in the home.",
    searchIntents: [
      "How to remove pet hair from furniture",
      "Best cleaning routine for shedding dogs",
      "How professionals clean pet hair in homes",
    ],
    quoteTitle: "Need backup on pet hair and daily buildup?",
    quoteText:
      "Leave your name and phone, and continue to a quote with your details already filled in.",
    filterAliases: ["pet hair", "pets", "pet"],
  },
  {
    path: "/blog/move-in-move-out",
    label: "Move-in / Move-out",
    cardCopy: "Deposit-focused checklists, empty-home prep, landlord expectations, and turnover timing.",
    heroLead: "Move-In / Move-Out",
    heroAccent: "Guides",
    sectionTitle: "Move-related cleaning content for deposits, walkthroughs, and fast transitions.",
    sectionText:
      "This section covers empty-home cleaning, turnover prep, landlord expectations, final walkthrough details, and how to think about timing before keys change hands.",
    searchIntents: [
      "Move-out cleaning checklist for renters",
      "What landlords expect after move-out",
      "What a move-in cleaning should include",
    ],
    quoteTitle: "Need help before the keys change hands?",
    quoteText:
      "Leave your details here and move into the quote flow with your contact information already prefilled.",
    filterAliases: ["move in move out", "move-in / move-out", "move in", "move out", "move-in", "move-out", "moving"],
  },
  {
    path: "/blog/airbnb",
    label: "Airbnb",
    cardCopy: "Turnover speed, guest-ready presentation, restocking basics, and host routine planning.",
    heroLead: "Airbnb",
    heroAccent: "Cleaning Guides",
    sectionTitle: "Turnover-focused content for hosts who need speed without missed details.",
    sectionText:
      "Use this section for turnover checklists, guest-ready presentation, linen rhythm, bathroom resets, and repeatable routines for short-term rental cleaning.",
    searchIntents: [
      "Airbnb turnover cleaning checklist",
      "How long should Airbnb cleaning take",
      "What to clean between Airbnb guests",
    ],
    quoteTitle: "Want help with turnovers and guest-ready resets?",
    quoteText:
      "Leave your details and continue to the quote flow with your information already entered.",
    filterAliases: ["airbnb", "turnover", "vacation rental"],
  },
  {
    path: "/blog/seasonal",
    label: "Seasonal",
    cardCopy: "Spring resets, holiday prep, back-to-school cleaning rhythm, and weather-driven deep cleans.",
    heroLead: "Seasonal",
    heroAccent: "Cleaning Guides",
    sectionTitle: "Seasonal cleaning content for the moments when a house needs a bigger reset.",
    sectionText:
      "This section is built around spring cleaning, holiday hosting prep, weather changes, and the deeper maintenance moments that do not fit neatly into a weekly routine.",
    searchIntents: [
      "Spring cleaning checklist for home",
      "Holiday cleaning prep before guests arrive",
      "Seasonal deep cleaning ideas",
    ],
    quoteTitle: "Need a bigger reset this season?",
    quoteText:
      "Leave your name and phone, and continue to a quote with your details already saved.",
    filterAliases: ["seasonal", "spring cleaning", "holiday"],
  },
  {
    path: "/blog/cleaning-hacks",
    label: "Cleaning Hacks",
    cardCopy: "Fast wins, pro shortcuts, and time-saving habits for busy homes that need to stay presentable.",
    heroLead: "Cleaning",
    heroAccent: "Hacks",
    sectionTitle: "Time-saving ideas for busy homes that still need to look put together.",
    sectionText:
      "Use this section for faster routines, smarter sequencing, small-effort resets, and practical shortcuts that help between full professional cleanings.",
    searchIntents: [
      "Fast cleaning hacks for busy moms",
      "How to clean a house quickly before guests",
      "Professional cleaning shortcuts at home",
    ],
    quoteTitle: "Want the shortcut to be hiring it out?",
    quoteText:
      "Leave your contact details and continue straight to a quote with your information already filled in.",
    filterAliases: ["cleaning hacks", "hacks"],
  },
]);
const BLOG_ARTICLES_BY_PATH = new Map(BLOG_ARTICLES.map((article) => [article.path, article]));

function escapeBlogHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeBlogAttribute(value) {
  return escapeBlogHtml(value).replace(/"/g, "&quot;");
}

function isManagedBlogRoute(routePath) {
  const normalizedRoute = normalizeRoute(routePath);
  return (
    normalizedRoute === BLOG_ROUTE ||
    BLOG_CATEGORY_DETAILS.some((detail) => detail.path === normalizedRoute) ||
    BLOG_ARTICLES_BY_PATH.has(normalizedRoute)
  );
}

function getBlogArticle(routePath) {
  return BLOG_ARTICLES_BY_PATH.get(normalizeRoute(routePath)) || null;
}

function getBlogCategoryDetail(routePath) {
  const normalizedRoute = normalizeRoute(routePath);
  const directDetail = BLOG_CATEGORY_DETAILS.find((item) => item.path === normalizedRoute);
  if (directDetail) return directDetail;
  const article = BLOG_ARTICLES_BY_PATH.get(normalizedRoute);
  if (!article) return null;
  return BLOG_CATEGORY_DETAILS.find((item) => item.path === article.categoryPath) || null;
}

function buildBlogTopicCards(currentPath = "") {
  return BLOG_CATEGORY_DETAILS.map((detail) => {
    const isCurrent = currentPath === detail.path;
    const currentAttrs = isCurrent ? ' aria-current="page"' : "";
    const currentClass = isCurrent ? " is-current" : "";
    return `<a class="shynli-blog-topic${currentClass}" href="${escapeBlogAttribute(detail.path)}" data-blog-filter="${escapeBlogAttribute(
      detail.label
    )}"${currentAttrs}><span class="shynli-blog-topic__name">${escapeBlogHtml(
      detail.label
    )}</span><span class="shynli-blog-topic__copy">${escapeBlogHtml(detail.cardCopy)}</span></a>`;
  }).join("");
}

function buildBlogIntentsList(detail) {
  return detail.searchIntents
    .map(
      (item) =>
        `<li class="shynli-blog-hub__intent-item"><span class="shynli-blog-hub__intent-bullet">•</span><span>${escapeBlogHtml(
          item
        )}</span></li>`
    )
    .join("");
}

function buildFeaturedArticleCards(categoryPath = "") {
  const featuredArticles = BLOG_ARTICLES.filter((article) => article.categoryPath === categoryPath);
  if (!featuredArticles.length) {
    return `<section class="shynli-blog-featured shynli-blog-featured--empty"><div class="shynli-blog-featured__intro"><div><p class="shynli-blog-hub__eyebrow">Category status</p><h3 class="shynli-blog-featured__title">Fresh guides for this section are being added.</h3></div><p class="shynli-blog-featured__text">This topic hub is live, but its dedicated article set is still being published. You can keep browsing the other active categories below or jump into the quote flow if you would rather skip the research and get help directly.</p></div><div class="shynli-blog-featured__empty-note">This category page is ready. The article library for this topic has not been published yet.</div></section>`;
  }
  const hasMultipleArticles = featuredArticles.length > 1;
  const eyebrow = hasMultipleArticles ? "Featured articles" : "Featured article";
  const title = hasMultipleArticles
    ? "Start with the strongest guides in this topic."
    : "Start with the strongest guide in this topic.";
  const text = hasMultipleArticles
    ? "Use these articles as the core resources for the category, then continue through the topic hub for adjacent cleaning questions and future guides."
    : "Use this article as the core resource for the category, then continue through the topic hub for adjacent cleaning questions and future guides.";

  return `<section class="shynli-blog-featured"><div class="shynli-blog-featured__intro"><div><p class="shynli-blog-hub__eyebrow">${escapeBlogHtml(
    eyebrow
  )}</p><h3 class="shynli-blog-featured__title">${escapeBlogHtml(
    title
  )}</h3></div><p class="shynli-blog-featured__text">${escapeBlogHtml(
    text
  )}</p></div><div class="shynli-blog-featured__grid">${featuredArticles
    .map(
      (article) =>
        `<a class="shynli-blog-featured__card" href="${escapeBlogAttribute(article.path)}"><span class="shynli-blog-featured__eyebrow">${escapeBlogHtml(
          article.categoryLabel
        )}</span><span class="shynli-blog-featured__card-title">${escapeBlogHtml(
          article.title
        )}</span><span class="shynli-blog-featured__card-text">${escapeBlogHtml(
          article.excerpt
        )}</span><span class="shynli-blog-featured__card-cta">Read the full article</span></a>`
    )
    .join("")}</div></section>`;
}

function buildBlogQuotePanel(detailOverrides = {}) {
  const title = detailOverrides.quoteTitle || "Prefer a professional quote instead of another tab?";
  const text =
    detailOverrides.quoteText ||
    "Leave your name and phone, and we will take you straight to the quote flow with your details already filled in.";

  return `<div class="shynli-blog-quote-panel"><div class="shynli-blog-quote-panel__copy"><p class="shynli-blog-quote-panel__eyebrow">Need help now?</p><h3 class="shynli-blog-quote-panel__title">${escapeBlogHtml(
    title
  )}</h3><p class="shynli-blog-quote-panel__text">${escapeBlogHtml(
    text
  )}</p></div><form class="shynli-blog-quote-form" data-blog-quote-form><div><label class="shynli-blog-quote-label">Your name<input class="shynli-blog-quote-input" type="text" name="name" autocomplete="name" placeholder="Enter your name" required></label></div><div><label class="shynli-blog-quote-label">Phone number<input class="shynli-blog-quote-input" type="tel" name="phone" autocomplete="tel" placeholder="(000) 000-0000" inputmode="tel" maxlength="14" required></label></div><button class="shynli-blog-quote-button" type="submit">Continue to quote</button><p class="shynli-blog-quote-hint">By submitting, you agree to our <a href="/terms-of-service">Terms of Service</a>.</p></form></div>`;
}

function buildBlogHubStyles() {
  return `<style>
#blog-topics-hub{padding:26px 0 54px;background:#faf9f6;}
#blog-topics-hub .shynli-blog-hub__shell{width:min(1180px,calc(100% - 32px));margin:0 auto;display:grid;gap:28px;}
#blog-topics-hub .shynli-blog-hub__intro{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:22px;align-items:end;}
#blog-topics-hub .shynli-blog-hub__eyebrow{margin:0 0 10px;color:#9e445a;font-family:'Montserrat',Arial,sans-serif;font-size:13px;line-height:1.2;font-weight:700;letter-spacing:.18em;text-transform:uppercase;}
#blog-topics-hub .shynli-blog-hub__title{margin:0;color:#313131;font-family:'Playfair Display',serif;font-size:56px;line-height:1.02;font-weight:400;max-width:720px;}
#blog-topics-hub .shynli-blog-hub__text{margin:16px 0 0;max-width:760px;color:#5f5954;font-family:'Montserrat',Arial,sans-serif;font-size:17px;line-height:1.7;font-weight:400;}
#blog-topics-hub .shynli-blog-hub__note{padding:22px 24px;border:1px solid rgba(158,68,90,.18);border-radius:22px;background:rgba(232,225,217,.55);color:#4c4641;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1.7;font-weight:400;}
#blog-topics-hub .shynli-blog-hub__intent-label{margin:0 0 10px;color:#313131;font-family:'Montserrat',Arial,sans-serif;font-size:13px;line-height:1.2;font-weight:700;letter-spacing:.14em;text-transform:uppercase;}
#blog-topics-hub .shynli-blog-hub__intent-list{margin:0;padding:0;list-style:none;display:grid;gap:10px;}
#blog-topics-hub .shynli-blog-hub__intent-item{display:grid;grid-template-columns:12px minmax(0,1fr);gap:10px;align-items:start;color:#4c4641;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1.65;font-weight:400;}
#blog-topics-hub .shynli-blog-hub__intent-bullet{color:#9e445a;font-weight:700;line-height:1.5;}
#blog-topics-hub .shynli-blog-hub__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;}
#blog-topics-hub .shynli-blog-topic{appearance:none;border:1px solid rgba(158,68,90,.14);border-radius:22px;padding:20px 20px 18px;background:#f3ece4;color:#313131;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:10px;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease,background-color .2s ease;text-decoration:none;box-sizing:border-box;}
#blog-topics-hub .shynli-blog-topic:hover,
#blog-topics-hub .shynli-blog-topic:focus-visible,
#blog-topics-hub .shynli-blog-topic.is-current{transform:translateY(-2px);border-color:#9e445a;background:#fff;box-shadow:0 18px 34px rgba(49,49,49,.08);outline:none;}
#blog-topics-hub .shynli-blog-topic__name{display:block;color:#1f1f1f;font-family:'Playfair Display',serif;font-size:28px;line-height:1.08;font-weight:400;}
#blog-topics-hub .shynli-blog-topic__copy{display:block;color:#66605a;font-family:'Montserrat',Arial,sans-serif;font-size:14px;line-height:1.65;font-weight:400;}
#blog-topics-hub .shynli-blog-topic.is-current .shynli-blog-topic__name{color:#9e445a;}
#blog-topics-hub .shynli-blog-featured{display:grid;gap:18px;padding:24px;border:1px solid rgba(158,68,90,.14);border-radius:24px;background:#fff;}
#blog-topics-hub .shynli-blog-featured__intro{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.8fr);gap:18px;align-items:end;}
#blog-topics-hub .shynli-blog-featured__title{margin:0;color:#313131;font-family:'Playfair Display',serif;font-size:34px;line-height:1.08;font-weight:400;}
#blog-topics-hub .shynli-blog-featured__text{margin:0;color:#5f5954;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1.7;font-weight:400;}
#blog-topics-hub .shynli-blog-featured__grid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;}
#blog-topics-hub .shynli-blog-featured__empty-note{padding:18px 20px;border-radius:20px;background:#f3ece4;border:1px dashed rgba(158,68,90,.18);color:#5f5954;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1.72;font-weight:400;}
#blog-topics-hub .shynli-blog-featured__card{display:grid;gap:12px;padding:22px;border-radius:22px;background:#f3ece4;border:1px solid rgba(158,68,90,.12);text-decoration:none;color:#313131;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;}
#blog-topics-hub .shynli-blog-featured__card:hover,
#blog-topics-hub .shynli-blog-featured__card:focus-visible{transform:translateY(-2px);border-color:#9e445a;box-shadow:0 18px 34px rgba(49,49,49,.08);outline:none;}
#blog-topics-hub .shynli-blog-featured__eyebrow{color:#9e445a;font-family:'Montserrat',Arial,sans-serif;font-size:12px;line-height:1.2;font-weight:700;letter-spacing:.16em;text-transform:uppercase;}
#blog-topics-hub .shynli-blog-featured__card-title{color:#1f1f1f;font-family:'Playfair Display',serif;font-size:32px;line-height:1.08;font-weight:400;}
#blog-topics-hub .shynli-blog-featured__card-text{color:#5f5954;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1.72;font-weight:400;}
#blog-topics-hub .shynli-blog-featured__card-cta{color:#9e445a;font-family:'Montserrat',Arial,sans-serif;font-size:14px;line-height:1.4;font-weight:700;}
#blog-topics-hub .shynli-blog-article__header{display:grid;gap:18px;padding:28px 30px;border-radius:28px;background:linear-gradient(180deg,#ffffff 0%,#f3ece4 100%);border:1px solid rgba(158,68,90,.12);}
#blog-topics-hub .shynli-blog-article__crumb{display:inline-flex;align-items:center;gap:10px;width:max-content;color:#9e445a;font-family:'Montserrat',Arial,sans-serif;font-size:13px;line-height:1.4;font-weight:700;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;}
#blog-topics-hub .shynli-blog-article__crumb:hover{text-decoration:underline;}
#blog-topics-hub .shynli-blog-article__meta{display:flex;flex-wrap:wrap;gap:10px 12px;}
#blog-topics-hub .shynli-blog-article__meta-item{display:inline-flex;align-items:center;padding:8px 12px;border-radius:999px;background:rgba(158,68,90,.08);color:#5b5550;font-family:'Montserrat',Arial,sans-serif;font-size:13px;line-height:1.3;font-weight:600;}
#blog-topics-hub .shynli-blog-article__title{margin:0;max-width:900px;color:#1f1f1f;font-family:'Playfair Display',serif;font-size:58px;line-height:1.02;font-weight:400;}
#blog-topics-hub .shynli-blog-article__excerpt{margin:0;max-width:820px;color:#4e4742;font-family:'Montserrat',Arial,sans-serif;font-size:17px;line-height:1.8;font-weight:400;}
#blog-topics-hub .shynli-blog-article__layout{display:grid;grid-template-columns:minmax(240px,280px) minmax(0,1fr);gap:28px;align-items:start;}
#blog-topics-hub .shynli-blog-article__toc{position:sticky;top:110px;display:grid;gap:16px;padding:22px;border-radius:24px;background:#fff;border:1px solid rgba(158,68,90,.12);max-height:calc(100vh - 140px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;}
#blog-topics-hub .shynli-blog-article__toc-title{margin:0;color:#313131;font-family:'Playfair Display',serif;font-size:28px;line-height:1.08;font-weight:400;}
#blog-topics-hub .shynli-blog-article__toc-list{margin:0;padding:0;list-style:none;display:grid;gap:10px;}
#blog-topics-hub .shynli-blog-article__toc-link{color:#5f5954;font-family:'Montserrat',Arial,sans-serif;font-size:14px;line-height:1.6;font-weight:500;text-decoration:none;}
#blog-topics-hub .shynli-blog-article__toc-link:hover,#blog-topics-hub .shynli-blog-article__toc-link:focus-visible{color:#9e445a;text-decoration:underline;outline:none;}
#blog-topics-hub .shynli-blog-article__content{display:grid;gap:22px;}
#blog-topics-hub .shynli-blog-article__lede,
#blog-topics-hub .shynli-blog-article__section[id],
#blog-topics-hub #blog-article-quote{scroll-margin-top:128px;}
#blog-topics-hub .shynli-blog-article__lede{display:grid;gap:18px;padding:26px 28px;border-radius:24px;background:#fff;border:1px solid rgba(158,68,90,.12);}
#blog-topics-hub .shynli-blog-article__section{display:grid;gap:16px;padding:28px;border-radius:24px;background:#fff;border:1px solid rgba(158,68,90,.1);}
#blog-topics-hub .shynli-blog-article__section h2{margin:0;color:#1f1f1f;font-family:'Playfair Display',serif;font-size:40px;line-height:1.08;font-weight:400;}
#blog-topics-hub .shynli-blog-article__section h3{margin:10px 0 0;color:#2b2623;font-family:'Playfair Display',serif;font-size:28px;line-height:1.14;font-weight:400;}
#blog-topics-hub .shynli-blog-article__section p{margin:0;color:#4f4843;font-family:'Montserrat',Arial,sans-serif;font-size:16px;line-height:1.82;font-weight:400;}
#blog-topics-hub .shynli-blog-article__soft-link{margin-top:6px;padding-top:6px;color:#5f5954;}
#blog-topics-hub .shynli-blog-article__soft-link a{color:#9e445a;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:.14em;}
#blog-topics-hub .shynli-blog-article__soft-link a:hover,
#blog-topics-hub .shynli-blog-article__soft-link a:focus-visible{color:#83384c;outline:none;}
#blog-topics-hub .shynli-blog-article__section strong{color:#2a2421;}
#blog-topics-hub .shynli-blog-article__summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}
#blog-topics-hub .shynli-blog-article__summary-card{display:grid;gap:12px;padding:20px;border-radius:22px;background:#f7f1ea;border:1px solid rgba(158,68,90,.12);}
#blog-topics-hub .shynli-blog-article__summary-eyebrow{margin:0;color:#9e445a;font-family:'Montserrat',Arial,sans-serif;font-size:12px;line-height:1.2;font-weight:700;letter-spacing:.16em;text-transform:uppercase;}
#blog-topics-hub .shynli-blog-article__summary-card h3{margin:0;color:#2b2623;font-family:'Playfair Display',serif;font-size:24px;line-height:1.12;font-weight:400;}
#blog-topics-hub .shynli-blog-article__summary-card ul{margin:0;padding:0;list-style:none;display:grid;gap:10px;}
#blog-topics-hub .shynli-blog-article__summary-card li{position:relative;padding-left:24px;color:#4f4843;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1.7;font-weight:400;}
#blog-topics-hub .shynli-blog-article__summary-card li::before{content:'';position:absolute;left:0;top:.6em;width:10px;height:10px;border-radius:999px;background:#9e445a;box-shadow:0 0 0 4px rgba(158,68,90,.1);}
#blog-topics-hub .shynli-blog-article__action-row{display:flex;flex-wrap:wrap;gap:12px;}
#blog-topics-hub .shynli-blog-article__action-button{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 22px;border:none;border-radius:999px;background:#9e445a;color:#fff;font-family:'Montserrat',Arial,sans-serif;font-size:14px;line-height:1.2;font-weight:700;text-decoration:none;cursor:pointer;transition:background-color .2s ease,transform .2s ease;box-sizing:border-box;}
#blog-topics-hub .shynli-blog-article__action-button:hover,
#blog-topics-hub .shynli-blog-article__action-button:focus-visible{background:#83384c;transform:translateY(-1px);outline:none;}
#blog-topics-hub .shynli-blog-article__action-button.is-secondary{background:#efe7de;color:#313131;border:1px solid rgba(158,68,90,.16);}
#blog-topics-hub .shynli-blog-article__action-button.is-secondary:hover,
#blog-topics-hub .shynli-blog-article__action-button.is-secondary:focus-visible{background:#e4d9cf;color:#1f1f1f;}
#blog-topics-hub .shynli-blog-article__checklist{display:grid;gap:12px;padding:20px 22px;border-radius:22px;background:#f7f1ea;border:1px solid rgba(158,68,90,.12);}
#blog-topics-hub .shynli-blog-article__checklist h3{margin:0;}
#blog-topics-hub .shynli-blog-article__checklist ul{margin:0;padding:0;list-style:none;display:grid;gap:10px;}
#blog-topics-hub .shynli-blog-article__checklist li{position:relative;padding-left:28px;color:#4f4843;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1.72;font-weight:400;}
#blog-topics-hub .shynli-blog-article__checklist li::before{content:'';position:absolute;left:0;top:.6em;width:12px;height:12px;border-radius:999px;background:#9e445a;box-shadow:0 0 0 4px rgba(158,68,90,.12);}
#blog-topics-hub .shynli-blog-article__callout{display:grid;gap:10px;padding:22px 24px;border-radius:22px;background:#efe7de;border:1px solid rgba(158,68,90,.14);}
#blog-topics-hub .shynli-blog-article__callout .shynli-blog-article__callout-eyebrow{margin:0;color:#9e445a;font-family:'Montserrat',Arial,sans-serif;font-size:12px;line-height:1.2;font-weight:700;letter-spacing:.16em;text-transform:uppercase;}
#blog-topics-hub .shynli-blog-article__callout .shynli-blog-article__callout-title{margin:0;color:#313131;font-family:'Playfair Display',serif;font-size:30px;line-height:1.08;font-weight:400;}
#blog-topics-hub .shynli-blog-article__callout .shynli-blog-article__callout-text{margin:0;color:#5f5954;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1.72;font-weight:400;}
#blog-topics-hub .shynli-blog-article__schedule{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}
#blog-topics-hub .shynli-blog-article__schedule-item{display:grid;gap:8px;padding:20px;border-radius:20px;background:#f7f1ea;border:1px solid rgba(158,68,90,.12);}
#blog-topics-hub .shynli-blog-article__schedule-item h3{margin:0;color:#2b2623;font-family:'Playfair Display',serif;font-size:24px;line-height:1.12;font-weight:400;}
#blog-topics-hub .shynli-blog-article__schedule-item p{margin:0;color:#4f4843;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1.72;font-weight:400;}
#blog-topics-hub .shynli-blog-article__faq{display:grid;gap:14px;}
#blog-topics-hub .shynli-blog-article__faq-item{display:grid;gap:10px;padding:18px 20px;border-radius:20px;background:#f7f1ea;border:1px solid rgba(158,68,90,.12);}
#blog-topics-hub .shynli-blog-article__faq-item h3{margin:0;color:#2b2623;font-family:'Playfair Display',serif;font-size:24px;line-height:1.14;font-weight:400;}
#blog-topics-hub .shynli-blog-article__footer-note{display:grid;gap:8px;padding:22px 24px;border-radius:22px;background:#efe7de;border:1px solid rgba(158,68,90,.12);}
#blog-topics-hub .shynli-blog-article__footer-note-title{margin:0;color:#313131;font-family:'Playfair Display',serif;font-size:28px;line-height:1.08;font-weight:400;}
#blog-topics-hub .shynli-blog-article__footer-note-text{margin:0;color:#5f5954;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1.72;font-weight:400;}
#blog-topics-hub .shynli-blog-quote-panel{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,420px);gap:26px;align-items:center;padding:30px;border-radius:28px;background:#313131;color:#faf9f6;overflow:hidden;}
#blog-topics-hub .shynli-blog-quote-panel__eyebrow{margin:0 0 10px;color:#d8cfc4;font-family:'Montserrat',Arial,sans-serif;font-size:13px;line-height:1.2;font-weight:700;letter-spacing:.18em;text-transform:uppercase;}
#blog-topics-hub .shynli-blog-quote-panel__title{margin:0;color:#faf9f6;font-family:'Playfair Display',serif;font-size:40px;line-height:1.04;font-weight:400;max-width:520px;}
#blog-topics-hub .shynli-blog-quote-panel__text{margin:14px 0 0;color:rgba(250,249,246,.78);font-family:'Montserrat',Arial,sans-serif;font-size:16px;line-height:1.7;font-weight:400;max-width:560px;}
#blog-topics-hub .shynli-blog-quote-form{display:grid;gap:12px;padding:22px;border-radius:24px;background:rgba(250,249,246,.08);backdrop-filter:blur(8px);}
#blog-topics-hub .shynli-blog-quote-form>*{min-width:0;}
#blog-topics-hub .shynli-blog-quote-label{display:block;margin:0 0 6px;color:#faf9f6;font-family:'Montserrat',Arial,sans-serif;font-size:13px;line-height:1.4;font-weight:600;}
#blog-topics-hub .shynli-blog-quote-input{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:14px 16px;background:#faf9f6;color:#313131;font-family:'Montserrat',Arial,sans-serif;font-size:16px;line-height:1.4;}
#blog-topics-hub .shynli-blog-quote-input:focus{outline:none;border-color:#9e445a;box-shadow:0 0 0 3px rgba(158,68,90,.18);}
#blog-topics-hub .shynli-blog-quote-button{display:flex;align-items:center;justify-content:center;width:100%;min-height:68px;margin:0;padding:18px 24px;border:none;border-radius:999px;background:#9e445a;color:#fff;font-family:'Montserrat',Arial,sans-serif;font-size:15px;line-height:1;font-weight:700;cursor:pointer;transition:background-color .2s ease,transform .2s ease;box-sizing:border-box;appearance:none;-webkit-appearance:none;text-align:center;}
#blog-topics-hub .shynli-blog-quote-button:hover,#blog-topics-hub .shynli-blog-quote-button:focus-visible{background:#83384c;transform:translateY(-1px);outline:none;}
#blog-topics-hub .shynli-blog-quote-hint{margin:0;color:rgba(250,249,246,.68);font-family:'Montserrat',Arial,sans-serif;font-size:12px;line-height:1.55;font-weight:400;}
#blog-topics-hub .shynli-blog-quote-hint a{color:inherit;text-decoration:underline;}
@media screen and (max-width:1199px){
  #blog-topics-hub .shynli-blog-hub__title{font-size:50px;}
  #blog-topics-hub .shynli-blog-topic__name{font-size:26px;}
  #blog-topics-hub .shynli-blog-featured__card-title{font-size:29px;}
  #blog-topics-hub .shynli-blog-article__section h2{font-size:36px;}
  #blog-topics-hub .shynli-blog-quote-panel__title{font-size:36px;}
}
@media screen and (max-width:959px){
  #blog-topics-hub{padding:18px 0 42px;}
  #blog-topics-hub .shynli-blog-hub__intro,
  #blog-topics-hub .shynli-blog-featured__intro,
  #blog-topics-hub .shynli-blog-article__layout{grid-template-columns:1fr;}
  #blog-topics-hub .shynli-blog-hub__title{font-size:42px;max-width:none;}
  #blog-topics-hub .shynli-blog-hub__grid,
  #blog-topics-hub .shynli-blog-article__summary-grid,
  #blog-topics-hub .shynli-blog-article__schedule{grid-template-columns:repeat(2,minmax(0,1fr));}
  #blog-topics-hub .shynli-blog-article__toc{position:static;}
  #blog-topics-hub .shynli-blog-quote-panel{grid-template-columns:1fr;}
}
@media screen and (max-width:639px){
  #blog-topics-hub .shynli-blog-hub__shell{width:min(100% - 24px,1180px);}
  #blog-topics-hub .shynli-blog-hub__title{font-size:34px;}
  #blog-topics-hub .shynli-blog-hub__text{font-size:15px;}
  #blog-topics-hub .shynli-blog-hub__grid,
  #blog-topics-hub .shynli-blog-article__summary-grid,
  #blog-topics-hub .shynli-blog-article__schedule{grid-template-columns:1fr;}
  #blog-topics-hub .shynli-blog-topic{padding:18px 18px 16px;border-radius:20px;}
  #blog-topics-hub .shynli-blog-topic__name{font-size:25px;}
  #blog-topics-hub .shynli-blog-featured,
  #blog-topics-hub .shynli-blog-article__header,
  #blog-topics-hub .shynli-blog-article__lede,
  #blog-topics-hub .shynli-blog-article__section{padding:22px;border-radius:22px;}
  #blog-topics-hub .shynli-blog-article__title{font-size:40px;line-height:1.05;}
  #blog-topics-hub .shynli-blog-featured__title,
  #blog-topics-hub .shynli-blog-featured__card-title{font-size:28px;}
  #blog-topics-hub .shynli-blog-article__section h2{font-size:31px;}
  #blog-topics-hub .shynli-blog-article__section h3,
  #blog-topics-hub .shynli-blog-article__faq-item h3{font-size:24px;}
  #blog-topics-hub .shynli-blog-article__callout-title,
  #blog-topics-hub .shynli-blog-article__toc-title,
  #blog-topics-hub .shynli-blog-article__footer-note-title{font-size:26px;}
  #blog-topics-hub .shynli-blog-quote-panel{padding:22px;border-radius:24px;}
  #blog-topics-hub .shynli-blog-quote-panel__title{font-size:28px;}
  #blog-topics-hub .shynli-blog-quote-form{padding:0;}
}
</style>`;
}

function buildMainBlogHubSection() {
  return `<section id="blog-topics-hub" class="shynli-blog-hub">${buildBlogHubStyles()}<div class="shynli-blog-hub__shell"><div class="shynli-blog-hub__intro"><div><p class="shynli-blog-hub__eyebrow">Browse by topic</p><h2 class="shynli-blog-hub__title">Find the cleaning guide you actually need.</h2><p class="shynli-blog-hub__text">Use these topic clusters to jump into checklists, service explainers, room-by-room guides, turnover prep, seasonal routines, and practical shortcuts for keeping a home cleaner between visits.</p></div><div class="shynli-blog-hub__note">Every article is meant to be genuinely useful first, with a clear next step if you would rather hand the cleaning off to a professional team.</div></div><div class="shynli-blog-hub__grid">${buildBlogTopicCards(
    ""
  )}</div>${buildBlogQuotePanel()}</div></section>`;
}

function buildCategoryBlogHubSection(detail) {
  return `<section id="blog-topics-hub" class="shynli-blog-hub shynli-blog-hub--category">${buildBlogHubStyles()}<div class="shynli-blog-hub__shell"><div class="shynli-blog-hub__intro"><div><p class="shynli-blog-hub__eyebrow">Blog category</p><h2 class="shynli-blog-hub__title">${escapeBlogHtml(
    detail.sectionTitle
  )}</h2><p class="shynli-blog-hub__text">${escapeBlogHtml(detail.sectionText)}</p></div><div class="shynli-blog-hub__note"><p class="shynli-blog-hub__intent-label">Popular search angles</p><ul class="shynli-blog-hub__intent-list">${buildBlogIntentsList(
    detail
  )}</ul></div></div>${buildFeaturedArticleCards(detail.path)}<div class="shynli-blog-hub__grid">${buildBlogTopicCards(
    detail.path
  )}</div>${buildBlogQuotePanel(detail)}</div></section>`;
}

function buildBlogArticleTableOfContents(article) {
  return article.toc
    .map(
      (item) =>
        `<li><a class="shynli-blog-article__toc-link" href="${escapeBlogAttribute(
          `${article.path}#${item.id}`
        )}" data-target-id="${escapeBlogAttribute(item.id)}">${escapeBlogHtml(
          item.label
        )}</a></li>`
    )
    .join("");
}

function buildBlogArticleSection(article) {
  return `<section id="blog-topics-hub" class="shynli-blog-hub shynli-blog-hub--article">${buildBlogHubStyles()}<div class="shynli-blog-hub__shell"><header class="shynli-blog-article__header"><a class="shynli-blog-article__crumb" href="${escapeBlogAttribute(
    article.categoryPath
  )}">Back to ${escapeBlogHtml(article.categoryLabel)}</a><h1 class="shynli-blog-article__title">${escapeBlogHtml(
    article.title
  )}</h1><div class="shynli-blog-article__meta"><span class="shynli-blog-article__meta-item">${escapeBlogHtml(
    article.categoryLabel
  )}</span><span class="shynli-blog-article__meta-item">${escapeBlogHtml(
    article.updatedLabel
  )}</span><span class="shynli-blog-article__meta-item">${escapeBlogHtml(
    article.readTime
  )}</span></div><p class="shynli-blog-article__excerpt">${escapeBlogHtml(
    article.excerpt
  )}</p></header><div class="shynli-blog-article__layout"><aside class="shynli-blog-article__toc"><div><p class="shynli-blog-hub__eyebrow">On this page</p><h2 class="shynli-blog-article__toc-title">Quick navigation</h2></div><ul class="shynli-blog-article__toc-list">${buildBlogArticleTableOfContents(
    article
  )}</ul></aside><article class="shynli-blog-article__content">${article.bodyHtml}</article></div><div id="blog-article-quote">${buildBlogQuotePanel(
    article
  )}</div></div></section>`;
}

function buildBlogHubSection(routePath) {
  const article = getBlogArticle(routePath);
  if (article) return buildBlogArticleSection(article);
  const detail = getBlogCategoryDetail(routePath);
  if (detail) return buildCategoryBlogHubSection(detail);
  return buildMainBlogHubSection();
}

function buildBlogHeroHeading(routePath) {
  const article = getBlogArticle(routePath);
  if (article) {
    const categoryDetail = getBlogCategoryDetail(routePath);
    if (!categoryDetail) return "";
    return `<div class='tn-atom'field='tn_text_1768231764218'>${escapeBlogHtml(
      categoryDetail.heroLead
    )} <span style="color: rgb(158, 68, 90);">${escapeBlogHtml(categoryDetail.heroAccent)}</span></div>`;
  }
  const detail = getBlogCategoryDetail(routePath);
  if (!detail) return "";
  return `<h1 class='tn-atom'field='tn_text_1768231764218'>${escapeBlogHtml(
    detail.heroLead
  )} <span style="color: rgb(158, 68, 90);">${escapeBlogHtml(detail.heroAccent)}</span></h1>`;
}

function buildBlogRuntimeScript(routePath) {
  return `<script id="shynli-blog-topic-hub-script">
(function(){
  if(window.__shynliBlogHubInit) return;
  window.__shynliBlogHubInit = true;

  function formatPhone(digits){
    if(!digits) return '';
    if(digits.length<=3) return '('+digits;
    if(digits.length<=6) return '('+digits.slice(0,3)+') '+digits.slice(3);
    return '('+digits.slice(0,3)+') '+digits.slice(3,6)+'-'+digits.slice(6,10);
  }

  function bindQuoteForm(form){
    if(!form || form.dataset.bound === '1') return;
    var nameInput = form.querySelector('input[name="name"]');
    var phoneInput = form.querySelector('input[name="phone"]');
    if(!nameInput || !phoneInput) return;

    form.dataset.bound = '1';

    phoneInput.addEventListener('input', function(event){
      var digits = String(event.target.value || '').replace(/\\D/g,'');
      if(digits.startsWith('1') && digits.length === 11) digits = digits.slice(1);
      if(digits.length > 10) digits = digits.slice(0,10);
      event.target.value = formatPhone(digits);
    });

    phoneInput.addEventListener('keydown', function(event){
      var digits = String(phoneInput.value || '').replace(/\\D/g,'');
      if(digits.startsWith('1') && digits.length === 11) digits = digits.slice(1);
      if(
        digits.length >= 10 &&
        event.key !== 'Backspace' &&
        event.key !== 'Delete' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.key.startsWith('Arrow') &&
        event.key !== 'Tab'
      ){
        event.preventDefault();
      }
    });

    form.addEventListener('submit', function(event){
      event.preventDefault();
      var name = (nameInput.value || '').trim();
      var phone = (phoneInput.value || '').trim();
      if(!name || !phone){
        window.alert('Please fill in all fields');
        return;
      }

      var phoneDigits = phone.replace(/\\D/g,'');
      if(phoneDigits.startsWith('1') && phoneDigits.length === 11) phoneDigits = phoneDigits.slice(1);
      if(phoneDigits.length !== 10){
        window.alert('Please enter a valid 10-digit phone number');
        return;
      }

      var formattedPhone = '+1 ' + phoneInput.value;
      try{
        sessionStorage.setItem('homeWidgetName', name);
        sessionStorage.setItem('homeWidgetPhone', formattedPhone);
      }catch(error){}

      var quoteParams = new URLSearchParams({ name: name, phone: formattedPhone });
      window.location.href = '/quote?' + quoteParams.toString();
    });
  }

  function initQuoteForms(root){
    Array.prototype.slice.call((root || document).querySelectorAll('[data-blog-quote-form]')).forEach(bindQuoteForm);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      initQuoteForms(document);
    }, { once: true });
  }else{
    initQuoteForms(document);
  }
})();
</script>`;
}

function buildBlogArticleSchema(article, routeSeo) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description || article.excerpt || "",
    datePublished: article.publishedAt,
    dateModified: article.publishedAt,
    articleSection: article.categoryLabel,
    mainEntityOfPage: routeSeo.canonical,
    url: routeSeo.canonical,
    author: {
      "@type": "Organization",
      name: "Shynli Cleaning",
    },
    publisher: {
      "@type": "Organization",
      name: "Shynli Cleaning",
      logo: {
        "@type": "ImageObject",
        url: "https://shynlicleaningservice.com/images/tild3666-3333-4430-b664-383666616530__logo_2.png",
      },
    },
  };
}

function rebuildBlogHubSection(html, routePath) {
  const normalizedRoute = normalizeRoute(routePath);
  if (!isManagedBlogRoute(normalizedRoute)) {
    return html;
  }
  if (!BLOG_HUB_SECTION_PATTERN.test(html)) return html;
  return html.replace(BLOG_HUB_SECTION_PATTERN, buildBlogHubSection(normalizedRoute));
}

function rebuildBlogRuntimeScript(html, routePath) {
  const normalizedRoute = normalizeRoute(routePath);
  if (!isManagedBlogRoute(normalizedRoute)) {
    return html;
  }
  if (!BLOG_RUNTIME_SCRIPT_PATTERN.test(html)) return html;
  return html.replace(BLOG_RUNTIME_SCRIPT_PATTERN, buildBlogRuntimeScript(normalizedRoute));
}

function rebuildBlogHeroHeading(html, routePath) {
  const heroHeading = buildBlogHeroHeading(routePath);
  if (!heroHeading) return html;
  if (!BLOG_HERO_HEADING_PATTERN.test(html)) return html;
  return html.replace(BLOG_HERO_HEADING_PATTERN, heroHeading);
}

function removeBlogLegacyFeedSections(html, routePath) {
  if (!isManagedBlogRoute(routePath)) return html;
  return html.replace(BLOG_EMPTY_FEEDS_PATTERN, "").replace(BLOG_LEGACY_FEED_SECTION_PATTERN, "");
}

function removeBlogFeedAssets(html, routePath) {
  if (!isManagedBlogRoute(routePath)) return html;
  return html
    .replace(/<link[^>]+href="css\/tilda-feed-1\.1\.min\.css"[^>]*>\s*/g, "")
    .replace(/<link[^>]+href="css\/tilda-slds-1\.4\.min\.css"[^>]*>\s*/g, "")
    .replace(/<noscript>\s*<link[^>]+href="css\/tilda-slds-1\.4\.min\.css"[^>]*>\s*<\/noscript>\s*/g, "")
    .replace(/<script[^>]+src="js\/tilda-feed-1\.1\.min\.js"[^>]*><\/script>\s*/g, "")
    .replace(/<script[^>]+src="js\/tilda-slds-1\.4\.min\.js"[^>]*><\/script>\s*/g, "")
    .replace(/<script[^>]+src="js\/hammer\.min\.js"[^>]*><\/script>\s*/g, "")
    .replace(/<script>\s*t_onReady\(function\(\)\s*\{[\s\S]*?t_feed_init\([\s\S]*?<\/script>\s*/g, "")
    .replace(/<template id="button_showmore_[^"]+">[\s\S]*?<\/template>\s*/g, "");
}

const FULL_CARD_CLICK_SCRIPT = `<script id="full-card-click-handler">
(() => {
  if (window.__fullCardClickHandlerBound) return;
  window.__fullCardClickHandlerBound = true;

  const interactiveSelector = "a, button, input, select, textarea, label";

  function openLink(link, event) {
    if (event && (event.metaKey || event.ctrlKey)) {
      window.open(link.href, "_blank", "noopener");
      return;
    }
    window.location.href = link.href;
  }

  function initCardLinks() {
    const groups = document.querySelectorAll(".tn-group[data-group-type-value='physical']");
    groups.forEach((group) => {
      if (group.dataset.fullCardLinkBound === "1") return;

      const cardLink = Array.from(group.querySelectorAll("a.tn-atom[href]")).find((link) => {
        const text = (link.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
        return text.includes("learn more");
      });

      if (!cardLink) return;

      group.dataset.fullCardLinkBound = "1";
      group.style.cursor = "pointer";
      group.setAttribute("role", "link");
      if (!group.hasAttribute("tabindex")) group.setAttribute("tabindex", "0");

      group.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        if (event.target.closest(interactiveSelector)) return;
        openLink(cardLink, event);
      });

      group.addEventListener("keydown", (event) => {
        if (event.target !== group) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openLink(cardLink, event);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCardLinks);
  } else {
    initCardLinks();
  }
})();
</script>`;

const RUNTIME_CONFIG_SCRIPT = `<script id="runtime-config">
window.__shynliRuntimeConfig = Object.assign({}, window.__shynliRuntimeConfig || {}, {
  googlePlacesApiKey: ${JSON.stringify(GOOGLE_PLACES_API_KEY)}
});
</script>`;

const SHARED_ICON_PATH = "/images/tild3636-3965-4134-a432-323337623835__insta_32.png";
const SHARED_MANIFEST_PATH = "/site.webmanifest";

const MOBILE_STICKY_CTA_SCRIPT = `<script id="mobile-sticky-cta">
(() => {
  if (window.__mobileStickyCtaBound) return;
  window.__mobileStickyCtaBound = true;

  const PHONE = "+16308127077";
  const EXCLUDED_PATHS = new Set(["/quote", "/quote2"]);
  const MOBILE_QUERY = "(max-width: 960px)";
  const CTA_TEXT_PATTERNS = ["book now", "book your cleaning", "order services", "call us"];
  const LEGACY_CTA_SELECTOR = [
    "a[href='/quote']",
    "a[href='tel:+16308127077']",
    ".t943__buttonwrapper",
    ".t943",
    ".t-btn",
    ".t-btnflex",
    ".t228",
    ".tmenu-mobile",
    ".t396__elem",
    "[style*='position:fixed']",
    "[style*='position: fixed']",
    "[style*='position:sticky']",
    "[style*='position: sticky']"
  ].join(",");

  let hideLegacyScheduled = false;

  function isMobileViewport() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function normalizeNodeText(node) {
    return (node && node.textContent ? node.textContent : "").replace(/\\s+/g, " ").trim().toLowerCase();
  }

  function looksLikeLegacyCta(node) {
    if (!(node instanceof HTMLElement)) return false;
    const text = normalizeNodeText(node);
    const href = node.getAttribute("href") || "";
    return CTA_TEXT_PATTERNS.some((pattern) => text.includes(pattern)) || href === "/quote" || href === "tel:+16308127077";
  }

  function maybeHideLegacyCta(candidate) {
    if (!isMobileViewport()) return;
    if (!(candidate instanceof HTMLElement)) return;

    const ourBar = document.getElementById("mobileStickyCta");
    if (candidate === ourBar || (ourBar && ourBar.contains(candidate))) return;

    const target = candidate.closest(".t943__buttonwrapper,.t943,.t396__elem,.t-btn,.t-btnflex,.t-rec,.t228,.tmenu-mobile") || candidate;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === "mobileStickyCta" || (ourBar && ourBar.contains(target))) return;
    if (target.hasAttribute("data-legacy-mobile-cta-hidden")) return;
    if (!looksLikeLegacyCta(target) && !looksLikeLegacyCta(candidate)) return;

    const style = window.getComputedStyle(target);
    if (style.position !== "fixed" && style.position !== "sticky") return;

    const rect = target.getBoundingClientRect();
    if (rect.top <= window.innerHeight * 0.55) return;

    target.style.setProperty("display", "none", "important");
    target.setAttribute("data-legacy-mobile-cta-hidden", "true");
  }

  function hideLegacyStickyCtas() {
    if (!isMobileViewport()) return;
    document.querySelectorAll(LEGACY_CTA_SELECTOR).forEach(maybeHideLegacyCta);
  }

  function scheduleHideLegacyStickyCtas() {
    if (!isMobileViewport() || hideLegacyScheduled) return;
    hideLegacyScheduled = true;
    const run = () => {
      hideLegacyScheduled = false;
      hideLegacyStickyCtas();
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(run);
    } else {
      window.setTimeout(run, 16);
    }
  }

  function initStickyCta() {
    const currentPath = (((window.location && window.location.pathname) || "").replace(/\\/+$/, "") || "/");
    if (EXCLUDED_PATHS.has(currentPath)) return;
    if (document.getElementById("mobileStickyCta")) return;

    const style = document.createElement("style");
    style.textContent = \`
      @media (max-width: 960px) {
        body.has-mobile-sticky-cta {
          padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)) !important;
        }
        #mobileStickyCta {
          position: fixed;
          left: 10px;
          right: 10px;
          bottom: calc(10px + env(safe-area-inset-bottom, 0px));
          z-index: 10050;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          pointer-events: auto;
          opacity: 0;
          visibility: hidden;
          transform: translateY(12px);
          transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s ease;
        }
        #mobileStickyCta.is-visible {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }
        #mobileStickyCta a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 48px;
          border-radius: 999px;
          text-decoration: none;
          font-family: Montserrat, Arial, sans-serif;
          font-size: 15px;
          font-weight: 600;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
        }
        #mobileStickyCta .cta-book {
          background: #9e435a;
          color: #ffffff;
        }
        #mobileStickyCta .cta-call {
          background: #faf9f6;
          color: #9e435a;
          border: 1px solid #9e435a;
        }
      }
      @media (min-width: 961px) {
        #mobileStickyCta { display: none !important; }
      }
    \`;
    document.head.appendChild(style);

    const wrap = document.createElement("div");
    wrap.id = "mobileStickyCta";
    wrap.innerHTML = \`
      <a class="cta-book" href="/quote">Book Now</a>
      <a class="cta-call" href="tel:\${PHONE}">Call Us</a>
    \`;
    document.body.appendChild(wrap);

    function updateCtaVisibility() {
      const isMobile = isMobileViewport();
      if (!isMobile) {
        wrap.classList.remove("is-visible");
        document.body.classList.remove("has-mobile-sticky-cta");
        return;
      }

      // Show CTA only after user scrolls roughly one full screen ("second scroll and below").
      const shouldShow = window.scrollY > window.innerHeight * 0.95;
      wrap.classList.toggle("is-visible", shouldShow);
      document.body.classList.toggle("has-mobile-sticky-cta", shouldShow);
    }

    hideLegacyStickyCtas();
    updateCtaVisibility();
    const observer = new MutationObserver(() => scheduleHideLegacyStickyCtas());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", () => {
      updateCtaVisibility();
      scheduleHideLegacyStickyCtas();
    }, { passive: true });
    window.addEventListener("scroll", () => {
      updateCtaVisibility();
    }, { passive: true });
    setTimeout(scheduleHideLegacyStickyCtas, 300);
    setTimeout(scheduleHideLegacyStickyCtas, 1000);
    setTimeout(scheduleHideLegacyStickyCtas, 2000);
    setTimeout(updateCtaVisibility, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStickyCta);
  } else {
    initStickyCta();
  }
})();
</script>`;

const DEEP_CLEANING_MOBILE_FIX = `<script id="deep-cleaning-addons-rebuild">
(() => {
  const path = ((window.location && window.location.pathname) || "").replace(/\\/+$/, "") || "/";
  if (path !== "/services/deep-cleaning") return;

  const source = document.getElementById("rec1778752123");
  const anchor = document.getElementById("rec1778752133");
  if (!source || !anchor || document.getElementById("deep-cleaning-addons-rebuild-root")) return;

  const style = document.createElement("style");
  style.id = "deep-cleaning-addons-rebuild-style";
  style.textContent = [
    "#rec1778752123{display:none !important;}",
    "#deep-cleaning-addons-rebuild-root{background:#faf9f6;padding:0 0 56px;}",
    ".dc-addons{max-width:1200px;margin:0 auto;padding:0 20px;box-sizing:border-box;color:#313131;}",
    ".dc-addons__title{margin:0;text-align:center;font-family:'Playfair Display',serif;font-size:48px;line-height:1.14;font-weight:400;}",
    ".dc-addons__title-accent{color:#9e435a;}",
    ".dc-addons__subtitle{margin:14px 0 38px;text-align:center;font-family:'Montserrat',sans-serif;font-size:18px;line-height:1.35;font-weight:400;}",
    ".dc-addons__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px 80px;align-items:start;}",
    ".dc-addons__group-title{margin:0 0 26px;font-family:'Playfair Display',serif;font-size:32px;line-height:1.12;font-weight:400;color:#ddd8d2;}",
    ".dc-addons__list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:24px;}",
    ".dc-addons__item{display:grid;grid-template-columns:40px minmax(0,1fr);gap:16px;align-items:start;}",
    ".dc-addons__item-label{font-family:'Montserrat',sans-serif;font-size:18px;line-height:1.35;font-weight:400;color:#313131;}",
    ".dc-addons__item-label strong{font-weight:700;}",
    ".dc-addons__icon{width:32px;height:32px;display:block;flex:none;margin-top:2px;}",
    ".dc-addons__note{margin:52px 0 30px;display:grid;grid-template-columns:56px minmax(0,1fr);gap:16px;align-items:start;}",
    ".dc-addons__note-box{background:#d8cfc4;border-radius:24px;padding:24px 28px;min-height:72px;display:flex;align-items:center;box-sizing:border-box;}",
    ".dc-addons__note-text{font-family:'Playfair Display',serif;font-size:32px;line-height:1.15;font-weight:400;color:#313131;}",
    ".dc-addons__cta{display:flex;flex-direction:column;align-items:center;gap:10px;}",
    ".dc-addons__button{display:inline-flex;align-items:center;justify-content:center;min-width:300px;min-height:70px;padding:0 32px;border-radius:999px;background:#9e435a;color:#faf9f6;text-decoration:none;font-family:'Montserrat',sans-serif;font-size:16px;font-weight:500;line-height:1;box-sizing:border-box;transition:background-color .2s ease;}",
    ".dc-addons__button:hover{background:#6e2e3e;color:#faf9f6;}",
    ".dc-addons__helper{font-family:'Montserrat',sans-serif;font-size:12px;line-height:1.35;font-weight:400;color:#6a665f;text-align:center;}",
    "@media (max-width:959px){.dc-addons__title{font-size:42px;}.dc-addons__grid{gap:40px 48px;}.dc-addons__note-text{font-size:28px;}}",
    "@media (max-width:639px){#deep-cleaning-addons-rebuild-root{padding:0 0 44px;}.dc-addons{padding:0 16px;}.dc-addons__title{font-size:34px;}.dc-addons__subtitle{font-size:16px;margin:12px 0 30px;}.dc-addons__grid{grid-template-columns:1fr;gap:28px;}.dc-addons__group-title{font-size:26px;margin-bottom:20px;}.dc-addons__list{gap:20px;}.dc-addons__item{grid-template-columns:34px minmax(0,1fr);gap:14px;}.dc-addons__item-label{font-size:16px;line-height:1.32;}.dc-addons__icon{width:28px;height:28px;}.dc-addons__note{margin:36px 0 24px;grid-template-columns:48px minmax(0,1fr);gap:12px;}.dc-addons__note-box{padding:20px 22px;border-radius:22px;}.dc-addons__note-text{font-size:24px;line-height:1.14;}.dc-addons__button{min-width:100%;min-height:58px;font-size:15px;}.dc-addons__helper{font-size:11px;}}",
    "@media (max-width:479px){.dc-addons__title{font-size:24px;line-height:1.18;}.dc-addons__title-accent{display:block;}.dc-addons__subtitle{font-size:13px;line-height:1.4;margin:10px 0 22px;}.dc-addons__group-title{font-size:22px;line-height:1.1;}.dc-addons__item{grid-template-columns:28px minmax(0,1fr);gap:12px;}.dc-addons__item-label{font-size:14px;line-height:1.3;}.dc-addons__icon{width:24px;height:24px;margin-top:1px;}.dc-addons__note{margin:30px 0 22px;grid-template-columns:42px minmax(0,1fr);gap:10px;}.dc-addons__note-box{padding:18px 18px 20px;border-radius:20px;}.dc-addons__note-text{font-size:17px;line-height:1.18;}.dc-addons__button{min-height:52px;font-size:14px;padding:0 20px;}}"
  ].join("\\n");
  document.head.appendChild(style);

  const star = '<svg class="dc-addons__icon" viewBox="0 0 24.13916015625 24" aria-hidden="true" focusable="false"><path fill="#9E445A" fill-rule="evenodd" clip-rule="evenodd" d="M15.702399252980026 8.2878197965327L12.053404352247101 0L8.350332755617751 8.2878197965327L-0.00009127041340810245 11.942911701634987L8.326467338514819 15.598028492469394L11.975437353515623 23.890178406390948L15.678533835877094 15.598028492469394L24.028966134423325 11.942911701634987L15.702399252980026 8.2878197965327Z"></path></svg>';

  const leftItems = [
    'Inside Fridge — <strong>$45</strong>',
    'Inside Oven — <strong>$45</strong>',
    'Interior Windows — <strong>$6 per window</strong>',
    'Wet Baseboards — <strong>$22</strong>'
  ];

  const rightItems = [
    'Inside Cabinets (empty) — <strong>$45</strong>',
    'Polishing wooden furniture — <strong>$20</strong>',
    'Bed linen replacement — <strong>$8</strong>',
    'Doors — <strong>$22</strong>'
  ];

  const renderItems = (items) => items.map((item) =>
    '<li class="dc-addons__item">' +
      star +
      '<span class="dc-addons__item-label">' + item + '</span>' +
    '</li>'
  ).join('');

  const root = document.createElement("section");
  root.id = "deep-cleaning-addons-rebuild-root";
  root.innerHTML =
    '<div class="dc-addons">' +
      '<h2 class="dc-addons__title">Take Your Deep Cleaning <span class="dc-addons__title-accent">Even Further</span></h2>' +
      '<p class="dc-addons__subtitle">Add these services to any deep cleaning</p>' +
      '<div class="dc-addons__grid">' +
        '<div class="dc-addons__group">' +
          '<h3 class="dc-addons__group-title">Interior Add-Ons:</h3>' +
          '<ul class="dc-addons__list">' + renderItems(leftItems) + '</ul>' +
        '</div>' +
        '<div class="dc-addons__group">' +
          '<h3 class="dc-addons__group-title">Extra Focus:</h3>' +
          '<ul class="dc-addons__list">' + renderItems(rightItems) + '</ul>' +
        '</div>' +
      '</div>' +
      '<div class="dc-addons__note">' +
        star +
        '<div class="dc-addons__note-box"><div class="dc-addons__note-text">Most add-ons are recommended after your first recurring visit.</div></div>' +
      '</div>' +
      '<div class="dc-addons__cta">' +
        '<a class="dc-addons__button" href="/quote">Start with Deep Cleaning</a>' +
        '<div class="dc-addons__helper">Recommended before recurring service</div>' +
      '</div>' +
    '</div>';

  source.style.display = "none";
  anchor.parentNode.insertBefore(root, anchor);
})();
</script>`;

const MOBILE_CONTACT_DETAILS_FIX = `<script id="mobile-contact-details-fix">
(() => {
  if (window.__mobileContactDetailsFixBound) return;
  window.__mobileContactDetailsFixBound = true;

  const CONTACT_ELEMENT_IDS = [
    "1767883949420",
    "1767883278623",
    "1767883278634",
    "1767883278627"
  ];

  function ensureStyle() {
    if (document.getElementById("mobile-contact-details-fix-style")) return;

    const style = document.createElement("style");
    style.id = "mobile-contact-details-fix-style";
    style.textContent = "@media (max-width: 640px) {" +
      ".tn-elem[data-elem-id='1767883949420']," +
      ".tn-elem[data-elem-id='1767883278623']," +
      ".tn-elem[data-elem-id='1767883278634']," +
      ".tn-elem[data-elem-id='1767883278627'] {" +
      "z-index: 12 !important;" +
      "opacity: 1 !important;" +
      "visibility: visible !important;" +
      "}" +
      ".tn-elem[data-elem-id='1767883949420'] .tn-atom," +
      ".tn-elem[data-elem-id='1767883278623'] .tn-atom," +
      ".tn-elem[data-elem-id='1767883278634'] .tn-atom," +
      ".tn-elem[data-elem-id='1767883278627'] .tn-atom {" +
      "opacity: 1 !important;" +
      "visibility: visible !important;" +
      "}" +
      "}";
    document.head.appendChild(style);
  }

  function raiseContacts() {
    if (!window.matchMedia("(max-width: 640px)").matches) return;

    CONTACT_ELEMENT_IDS.forEach((id) => {
      document.querySelectorAll('.tn-elem[data-elem-id="' + id + '"]').forEach((element) => {
        element.style.setProperty("z-index", "12", "important");
        element.style.setProperty("opacity", "1", "important");
        element.style.setProperty("visibility", "visible", "important");
      });
    });
  }

  function applyFix() {
    ensureStyle();
    raiseContacts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyFix, { once: true });
  } else {
    applyFix();
  }

  window.addEventListener("load", applyFix);
})();
</script>`;

const PRICING_CALCULATOR_SCROLL_SCRIPT = `<script id="pricing-calculator-scroll">
(() => {
  const path = ((window.location && window.location.pathname) || "").replace(/\\/+$/, "") || "/";
  if (path !== "/pricing") return;
  if (window.__pricingCalculatorScrollBound) return;
  window.__pricingCalculatorScrollBound = true;

  function getHeaderOffset() {
    const candidates = [
      document.querySelector(".t1272"),
      document.querySelector(".t228"),
      document.querySelector(".t-menu__wrapper"),
      document.querySelector(".tmenu-mobile")
    ].filter((node) => node instanceof HTMLElement);

    const header = candidates.find((node) => {
      const style = window.getComputedStyle(node);
      return style.position === "fixed" || style.position === "sticky";
    });

    if (!(header instanceof HTMLElement)) return 24;
    return Math.max(24, Math.ceil(header.getBoundingClientRect().height) + 16);
  }

  function scrollToCalculator(event) {
    const target =
      document.getElementById("calc") ||
      document.getElementById("rec1787758753") ||
      document.querySelector('a[name="calc"]');
    if (!target) return;

    event.preventDefault();
    const top = target.getBoundingClientRect().top + window.pageYOffset - getHeaderOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

    if (typeof history !== "undefined" && typeof history.replaceState === "function") {
      history.replaceState(null, "", "#calc");
    }
  }

  function bind() {
    document.querySelectorAll('a[href="#calc"]').forEach((link) => {
      if (!(link instanceof HTMLElement)) return;
      if (link.dataset.calcScrollBound === "1") return;
      link.dataset.calcScrollBound = "1";
      link.addEventListener("click", scrollToCalculator);
    });
  }

  bind();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  }
})();
</script>`;

const SAFARI_HOME_LAYOUT_FIX = `<script id="safari-home-layout-fix">
(() => {
  if (window.__safariHomeLayoutFixBound) return;
  window.__safariHomeLayoutFixBound = true;

  const ua = navigator.userAgent || "";
  const isSafari =
    /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua);
  if (!isSafari) return;

  document.documentElement.classList.add("is-safari");

  const style = document.createElement("style");
  style.textContent = \`
@media (min-width: 960px) {
  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361452"],
  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361489"],
  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361458"],
  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361493"] {
    height: auto !important;
  }

  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361452"] {
    top: 286px !important;
    width: 540px !important;
  }

  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361458"] {
    top: 372px !important;
    width: 540px !important;
  }

  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361489"] {
    top: 498px !important;
    width: 360px !important;
  }

  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361493"] {
    top: 585px !important;
    width: 360px !important;
  }

  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361452"] .tn-atom,
  html.is-safari #rec1763891643 .tn-elem[data-elem-id="1767788361489"] .tn-atom {
    white-space: normal !important;
    line-height: 1.18 !important;
  }

  html.is-safari #rec1777833793 .t396__artboard,
  html.is-safari #rec1777833793 .t396__carrier,
  html.is-safari #rec1777833793 .t396__filter {
    height: 340px !important;
  }

  html.is-safari #rec1777833793 .tn-elem[data-elem-id="1768231764341"],
  html.is-safari #rec1777833793 .tn-elem[data-elem-id="1768231764347"] {
    height: auto !important;
  }

  html.is-safari #rec1777833793 .tn-elem[data-elem-id="1768231764341"] {
    top: 166px !important;
    width: 720px !important;
  }

  html.is-safari #rec1777833793 .tn-elem[data-elem-id="1768231764341"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.15 !important;
  }

  html.is-safari #rec1777833793 .tn-elem[data-elem-id="1768231764347"] {
    top: 252px !important;
  }

  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056120"],
  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056136"] {
    height: auto !important;
  }

  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056120"] {
    left: calc(50% - 600px + 110px) !important;
    width: 420px !important;
  }

  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056120"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.08 !important;
  }

  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056136"] {
    left: calc(50% - 600px + 220px) !important;
    width: 830px !important;
    top: 529px !important;
  }

  html.is-safari #rec1778719793 .tn-elem[data-elem-id="1768240056136"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.15 !important;
  }

  html.is-safari #rec1767616313 .tn-elem[data-elem-id="1767801668999"],
  html.is-safari #rec1822459163 .tn-elem[data-elem-id="1767801668999"] {
    height: auto !important;
    left: calc(50% - 600px + 320px) !important;
    width: 560px !important;
  }

  html.is-safari #rec1767616313 .tn-elem[data-elem-id="1767801668999"] .tn-atom,
  html.is-safari #rec1822459163 .tn-elem[data-elem-id="1767801668999"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.08 !important;
    font-size: 28px !important;
  }

  html.is-safari #rec1767605783 .tn-elem[data-elem-id="1767901684054"] {
    height: auto !important;
    left: calc(50% - 600px + 150px) !important;
    width: 940px !important;
  }

  html.is-safari #rec1767605783 .tn-elem[data-elem-id="1767901684054"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.08 !important;
    font-size: 20px !important;
  }

  html.is-safari #rec1769844493 .tn-elem[data-elem-id="1767982121807"] {
    height: auto !important;
    left: calc(50% - 600px + 90px) !important;
    width: 1020px !important;
    top: 70px !important;
  }

  html.is-safari #rec1769844493 .tn-elem[data-elem-id="1767982121807"] .tn-atom {
    white-space: nowrap !important;
    font-size: 46px !important;
    line-height: 1.02 !important;
  }

  html.is-safari #rec1769844493 .tn-elem[data-elem-id="1767982121917"] {
    top: 170px !important;
    left: calc(50% - 600px + 80px) !important;
    width: 1040px !important;
    height: auto !important;
  }

  html.is-safari #rec1769844493 .tn-elem[data-elem-id="1767982121917"] .tn-atom {
    white-space: nowrap !important;
    line-height: 1.15 !important;
  }

  html.is-safari #rec1777679723 .tn-elem[data-elem-id="1768226823334"] {
    height: auto !important;
    left: calc(50% - 600px + 240px) !important;
    width: 720px !important;
    top: 40px !important;
  }

  html.is-safari #rec1777679723 .tn-elem[data-elem-id="1768226823334"] .tn-atom {
    white-space: nowrap !important;
    font-size: 46px !important;
    line-height: 1.02 !important;
  }

  html.is-safari #rec1777679723 .tn-elem[data-elem-id="1768226823501"] {
    height: auto !important;
    left: calc(50% - 600px + 120px) !important;
    width: 960px !important;
  }

  html.is-safari #rec1777679723 .tn-elem[data-elem-id="1768226823501"] .tn-atom {
    white-space: nowrap !important;
    font-size: 22px !important;
    line-height: 1.08 !important;
  }

  html.is-safari #rec1778752123 .tn-elem[data-elem-id="1768311103133000001"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
  }

  html.is-safari #rec1778752123 .tn-elem[data-elem-id="1768311103133000001"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    line-height: 1.08 !important;
  }

  html.is-safari #rec1778752123 .tn-elem[data-elem-id="1768240056136"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
    top: 529px !important;
  }

  html.is-safari #rec1778752123 .tn-elem[data-elem-id="1768240056136"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    line-height: 1.12 !important;
  }

  html.is-safari #rec1787446063 .tn-elem[data-elem-id="1768240056136"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
  }

  html.is-safari #rec1787446063 .tn-elem[data-elem-id="1768240056136"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    line-height: 1.12 !important;
  }

  /* Shared Safari desktop fixes for repeated Tilda text blocks */
  html.is-safari .tn-elem[data-elem-id="1767801668999"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
  }

  html.is-safari .tn-elem[data-elem-id="1767801668999"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    font-size: 30px !important;
    line-height: 1.06 !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768305816214000039"],
  html.is-safari .tn-elem[data-elem-id="1768240056136"],
  html.is-safari .tn-elem[data-elem-id="1768231764341"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768305816214000039"] .tn-atom,
  html.is-safari .tn-elem[data-elem-id="1768240056136"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    font-size: 20px !important;
    line-height: 1.08 !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768231764341"] {
    top: 166px !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768231764341"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    font-size: 20px !important;
    line-height: 1.08 !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768311103133000001"] {
    height: auto !important;
    width: auto !important;
    max-width: none !important;
  }

  html.is-safari .tn-elem[data-elem-id="1768311103133000001"] .tn-atom {
    display: inline-block !important;
    width: auto !important;
    max-width: none !important;
    white-space: nowrap !important;
    font-size: 32px !important;
    line-height: 1.04 !important;
  }
}
\`;
  document.head.appendChild(style);
})();
</script>`;

function insertIntoHead(html, snippet) {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${snippet}</head>`);
  }
  return `${snippet}${html}`;
}

function upsertHeadTag(html, matcher, tagFactory) {
  if (matcher.test(html)) {
    return html.replace(matcher, tagFactory());
  }
  return insertIntoHead(html, tagFactory());
}

function removeLegacyAnalytics(html) {
  return String(html || "")
    .replace(
      /<!-- Stat -->\s*<script[^>]+data-tilda-cookie-type="analytics"[\s\S]*?<\/script>\s*<script[^>]*>\s*if\(!window\.mainTracker\)[\s\S]*?<\/script>/gi,
      ""
    )
    .replace(/<script[^>]+data-tilda-cookie-type="analytics"[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*>\s*if\(!window\.mainTracker\)[\s\S]*?tilda-stat-1\.0\.min\.js[\s\S]*?<\/script>/gi, "")
    .replace(/<!-- Stat -->/gi, "");
}

function ensureSharedHeadAssets(html) {
  let output = String(html || "");
  output = upsertHeadTag(
    output,
    /<link[^>]+rel="(?:shortcut icon|icon)"[^>]*>/i,
    () => `<link rel="icon" href="${SHARED_ICON_PATH}" type="image/png" />`
  );
  output = upsertHeadTag(
    output,
    /<link[^>]+rel="apple-touch-icon"[^>]*>/i,
    () => `<link rel="apple-touch-icon" href="${SHARED_ICON_PATH}" />`
  );
  output = upsertHeadTag(
    output,
    /<link[^>]+rel="manifest"[^>]*>/i,
    () => `<link rel="manifest" href="${SHARED_MANIFEST_PATH}" />`
  );
  return output;
}

function ensureAnalyticsSnippet(html) {
  const measurementId = String(GOOGLE_ANALYTICS_MEASUREMENT_ID || "").trim();
  if (!measurementId) return html;

  const scriptUrl = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  const scriptTag = `<script async src="${scriptUrl}"></script>`;
  const configScript = `<script id="shynli-analytics">window.dataLayer = window.dataLayer || [];function gtag(){window.dataLayer.push(arguments);}gtag('js', new Date());gtag('config', ${JSON.stringify(measurementId)});</script>`;
  const combined = `${scriptTag}${configScript}`;

  let output = String(html || "")
    .replace(/<script[^>]+src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]+"[^>]*><\/script>/gi, "")
    .replace(/<script[^>]+id="shynli-analytics"[^>]*>[\s\S]*?<\/script>/gi, "");

  if (output.includes(configScript)) return output;
  return insertIntoHead(output, combined);
}

function buildOauthCallbackShell() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connecting to Shynli Cleaner</title>
  <meta name="robots" content="noindex,nofollow" />
  <link rel="canonical" href="https://shynlicleaningservice.com/oauth/callback" />
  <link rel="icon" href="${SHARED_ICON_PATH}" type="image/png" />
  <style>
    :root {
      color-scheme: light;
      font-family: "Montserrat", Arial, sans-serif;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #faf9f6;
      color: #313131;
    }

    .oauth-callback {
      width: min(100% - 32px, 460px);
      padding: 32px 28px;
      border: 1px solid rgba(158, 67, 90, 0.12);
      border-radius: 24px;
      background: #ffffff;
      box-sizing: border-box;
      text-align: center;
      box-shadow: 0 18px 40px rgba(49, 49, 49, 0.08);
    }

    .oauth-callback__title {
      margin: 0 0 12px;
      font-family: "Playfair Display", Georgia, serif;
      font-size: 32px;
      line-height: 1.08;
      font-weight: 400;
    }

    .oauth-callback__text {
      margin: 0;
      font-size: 15px;
      line-height: 1.65;
      color: #5f5954;
    }
  </style>
</head>
<body>
  <main class="oauth-callback">
    <h1 class="oauth-callback__title">Connecting to app...</h1>
    <p class="oauth-callback__text">If the app does not open automatically, open Shynli Cleaner manually and continue there.</p>
  </main>
  <script>
    (function() {
      var params = new URLSearchParams(window.location.search);
      var code = params.get('code');
      if (code) {
        window.location.replace('shynlicleaning://oauth/callback?code=' + encodeURIComponent(code));
      }
    })();
  </script>
</body>
</html>`;
}

function sanitizeHtml(html, routePath = "/") {
  const normalizedRoute = normalizeRoute(routePath);
  if (normalizedRoute === "/oauth/callback") {
    return buildOauthCallbackShell();
  }

  let cleaned = html
    .replace(
      /<script src="https:\/\/neo\.tildacdn\.com\/js\/tilda-fallback-1\.0\.min\.js"[^>]*><\/script>/g,
      ""
    )
    .replace(/<!-- Tilda copyright\. Don't remove this line -->[\s\S]*?(?=<!-- Stat -->)/g, "")
    .replace(/data-tilda-export="yes"/g, 'data-export-source="tilda"')
    .replace(/<!--\s*Form export deps:[\s\S]*?-->/g, "")
    .replace(/<script[^>]+src="js\/tilda-animation-sbs-1\.0\.min\.js"[^>]*><\/script>/g, "");

  // Make header "Call Us" tappable as a phone link across pages.
  cleaned = cleaned.replace(
    /<strong>📞<\/strong>\s*Call Us/g,
    '<a href="tel:+16308127077" style="color: inherit; text-decoration: none;"><strong>📞</strong> Call Us</a>'
  );

  // Auto-run ZIP lookup as soon as the fifth digit is entered.
  cleaned = cleaned.replace(
    /document\.getElementById\('zipCode'\)\.addEventListener\('keypress',function\(e\) \{if\(e\.key==='Enter'\) checkZipArea\(\);\}\);document\.getElementById\('zipCode'\)\.addEventListener\('input',function\(\) \{this\.value=this\.value\.replace\(\/\\D\/g,''\);\}\);/g,
    `(()=>{const zipInput=document.getElementById('zipCode');if(!zipInput||zipInput.dataset.autoZipBound==='true') return;zipInput.dataset.autoZipBound='true';const zipWrapper=zipInput.closest('.zip-input-wrapper');const zipContainer=zipInput.closest('.zip-checker-container');const focusZipInput=(event)=>{if(event?.target?.closest('.zip-check-btn')) return;if(event?.target?.closest('.zip-result a')) return;zipInput.focus();const length=zipInput.value.length;if(typeof zipInput.setSelectionRange==='function'){zipInput.setSelectionRange(length,length);}};[zipWrapper,zipContainer].forEach((node)=>{if(!node) return;node.style.cursor='text';node.addEventListener('click',focusZipInput);});zipInput.addEventListener('keypress',function(e){if(e.key==='Enter') checkZipArea();});zipInput.addEventListener('input',function(){this.value=this.value.replace(/\\D/g,'').slice(0,5);if(this.value.length===5){checkZipArea();}});})();`
  );

  if (normalizedRoute === "/pricing") {
    cleaned = cleaned.replace(/<a name="calc"([^>]*)><\/a>/i, '<a id="calc" name="calc"$1></a>');
  }

  cleaned = rebuildDeepCleaningAddonsSection(cleaned, routePath);
  cleaned = rebuildBlogHubSection(cleaned, routePath);
  cleaned = removeBlogLegacyFeedSections(cleaned, routePath);
  cleaned = rebuildBlogRuntimeScript(cleaned, routePath);
  cleaned = rebuildBlogHeroHeading(cleaned, routePath);
  cleaned = removeBlogFeedAssets(cleaned, routePath);

  const routeSeo = siteSeoHelpers.deriveRouteSeo(cleaned, routePath);
  const blogArticle = getBlogArticle(routePath);
  cleaned = siteSeoHelpers.setTitleTag(cleaned, routeSeo.title);
  cleaned = siteSeoHelpers.setMetaContent(cleaned, "description", routeSeo.description);
  cleaned = siteSeoHelpers.setMetaContent(cleaned, "robots", routeSeo.robots);
  cleaned = siteSeoHelpers.setMetaContent(cleaned, "og:url", routeSeo.ogUrl, "property");
  cleaned = siteSeoHelpers.setMetaContent(cleaned, "og:title", routeSeo.ogTitle, "property");
  cleaned = siteSeoHelpers.setMetaContent(cleaned, "og:description", routeSeo.ogDescription, "property");
  cleaned = siteSeoHelpers.setCanonicalLink(cleaned, routeSeo.canonical);

  if (normalizedRoute === "/") {
    cleaned = siteSeoHelpers.upsertJsonLd(cleaned, "schema-home", siteSeoHelpers.buildHomeSchemas());
  }
  const contactSchema = siteSeoHelpers.buildContactSchema(routePath);
  if (contactSchema) {
    cleaned = siteSeoHelpers.upsertJsonLd(cleaned, "schema-contact", contactSchema);
  }
  const breadcrumbSchema = siteSeoHelpers.buildBreadcrumbSchema(routePath);
  if (breadcrumbSchema) {
    cleaned = siteSeoHelpers.upsertJsonLd(cleaned, "schema-breadcrumbs", breadcrumbSchema);
  }
  const serviceSchema = siteSeoHelpers.buildServiceSchema(routePath, routeSeo);
  if (serviceSchema) {
    cleaned = siteSeoHelpers.upsertJsonLd(cleaned, "schema-service", serviceSchema);
  }
  const faqSchema = siteSeoHelpers.buildFaqSchema(cleaned, routePath);
  if (faqSchema) {
    cleaned = siteSeoHelpers.upsertJsonLd(cleaned, "schema-faq", faqSchema);
  }
  if (blogArticle) {
    cleaned = siteSeoHelpers.upsertJsonLd(
      cleaned,
      "schema-blog-article",
      buildBlogArticleSchema(blogArticle, routeSeo)
    );
  }

  const hasForms = /data-elem-type='form'|class="t-form"|tn-atom__form/.test(cleaned);
  if (!hasForms) {
    cleaned = cleaned
      .replace(/<link[^>]+href="css\/tilda-forms-1\.0\.min\.css"[^>]*>/g, "")
      .replace(/<script[^>]+src="js\/tilda-forms-1\.0\.min\.js"[^>]*><\/script>/g, "")
      .replace(/<script[^>]+src="js\/tilda-zero-forms-1\.0\.min\.js"[^>]*><\/script>/g, "");
  }

  const hasMenuWidgetIcons = /class="[^"]*\bt-menuwidgeticons(?:__|\b)[^"]*"/i.test(cleaned);
  if (!hasMenuWidgetIcons) {
    cleaned = cleaned
      .replace(/<link[^>]+href="css\/tilda-menu-widgeticons-1\.0\.min\.css"[^>]*>\s*/g, "");
  }

  const hasAnimationMarkers =
    /data-animate-style=|data-animate-chain=|data-animate-prx=|class="t-animate"|t_animate__/i.test(
      cleaned
    );
  if (!hasAnimationMarkers) {
    cleaned = cleaned
      .replace(/<link[^>]+href="css\/tilda-animation-2\.0\.min\.css"[^>]*>\s*/g, "")
      .replace(/<script[^>]+src="js\/tilda-animation-2\.0\.min\.js"[^>]*><\/script>\s*/g, "");
  }

  // Fix relative asset paths on nested routes like /services/*.
  if (!/<base\s+href=/i.test(cleaned)) {
    cleaned = cleaned.replace(/<head>/i, '<head><base href="/" />');
  }
  if (
    ["/quote", "/quote2"].includes(normalizedRoute) &&
    GOOGLE_PLACES_API_KEY &&
    !cleaned.includes('id="runtime-config"')
  ) {
    cleaned = cleaned.replace(/<head>/i, `<head>${RUNTIME_CONFIG_SCRIPT}`);
  }
  cleaned = ensureSharedHeadAssets(cleaned);
  cleaned = ensureAnalyticsSnippet(removeLegacyAnalytics(cleaned));

  if (/<body[\s>]/i.test(cleaned)) {
    const runtimeScripts = [
      [FULL_CARD_CLICK_SCRIPT, "full-card-click-handler"],
      [MOBILE_STICKY_CTA_SCRIPT, "mobile-sticky-cta"],
      [DEEP_CLEANING_MOBILE_FIX, "deep-cleaning-addons-rebuild"],
      [MOBILE_CONTACT_DETAILS_FIX, "mobile-contact-details-fix"],
      [PRICING_CALCULATOR_SCROLL_SCRIPT, "pricing-calculator-scroll"],
      [SAFARI_HOME_LAYOUT_FIX, "safari-home-layout-fix"],
    ]
      .filter(([, scriptId]) => !cleaned.includes(`id="${scriptId}"`))
      .map(([script]) => script)
      .join("");

    if (runtimeScripts) {
      cleaned = cleaned.replace(/<\/body>/i, `${runtimeScripts}</body>`);
    }
  }

  return cleaned;
}

  return {
    sanitizeHtml,
  };
}

module.exports = {
  createSiteSanitizer,
};
