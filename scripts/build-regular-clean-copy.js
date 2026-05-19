"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_FILE = path.join(ROOT, "page109653016.html");
const TARGET_FILE = path.join(ROOT, "page109653016-copy.html");

const CONTENT_RECORD_IDS = new Set([
  "rec1777833773",
  "rec1777833783",
  "rec1777833793",
  "rec1778546273",
  "rec1778645403",
  "rec1778719793",
  "rec1778724733",
  "rec1793182383",
  "rec1814256303",
  "rec1795404693",
]);

const SERVICE_LINKS = [
  ["/services/regular-cleaning", "Regular House Cleaning"],
  ["/services/deep-cleaning", "Deep Cleaning for Homes That Need Extra Care"],
  ["/services/move-in-move-out-cleaning", "Cleaning for Moving In or Moving Out"],
  ["/services/airbnb-cleaning", "Airbnb cleaning"],
  ["/services/commercial-cleaning", "Commercial cleaning"],
];

const CITY_LINKS = [
  ["/addison", "Addison"],
  ["/aurora", "Aurora"],
  ["/bartlett", "Bartlett"],
  ["/batavia", "Batavia"],
  ["/bolingbrook", "Bolingbrook"],
  ["/bristol", "Bristol"],
  ["/burrridge", "Burr Ridge"],
  ["/carolstream", "Carol Stream"],
  ["/clarendonhills", "Clarendon Hills"],
  ["/darien", "Darien"],
  ["/downersgrove", "Downers Grove"],
  ["/elmhurst", "Elmhurst"],
  ["/geneva", "Geneva"],
  ["/glenellyn", "Glen Ellyn"],
  ["/hinsdale", "Hinsdale"],
  ["/homerglen", "Homer Glen"],
  ["/itasca", "Itasca"],
  ["/lemont", "Lemont"],
  ["/lisle", "Lisle"],
  ["/lockport", "Lockport"],
  ["/lombard", "Lombard"],
  ["/montgomery", "Montgomery"],
  ["/naperville", "Naperville"],
  ["/northaurora", "North Aurora"],
  ["/oakbrook", "Oak Brook"],
  ["/oswego", "Oswego"],
  ["/plainfield", "Plainfield"],
  ["/romeoville", "Romeoville"],
  ["/stcharles", "St. Charles"],
  ["/streamwood", "Streamwood"],
  ["/villapark", "Villa Park"],
  ["/warrenville", "Warrenville"],
  ["/wayne", "Wayne"],
  ["/westchicago", "West Chicago"],
  ["/westmont", "Westmont"],
  ["/wheaton", "Wheaton"],
  ["/willowbrook", "Willowbrook"],
  ["/winfield", "Winfield"],
  ["/wooddale", "Wood Dale"],
  ["/woodridge", "Woodridge"],
  ["/yorkville", "Yorkville"],
];

function getTopLevelRecords(html) {
  const matches = [...html.matchAll(/<div id="(rec\d+)" class="[^"]*\bt-rec\b[^"]*"[^>]*data-record-type="\d+"/g)];
  return matches.map((match, index) => {
    const endCandidates = [
      matches[index + 1]?.index,
      html.indexOf("<!-- Tilda copyright", match.index),
      html.indexOf("t-tildalabel", match.index),
      html.indexOf('<script type="text/javascript" data-tilda-cookie', match.index),
      html.indexOf("</body>", match.index),
    ].filter((candidate) => Number.isInteger(candidate) && candidate >= 0);
    const next = Math.min(...endCandidates);
    return {
      id: match[1],
      html: html.slice(match.index, next),
    };
  });
}

