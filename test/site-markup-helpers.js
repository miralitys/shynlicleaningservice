"use strict";

const assert = require("node:assert/strict");

function documentMarkup(html) {
  return String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
}

function assertNoTildaRuntime(html, message) {
  assert.doesNotMatch(html, /(?:src|href)=["'][^"']*(?:css|js)\/tilda[^"']*/i, message);
  assert.doesNotMatch(documentMarkup(html), /(?:class=["'][^"']*(?:\bt-rec\b|\bt396\b|\btn-elem\b|\btn-atom\b|\bt-menu\b|\bt-body\b|\bt-btn\b)|id=["']allrecords["']|data-tilda-)/i, message);
}

function assertSharedNavigation(html, message) {
  assert.match(html, /id="shynli-site-header"/, message);
  assert.match(html, /<button\b[^>]*data-city-modal-open/, message);
  assert.match(html, /class="shynli-site-city-modal"[^>]*data-city-modal/, message);
  assert.match(html, /href="\/addison"/, message);
  assert.match(html, /href="\/yorkville"/, message);
  assert.match(html, /href="\/quote"/, message);
  assert.match(html, /href="\/faq#clean">Become a Cleaner<\/a>/, message);
  assert.match(html, /href="tel:\+16308127077"/, message);
}

function jsonLdNodes(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap(match => {
      const value = JSON.parse(match[1]);
      return Array.isArray(value) ? value : value["@graph"] || [value];
    });
}

module.exports = { documentMarkup, assertNoTildaRuntime, assertSharedNavigation, jsonLdNodes };
