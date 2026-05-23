"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { startServer, stopServer } = require("./server-test-helpers");

let serverProcess = null;
let BASE_URL = null;
const SERVICE_AREAS_SCRIPT = fs.readFileSync(
  path.join(__dirname, "..", "js", "service-areas-copy.js"),
  "utf8"
);

function zipTargets(...entries) {
  return entries.map(([city, url]) => ({ city, url }));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EXPECTED_SERVICE_ZIP_LOOKUP = {
  "60101": zipTargets(["Addison", "/addison"]),
  "60103": zipTargets(["Bartlett", "/bartlett"]),
  "60107": zipTargets(["Streamwood", "/streamwood"]),
  "60126": zipTargets(["Elmhurst", "/elmhurst"]),
  "60134": zipTargets(["Geneva", "/geneva"]),
  "60137": zipTargets(["Glen Ellyn", "/glenellyn"]),
  "60143": zipTargets(["Itasca", "/itasca"]),
  "60148": zipTargets(["Lombard", "/lombard"]),
  "60174": zipTargets(["St. Charles", "/stcharles"]),
  "60175": zipTargets(["St. Charles", "/stcharles"]),
  "60181": zipTargets(["Villa Park", "/villapark"]),
  "60184": zipTargets(["Wayne", "/wayne"]),
  "60185": zipTargets(["West Chicago", "/westchicago"]),
  "60187": zipTargets(["Wheaton", "/wheaton"]),
  "60188": zipTargets(["Carol Stream", "/carolstream"]),
  "60189": zipTargets(["Wheaton", "/wheaton"]),
  "60190": zipTargets(["Winfield", "/winfield"]),
  "60191": zipTargets(["Wood Dale", "/wooddale"]),
  "60439": zipTargets(["Lemont", "/lemont"]),
  "60440": zipTargets(["Bolingbrook", "/bolingbrook"]),
  "60441": zipTargets(["Homer Glen", "/homerglen"], ["Lockport", "/lockport"]),
  "60446": zipTargets(["Lockport", "/lockport"], ["Romeoville", "/romeoville"]),
  "60490": zipTargets(["Bolingbrook", "/bolingbrook"]),
  "60491": zipTargets(["Homer Glen", "/homerglen"], ["Lockport", "/lockport"]),
  "60502": zipTargets(["Aurora", "/aurora"]),
  "60503": zipTargets(["Aurora", "/aurora"]),
  "60504": zipTargets(["Aurora", "/aurora"]),
  "60505": zipTargets(["Aurora", "/aurora"]),
  "60506": zipTargets(["Aurora", "/aurora"]),
  "60510": zipTargets(["Batavia", "/batavia"]),
  "60512": zipTargets(["Bristol", "/bristol"]),
  "60514": zipTargets(["Clarendon Hills", "/clarendonhills"]),
  "60515": zipTargets(["Downers Grove", "/downersgrove"]),
  "60516": zipTargets(["Downers Grove", "/downersgrove"]),
  "60517": zipTargets(["Downers Grove", "/downersgrove"], ["Woodridge", "/woodridge"]),
  "60521": zipTargets(["Hinsdale", "/hinsdale"], ["Oak Brook", "/oakbrook"]),
  "60523": zipTargets(["Hinsdale", "/hinsdale"], ["Oak Brook", "/oakbrook"]),
  "60527": zipTargets(["Burr Ridge", "/burrridge"], ["Willowbrook", "/willowbrook"]),
  "60532": zipTargets(["Lisle", "/lisle"]),
  "60538": zipTargets(["Montgomery", "/montgomery"]),
  "60540": zipTargets(["Naperville", "/naperville"]),
  "60542": zipTargets(["North Aurora", "/northaurora"]),
  "60543": zipTargets(["Oswego", "/oswego"]),
  "60544": zipTargets(["Plainfield", "/plainfield"]),
  "60554": zipTargets(["Sugar Grove", "/sugargrove"]),
  "60555": zipTargets(["Warrenville", "/warrenville"]),
  "60559": zipTargets(["Westmont", "/westmont"]),
  "60560": zipTargets(["Yorkville", "/yorkville"]),
  "60561": zipTargets(["Darien", "/darien"]),
  "60563": zipTargets(["Naperville", "/naperville"], ["Warrenville", "/warrenville"]),
  "60564": zipTargets(["Naperville", "/naperville"]),
  "60565": zipTargets(["Naperville", "/naperville"]),
  "60585": zipTargets(["Plainfield", "/plainfield"]),
  "60586": zipTargets(["Plainfield", "/plainfield"]),
};

function extractServiceZipLookupData() {
  const match = SERVICE_AREAS_SCRIPT.match(/const zipMap = Object\.freeze\((\{[\s\S]*?\n  \})\);/);
  assert.ok(match, "ZIP lookup data should be present in service-areas-copy.js");
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${match[1]})`)));
}

function createServiceAreasZipRuntime(initialZip = "") {
  const listeners = {};
  const elements = {
    zipForm: {
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
    },
    zipInput: {
      value: initialZip,
      addEventListener(type, handler) {
        listeners[`input:${type}`] = handler;
      },
      focus() {},
    },
    zipMessage: {
      textContent: "",
      innerHTML: "",
    },
  };

  const context = {
    document: {
      querySelector(selector) {
        if (selector === "[data-zip-form]") return elements.zipForm;
        if (selector === "[data-zip-input]") return elements.zipInput;
        if (selector === "[data-zip-message]") return elements.zipMessage;
        return null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
    },
    window: {
      location: {
        href: "",
      },
    },
    HTMLAnchorElement: function HTMLAnchorElement() {},
  };

  vm.runInNewContext(SERVICE_AREAS_SCRIPT, context);

  return {
    elements,
    listeners,
    window: context.window,
  };
}

test.before(async () => {
  const started = await startServer();
  serverProcess = started.child;
  BASE_URL = started.baseUrl;
});

test.after(async () => {
  await stopServer(serverProcess);
});

test("serves the home page through the custom route layer", async () => {
  const response = await fetch(`${BASE_URL}/`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(
    body,
    /<title>House Cleaning Services in Naperville & Chicago Suburbs \| Shynli Cleaning<\/title>/
  );
  assert.match(
    body,
    /<meta name="description" content="Professional house cleaning in Naperville, Aurora, Sugar Grove, and nearby Chicago suburbs\. Regular, deep, and move-out cleaning with fast free quotes\." \/>/
  );
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), geolocation=(), microphone=()");
  assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.equal(linkHeader, "");
  assert.doesNotMatch(linkHeader, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(body, /\/css\/shynli-fonts\.css\?v=20260522-local2/);
  assert.doesNotMatch(body, /css\/tilda-grid-3\.0\.min\.css|css\/tilda-blocks-page108488156/);
  assert.doesNotMatch(body, /tilda-menu-widgeticons-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-menu-widgeticons-1\.0\.min\.css/);
  assert.doesNotMatch(body, /id="shynli-menu-widgeticons-runtime-stub"/);
  assert.doesNotMatch(body, /js\/tilda-menusub-1\.0\.min\.js/);
  assert.doesNotMatch(body, /id="shynli-menusub-runtime"/);
  assert.doesNotMatch(body, /js\/tilda-menu-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-menu-burger-1\.0\.min\.js/);
  assert.doesNotMatch(body, /id="shynli-menu-shell-runtime"/);
  assert.doesNotMatch(body, /js\/tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-blocks-page108488156\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.doesNotMatch(body, /data-original=/);
  assert.doesNotMatch(body, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(body, /id="shynli-zero-runtime-stub"/);
  assert.doesNotMatch(body, /tilda-animation-2\.0\.min\.(css|js)/);
  assert.doesNotMatch(body, /js\/tilda-forms-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-forms-1\.0\.min\.js/);
  assert.match(body, /<form class="lead-form" data-lead-form>/);
  assert.doesNotMatch(body, /class="t-form t-form_inputs-total_6 js-form-proccess"/);
  assert.doesNotMatch(body, /data-shynli-form-kind="cleaner-application"/);
  assert.doesNotMatch(body, /id="shynli-cleaner-application-form-runtime"/);
  assert.match(body, /Shynli Cleaning/i);
  assert.doesNotMatch(body, /For your safety and ours, we don't provide:/);
  assert.match(body, /House Cleaning[\s\S]*Services in Naperville<br>&amp; Chicago Suburbs/);
  assert.match(
    body,
    /Reliable regular, deep, and move-out cleaning for busy families<br>in Naperville, Aurora, Sugar Grove, and nearby areas\./
  );
  assert.doesNotMatch(body, /id="shynli-homepage-copy-fit-style"/);
  assert.doesNotMatch(body, /id="shynli-home-fast-quote-cta"/);
  assert.match(body, /href="\/quote">Fast free quote/);
  assert.equal(
    (body.match(/4 simple steps to a perfectly clean, cozy, and comfortable space/g) || []).length,
    1
  );
  assert.doesNotMatch(body, /data-elem-id=['"]1767790203594000001['"]/);
  assert.equal(
    (body.match(/What you see is what you pay\.(?:\s*<br\s*\/?>\s*|\s+)No hidden fees\./g) ||
      []).length,
    1
  );
  assert.equal(
    (body.match(/Same quality, same standards,(?:\s*<br\s*\/?>\s*|\s+)every single visit\./g) ||
      []).length,
    1
  );
  assert.doesNotMatch(body, /data-elem-id=['"]1767791730605['"]/);
  assert.doesNotMatch(body, /data-elem-id=['"]1767881559686000001['"]/);
  assert.doesNotMatch(body, /id="shynli-benefit-copy-single-instance-style"/);
  assert.match(body, /Suganya Swamy/);
  assert.match(body, /Mobile Legends Jek/);
  assert.match(body, /Yevgeniy Magomedov/);
  assert.match(body, /Lina Gonzales/);
  assert.match(body, /clients-say-home__track--top/);
  assert.match(body, /clients-say-home__track--bottom/);
  assert.doesNotMatch(body, /clients-say-home__group--clone/);
  assert.doesNotMatch(body, /clients-say-home__group--ghost/);
  assert.doesNotMatch(body, /initClientsSayMarquee/);
  [
    /Do you offer house cleaning in Naperville and Aurora\?/,
    /Shynli Cleaning serves homes across/,
    /Do you bring cleaning supplies\?/,
    /Our team brings the supplies needed for the booked service\./,
    /Can I book recurring cleaning\?/,
    /Weekly, bi-weekly, and monthly visits are available\./,
    /Do you offer move-out cleaning\?/,
    /Move-in and move-out cleaning is available for houses, apartments, and condos\./,
  ].forEach((pattern) => assert.match(body, pattern));
  assert.match(body, /class="areas__summary"/);
  assert.match(body, /Shynli Cleaning serves homes across/);
  [
    ["href=\"/naperville\"", /Naperville/],
    ["href=\"/aurora\"", /Aurora/],
    ["href=\"/sugargrove\"", /Sugar Grove/],
    ["href=\"/plainfield\"", /Plainfield/],
    ["href=\"/bolingbrook\"", /Bolingbrook/],
    ["href=\"/lisle\"", /Lisle/],
    ["href=\"/downersgrove\"", /Downers Grove/],
    ["href=\"/wheaton\"", /Wheaton/],
  ].forEach(([href, label]) => {
    assert.match(body, new RegExp(href));
    assert.match(body, label);
  });
});

test("serves the homepage ads duplicate as an indexable sitemap route", async () => {
  const response = await fetch(`${BASE_URL}/ads/`);
  const body = await response.text();
  const sitemapResponse = await fetch(`${BASE_URL}/sitemap.xml`);
  const sitemapBody = await sitemapResponse.text();
  const robotsResponse = await fetch(`${BASE_URL}/robots.txt`);
  const robotsBody = await robotsResponse.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(body, /House Cleaning Services in Chicago Suburbs/i);
  assert.match(body, /Professional House Cleaning Near You in Chicagoland/);
  assert.match(body, /shynli-ads-title-accent/);
  assert.match(body, /\$135\/visit/);
  assert.match(body, /Trusted by 300\+ Chicagoland families &middot; Fully insured &middot; Pay after we clean/);
  assert.match(body, /Takes less than 60 seconds/);
  assert.match(body, /GET FREE QUOTE/);
  assert.match(body, /Looking for a House Cleaner Near You\?/);
  assert.match(body, /Shynli Cleaning serves 40\+ Chicago suburbs with reliable, insured local cleaners/);
  assert.match(body, /Find Cleaners in Your City &rarr;/);
  assert.match(body, /href="\/service-areas"/);
  assert.doesNotMatch(body, /shynli-ads-price-old/);
  assert.doesNotMatch(body, /data-shynli-ads-countdown/);
  assert.doesNotMatch(body, /Offer ends in/);
  assert.doesNotMatch(body, /id="shynli-ads-countdown-runtime"/);
  assert.match(body, /id="shynli-ads-lead-popup-runtime"/);
  assert.match(body, /data-shynli-ads-lead-popup/);
  assert.match(body, /Shynli Cleaning Service/);
  assert.match(body, /What service do you need\?/);
  assert.match(body, /Regular Cleaning/);
  assert.match(body, /Deep Cleaning/);
  assert.match(body, /Leave your phone number and full name\./);
  assert.match(body, /inputmode="numeric"/);
  assert.match(body, /data-phone-max-digits="10"/);
  assert.match(body, /Thank you, we will contact you shortly\./);
  assert.match(body, /POPUP_DELAY_MS = 5000/);
  assert.match(body, /"requestType":"call_me"|requestType: "call_me"/);
  assert.match(body, /\/api\/quote\/submit/);
  assert.doesNotMatch(
    body,
    /House Cleaning Services in Naperville(?:\s*<br\s*\/?>\s*|\s+)&amp; Chicago Suburbs/
  );
  assert.doesNotMatch(
    body,
    /Reliable regular, deep, and move-out cleaning for busy families(?:\s*<br\s*\/?>\s*|\s+)in Naperville, Aurora, Sugar Grove, and nearby areas\./
  );
  assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.match(body, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(body, /<meta name="robots" content="noindex,nofollow" \/>/);
  assert.match(body, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/ads"\s*\/?>/);
  assert.equal(sitemapResponse.status, 200);
  assert.match(sitemapBody, /<loc>https:\/\/shynlicleaningservice\.com\/ads<\/loc>/);
  assert.equal(robotsResponse.status, 200);
  assert.doesNotMatch(robotsBody, /Disallow: \/ads\//);
});

test("serves home-like routes without zero/lazyload runtimes", async () => {
  const homeLikeRoutes = [
    { route: "/home-calculator", expectedTitle: /Instant House Cleaning Cost Calculator/i },
    { route: "/home-simple", expectedTitle: /House Cleaning Services in Naperville<br>&amp; Chicago Suburbs/i },
  ];

  for (const { route, expectedTitle } of homeLikeRoutes) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(body, expectedTitle, route);
    assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/, route);
    assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/, route);
    assert.doesNotMatch(body, /js\/tilda-blocks-page[^"]+\.min\.js/, route);
    assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/, route);
    assert.doesNotMatch(body, /data-original=/, route);
    assert.match(body, /id="shynli-home-page-runtime"/, route);
    assert.match(body, /id="shynli-zero-runtime-stub"/, route);
    assert.match(body, /href="#city"/, route);
    assert.match(body, /href="#clean"/, route);
  }
});

test("serves the quote page through the static route layer", async () => {
  const response = await fetch(`${BASE_URL}/quote`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(linkHeader, /<\/css\/quote2\.css\?v=[^>]+>; rel=preload; as=style/);
  assert.match(linkHeader, /<\/js\/quote2-app\.js\?v=[^>]+>; rel=preload; as=script/);
  assert.doesNotMatch(linkHeader, /tilda-grid-3\.0\.min\.css/);
  assert.match(body, /Request a Quote/i);
  assert.match(body, /Enter your full name and phone number to calculate the service cost/i);
  assert.match(body, /Name/i);
  assert.match(body, /placeholder="\+1\(000\)000-0000"/);
  assert.doesNotMatch(body, /placeholder="\+1 \(630\) 555-0102"/);
  assert.match(body, /Great — how would you like to continue\?/);
  assert.match(body, /Call me to confirm the details/);
  assert.match(body, /We’ll ask a few quick questions and give you the final quote\./);
  assert.match(body, /I want to calculate online/);
  assert.match(body, /Answer a few questions to get a more accurate estimate\./);
});

test("serves the no-price quote variant for ads traffic", async () => {
  const response = await fetch(`${BASE_URL}/quote-no-price`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/i);
  assert.match(body, /id="quote-no-price-runtime"/);
  assert.match(body, /quoteNoPrice: true/);
  assert.match(body, /Enter your full name and phone number, then continue or ask us to call you\./);
  assert.match(body, /Great — how would you like to continue\?/);
  assert.match(body, /I want to calculate online/);
  assert.doesNotMatch(body, /id="quote2CalculateOnlineButton"[^>]+hidden[^>]+disabled/);
});

test("serves the no-calculator quote variant for ads traffic", async () => {
  const response = await fetch(`${BASE_URL}/quote-no-calculator`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/i);
  assert.match(body, /id="quote-no-calculator-runtime"/);
  assert.match(body, /quoteNoCalculator: true/);
  assert.match(body, /Enter your full name and phone number, then continue or ask us to call you\./);
  assert.match(body, /Ready for a quick call\?/);
  assert.match(body, /id="quote2CalculateOnlineButton"[^>]+hidden[^>]+disabled/);
});

test("serves the blog page without legacy feed asset hints", async () => {
  const response = await fetch(`${BASE_URL}/blog`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.doesNotMatch(linkHeader, /tilda-grid-3\.0\.min\.css/);
  assert.doesNotMatch(linkHeader, /tilda-blocks-page108872586/);
  assert.doesNotMatch(linkHeader, /tilda-feed-1\.1\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /tilda-slds-1\.4\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /hammer\.min\.js/);
  assert.doesNotMatch(linkHeader, /quote2\.css/);
  assert.doesNotMatch(body, /data-tilda-project-id=/);
  assert.doesNotMatch(body, /tilda-grid-3\.0\.min\.css/);
  assert.doesNotMatch(body, /tilda-blocks-page108872586/);
  assert.doesNotMatch(body, /tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-menu-1\.1\.min\.js/);
  assert.doesNotMatch(body, /tilda-menu-burger-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-animation-2\.0\.min\.(css|js)/);
  assert.match(body, /class="shynli-blog-shell"/);
  assert.match(body, /Shynli Cleaning <span>Blog<\/span>/i);
  assert.match(body, /href="\/blog\/checklists"/);
  assert.match(body, /href="\/quote"/);
});

test("serves blog category pages without legacy feed assets", async () => {
  const response = await fetch(`${BASE_URL}/blog/checklists`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.doesNotMatch(linkHeader, /tilda-grid-3\.0\.min\.css/);
  assert.doesNotMatch(linkHeader, /tilda-blocks-page108872586/);
  assert.doesNotMatch(linkHeader, /tilda-feed-1\.1\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /tilda-slds-1\.4\.min\.(css|js)/);
  assert.doesNotMatch(linkHeader, /hammer\.min\.js/);
  assert.doesNotMatch(body, /data-tilda-project-id=/);
  assert.doesNotMatch(body, /tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-popup-1\.0\.min\.js/);
  assert.match(body, /class="shynli-blog-shell"/);
  assert.match(body, /Cleaning <span>Checklists<\/span>/);
  assert.match(body, /Featured articles|Featured article/);
  assert.match(body, /href="\/blog\/checklists\//);
});

test("serves blog article pages without unused widgeticon assets", async () => {
  const response = await fetch(`${BASE_URL}/blog/airbnb/airbnb-turnover-cleaning-checklist-with-photos`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.doesNotMatch(body, /data-tilda-project-id=/);
  assert.doesNotMatch(body, /tilda-grid-3\.0\.min\.css/);
  assert.doesNotMatch(body, /tilda-blocks-page108872586/);
  assert.doesNotMatch(body, /tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-popup-1\.0\.min\.js/);
  assert.match(body, /class="shynli-blog-shell"/);
  assert.match(body, /Airbnb Turnover Cleaning Checklist/i);
  assert.match(body, /data-blog-print/);
});

test("serves city landing pages from the clean shared city template", async () => {
  const response = await fetch(`${BASE_URL}/romeoville`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(body, /<title>House Cleaning Services in Romeoville, IL \| Shynli Cleaning<\/title>/);
  assert.match(body, /House Cleaning Services in <span class="sg-accent">Romeoville<\/span>, IL/);
  assert.match(body, /Shynli Cleaning helps Romeoville homeowners/);
  assert.match(body, /class="sg-page"/);
  assert.doesNotMatch(body, /js\/tilda-scripts-3\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-blocks-page111640886\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-popup-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.doesNotMatch(body, /data-original=/);
  assert.doesNotMatch(body, /js\/tilda-menu-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-menu-burger-1\.0\.min\.js/);
  assert.doesNotMatch(body, /js\/tilda-menusub-1\.0\.min\.js/);
  assert.match(body, /id="shynli-home-page-runtime"/);
  assert.match(body, /id="shynli-zero-runtime-stub"/);
  assert.match(body, /src="images\/shynli-logo-primary\.png"/);
  assert.match(body, /href="\/images\/shynli-icon-32\.png"/);
  assert.doesNotMatch(body, /js\/tilda-events-1\.0\.min\.js/);
  assert.match(body, /href="\/quote"/);
  assert.match(body, /href="#city"/);
  assert.match(body, /href="#clean"/);
  assert.match(
    body,
    /<a class="sg-button sg-button--outline sg-city-button"[^>]*>Romeoville<\/a>/
  );
  assert.doesNotMatch(body, /tild|tilda|t-rec|t396|tn-atom|data-tilda|t-menu|t-btn|allrecords|t-body/i);
});

test("serves the clean Sugar Grove copy on /sugargrove", async () => {
  const response = await fetch(`${BASE_URL}/sugargrove`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(
    body,
    /<title>House Cleaning Services in Sugar Grove, IL \| Shynli Cleaning<\/title>/
  );
  assert.match(
    body,
    /<meta property="og:url" content="https:\/\/shynlicleaningservice\.com\/sugargrove" \/>/
  );
  assert.match(
    body,
    /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/sugargrove">/
  );
  assert.match(
    body,
    /<h1>House Cleaning Services in <span class="sg-accent">Sugar Grove<\/span>, IL<\/h1>/
  );
  assert.match(
    body,
    /Reliable regular, deep, and move-in\/move-out cleaning for homes in Sugar Grove and nearby areas\./
  );
  assert.match(
    body,
    /Local cleaning team &bull; Transparent pricing &bull; Weekly, bi-weekly, and one-time service/
  );
  assert.match(body, /<a class="sg-button sg-hero-panel__cta" href="\/quote">Get Free Quote<\/a>/);
  assert.match(body, /Looking for a reliable house cleaning service in <strong>Sugar Grove\?<\/strong>/);
  assert.match(body, /Shynli Cleaning helps Sugar Grove homeowners keep their homes clean, fresh, and easier to maintain with regular house cleaning/);
  assert.match(body, /regular house cleaning, deep cleaning, and move-in\/move-out service/);
  assert.match(body, /Whether you need weekly cleaning, bi-weekly cleaning, or a full deep clean before guests/);
  assert.match(body, /Why Choose <span class="sg-accent">Recurring Cleaning in Sugar Grove\?<\/span>/);
  assert.match(body, /Most Sugar Grove homeowners choose bi-weekly cleaning because it keeps the home consistently clean without the cost of weekly service/);
  assert.match(body, /<section id="sugargrove-residential-services"/);
  assert.match(body, /<section id="sugargrove-recurring-cleaning"/);
  assert.match(body, /id="shynli-sugargrove-mobile-layout-fix"/);
  assert.match(body, /Serving Sugar Grove and nearby communities/);
  assert.doesNotMatch(body, /tild|tilda|t-rec|t396|tn-atom|data-tilda|t-menu|t-btn|allrecords|t-body/i);
});

test("redirects the removed /sugargrove2 duplicate to /sugargrove", async () => {
  const response = await fetch(`${BASE_URL}/sugargrove2`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/sugargrove");
});

test("redirects removed copy and archive routes to canonical pages", async () => {
  const redirects = [
    ["/home2", "/"],
    ["/home-copy", "/"],
    ["/about-us-copy", "/about-us"],
    ["/blog-copy", "/blog"],
    ["/contacts-copy", "/contacts"],
    ["/pricing-copy", "/pricing"],
    ["/service-areas-copy", "/service-areas"],
    ["/services/airbnb-cleaning-copy", "/services/airbnb-cleaning"],
    ["/services/commercial-cleaning-copy", "/services/commercial-cleaning"],
    ["/services/deep-cleaning-copy", "/services/deep-cleaning"],
    ["/services/move-in-move-out-cleaning-copy", "/services/move-in-move-out-cleaning"],
    ["/services/regular-cleaning-copy", "/services/regular-cleaning"],
  ];

  const sitemapResponse = await fetch(`${BASE_URL}/sitemap.xml`);
  const sitemapBody = await sitemapResponse.text();
  assert.equal(sitemapResponse.status, 200);

  for (const [source, target] of redirects) {
    const response = await fetch(`${BASE_URL}${source}?utm_source=test`, {
      redirect: "manual",
    });

    assert.equal(response.status, 301, source);
    assert.equal(response.headers.get("location"), `${target}?utm_source=test`, source);
    assert.doesNotMatch(
      sitemapBody,
      new RegExp(`<loc>https://shynlicleaningservice\\.com${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`),
      source
    );
  }
});

