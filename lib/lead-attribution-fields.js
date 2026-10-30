"use strict";
const { attributionHelpers: h } = require("./lead-attribution");
const FIELD_NAMES = [...h.keys, "lead_source_channel", "lead_source_channel_last", "referrer_first", "referrer_last", "landing_page", "submission_page", "form_type", "attribution_first", "attribution_last"];
const LAST_FIELDS = new Set(["lead_source_channel_last", "referrer_last", "submission_page", "form_type", "attribution_last"]);
const fieldKey = name => `shynli_${name}`;
const fieldDefinitions = FIELD_NAMES.map(name => ({ name: `Shynli ${name}`, dataType: /attribution_/.test(name) ? "LARGE_TEXT" : "TEXT", model: "contact" }));
function fieldValues(attr) {
  const first = h.normalize(attr.first || attr);
  const last = h.normalize(attr.last || first);
  return { ...Object.fromEntries(h.keys.map(key => [key, first[key] || ""])),
    lead_source_channel: first.lead_source_channel, lead_source_channel_last: last.lead_source_channel,
    referrer_first: first.referrer, referrer_last: last.referrer, landing_page: first.landing_page,
    submission_page: h.page(attr.submission_page), form_type: h.text(attr.form_type, 32),
    attribution_first: JSON.stringify(first), attribution_last: JSON.stringify(last) };
}
module.exports = { FIELD_NAMES, LAST_FIELDS, fieldKey, fieldDefinitions, fieldValues };
