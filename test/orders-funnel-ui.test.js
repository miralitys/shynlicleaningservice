"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createOrdersFunnelUi } = require("../lib/admin/pages/orders-funnel-ui");

const { getOrderFunnelStatus } = createOrdersFunnelUi({
  normalizeOrderStatus(value, fallback) {
    return String(value || fallback || "").trim().toLowerCase();
  },
  normalizeString(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
  },
});

test("free in-home estimate stays scheduled when a legacy policy invite exists", () => {
  assert.equal(
    getOrderFunnelStatus({
      orderStatus: "scheduled",
      serviceType: "free-in-home-estimate",
      policyAcceptance: {
        sentAt: "2026-08-18T20:05:00.000Z",
        policyAccepted: false,
      },
    }),
    "scheduled"
  );
});

test("regular scheduled order with an unsigned policy invite stays in policy", () => {
  assert.equal(
    getOrderFunnelStatus({
      orderStatus: "scheduled",
      serviceType: "standard",
      policyAcceptance: {
        sentAt: "2026-08-18T20:05:00.000Z",
        policyAccepted: false,
      },
    }),
    "policy"
  );
});
