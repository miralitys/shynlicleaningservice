"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { createAttributionRuntime, extractLeadAttribution, attributionText } = require("../lib/lead-attribution");
const { FIELD_NAMES, fieldValues, fieldKey } = require("../lib/lead-attribution-fields");
const { createLeadConnectorClient } = require("../lib/leadconnector");
const { buildShynliTrackingHeadSnippet } = require("../lib/site/google-tag-manager");
const { renderLeadAttribution } = require("../lib/admin/pages/lead-attribution-ui");
const h = createAttributionRuntime(null, null);

test("source classification covers paid, AI, organic/GBP, other search, social and unknown sources", () => {
  const cases = [
    [{ gclid: "test", utm_source: "chatgpt.com" }, "Google Ads"],
    [{ gbraid: "test" }, "Google Ads"], [{ wbraid: "test" }, "Google Ads"],
    [{ utm_source: "chatgpt.com" }, "ИИ-поиск (ChatGPT)"],
    [{ referrer: "https://chat.openai.com/path" }, "ИИ-поиск (ChatGPT)"],
    [{ referrer: "perplexity.ai" }, "ИИ-поиск (Perplexity)"],
    [{ utm_source: "gemini.google.com" }, "ИИ-поиск (Gemini)"],
    [{ utm_source: "copilot" }, "ИИ-поиск (Copilot)"],
    [{ referrer: "www.google.com" }, "Google (органика или карты/GBP)"],
    [{ referrer: "google.co.uk" }, "Google (органика или карты/GBP)"],
    [{ referrer: "translate.google.com" }, "Google (органика или карты/GBP)"],
    [{ referrer: "maps.google.com" }, "Google (органика или карты/GBP)"],
    [{ utm_source: "gbp", referrer: "google.com" }, "Google Business Profile"],
    [{ utm_source: "google_business" }, "Google Business Profile"],
    [{ referrer: "bing.com" }, "Другой поиск"], [{ utm_source: "duckduckgo" }, "Другой поиск"],
    [{ fbclid: "test" }, "Meta"], [{ referrer: "l.instagram.com" }, "Meta"],
    [{ utm_source: "nextdoor" }, "Nextdoor"], [{ referrer: "thumbtack.com" }, "Thumbtack"],
    [{ referrer: "yelp.com" }, "Yelp"], [{ utm_source: "local-newsletter" }, "local-newsletter"],
    [{}, "Прямой заход"], [{ referrer: "google.com.evil.test" }, "google.com.evil.test"],
  ];
  for (const [input, expected] of cases) assert.equal(h.channel(input), expected, JSON.stringify(input));
});

function browser(url, referrer = "", jar = new Map()) {
  const events = [];
  const listeners = {};
  const location = new URL(url);
  const d = { title: "Shynli", referrer, readyState: "complete", addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener() {},
    createElement() { return {}; }, head: { appendChild() {} } };
  Object.defineProperty(d, "cookie", { configurable: true, get: () => [...jar].map(([k,v]) => `${k}=${v}`).join("; "), set: value => { const part = value.split(";")[0]; const i = part.indexOf("="); jar.set(part.slice(0,i), part.slice(i+1)); } });
  const w = { location, dataLayer: events, Promise, setTimeout() {}, addEventListener() {}, crypto: {}, };
  return { w, d, jar, events, listeners };
}

test("first touch is immutable, last touch changes without merging stale paid IDs, internal navigation is ignored", () => {
  const first = browser("https://shynlicleaningservice.com/?utm_source=chatgpt.com&utm_content=intro");
  const one = createAttributionRuntime(first.w, first.d); one.capture();
  assert.equal(one.getFirst().lead_source_channel, "ИИ-поиск (ChatGPT)");
  const second = browser("https://shynlicleaningservice.com/pricing?gclid=test", "https://google.com/search?q=private", first.jar);
  const two = createAttributionRuntime(second.w, second.d); two.capture();
  assert.equal(two.getFirst().utm_source, "chatgpt.com");
  assert.equal(two.getLast().lead_source_channel, "Google Ads");
  assert.equal(two.getFirst().gclid, undefined);
  const third = browser("https://shynlicleaningservice.com/quote?calculator=details", "https://shynlicleaningservice.com/pricing", first.jar);
  const three = createAttributionRuntime(third.w, third.d); three.capture();
  assert.equal(three.getLast().gclid, "test");
  assert.equal(three.getFirst().landing_page, "https://shynlicleaningservice.com/");
  const direct = browser("https://shynlicleaningservice.com/quote", "", first.jar);
  const four = createAttributionRuntime(direct.w, direct.d); four.capture();
  assert.equal(four.getLast().lead_source_channel, "Прямой заход");
  assert.equal(four.getLast().gclid, undefined);
  assert.equal(four.getFirst().utm_source, "chatgpt.com");
});

