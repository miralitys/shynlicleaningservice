"use strict";

const { createAttributionRuntime } = require("../lead-attribution");

function trackingBootstrap(w, d, src, createRuntime, delays) {
  w.dataLayer = w.dataLayer || [];
  var ns = w.shynliTracking = w.shynliTracking || {};
  var attribution = createRuntime(w, d);
  ns.attributionRuntime = attribution;
  ns.captureAttribution = attribution.capture;
  ns.getAttribution = attribution.getFirst;
  ns.getLastAttribution = attribution.getLast;
  ns.getLandingPage = function() { return attribution.getFirst().landing_page; };
  ns.getSubmissionAttribution = function(type) {
    var fields = attribution.fields(type);
    return Object.assign({ attribution: Object.assign({}, attribution.getFirst(), { first: attribution.getFirst(), last: attribution.getLast() }) }, fields);
  };
  ns.generateEventId = function() { return "evt_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e9).toString(36); };
  ns.pushEvent = function(event) {
    var payload = Object.assign({}, attribution.fields(event && event.form_type), event || {});
    if (!payload.event_id) payload.event_id = ns.generateEventId();
    if (!payload.page_path) payload.page_path = w.location.pathname;
    if (!payload.page_url) payload.page_url = w.location.href;
    if (!payload.page_title) payload.page_title = d.title || "";
    w.dataLayer.push(payload);
    return w.Promise ? w.Promise.resolve(payload) : payload;
  };
  ns.buildUserData = ns.buildUserData || function() { return w.Promise ? w.Promise.resolve({}) : {}; };
  function telClick(e) {
    var node = e.target;
    while (node && node !== d) {
      if (node.tagName === "A" && typeof node.href === "string" && node.href.toLowerCase().indexOf("tel:") === 0) {
        ns.pushEvent({ event: "lead_call_click_website", value: 25, currency: "USD", phone_clicked: node.href.replace(/^tel:/i, ""), click_text: (node.textContent || "").trim().slice(0, 100), click_location: w.location.pathname });
        return;
      }
      node = node.parentNode;
    }
  }
  var loaded = false;
  function loadTracking() {
    if (loaded) return;
    loaded = true;
    var script = d.createElement("script");
    script.id = "shynli-tracking-script";
    script.src = src;
    script.defer = true;
    (d.head || d.documentElement).appendChild(script);
  }
  function idleLoad() {
    if ("requestIdleCallback" in w) w.requestIdleCallback(loadTracking, { timeout: delays.timeout });
    else loadTracking();
  }
  function scheduleLoad() { w.setTimeout(idleLoad, delays.idle); }
  function scheduleInteractionLoad() { w.setTimeout(idleLoad, delays.interaction); }
  ns._bootstrapDetach = function() { d.removeEventListener("click", telClick, true); };
  attribution.capture();
  d.addEventListener("click", telClick, true);
  if (d.readyState === "complete") scheduleLoad();
  else w.addEventListener("load", scheduleLoad, { once: true });
  ["click", "submit", "focusin"].forEach(function(name) { d.addEventListener(name, scheduleInteractionLoad, { once: true, capture: true }); });
}

function buildTrackingBootstrap(src, delays) {
  return `<script id="shynli-tracking-bootstrap">(${trackingBootstrap.toString()})(window,document,${JSON.stringify(src)},${createAttributionRuntime.toString()},${JSON.stringify(delays)});</script>`;
}
module.exports = { buildTrackingBootstrap };
