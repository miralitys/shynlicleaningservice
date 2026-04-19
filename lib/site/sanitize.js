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
const BLOG_SHELL_OG_IMAGE =
  "https://shynlicleaningservice.com/images/tild3432-3732-4632-a365-393034613734__photo.png";
const BLOG_SHELL_CITY_GROUPS = Object.freeze([
  {
    label: "A-D:",
    items: [
      { path: "/addison", label: "Addison" },
      { path: "/aurora", label: "Aurora" },
      { path: "/bartlett", label: "Bartlett" },
      { path: "/batavia", label: "Batavia" },
      { path: "/bolingbrook", label: "Bolingbrook" },
      { path: "/burrridge", label: "Burr Ridge" },
      { path: "/carolstream", label: "Carol Stream" },
      { path: "/clarendonhills", label: "Clarendon Hills" },
      { path: "/darien", label: "Darien" },
      { path: "/downersgrove", label: "Downers Grove" },
    ],
  },
  {
    label: "E-L:",
    items: [
      { path: "/elmhurst", label: "Elmhurst" },
      { path: "/geneva", label: "Geneva" },
      { path: "/glenellyn", label: "Glen Ellyn" },
      { path: "/hinsdale", label: "Hinsdale" },
      { path: "/homerglen", label: "Homer Glen" },
      { path: "/itasca", label: "Itasca" },
      { path: "/lemont", label: "Lemont" },
      { path: "/lisle", label: "Lisle" },
      { path: "/lockport", label: "Lockport" },
      { path: "/lombard", label: "Lombard" },
    ],
  },
  {
    label: "M-S:",
    items: [
      { path: "/montgomery", label: "Montgomery" },
      { path: "/naperville", label: "Naperville" },
      { path: "/oakbrook", label: "Oak Brook" },
      { path: "/oswego", label: "Oswego" },
      { path: "/plainfield", label: "Plainfield" },
      { path: "/romeoville", label: "Romeoville" },
      { path: "/stcharles", label: "St. Charles" },
      { path: "/streamwood", label: "Streamwood" },
    ],
  },
  {
    label: "V-W:",
    items: [
      { path: "/villapark", label: "Villa Park" },
      { path: "/warrenville", label: "Warrenville" },
      { path: "/wayne", label: "Wayne" },
      { path: "/westchicago", label: "West Chicago" },
      { path: "/westmont", label: "Westmont" },
      { path: "/wheaton", label: "Wheaton" },
      { path: "/willowbrook", label: "Willowbrook" },
      { path: "/winfield", label: "Winfield" },
      { path: "/wooddale", label: "Wood Dale" },
      { path: "/woodridge", label: "Woodridge" },
    ],
  },
]);
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

  function initPrintButtons(root){
    Array.prototype.slice.call((root || document).querySelectorAll('[data-blog-print]')).forEach(function(button){
      if(!button || button.dataset.printBound === '1') return;
      button.dataset.printBound = '1';
      button.addEventListener('click', function(){
        window.print();
      });
    });
  }

  function initTableOfContents(root){
    Array.prototype.slice.call((root || document).querySelectorAll('[data-target-id]')).forEach(function(link){
      if(!link || link.dataset.tocBound === '1') return;
      link.dataset.tocBound = '1';
      link.addEventListener('click', function(event){
        var targetId = link.getAttribute('data-target-id');
        if(!targetId) return;
        var target = document.getElementById(targetId);
        if(!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if(window.history && typeof window.history.replaceState === 'function'){
          window.history.replaceState(null, '', '#' + targetId);
        }else{
          window.location.hash = targetId;
        }
      });
    });
  }

  function closeHeaderMenus(except){
    Array.prototype.slice.call(document.querySelectorAll('.shynli-blog-shell__details[open]')).forEach(function(details){
      if(except && details === except) return;
      details.removeAttribute('open');
    });
  }

  function clearHeaderMenuCloseTimer(details){
    if(!details || !details.__closeTimerId) return;
    window.clearTimeout(details.__closeTimerId);
    details.__closeTimerId = 0;
  }

  function scheduleHeaderMenuClose(details){
    if(!details) return;
    clearHeaderMenuCloseTimer(details);
    details.__closeTimerId = window.setTimeout(function(){
      details.removeAttribute('open');
      details.__closeTimerId = 0;
    }, 180);
  }

  function shouldUseHoverMenus(){
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 961px) and (hover: hover) and (pointer: fine)').matches
    );
  }

  function initHeaderMenus(root){
    Array.prototype.slice.call((root || document).querySelectorAll('.shynli-blog-shell__details')).forEach(function(details){
      if(!details || details.dataset.shellBound === '1') return;
      var isHoverMenu = details.classList.contains('shynli-blog-shell__details--hoverable');
      var summary = details.querySelector('summary');
      var submenu = details.querySelector('.shynli-blog-shell__submenu');
      function openHoverMenu(){
        if(!isHoverMenu) return;
        if(!shouldUseHoverMenus()) return;
        clearHeaderMenuCloseTimer(details);
        details.setAttribute('open', '');
        closeHeaderMenus(details);
      }
      function handleHoverSurfaceLeave(event){
        if(!isHoverMenu) return;
        if(!shouldUseHoverMenus()) return;
        var relatedTarget = event && event.relatedTarget;
        if(relatedTarget instanceof Node && details.contains(relatedTarget)) return;
        scheduleHeaderMenuClose(details);
      }
      details.dataset.shellBound = '1';
      details.addEventListener('toggle', function(){
        if(details.open) closeHeaderMenus(details);
      });
      if(isHoverMenu && summary){
        summary.addEventListener('mouseenter', openHoverMenu);
        summary.addEventListener('mouseleave', handleHoverSurfaceLeave);
      }
      if(isHoverMenu && submenu){
        submenu.addEventListener('mouseenter', openHoverMenu);
        submenu.addEventListener('mouseleave', handleHoverSurfaceLeave);
      }
      details.addEventListener('focusin', function(){
        clearHeaderMenuCloseTimer(details);
      });
      details.addEventListener('focusout', function(){
        if(details.contains(document.activeElement)) return;
        if(!shouldUseHoverMenus()) return;
        scheduleHeaderMenuClose(details);
      });
    });
  }

  function initCityModal(root){
    var trigger = (root || document).querySelector('[data-city-modal-open]');
    var modal = document.querySelector('[data-city-modal]');
    if(!trigger || !modal || trigger.dataset.cityModalBound === '1') return;

    var closeButton = modal.querySelector('[data-city-modal-close]');
    var backdrop = modal.querySelector('[data-city-modal-backdrop]');
    var dialog = modal.querySelector('[data-city-modal-dialog]');

    function setModalOpen(isOpen){
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if(isOpen){
        modal.hidden = false;
        document.body.classList.add('shynli-city-modal-open');
      }else{
        modal.hidden = true;
        document.body.classList.remove('shynli-city-modal-open');
      }
    }

    trigger.dataset.cityModalBound = '1';
    trigger.addEventListener('click', function(event){
      event.preventDefault();
      var shouldOpen = modal.hidden;
      closeHeaderMenus();
      setModalOpen(shouldOpen);
    });

    if(closeButton){
      closeButton.addEventListener('click', function(){
        setModalOpen(false);
        trigger.focus();
      });
    }

    if(backdrop){
      backdrop.addEventListener('click', function(){
        setModalOpen(false);
      });
    }

    if(dialog){
      dialog.addEventListener('click', function(event){
        event.stopPropagation();
      });
    }
  }

  document.addEventListener('click', function(event){
    var target = event.target;
    if(!(target instanceof Element)) return;
    if(target.closest('.shynli-blog-shell__details')) return;
    closeHeaderMenus();
  });

  document.addEventListener('keydown', function(event){
    if(event.key !== 'Escape') return;
    closeHeaderMenus();
    var modal = document.querySelector('[data-city-modal]');
    var trigger = document.querySelector('[data-city-modal-open]');
    if(modal && !modal.hidden){
      modal.hidden = true;
      document.body.classList.remove('shynli-city-modal-open');
      if(trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      initQuoteForms(document);
      initPrintButtons(document);
      initTableOfContents(document);
      initHeaderMenus(document);
      initCityModal(document);
    }, { once: true });
  }else{
    initQuoteForms(document);
    initPrintButtons(document);
    initTableOfContents(document);
    initHeaderMenus(document);
    initCityModal(document);
  }
})();
</script>`;
}

function buildBlogShellStyles() {
  return `<style id="shynli-blog-shell-styles">