test("serves all city pilot pages without zero/lazyload runtimes", async () => {
  const cityRoutes = [
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
    ["/sugargrove", "Sugar Grove"],
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

  for (const [route, city] of cityRoutes) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();
    const cityPattern = escapeRegExp(city);

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(
      body,
      new RegExp(`<title>House Cleaning Services in ${cityPattern}, IL \\| Shynli Cleaning<\\/title>`),
      route
    );
    assert.match(
      body,
      new RegExp(`<meta property="og:url" content="https:\\/\\/shynlicleaningservice\\.com${escapeRegExp(route)}" \\/>`),
      route
    );
    assert.match(
      body,
      new RegExp(`<link rel="canonical" href="https:\\/\\/shynlicleaningservice\\.com${escapeRegExp(route)}">`),
      route
    );
    assert.match(
      body,
      new RegExp(`House Cleaning Services in <span class="sg-accent">${cityPattern}<\\/span>, IL`),
      route
    );
    assert.match(body, new RegExp(`homes in ${cityPattern} and nearby areas`), route);
    assert.match(
      body,
      new RegExp(`Looking for a reliable house cleaning service in <strong>${cityPattern}\\?<\\/strong>`),
      route
    );
    assert.match(body, new RegExp(`Shynli Cleaning helps(?: busy)? ${cityPattern}`), route);
    assert.match(
      body,
      new RegExp(`Why Choose <span class="sg-accent">Recurring Cleaning in ${cityPattern}\\?<\\/span>`),
      route
    );
    assert.match(
      body,
      new RegExp(
        `We serve ${cityPattern} and nearby (?:DuPage County communities|Fox Valley communities|northwest suburban communities|southwest suburban communities|western suburbs) with clear, reliable scheduling\\.`
      ),
      route
    );
    const nearbyAreaBlock = body.match(
      /<div class="sg-area-links" aria-label="Nearby city links">([\s\S]*?)<\/div>\s*<div class="sg-zip/
    );
    assert.ok(nearbyAreaBlock, route);
    const nearbyAreaCities = [...nearbyAreaBlock[1].matchAll(/<a class="sg-area-pill[^"]*" href="[^"]+">([^<]+)<\/a>/g)].map(
      (match) => match[1]
    );
    assert.equal(nearbyAreaCities.length, 7, route);
    assert.ok(!nearbyAreaCities.includes(city), route);
    const areaSummaryBlock = body.match(
      /<div class="sg-area-summary sg-reveal" aria-label="Service area city summary">([\s\S]*?)<\/div>/
    );
    assert.ok(areaSummaryBlock, route);
    const areaSummaryCities = [
      ...areaSummaryBlock[1].matchAll(/<a class="sg-area-summary__city" href="[^"]+">([^<]+)<\/a>/g),
    ].map((match) => match[1]);
    assert.equal(areaSummaryCities.length, 8, route);
    assert.equal(areaSummaryCities[0], city, route);
    assert.doesNotMatch(
      body,
      new RegExp(`Most of our ${cityPattern} clients choose bi-weekly cleaning`),
      route
    );
    assert.match(body, new RegExp(`Pricing for home cleaning in <strong>${cityPattern}<\\/strong>`), route);
    assert.match(body, new RegExp(`FAQ About House Cleaning in <span class="sg-accent">${cityPattern}<\\/span>`), route);
    const faqSection = body.match(/<section class="sg-section sg-faq" id="faq"[\s\S]*?<\/section>/);
    assert.ok(faqSection, route);
    assert.equal((faqSection[0].match(/<details class="sg-faq__item">/g) || []).length, 5, route);
    assert.match(faqSection[0], new RegExp(`Can I get a free quote for house cleaning in ${cityPattern}\\?`), route);
    assert.doesNotMatch(faqSection[0], /Do I need to be home during the cleaning\?|How is pricing calculated\?/, route);
    assert.match(body, new RegExp(`Get a Free Quote for House Cleaning in <span class="sg-accent">${cityPattern}<\\/span>`), route);
    assert.match(
      body,
      new RegExp(`<a class="sg-button sg-button--outline sg-city-button"[^>]*>${cityPattern}<\\/a>`),
      route
    );
    assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/, route);
    assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/, route);
    assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/, route);
    assert.doesNotMatch(body, /data-original=/, route);
    assert.doesNotMatch(body, /tild|tilda|t-rec|t396|tn-atom|data-tilda|t-menu|t-btn|allrecords|t-body/i, route);
    assert.match(body, /id="shynli-home-page-runtime"/, route);
    assert.match(body, /id="shynli-zero-runtime-stub"/, route);
    assert.match(body, /href="#city"/, route);
    assert.match(body, /href="#clean"/, route);
  }
});

