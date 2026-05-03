"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");

const {
  generatePolicyAcceptanceCertificate,
} = require("../lib/order-policy/certificate");
const { policyCertificateHelpers } = require("../lib/order-policy/helpers");

test("generates a policy acceptance certificate when names include Cyrillic characters", async () => {
  const pdfBuffer = await generatePolicyAcceptanceCertificate(
    {
      acceptanceId: "acceptance-1",
      bookingId: "booking-1",
      requestId: "request-1",
      customerFullName: "Толкун Мур",
      customerEmail: "tolkun@example.com",
      customerPhone: "+1 312-555-0100",
      serviceAddress: "123 Main St, Romeoville, IL 60446",
      acceptedTerms: true,
      acceptedPaymentCancellation: true,
      typedSignature: "Tolkun MurС",
      ipAddress: "203.0.113.42",
      locationText: "Chicago, IL, US",
      sentAt: "2026-05-03T18:00:00.000Z",
      firstViewedAt: "2026-05-03T18:02:00.000Z",
      lastViewedAt: "2026-05-03T18:03:00.000Z",
      signedAt: "2026-05-03T18:04:00.000Z",
      termsDocument: {
        title: "Terms of Service",
        publicUrl: "https://shynlicleaningservice.com/terms-of-service",
        version: "v1",
        effectiveDate: "2026-01-01",
      },
      paymentPolicyDocument: {
        title: "Payment and Cancellation Policy",
        publicUrl: "https://shynlicleaningservice.com/cancellation-policy",
        version: "v1",
        effectiveDate: "2026-01-01",
      },
    },
    policyCertificateHelpers
  );

  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 500);
  assert.equal(pdfBuffer.subarray(0, 4).toString("utf8"), "%PDF");

  const loadedPdf = await PDFDocument.load(pdfBuffer);
  assert.ok(loadedPdf.getPageCount() >= 1);
});