:root{
  color-scheme:light;
  --shynli-shell-bg:#faf9f6;
  --shynli-shell-surface:#ffffff;
  --shynli-shell-surface-alt:#f3ece4;
  --shynli-shell-ink:#313131;
  --shynli-shell-copy:#5f5954;
  --shynli-shell-accent:#9e445a;
  --shynli-shell-accent-dark:#83384c;
  --shynli-shell-border:rgba(158,68,90,.12);
  --shynli-shell-shadow:0 20px 40px rgba(49,49,49,.08);
}
html{scroll-behavior:smooth;}
body.shynli-blog-shell-body{
  margin:0;
  min-height:100vh;
  background:var(--shynli-shell-bg);
  color:var(--shynli-shell-ink);
  font-family:"Montserrat",Arial,sans-serif;
}
.shynli-blog-shell{
  min-height:100vh;
  display:flex;
  flex-direction:column;
}
.shynli-blog-shell a{color:inherit;}
.shynli-blog-shell__header{
  position:sticky;
  top:0;
  z-index:50;
  background:#faf9f6;
  border-bottom:1px solid rgba(158,68,90,.08);
}
.shynli-blog-shell__nav,
.shynli-blog-shell__hero-shell,
.shynli-blog-shell__footer-shell{
  width:min(1180px,calc(100% - 32px));
  margin:0 auto;
}
.shynli-blog-shell__nav{
  min-height:68px;
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  gap:24px;
  align-items:center;
}
.shynli-blog-shell__logo{
  display:inline-flex;
  align-items:center;
  text-decoration:none;
}
.shynli-blog-shell__logo img{
  display:block;
  width:150px;
  max-width:100%;
  height:auto;
}
.shynli-blog-shell__desktop{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:24px;
  min-width:0;
}
.shynli-blog-shell__links{
  display:flex;
  align-items:center;
  gap:18px;
  min-width:0;
}
.shynli-blog-shell__links a,
.shynli-blog-shell__summary{
  color:var(--shynli-shell-ink);
  font-size:14px;
  line-height:1.4;
  font-weight:400;
  text-decoration:none;
}
.shynli-blog-shell__links a:hover,
.shynli-blog-shell__links a:focus-visible,
.shynli-blog-shell__summary:hover,
.shynli-blog-shell__summary:focus-visible{
  color:var(--shynli-shell-accent);
  outline:none;
}
.shynli-blog-shell__details{
  position:relative;
}
.shynli-blog-shell__details[open] .shynli-blog-shell__summary{
  color:var(--shynli-shell-accent);
}
@media (min-width:961px){
  .shynli-blog-shell__details--hoverable[open]::after{
    content:"";
    position:absolute;
    top:100%;
    left:-16px;
    right:-16px;
    height:18px;
    background:transparent;
  }
}
.shynli-blog-shell__summary{
  display:inline-flex;
  align-items:center;
  gap:4px;
  cursor:pointer;
  list-style:none;
}
.shynli-blog-shell__summary::-webkit-details-marker{display:none;}
.shynli-blog-shell__summary::after{
  content:"▾";
  font-size:10px;
  line-height:1;
  transition:transform .2s ease;
  color:var(--shynli-shell-accent);
}
.shynli-blog-shell__details[open] .shynli-blog-shell__summary::after{
  transform:rotate(180deg);
}
.shynli-blog-shell__submenu{
  position:absolute;
  top:calc(100% + 15px);
  left:0;
  min-width:400px;
  padding:14px 0;
  border-radius:10px;
  border:1px solid #eeeeee;
  background:#e8e1d9;
  box-shadow:0 15px 30px -10px rgba(0,11,48,.2);
  display:grid;
  gap:0;
  box-sizing:border-box;
}
.shynli-blog-shell__submenu::before{
  content:"";
  position:absolute;
  top:-8px;
  left:72px;
  width:16px;
  height:16px;
  background:#e8e1d9;
  border-top:1px solid #eeeeee;
  border-left:1px solid #eeeeee;
  transform:rotate(45deg);
  box-sizing:border-box;
}
.shynli-blog-shell__details--align-right .shynli-blog-shell__submenu{
  left:auto;
  right:0;
  min-width:320px;
}
.shynli-blog-shell__details--align-right .shynli-blog-shell__submenu::before{
  left:auto;
  right:38px;
}
.shynli-blog-shell__submenu a{
  display:block;
  padding:10px 18px;
  color:var(--shynli-shell-ink);
  font-size:14px;
  line-height:1.5;
  text-decoration:none;
}
.shynli-blog-shell__submenu a:hover,
.shynli-blog-shell__submenu a:focus-visible{
  color:var(--shynli-shell-accent);
  outline:none;
}
.shynli-blog-shell__submenu-title{
  margin:0;
  padding:0 18px 10px;
  color:var(--shynli-shell-accent);
  font-size:11px;
  line-height:1.2;
  font-weight:700;
  letter-spacing:.16em;
  text-transform:uppercase;
}
.shynli-blog-shell__city-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:0;
}
.shynli-blog-shell__submenu-cta{
  margin-top:6px;
  padding-top:14px !important;
  border-top:1px solid rgba(158,68,90,.12);
  font-weight:600;
}
.shynli-blog-shell__utility{
  display:flex;
  align-items:center;
  gap:14px;
}
.shynli-blog-shell__utility-copy{
  display:flex;
  align-items:center;
  gap:10px;
  color:var(--shynli-shell-accent);
  font-size:16px;
  line-height:1.4;
  font-weight:500;
  white-space:nowrap;
}
.shynli-blog-shell__utility-copy a{
  color:inherit;
  text-decoration:none;
}
.shynli-blog-shell__utility-copy a:hover,
.shynli-blog-shell__utility-copy a:focus-visible{
  text-decoration:underline;
  outline:none;
}
.shynli-blog-shell__utility-divider{
  color:#faf9f6;
}
.shynli-blog-shell__actions{
  display:flex;
  align-items:center;
  gap:10px;
}
.shynli-blog-shell__button{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:42px;
  padding:0 18px;
  border-radius:999px;
  border:1px solid #9e445a;
  background:#ffffff;
  color:var(--shynli-shell-ink);
  font-size:16px;
  line-height:1;
  font-weight:400;
  text-decoration:none;
  box-sizing:border-box;
  transition:background-color .2s ease,color .2s ease,border-color .2s ease,transform .2s ease;
}
.shynli-blog-shell__button:hover,
.shynli-blog-shell__button:focus-visible{
  transform:translateY(-1px);
  outline:none;
}
.shynli-blog-shell__button.is-primary{
  background:var(--shynli-shell-accent);
  border-color:var(--shynli-shell-accent);
  color:#ffffff;
}
.shynli-blog-shell__button.is-primary:hover,
.shynli-blog-shell__button.is-primary:focus-visible{
  background:var(--shynli-shell-accent-dark);
  border-color:var(--shynli-shell-accent-dark);
}
.shynli-blog-shell__button.is-secondary:hover,
.shynli-blog-shell__button.is-secondary:focus-visible{
  background:var(--shynli-shell-accent);
  border-color:var(--shynli-shell-accent);
  color:#ffffff;
}
.shynli-blog-shell__button[aria-expanded="true"]{
  background:var(--shynli-shell-accent);
  border-color:var(--shynli-shell-accent);
  color:#ffffff;
}
.shynli-blog-shell__button[aria-expanded="true"]:hover,
.shynli-blog-shell__button[aria-expanded="true"]:focus-visible{
  background:var(--shynli-shell-accent-dark);
  border-color:var(--shynli-shell-accent-dark);
  color:#ffffff;
}
.shynli-blog-shell__button-summary{
  cursor:pointer;
  list-style:none;
  user-select:none;
}
.shynli-blog-shell__button-summary::-webkit-details-marker{display:none;}
.shynli-blog-shell__city-modal[hidden]{
  display:none;
}
.shynli-blog-shell__city-modal{
  position:fixed;
  inset:0;
  z-index:70;
}
.shynli-blog-shell__city-modal-backdrop{
  position:absolute;
  inset:0;
  background:rgba(49,49,49,.3);
  -webkit-backdrop-filter:blur(4px);
  backdrop-filter:blur(4px);
}
.shynli-blog-shell__city-modal-dialog{
  position:relative;
  z-index:1;
  width:min(820px,calc(100vw - 56px));
  max-height:min(calc(100vh - 72px),620px);
  margin:72px auto 0;
  border-radius:20px;
  background:#faf9f6;
  box-shadow:0 24px 70px rgba(0,11,48,.18);
  overflow:auto;
}
.shynli-blog-shell__city-modal-close{
  position:fixed;
  top:20px;
  right:26px;
  z-index:2;
  border:0;
  background:transparent;
  color:#313131;
  font-size:44px;
  line-height:1;
  font-weight:300;
  cursor:pointer;
  padding:0;
}
.shynli-blog-shell__city-modal-close:hover,
.shynli-blog-shell__city-modal-close:focus-visible{
  color:var(--shynli-shell-accent);
  outline:none;
}
.shynli-blog-shell__city-modal-content{
  padding:40px 34px 30px;
}
.shynli-blog-shell__city-modal-grid{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:26px 34px;
}
.shynli-blog-shell__city-modal-group-title{
  margin:0 0 16px;
  color:#313131;
  font-family:'Playfair Display',serif;
  font-size:28px;
  line-height:1.15;
  font-weight:400;
}
.shynli-blog-shell__city-modal-links{
  display:flex;
  flex-direction:column;
  gap:10px;
}
.shynli-blog-shell__city-modal-links a{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:36px;
  padding:0 16px;
  border:1px solid rgba(158,68,90,.65);
  border-radius:999px;
  color:#5a5a5a;
  font-size:16px;
  line-height:1.25;
  text-decoration:none;
  box-sizing:border-box;
  transition:background-color .2s ease,color .2s ease,border-color .2s ease;
}
.shynli-blog-shell__city-modal-links a:hover,
.shynli-blog-shell__city-modal-links a:focus-visible{
  background:var(--shynli-shell-accent);
  border-color:var(--shynli-shell-accent);
  color:#ffffff;
  outline:none;
}
body.shynli-blog-shell-body.shynli-city-modal-open{
  overflow:hidden;
}
.shynli-blog-shell__mobile-toggle{
  display:none;
}
.shynli-blog-shell__mobile-toggle summary{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:44px;
  padding:0 18px;
  border-radius:14px;
  background:var(--shynli-shell-accent);
  color:#ffffff;
  font-size:14px;
  line-height:1;
  font-weight:700;
  cursor:pointer;
  list-style:none;
}
.shynli-blog-shell__mobile-toggle summary::-webkit-details-marker{display:none;}
.shynli-blog-shell__mobile-panel{
  display:grid;
  gap:12px;
  padding:18px 16px 20px;
  border-top:1px solid rgba(158,68,90,.08);
}
.shynli-blog-shell__mobile-panel a,
.shynli-blog-shell__mobile-services summary{
  display:block;
  padding:12px 14px;
  border-radius:16px;
  background:#ffffff;
  color:var(--shynli-shell-ink);
  font-size:15px;
  line-height:1.4;
  font-weight:600;
  text-decoration:none;
  list-style:none;
}
.shynli-blog-shell__mobile-panel a:hover,
.shynli-blog-shell__mobile-panel a:focus-visible,
.shynli-blog-shell__mobile-services summary:hover,
.shynli-blog-shell__mobile-services summary:focus-visible{
  color:var(--shynli-shell-accent);
  outline:none;
}
.shynli-blog-shell__mobile-services summary::-webkit-details-marker{display:none;}
.shynli-blog-shell__mobile-services-list{
  display:grid;
  gap:8px;
  padding-top:10px;
}
.shynli-blog-shell__mobile-services-list a{
  padding-left:18px;
  font-size:14px;
  font-weight:500;
}
.shynli-blog-shell__main{
  flex:1 0 auto;
}
.shynli-blog-shell__hero{
  padding:28px 0 0;
}
.shynli-blog-shell__hero-shell{
  display:grid;
  gap:16px;
  padding:34px 36px;
  border:1px solid var(--shynli-shell-border);
  border-radius:30px;
  background:linear-gradient(180deg,#ffffff 0%,rgba(243,236,228,.9) 100%);
  box-shadow:var(--shynli-shell-shadow);
  box-sizing:border-box;
}
.shynli-blog-shell__eyebrow{
  margin:0;
  color:var(--shynli-shell-accent);
  font-size:13px;
  line-height:1.2;
  font-weight:700;
  letter-spacing:.18em;
  text-transform:uppercase;
}
.shynli-blog-shell__hero-title{
  margin:0;
  max-width:760px;
  color:var(--shynli-shell-ink);
  font-family:"Playfair Display",Georgia,serif;
  font-size:58px;
  line-height:1.01;
  font-weight:400;
}
.shynli-blog-shell__hero-title span{
  color:var(--shynli-shell-accent);
}
.shynli-blog-shell__hero-text{
  margin:0;
  max-width:780px;
  color:var(--shynli-shell-copy);
  font-size:16px;
  line-height:1.78;
  font-weight:400;
}
.shynli-blog-shell__hero-actions{
  display:flex;
  flex-wrap:wrap;
  gap:12px;
  padding-top:6px;
}
.shynli-blog-shell__footer{
  margin-top:56px;
  padding:48px 0 34px;
  background:#313131;
  color:#d8cfc4;
}
.shynli-blog-shell__footer-shell{
  display:grid;
  gap:26px;
}
.shynli-blog-shell__footer-top{
  display:grid;
  grid-template-columns:minmax(220px,.8fr) repeat(3,minmax(0,1fr));
  gap:24px;
}
.shynli-blog-shell__footer-brand{
  display:grid;
  gap:12px;
}
.shynli-blog-shell__footer-brand img{
  width:200px;
  max-width:100%;
  height:auto;
}
.shynli-blog-shell__footer-tagline,
.shynli-blog-shell__footer-copy{
  margin:0;
  color:#b9b4ae;
  font-size:14px;
  line-height:1.7;
}
.shynli-blog-shell__footer-title{
  margin:0 0 10px;
  color:#faf9f6;
  font-family:"Playfair Display",Georgia,serif;
  font-size:26px;
  line-height:1.08;
  font-weight:400;
}
.shynli-blog-shell__footer-links{
  display:grid;
  gap:10px;
}
.shynli-blog-shell__footer-links a{
  color:#d8cfc4;
  font-size:14px;
  line-height:1.6;
  text-decoration:none;
}
.shynli-blog-shell__footer-links a:hover,
.shynli-blog-shell__footer-links a:focus-visible{
  color:#faf9f6;
  text-decoration:underline;
  outline:none;
}
.shynli-blog-shell__footer-note{
  display:flex;
  justify-content:space-between;
  gap:16px;
  align-items:center;
  padding-top:18px;
  border-top:1px solid rgba(216,207,196,.12);
  color:#b9b4ae;
  font-size:12px;
  line-height:1.6;
}
.shynli-blog-shell__footer-note p{
  margin:0;
}
.shynli-blog-shell__sticky{
  display:none;
}
@media screen and (max-width:1199px){
  .shynli-blog-shell__hero-title{font-size:50px;}
  .shynli-blog-shell__footer-top{grid-template-columns:repeat(2,minmax(0,1fr));}
}
@media screen and (max-width:959px){
  .shynli-blog-shell__nav{
    grid-template-columns:auto 1fr;
    min-height:72px;
    gap:16px;
  }
  .shynli-blog-shell__desktop{
    display:none;
  }
  .shynli-blog-shell__mobile-toggle{
    display:block;
    justify-self:end;
  }
  .shynli-blog-shell__hero-shell{
    padding:28px 24px;
    border-radius:26px;
  }
  .shynli-blog-shell__hero-title{font-size:42px;}
}
@media screen and (max-width:639px){
  .shynli-blog-shell__nav,
  .shynli-blog-shell__hero-shell,
  .shynli-blog-shell__footer-shell{
    width:min(calc(100% - 24px),1180px);
  }
  .shynli-blog-shell__hero{
    padding-top:18px;
  }
  .shynli-blog-shell__hero-shell{
    padding:24px 20px;
    gap:14px;
  }
  .shynli-blog-shell__hero-title{
    font-size:34px;
    line-height:1.04;
  }
  .shynli-blog-shell__hero-text{
    font-size:15px;
    line-height:1.72;
  }
  .shynli-blog-shell__hero-actions{
    display:grid;
    grid-template-columns:1fr;
  }
  .shynli-blog-shell__button{
    width:100%;
    min-height:50px;
  }
  .shynli-blog-shell__footer{
    padding:38px 0 106px;
  }
  .shynli-blog-shell__footer-top{
    grid-template-columns:1fr;
    gap:20px;
  }
  .shynli-blog-shell__footer-title{font-size:24px;}
  .shynli-blog-shell__footer-note{
    flex-direction:column;
    align-items:flex-start;
  }
  .shynli-blog-shell__city-modal-dialog{
    width:min(calc(100vw - 20px),620px);
    max-height:calc(100vh - 20px);
    margin:10px auto 0;
  }
  .shynli-blog-shell__city-modal-close{
    top:12px;
    right:16px;
    font-size:38px;
  }
  .shynli-blog-shell__city-modal-content{
    padding:30px 20px 24px;
  }
  .shynli-blog-shell__city-modal-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:24px 20px;
  }
  .shynli-blog-shell__city-modal-group-title{
    font-size:24px;
  }
  .shynli-blog-shell__sticky{
    position:fixed;
    left:10px;
    right:10px;
    bottom:calc(10px + env(safe-area-inset-bottom,0px));
    z-index:45;
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:10px;
  }
  .shynli-blog-shell__sticky a{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-height:48px;
    border-radius:999px;
    text-decoration:none;
    font-size:15px;
    line-height:1;
    font-weight:700;
    box-shadow:0 12px 28px rgba(49,49,49,.18);
  }
  .shynli-blog-shell__sticky a:first-child{
    background:var(--shynli-shell-accent);
    color:#ffffff;
  }
  .shynli-blog-shell__sticky a:last-child{
    background:#ffffff;
    color:var(--shynli-shell-ink);
  }
}
@media (max-width:639px){
  .shynli-blog-shell__city-modal-grid{
    grid-template-columns:1fr;
    gap:18px;
  }
  .shynli-blog-shell__city-modal-links a{
    justify-content:flex-start;
  }
}
@media print{
  .shynli-blog-shell__header,
  .shynli-blog-shell__hero,
  .shynli-blog-shell__footer,
  .shynli-blog-shell__sticky,
  .shynli-blog-shell__city-modal{
    display:none !important;
  }
  body.shynli-blog-shell-body{
    background:#ffffff;
  }
  #blog-topics-hub{
    padding-top:0 !important;
  }
}
</style>`;
}

function buildBlogShellServicesDesktop() {
  return `<details class="shynli-blog-shell__details shynli-blog-shell__details--hoverable"><summary class="shynli-blog-shell__summary">Services</summary><div class="shynli-blog-shell__submenu"><a href="/services/regular-cleaning">✦ Regular Home Cleaning</a><a href="/services/deep-cleaning">✦ Deep Cleaning for Homes That Need Extra Care</a><a href="/services/move-in-move-out-cleaning">✦ Cleaning for Moving In or Moving Out</a><a href="/services/airbnb-cleaning">✦ Airbnb cleaning</a><a href="/services/commercial-cleaning">✦ Commercial cleaning</a></div></details>`;
}

function buildBlogShellServicesMobile() {
  return `<details class="shynli-blog-shell__mobile-services"><summary>Services</summary><div class="shynli-blog-shell__mobile-services-list"><a href="/services/regular-cleaning">Regular Home Cleaning</a><a href="/services/deep-cleaning">Deep Cleaning</a><a href="/services/move-in-move-out-cleaning">Move In / Move Out Cleaning</a><a href="/services/airbnb-cleaning">Airbnb Cleaning</a><a href="/services/commercial-cleaning">Commercial Cleaning</a></div></details>`;
}

function buildBlogShellCityTriggerDesktop() {
  return `<button type="button" class="shynli-blog-shell__button is-secondary" data-city-modal-open aria-haspopup="dialog" aria-expanded="false">City ▾</button>`;
}

function buildBlogShellCityModal() {
  return `<div class="shynli-blog-shell__city-modal" data-city-modal hidden><div class="shynli-blog-shell__city-modal-backdrop" data-city-modal-backdrop data-city-modal-close></div><button type="button" class="shynli-blog-shell__city-modal-close" data-city-modal-close aria-label="Close city dialog">×</button><div class="shynli-blog-shell__city-modal-dialog" role="dialog" aria-modal="true" aria-label="Service areas by city" data-city-modal-dialog><div class="shynli-blog-shell__city-modal-content"><div class="shynli-blog-shell__city-modal-grid">${BLOG_SHELL_CITY_GROUPS.map(
    (group) => `<section class="shynli-blog-shell__city-modal-group"><h2 class="shynli-blog-shell__city-modal-group-title">${escapeBlogHtml(group.label)}</h2><div class="shynli-blog-shell__city-modal-links">${group.items
      .map(
        (item) => `<a href="${escapeBlogAttribute(item.path)}">${escapeBlogHtml(item.label)}</a>`
      )
      .join("")}</div></section>`
  ).join("")}</div></div></div></div>`;
}

function buildBlogShellHeader() {
  return `<header class="shynli-blog-shell__header"><div class="shynli-blog-shell__nav"><a class="shynli-blog-shell__logo" href="/" aria-label="Shynli Cleaning home"><img src="/images/tild3531-6535-4863-b761-323963303436__logo_2.png" alt="Shynli Cleaning" /></a><div class="shynli-blog-shell__desktop"><nav class="shynli-blog-shell__links" aria-label="Primary"><div>${buildBlogShellServicesDesktop()}</div><a href="/service-areas">Service Areas</a><a href="/about-us">About Us</a><a href="/faq">FAQ</a></nav><div class="shynli-blog-shell__utility"><div class="shynli-blog-shell__utility-copy"><a href="/#clean">Become a Cleaner</a><span class="shynli-blog-shell__utility-divider">////</span><a href="tel:+16308127077">📞 Call Us</a></div><div class="shynli-blog-shell__actions"><a class="shynli-blog-shell__button is-primary" href="/quote">Get Free Quote</a>${buildBlogShellCityTriggerDesktop()}</div></div></div><details class="shynli-blog-shell__mobile-toggle"><summary>Menu</summary><div class="shynli-blog-shell__mobile-panel" role="navigation" aria-label="Mobile"><a href="/quote">Get Free Quote</a>${buildBlogShellServicesMobile()}<a href="/service-areas">Service Areas</a><a href="/about-us">About Us</a><a href="/faq">FAQ</a><a href="/#clean">Become a Cleaner</a><a href="tel:+16308127077">Call Us</a></div></details></div></header>`;
}