test("serves static marketing pilots without zero/lazyload runtimes", async () => {
  const staticRoutes = [
    ["/about-us", /About/i],
    ["/contacts", /Contact/i],
    ["/faq", /FAQ|pricing calculated/i],
    ["/pricing", /Pricing|Instant Quote/i],
    ["/service-areas", /Service Areas/i],
  ];
  const cleanStaticRoutes = new Set(["/contacts", "/faq", "/service-areas"]);

  for (const [route, expectedTitle] of staticRoutes) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(body, expectedTitle, route);
    assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/, route);
    assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/, route);
    assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/, route);
    assert.doesNotMatch(body, /data-original=/, route);
    if (route === "/service-areas") {
      assert.equal(response.headers.get("x-robots-tag"), null, route);
      assert.match(body, /<main class="sa-page"/, route);
      assert.match(body, /href="\/css\/service-areas-copy\.css\?v=10"/, route);
      assert.match(body, /src="\/js\/service-areas-copy\.js\?v=9"/, route);
      assert.doesNotMatch(body, /id="shynli-home-page-runtime"/, route);
      assert.doesNotMatch(body, /id="shynli-zero-runtime-stub"/, route);
      assert.doesNotMatch(
        body,
        /(?:css|js)\/tilda|class=["'][^"']*(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-menu)|id="allrecords"|data-tilda-/i,
        route
      );
    } else if (cleanStaticRoutes.has(route)) {
      assert.doesNotMatch(body, /id="shynli-home-page-runtime"/, route);
      assert.doesNotMatch(body, /id="shynli-zero-runtime-stub"/, route);
    } else {
      assert.match(body, /id="shynli-home-page-runtime"/, route);
      assert.match(body, /id="shynli-zero-runtime-stub"/, route);
    }
    if (cleanStaticRoutes.has(route)) {
      assert.match(body, /data-city-open/, route);
    } else {
      assert.match(body, /href="#city"/, route);
    }
    assert.match(body, /href="#clean"/, route);
  }
});

