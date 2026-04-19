"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPublicPolicyPayload } = require("../lib/order-policy/public-payload");

test("builds the public policy payload with certificate access details", () => {
  const payload = buildPublicPolicyPayload(
    {
      bookingId: "booking-123",
      requestId: "request-456",
      customerFullName: "Policy Customer",
      customerEmail: "policy.customer@example.com",
      customerPhone: "(312) 555-3311",
      serviceAddress: "742 Cedar Avenue",
      serviceLabel: "Deep Cleaning",
      selectedDate: "2026-04-18",
      selectedTime: "10:30",
      selectedDateLabel: "04/18/2026",
      selectedTimeLabel: "10:30 AM",
      appointmentLabel: "04/18/2026, 10:30 AM",
      totalPrice: 185,
    },
    {
      status: "accepted",
      acceptedTerms: true,
      acceptedPaymentCancellation: true,
      policyAccepted: true,
      signedAt: "2026-04-18T15:30:00.000Z",
      certificateFile: {
        id: "certificate-1",
      },
      termsDocument: {
        id: "terms-1",
        documentType: "TERMS_OF_SERVICE",
        title: "Terms of Service",
        publicUrl: "https://example.com/terms",
        version: "2026.04",
        effectiveDate: "2026-04-01",
      },
      paymentPolicyDocument: {
        id: "payment-1",
        documentType: "PAYMENT_CANCELLATION_POLICY",
        title: "Payment and Cancellation Policy",
        publicUrl: "https://example.com/payment",
        version: "2026.04",
        effectiveDate: "2026-04-01",
      },
    },
    {
      token: "token-abc",
      apiBasePath: "/api/policy-acceptance",
    }
  );

  assert.deepEqual(payload.booking, {
    id: "booking-123",
    requestId: "request-456",
    serviceLabel: "Deep Cleaning",
    selectedDate: "2026-04-18",
    selectedTime: "10:30",
    selectedDateLabel: "04/18/2026",
    selectedTimeLabel: "10:30 AM",
    appointmentLabel: "04/18/2026, 10:30 AM",
    totalPrice: 185,
  });
  assert.deepEqual(payload.customer, {
    fullName: "Policy Customer",
    email: "policy.customer@example.com",
    phone: "(312) 555-3311",
    serviceAddress: "742 Cedar Avenue",
  });
  assert.equal(payload.acceptance.certificateUrl, "/api/policy-acceptance/token-abc/certificate");
  assert.equal(payload.acceptance.status, "accepted");
  assert.equal(payload.acceptance.policyAccepted, true);
  assert.equal(payload.documents.length, 2);
  assert.equal(payload.documents[0].title, "Terms of Service");
  assert.equal(payload.documents[1].title, "Payment and Cancellation Policy");
});