function buildBlogShellHero(routePath) {
  const article = getBlogArticle(routePath);
  if (article) return "";

  const detail = getBlogCategoryDetail(routePath);
  const title = detail
    ? `${escapeBlogHtml(detail.heroLead)} <span>${escapeBlogHtml(detail.heroAccent)}</span>`
    : `Shynli Cleaning <span>Blog</span>`;
  const text = detail
    ? detail.sectionText
    : "Practical cleaning guides, checklists, service explainers, and room-by-room advice for busy homes across the Chicago suburbs.";

  return `<section class="shynli-blog-shell__hero"><div class="shynli-blog-shell__hero-shell"><p class="shynli-blog-shell__eyebrow">${
    detail ? "Blog category" : "Shynli Cleaning Blog"
  }</p><h1 class="shynli-blog-shell__hero-title">${title}</h1><p class="shynli-blog-shell__hero-text">${escapeBlogHtml(
    text
  )}</p><div class="shynli-blog-shell__hero-actions"><a class="shynli-blog-shell__button is-primary" href="/quote">Get Free Quote</a><a class="shynli-blog-shell__button is-secondary" href="/service-areas">See Service Areas</a></div></div></section>`;
}

function buildBlogShellFooter() {
  return `<footer class="shynli-blog-shell__footer"><div class="shynli-blog-shell__footer-shell"><div class="shynli-blog-shell__footer-top"><section class="shynli-blog-shell__footer-brand"><a class="shynli-blog-shell__logo" href="/" aria-label="Shynli Cleaning home"><img src="/images/tild3666-3333-4430-b664-383666616530__logo_2.png" alt="Shynli Cleaning" /></a><p class="shynli-blog-shell__footer-tagline">Clean Home. Clear Mind.</p><p class="shynli-blog-shell__footer-copy">Practical cleaning guidance when you want to learn, and straightforward booking when you would rather hand the work off.</p></section><section><h2 class="shynli-blog-shell__footer-title">Services</h2><div class="shynli-blog-shell__footer-links"><a href="/services/regular-cleaning">Regular Cleaning</a><a href="/services/deep-cleaning">Deep Cleaning</a><a href="/services/move-in-move-out-cleaning">Move In / Move Out Cleaning</a><a href="/services/airbnb-cleaning">Airbnb Cleaning</a><a href="/services/commercial-cleaning">Commercial Cleaning</a><a href="/service-areas">Service Areas</a></div></section><section><h2 class="shynli-blog-shell__footer-title">Company</h2><div class="shynli-blog-shell__footer-links"><a href="/about-us">About Us</a><a href="/pricing">Pricing</a><a href="/blog">Blog</a><a href="/faq">FAQ</a><a href="/contacts">Contacts</a></div></section><section><h2 class="shynli-blog-shell__footer-title">Legal</h2><div class="shynli-blog-shell__footer-links"><a href="/privacy-policy">Privacy Policy</a><a href="/terms-of-service">Terms of Service</a><a href="/cancellation-policy">Cancellation Policy</a><a href="tel:+16308127077">+1 (630) 812-7077</a><a href="/quote">Get Free Quote</a></div></section></div><div class="shynli-blog-shell__footer-note"><p>© 2026 Shynli Cleaning. All rights reserved.</p><p>Serving Chicago suburbs with practical cleaning help online and straightforward booking offline.</p></div></div></footer>`;
}

function buildManagedBlogShell(routePath, routeSeo) {
  const article = getBlogArticle(routePath);
  const title = routeSeo && routeSeo.title ? routeSeo.title : "Shynli Cleaning Blog";
  const description =
    routeSeo && routeSeo.description
      ? routeSeo.description
      : "Practical home cleaning guides, checklists, and service explainers from Shynli Cleaning.";
  const canonical =
    routeSeo && routeSeo.canonical
      ? routeSeo.canonical
      : "https://shynlicleaningservice.com/blog";
  const ogUrl = routeSeo && routeSeo.ogUrl ? routeSeo.ogUrl : canonical;
  const ogTitle = routeSeo && routeSeo.ogTitle ? routeSeo.ogTitle : title;
  const ogDescription = routeSeo && routeSeo.ogDescription ? routeSeo.ogDescription : description;
  const ogType = article ? "article" : "website";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta http-equiv="Content-Type" content="text/html; charset=utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><!--metatextblock--><title>${escapeBlogHtml(
    title
  )}</title><meta name="description" content="${escapeBlogAttribute(
    description
  )}" /><meta property="og:url" content="${escapeBlogAttribute(
    ogUrl
  )}" /><meta property="og:title" content="${escapeBlogAttribute(
    ogTitle
  )}" /><meta property="og:description" content="${escapeBlogAttribute(
    ogDescription
  )}" /><meta property="og:type" content="${ogType}" /><meta property="og:image" content="${BLOG_SHELL_OG_IMAGE}" /><link rel="canonical" href="${escapeBlogAttribute(
    canonical
  )}"><!--/metatextblock--><meta name="format-detection" content="telephone=no" /><meta http-equiv="x-dns-prefetch-control" content="on" /><base href="/" /><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&family=Montserrat:wght@100..900&subset=latin,cyrillic" rel="stylesheet">${buildBlogShellStyles()}</head><body class="shynli-blog-shell-body"><div class="shynli-blog-shell">${buildBlogShellHeader()}${buildBlogShellCityModal()}<main class="shynli-blog-shell__main">${buildBlogShellHero(
    routePath
  )}${buildBlogHubSection(routePath)}</main>${buildBlogShellFooter()}<div class="shynli-blog-shell__sticky"><a href="/quote">Get Quote</a><a href="tel:+16308127077">Call Us</a></div></div>${buildBlogRuntimeScript(
    routePath
  )}</body></html>`;
}

function buildManagedBlogShellDocument(sourceHtml, routePath) {
  const routeSeo = siteSeoHelpers.deriveRouteSeo(sourceHtml, routePath);
  const blogArticle = getBlogArticle(routePath);
  let output = buildManagedBlogShell(routePath, routeSeo);

  output = siteSeoHelpers.setTitleTag(output, routeSeo.title);
  output = siteSeoHelpers.setMetaContent(output, "description", routeSeo.description);
  output = siteSeoHelpers.setMetaContent(output, "robots", routeSeo.robots);
  output = siteSeoHelpers.setMetaContent(output, "og:url", routeSeo.ogUrl, "property");
  output = siteSeoHelpers.setMetaContent(output, "og:title", routeSeo.ogTitle, "property");
  output = siteSeoHelpers.setMetaContent(output, "og:description", routeSeo.ogDescription, "property");
  output = siteSeoHelpers.setCanonicalLink(output, routeSeo.canonical);

  const breadcrumbSchema = siteSeoHelpers.buildBreadcrumbSchema(routePath);
  if (breadcrumbSchema) {
    output = siteSeoHelpers.upsertJsonLd(output, "schema-breadcrumbs", breadcrumbSchema);
  }
  if (blogArticle) {
    output = siteSeoHelpers.upsertJsonLd(
      output,
      "schema-blog-article",
      buildBlogArticleSchema(blogArticle, routeSeo)
    );
  }

  output = ensureSharedHeadAssets(output);
  output = ensureAnalyticsSnippet(removeLegacyAnalytics(output));
  return output;
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
  const runtimeScript = buildBlogRuntimeScript(normalizedRoute);
  if (BLOG_RUNTIME_SCRIPT_PATTERN.test(html)) {
    return html.replace(BLOG_RUNTIME_SCRIPT_PATTERN, runtimeScript);
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${runtimeScript}</body>`);
  }
  return `${html}${runtimeScript}`;
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

const MENUSUB_RUNTIME_SCRIPT = `<script id="shynli-menusub-runtime">
(() => {
  if (window.__shynliMenusubRuntimeBound) return;
  window.__shynliMenusubRuntimeBound = true;

  const MOBILE_BREAKPOINT = 980;
  const DESKTOP_EDGE_PADDING = 12;
  const HIDE_DELAY_MS = 180;

  function usesTouchNavigation() {
    return window.innerWidth <= MOBILE_BREAKPOINT || window.isMobile || ("ontouchend" in document);
  }

  function resetMenuPosition(menu) {
    menu.style.left = "";
    menu.style.right = "";
    menu.style.top = "";
  }

  function getArrow(trigger) {
    return trigger.querySelector(".t-menusub__arrow");
  }

  function setExpanded(trigger, expanded) {
    trigger.classList.toggle("t-menusub__target-link_active", expanded);
    trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
    const arrow = getArrow(trigger);
    if (arrow) arrow.classList.toggle("t-menusub__arrow_opened", expanded);
  }

  function hideMenu(menu) {
    if (!menu) return;
    const trigger = menu.__shynliTrigger;
    menu.classList.remove("t-menusub__menu_show");
    if (trigger) setExpanded(trigger, false);
    window.clearTimeout(menu.__shynliHideTimer);
    menu.__shynliHideTimer = window.setTimeout(() => {
      if (menu.classList.contains("t-menusub__menu_show")) return;
      menu.style.display = "";
      menu.classList.remove("t-menusub__menu_bottom", "t-menusub__menu_top");
      resetMenuPosition(menu);
    }, HIDE_DELAY_MS);
  }

  function closeAllMenus(exceptMenu) {
    document.querySelectorAll(".t-menusub__menu.t-menusub__menu_show").forEach((menu) => {
      if (menu === exceptMenu) return;
      hideMenu(menu);
    });
  }

  function positionDesktopMenu(trigger, menu, marginValue) {
    const offsetParent = menu.offsetParent || document.body;
    const parentRect =
      offsetParent === document.body || offsetParent === document.documentElement
        ? { left: 0, top: 0 }
        : offsetParent.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const margin =
      Number.parseInt(String(marginValue || "").replace(/[^\\d-]/g, ""), 10) || 15;

    menu.classList.remove("t-menusub__menu_top");
    menu.classList.add("t-menusub__menu_bottom");
    menu.style.display = "block";

    let left = triggerRect.left - parentRect.left + (triggerRect.width - menu.offsetWidth) / 2;
    const viewportLeft = parentRect.left + left;
    if (viewportLeft < DESKTOP_EDGE_PADDING) {
      left += DESKTOP_EDGE_PADDING - viewportLeft;
    }
    const viewportRight = parentRect.left + left + menu.offsetWidth;
    if (viewportRight > window.innerWidth - DESKTOP_EDGE_PADDING) {
      left -= viewportRight - (window.innerWidth - DESKTOP_EDGE_PADDING);
    }

    let top = triggerRect.bottom - parentRect.top + margin;
    const menuBottom = triggerRect.bottom + margin + menu.offsetHeight;
    const topCandidate = triggerRect.top - parentRect.top - margin - menu.offsetHeight;
    if (menuBottom > window.innerHeight - DESKTOP_EDGE_PADDING && topCandidate >= DESKTOP_EDGE_PADDING) {
      menu.classList.remove("t-menusub__menu_bottom");
      menu.classList.add("t-menusub__menu_top");
      top = topCandidate;
    }

    menu.style.left = \`\${Math.max(0, left)}px\`;
    menu.style.top = \`\${Math.max(0, top)}px\`;
  }

  function showMenu(trigger, menu, marginValue) {
    if (!menu) return;
    window.clearTimeout(menu.__shynliHideTimer);
    closeAllMenus(menu);
    menu.style.display = "block";
    menu.classList.add("t-menusub__menu_show");
    if (usesTouchNavigation()) {
      menu.classList.remove("t-menusub__menu_top");
      menu.classList.add("t-menusub__menu_bottom");
      resetMenuPosition(menu);
    } else {
      positionDesktopMenu(trigger, menu, marginValue);
    }
    setExpanded(trigger, true);
  }

  function bindMenu(trigger, submenuRoot) {
    if (!trigger || !submenuRoot || trigger.dataset.shynliMenusubBound === "1") return;
    const menu = submenuRoot.querySelector(".t-menusub__menu");
    if (!menu) return;

    trigger.dataset.shynliMenusubBound = "1";
    trigger.classList.add("t-menusub__target-link");
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    menu.__shynliTrigger = trigger;

    if (submenuRoot.getAttribute("data-add-submenu-arrow") === "on" && !getArrow(trigger)) {
      const arrow = document.createElement("span");
      arrow.className = "t-menusub__arrow";
      trigger.appendChild(arrow);
    }

    const owner = trigger.closest(".t-menu-base__list-item") || trigger.parentElement || submenuRoot;
    const marginValue = submenuRoot.getAttribute("data-submenu-margin") || "15px";

    owner.addEventListener("mouseenter", () => {
      if (usesTouchNavigation()) return;
      showMenu(trigger, menu, marginValue);
    });

    owner.addEventListener("mouseleave", (event) => {
      if (usesTouchNavigation()) return;
      if (event.relatedTarget && owner.contains(event.relatedTarget)) return;
      hideMenu(menu);
    });

    trigger.addEventListener("focus", () => {
      if (usesTouchNavigation()) return;
      showMenu(trigger, menu, marginValue);
    });

    trigger.addEventListener("click", (event) => {
      if (!usesTouchNavigation()) return;
      event.preventDefault();
      if (menu.classList.contains("t-menusub__menu_show")) {
        hideMenu(menu);
      } else {
        showMenu(trigger, menu, marginValue);
      }
      window.requestAnimationFrame(() => {
        setExpanded(trigger, menu.classList.contains("t-menusub__menu_show"));
      });
    });
  }

  function initMenus(root) {
    Array.prototype.slice
      .call((root || document).querySelectorAll("a.t-menu__link-item[data-menu-submenu-hook]"))
      .forEach((trigger) => {
        const hook = trigger.getAttribute("data-menu-submenu-hook");
        if (!hook || !trigger.parentElement) return;
        const submenuRoot = trigger.parentElement.querySelector(
          \`.t-menusub[data-submenu-hook="\${hook}"]\`
        );
        if (!submenuRoot) return;
        bindMenu(trigger, submenuRoot);
      });
  }

  window.t_menusub_init = function(recordId) {
    const root = document.getElementById(\`rec\${recordId}\`);
    initMenus(root || document);
  };

  window.t_menusub__showSubmenu = function(trigger, menu, marginValue) {
    showMenu(trigger, menu, marginValue);
  };

  window.t_menusub__hideSubmenu = function(menu) {
    hideMenu(menu);
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".t-menusub") || target.closest("[data-menu-submenu-hook]")) return;
    closeAllMenus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllMenus();
  });

  window.addEventListener("resize", () => {
    closeAllMenus();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initMenus(document), { once: true });
  } else {
    initMenus(document);
  }
})();
</script>`;

