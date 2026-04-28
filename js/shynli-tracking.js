/*!
 * Shynli Tracking Library
 * Comprehensive Google Ads + GA4 conversion tracking with Enhanced Conversions
 * support, gclid/UTM persistence, and SHA-256 client-side hashing.
 *
 * Version: 1.0.0
 * Load location: <head>, BEFORE the GTM snippet, on every page.
 *
 * Public API (window.shynliTracking):
 *   - pushEvent(event, userFields?)  : push event to dataLayer with attribution + optional Enhanced Conversions user_data
 *   - captureAttribution()           : capture gclid/UTM from URL into cookie (auto-runs on load)
 *   - getAttribution()               : read attribution cookie
 *   - buildUserData(fields)          : build hashed user_data object (returns Promise)
 *   - generateEventId()              : unique event_id string
 */
(function () {
  "use strict";

  var ns = (window.shynliTracking = window.shynliTracking || {});

  // Ensure dataLayer exists immediately (before GTM may overwrite)
  window.dataLayer = window.dataLayer || [];

  // ===================================================================
  // Attribution capture: gclid, gbraid, wbraid, UTMs
  // ===================================================================

  var ATTRIBUTION_KEYS = [
    "gclid",
    "gbraid",
    "wbraid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ];
  var ATTRIBUTION_COOKIE = "shynli_attribution";
  var ATTRIBUTION_TTL_DAYS = 90;

  function getQueryParam(name) {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get(name) || null;
    } catch (e) {
      return null;
    }
  }

  function setCookie(name, value, days) {
    try {
      var expires = "";
      if (days) {
        var d = new Date();
        d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
        expires = "; expires=" + d.toUTCString();
      }
      document.cookie =
        name +
        "=" +
        encodeURIComponent(value) +
        expires +
        "; path=/; SameSite=Lax; Secure";
    } catch (e) {}
  }

  function getCookie(name) {
    try {
      var prefix = name + "=";
      var parts = document.cookie ? document.cookie.split(";") : [];
      for (var i = 0; i < parts.length; i++) {
        var c = parts[i].replace(/^\s+/, "");
        if (c.indexOf(prefix) === 0) {
          return decodeURIComponent(c.substring(prefix.length));
        }
      }
    } catch (e) {}
    return null;
  }

  function captureAttribution() {
    var captured = {};
    var found = false;
    for (var i = 0; i < ATTRIBUTION_KEYS.length; i++) {
      var key = ATTRIBUTION_KEYS[i];
      var val = getQueryParam(key);
      if (val) {
        captured[key] = val;
        found = true;
      }
    }
    if (found) {
      // Last-touch attribution: overwrite cookie when new params present
      try {
        setCookie(ATTRIBUTION_COOKIE, JSON.stringify(captured), ATTRIBUTION_TTL_DAYS);
      } catch (e) {}
    }
  }

  function getAttribution() {
    try {
      var raw = getCookie(ATTRIBUTION_COOKIE);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch (e) {}
    return {};
  }

  // ===================================================================
  // SHA-256 hashing for Enhanced Conversions
  // ===================================================================

  function sha256Hex(str) {
    if (!str) return Promise.resolve("");
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder === "undefined") {
      // Older browser without SubtleCrypto. Hashing unavailable. Fail silently.
      return Promise.resolve("");
    }
    try {
      var data = new TextEncoder().encode(String(str));
      return window.crypto.subtle
        .digest("SHA-256", data)
        .then(function (buffer) {
          var bytes = new Uint8Array(buffer);
          var hex = "";
          for (var i = 0; i < bytes.length; i++) {
            var h = bytes[i].toString(16);
            if (h.length === 1) h = "0" + h;
            hex += h;
          }
          return hex;
        })
        .catch(function () {
          return "";
        });
    } catch (e) {
      return Promise.resolve("");
    }
  }

  // ===================================================================
  // Normalization (must precede hashing per Google Ads EC spec)
  // ===================================================================

  function normalizeEmail(email) {
    if (!email) return "";
    return String(email).trim().toLowerCase();
  }

  function normalizePhone(phone) {
    if (!phone) return "";
    var cleaned = String(phone).replace(/[^\d+]/g, "");
    if (cleaned.charAt(0) === "+") return cleaned;
    if (/^\d{10}$/.test(cleaned)) return "+1" + cleaned;
    if (/^1\d{10}$/.test(cleaned)) return "+" + cleaned;
    return cleaned ? "+" + cleaned : "";
  }

  function normalizeName(name) {
    if (!name) return "";
    var s = String(name).trim().toLowerCase();
    // Strip non-letter, non-whitespace characters (keeps Unicode letters)
    try {
      s = s.replace(/[^\p{L}\s]/gu, "");
    } catch (e) {
      // Fallback for environments without Unicode property escapes
      s = s.replace(/[^a-zà-ÿ\s]/gi, "");
    }
    return s.replace(/\s+/g, " ").trim();
  }

  function normalizeAddress(addr) {
    if (!addr) return "";
    return String(addr).trim().toLowerCase().replace(/\s+/g, " ");
  }

  function normalizePostalCode(zip) {
    if (!zip) return "";
    return String(zip).trim().toLowerCase();
  }

  // ===================================================================
  // Build Enhanced Conversions user_data (hashed)
  // ===================================================================

  function buildUserData(fields) {
    fields = fields || {};

    // Country is NOT hashed; uppercase 2-letter
    var country = fields.country ? String(fields.country).trim().toUpperCase().slice(0, 2) : "";

    // Split fullName if first/last not provided
    var firstName = fields.firstName || "";
    var lastName = fields.lastName || "";
    if (!firstName && !lastName && fields.fullName) {
      var parts = String(fields.fullName).trim().split(/\s+/);
      firstName = parts.shift() || "";
      lastName = parts.join(" ");
    }

    var hashJobs = [
      sha256Hex(normalizeEmail(fields.email)),
      sha256Hex(normalizePhone(fields.phone)),
      sha256Hex(normalizeName(firstName)),
      sha256Hex(normalizeName(lastName)),
      sha256Hex(normalizeAddress(fields.street)),
      sha256Hex(normalizeAddress(fields.city)),
      sha256Hex(normalizeAddress(fields.region)),
      sha256Hex(normalizePostalCode(fields.postalCode)),
    ];

    return Promise.all(hashJobs)
      .then(function (h) {
        var ud = {};
        if (h[0]) ud.sha256_email_address = h[0];
        if (h[1]) ud.sha256_phone_number = h[1];

        var addr = {};
        if (h[2]) addr.sha256_first_name = h[2];
        if (h[3]) addr.sha256_last_name = h[3];
        if (h[4]) addr.sha256_street = h[4];
        if (h[5]) addr.sha256_city = h[5];
        if (h[6]) addr.sha256_region = h[6];
        if (h[7]) addr.sha256_postal_code = h[7];
        if (country) addr.country = country;

        if (Object.keys(addr).length > 0) ud.address = addr;
        return ud;
      })
      .catch(function () {
        return {};
      });
  }

  // ===================================================================
  // Event ID for deduplication
  // ===================================================================

  function generateEventId() {
    var ts = Date.now().toString(36);
    var rnd = Math.floor(Math.random() * 1e9).toString(36);
    return "evt_" + ts + "_" + rnd;
  }

  // ===================================================================
  // Push event to dataLayer
  // ===================================================================

  function buildBasePayload(eventObj) {
    var p = {};
    if (eventObj && typeof eventObj === "object") {
      for (var k in eventObj) {
        if (Object.prototype.hasOwnProperty.call(eventObj, k)) {
          p[k] = eventObj[k];
        }
      }
    }
    if (!p.event_id) p.event_id = generateEventId();
    if (!p.page_path) p.page_path = window.location.pathname;
    if (!p.page_url) p.page_url = window.location.href;
    if (!p.page_title) p.page_title = document.title || "";

    var attr = getAttribution();
    for (var i = 0; i < ATTRIBUTION_KEYS.length; i++) {
      var key = ATTRIBUTION_KEYS[i];
      if (attr[key]) p[key] = attr[key];
    }
    return p;
  }

  function pushEvent(eventObj, userFields) {
    var payload = buildBasePayload(eventObj);

    if (!userFields) {
      window.dataLayer.push(payload);
      return Promise.resolve(payload);
    }

    return buildUserData(userFields)
      .then(function (ud) {
        if (ud && Object.keys(ud).length > 0) payload.user_data = ud;
        window.dataLayer.push(payload);
        return payload;
      })
      .catch(function () {
        window.dataLayer.push(payload);
        return payload;
      });
  }

  // ===================================================================
  // Auto-attached phone call click tracking
  // ===================================================================

  function attachCallClickListener() {
    document.addEventListener(
      "click",
      function (e) {
        var node = e.target;
        while (node && node !== document) {
          if (
            node.tagName === "A" &&
            typeof node.href === "string" &&
            node.href.toLowerCase().indexOf("tel:") === 0
          ) {
            pushEvent({
              event: "lead_call_click_website",
              value: 25,
              currency: "USD",
              phone_clicked: node.href.replace(/^tel:/i, ""),
              click_text: (node.textContent || "").trim().slice(0, 100),
              click_location: window.location.pathname,
            });
            return;
          }
          node = node.parentNode;
        }
      },
      true
    );
  }

  // ===================================================================
  // Public API exposure
  // ===================================================================

  ns.captureAttribution = captureAttribution;
  ns.getAttribution = getAttribution;
  ns.pushEvent = pushEvent;
  ns.buildUserData = buildUserData;
  ns.generateEventId = generateEventId;

  // ===================================================================
  // Auto-init
  // ===================================================================

  function init() {
    captureAttribution();
    attachCallClickListener();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
