"use strict";

// Serialized into the existing tracking bootstrap, so capture runs before any form interaction.
function createAttributionRuntime(w, d) {
  var keys = ["gclid", "gbraid", "wbraid", "fbclid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  function text(value, limit) {
    return typeof value === "string" ? Array.from(value.replace(/[\u0000-\u001f\u007f\ud800-\udfff]/gu, " ").trim()).slice(0, limit || 160).join("") : "";
  }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function domain(value) {
    var raw = text(value, 500);
    if (!raw) return "";
    try {
      var url = new URL(raw.indexOf("://") < 0 ? "https://" + raw : raw);
      return /^https?:$/.test(url.protocol) ? url.hostname.toLowerCase().replace(/^www\./, "") : "";
    } catch (_) { return ""; }
  }
  function page(value) {
    try {
      var url = new URL(text(value, 1000), "https://shynlicleaningservice.com");
      return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : "";
    } catch (_) { return ""; }
  }
  function matches(value, host) { return value === host || value.slice(-host.length - 1) === "." + host; }
  function channel(touch) {
    touch = object(touch);
    if (touch.gclid || touch.gbraid || touch.wbraid) return "Google Ads";
    var source = text(touch.utm_source).toLowerCase();
    var ref = domain(touch.referrer);
    var candidates = [source, domain(source), ref];
    var ai = [["chatgpt.com", "ChatGPT"], ["chat.openai.com", "ChatGPT"], ["perplexity.ai", "Perplexity"], ["gemini.google.com", "Gemini"], ["copilot.microsoft.com", "Copilot"], ["copilot.com", "Copilot"]];
    for (var i = 0; i < ai.length; i++) {
      if (candidates.some(function(v) { return matches(v, ai[i][0]) || v === ai[i][1].toLowerCase(); })) return "ИИ-поиск (" + ai[i][1] + ")";
    }
    if (source === "gbp" || source === "google_business") return "Google Business Profile";
    if (touch.fbclid || candidates.some(function(v) { return /^(facebook|instagram|meta)$/.test(v) || matches(v, "facebook.com") || matches(v, "instagram.com"); })) return "Meta";
    var platforms = [["nextdoor", "Nextdoor"], ["thumbtack", "Thumbtack"], ["yelp", "Yelp"]];
    for (var j = 0; j < platforms.length; j++) {
      if (candidates.some(function(v) { return v === platforms[j][0] || matches(v, platforms[j][0] + ".com"); })) return platforms[j][1];
    }
    if (candidates.some(function(v) { return /^(bing|yahoo|duckduckgo)$/.test(v) || matches(v, "bing.com") || matches(v, "yahoo.com") || matches(v, "duckduckgo.com"); })) return "Другой поиск";
    if (candidates.some(function(v) { return v === "google" || /^google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(v); })) return "Google (органика или карты/GBP)";
    return text(touch.utm_source) || ref || "Прямой заход";
  }
  function normalize(touch) {
    touch = object(touch);
    var result = {};
    keys.forEach(function(k) { var v = text(touch[k], k === "utm_campaign" ? 240 : 160); if (v) result[k] = v; });
    result.referrer = domain(touch.referrer);
    result.landing_page = touch.landing_page ? page(touch.landing_page) : "";
    result.lead_source_channel = channel(result);
    // Keep each encoded cookie below browser limits, even for very long Unicode campaigns.
    while (encodeURIComponent(JSON.stringify(result)).length > 3500) {
      var longest = keys.concat(["landing_page"]).filter(function(k) { return (result[k] || "").length > 32; })
        .sort(function(a,b) { return encodeURIComponent(result[b]).length - encodeURIComponent(result[a]).length; })[0];
      if (!longest) break;
      result[longest] = Array.from(result[longest]).slice(0, Math.floor(Array.from(result[longest]).length * 0.75)).join("");
      result.lead_source_channel = channel(result);
    }
    return result;
  }
  function cookie(name) {
    try {
      var parts = (d.cookie || "").split(";");
      for (var i = 0; i < parts.length; i++) {
        var item = parts[i].trim();
        if (item.indexOf(name + "=") === 0) return decodeURIComponent(item.slice(name.length + 1));
      }
    } catch (_) {}
    return "";
  }
  function read(name) { try { return object(JSON.parse(cookie(name))); } catch (_) { return {}; } }
  function write(name, value) {
    try { d.cookie = name + "=" + encodeURIComponent(value) + "; Max-Age=31536000; path=/; SameSite=Lax; Secure"; } catch (_) {}
  }
  var captured = false;
  var memoryFirst = null;
  var memoryLast = null;
  function capture() {
    if (!w || !d) return {};
    if (captured) return getFirst();
    captured = true;
    var now = {};
    try {
      var params = new URLSearchParams(w.location.search);
      keys.forEach(function(k) { var v = params.get(k); if (v) now[k] = v; });
    } catch (_) {}
    var external = domain(d.referrer);
    if (external === domain(w.location.origin)) external = "";
    now.referrer = external;
    now.landing_page = page(w.location.href);
    var old = read("shynli_attribution");
    var hasOld = Object.keys(old).length > 0;
    memoryFirst = normalize(hasOld ? old : now);
    if (!memoryFirst.landing_page) memoryFirst.landing_page = page(cookie("shynli_landing_page") || now.landing_page);
    memoryLast = normalize(read("shynli_attribution_last"));
    var isInternal = domain(d.referrer) === domain(w.location.origin);
    if (!hasOld || external || keys.some(function(k) { return !!now[k]; }) || !isInternal) memoryLast = normalize(now);
    if (!memoryLast.landing_page) memoryLast = memoryFirst;
    write("shynli_attribution", JSON.stringify(memoryFirst));
    write("shynli_attribution_last", JSON.stringify(memoryLast));
    if (!cookie("shynli_landing_page")) write("shynli_landing_page", memoryFirst.landing_page);
    return memoryFirst;
  }
  function getFirst() { return normalize(memoryFirst || read("shynli_attribution")); }
  function getLast() {
    var stored = memoryLast || read("shynli_attribution_last");
    return normalize(Object.keys(stored).length ? stored : getFirst());
  }
  function fields(formType) {
    capture();
    var first = getFirst();
    var last = getLast();
    var result = Object.assign({}, first, {
      attribution_first: JSON.stringify(first), attribution_last: JSON.stringify(last),
      referrer_first: first.referrer, referrer_last: last.referrer,
      lead_source_channel_last: last.lead_source_channel,
      submission_page: page(w.location.href),
      form_type: /^(quote|calculator|callback|booking)$/.test(formType) ? formType : "quote"
    });
    keys.forEach(function(k) { if (!result[k]) result[k] = ""; });
    return result;
  }
  return { keys: keys, text: text, domain: domain, page: page, channel: channel, normalize: normalize, capture: capture, getFirst: getFirst, getLast: getLast, fields: fields };
}