const MENU_SHELL_RUNTIME_SCRIPT = `<script id="shynli-menu-shell-runtime">
(() => {
  if (window.__shynliMenuShellRuntimeBound) return;
  window.__shynliMenuShellRuntimeBound = true;

  const MOBILE_BREAKPOINT = 960;
  const MENU_OPEN_CLASS = "tmenu-mobile_opened";
  const BURGER_CONTAINER_OPEN_CLASS = "t-menuburger-opened";
  const BURGER_OPEN_CLASS = "t-menu-burger_open";
  const BURGER_HOVER_CLASS = "t-menu-burger_hover";
  const BURGER_UNHOVER_CLASS = "t-menu-burger_unhover";
  const BODY_MENU_OPEN_CLASS = "t-menu-base_opened";

  function supportsTouchNavigation() {
    return window.innerWidth <= MOBILE_BREAKPOINT || window.isMobile || "ontouchend" in document;
  }

  function normalizePath(value) {
    if (!value) return "/";
    let path = value;
    if (/^https?:/i.test(path)) {
      try {
        path = new URL(path, window.location.origin).pathname;
      } catch (_error) {
        path = "/";
      }
    }
    if (!path.startsWith("/")) path = "/" + path;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path || "/";
  }

  function closeOpenSubmenus(root) {
    const scope = root || document;
    scope.querySelectorAll(".t-menusub__menu.t-menusub__menu_show").forEach((menu) => {
      window.t_menusub__hideSubmenu?.(menu);
    });
    scope
      .querySelectorAll('.t-menu__link-item[aria-expanded="true"], .t-menusub__target-link[aria-expanded="true"]')
      .forEach((link) => {
        link.setAttribute("aria-expanded", "false");
      });
  }

  function getHashTarget(link) {
    if (!(link instanceof Element)) return null;
    const href = link.getAttribute("href") || "";
    if (!href.includes("#")) return null;
    const hash = href.slice(href.indexOf("#") + 1).trim();
    if (!hash) return null;
    const directTarget = document.getElementById(hash);
    if (directTarget) return directTarget;
    const namedTarget = document.querySelector('[name="' + CSS.escape(hash) + '"]');
    if (namedTarget) {
      if (!namedTarget.id) namedTarget.id = hash;
      return namedTarget;
    }
    return null;
  }

  function getMenuRecord(recordId) {
    return document.getElementById("rec" + recordId);
  }

  window.t_menuBase__FadeOut = function t_menuBase__FadeOut(element, duration, callback) {
    if (!element) return false;
    const stepMs = Math.max(20, Math.floor((Number.parseInt(duration, 10) || 400) / 10));
    let opacity = 1;
    const interval = window.setInterval(() => {
      element.style.opacity = String(opacity);
      opacity -= 0.1;
      if (opacity <= 0.1) {
        element.style.opacity = "0";
        element.style.display = "none";
        if (typeof callback === "function") callback();
        window.clearInterval(interval);
      }
    }, stepMs);
    return true;
  };

  window.t_menuBase__fadeIn = function t_menuBase__fadeIn(element, duration, callback) {
    if (!element) return false;
    const computed = window.getComputedStyle(element);
    if ((computed.opacity === "1" || computed.opacity === "") && computed.display !== "none") {
      if (typeof callback === "function") callback();
      return false;
    }
    const stepMs = Math.max(20, Math.floor((Number.parseInt(duration, 10) || 400) / 10));
    let opacity = 0;
    element.style.opacity = "0";
    element.style.display = "block";
    const interval = window.setInterval(() => {
      element.style.opacity = String(opacity);
      opacity += 0.1;
      if (opacity >= 1) {
        element.style.opacity = "1";
        if (typeof callback === "function") callback();
        window.clearInterval(interval);
      }
    }, stepMs);
    return true;
  };

  window.t_menuBase__setBGcolor = function t_menuBase__setBGcolor(recordId, selector) {
    const record = getMenuRecord(recordId);
    const nodes = record ? record.querySelectorAll(selector) : document.querySelectorAll(selector);
    nodes.forEach((node) => {
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        if (node.getAttribute("data-bgcolor-setbyscript") === "yes") {
          const rgba = node.getAttribute("data-bgcolor-rgba");
          if (rgba) node.style.backgroundColor = rgba;
        }
        return;
      }
      const hex = node.getAttribute("data-bgcolor-hex");
      if (hex) node.style.backgroundColor = hex;
      node.setAttribute("data-bgcolor-setbyscript", "yes");
      if (node.style.transform) node.style.transform = "";
      if (node.style.opacity) node.style.opacity = "";
    });
  };

  window.t_menuBase__highlightActiveLinks = function t_menuBase__highlightActiveLinks(selector) {
    const currentHref = window.location.href;
    const currentPath = normalizePath(window.location.pathname);
    const alternateHref = currentHref.endsWith("/") ? currentHref.slice(0, -1) : currentHref + "/";

    document.querySelectorAll(selector).forEach((link) => {
      link.classList.remove("t-active");
      const href = link.getAttribute("href");
      if (!href) return;
      if (href.includes("#")) {
        const [pathPart, hashPart] = href.split("#");
        const normalizedLinkPath = normalizePath(pathPart || window.location.pathname);
        const currentHash = window.location.hash ? window.location.hash.slice(1) : "";
        if (normalizedLinkPath === currentPath && hashPart && currentHash === hashPart) {
          link.classList.add("t-active");
        }
        return;
      }
      const normalizedHref = normalizePath(href);
      const absoluteHref = link.href;
      if (
        normalizedHref === currentPath ||
        absoluteHref === currentHref ||
        absoluteHref === alternateHref ||
        href === currentHref
      ) {
        link.classList.add("t-active");
      }
    });
  };

  window.t_menuBase__findAnchorLinks = function t_menuBase__findAnchorLinks(recordId, selector) {
    const record = getMenuRecord(recordId);
    if (!record) return;
    const links = Array.from(record.querySelectorAll(selector + '[href*="#"]:not(.tooltipstered)')).filter((link) =>
      getHashTarget(link)
    );
    if (!links.length) return;

    const refresh = () => {
      const currentPosition = window.pageYOffset + 140;
      let activeLink = null;

      links.forEach((link) => {
        const target = getHashTarget(link);
        if (!target) return;
        const offsetTop = target.getBoundingClientRect().top + window.pageYOffset;
        target.setAttribute("data-offset-top", String(offsetTop));
        const isMatch =
          window.location.hash &&
          window.location.hash.slice(1) === (link.getAttribute("href") || "").split("#").pop();
        if (isMatch || offsetTop <= currentPosition) {
          activeLink = link;
        }
      });

      links.forEach((link) => {
        link.classList.toggle("t-active", link === activeLink);
      });
    };

    refresh();
    if (record.dataset.shynliAnchorLinksBound === "1") return;
    record.dataset.shynliAnchorLinksBound = "1";
    window.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh);
    window.addEventListener("hashchange", refresh);
  };

  window.t_menuBase__interactFromKeyboard = function t_menuBase__interactFromKeyboard(recordId) {
    const record = getMenuRecord(recordId);
    if (!record || record.dataset.shynliMenuKeyboardBound === "1") return;
    record.dataset.shynliMenuKeyboardBound = "1";

    const topLevelLinks = Array.from(record.querySelectorAll(".t-menu__list > li > a"));

    topLevelLinks.forEach((link, linkIndex) => {
      const submenuRoot = link.parentElement?.querySelector(".t-menusub");
      const submenuMenu = submenuRoot?.querySelector(".t-menusub__menu");
      const submenuItems = submenuMenu ? Array.from(submenuMenu.querySelectorAll(".t-menusub__link-item")) : [];

      link.addEventListener("keydown", (event) => {
        if (event.key === "Tab" && topLevelLinks.length > 1) {
          closeOpenSubmenus(record);
          return;
        }
        if (!submenuMenu) return;
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
          event.preventDefault();
          const margin = submenuRoot?.getAttribute("data-submenu-margin") || 15;
          link.setAttribute("aria-expanded", "true");
          window.t_menusub__showSubmenu?.(link, submenuMenu, margin);
          submenuItems[0]?.focus();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          link.setAttribute("aria-expanded", "false");
          window.t_menusub__hideSubmenu?.(submenuMenu);
          return;
        }
        if (event.key === "ArrowRight" && topLevelLinks[linkIndex + 1]) {
          event.preventDefault();
          closeOpenSubmenus(record);
          topLevelLinks[linkIndex + 1].focus();
          return;
        }
        if (event.key === "ArrowLeft" && topLevelLinks[linkIndex - 1]) {
          event.preventDefault();
          closeOpenSubmenus(record);
          topLevelLinks[linkIndex - 1].focus();
        }
      });

      submenuItems.forEach((item, itemIndex) => {
        item.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            window.t_menusub__hideSubmenu?.(submenuMenu);
            link.setAttribute("aria-expanded", "false");
            link.focus();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            submenuItems[(itemIndex + 1) % submenuItems.length]?.focus();
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            submenuItems[(itemIndex - 1 + submenuItems.length) % submenuItems.length]?.focus();
          }
        });
      });
    });
  };

  window.t_menuBurger__init = function t_menuBurger__init(recordId) {
    const record = getMenuRecord(recordId);
    if (!record) return;
    const burger = record.querySelector(".t-menu-burger");
    if (!burger || burger.dataset.shynliBurgerBound === "1") return;
    burger.dataset.shynliBurgerBound = "1";

    if (burger.classList.contains("t-menu-burger__icon_second") && !supportsTouchNavigation()) {
      burger.addEventListener("mouseenter", () => {
        if (burger.classList.contains(BURGER_OPEN_CLASS)) return;
        burger.classList.remove(BURGER_UNHOVER_CLASS);
        burger.classList.add(BURGER_HOVER_CLASS);
      });
      burger.addEventListener("mouseleave", () => {
        if (burger.classList.contains(BURGER_OPEN_CLASS)) return;
        burger.classList.remove(BURGER_HOVER_CLASS);
        burger.classList.add(BURGER_UNHOVER_CLASS);
        window.setTimeout(() => {
          burger.classList.remove(BURGER_UNHOVER_CLASS);
        }, 300);
      });
    }

    burger.addEventListener("click", () => {
      if (
        burger.closest(".tmenu-mobile:not(.t-menu-base__mobile-menu)") ||
        burger.closest(".t450__burger_container") ||
        burger.closest(".t466__container") ||
        burger.closest(".t204__burger") ||
        burger.closest(".t199__js__menu-toggler")
      ) {
        return;
      }
      burger.classList.toggle(BURGER_OPEN_CLASS);
      burger.classList.remove(BURGER_UNHOVER_CLASS);
    });

    const menu = record.querySelector('[data-menu="yes"]');
    if (!menu) return;
    const skipClasses = [
      "t978__menu-link_hook",
      "t978__tm-link",
      "t966__tm-link",
      "t794__tm-link",
      "t-menusub__target-link",
    ];

    menu.querySelectorAll(".t-menu__link-item").forEach((link) => {
      link.addEventListener("click", () => {
        if (skipClasses.some((className) => link.classList.contains(className))) return;
        burger.classList.remove(BURGER_OPEN_CLASS);
      });
    });

    menu.addEventListener("clickedAnchorInTooltipMenu", () => {
      burger.classList.remove(BURGER_OPEN_CLASS);
    });
  };

  window.t_menuBurger__showBurgerText =
    window.t_menuBurger__showBurgerText ||
    function t_menuBurger__showBurgerText() {};
  window.t_menuWidgets__getBurgerTextHTML =
    window.t_menuWidgets__getBurgerTextHTML ||
    function t_menuWidgets__getBurgerTextHTML(text) {
      return '<span class="t-menu-burger__text t-text">' + String(text || "") + "</span>";
    };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".t-menusub")) return;
    document.querySelectorAll(".t-menu-burger_open").forEach((burger) => {
      if (burger.contains(target)) return;
      if (target.closest(".tmenu-mobile")) return;
      burger.classList.remove(BURGER_OPEN_CLASS);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeOpenSubmenus(document);
  });
})();
</script>`;