test("referrer is domain-only, landing/submission URLs have no query, direct first touch remains direct", () => {
  const state = browser("https://shynlicleaningservice.com/?email=private@example.test", "https://www.google.com/search?q=private");
  const runtime = createAttributionRuntime(state.w, state.d); runtime.capture();
  const fields = runtime.fields("callback");
  assert.equal(fields.referrer_first, "google.com");
  assert.equal(fields.form_type, "callback");
  assert.doesNotMatch(fields.landing_page + fields.submission_page, /\?|private/);
  const direct = browser("https://shynlicleaningservice.com/"); createAttributionRuntime(direct.w,direct.d).capture();
  const later = browser("https://shynlicleaningservice.com/?utm_source=yelp", "", direct.jar);
  const api = createAttributionRuntime(later.w,later.d); api.capture();
  assert.equal(api.getFirst().lead_source_channel, "Прямой заход");
  assert.equal(api.getLast().lead_source_channel, "Yelp");
});

test("oversized Unicode attribution fits cookies and blocked cookies retain capture in memory", () => {
  const params = new URLSearchParams(Object.fromEntries(h.keys.map(key => [key, "Ю😀".repeat(500)])));
  const state = browser("https://shynlicleaningservice.com/?" + params);
  const runtime = createAttributionRuntime(state.w, state.d);
  assert.doesNotThrow(() => runtime.capture());
  for (const value of state.jar.values()) assert.ok(value.length <= 3500);
  assert.doesNotThrow(() => h.normalize({ utm_source: "bad\ud800" }));
  const blocked = browser("https://shynlicleaningservice.com/?utm_source=chatgpt.com");
  Object.defineProperty(blocked.d, "cookie", { get: () => "", set: () => {} });
  const memory = createAttributionRuntime(blocked.w, blocked.d);
  assert.equal(memory.fields("quote").utm_source, "chatgpt.com");
  assert.equal(memory.fields("booking").lead_source_channel, "ИИ-поиск (ChatGPT)");
});

