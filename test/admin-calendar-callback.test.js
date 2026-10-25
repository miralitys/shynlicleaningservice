"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminCalendarHandlers } = require("../lib/admin/handlers-calendar");
const { createAdminGoogleCalendarClient } = require("../lib/admin-google-calendar");

const callbackPath = "/admin/google-calendar/callback";
const secret = "calendar-callback-test-secret";
const client = createAdminGoogleCalendarClient({
  env: {
    GOOGLE_CALENDAR_CLIENT_ID: "test-client-id",
    GOOGLE_CALENDAR_CLIENT_SECRET: "test-client-secret",
  },
  fetch() { throw new Error("External calls are forbidden in callback redirect tests"); },
});

function signedState(source) {
  return new URL(client.buildConnectUrl({ staffId: "cleaner-test", source, secret }))
    .searchParams.get("state");
}

async function callback({ source = "account", state = signedState(source), code = "test-code",
  error = "", configured = true, fail = false, method = "GET" } = {}) {
  const redirects = [];
  const calls = { readState: 0, callback: 0 };
  const savedData = { orders: [{ amount: 534, team: ["cleaner-test"], payout: 500 }],
    calendar: { status: "connected", token: "synthetic-token" }, password: "synthetic-hash" };
  const before = JSON.stringify(savedData);
  const handlers = createAdminCalendarHandlers({
    ACCOUNT_ROOT_PATH: "/account",
    ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH: callbackPath,
    normalizeString: (value, max = 500) => String(value || "").trim().slice(0, max),
    redirectWithTiming: (_res, status, location) => redirects.push({ status, location }),
    buildStaffRedirect: notice => `/admin/staff?notice=${notice}`,
    adminSharedRenderers: { renderAdminLayout: (_title, body) => body },
    writeHtmlWithTiming: (res, status) => { res.status = status; },
  });
  const params = new URLSearchParams();
  if (state) params.set("state", state);
  if (code) params.set("code", code);
  if (error) params.set("error", error);
  const res = {};
  const handled = await handlers.handleCalendarRoutes({
    req: { method, url: `${callbackPath}?${params}` }, res,
    requestContext: { route: callbackPath, cacheHit: false }, config: {},
    googleCalendarIntegration: {
      isConfigured: () => configured,
      async readOAuthStateSource({ state }) {
        calls.readState++;
        return client.readStateSource({ state, secret });
      },
      async handleOAuthCallback({ state }) {
        calls.callback++;
        if (fail) throw new Error("Simulated token exchange failure");
        return { source: client.readStateSource({ state, secret }) };
      },
    },
    staffStore: { updateStaff() { assert.fail("Redirect must not change staff or connection"); } },
  });
  assert.equal(handled, true);
  assert.equal(JSON.stringify(savedData), before);
  return { redirects, calls, res };
}

for (const source of ["account", "admin"]) {
  for (const scenario of ["success", "denied", "technical failure", "missing code", "unavailable integration"]) {
    test(`Google Calendar ${scenario} returns ${source} to its own workspace without writes`, async () => {
      const result = await callback({ source, fail: scenario === "technical failure",
        error: scenario === "denied" ? "access_denied" : "",
        code: scenario === "missing code" ? "" : "test-code",
        configured: scenario !== "unavailable integration" });
      const notice = scenario === "success" ? "calendar-connected"
        : scenario === "denied" ? "calendar-connect-denied" : "calendar-connect-failed";
      const location = source === "account" ? `/account?section=payroll&notice=${notice}`
        : `/admin/staff?notice=${notice}`;
      assert.deepEqual(result.redirects, [{ status: 303, location }]);
      assert.equal(result.calls.callback, ["success", "technical failure"].includes(scenario) ? 1 : 0);
    });
  }
}

for (const state of ["", `${signedState("account")}tampered`,
  Buffer.from(JSON.stringify({ source: "account" })).toString("base64url")]) {
  test(`does not trust missing or unsigned account state (${state ? "invalid" : "missing"})`, async () => {
    const result = await callback({ state, code: "", fail: true });
    assert.deepEqual(result.redirects, [{ status: 303, location: "/admin/staff?notice=calendar-connect-failed" }]);
    assert.equal(result.calls.callback, 0);
  });
}

test("Google callback rejects POST without processing the state or connection", async () => {
  const result = await callback({ method: "POST" });
  assert.equal(result.res.status, 405);
  assert.deepEqual(result.calls, { readState: 0, callback: 0 });
  assert.deepEqual(result.redirects, []);
});