const MENU_WIDGETICONS_RUNTIME_STUB = `<script id="shynli-menu-widgeticons-runtime-stub">
window.t_menuWidgets__init =
  window.t_menuWidgets__init ||
  function t_menuWidgets__init() {};
</script>`;

const HOME_PAGE_RUNTIME_SCRIPT = `<script id="shynli-home-page-runtime">
(() => {
  if (window.__shynliHomePageRuntimeBound) return;
  window.__shynliHomePageRuntimeBound = true;

  const MOBILE_BREAKPOINT = 960;
  const POPUP_SHOW_CLASS = "t-popup_show";
  const POPUP_BG_ACTIVE_CLASS = "t-popup__bg-active";
  const BODY_POPUP_CLASS = "t-body_popupshowed";
  const SUBMENU_LINK_CLASSES = [
    "t978__menu-link_hook",
    "t978__tm-link",
    "t966__tm-link",
    "t794__tm-link",
    "t-menusub__target-link",
  ];

  function getRecord(recordId) {
    return document.getElementById("rec" + recordId);
  }

  function isMobileViewport() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function isSubmenuTrigger(link) {
    if (!(link instanceof Element)) return false;
    return SUBMENU_LINK_CLASSES.some((className) => link.classList.contains(className));
  }

  function getBurger(record) {
    return record ? record.querySelector(".t-menu-burger") : null;
  }

  function getMobileMenuShell(record) {
    return record ? record.querySelector(".tmenu-mobile") : null;
  }

  function getMenu(record) {
    return record ? record.querySelector(".t-menu-base[data-menu='yes'], .t-menu-base[data-menu=yes]") : null;
  }

  function setBurgerState(record, isOpen) {
    const burger = getBurger(record);
    const mobileShell = getMobileMenuShell(record);
    if (burger) {
      burger.classList.toggle("t-menu-burger_open", isOpen);
      burger.classList.toggle("t-menuburger-opened", isOpen);
      burger.classList.remove("t-menu-burger_hover", "t-menu-burger_unhover");
      burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
    if (mobileShell) {
      mobileShell.classList.toggle("tmenu-mobile_opened", isOpen);
    }
    document.body.classList.toggle("t-menu-base_opened", isOpen);
  }

  function fadeOutMenu(menu, callback) {
    if (typeof window.t_menuBase__FadeOut === "function") {
      window.t_menuBase__FadeOut(menu, 300, callback);
      return;
    }
    menu.style.opacity = "0";
    menu.style.display = "none";
    if (typeof callback === "function") callback();
  }

  function fadeInMenu(menu, callback) {
    if (typeof window.t_menuBase__fadeIn === "function") {
      window.t_menuBase__fadeIn(menu, 300, callback);
      return;
    }
    menu.style.display = "block";
    menu.style.opacity = "1";
    if (typeof callback === "function") callback();
  }

  function syncMobileMenuTop(record) {
    const mobileShell = record ? record.querySelector(".tmenu-mobile.tmenu-mobile_positionfixed") : null;
    const menu = record ? record.querySelector(".tmenu-mobile__menucontent_fixed") : null;
    if (!mobileShell || !menu) return;

    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      const computed = window.getComputedStyle(mobileShell);
      const height = Number.parseFloat(computed.height) || 64;
      const border = Number.parseFloat(computed.borderBottomWidth) || 0;
      menu.style.setProperty("top", height + border + "px", "important");
      return;
    }

    menu.style.removeProperty("top");
  }

  function checkMobileMenuOverflow(record) {
    const menu = getMenu(record);
    const burgerShell = getMobileMenuShell(record);
    if (!menu || !burgerShell) return;

    const burgerHeight = burgerShell.offsetHeight || 0;
    const availableHeight = document.documentElement.clientHeight - burgerHeight;
    const isFixedMenu = (menu.style.position || window.getComputedStyle(menu).position) === "fixed";

    if (isFixedMenu && menu.offsetHeight > availableHeight) {
      menu.style.overflow = "auto";
      menu.style.maxHeight = Math.max(availableHeight, 0) + "px";
      return;
    }

    menu.style.removeProperty("overflow");
    menu.style.removeProperty("max-height");
  }

  function closeMobileMenu(record) {
    const menu = getMenu(record);
    if (!menu) return;
    setBurgerState(record, false);
    fadeOutMenu(menu, () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        menu.style.removeProperty("display");
        menu.style.removeProperty("opacity");
      }
    });
  }

  function openMobileMenu(record) {
    const menu = getMenu(record);
    if (!menu) return;
    syncMobileMenuTop(record);
    fadeInMenu(menu, () => {
      menu.style.removeProperty("transform");
    });
    setBurgerState(record, true);
    checkMobileMenuOverflow(record);
  }

  function hideMenuOnMobile(link, record) {
    if (!isMobileViewport() || !record || !(link instanceof Element)) return false;
    if (isSubmenuTrigger(link)) return false;
    closeMobileMenu(record);
    return true;
  }

  function t1272_centerElementInMenu(recordId, selectors) {
    const record = getRecord(recordId);
    if (!record) return;
    const container = record.querySelector(selectors.containerSelector);
    const centerBlock = container ? container.querySelector(selectors.centerSelector) : null;
    const leftSideBlock = container ? container.querySelector(selectors.leftSideSelector) : null;
    if (!container || !centerBlock || !leftSideBlock) return;

    const centerWidth = centerBlock.offsetWidth || 0;
    if (!centerWidth) return;

    const gap = 50;
    const containerPadding = Number.parseInt(window.getComputedStyle(container).paddingLeft, 10) || 0;
    const sideWidth = (container.offsetWidth - containerPadding * 2 - gap * 2 - centerWidth) / 2;
    if (sideWidth <= 0) return;

    leftSideBlock.style.flex = "1 1 " + sideWidth + "px";
    leftSideBlock.style.maxWidth = sideWidth + "px";
  }

  function bindDesktopLinks(record) {
    if (!record || record.dataset.shynliHomeDesktopLinksBound === "1") return;
    record.dataset.shynliHomeDesktopLinksBound = "1";

    record.querySelectorAll(".t-menu__link-item").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (event.target.closest(".t-menusub__arrow")) return;
        hideMenuOnMobile(link, record);
      });
    });

    record.querySelectorAll(".t-menusub__link-item").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (event.target.closest(".t-menusub__arrow")) return;
        if (link.hasAttribute("data-menu-submenu-hook")) return;
        hideMenuOnMobile(link, record);
      });
    });
  }

  function initCentering(recordId) {
    const record = getRecord(recordId);
    if (!record || record.dataset.shynliHomeCenteringBound === "1") return;
    record.dataset.shynliHomeCenteringBound = "1";

    const recalc = () => {
      t1272_centerElementInMenu(recordId, {
        containerSelector: ".t-menu-base__maincontainer_logocenter",
        centerSelector: ".t-menu-base__logowrapper_center",
        leftSideSelector: ".t-menu-base__list_leftside",
      });
      t1272_centerElementInMenu(recordId, {
        containerSelector: ".t-menu-base__maincontainer_logoleft",
        centerSelector: ".t-menu-base__leftwrapper_center",
        leftSideSelector: ".t-menu-base__logowrapper_left",
      });
    };

    recalc();
    window.addEventListener("resize", typeof window.t_throttle === "function" ? window.t_throttle(recalc, 200) : recalc);
  }

  function handleLangWidget(record) {
    const dropdown = record ? record.querySelector(".t-menu-base__langs_dropdown") : null;
    const button = record ? record.querySelector(".js-lang-button") : null;
    if (!dropdown || !button || dropdown.dataset.shynliLangBound === "1") return;
    dropdown.dataset.shynliLangBound = "1";

    let hideTimer = 0;

    function positionDropdown() {
      const rect = dropdown.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      dropdown.classList.toggle("t-menu-base__langs_dropdown_top", spaceBelow < 0 && spaceAbove > Math.abs(spaceBelow));
    }

    function showDropdown() {
      window.clearTimeout(hideTimer);
      dropdown.classList.add("t-menu-base__langs_dropdown_show");
      positionDropdown();
    }

    function hideDropdown() {
      hideTimer = window.setTimeout(() => {
        dropdown.classList.remove("t-menu-base__langs_dropdown_show");
      }, 300);
    }

    button.addEventListener("mouseenter", showDropdown);
    button.addEventListener("mouseleave", hideDropdown);
    dropdown.addEventListener("mouseenter", showDropdown);
    dropdown.addEventListener("mouseleave", hideDropdown);
  }

  function createMobileMenu(recordId) {
    const record = getRecord(recordId);
    const menu = getMenu(record);
    const mobileShell = getMobileMenuShell(record);
    const burger = getBurger(record);
    if (!record || !menu || !mobileShell || !burger) return;
    if (record.dataset.shynliHomeMobileMenuBound === "1") {
      syncMobileMenuTop(record);
      checkMobileMenuOverflow(record);
      return;
    }
    record.dataset.shynliHomeMobileMenuBound = "1";

    syncMobileMenuTop(record);
    checkMobileMenuOverflow(record);

    mobileShell.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;

      const isOpen = mobileShell.classList.contains("tmenu-mobile_opened");
      if (isOpen) {
        closeMobileMenu(record);
      } else {
        openMobileMenu(record);
      }
    });

    record.addEventListener("click", (event) => {
      const link = event.target.closest(".t-menu__link-item, .t978__submenu-link, .t978__innermenu-link, .t966__menu-link, .t-menusub__link-item, .t-btn, .t794__link");
      if (!link) return;
      hideMenuOnMobile(link, record);
      window.setTimeout(() => checkMobileMenuOverflow(record), 0);
    });

    record.querySelectorAll(".t-menu-base__logo a, .t-menu-base__buttons a").forEach((link) => {
      link.addEventListener("click", () => {
        hideMenuOnMobile(link, record);
      });
    });

    window.addEventListener(
      "resize",
      typeof window.t_throttle === "function"
        ? window.t_throttle(() => {
            if (window.innerWidth > MOBILE_BREAKPOINT) {
              menu.style.removeProperty("display");
              menu.style.removeProperty("opacity");
              setBurgerState(record, false);
            }
            syncMobileMenuTop(record);
            checkMobileMenuOverflow(record);
          }, 200)
        : () => {
            if (window.innerWidth > MOBILE_BREAKPOINT) {
              menu.style.removeProperty("display");
              menu.style.removeProperty("opacity");
              setBurgerState(record, false);
            }
            syncMobileMenuTop(record);
            checkMobileMenuOverflow(record);
          }
    );
  }

  function getPopupByHook(hook) {
    if (!hook) return null;
    return document.querySelector('.t-popup[data-tooltip-hook="' + hook + '"]');
  }

  function getPopupPairRecord(elementId) {
    if (!elementId) return null;
    return (
      document.getElementById(elementId) ||
      document.getElementById("rec" + elementId) ||
      document.querySelector('a[name="' + elementId + '"]')?.nextElementSibling ||
      null
    );
  }

  function getPopupDuration(popup) {
    const timeout = Number.parseFloat(popup?.getAttribute("data-anim-timeout") || "0");
    if (!Number.isFinite(timeout) || timeout <= 0) return 0;
    return Math.round(timeout * 1000);
  }

  function updateBodyPopupState() {
    const hasOpenPopup = Array.from(document.querySelectorAll(".t-popup")).some((popup) =>
      popup.classList.contains(POPUP_SHOW_CLASS)
    );
    document.body.classList.toggle(BODY_POPUP_CLASS, hasOpenPopup);
  }

  function closePopup(popup, returnFocus) {
    if (!(popup instanceof HTMLElement)) return;
    const background = popup.nextElementSibling instanceof HTMLElement ? popup.nextElementSibling : null;
    popup.classList.remove(POPUP_SHOW_CLASS, "t-popup-fadeout");

    const focusTarget =
      returnFocus instanceof HTMLElement && document.contains(returnFocus) ? returnFocus : null;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && popup.contains(activeElement)) {
      if (typeof activeElement.blur === "function") {
        activeElement.blur();
      }
      if (focusTarget) {
        focusTarget.focus({ preventScroll: true });
      } else {
        const previousTabIndex = document.body.getAttribute("tabindex");
        document.body.setAttribute("tabindex", "-1");
        document.body.focus({ preventScroll: true });
        if (previousTabIndex === null) {
          document.body.removeAttribute("tabindex");
        } else {
          document.body.setAttribute("tabindex", previousTabIndex);
        }
      }
    }

    popup.setAttribute("aria-hidden", "true");
    if (background) background.classList.remove(POPUP_BG_ACTIVE_CLASS);

    const finishClose = () => {
      popup.style.display = "none";
      updateBodyPopupState();
      if (focusTarget && document.activeElement !== focusTarget) {
        focusTarget.focus({ preventScroll: true });
      }
    };

    const duration = getPopupDuration(popup);
    if (duration > 0) {
      window.setTimeout(finishClose, duration);
    } else {
      finishClose();
    }
  }

  function closeAllPopups(returnFocus) {
    document.querySelectorAll(".t-popup." + POPUP_SHOW_CLASS).forEach((popup) => {
      closePopup(popup, returnFocus);
    });
  }

  function openPopup(popup, trigger) {
    if (!(popup instanceof HTMLElement)) return;

    document.querySelectorAll(".t-popup." + POPUP_SHOW_CLASS).forEach((openPopupNode) => {
      if (openPopupNode !== popup) {
        closePopup(openPopupNode);
      }
    });

    popup.style.display = "block";
    popup.setAttribute("aria-hidden", "false");
    popup.removeAttribute("hidden");

    const background = popup.nextElementSibling instanceof HTMLElement ? popup.nextElementSibling : null;
    if (background) background.classList.add(POPUP_BG_ACTIVE_CLASS);

    const artboard = popup.querySelector(".t396__artboard");
    const blockId = artboard ? artboard.getAttribute("data-artboard-recid") || "" : "";
    if (blockId && typeof window.t396_doResize === "function") {
      window.t396_doResize(blockId);
    }
    if (typeof window.t_lazyload_update === "function") {
      window.t_lazyload_update();
    }

    window.requestAnimationFrame(() => {
      popup.classList.add(POPUP_SHOW_CLASS);
      popup.focus({ preventScroll: false });
      updateBodyPopupState();
    });

    popup.__shynliLastTrigger = trigger instanceof HTMLElement ? trigger : null;
  }

  function bindPopupChrome(popup) {
    if (!(popup instanceof HTMLElement) || popup.dataset.shynliPopupChromeBound === "1") return;
    popup.dataset.shynliPopupChromeBound = "1";

    const background = popup.nextElementSibling instanceof HTMLElement ? popup.nextElementSibling : null;
    const closeButtons = popup.querySelectorAll(".t-popup__close, .t-popup__block-close, .t-popup__close-wrapper, [aria-label='Закрыть диалоговое окно']");

    popup.addEventListener("click", (event) => {
      if (event.target.closest(".t-popup__container")) return;
      closePopup(popup, popup.__shynliLastTrigger || null);
    });

    closeButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePopup(popup, popup.__shynliLastTrigger || null);
      });
    });

    if (background) {
      background.addEventListener("click", () => {
        closePopup(popup, popup.__shynliLastTrigger || null);
      });
    }
  }

  function preparePopup(recordId) {
    const record = getRecord(recordId);
    const popup = record ? record.querySelector(".t-popup") : null;
    const container = popup ? popup.querySelector(".t-popup__container") : null;
    if (!record || !popup || !container) return null;
    if (popup.dataset.shynliPopupPrepared === "1") return popup;

    popup.dataset.shynliPopupPrepared = "1";
    popup.style.display = "none";
    popup.setAttribute("aria-hidden", "true");
    record.setAttribute("data-animationappear", "off");
    record.style.opacity = "1";

    const popupIds = String(popup.getAttribute("data-popup-rec-ids") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    popupIds.forEach((elementId) => {
      const pairedRecord = getPopupPairRecord(elementId);
      if (!(pairedRecord instanceof HTMLElement)) return;
      container.appendChild(pairedRecord);
      const blockId = (pairedRecord.id || "").replace(/^rec/, "");
      if (blockId && typeof window.t396_init === "function") {
        window.t396_init(blockId);
      }
    });

    bindPopupChrome(popup);
    return popup;
  }

  function bindPopupTriggers(recordId) {
    const popup = preparePopup(recordId);
    const hook = popup ? popup.getAttribute("data-tooltip-hook") || "" : "";
    if (!popup || !hook) return;

    document.querySelectorAll('a[href="' + hook + '"]').forEach((link) => {
      if (link.dataset.shynliPopupHookBound === "1") return;
      link.dataset.shynliPopupHookBound = "1";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (popup.classList.contains(POPUP_SHOW_CLASS)) {
          closePopup(popup, link);
          return;
        }
        openPopup(popup, link);
      });
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const activePopup = Array.from(document.querySelectorAll(".t-popup." + POPUP_SHOW_CLASS)).pop();
    if (!activePopup) return;
    closePopup(activePopup, activePopup.__shynliLastTrigger || null);
  });

  document.addEventListener("click", (event) => {
    const closeLink = event.target.closest('a[href="#closepopup"], a[href="#closeallpopup"]');
    if (!closeLink) return;
    event.preventDefault();
    closeAllPopups();
  });

  window.t1272_init = function t1272_init(recordId) {
    const record = getRecord(recordId);
    if (!record) return;
    bindDesktopLinks(record);
    initCentering(recordId);
    if (typeof window.t_menuWidgets__init === "function") {
      window.t_menuWidgets__init(recordId);
    }
    if (typeof window.t_menuBurger__init === "function") {
      window.t_menuBurger__init(recordId);
    }
    handleLangWidget(record);
  };

  window.t1272_createMobileMenu = function t1272_createMobileMenu(recordId) {
    createMobileMenu(recordId);
  };

  window.t1093__init = function t1093__init(recordId) {
    preparePopup(recordId);
  };

  window.t1093__initPopup = function t1093__initPopup(recordId) {
    bindPopupTriggers(recordId);
  };

  window.t943_init =
    window.t943_init ||
    function t943_init() {};
  window.t943_showButton =
    window.t943_showButton ||
    function t943_showButton() {};
})();
</script>`;

