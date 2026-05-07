"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { renderPolicyAcceptancePage } = require("../lib/order-policy/public-page");

test("opens policy documents inside the public signature page", () => {
  const html = renderPolicyAcceptancePage({
    token: "policy-token-123",
    payload: {
      booking: {
        id: "booking-1",
        requestId: "REQ-1",
        serviceLabel: "Deep Cleaning",
        appointmentLabel: "May 5 at 10:00 AM",
        totalPrice: 220,
      },
      customer: {
        fullName: "Policy Customer",
        serviceAddress: "123 Main St, Naperville, IL 60540",
        email: "policy@example.com",
        phone: "+1 312-555-0100",
      },
      acceptance: {
        policyAccepted: false,
        status: "pending",
      },
      documents: [
        {
          title: "Terms of Service",
          publicUrl: "https://shynlicleaningservice.com/terms-of-service",
          version: "v1",
          effectiveDate: "2026-01-01",
        },
        {
          title: "Payment and Cancellation Policy",
          publicUrl: "https://shynlicleaningservice.com/cancellation-policy",
          version: "v1",
          effectiveDate: "2026-01-01",
        },
      ],
    },
  });

  assert.match(
    html,
    /class="doc-card doc-card-link" href="https:\/\/shynlicleaningservice\.com\/terms-of-service" data-policy-doc-link data-policy-doc-title="Terms of Service"/
  );
  assert.match(
    html,
    /class="doc-card doc-card-link" href="https:\/\/shynlicleaningservice\.com\/cancellation-policy" data-policy-doc-link data-policy-doc-title="Payment and Cancellation Policy"/
  );
  assert.match(html, /id="policy-doc-overlay"/);
  const payloadScriptMatch = html.match(
    /<script id="policy-acceptance-payload" type="application\/json">([\s\S]*?)<\/script>/
  );
  assert.ok(payloadScriptMatch);
  assert.match(payloadScriptMatch[1], /^\{"booking":/);
  assert.doesNotMatch(payloadScriptMatch[1], /&quot;/);
  assert.match(html, /function openPolicyDocument\(event\)/);
  assert.match(html, /function showPolicyDocumentFrame\(href, title\)/);
  assert.match(html, /class="policy-doc-frame"/);
  assert.match(html, /docList\.addEventListener\("click", openPolicyDocument\)/);
  assert.doesNotMatch(html, /window\.open\(href, "_blank", "noopener,noreferrer"\)/);
  assert.doesNotMatch(html, /target="_blank" rel="noopener noreferrer" data-policy-doc-link/);
  assert.doesNotMatch(html, /Open in this tab/);
});

test("keeps booking summary inside narrow mobile viewports", () => {
  const html = renderPolicyAcceptancePage({
    token: "policy-token-mobile",
    payload: {
      booking: {
        id: "booking-mobile-1",
        requestId: "mobile-booking-with-a-long-id",
        serviceLabel: "Deep Cleaning",
        appointmentLabel: "05/05/2026, 1:00 PM",
        totalPrice: 727,
      },
      customer: {
        fullName: "Tonya",
        serviceAddress: "1289 Rhodes LN, Naperville, IL 60540, США",
        email: "",
        phone: "+1 312-555-0100",
      },
      acceptance: {
        policyAccepted: false,
        status: "pending",
      },
      documents: [],
    },
  });

  assert.match(html, /\.page \{ width:100%; max-width:980px;[^}]*overflow-x:hidden;/);
  assert.match(html, /\.shell \{ width:100%; max-width:100%; min-width:0;/);
  assert.match(html, /\.grid \{[^}]*min-width:0;/);
  assert.match(html, /\.section \{ max-width:100%; min-width:0;[^}]*overflow:hidden;/);
  assert.match(html, /\.summary-grid \{[^}]*min-width:0; max-width:100%;/);
  assert.match(html, /\.summary-item \{ min-width:0; max-width:100%;/);
  assert.match(html, /\.summary-value \{ max-width:100%;[^}]*overflow-wrap:anywhere;/);
  assert.match(html, /@media \(max-width: 380px\) \{/);
  assert.match(html, /\.summary-item-inline \.summary-value \{ white-space:normal; \}/);
});