test("shows the newly added cities on the service areas page and ZIP lookup", async () => {
  const response = await fetch(`${BASE_URL}/service-areas`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /sa-city-modal__grid/);
  assert.match(body, /sa-city-modal__group/);
  assert.match(body, /sa-city-modal__list/);
  assert.match(body, /sa-city-grid/);
  assert.match(body, /V-Y:/);
  assert.match(body, /North Aurora/);
  assert.match(body, /Sugar Grove/);
  assert.match(body, /Yorkville/);
  assert.match(body, /Bristol/);
  assert.doesNotMatch(body, /shynli-extra-service-areas/);
  assert.doesNotMatch(body, /Now serving these cities too/);
  assert.match(body, /data-zip-form/);
  assert.match(body, /Find your area by ZIP code/);
  assert.match(body, /src="\/js\/service-areas-copy\.js\?v=9"/);
  assert.doesNotMatch(body, /<h2 id="city-modal-title">Choose your city<\/h2>/);
  assert.doesNotMatch(body, /const serviceZips=/);
});

test("uses the exact ZIP lookup map and supports shared ZIP matches", async () => {
  const response = await fetch(`${BASE_URL}/service-areas`);
  const body = await response.text();
  const zipLookupData = extractServiceZipLookupData();

  assert.deepEqual(zipLookupData, EXPECTED_SERVICE_ZIP_LOOKUP);
  assert.match(body, /src="\/js\/service-areas-copy\.js\?v=9"/);

  let runtime = createServiceAreasZipRuntime("60521");
  runtime.listeners.submit({ preventDefault() {} });
  assert.match(runtime.elements.zipMessage.innerHTML, /Hinsdale/);
  assert.match(runtime.elements.zipMessage.innerHTML, /Oak Brook/);
  assert.match(runtime.elements.zipMessage.innerHTML, /This ZIP covers/);

  runtime = createServiceAreasZipRuntime("60512");
  runtime.listeners.submit({ preventDefault() {} });
  assert.equal(runtime.elements.zipMessage.textContent, "Taking you to Bristol...");
  assert.equal(runtime.window.location.href, "/bristol");

  runtime = createServiceAreasZipRuntime("60116");
  runtime.listeners.submit({ preventDefault() {} });
  assert.match(runtime.elements.zipMessage.innerHTML, /Request a quote/);
  assert.match(runtime.elements.zipMessage.innerHTML, /60116/);
});