const SHARED_MARKETING_ROUTES = new Set([
  "/",
  "/about-us",
  "/addison",
  "/aurora",
  "/bartlett",
  "/batavia",
  "/bolingbrook",
  "/burrridge",
  "/carolstream",
  "/clarendonhills",
  "/contacts",
  "/darien",
  "/downersgrove",
  "/elmhurst",
  "/faq",
  "/geneva",
  "/glenellyn",
  "/hinsdale",
  "/home-calculator",
  "/home-simple",
  "/homerglen",
  "/itasca",
  "/lemont",
  "/lisle",
  "/lockport",
  "/lombard",
  "/montgomery",
  "/naperville",
  "/oakbrook",
  "/oswego",
  "/plainfield",
  "/pricing",
  "/romeoville",
  "/service-areas",
  "/services/airbnb-cleaning",
  "/services/commercial-cleaning",
  "/services/deep-cleaning",
  "/services/move-in-move-out-cleaning",
  "/services/post-construction-cleaning",
  "/services/regular-cleaning",
  "/stcharles",
  "/streamwood",
  "/villapark",
  "/warrenville",
  "/wayne",
  "/westchicago",
  "/westmont",
  "/wheaton",
  "/willowbrook",
  "/winfield",
  "/wooddale",
  "/woodridge",
]);

const SERVICE_ROUTE_PILOT_ROUTES = new Set([
  "/services/airbnb-cleaning",
  "/services/commercial-cleaning",
  "/services/deep-cleaning",
  "/services/move-in-move-out-cleaning",
  "/services/post-construction-cleaning",
  "/services/regular-cleaning",
]);

const CITY_ROUTE_PILOT_ROUTES = new Set([
  "/addison",
  "/aurora",
  "/bartlett",
  "/batavia",
  "/bolingbrook",
  "/carolstream",
  "/clarendonhills",
  "/naperville",
  "/plainfield",
  "/romeoville",
  "/wheaton",
]);

const ZERO_RUNTIME_PILOT_ROUTES = new Set([...SERVICE_ROUTE_PILOT_ROUTES, ...CITY_ROUTE_PILOT_ROUTES]);
const LAZYLOAD_PILOT_ROUTES = new Set([...SERVICE_ROUTE_PILOT_ROUTES, ...CITY_ROUTE_PILOT_ROUTES]);
const ZERO_SCALE_PILOT_ROUTES = new Set([...SERVICE_ROUTE_PILOT_ROUTES, ...CITY_ROUTE_PILOT_ROUTES]);

