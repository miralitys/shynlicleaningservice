"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { renderPolicyAcceptancePage } = require("../lib/order-policy/public-page");

test("renders policy documents as new-tab links on the public signature page", () => {
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
    /class="doc-card doc-card-link" href="https:\/\/shynlicleaningservice\.com\/terms-of-service" target="_blank" rel="noopener noreferrer" data-policy-doc-link/
  );
  assert.match(
    html,
    /class="doc-card doc-card-link" href="https:\/\/shynlicleaningservice\.com\/cancellation-policy" target="_blank" rel="noopener noreferrer" data-policy-doc-link/
  );
  assert.match(html, /window\.open\(href, "_blank", "noopener,noreferrer"\)/);
});