const helpers = createAttributionRuntime(null, null);
function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
function extractLeadAttribution(body = {}, cookies = {}, fallbackPage = "") {
  const nested = parseObject(body.attribution);
  const cookieFirst = parseObject(cookies.shynli_attribution);
  const cookieLast = parseObject(cookies.shynli_attribution_last);
  const suppliedFirst = parseObject(body.attribution_first || nested.first);
  const suppliedLast = parseObject(body.attribution_last || nested.last);
  // Cookies win over form snapshots, including intentional empty first-touch fields.
  const has = value => Object.keys(value).length > 0;
  const flat = { ...nested, ...Object.fromEntries(helpers.keys.map(k => [k, body[k] || nested[k] || ""])), referrer: body.referrer_first || body.referrer || nested.referrer };
  const first = helpers.normalize(has(cookieFirst) ? cookieFirst : has(suppliedFirst) ? suppliedFirst : flat);
  const last = helpers.normalize(has(cookieLast) ? cookieLast : has(suppliedLast) ? suppliedLast : first);
  first.landing_page ||= helpers.page(cookies.shynli_landing_page || body.landing_page || body.landingPage || nested.landing_page || fallbackPage);
  const requestType = String(body.requestType || body.calculatorData?.requestType || body.source || "");
  const formType = /call_me|callback|popup/i.test(requestType) ? "callback" : /^(quote|calculator|callback|booking)$/.test(body.form_type) ? body.form_type : "quote";
  return { version: 1, ...first, first, last, referrer_first: first.referrer, referrer_last: last.referrer,
    submission_page: helpers.page(body.submission_page || body.sourcePage || body.sourcePagePath || fallbackPage), form_type: formType };
}
function entryAttribution(entry = {}) {
  return entry.payloadForRetry?.leadAttribution || null;
}
function attributionText(attribution) {
  if (!attribution) return "";
  const first = attribution.first || attribution;
  const context = first.utm_source || first.referrer;
  return ["Attribution:", `Source: ${helpers.channel(first)}${context ? ` (${helpers.text(context)})` : ""}`,
    `Lead Source: ${helpers.text(attribution.form_type) || "quote"}`, `Landing page: ${helpers.page(first.landing_page) || "-"}`].join("\n");
}
module.exports = { createAttributionRuntime, extractLeadAttribution, entryAttribution, attributionText, attributionHelpers: helpers };