function insertIntoHead(html, snippet) {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${snippet}</head>`);
  }
  return `${snippet}${html}`;
}

function hydrateLazyMedia(html) {
  let output = String(html || "");

  output = output.replace(/<img\b([^>]*?)\bdata-original=(['"])([^'"]+)\2([^>]*)>/gi, (match, before, _quote, original, after) => {
    let tag = `<img${before}${after}>`;
    tag = tag.replace(/\sdata-original=(['"])([^'"]*)\1/i, "");
    if (/\ssrc=(['"])([^'"]*)\1/i.test(tag)) {
      tag = tag.replace(/\ssrc=(['"])([^'"]*)\1/i, ` src="${original}"`);
    } else {
      tag = tag.replace(/<img/i, `<img src="${original}"`);
    }
    if (!/\bdecoding=(['"])([^'"]*)\1/i.test(tag)) {
      tag = tag.replace(/<img/i, '<img decoding="async"');
    }
    if (!/\bloading=(['"])([^'"]*)\1/i.test(tag)) {
      tag = tag.replace(/<img/i, '<img loading="lazy"');
    }
    return tag;
  });

  output = output.replace(
    /<div\b([^>]*class=(['"])[^'"]*\bt-bgimg\b[^'"]*\2[^>]*?)\bdata-original=(['"])([^'"]+)\3([^>]*)>/gi,
    (match, before, _classQuote, _quote, original, after) => {
      let tag = `<div${before}${after}>`;
      tag = tag.replace(/\sdata-original=(['"])([^'"]*)\1/i, "");
      const backgroundStyle = `background-image:url('${original.replace(/'/g, "%27")}');`;
      if (/\sstyle=(['"])(.*?)\1/i.test(tag)) {
        tag = tag.replace(/\sstyle=(['"])(.*?)\1/i, (styleMatch, quote, styleValue) => {
          if (/background-image\s*:/i.test(styleValue)) return styleMatch;
          const separator = styleValue.trim().endsWith(";") || !styleValue.trim() ? "" : ";";
          return ` style=${quote}${styleValue}${separator}${backgroundStyle}${quote}`;
        });
      } else {
        tag = tag.replace(/<div/i, `<div style="${backgroundStyle}"`);
      }
      return tag;
    }
  );

  return output;
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

const ZERO_FORM_PHONE_SYNC_SCRIPT = `<script id="shynli-zero-form-phone-sync">
(function() {
  function formatPhone(digits) {
    if (!digits) return "";
    if (digits.length <= 3) return "(" + digits;
    if (digits.length <= 6) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6, 10);
  }

  function bindPhoneField(input) {
    if (!input || input.dataset.zeroPhoneBound === "true") return;
    const form = input.closest("form");
    const hidden = form ? form.querySelector(".shynli-zero-phone-hidden") : null;
    const iso = form ? form.querySelector('input[name="tildaspec-phone-part[]-iso"]') : null;
    if (!hidden) return;

    input.dataset.zeroPhoneBound = "true";
    if (iso) iso.value = "+1";

    const sync = function(options) {
      const formatVisible = !!(options && options.formatVisible);
      let digits = String(input.value || "").replace(/\D/g, "");
      if (digits.startsWith("1") && digits.length === 11) digits = digits.slice(1);
      digits = digits.slice(0, 10);
      const formatted = formatPhone(digits);
      input.value = formatVisible ? formatted : digits;
      hidden.value = digits ? "+1 " + formatted : "";
    };

    input.addEventListener("input", function() {
      sync({ formatVisible: false });
    });
    input.addEventListener("blur", function() {
      sync({ formatVisible: true });
    });

    if (form) {
      form.addEventListener(
        "submit",
        function() {
          sync({ formatVisible: true });
        },
        true
      );
    }

    sync({ formatVisible: true });
  }

  function init() {
    document.querySelectorAll(".shynli-zero-phone-display").forEach(bindPhoneField);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
</script>`;

const CLEANER_APPLICATION_SUBMIT_ENDPOINT = "/api/cleaner-application/submit";

function normalizeZeroFormLookupValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCleanerApplicationFieldKey(fields, index, field) {
  const type = String(field && field.li_type || "").toLowerCase();
  const name = normalizeZeroFormLookupValue(field && (field.li_name || field.li_nm));
  const placeholder = normalizeZeroFormLookupValue(field && field.li_ph);
  const selectPrompt = normalizeZeroFormLookupValue(field && field.li_selfirstvar);
  const variants = normalizeZeroFormLookupValue(field && field.li_variants);

  if (index === 0 && type === "nm" && /full name/.test(placeholder || name)) return "fullName";
  if (index === 1 && type === "ph") return "phone";
  if (index === 2 && type === "em") return "email";
  if (index === 3 && type === "in" && /\bzip\b/.test(placeholder || name)) return "zipCode";
  if (
    index === 4 &&
    type === "sb" &&
    /experience/.test(`${name} ${placeholder} ${selectPrompt}`) &&
    /professional experience/.test(variants)
  ) {
    return "experience";
  }
  if (index === 5 && type === "ta" && /yourself/.test(placeholder || name)) return "details";
  return "";
}

function getCleanerApplicationFieldMap(fields) {
  if (!Array.isArray(fields) || fields.length !== 6) return null;

  const fieldMap = {};
  for (let index = 0; index < fields.length; index += 1) {
    const key = getCleanerApplicationFieldKey(fields, index, fields[index]);
    if (!key || fieldMap[key]) return null;
    fieldMap[key] = key;
  }

  const expectedKeys = ["fullName", "phone", "email", "zipCode", "experience", "details"];
  return expectedKeys.every((key) => fieldMap[key] === key) ? fieldMap : null;
}

const CLEANER_APPLICATION_FORM_RUNTIME_SCRIPT = `<script id="shynli-cleaner-application-form-runtime">
(function() {
  var ENDPOINT = ${JSON.stringify(CLEANER_APPLICATION_SUBMIT_ENDPOINT)};
  var SUCCESS_MESSAGE = "Thanks! Your application has been submitted.";
  var DEFAULT_ERROR_MESSAGE = "We couldn't submit your application right now. Please try again.";

  function trimValue(value) {
    return String(value || "").trim();
  }

  function parseJsonSafely(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function getField(form, fieldName) {
    return form.querySelector('[data-shynli-field="' + fieldName + '"]');
  }

  function getFieldGroup(field) {
    return field ? field.closest(".t-input-group") : null;
  }

  function getFieldErrorNode(field) {
    var group = getFieldGroup(field);
    return group ? group.querySelector(".t-input-error") : null;
  }

  function clearFieldError(field) {
    var group = getFieldGroup(field);
    var errorNode = getFieldErrorNode(field);
    if (group) group.classList.remove("t-input-group_error");
    if (errorNode) {
      errorNode.textContent = "";
      errorNode.style.display = "none";
    }
  }

  function setFieldError(field, message) {
    var group = getFieldGroup(field);
    var errorNode = getFieldErrorNode(field);
    if (group) group.classList.add("t-input-group_error");
    if (errorNode) {
      errorNode.textContent = message;
      errorNode.style.display = "block";
    }
  }

  function setGlobalError(form, message) {
    form.querySelectorAll(".js-errorbox-all").forEach(function(box) {
      box.style.display = "block";
      var target = box.querySelector(".js-rule-error-all");
      if (target) target.textContent = message;
      box.querySelectorAll(".js-rule-error-req, .js-rule-error-email, .js-rule-error-name, .js-rule-error-phone, .js-rule-error-string").forEach(function(node) {
        if (node !== target) node.textContent = "";
      });
    });
  }

  function clearGlobalError(form) {
    form.querySelectorAll(".js-errorbox-all").forEach(function(box) {
      box.style.display = "none";
      box.querySelectorAll(".t-form__errorbox-item").forEach(function(node) {
        node.textContent = "";
      });
    });
  }

  function showSuccess(form, message) {
    var successBox = form.querySelector(".js-successbox");
    if (!successBox) return;
    successBox.textContent = message || SUCCESS_MESSAGE;
    successBox.style.display = "block";
  }

  function hideSuccess(form) {
    var successBox = form.querySelector(".js-successbox");
    if (!successBox) return;
    successBox.textContent = "";
    successBox.style.display = "none";
  }

  function normalizePhoneValue(value) {
    var digits = String(value || "").replace(/\\D/g, "");
    if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.slice(1);
    return digits.slice(0, 10);
  }

  function normalizeZipValue(value) {
    return String(value || "").replace(/\\D/g, "").slice(0, 5);
  }

  function resetFormFields(form) {
    var fullName = getField(form, "fullName");
    var phone = getField(form, "phone");
    var phoneDisplay = form.querySelector(".shynli-zero-phone-display");
    var email = getField(form, "email");
    var zipCode = getField(form, "zipCode");
    var experience = getField(form, "experience");
    var details = getField(form, "details");

    if (fullName) fullName.value = "";
    if (phone) phone.value = "";
    if (phoneDisplay) phoneDisplay.value = "";
    if (email) email.value = "";
    if (zipCode) zipCode.value = "";
    if (experience && experience.tagName === "SELECT") experience.selectedIndex = 0;
    if (details) details.value = "";
  }

  function bindErrorDismiss(form) {
    form.querySelectorAll(".js-errorbox-close").forEach(function(button) {
      if (button.dataset.shynliBound === "true") return;
      button.dataset.shynliBound = "true";
      button.addEventListener("click", function(event) {
        event.preventDefault();
        clearGlobalError(form);
      });
    });
  }

  function bindCleanerForm(form) {
    if (!form || form.dataset.shynliCleanerBound === "true") return;
    form.dataset.shynliCleanerBound = "true";
    bindErrorDismiss(form);

    var submitButton = form.querySelector(".t-submit");
    var initialButtonText = submitButton ? submitButton.textContent : "Submit";

    ["fullName", "phone", "email", "zipCode", "experience", "details"].forEach(function(fieldName) {
      var field = getField(form, fieldName);
      if (!field) return;
      field.addEventListener("input", function() {
        clearFieldError(field);
        clearGlobalError(form);
        hideSuccess(form);
        if (fieldName === "zipCode") {
          var nextValue = normalizeZipValue(field.value);
          if (field.value !== nextValue) field.value = nextValue;
        }
      });
      field.addEventListener("change", function() {
        clearFieldError(field);
        clearGlobalError(form);
        hideSuccess(form);
      });
    });

    form.addEventListener("submit", async function(event) {
      event.preventDefault();
      if (form.dataset.shynliSubmitting === "true") return;

      hideSuccess(form);
      clearGlobalError(form);

      var fullNameField = getField(form, "fullName");
      var phoneField = getField(form, "phone");
      var emailField = getField(form, "email");
      var zipCodeField = getField(form, "zipCode");
      var experienceField = getField(form, "experience");
      var detailsField = getField(form, "details");
      var honeyPot = form.querySelector(".js-form-spec-comments");

      [fullNameField, phoneField, emailField, zipCodeField, experienceField, detailsField].forEach(clearFieldError);

      var fullName = trimValue(fullNameField && fullNameField.value);
      var phoneDigits = normalizePhoneValue(phoneField && phoneField.value);
      var email = trimValue(emailField && emailField.value).toLowerCase();
      var zipCode = normalizeZipValue(zipCodeField && zipCodeField.value);
      var experience = trimValue(experienceField && experienceField.value);
      var details = trimValue(detailsField && detailsField.value);
      var fieldErrors = [];

      if (honeyPot && trimValue(honeyPot.value)) {
        resetFormFields(form);
        showSuccess(form, SUCCESS_MESSAGE);
        return;
      }

      if (!fullName) {
        setFieldError(fullNameField, "Enter your full name.");
        fieldErrors.push("fullName");
      }

      if (phoneDigits.length !== 10) {
        setFieldError(phoneField, "Enter a valid phone number.");
        fieldErrors.push("phone");
      }

      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        setFieldError(emailField, "Enter a valid email.");
        fieldErrors.push("email");
      }

      if (zipCode.length !== 5) {
        setFieldError(zipCodeField, "Enter a valid ZIP code.");
        fieldErrors.push("zipCode");
      }

      if (!experience) {
        setFieldError(experienceField, "Select your cleaning experience.");
        fieldErrors.push("experience");
      }

      if (fieldErrors.length > 0) {
        setGlobalError(form, "Please check the highlighted fields and try again.");
        return;
      }

      form.dataset.shynliSubmitting = "true";
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";
      }

      try {
        var response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            application: {
              fullName: fullName,
              phone: phoneDigits,
              email: email,
              zipCode: zipCode,
              experience: experience,
              details: details,
            },
            source: "Website Cleaner Application",
            pageUrl: window.location.href,
            submittedAt: new Date().toISOString(),
          }),
        });
        var responseText = await response.text();
        var payload = parseJsonSafely(responseText);

        if (!response.ok || !payload || payload.ok !== true) {
          setGlobalError(form, payload && payload.error ? payload.error : DEFAULT_ERROR_MESSAGE);
          return;
        }

        resetFormFields(form);
        showSuccess(form, SUCCESS_MESSAGE);
      } catch (error) {
        setGlobalError(form, DEFAULT_ERROR_MESSAGE);
      } finally {
        form.dataset.shynliSubmitting = "false";
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = initialButtonText;
        }
      }
    });
  }

  function init() {
    document.querySelectorAll('form[data-shynli-form-kind="cleaner-application"]').forEach(bindCleanerForm);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
</script>`;

const ZERO_FORM_RUNTIME_STUB = `<script id="shynli-zero-form-runtime-stub">
window.t_zeroForms__init = window.t_zeroForms__init || function() {};
</script>`;

const ZERO_RUNTIME_STUB = `<script id="shynli-zero-runtime-stub">
window.t396_init =
  window.t396_init ||
  function t396_init() {};
window.t396_doResize =
  window.t396_doResize ||
  function t396_doResize() {};
</script>`;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readDataFieldValue(openTag, fieldName, fallback = "") {
  const match = String(openTag || "").match(new RegExp(`data-field-${fieldName}-value="([^"]*)"`, "i"));
  return match ? match[1] : fallback;
}

function toPixelValue(rawValue, fallback) {
  const normalized = String(rawValue ?? "").trim();
  if (!normalized) return fallback;
  return /^[0-9]+(?:\.[0-9]+)?$/.test(normalized) ? `${normalized}px` : normalized;
}

function buildZeroPopupFormMarkup(recordId, formElemOpenTag, fields) {
  if (!Array.isArray(fields) || fields.length === 0) return "";
  const cleanerApplicationFieldMap = getCleanerApplicationFieldMap(fields);
  const formKind = cleanerApplicationFieldMap ? "cleaner-application" : "";

  const elemIdMatch = String(formElemOpenTag || "").match(/data-elem-id='([^']+)'/i);
  const elemId = elemIdMatch ? elemIdMatch[1] : "";
  const inputColor = readDataFieldValue(formElemOpenTag, "inputcolor", "#000000");
  const inputBgColor = readDataFieldValue(formElemOpenTag, "inputbgcolor", "#e8e1d9");
  const inputBorderSize = toPixelValue(readDataFieldValue(formElemOpenTag, "inputbordersize", "0"), "0px");
  const inputRadius = toPixelValue(readDataFieldValue(formElemOpenTag, "inputradius", "10"), "10px");
  const inputFontSize = toPixelValue(readDataFieldValue(formElemOpenTag, "inputfontsize", "16"), "16px");
  const inputFontWeight = readDataFieldValue(formElemOpenTag, "inputfontweight", "400");
  const inputHeight = toPixelValue(readDataFieldValue(formElemOpenTag, "inputheight", "43"), "43px");
  const inputMarginBottom = toPixelValue(readDataFieldValue(formElemOpenTag, "inputmargbottom", "10"), "10px");
  const buttonTitle = readDataFieldValue(formElemOpenTag, "buttontitle", "Submit");
  const buttonColor = readDataFieldValue(formElemOpenTag, "buttoncolor", "#ffffff");
  const buttonBgColor = readDataFieldValue(formElemOpenTag, "buttonbgcolor", "#9e435a");
  const buttonRadius = toPixelValue(readDataFieldValue(formElemOpenTag, "buttonradius", "50"), "50px");
  const buttonMarginTop = toPixelValue(readDataFieldValue(formElemOpenTag, "buttonmargtop", "20"), "20px");
  const buttonWidth = toPixelValue(readDataFieldValue(formElemOpenTag, "buttonwidth", "352"), "352px");
  const buttonHeight = toPixelValue(readDataFieldValue(formElemOpenTag, "buttonheight", "42"), "42px");
  const buttonFontWeight = readDataFieldValue(formElemOpenTag, "buttonfontweight", "400");
  const inputInlineStyle = [
    `color: ${inputColor}`,
    `border: ${inputBorderSize} solid ${inputColor}`,
    `background-color: ${inputBgColor}`,
    `border-radius: ${inputRadius}`,
    `font-size: ${inputFontSize}`,
    `font-weight: ${inputFontWeight}`,
    `height: ${inputHeight}`,
  ].join("; ");

  const inputGroupMarkup = fields
    .map((field, index) => {
      const fieldType = field.li_type || "";
      const fieldName = field.li_nm || field.li_name || "Field";
      const placeholder = field.li_ph || "";
      const requiredAttr = field.li_req === "y" ? ' data-tilda-req="1"' : "";
      const requiredValue = field.li_req === "y" ? "1" : "";
      const inputLid = escapeHtml(field.lid || "");
      const marginBottomStyle = `margin-bottom: ${inputMarginBottom};`;
      const semanticFieldName = cleanerApplicationFieldMap ? getCleanerApplicationFieldKey(fields, index, field) : "";
      const groupFieldAttr = semanticFieldName ? ` data-shynli-field-group="${escapeHtml(semanticFieldName)}"` : "";
      const inputFieldAttr = semanticFieldName ? ` data-shynli-field="${escapeHtml(semanticFieldName)}"` : "";
      const commonInputClass = 'class="t-input js-tilda-rule t-input-inline-styles"';

      if (fieldType === "nm") {
        return `<div class="t-input-group t-input-group_nm" data-input-lid="${inputLid}" data-field-type="nm" data-field-name="${escapeHtml(fieldName)}"${groupFieldAttr} style="${marginBottomStyle}"><div class="t-input-block"><input aria-label="name" type="text" name="${escapeHtml(field.li_name || "name")}" ${commonInputClass}${inputFieldAttr} data-tilda-rule="name" placeholder="${escapeHtml(placeholder)}"${requiredAttr} style="${inputInlineStyle};"><div class="t-input-error"></div></div></div>`;
      }

      if (fieldType === "ph") {
        return `<div class="t-input-group t-input-group_ph" data-input-lid="${inputLid}" data-field-type="ph" data-field-name="${escapeHtml(fieldName)}"${groupFieldAttr} style="${marginBottomStyle}"><div class="t-input-block" style="overflow: visible;"><div class="t-input shynli-zero-phone-shell" style="${inputInlineStyle}; display: flex; align-items: center; overflow: hidden; padding: 0 12px 0 0;"><span class="shynli-zero-phone-code" aria-hidden="true" style="display: inline-flex; align-items: center; flex: none; padding: 0 0 0 16px; color: ${inputColor}; font-size: ${inputFontSize}; font-weight: ${inputFontWeight}; white-space: nowrap;">+1</span><input type="hidden" name="tildaspec-phone-part[]-iso" value="+1" tabindex="-1"><input aria-label="phone" type="tel" class="t-input shynli-zero-phone-display" name="tildaspec-phone-part[]" value="" placeholder="${escapeHtml(field.li_masktype === "a" ? "(000) 000-0000" : placeholder || "(000) 000-0000")}" inputmode="tel" autocomplete="tel-national" maxlength="14"${inputFieldAttr} style="flex: 1 1 auto; min-width: 0; padding: 0 16px 0 10px; color: ${inputColor}; font-size: ${inputFontSize}; font-weight: ${inputFontWeight}; height: ${inputHeight}; border: 0; background: transparent; box-shadow: none;"><input type="hidden" class="js-tilda-rule shynli-zero-phone-hidden" data-tilda-rule="phone" name="${escapeHtml(fieldName)}" value=""${requiredAttr} tabindex="-1" data-tilda-rule-minlength="17"></div><div class="t-input-error"></div></div></div>`;
      }

      if (fieldType === "em") {
        return `<div class="t-input-group t-input-group_em" data-input-lid="${inputLid}" data-field-type="em" data-field-name="${escapeHtml(fieldName)}"${groupFieldAttr} style="${marginBottomStyle}"><div class="t-input-block"><input aria-label="email" type="email" name="${escapeHtml(fieldName)}" ${commonInputClass}${inputFieldAttr} data-tilda-rule="email" placeholder="${escapeHtml(placeholder)}"${requiredAttr} style="${inputInlineStyle};"><div class="t-input-error"></div></div></div>`;
      }

      if (fieldType === "sb") {
        const variants = String(field.li_variants || "")
          .split("\n")
          .map((variant) => variant.trim())
          .filter(Boolean)
          .map(
            (variant) =>
              `<option value="${escapeHtml(variant)}" style="color: ${escapeHtml(inputColor)};">${escapeHtml(
                variant
              )}</option>`
          )
          .join("");
        return `<div class="t-input-group t-input-group_sb" data-input-lid="${inputLid}" data-field-type="sb" data-field-name="${escapeHtml(fieldName)}"${groupFieldAttr} style="${marginBottomStyle}"><div class="t-input-block"><div class="t-select__wrapper"><select id="sb-${inputLid}" name="${escapeHtml(fieldName)}" class="t-select js-tilda-rule t-input-inline-styles"${inputFieldAttr}${requiredAttr} style="${inputInlineStyle};"><option value="" style="color: ${escapeHtml(inputColor)};"${
          requiredValue ? " selected" : ""
        }>${escapeHtml(field.li_selfirstvar || placeholder || "Select an option")}</option>${variants}</select><style>#rec${recordId} [data-elem-id="${elemId}"] .t-select__wrapper:after{border-top-color:${inputColor};}</style></div><div class="t-input-error"></div></div></div>`;
      }

      if (fieldType === "ta") {
        const rows = Math.max(Number.parseInt(field.li_rows || "3", 10) || 3, 3);
        return `<div class="t-input-group t-input-group_ta" data-input-lid="${inputLid}" data-field-type="ta" data-field-name="${escapeHtml(fieldName)}"${groupFieldAttr} style="${marginBottomStyle}"><div class="t-input-block"><textarea aria-label="textarea" name="${escapeHtml(fieldName)}" ${commonInputClass}${inputFieldAttr} placeholder="${escapeHtml(placeholder)}" data-rows="${rows}" rows="${rows}" style="${inputInlineStyle}; height: 85px;"></textarea><div class="t-input-error"></div></div></div>`;
      }

      return `<div class="t-input-group t-input-group_in" data-input-lid="${inputLid}" data-field-type="in" data-field-name="${escapeHtml(fieldName)}"${groupFieldAttr} style="${marginBottomStyle}"><div class="t-input-block"><input aria-label="oneline" type="text" name="${escapeHtml(fieldName)}" ${commonInputClass}${inputFieldAttr} placeholder="${escapeHtml(placeholder)}"${requiredAttr} style="${inputInlineStyle};"><div class="t-input-error"></div></div></div>`;
    })
    .join("");

  const formKindAttr = formKind ? ` data-shynli-form-kind="${escapeHtml(formKind)}"` : "";
  const submitEndpointAttr = formKind ? ` data-shynli-submit-endpoint="${escapeHtml(CLEANER_APPLICATION_SUBMIT_ENDPOINT)}"` : "";
  return `<form class="t-form t-form_inputs-total_${fields.length} js-form-proccess" id="form${recordId}" name="form${recordId}" action="#" method="POST" role="form" data-formactiontype="2" data-inputbox=".t-input-group" data-success-callback="t396_onSuccess" data-error-popup="y"${formKindAttr}${submitEndpointAttr}><input type="hidden" tabindex="-1" value="${escapeHtml(elemId)}" name="tildaspec-elemid"><div class="js-successbox t-form__successbox t-text t-text_sm" style="display: none;"></div><div class="t-form__inputsbox">${inputGroupMarkup}<div class="t-form__errorbox-middle"><div class="js-errorbox-all t-form__errorbox-wrapper" style="display: none;"><div class="t-form__errorbox-text t-text_xs t-text"><p class="t-form__errorbox-item js-rule-error js-rule-error-all"></p><p class="t-form__errorbox-item js-rule-error js-rule-error-req"></p><p class="t-form__errorbox-item js-rule-error js-rule-error-email"></p><p class="t-form__errorbox-item js-rule-error js-rule-error-name"></p><p class="t-form__errorbox-item js-rule-error js-rule-error-phone"></p><p class="t-form__errorbox-item js-rule-error js-rule-error-string"></p></div><div class="tn-form__errorbox-close js-errorbox-close"><div class="tn-form__errorbox-close-line tn-form__errorbox-close-line-left"></div><div class="tn-form__errorbox-close-line tn-form__errorbox-close-line-right"></div></div></div></div><div class="tn-form__submit" style="text-align: center; margin-top: ${buttonMarginTop};"><button type="submit" class="t-submit" style="padding: 0px 15px; display: block; width: ${buttonWidth}; font-weight: ${buttonFontWeight}; height: ${buttonHeight}; margin-left: auto; margin-right: auto; background-color: ${buttonBgColor}; color: ${buttonColor}; border: none; border-radius: ${buttonRadius};">${escapeHtml(buttonTitle)}</button></div></div><div class="t-form__errorbox-bottom"><div class="js-errorbox-all t-form__errorbox-wrapper" style="display: none;"><div class="t-form__errorbox-text t-text_xs t-text"><p class="t-form__errorbox-item js-rule-error js-rule-error-all"></p><p class="t-form__errorbox-item js-rule-error js-rule-error-req"></p><p class="t-form__errorbox-item js-rule-error js-rule-error-email"></p><p class="t-form__errorbox-item js-rule-error js-rule-error-name"></p><p class="t-form__errorbox-item js-rule-error js-rule-error-phone"></p><p class="t-form__errorbox-item js-rule-error js-rule-error-string"></p></div><div class="tn-form__errorbox-close js-errorbox-close"><div class="tn-form__errorbox-close-line tn-form__errorbox-close-line-left"></div><div class="tn-form__errorbox-close-line tn-form__errorbox-close-line-right"></div></div></div></div><div style="position: absolute; left: -5000px; bottom: 0px; display: none;"><input type="text" name="form-spec-comments" class="js-form-spec-comments" tabindex="-1"></div></form>`;
}