test("serves the regular-cleaning main route as clean hand-coded markup", async () => {
  const response = await fetch(`${BASE_URL}/services/regular-cleaning`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.equal(response.headers.get("x-robots-tag"), null);
  assert.match(body, /Recurring House Cleaning Services/i);
  assert.match(body, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/services\/regular-cleaning"\s*\/?>/);
  assert.doesNotMatch(body, /<meta name="robots"[^>]+noindex/i);
  assert.match(body, /<main class="clean-service-page">/);
  assert.match(body, /<h1 class='clean-node-atom'>Regular House Cleaning<\/h1>/);
  assert.doesNotMatch(body, /regular-cleaning-copy/i);
  assert.doesNotMatch(body, /(?:css|js)\/tilda/i);
  assert.doesNotMatch(body, /(?:class=["'][^"']*(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-menu)|id="allrecords"|data-tilda-)/i);
  assert.doesNotMatch(body, /data-original=/);
  assert.doesNotMatch(body, /__resize__20x__/);
  assert.doesNotMatch(body, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(body, /id="shynli-zero-runtime-stub"/);
  assert.match(body, /href="\/services\/regular-cleaning#city"/);
  assert.match(body, /href="#clean"/);
});

test("serves the service areas main route as clean hand-coded markup", async () => {
  const response = await fetch(`${BASE_URL}/service-areas`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.equal(response.headers.get("x-robots-tag"), null);
  assert.match(body, /<title>Service Areas \| Home Cleaning Services in Chicago Suburbs<\/title>/);
  assert.match(
    body,
    /<meta name="description" content="Shynli Cleaning proudly serves homes across the Chicago suburbs\. View our full list of service areas and find cleaning services near you\."\s*\/?>/
  );
  assert.match(body, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/service-areas"\s*\/?>/);
  assert.doesNotMatch(body, /<meta name="robots"[^>]+noindex/i);
  assert.match(body, /<main class="sa-page"/);
  assert.match(body, /href="\/css\/service-areas-copy\.css\?v=10"/);
  assert.match(body, /src="\/js\/service-areas-copy\.js\?v=9"/);
  assert.match(body, /src="\/images\/shynli-sugargrove-area-map\.svg"/);
  assert.match(body, /Serving <span>Chicagoland<\/span> Communities/i);
  assert.match(body, /Get Your Home Professionally Cleaned/i);
  assert.match(body, /<h2 class="sa-sr-only" id="city-modal-title">Choose your city<\/h2>/);
  assert.match(body, /<h3>A-D:<\/h3>/);
  assert.match(body, /<ul class="sa-city-modal__list">/);
  assert.match(body, /data-city-open/);
  assert.match(body, /href="#clean"/);
  assert.doesNotMatch(body, /tild|tilda|t-rec|t396|tn-atom|data-tilda|allrecords|t-body/i);
  assert.doesNotMatch(body, /js\/tilda|css\/tilda|data-original=/i);
  assert.doesNotMatch(body, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(body, /id="shynli-zero-runtime-stub"/);
});

test("serves the commercial-cleaning main route as clean hand-coded markup", async () => {
  const response = await fetch(`${BASE_URL}/services/commercial-cleaning`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.equal(response.headers.get("x-robots-tag"), null);
  assert.match(linkHeader, /commercial-cleaning-copy\.css\?v=35/);
  assert.doesNotMatch(linkHeader, /tilda/i);
  assert.match(body, /Commercial Cleaning Services/i);
  assert.match(body, /<meta name="robots" content="index,follow"\s*\/?>/);
  assert.match(body, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/services\/commercial-cleaning"\s*\/?>/);
  assert.match(body, /class="commercial-clean-page"/);
  assert.match(body, /data-city-open/);
  assert.match(body, /data-city-modal/);
  assert.match(body, /A-D:/);
  assert.match(body, /Addison/);
  assert.match(body, /Yorkville/);
  assert.match(body, /\/css\/commercial-cleaning-copy\.css/);
  assert.match(body, /\/css\/commercial-cleaning-city-modal\.css/);
  assert.match(body, /\/js\/commercial-cleaning-copy\.js/);
  assert.match(body, /\/js\/commercial-cleaning-city-modal\.js/);
  assert.doesNotMatch(body, /js\/tilda-[^"]+/);
  assert.doesNotMatch(body, /css\/tilda-[^"]+/);
  assert.doesNotMatch(body, /data-original=/);
  assert.doesNotMatch(body, /data-tilda/i);
  assert.doesNotMatch(body, /(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b)/);
  assert.doesNotMatch(body, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(body, /id="shynli-zero-runtime-stub"/);
  assert.doesNotMatch(body, /id="shynli-menu-widgeticons-runtime-stub"/);
  assert.doesNotMatch(body, /t_menuWidgets/);
});

test("serves the move-in move-out main route as the clean hand-coded page", async () => {
  const response = await fetch(`${BASE_URL}/services/move-in-move-out-cleaning`);
  const body = await response.text();
  const tildaMarkers = /(?:tild|tilda|data-tilda|allrecords|\bt-rec\b|\bt396\b|\btn-atom\b|\bt-body\b|\bt-menu\b|\bt-btn\b)/i;

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.equal(response.headers.get("x-robots-tag"), null);
  assert.match(body, /Cleaning for Moving In or Moving Out/i);
  assert.match(body, /class="[^"]*\bmove-page\b[^"]*"/);
  assert.match(body, /<meta name="robots" content="index,follow" \/>/);
  assert.match(
    body,
    /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/services\/move-in-move-out-cleaning"\s*\/?>/
  );
  assert.match(body, /\/images\/shynli-move-cleaning-hero\.png/);
  assert.match(body, /\/images\/shynli-icon-32\.png/);
  assert.doesNotMatch(body, tildaMarkers);
  assert.doesNotMatch(body, /callrail|calltrk|swap\.js|shynli-tracking|googletagmanager|Google Tag Manager/i);
  assert.doesNotMatch(body, /id="shynli-home-page-runtime"/);
  assert.doesNotMatch(body, /id="shynli-zero-runtime-stub"/);
});

test("serves the regular-cleaning ads duplicate as an indexable sitemap route", async () => {
  const response = await fetch(`${BASE_URL}/services/regular-cleaning/ads/`);
  const body = await response.text();
  const sitemapResponse = await fetch(`${BASE_URL}/sitemap.xml`);
  const sitemapBody = await sitemapResponse.text();
  const robotsResponse = await fetch(`${BASE_URL}/robots.txt`);
  const robotsBody = await robotsResponse.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(body, /Recurring House Cleaning Services/i);
  assert.match(
    body,
    /<span style="color: rgb\(158, 68, 90\);">Recurring House Cleaning Service<\/span> Near You &mdash; From \$135 Weekly &middot; \$145 Bi-Weekly/
  );
  assert.doesNotMatch(body, /Keep your home consistently clean, calm, and comfortable with professional service/);
  assert.match(body, /Same cleaner each visit <span class="shynli-service-ads-benefits">&middot; No long-term contract &middot; Pay after we clean<\/span>/);
  assert.match(body, /Our regular house cleaning service includes weekly, bi-weekly, or monthly recurring visits/);
  assert.doesNotMatch(body, /shynli-service-ads-price-old/);
  assert.doesNotMatch(body, /&middot; Same-Day Available &middot; Pay After Done/);
  assert.doesNotMatch(body, /Offer ends in/);
  assert.doesNotMatch(body, /data-shynli-ads-countdown/);
  assert.match(body, /GET FREE QUOTE/);
  assert.doesNotMatch(body, /id="shynli-ads-countdown-runtime"/);
  assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.match(body, /id="shynli-home-page-runtime"/);
  assert.match(body, /id="shynli-ads-lead-popup-runtime"/);
  assert.match(body, /data-shynli-ads-lead-popup/);
  assert.match(body, /What service do you need\?/);
  assert.match(body, /Regular Cleaning/);
  assert.match(body, /Deep Cleaning/);
  assert.match(body, /POPUP_DELAY_MS = 5000/);
  assert.match(body, /\/api\/quote\/submit/);
  assert.doesNotMatch(body, /<meta name="robots" content="noindex,nofollow" \/>/);
  assert.match(body, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/services\/regular-cleaning\/ads"\s*\/?>/);
  assert.equal(sitemapResponse.status, 200);
  assert.match(
    sitemapBody,
    /<loc>https:\/\/shynlicleaningservice\.com\/services\/regular-cleaning\/ads<\/loc>/
  );
  assert.equal(robotsResponse.status, 200);
  assert.doesNotMatch(robotsBody, /Disallow: \/services\/regular-cleaning\/ads\//);
});

test("serves the deep-cleaning ads duplicate as an indexable sitemap route", async () => {
  const response = await fetch(`${BASE_URL}/services/deep-cleaning/ads/`);
  const body = await response.text();
  const sitemapResponse = await fetch(`${BASE_URL}/sitemap.xml`);
  const sitemapBody = await sitemapResponse.text();
  const robotsResponse = await fetch(`${BASE_URL}/robots.txt`);
  const robotsBody = await robotsResponse.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(body, /Deep Cleaning Services/i);
  assert.match(body, /Deep House Cleaning Service in Chicagoland &mdash; Full Home Reset/);
  assert.match(body, /When your home needs a full reset and a &#39;like new&#39; feeling/);
  assert.match(body, /Deep house cleaning, also known as detailed cleaning or one-time deep cleaning/);
  assert.match(body, /From <span class="shynli-service-ads-price-new">\$195<\/span>/);
  assert.doesNotMatch(body, /shynli-service-ads-price-old/);
  assert.match(body, /&middot; Same-Day Available &middot; Pay After We Clean &middot; Fully Insured/);
  assert.doesNotMatch(body, /Offer ends in/);
  assert.doesNotMatch(body, /data-shynli-ads-countdown/);
  assert.match(body, /GET FREE QUOTE/);
  assert.doesNotMatch(body, /id="shynli-ads-countdown-runtime"/);
  assert.match(body, /Deep cleaning starts from \$195 for typical homes/);
  assert.match(body, /final price based on size and condition &mdash; <a href="\/quote-no-calculator">get instant quote<\/a>/);
  assert.match(body, /id="shynli-deep-cleaning-ads-layout-fix"/);
  assert.match(body, /id="deep-cleaning-addons-static"/);
  assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/);
  assert.match(body, /id="shynli-home-page-runtime"/);
  assert.match(body, /id="shynli-ads-lead-popup-runtime"/);
  assert.match(body, /data-shynli-ads-lead-popup/);
  assert.match(body, /What service do you need\?/);
  assert.match(body, /Regular Cleaning/);
  assert.match(body, /Deep Cleaning/);
  assert.match(body, /POPUP_DELAY_MS = 5000/);
  assert.match(body, /\/api\/quote\/submit/);
  assert.doesNotMatch(body, /<meta name="robots" content="noindex,nofollow" \/>/);
  assert.match(body, /<link rel="canonical" href="https:\/\/shynlicleaningservice\.com\/services\/deep-cleaning\/ads"\s*\/?>/);
  assert.equal(sitemapResponse.status, 200);
  assert.match(
    sitemapBody,
    /<loc>https:\/\/shynlicleaningservice\.com\/services\/deep-cleaning\/ads<\/loc>/
  );
  assert.equal(robotsResponse.status, 200);
  assert.doesNotMatch(robotsBody, /Disallow: \/services\/deep-cleaning\/ads\//);
});

test("serves all ads landing routes as indexable self-canonical pages without redirects", async () => {
  const routes = [
    "/ads",
    "/ads-v2",
    "/services/regular-cleaning/ads",
    "/services/regular-cleaning/ads-v2",
    "/services/deep-cleaning/ads",
    "/services/deep-cleaning/ads-v2",
    "/services/move-in-move-out-cleaning/ads",
    "/services/move-in-move-out-cleaning/ads-v2",
  ];
  const sitemapResponse = await fetch(`${BASE_URL}/sitemap.xml`);
  const sitemapBody = await sitemapResponse.text();
  const robotsResponse = await fetch(`${BASE_URL}/robots.txt`);
  const robotsBody = await robotsResponse.text();

  assert.equal(sitemapResponse.status, 200);
  assert.equal(robotsResponse.status, 200);

  for (const route of routes) {
    const response = await fetch(`${BASE_URL}${route}`, { redirect: "manual" });
    const body = await response.text();
    const absoluteUrl = `https://shynlicleaningservice.com${route}`;

    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get("location"), null, route);
    assert.doesNotMatch(response.headers.get("x-robots-tag") || "", /noindex/i, route);
    assert.doesNotMatch(body, /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i, route);
    assert.doesNotMatch(body, /<!--\s*\/?noindex\s*-->/i, route);
    assert.match(
      body,
      new RegExp(`<link rel="canonical" href="${escapeRegExp(absoluteUrl)}"\\s*/?>`),
      route
    );
    assert.match(
      sitemapBody,
      new RegExp(`<loc>${escapeRegExp(absoluteUrl)}</loc>`),
      route
    );
    assert.doesNotMatch(
      robotsBody,
      new RegExp(`Disallow:\\s*${escapeRegExp(route)}(?:/|\\s|$)`),
      route
    );
  }
});

test("serves ads v2 no-calculator variants as indexable routes", async () => {
  const routes = [
    "/ads-v2",
    "/service-areas-v2",
    "/pricing-v2",
    "/services/regular-cleaning/ads-v2",
    "/services/deep-cleaning/ads-v2",
    "/services/move-in-move-out-cleaning/ads-v2",
  ];
  const sitemapResponse = await fetch(`${BASE_URL}/sitemap.xml`);
  const sitemapBody = await sitemapResponse.text();

  for (const route of routes) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(body, /class="shynli-anchor-pricing"/, route);
    assert.match(body, /Most homes &mdash; final price after free quote/, route);
    assert.match(body, /Free quote in 60 seconds &mdash; no obligation/, route);
    assert.match(body, /id="shynli-form-attribution-runtime"/, route);
    assert.doesNotMatch(body, /id="cleaningCalculator"/, route);
    assert.doesNotMatch(body, /<meta name="robots" content="noindex,nofollow" \/>/, route);
    assert.match(sitemapBody, new RegExp(`<loc>https://shynlicleaningservice\\.com${route}</loc>`), route);
  }

  const pricingResponse = await fetch(`${BASE_URL}/pricing`);
  const pricingBody = await pricingResponse.text();
  assert.match(pricingBody, /Prefer a quick quote instead\? Get a free quote/);
  assert.match(pricingBody, /href="\/pricing-v2"/);
});

test("points ads page quote CTAs to the no-calculator form", async () => {
  const routes = [
    "/ads",
    "/ads-v2",
    "/services/regular-cleaning/ads",
    "/services/regular-cleaning/ads-v2",
    "/services/deep-cleaning/ads",
    "/services/deep-cleaning/ads-v2",
    "/services/move-in-move-out-cleaning/ads",
    "/services/move-in-move-out-cleaning/ads-v2",
  ];

  for (const route of routes) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(body, /href="\/quote-no-calculator"/, route);
    assert.doesNotMatch(body, /href="\/quote"/, route);
  }
});

test("serves all service page pilots without zero/lazyload runtimes", async () => {
  const serviceRoutes = [
    ["/services/regular-cleaning", /Recurring House Cleaning Services/i],
    ["/services/deep-cleaning", /Deep Cleaning/i],
    ["/services/move-in-move-out-cleaning", /Move In|Move Out/i],
    ["/services/airbnb-cleaning", /Airbnb Cleaning/i],
    ["/services/commercial-cleaning", /Commercial Cleaning/i],
    ["/services/post-construction-cleaning", /Post-Construction Cleaning|Post Construction Cleaning/i],
  ];
  const cleanHandCodedRoutes = new Set([
    "/services/regular-cleaning",
    "/services/move-in-move-out-cleaning",
    "/services/airbnb-cleaning",
    "/services/commercial-cleaning",
  ]);

  for (const [route, expectedTitle] of serviceRoutes) {
    const response = await fetch(`${BASE_URL}${route}`);
    const body = await response.text();

    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") || "", /text\/html/, route);
    assert.match(body, expectedTitle, route);
    assert.doesNotMatch(body, /js\/tilda-zero-1\.1\.min\.js/, route);
    assert.doesNotMatch(body, /js\/tilda-zero-scale-1\.0\.min\.js/, route);
    assert.doesNotMatch(body, /js\/lazyload-1\.3\.min\.export\.js/, route);
    assert.doesNotMatch(body, /data-original=/, route);
    if (cleanHandCodedRoutes.has(route)) {
      if (route === "/services/regular-cleaning") {
        assert.match(body, /<main class="clean-service-page">/, route);
      }
      if (route === "/services/commercial-cleaning") {
        assert.match(body, /class="commercial-clean-page"/, route);
      }
      assert.doesNotMatch(body, /id="shynli-home-page-runtime"/, route);
      assert.doesNotMatch(body, /id="shynli-zero-runtime-stub"/, route);
      assert.doesNotMatch(
        body,
        /(?:css|js)\/tilda|class=["'][^"']*(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-menu)|id="allrecords"|data-tilda-/i,
        route
      );
    } else {
      assert.match(body, /id="shynli-home-page-runtime"/, route);
      assert.match(body, /id="shynli-zero-runtime-stub"/, route);
    }
    assert.match(
      body,
      route === "/services/commercial-cleaning"
        ? /data-city-open/
        : route === "/services/airbnb-cleaning"
          ? /class="city-trigger"/
        : /href="(?:#city|\/services\/regular-cleaning#city)"/,
      route
    );
    assert.match(
      body,
      route === "/services/commercial-cleaning" || route === "/services/airbnb-cleaning"
        ? /href="\/become-a-cleaner"/
        : /href="#clean"/,
      route
    );
  }
});

test("serves a minimal oauth callback shell", async () => {
  const response = await fetch(`${BASE_URL}/oauth/callback?code=abc123`);
  const body = await response.text();
  const linkHeader = response.headers.get("link") || "";

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.equal(linkHeader, "");
  assert.match(body, /<title>Connecting to Shynli Cleaner<\/title>/);
  assert.match(body, /<meta name="robots" content="noindex,nofollow" \/>/);
  assert.match(body, /shynlicleaning:\/\/oauth\/callback\?code=/);
  assert.doesNotMatch(body, /tilda-grid-3\.0\.min\.css/);
  assert.doesNotMatch(body, /tilda-zero-1\.1\.min\.js/);
  assert.doesNotMatch(body, /tilda-zero-scale-1\.0\.min\.js/);
  assert.doesNotMatch(body, /tilda-events-1\.0\.min\.js/);
  assert.doesNotMatch(body, /Clean Home\. Clear Mind\./);
});

test("redirects /quote2 into the main quote flow", async () => {
  const response = await fetch(`${BASE_URL}/quote2`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/quote");
});

test("redirects trailing-slash public routes to the canonical URL", async () => {
  const response = await fetch(`${BASE_URL}/services/deep-cleaning/?utm_source=test`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/services/deep-cleaning?utm_source=test");
});

test("redirects mixed-case city URLs to lowercase canonicals", async () => {
  const response = await fetch(`${BASE_URL}/Naperville?utm_source=test`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/naperville?utm_source=test");
});

test("redirects legacy flat post-construction URLs to the service canonical", async () => {
  const response = await fetch(`${BASE_URL}/post-construction-cleaning?utm_source=test`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/services/post-construction-cleaning?utm_source=test");
});

test("redirects legacy flat blog article URLs to category-prefixed canonicals", async () => {
  const response = await fetch(`${BASE_URL}/blog/how-to-remove-hard-water-stains-from-shower-glass?utm_source=test`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get("location"),
    "/blog/bathroom/how-to-remove-hard-water-stains-from-shower-glass?utm_source=test"
  );
});

test("redirects the /%D0%B4%D0%B5%D0%B9%D1%81%D1%82%D0%B2%D1%83%D0%B9 smoke path into the quote flow", async () => {
  const response = await fetch(`${BASE_URL}/%D0%B4%D0%B5%D0%B9%D1%81%D1%82%D0%B2%D1%83%D0%B9`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/quote");
});

test("serves the 404 page without uppercase city links", async () => {
  const response = await fetch(`${BASE_URL}/definitely-missing-page`);
  const body = await response.text();

  assert.equal(response.status, 404);
  assert.doesNotMatch(body, /href="\/Naperville"/);
  assert.doesNotMatch(body, /href="\/Addison"/);
  assert.match(body, /href="\/naperville"/);
  assert.match(body, /href="\/addison"/);
});

test("keeps runtime diagnostics private at /__perf", async () => {
  const response = await fetch(`${BASE_URL}/__perf`);
  const body = await response.text();

  assert.ok([403, 404].includes(response.status));
  assert.notEqual(response.headers.get("content-type") || "", "application/json; charset=utf-8");
  assert.doesNotMatch(body, /"request"\s*:/);
  assert.doesNotMatch(body, /"event_loop"\s*:/);
});

test("requires an explicit token when /__perf is enabled", async () => {
  const started = await startServer({
    env: {
      ENABLE_PERF_ENDPOINT: "1",
      PERF_ENDPOINT_TOKEN: "perf-secret",
    },
  });

  try {
    const blockedResponse = await fetch(`${started.baseUrl}/__perf`);
    assert.ok([403, 404].includes(blockedResponse.status));

    const allowedResponse = await fetch(`${started.baseUrl}/__perf`, {
      headers: { "x-perf-token": "perf-secret" },
    });
    assert.equal(allowedResponse.status, 200);

    const payload = await allowedResponse.json();
    assert.ok(payload.request);
    assert.ok(payload.event_loop);
  } finally {
    await stopServer(started.child);
  }
});

test("exposes startup readiness status", async () => {
  const response = await fetch(`${BASE_URL}/__ready`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, "warn");
  assert.equal("issueCodes" in payload, false);
  assert.equal("blockingIssueCodes" in payload, false);
  assert.equal("warningIssueCodes" in payload, false);
});

test("gates readiness when blocking startup integrity issues are present", async () => {
  const started = await startServer({
    env: {
      STARTUP_ENV_MODE: "gate",
      QUOTE_SIGNING_SECRET: "quote-secret",
    },
  });

  try {
    const response = await fetch(`${started.baseUrl}/__ready`);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.ok, false);
    assert.equal(payload.mode, "gate");
    assert.equal("issueCodes" in payload, false);
    assert.equal("blockingIssueCodes" in payload, false);
    assert.equal("warningIssueCodes" in payload, false);
  } finally {
    await stopServer(started.child);
  }
});

test("fails startup when fail mode sees blocking integrity issues", async () => {
  await assert.rejects(
    () =>
      startServer({
        env: {
          STARTUP_ENV_MODE: "fail",
          QUOTE_SIGNING_SECRET: "quote-secret",
        },
      }),
    /Server (wrote to stderr before ready|exited before ready)/
  );
});

test("returns a graceful 503 when Stripe is not configured", async () => {
  const response = await fetch(`${BASE_URL}/api/stripe/checkout-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: 10 }),
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.match(body.error, /Stripe is not configured/i);
});

test("serves the configured 404 page for an unknown route", async () => {
  const response = await fetch(`${BASE_URL}/definitely-missing-route`);
  const body = await response.text();

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") || "", /text\/html|text\/plain/);
  assert.ok(body.length > 0);
});

test("injects quote metadata, shared icons, and GTM into the quote page", async () => {
  const response = await fetch(`${BASE_URL}/quote`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(
    body,
    /<meta name="description" content="Request a flat-rate cleaning quote from Shynli Cleaning in Chicagoland\." \/>/
  );
  assert.match(body, /<link rel="icon" href="\/images\/tild3636-3965-4134-a432-323337623835__insta_32\.png" type="image\/png" \/>/);
  assert.match(body, /<link rel="apple-touch-icon" href="\/images\/tild3636-3965-4134-a432-323337623835__insta_32\.png" \/>/);
  assert.match(body, /<link rel="manifest" href="\/site\.webmanifest" \/>/);
  assert.match(body, /id="shynli-tracking-bootstrap"/);
  assert.doesNotMatch(body, /<script[^>]+src="\/js\/shynli-tracking\.js"/);
  assert.match(body, /id="runtime-config"/);
  assert.match(body, /serviceAreaZipCodes/);
  assert.match(body, /"60563"/);
  assert.match(body, /googletagmanager\.com\/gtm\.js\?id='\+i\+dl|googletagmanager\.com\/gtm\.js\?id=/);
  assert.match(body, /googletagmanager\.com\/ns\.html\?id=GTM-5P88N7LD/);
  assert.doesNotMatch(body, /googletagmanager\.com\/gtag\/js\?id=/);
  assert.doesNotMatch(body, /google-analytics\.com\/analytics\.js/);
});

test("serves root fallback icon assets", async () => {
  const [faviconResponse, appleTouchResponse] = await Promise.all([
    fetch(`${BASE_URL}/favicon.ico`),
    fetch(`${BASE_URL}/apple-touch-icon.png`),
  ]);

  assert.equal(faviconResponse.status, 200);
  assert.match(faviconResponse.headers.get("content-type") || "", /image\/x-icon|image\/png/);
  assert.equal(appleTouchResponse.status, 200);
  assert.match(appleTouchResponse.headers.get("content-type") || "", /image\/png/);
});

test("serves the shared web manifest", async () => {
  const response = await fetch(`${BASE_URL}/site.webmanifest`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/manifest\+json/);
  assert.equal(body.name, "Shynli Cleaning");
  assert.equal(body.icons[0].src, "/images/tild3636-3965-4134-a432-323337623835__insta_32.png");
});

test("serves the Tilda phone mask asset for public form pages", async () => {
  const response = await fetch(`${BASE_URL}/js/tilda-phone-mask-1.1.min.js`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /javascript|text\/plain/);
  assert.match(body, /t_form_phonemask_load/);
});

test("emits FAQ and Service structured data on matching page types", async () => {
  const faqResponse = await fetch(`${BASE_URL}/faq`);
  const faqBody = await faqResponse.text();
  assert.equal(faqResponse.status, 200);
  assert.match(faqBody, /"@type":"FAQPage"/);
  assert.match(faqBody, /"How is pricing calculated\?"/);

  const serviceResponse = await fetch(`${BASE_URL}/services/deep-cleaning`);
  const serviceBody = await serviceResponse.text();
  assert.equal(serviceResponse.status, 200);
  assert.match(serviceBody, /"@type":"Service"/);
  assert.match(serviceBody, /"name":"Deep Cleaning"/);
});