function hydrateLazyMedia(html) {
  let cleaned = html.replace(/<img\b([^>]*?)\sdata-original=(["'])(.*?)\2([^>]*)>/gi, (_match, before, _quote, original, after) => {
    let attrs = `${before}${after}`.replace(/\s+src=(["']).*?\1/gi, "");
    attrs = attrs.replace(/\s+data-lazy-rule=(["']).*?\1/gi, "");
    attrs = attrs.replace(/\s+loading=(["']).*?\1/gi, "");
    attrs = attrs.replace(/\s*\/\s*$/g, "");
    return `<img${attrs} src="${original}">`;
  });

  cleaned = cleaned.replace(/\sdata-original=(["'])(.*?)\1/gi, (_match, _quote, original) => {
    return ` style="background-image:url('${original}');"`;
  });

  return cleaned;
}

function stripTemplateScripts(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, (script) => {
    if (
      /t_onReady|t_onFuncLoad|t396|t1093|t943|t215|t_menu|t_menusub|allrecords|window\.Tilda|window\.tn_|google-analytics|data-tilda/i.test(
        script
      )
    ) {
      return "";
    }
    return script;
  });
}

function removeTemplateAttributes(html) {
  return html
    .replace(/\sdata-artboard-[a-z0-9_-]+=(["']).*?\1/gi, "")
    .replace(/\sdata-field-(?!elem)[a-z0-9_-]+=(["']).*?\1/gi, "")
    .replace(/\sdata-record-[a-z0-9_-]+=(["']).*?\1/gi, "")
    .replace(/\sdata-tilda-[a-z0-9_-]+=(["']).*?\1/gi, "")
    .replace(/\sdata-tilda-sign=(["']).*?\1/gi, "")
    .replace(/\sdata-animationappear=(["']).*?\1/gi, "")
    .replace(/\sdata-bg-color=(["']).*?\1/gi, "")
    .replace(/\sdata-elem-type=(["'])(.*?)\1/gi, ' data-clean-type="$2"')
    .replace(/\sdata-elem-id=(["'])(.*?)\1/gi, ' data-clean-id="$2"')
    .replace(/\simgfield=(["']).*?\1/gi, "")
    .replace(/([\s'"])field=(["']).*?\2/gi, "$1")
    .replace(/\sdata-input-lid=(["']).*?\1/gi, "")
    .replace(/\sdata-formactiontype=(["']).*?\1/gi, "")
    .replace(/\sdata-success-callback=(["']).*?\1/gi, "");
}

function renameTemplateTokens(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<div class="t-tildalabel"[\s\S]*?<\/div>\s*<\/a>\s*<\/div>/gi, "")
    .replace(/data-elem-id/g, "data-clean-id")
    .replace(/data-elem-type/g, "data-clean-type")
    .replace(/\brec(?=\d{6,})/g, "section")
    .replace(/\bt396__/g, "clean-stage__")
    .replace(/\bt396\b/g, "clean-stage")
    .replace(/\btn-/g, "clean-node-")
    .replace(/\btn_/g, "clean_node_")
    .replace(/\bt-/g, "clean-")
    .replace(/\bt_/g, "clean_")
    .replace(/\bt(?=\d{3,4}\b)/g, "clean-block")
    .replace(/--t396/g, "--clean-stage")
    .replace(/--t-/g, "--clean-")
    .replace(/\bTildaSans\b/g, "Montserrat")
    .replace(/\bdata-clean-hook\b/g, "data-hook");
}

function cleanRecord(recordHtml) {
  return renameTemplateTokens(
    removeTemplateAttributes(stripTemplateScripts(hydrateLazyMedia(recordHtml)))
  )
    .replace(/class=(["'])([^"']*?)\1/gi, (_match, quote, value) => {
      const classes = value
        .split(/\s+/)
        .filter(Boolean)
        .filter((className) => className !== "r")
        .join(" ");
      return classes ? `class=${quote}${classes}${quote}` : "";
    })
    .replace(/\+1\(630\)381-7829/g, "+1(630)812-7077")
    .replace(/\+16303817829/g, "+16308127077")
    .replace(
      /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 58 24" fill="none"><text x="0" y="21" fill="#313131" font-family="Playfair Display, serif" font-style="italic" font-size="31" font-weight="400" letter-spacing="0" textLength="58" lengthAdjust="spacingAndGlyphs">300\+<\/text><\/svg>/g,
      '<span class="clean-hero-stat-number">300+</span>'
    )
    .replace(
      /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 80 33" fill="none"><text x="40" y="28" fill="#313131" font-family="Playfair Display, serif" font-style="italic" font-size="37" font-weight="400" text-anchor="middle" textLength="74" lengthAdjust="spacingAndGlyphs">5\/5<\/text><\/svg>/g,
      '<span class="clean-hero-rating-score">5/5</span>'
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function renderHeader() {
  const services = SERVICE_LINKS.map(
    ([href, label]) => `<li><a href="${href}">✦ ${label}</a></li>`
  ).join("");

  return `
<header class="clean-header" data-clean-header>
  <div class="clean-header__mobile">
    <a class="clean-header__logo" href="/" aria-label="Shynli Cleaning home">
      <img src="images/tild3531-6535-4863-b761-323963303436__logo_2.png" alt="Shynli Cleaning">
    </a>
    <button class="clean-header__burger" type="button" aria-label="Navigation menu" aria-expanded="false" data-menu-toggle>
      <span></span><span></span><span></span><span></span>
    </button>
  </div>
  <nav class="clean-header__nav" aria-label="Primary navigation" data-menu-panel>
    <div class="clean-header__inner">
      <a class="clean-header__logo clean-header__logo--desktop" href="/" aria-label="Shynli Cleaning home">
        <img src="images/tild3531-6535-4863-b761-323963303436__logo_2.png" alt="Shynli Cleaning">
      </a>
      <ul class="clean-header__links">
        <li class="clean-header__dropdown">
          <a href="/services/regular-cleaning" aria-haspopup="true">Services ▾</a>
          <ul class="clean-header__submenu">${services}</ul>
        </li>
        <li><a href="/service-areas">Service Areas</a></li>
        <li><a href="/about-us">About Us</a></li>
        <li><a href="/faq">FAQ</a></li>
      </ul>
      <div class="clean-header__actions">
        <a class="clean-header__cleaner" href="#clean">Become a Cleaner</a>
        <span class="clean-header__phone">📞 <a href="tel:+16308127077">Call Us</a></span>
        <a class="clean-button clean-button--primary" href="/quote">Get Free Quote</a>
        <a class="clean-button clean-button--secondary" href="#city">City ▾</a>
      </div>
    </div>
  </nav>
</header>`;
}

function renderCityModal() {
  const links = CITY_LINKS.map(([href, label]) => `<a href="${href}">${label}</a>`).join("");
  return `
<aside class="clean-modal" id="city" aria-label="Choose your city">
  <a class="clean-modal__backdrop" href="#" aria-label="Close city chooser"></a>
  <div class="clean-modal__panel clean-modal__panel--wide">
    <a class="clean-modal__close" href="#" aria-label="Close">×</a>
    <h2>Choose Your City</h2>
    <p>Select a service area to continue booking with the right local page.</p>
    <div class="clean-city-grid">${links}</div>
  </div>
</aside>`;
}

function renderCleanerModal() {
  return `
<aside class="clean-modal" id="clean" aria-label="Cleaner application">
  <a class="clean-modal__backdrop" href="#" aria-label="Close cleaner application"></a>
  <div class="clean-modal__panel">
    <a class="clean-modal__close" href="#" aria-label="Close">×</a>
    <h2>We're Hiring Cleaners in Chicagoland</h2>
    <p>Share your details and the Shynli team will follow up with next steps.</p>
    <form class="clean-application-form" action="/quote" method="get">
      <label>Full name<input name="name" type="text" required></label>
      <label>Phone<input name="phone" type="tel" required></label>
      <label>City<input name="city" type="text" required></label>
      <button type="submit">Submit Application</button>
    </form>
  </div>
</aside>`;
}

function renderBaseStyles() {
  return `
<style id="regular-clean-copy-base">
:root{--clean-headline-font:'Playfair Display',Georgia,serif;--clean-text-font:'Montserrat',Arial,sans-serif;--clean-accent:#9e435a;--clean-accent-dark:#6e2e3e;--clean-bg:#faf9f6;--clean-text:#313131;}
*{box-sizing:border-box;}
html{scroll-behavior:smooth;background:var(--clean-bg);}
body.clean-body{margin:0;background:var(--clean-bg);color:var(--clean-text);font-family:Times;font-weight:400;}
img,svg{max-width:100%;}
a{color:inherit;text-decoration:none;}
.clean-service-page{background:var(--clean-bg);overflow:hidden;}
.clean-header{position:fixed;top:0;left:0;right:0;z-index:1000;background:var(--clean-bg);font-family:var(--clean-text-font);color:#000;}
.clean-header__inner{max-width:1160px;min-height:68px;margin:0 auto;display:flex;align-items:center;gap:50px;padding:0;}
.clean-header__logo{display:flex;align-items:center;text-decoration:none;flex:none;}
.clean-header__logo img{display:block;width:150px;height:auto;}
.clean-header__links{display:flex;align-items:center;gap:30px;margin:0;padding:0;list-style:none;font-size:14px;line-height:normal;font-weight:400;}
.clean-header__links>li>a{position:relative;top:1.5px;}
.clean-header__links a{text-decoration:none;transition:color .25s ease;}
.clean-header__links a:hover,.clean-header__links a:focus-visible{color:var(--clean-accent);}
.clean-header__dropdown{position:relative;padding:25px 0;}
.clean-header__submenu{position:absolute;top:100%;left:0;width:400px;margin:0;padding:16px 0;list-style:none;background:#e8e1d9;border:1px solid #eee;border-radius:10px;box-shadow:0 15px 30px -10px rgba(0,11,48,.2);opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease,visibility .2s ease;}
.clean-header__dropdown:hover .clean-header__submenu,.clean-header__dropdown:focus-within .clean-header__submenu{opacity:1;visibility:visible;transform:translateY(0);}
.clean-header__submenu a{display:block;padding:8px 20px;color:#000;font-size:14px;line-height:1.5;}
.clean-header__actions{margin-left:auto;display:flex;align-items:center;gap:0;font-size:16px;font-weight:500;color:var(--clean-accent);}
.clean-header__cleaner,.clean-header__phone a{text-decoration:none;}
.clean-header__cleaner::after{content:"////";display:inline-block;color:var(--clean-bg);}
.clean-button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;height:40px;padding:0 20px;border-radius:50px;text-decoration:none;font-size:14px;line-height:19.6px;font-weight:400;white-space:nowrap;transition:background-color .2s ease,color .2s ease,border-color .2s ease;}
.clean-button--primary{background:var(--clean-accent);color:var(--clean-bg);}
.clean-button--primary:hover{background:var(--clean-accent-dark);color:var(--clean-bg);}
.clean-button--secondary{border:1px solid var(--clean-accent);color:#000;background:transparent;}
.clean-button--secondary:hover{background:var(--clean-accent);color:var(--clean-bg);}
.clean-button--primary{min-width:167px;margin-left:30px;}
.clean-button--secondary{min-width:101px;margin-left:10px;}
.clean-header__mobile{display:none;min-height:64px;padding:12px 20px;align-items:center;justify-content:space-between;}
.clean-header__burger{width:43px;height:40px;border:0;border-radius:8px;background:var(--clean-accent);display:grid;place-items:center;padding:9px;cursor:pointer;}
.clean-header__burger span{display:block;width:22px;height:2px;background:var(--clean-bg);border-radius:2px;margin:2px 0;}
.clean-stage{width:100%;position:relative;}
.clean-stage__artboard{position:relative;width:100%;overflow:hidden;}
.clean-stage__carrier,.clean-stage__filter{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}
.clean-stage__elem,.clean-stage__group{position:absolute;box-sizing:border-box;}
.clean-stage__elem{display:table;}
.clean-node-group [id^="molecule-"]{border-width:0;}
.clean-node-atom{display:table-cell;vertical-align:middle;width:100%;height:100%;box-sizing:content-box;-webkit-font-smoothing:antialiased;}
.clean-stage__elem[data-clean-type="button"]>.clean-node-atom{display:flex;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box;}
.clean-stage__elem[data-clean-type="button"] .clean-node-atom__button-content{display:flex;align-items:center;justify-content:center;width:100%;height:100%;}
.clean-node-atom:is(h1,h2,h3,p),.clean-node-atom>h1,.clean-node-atom>h2,.clean-node-atom>h3,.clean-node-atom>p{margin:0;}
.clean-node-atom__img{display:block;width:100%;height:auto;border:0;}
.clean-node-atom__vector svg{display:block;width:100%;height:100%;}
.clean-bgimg{background-position:center center;background-repeat:no-repeat;background-size:cover;}
.clean-node-atom__html{display:block;width:100%;height:auto;}
.clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000011"]{width:116px!important;height:40px!important;}
.clean-service-page #section1777833773 .clean-hero-stat-number,
.clean-service-page #section1777833773 .clean-hero-rating-score{display:block;color:#313131!important;font-family:Georgia,"Times New Roman",serif!important;font-size:40px!important;font-style:italic!important;font-weight:400!important;line-height:40px!important;letter-spacing:0!important;}
.clean-service-page #section1777833773 .clean-hero-rating-score{text-align:center;}
.clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000010"]{top:714px!important;}
.clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586275000018"]{top:655px!important;height:40px!important;}
.clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000013"],
.clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000014"],
.clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000015"],
.clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000016"],
.clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586275000017"]{top:704px!important;}
@media screen and (max-width:1199px){
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000011"]{width:116px!important;height:40px!important;}
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000010"]{top:688px!important;}
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586275000018"]{top:629px!important;}
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000013"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000014"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000015"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000016"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586275000017"]{top:678px!important;}
}
@media screen and (min-width:480px) and (max-width:639px){
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045610727000020"]{left:calc(50% - 240px + 10px)!important;}
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000010"]{top:613px!important;}
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586275000018"]{top:571px!important;}
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000013"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000014"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000015"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000016"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586275000017"]{top:613px!important;}
  .clean-service-page #section1778719793 .clean-node-elem[data-clean-id="1768240056031"]{left:calc(50% - 240px + 10px)!important;width:460px!important;}
  .clean-service-page #section1778719793 .clean-node-elem[data-clean-id="1768240056031"] .clean-node-atom{font-size:24px!important;white-space:normal!important;}
  .clean-service-page #section1778719793 .clean-node-elem[data-clean-id="1768240056120"]{left:calc(50% - 240px + 10px)!important;}
}
@media screen and (max-width:479px){
  .clean-service-page #section1777833793 .clean-node-elem[data-clean-id="1768231764218"]{left:calc(50% - 160px + 11px)!important;}
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000011"]{top:496px!important;width:87px!important;height:30px!important;}
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000010"]{top:528px!important;}
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586275000018"]{top:493px!important;width:58px!important;height:30px!important;}
  .clean-service-page #section1777833773 .clean-hero-stat-number,
  .clean-service-page #section1777833773 .clean-hero-rating-score{font-size:30px!important;line-height:30px!important;}
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000013"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000014"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000015"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586274000016"],
  .clean-service-page #section1777833773 .clean-node-elem[data-clean-id="1768045586275000017"]{top:526px!important;}
  .clean-service-page #section1778719793 .clean-node-elem[data-clean-id="1768240056120"]{left:calc(50% - 160px + 10px)!important;}
}
.clean-block123,.clean-container_100,.clean-width_100{width:100%;}
.clean-modal{position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;padding:24px;}
.clean-modal:target{display:flex;}
.clean-modal__backdrop{position:absolute;inset:0;background:rgba(49,49,49,.42);}
.clean-modal__panel{position:relative;width:min(560px,100%);max-height:86vh;overflow:auto;background:#faf9f6;border-radius:22px;padding:34px;color:#313131;box-shadow:0 30px 80px rgba(0,0,0,.22);}
.clean-modal__panel--wide{width:min(880px,100%);}
.clean-modal__close{position:absolute;right:18px;top:12px;text-decoration:none;font-size:32px;line-height:1;color:#9e435a;}
.clean-modal h2{margin:0 36px 10px 0;font-family:var(--clean-headline-font);font-size:34px;font-weight:400;line-height:1.16;}
.clean-modal p{margin:0 0 22px;font-size:15px;line-height:1.5;color:#5f5a55;}
.clean-city-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 16px;}
.clean-city-grid a{display:block;padding:9px 10px;border-radius:10px;background:#e8e1d9;text-decoration:none;font-size:14px;line-height:1.2;transition:background-color .2s ease,color .2s ease;}
.clean-city-grid a:hover{background:#9e435a;color:#faf9f6;}
.clean-application-form{display:grid;gap:14px;}
.clean-application-form label{display:grid;gap:7px;font-size:14px;}
.clean-application-form input{width:100%;min-height:46px;border:1px solid #d8cfc4;border-radius:10px;background:#e8e1d9;padding:0 14px;font:inherit;}
.clean-application-form button{min-height:50px;border:0;border-radius:999px;background:#9e435a;color:#fff;font:600 15px/1 var(--clean-text-font);cursor:pointer;}
@media (max-width:1120px){.clean-header__inner{gap:16px;padding:0 10px}.clean-header__links{gap:17px}.clean-header__actions{gap:8px;font-size:14px}.clean-button{padding:0 15px}}
@media (max-width:960px){
  .clean-header__mobile{display:flex;}
  .clean-header__nav{display:none;position:fixed;top:64px;left:0;right:0;background:#faf9f6;border-top:1px solid rgba(158,67,90,.14);box-shadow:0 18px 40px rgba(0,0,0,.08);}
  .clean-header.is-open .clean-header__nav{display:block;}
  .clean-header__inner{display:block;min-height:0;padding:18px 20px 24px;}
  .clean-header__logo--desktop{display:none;}
  .clean-header__links{display:grid;gap:0;font-size:16px;}
  .clean-header__links>li{border-bottom:1px solid rgba(158,67,90,.14);}
  .clean-header__dropdown{padding:0;}
  .clean-header__links>li>a,.clean-header__submenu a{display:block;padding:14px 0;top:0;}
  .clean-header__submenu{position:static;width:auto;opacity:1;visibility:visible;transform:none;box-shadow:none;border:0;background:#e8e1d9;border-radius:10px;margin:6px 0 12px;padding:8px 16px;}
  .clean-header__actions{margin:18px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .clean-header__cleaner,.clean-header__phone{grid-column:span 1;align-self:center;}
  .clean-button{min-height:44px;}
  .clean-city-grid{grid-template-columns:repeat(2,minmax(0,1fr));}
}
@media (max-width:479px){
  .clean-header__mobile{padding:12px 20px;}
  .clean-header__logo img{width:150px;}
  .clean-modal{padding:14px;}
  .clean-modal__panel{border-radius:18px;padding:28px 20px;}
  .clean-modal h2{font-size:28px;}
  .clean-city-grid{grid-template-columns:1fr;}
}
</style>`;
}

function renderRuntime() {
  return `
<script id="regular-clean-copy-runtime">
(function(){
  var header = document.querySelector('[data-clean-header]');
  var toggle = document.querySelector('[data-menu-toggle]');
  if (header && toggle) {
    toggle.addEventListener('click', function(){
      var isOpen = header.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
  }
  document.addEventListener('click', function(event){
    var link = event.target.closest ? event.target.closest('.clean-header__nav a') : null;
    if (link && header && toggle && window.innerWidth <= 960) {
      header.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();
</script>`;
}

function renderCallTracking() {
  return `<script id="regular-clean-copy-callrail" type="text/javascript" src="//cdn.callrail.com/companies/562095680/7c306f50357be4c201eb/12/swap.js"></script>
<script id="regular-clean-copy-callrail-fallback">
(function(){
  var SOURCE_DIGITS = "6308127077";
  var SOURCE_PATTERNS = [
    /\\+1\\(630\\)812-7077/g,
    /\\+1\\s*\\(630\\)\\s*812-7077/g,
    /\\(630\\)\\s*812-7077/g
  ];
  var ENDPOINT = "https://js.callrail.com/group/0/7c306f50357be4c201eb/12/swap_session.json";
  var STORAGE_KEY = "regular-clean-copy-callrail-assignment";

  function hasSourceNumber() {
    return document.body && /(?:\\+1)?\\(?630\\)?\\s*812-7077/.test(document.body.innerText || "");
  }

  function formatVisible(digits) {
    return "+1(" + digits.slice(0, 3) + ")" + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  function replaceText(digits) {
    if (!digits || digits.length !== 10) return;
    var visible = formatVisible(digits);
    var contactText = document.querySelector('[data-clean-id="1767883278623"] .clean-node-atom');
    if (contactText) contactText.textContent = visible;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(function(node){
      var value = node.nodeValue;
      SOURCE_PATTERNS.forEach(function(pattern){ value = value.replace(pattern, visible); });
      node.nodeValue = value;
    });
    document.querySelectorAll('a[href^="tel:"]').forEach(function(link){
      var href = link.getAttribute("href") || "";
      if (/6308127077|16308127077/.test(href)) link.setAttribute("href", "tel:+1" + digits);
    });
  }

  function makeSessionId() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  }

  function readSavedAssignment() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      return saved && /^\\d{10}$/.test(saved) ? saved : "";
    } catch (_error) {
      return "";
    }
  }

  function saveAssignment(digits) {
    try { localStorage.setItem(STORAGE_KEY, digits); } catch (_error) {}
  }

  function requestAssignment(hasRetried) {
    var payload = {
      cid: null,
      uuid: makeSessionId(),
      ref: "direct",
      landing: "https://shynlicleaningservice.com/services/regular-cleaning",
      user_agent: navigator.userAgent,
      record_pageview: false,
      swaps: [SOURCE_DIGITS + "="],
      all_formats: true,
      ids: [562095680],
      google_content_cookies: ""
    };
    return fetch(ENDPOINT, {
      method: "POST",
      headers: {"content-type": "text/plain"},
      body: JSON.stringify(payload)
    })
      .then(function(response){ return response.ok ? response.json() : null; })
      .then(function(data){
        var assignment = data && data.a && data.a["562095680"] && data.a["562095680"][SOURCE_DIGITS];
        var digits = assignment && assignment.national_string;
        if (/^\\d{10}$/.test(digits || "")) {
          saveAssignment(digits);
          replaceText(digits);
        } else if (!hasRetried) {
          return requestAssignment(true);
        }
      })
      .catch(function(){});
  }

  function runFallback() {
    window.setTimeout(function(){
      var isLocalPreview = /^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(window.location.hostname);
      if (!isLocalPreview || !document.body) return;
      var saved = readSavedAssignment();
      if (saved) {
        replaceText(saved);
        return;
      }
      requestAssignment();
    }, 1800);
  }

  if (document.readyState === "complete") {
    runFallback();
  } else {
    window.addEventListener("load", runFallback);
  }
})();
</script>`;
}

function buildPage() {
  const source = fs.readFileSync(SOURCE_FILE, "utf8");
  const records = getTopLevelRecords(source)
    .filter((record) => CONTENT_RECORD_IDS.has(record.id))
    .map((record) => cleanRecord(record.html))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Recurring House Cleaning Services | Shynli Cleaning</title>
<meta name="description" content="Reliable regular home cleaning services for busy households. Weekly, bi-weekly, and monthly cleaning plans with trusted local cleaners. Get a free quote today.">
<meta name="keywords" content="regular home cleaning recurring home cleaning weekly house cleaning bi weekly cleaning service monthly home cleaning">
<meta property="og:url" content="https://shynlicleaningservice.com/services/regular-cleaning">
<meta property="og:title" content="Recurring House Cleaning Services | Shynli Cleaning">
<meta property="og:description" content="Reliable regular home cleaning services for busy households. Weekly, bi-weekly, and monthly cleaning plans with trusted local cleaners. Get a free quote today.">
<meta property="og:type" content="website">
<meta property="og:image" content="images/tild6363-3962-4738-b466-326630613931__photo.png">
<link rel="canonical" href="https://shynlicleaningservice.com/services/regular-cleaning">
<link rel="icon" href="/images/tild3636-3965-4134-a432-323337623835__insta_32.png" type="image/png">
<link rel="preconnect" href="https://fonts.gstatic.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&family=Montserrat:wght@100..900&subset=latin,cyrillic" rel="stylesheet">
${renderBaseStyles()}
</head>
<body class="clean-body">
${renderHeader()}
<main class="clean-service-page">
${records}
</main>
${renderCityModal()}
${renderCleanerModal()}
${renderRuntime()}
${renderCallTracking()}
</body>
</html>
`;
}

fs.writeFileSync(TARGET_FILE, buildPage(), "utf8");
console.log(`Built ${path.relative(process.cwd(), TARGET_FILE)}`);
