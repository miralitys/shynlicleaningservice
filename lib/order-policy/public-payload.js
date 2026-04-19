"use strict";

function fallbackNormalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function buildPublicPolicyPayload(customerSummary = {}, record = {}, options = {}) {
  const normalizeString =
    typeof options.normalizeString === "function" ? options.normalizeString : fallbackNormalizeString;
  const apiBasePath = normalizeString(options.apiBasePath, 120) || "/api/policy-acceptance";
  const token = normalizeString(options.token, 6000);

  return {
    booking: {
      id: customerSummary.bookingId,
      requestId: customerSummary.requestId,
      serviceLabel: customerSummary.serviceLabel,
      selectedDate: customerSummary.selectedDate,
      selectedTime: customerSummary.selectedTime,
      selectedDateLabel: customerSummary.selectedDateLabel,
      selectedTimeLabel: customerSummary.selectedTimeLabel,
      appointmentLabel: customerSummary.appointmentLabel,
      totalPrice: customerSummary.totalPrice,
    },
    customer: {
      fullName: customerSummary.customerFullName,
      email: customerSummary.customerEmail,
      phone: customerSummary.customerPhone,
      serviceAddress: customerSummary.serviceAddress,
    },
    documents: [
      {
        id: record.termsDocument.id,
        documentType: record.termsDocument.documentType,
        title: record.termsDocument.title,
        publicUrl: record.termsDocument.publicUrl,
        version: record.termsDocument.version,
        effectiveDate: record.termsDocument.effectiveDate,
      },
      {
        id: record.paymentPolicyDocument.id,
        documentType: record.paymentPolicyDocument.documentType,
        title: record.paymentPolicyDocument.title,
        publicUrl: record.paymentPolicyDocument.publicUrl,
        version: record.paymentPolicyDocument.version,
        effectiveDate: record.paymentPolicyDocument.effectiveDate,
      },
    ],
    acceptance: {
      status: record.status || "pending",
      acceptedTerms: record.acceptedTerms,
      acceptedPaymentCancellation: record.acceptedPaymentCancellation,
      policyAccepted: record.policyAccepted,
      signedAt: record.signedAt,
      certificateUrl:
        record.certificateFile && token ? `${apiBasePath}/${encodeURIComponent(token)}/certificate` : "",
    },
  };
}

module.exports = {
  buildPublicPolicyPayload,
};
