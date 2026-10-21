"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { SERVICE_AREA_ZIP_MAP, isSupportedServiceAreaZip } = require("../lib/service-area-zips");
const { createFetchStub, startServer, stopServer } = require("./server-test-helpers");

const CITIES = [
  ["Shorewood", "/shorewood", ["60404", "60431", "60436"]],
  ["Channahon", "/channahon", ["60410"]],
  ["Joliet", "/joliet", ["60403", "60404", "60431", "60432", "60433", "60435", "60436"]],
  ["Minooka", "/minooka", ["60447"]],
  ["Big Rock", "/bigrock", ["60511"]],
  ["Crest Hill", "/cresthill", ["60403", "60435"]],
  ["Plano", "/plano", ["60545"]],
  ["Sandwich", "/sandwich", ["60548"]],
  ["Willow Springs", "/willowsprings", ["60480"]],
];
const NEW_ZIPS = [...new Set(CITIES.flatMap(([, , zips]) => zips))];

function createCityZipRuntime(html) {
  const script = html.match(/const zipForm = document\.querySelector\("\[data-zip-form\]"\);([\s\S]*?)(?=\n    \}\)\(\);)/);
  assert.ok(script, "The city ZIP form script is rendered");
  let submit;
  const input = { value: "", addEventListener() {} };
  const result = { className: "", innerHTML: "" };
  vm.runInNewContext(script[0], {
    document: {
      getElementById: () => input,
      querySelector: (selector) => selector === "[data-zip-form]"
        ? { addEventListener: (type, handler) => { if (type === "submit") submit = handler; } }
        : result,
    },
  });
  return (zip) => {
    input.value = zip;
    submit({ preventDefault() {} });
    return result;
  };
}

test("new city pages are localized, discoverable and indexable with the same ZIP coverage as the server", async () => {
  const app = await startServer();
  try {
    const sitemap = await (await fetch(`${app.baseUrl}/sitemap.xml`)).text();
    const overview = await (await fetch(`${app.baseUrl}/service-areas`)).text();
    for (const [city, route, zips] of CITIES) {
      const response = await fetch(`${app.baseUrl}${route}`);
      const html = await response.text();
      assert.equal(response.status, 200, route);
      assert.doesNotMatch(response.headers.get("x-robots-tag") || "", /noindex/i, route);
      assert.doesNotMatch(html, /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i, route);
      assert.ok(html.includes(`<title>House Cleaning Services in ${city}, IL | Shynli Cleaning</title>`), route);
      assert.ok(html.includes(`<link rel="canonical" href="https://shynlicleaningservice.com${route}">`), route);
      assert.ok(sitemap.includes(`<loc>https://shynlicleaningservice.com${route}</loc>`), route);
      assert.ok(overview.split(`href="${route}"`).length >= 3, `Overview and city selector include ${city}`);
      const match = html.match(/const serviceZips = (\{[^\n]*\});/);
      assert.ok(match, route);
      assert.deepEqual(JSON.parse(match[1]), SERVICE_AREA_ZIP_MAP, route);
      for (const zip of zips) {
        assert.ok(SERVICE_AREA_ZIP_MAP[zip].some((target) => target.url === route), `${city}: ${zip}`);
      }
    }
    const html = await (await fetch(`${app.baseUrl}/shorewood`)).text();
    const lookup = createCityZipRuntime(html);
    for (const zip of NEW_ZIPS) {
      const result = lookup(zip);
      assert.match(result.className, /success/, zip);
      for (const target of SERVICE_AREA_ZIP_MAP[zip]) {
        assert.ok(result.innerHTML.includes(`href="${target.url}"`), `${zip}: ${target.city}`);
      }
    }
    assert.match(lookup("60434").className, /error/, "PO-box-only ZIP is not a residential service area");
    assert.match(lookup("60601").className, /error/, "Unrelated ZIP stays unsupported");
    assert.match(lookup("123").innerHTML, /valid 5-digit/, "Invalid input stays rejected");
    const quote = await (await fetch(`${app.baseUrl}/quote`)).text();
    const quoteZipConfig = JSON.parse(quote.match(/serviceAreaZipCodes: (\[[^\n]*\])/)[1]);
    for (const zip of NEW_ZIPS) {
      assert.ok(quoteZipConfig.includes(zip), zip);
      assert.equal(isSupportedServiceAreaZip(zip), true, zip);
    }
    assert.equal(isSupportedServiceAreaZip("60434"), false);
    assert.equal(isSupportedServiceAreaZip("60601"), false);
  } finally {
    await stopServer(app.child);
  }
});

test("website intake accepts every newly covered residential ZIP with isolated CRM and storage", async () => {
  const stub = createFetchStub([
    { method: "GET", match: "/contacts/", status: 200, body: { contacts: [] } },
    { method: "POST", match: "/contacts/", status: 200, body: { contact: { id: "new-city-test-contact" } } },
  ]);
  const app = await startServer({ env: {
    GHL_API_KEY: "ghl_test_key", GHL_LOCATION_ID: "new-cities-test",
    POST_RATE_LIMIT_MAX_REQUESTS: "50",
    GHL_ENABLE_NOTES: "0", GHL_CREATE_OPPORTUNITY: "0", SHYNLI_FETCH_STUB_ENTRY: stub.stubEntry,
  } });
  try {
    for (const [index, zip] of NEW_ZIPS.entries()) {
      const response = await fetch(`${app.baseUrl}/api/quote/submit`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": `new-city-${zip}` },
        body: JSON.stringify({
          contact: { fullName: `Service Area Test ${zip}`, phone: `312555${String(index).padStart(4, "0")}` },
          quote: {
            serviceType: "regular", totalPrice: 120, selectedDate: "2026-11-20", selectedTime: "09:00",
            fullAddress: `123 Test Street, ${SERVICE_AREA_ZIP_MAP[zip][0].city}, IL ${zip}`,
            zipCode: zip, consent: true,
          },
        }),
      });
      const payload = await response.json();
      assert.equal(response.status, 201, `${zip}: ${JSON.stringify(payload)}`);
      assert.equal(payload.ok, true, zip);
    }
  } finally {
    await stopServer(app.child);
    stub.cleanup();
  }
});