test("deferred tracking library reuses bootstrap capture and preserves events", () => {
  const state = browser("https://shynlicleaningservice.com/?utm_source=chatgpt.com");
  const context = vm.createContext({ window: state.w, document: state.d, URL, URLSearchParams, Date, Promise, TextEncoder });
  const script = buildShynliTrackingHeadSnippet().replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  vm.runInContext(script, context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../js/shynli-tracking.js"),"utf8"), context);
  const tracking = state.w.shynliTracking;
  tracking.pushEvent({ event: "lead_call_click_website" });
  assert.equal(tracking.getAttribution().utm_source, "chatgpt.com");
  assert.equal(state.events.at(-1).lead_source_channel, "ИИ-поиск (ChatGPT)");
  assert.equal(tracking.getSubmissionAttribution("booking").form_type, "booking");
});

test("server uses immutable cookie over conflicting hidden values and recomputes source", () => {
  const attr = extractLeadAttribution({ gclid: "new", lead_source_channel: "spoofed", referrer: "bad.test", form_type: "booking", submission_page: "https://shynlicleaningservice.com/quote?phone=private" }, {
    shynli_attribution: JSON.stringify({ utm_source: "chatgpt.com", landing_page: "https://shynlicleaningservice.com/" }),
    shynli_attribution_last: JSON.stringify({ gclid: "new", referrer: "google.com" })
  });
  assert.equal(attr.lead_source_channel, "ИИ-поиск (ChatGPT)");
  assert.equal(attr.last.lead_source_channel, "Google Ads");
  assert.equal(attr.gclid, undefined);
  assert.equal(extractLeadAttribution({form_type:"quote",requestType:"call_me"}).form_type, "quote");
  assert.equal(extractLeadAttribution({requestType:"call_me"}).form_type, "callback");
  assert.doesNotMatch(attr.submission_page, /private/);
  assert.match(attributionText(attr), /Lead Source: booking/);
  const escaped = renderLeadAttribution({payloadForRetry:{leadAttribution:{...attr,submission_page:'<img onerror=alert(1)>'}}}, value => String(value).replace(/</g,"&lt;"));
  assert.doesNotMatch(escaped, /<img/);
  const paid = renderLeadAttribution({payloadForRetry:{leadAttribution:extractLeadAttribution({gclid:"test"})}}, String);
  assert.match(paid, /gclid: test/);
  assert.doesNotMatch(paid, /Прямой заход/);
});

function response(body, status=200) { return {ok:status<300,status,headers:{get:()=>"application/json"},json:async()=>body}; }
test("GHL attribution sync writes only dedicated fields, preserves contact first touch, and leaves quote sync disabled", async () => {
  const updates=[]; const notes=[];
  const ids=Object.fromEntries(FIELD_NAMES.map(name=>[name,'id-'+name]));
  const old=fieldValues({first:{utm_source:"chatgpt.com"},last:{utm_source:"chatgpt.com"},form_type:"quote"});
  const client=createLeadConnectorClient({env:{GHL_API_KEY:"test",GHL_LOCATION_ID:"shynli-test",GHL_CREATE_OPPORTUNITY:"false"},fetch:async(url,opts)=>{
    if(String(url).includes("customFields")) return response({customFields:FIELD_NAMES.map(name=>({id:ids[name],name:fieldKey(name),objectType:"contact"}))});
    if(String(url).includes("/notes")){notes.push(JSON.parse(opts.body));return response({id:"note"},201);}
    if(opts.method==="PUT"){updates.push(JSON.parse(opts.body));return response({contact:{id:"test-contact"}});}
    if(String(url).includes("/contacts/test-contact")) return response({contact:{id:"test-contact",customFields:Object.entries(old).map(([key,value])=>({id:ids[key],value}))}});
    if(opts.method==="POST") return response({contact:{id:"test-contact"}},201);
    return response({contacts:[{id:"test-contact",phone:"+12025550142"}]});
  }});
  const result=await client.submitQuoteSubmission({contactData:{fullName:"TEST",phone:"2025550142"},calculatorData:{serviceType:"deep",totalPrice:397},leadAttribution:extractLeadAttribution({utm_source:"yelp",form_type:"callback"})});
  assert.equal(result.ok,true);
  assert.equal(result.attributionFieldsUpdated,true);
  assert.equal(updates.length,1);
  assert.deepEqual(Object.keys(updates[0]),["customFields"]);
  assert.ok(updates[0].customFields.every(field=>["lead_source_channel_last","referrer_last","submission_page","form_type","attribution_last"].some(name=>ids[name]===field.id)));
  assert.match(notes[0].body,/Attribution:/);
  assert.equal(result.opportunityCreated,false);
});

test("GHL retries field discovery after missing attribution fields without restarting the server", async () => {
  let ready = false;
  const client = createLeadConnectorClient({env:{GHL_API_KEY:"test",GHL_LOCATION_ID:"shynli-test",GHL_ENABLE_NOTES:"0",GHL_CREATE_OPPORTUNITY:"0"},fetch:async(url,opts)=>{
    if(String(url).includes("customFields")) return response({customFields:ready ? FIELD_NAMES.map(name=>({id:'id-'+name,name:fieldKey(name),objectType:"contact"})) : []});
    if(opts.method === "GET") return response({contact:{id:"test-contact",customFields:[]}});
    return response({contact:{id:"test-contact"}});
  }});
  const input={contactData:{fullName:"TEST",phone:"2025550142"},calculatorData:{serviceType:"deep",totalPrice:397},leadAttribution:extractLeadAttribution({utm_source:"chatgpt.com"})};
  const first=await client.submitQuoteSubmission(input);
  assert.equal(first.ok,true);
  assert.equal(first.attributionFieldsUpdated,false);
  assert.ok(first.warnings.includes("attribution_custom_fields_missing"));
  ready=true;
  const retry=await client.submitQuoteSubmission(input);
  assert.equal(retry.attributionFieldsUpdated,true);
  assert.deepEqual(retry.warnings,[]);
});
