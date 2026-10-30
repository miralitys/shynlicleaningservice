"use strict";

const { loadLeadConnectorConfig } = require("../lib/leadconnector");
const { FIELD_NAMES, fieldDefinitions, fieldKey } = require("../lib/lead-attribution-fields");

async function setup({ apply = false, env = process.env, fetchImpl = fetch } = {}) {
  const config = loadLeadConnectorConfig(env);
  if (!config.configured) throw new Error("GHL is not configured");
  const headers = { Authorization: `Bearer ${config.apiKey}`, Version: config.apiVersion, "Content-Type": "application/json" };
  const path = `${config.apiBaseUrl}/locations/${encodeURIComponent(config.locationId)}/customFields`;
  async function request(url, options) {
    const res = await fetchImpl(url, { ...options, headers, signal: AbortSignal.timeout(15000) });
    const body = await res.json();
    if (!res.ok) throw new Error(`GHL custom fields request failed: ${res.status}`);
    return body;
  }
  const existing = await request(path, { method: "GET" });
  const location = await request(`${config.apiBaseUrl}/locations/${encodeURIComponent(config.locationId)}`, { method: "GET" });
  if (!/shynli|shiny/i.test(location.location?.name || "")) throw new Error("Refusing to configure attribution outside the Shynli location");
  const fields = existing.customFields || [];
  const normalize = value => String(value || "").replace(/^contact\./, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const missing = FIELD_NAMES.filter(name => !fields.some(field => normalize(field.fieldKey || field.name) === normalize(fieldKey(name))));
  const created = [];
  if (apply) for (const name of missing) {
    const definition = fieldDefinitions[FIELD_NAMES.indexOf(name)];
    const result = await request(path, { method: "POST", body: JSON.stringify(definition) });
    if (!result.customField?.id) throw new Error(`No custom field ID returned for ${name}`);
    created.push(name);
  }
  return { locationId: config.locationId, required: FIELD_NAMES.length, missing, created, applied: apply };
}
if (require.main === module) setup({ apply: process.argv.includes("--apply") }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { setup };
