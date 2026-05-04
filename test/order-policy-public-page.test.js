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
  assert.match(html, /function openPolicyDocument\(event\)/);
  assert.match(html, /docList\.addEventListener\("click", openPolicyDocument\)/);
  assert.doesNotMatch(html, /window\.open\(href, "_blank", "noopener,noreferrer"\)/);
  assert.doesNotMatch(html, /target="_blank" rel="noopener noreferrer" data-policy-doc-link/);
});
