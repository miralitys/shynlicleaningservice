"use strict";
const vm = require("node:vm");
const { test, assert, fs, path, startServer, stopServer, loadAdminConfig, createAdminSession } = require("./admin-route-helpers");
const engine = require("../js/cleaning-pricing");

async function browserForm(serviceType = "standard", selected = []) {
  const handlers = {};
  const checkboxes = Object.keys(engine.PRICING.services).map(value => ({ name: "quoteServices", value, checked: selected.includes(value) }));
  const fields = Object.fromEntries(Object.entries({ quoteServiceType: serviceType, quoteFrequency: "monthly", quoteRooms: "3",
    quoteBathrooms: "2", quoteSquareMeters: "2000", serviceDurationHours: "4", serviceDurationMinutes: "30", totalPrice: "417" })
    .map(([name, value]) => [name, { name, value }]));
  const preview = { textContent: "unchanged" };
  const form = {
    elements: { namedItem: name => fields[name] || null },
    querySelector: selector => { assert.equal(selector, "[data-quote-price-preview]"); return preview; },
    querySelectorAll: selector => {
      assert([`[name="quoteServices"]`, `[name="quoteServices"]:checked`].includes(selector));
      return selector.endsWith(":checked") ? checkboxes.filter(field => field.checked) : checkboxes;
    },
  };
  const script = await fs.readFile(path.join(__dirname, "../js/admin-quote-pricing.js"), "utf8");
  vm.runInNewContext(script, { window: { ShynliPricing: engine }, document: { addEventListener: (name, handler) => { handlers[name] = handler; } } });
  const emit = (name, field) => handlers[name]({ target: { ...fields[field], name: field, closest: () => form } });
  return { fields, checkboxes, preview, emit, selected: () => checkboxes.filter(field => field.checked).map(field => field.value).sort() };
}

test("choosing Deep checks Baseboards and Doors before updating the quote, preserving other choices and agreed values", async () => {
  const form = await browserForm("standard", ["ovenCleaning", "refrigeratorCleaning"]);
  form.fields.quoteServiceType.value = "deep";
  form.emit("change", "quoteServiceType");
  assert.deepEqual(form.selected(), ["baseboardCleaning", "doorsCleaning", "ovenCleaning", "refrigeratorCleaning"]);
  const expected = engine.calculateQuotePricing({ serviceType: "deep", frequency: "monthly", rooms: "3", bathrooms: "2", squareMeters: "2000",
    services: form.selected() });
  assert.equal(form.preview.textContent, "$" + expected.totalPrice.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  assert.equal(form.fields.totalPrice.value, "417");
  assert.equal(form.fields.serviceDurationHours.value, "4");
  assert.equal(form.fields.serviceDurationMinutes.value, "30");
});

test("opening existing Deep orders and changing unrelated fields does not add extras or override a manual deselection", async () => {
  const form = await browserForm("deep", ["ovenCleaning"]);
  assert.deepEqual(form.selected(), ["ovenCleaning"], "No initialization writes");
  form.emit("input", "quoteRooms");
  assert.deepEqual(form.selected(), ["ovenCleaning"]);
  form.emit("change", "quoteServiceType");
  form.checkboxes.find(field => field.value === "doorsCleaning").checked = false;
  form.emit("change", "quoteServices");
  form.emit("input", "quoteBathrooms");
  assert.deepEqual(form.selected(), ["baseboardCleaning", "ovenCleaning"]);
});

test("other service types and repeated changes leave selections intact", async () => {
  for (const type of ["standard", "move-in", "move-out", "free-in-home-estimate"]) {
    const form = await browserForm(type, ["ovenCleaning"]);
    form.emit("change", "quoteServiceType");
    assert.deepEqual(form.selected(), ["ovenCleaning"], type);
  }
  const form = await browserForm("deep");
  form.emit("change", "quoteServiceType");
  form.emit("change", "quoteServiceType");
  assert.deepEqual(form.selected(), ["baseboardCleaning", "doorsCleaning"]);
});

test("new manual Deep orders save the two defaults; saving explicit quote choices preserves price, schedule and duration", async () => {
  const env = { ADMIN_MASTER_SECRET: "deep_defaults_local_test", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", GHL_API_KEY: "", GHL_LOCATION_ID: "" };
  const app = await startServer({ env });
  try {
    const cookie = "shynli_admin_session=" + await createAdminSession(app.baseUrl, loadAdminConfig(env));
    const post = fields => fetch(app.baseUrl + "/admin/orders", { method: "POST", redirect: "manual", headers: {
      cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
    const get = async id => {
      const response = await fetch(app.baseUrl + "/admin/orders?fragment=order-dialog&order=" + id, { headers: { cookie } });
      assert.equal(response.status, 200); return response.text();
    };
    const checked = (html, key) => new RegExp(`name="quoteServices"\\s+value="${key}"\\s+checked`).test(html);
    for (const type of ["deep", "standard", "move-out"]) {
      const response = await post({ action: "create-manual-order", customerName: "TEST Deep Defaults " + type, customerPhone: "6305550168",
        fullAddress: "100 Local Test Street", serviceType: type, totalPrice: "417", selectedDate: "2099-04-05", selectedTime: "09:00",
        serviceDurationHours: "4", serviceDurationMinutes: "30" });
      assert.equal(response.status, 303);
      const id = new URL(response.headers.get("location"), app.baseUrl).searchParams.get("order"); assert(id);
      let html = await get(id);
      assert.equal(checked(html, "baseboardCleaning"), type === "deep", type);
      assert.equal(checked(html, "doorsCleaning"), type === "deep", type);
      if (type === "deep") {
        const saved = await post({ action: "update-order-quote-fields", entryId: id, quoteServiceType: "deep", quoteServices: "ovenCleaning",
          quoteRooms: "3", quoteBathrooms: "2", quoteSquareMeters: "2000", quoteFullAddress: "100 Local Test Street",
          quoteSelectedDate: "2099-04-05", quoteSelectedTime: "09:00" });
        assert.equal(saved.status, 303);
        html = await get(id);
        assert(checked(html, "ovenCleaning"));
        assert(!checked(html, "doorsCleaning"));
        assert(checked(html, "baseboardCleaning"), "Deep's existing included-baseboard rule stays unchanged");
      }
      assert.match(html, /name="totalPrice"\s+value="417\.00"/);
      assert.match(html, /name="serviceDurationHours"[^>]*value="4"/);
      assert.match(html, /name="serviceDurationMinutes"[^>]*value="30"/);
      assert.match(html, /2099-04-05/);
      assert.match(html, /value="09:00"/);
    }
  } finally { await stopServer(app.child); }
});