function renderZeroPopupForms(html) {
  return String(html || "").replace(
    /<div id="rec(\d+)" class="r t-rec"[\s\S]*?<!-- \/T396 -->\s*<\/div>/g,
    (recordHtml, recordId) => {
      if (!recordHtml.includes("tn-atom__inputs-textarea")) return recordHtml;

      const formElemMatch = recordHtml.match(
        /(<div class='t396__elem[^>]*data-elem-id='([^']+)'[^>]*data-elem-type='form'[\s\S]*?>)/
      );
      if (!formElemMatch) return recordHtml;

      const formElemOpenTag = formElemMatch[1];
      const textareaMatch = recordHtml.match(/<textarea class="tn-atom__inputs-textarea">([\s\S]*?)<\/textarea>/);
      if (!textareaMatch) return recordHtml;

      let fields;
      try {
        fields = JSON.parse(textareaMatch[1].trim());
      } catch (error) {
        return recordHtml;
      }

      const renderedForm = buildZeroPopupFormMarkup(recordId, formElemOpenTag, fields);
      if (!renderedForm) return recordHtml;

      return recordHtml.replace(
        /<div class='tn-atom tn-atom__form'><\/div>\s*<!--googleoff: all-->[\s\S]*?<!--googleon: all-->/,
        renderedForm
      );
    }
  );
}

function requiresTildaFormsRuntime(html) {
  const normalized = String(html || "");
  if (/tn-atom__form|tn-atom__inputs-textarea/.test(normalized)) {
    return true;
  }

  const formTags = normalized.match(/<form\b[^>]*class="[^"]*\bt-form\b[^"]*"[^>]*>/g) || [];
  return formTags.some((tag) => !/data-shynli-form-kind="cleaner-application"/.test(tag));
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
  if (isManagedBlogRoute(normalizedRoute)) {
    return buildManagedBlogShellDocument(html, normalizedRoute);
  }

  let cleaned = html
    .replace(
      /<script src="https:\/\/neo\.tildacdn\.com\/js\/tilda-fallback-1\.0\.min\.js"[^>]*><\/script>/g,
      ""
    )
    .replace(/<script[^>]+src="js\/tilda-events-1\.0\.min\.js"[^>]*><\/script>\s*/g, "")
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
  cleaned = renderZeroPopupForms(cleaned);
  if (/data-shynli-form-kind="cleaner-application"/.test(cleaned) && !cleaned.includes('id="shynli-zero-form-runtime-stub"')) {
    cleaned = insertIntoHead(cleaned, ZERO_FORM_RUNTIME_STUB);
  }

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

  const hasTildaFormsRuntime = requiresTildaFormsRuntime(cleaned);
  if (!hasTildaFormsRuntime) {
    cleaned = cleaned
      .replace(/<script[^>]+src="js\/tilda-forms-1\.0\.min\.js"[^>]*><\/script>/g, "")
      .replace(/<script[^>]+src="js\/tilda-zero-forms-1\.0\.min\.js"[^>]*><\/script>/g, "");
  }

  const hasZeroFormPlaceholders = /tn-atom__form|tn-atom__inputs-textarea/.test(cleaned);
  if (!hasZeroFormPlaceholders) {
    cleaned = cleaned.replace(/<script[^>]+src="js\/tilda-zero-forms-1\.0\.min\.js"[^>]*><\/script>\s*/g, "");
  }

  const hasMenuSubmenus = /class="t-menusub"[\s>]|data-menu-submenu-hook="/i.test(cleaned);
  if (hasMenuSubmenus) {
    cleaned = cleaned.replace(/<script[^>]+src="js\/tilda-menusub-1\.0\.min\.js"[^>]*><\/script>\s*/g, "");
    if (!cleaned.includes('id="shynli-menusub-runtime"')) {
      cleaned = insertIntoHead(cleaned, MENUSUB_RUNTIME_SCRIPT);
    }
  }

  const hasMenuShell =
    /<script[^>]+src="js\/tilda-menu-1\.1\.min\.js"[^>]*><\/script>/i.test(cleaned) ||
    /<script[^>]+src="js\/tilda-menu-burger-1\.0\.min\.js"[^>]*><\/script>/i.test(cleaned);
  if (hasMenuShell) {
    cleaned = cleaned
      .replace(/<script[^>]+src="js\/tilda-menu-1\.1\.min\.js"[^>]*><\/script>\s*/g, "")
      .replace(/<script[^>]+src="js\/tilda-menu-burger-1\.0\.min\.js"[^>]*><\/script>\s*/g, "");
    if (!cleaned.includes('id="shynli-menu-shell-runtime"')) {
      cleaned = insertIntoHead(cleaned, MENU_SHELL_RUNTIME_SCRIPT);
    }
  }

  const hasMenuWidgetIcons = /class="[^"]*\bt-menuwidgeticons(?:__|\b)[^"]*"/i.test(cleaned);
  if (!hasMenuWidgetIcons) {
    cleaned = cleaned
      .replace(/<link[^>]+href="css\/tilda-menu-widgeticons-1\.0\.min\.css"[^>]*>\s*/g, "");
    cleaned = cleaned
      .replace(/<script[^>]+src="js\/tilda-menu-widgeticons-1\.0\.min\.js"[^>]*><\/script>\s*/g, "");
    if (!cleaned.includes('id="shynli-menu-widgeticons-runtime-stub"')) {
      cleaned = insertIntoHead(cleaned, MENU_WIDGETICONS_RUNTIME_STUB);
    }
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

  if (SHARED_MARKETING_ROUTES.has(normalizedRoute)) {
    cleaned = cleaned
      .replace(/<script[^>]+src="js\/tilda-scripts-3\.0\.min\.js"[^>]*><\/script>\s*/g, "")
      .replace(/<script[^>]+src="js\/tilda-blocks-page\d+\.min\.js(?:\?t=\d+)?"[^>]*><\/script>\s*/g, "")
      .replace(/<script[^>]+src="js\/tilda-popup-1\.0\.min\.js"[^>]*><\/script>\s*/g, "");
    if (!cleaned.includes('id="shynli-home-page-runtime"')) {
      cleaned = insertIntoHead(cleaned, HOME_PAGE_RUNTIME_SCRIPT);
    }
  }

  if (ZERO_RUNTIME_PILOT_ROUTES.has(normalizedRoute)) {
    cleaned = cleaned.replace(/<script[^>]+src="js\/tilda-zero-1\.1\.min\.js"[^>]*><\/script>\s*/g, "");
    if (!cleaned.includes('id="shynli-zero-runtime-stub"')) {
      cleaned = insertIntoHead(cleaned, ZERO_RUNTIME_STUB);
    }
  }

  if (LAZYLOAD_PILOT_ROUTES.has(normalizedRoute)) {
    cleaned = hydrateLazyMedia(cleaned);
    cleaned = cleaned.replace(/<script[^>]+src="js\/lazyload-1\.3\.min\.export\.js"[^>]*><\/script>\s*/g, "");
  }

  if (ZERO_SCALE_PILOT_ROUTES.has(normalizedRoute)) {
    cleaned = cleaned.replace(/<script[^>]+src="js\/tilda-zero-scale-1\.0\.min\.js"[^>]*><\/script>\s*/g, "");
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
      [ZERO_FORM_PHONE_SYNC_SCRIPT, "shynli-zero-form-phone-sync"],
      [CLEANER_APPLICATION_FORM_RUNTIME_SCRIPT, "shynli-cleaner-application-form-runtime"],
      [FULL_CARD_CLICK_SCRIPT, "full-card-click-handler"],
      [MOBILE_STICKY_CTA_SCRIPT, "mobile-sticky-cta"],
      [DEEP_CLEANING_MOBILE_FIX, "deep-cleaning-addons-rebuild"],
      [MOBILE_CONTACT_DETAILS_FIX, "mobile-contact-details-fix"],
      [PRICING_CALCULATOR_SCROLL_SCRIPT, "pricing-calculator-scroll"],
      [SAFARI_HOME_LAYOUT_FIX, "safari-home-layout-fix"],
    ]
      .filter(([, scriptId]) => {
        if (scriptId === "shynli-zero-form-phone-sync") {
          return /shynli-zero-phone-display/.test(cleaned);
        }
        if (scriptId === "shynli-cleaner-application-form-runtime") {
          return /data-shynli-form-kind="cleaner-application"/.test(cleaned);
        }
        return true;
      })
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
