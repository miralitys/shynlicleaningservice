"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminDomainHelpers } = require("../lib/admin/domain");
const { generateTotpCode, hashPassword, loadAdminConfig } = require("../lib/admin-auth");
const { createFetchStub, createSmtpTestServer, startServer, stopServer } = require("./server-test-helpers");

const SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=";

function getSetCookies(response) {
  const header = response.headers.get("set-cookie") || "";
  return header
    .split(/,(?=[A-Za-z0-9_]+=)/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getCookieValue(setCookies, name) {
  const target = setCookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!target) return "";
  return target.split(";")[0].slice(name.length + 1);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getOrderFunnelLaneSlice(html, laneStatus, nextLaneStatus = "") {
  const source = String(html || "");
  const laneMarker = `admin-order-funnel-column-${laneStatus}`;
  const startIndex = source.indexOf(laneMarker);
  if (startIndex === -1) return "";
  const endIndex = nextLaneStatus ? source.indexOf(`admin-order-funnel-column-${nextLaneStatus}`, startIndex) : -1;
  return source.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function normalizeEmailSource(value) {
  return String(value || "").replace(/=\r?\n/g, "");
}

function decodeQuotedPrintable(value) {
  return normalizeEmailSource(value).replace(/=([A-F0-9]{2})/gi, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );
}

function getChicagoDateValue(offsetDays = 0) {
  const baseDate = new Date(Date.now() + Number(offsetDays || 0) * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(baseDate);
  const values = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    values[part.type] = part.value;
  }
  return `${values.year}-${values.month}-${values.day}`;
}

function getChicagoDateTimeLocalValue(offsetDays = 0, hour = 9, minute = 15) {
  return `${getChicagoDateValue(offsetDays)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getStaffAssignmentEntryIdByCustomerName(html, customerName) {
  const match = String(html || "").match(
    new RegExp(
      `<dialog class="admin-dialog admin-dialog-wide" id="admin-staff-assignment-dialog-[^"]+"[\\s\\S]*?<h2 class="admin-dialog-title"[^>]*>${escapeRegex(customerName)}<\\/h2>[\\s\\S]*?<input type="hidden" name="entryId" value="([^"]+)"`,
      "i"
    )
  );
  return match ? match[1] : "";
}

function getLeadTaskIdByEntryId(html, entryId) {
  const match = String(html || "").match(
    new RegExp(
      `name="entryId" value="${escapeRegex(entryId)}"[\\s\\S]*?name="taskId" value="([^"]+)"`,
      "i"
    )
  );
  return match ? match[1] : "";
}

async function createAdminSession(baseUrl, config) {
  const loginResponse = await fetch(`${baseUrl}/admin/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      email: config.email,
      password: "1HKLOR1!",
    }),
  });

  assert.equal(loginResponse.status, 303);
  const loginCookies = getSetCookies(loginResponse);
  if ((loginResponse.headers.get("location") || "") === "/admin/2fa") {
    const challengeCookieValue = getCookieValue(loginCookies, "shynli_admin_challenge");
    assert.ok(challengeCookieValue);

    const twoFactorResponse = await fetch(`${baseUrl}/admin/2fa`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_challenge=${challengeCookieValue}`,
      },
      body: new URLSearchParams({
        code: generateTotpCode(config),
      }),
    });

    assert.equal(twoFactorResponse.status, 303);
    assert.equal(twoFactorResponse.headers.get("location"), "/admin");
    const twoFactorCookies = getSetCookies(twoFactorResponse);
    const sessionCookie = twoFactorCookies.find((cookie) => cookie.startsWith("shynli_admin_session=")) || "";
    assert.match(sessionCookie, /Path=\//);
    const sessionCookieValue = getCookieValue(twoFactorCookies, "shynli_admin_session");
    assert.ok(sessionCookieValue);
    return sessionCookieValue;
  }

  assert.equal(loginResponse.headers.get("location"), "/admin");
  const sessionCookie = loginCookies.find((cookie) => cookie.startsWith("shynli_admin_session=")) || "";
  assert.match(sessionCookie, /Path=\//);
  const sessionCookieValue = getCookieValue(loginCookies, "shynli_admin_session");
  assert.ok(sessionCookieValue);
  return sessionCookieValue;
}

function createStripeWebhookSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function submitQuote(baseUrl, options) {
  return fetch(`${baseUrl}/api/quote/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": options.requestId,
    },
    body: JSON.stringify({
      contact: {
        fullName: options.fullName,
        phone: options.phone,
        email: options.email,
      },
      quote: {
        serviceType: options.serviceType || "deep",
        rooms: options.rooms || 4,
        bathrooms: options.bathrooms || 2,
        squareMeters: options.squareMeters || 1600,
        frequency: options.frequency || "",
        selectedDate: options.selectedDate || "2026-03-22",
        selectedTime: options.selectedTime || "09:00",
        fullAddress: options.fullAddress,
        consent: true,
      },
    }),
  });
}

async function createOrderFromQuoteRequest(baseUrl, sessionCookieValue, query) {
  const entryId = await getQuoteOpsEntryId(baseUrl, sessionCookieValue, query);

  const createOrderResponse = await fetch(`${baseUrl}/admin/quote-ops`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: `shynli_admin_session=${sessionCookieValue}`,
    },
    body: new URLSearchParams({
      action: "create-order-from-request",
      entryId,
      returnTo: "/admin/quote-ops",
    }),
  });

  assert.equal(createOrderResponse.status, 303);
  assert.match(createOrderResponse.headers.get("location") || "", /notice=order-created/);

  return entryId;
}

async function getQuoteOpsEntryId(baseUrl, sessionCookieValue, query) {
  const quoteOpsResponse = await fetch(`${baseUrl}/admin/quote-ops?q=${encodeURIComponent(query)}`, {
    headers: {
      cookie: `shynli_admin_session=${sessionCookieValue}`,
    },
  });
  const quoteOpsBody = await quoteOpsResponse.text();
  assert.equal(quoteOpsResponse.status, 200);

  const entryIdMatch = quoteOpsBody.match(/name="entryId" value="([^"]+)"/);
  assert.ok(entryIdMatch, `Expected quote ops entry for ${query}`);
  return entryIdMatch[1];
}

module.exports = {
  crypto,
  fs,
  os,
  path,
  test,
  assert,
  createAdminDomainHelpers,
  generateTotpCode,
  hashPassword,
  loadAdminConfig,
  createFetchStub,
  createSmtpTestServer,
  startServer,
  stopServer,
  SIGNATURE_DATA_URL,
  getSetCookies,
  getCookieValue,
  escapeRegex,
  getOrderFunnelLaneSlice,
  normalizeEmailSource,
  decodeQuotedPrintable,
  getChicagoDateValue,
  getChicagoDateTimeLocalValue,
  getStaffAssignmentEntryIdByCustomerName,
  getLeadTaskIdByEntryId,
  createAdminSession,
  createStripeWebhookSignature,
  submitQuote,
  createOrderFromQuoteRequest,
  getQuoteOpsEntryId,
};
