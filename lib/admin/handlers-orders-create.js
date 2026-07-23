"use strict";

const { normalizeEnglishAddressLabel } = require("../address-format");
const { buildOrderServiceDurationMinutes } = require("../order-service-duration");

function createAdminOrdersCreateHandlers(deps = {}) {
  const {
    applyAlreadyAcceptedPolicyForClient,
    buildManualOrderRequestId,
    formatManualOrderServiceLabel,
    buildOrdersRedirect,
    normalizeManualOrderFrequency,
    normalizeManualOrderServiceType,
    getFormValue,
    redirectWithTiming,
    ADMIN_ORDERS_PATH,
  } = deps;

  function normalizeManualOrderAddressMeta(formBody, fullAddress, getFormValue) {
    const selectedAddress = normalizeEnglishAddressLabel(
      getFormValue(formBody, "selectedClientAddress", 500),
      500
    );
    if (!selectedAddress || selectedAddress.toLowerCase() !== fullAddress.toLowerCase()) {
      return null;
    }

    const addressRecord = {
      address: fullAddress,
      propertyType: getFormValue(formBody, "selectedClientAddressPropertyType", 40),
      squareFootage: getFormValue(formBody, "selectedClientAddressSquareFootage", 120),
      roomCount: getFormValue(formBody, "selectedClientAddressRoomCount", 120),
      bathroomCount: getFormValue(formBody, "selectedClientAddressBathroomCount", 120),
      sizeDetails: getFormValue(formBody, "selectedClientAddressSizeDetails", 250),
      pets: getFormValue(formBody, "selectedClientAddressPets", 40),
      basementCleaning: getFormValue(formBody, "selectedClientAddressBasementCleaning", 40),
      notes: getFormValue(formBody, "selectedClientAddressNotes", 4000),
    };

    return Object.values(addressRecord).some(Boolean) ? addressRecord : null;
  }

  function isLikelyManualOrderRoomCount(value) {
    const normalized = String(value || "").trim().replace(",", ".");
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return false;
    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) && numericValue > 0 && numericValue <= 20;
  }

  function repairManualOrderCalculatorRoomBathAreaData(calculatorData = {}) {
    if (calculatorData.bathrooms || !isLikelyManualOrderRoomCount(calculatorData.squareMeters)) {
      return calculatorData;
    }

    calculatorData.bathrooms = calculatorData.squareMeters;
    delete calculatorData.squareMeters;
    return calculatorData;
  }

  function buildManualOrderCalculatorData({
    serviceType,
    frequency,
    fullAddress,
    selectedDate,
    selectedTime,
    serviceDurationMinutes,
    addressMeta,
  } = {}) {
    const calculatorData = {
      serviceType,
      frequency,
      fullAddress,
      address: fullAddress,
      selectedDate,
      selectedTime,
      serviceDurationMinutes,
    };

    if (addressMeta && typeof addressMeta === "object") {
      if (addressMeta.roomCount) calculatorData.rooms = addressMeta.roomCount;
      if (addressMeta.bathroomCount) calculatorData.bathrooms = addressMeta.bathroomCount;
      if (addressMeta.squareFootage) calculatorData.squareMeters = addressMeta.squareFootage;
      if (addressMeta.pets) calculatorData.hasPets = addressMeta.pets;
      if (addressMeta.basementCleaning) calculatorData.basementCleaning = addressMeta.basementCleaning;
      if (addressMeta.notes) calculatorData.additionalDetails = addressMeta.notes;
      if (addressMeta.propertyType) calculatorData.propertyType = addressMeta.propertyType;
    }

    repairManualOrderCalculatorRoomBathAreaData(calculatorData);
    return calculatorData;
  }

  async function handleCreateManualOrder(context = {}) {
    const {
      res,
      requestStartNs,
      requestContext,
      quoteOpsLedger,
      formBody,
      returnTo,
    } = context;

    const customerName = getFormValue(formBody, "customerName", 250);
    const customerPhone = getFormValue(formBody, "customerPhone", 80);
    const customerEmail = getFormValue(formBody, "customerEmail", 250).toLowerCase();
    const fullAddress = normalizeEnglishAddressLabel(getFormValue(formBody, "fullAddress", 500), 500);
    const selectedClientContactId = getFormValue(formBody, "selectedClientContactId", 120);
    const selectedClientAddressMeta = normalizeManualOrderAddressMeta(formBody, fullAddress, getFormValue);
    const serviceType = normalizeManualOrderServiceType(getFormValue(formBody, "serviceType", 40));
    const selectedDate = getFormValue(formBody, "selectedDate", 32);
    const selectedTime = getFormValue(formBody, "selectedTime", 32);
    const serviceDurationHours = getFormValue(formBody, "serviceDurationHours", 8);
    const serviceDurationMinutes = getFormValue(formBody, "serviceDurationMinutes", 8);
    const isFreeInHomeEstimate = serviceType === "free-in-home-estimate";
    const frequency =
      serviceType === "standard"
        ? normalizeManualOrderFrequency(getFormValue(formBody, "frequency", 40))
        : "";
    const submittedTotalPrice = getFormValue(formBody, "totalPrice", 64);
    const totalPrice = isFreeInHomeEstimate && !submittedTotalPrice ? "0" : submittedTotalPrice;
    const submittedServiceDurationMinutes = buildOrderServiceDurationMinutes(
      serviceDurationHours,
      serviceDurationMinutes
    );
    const totalServiceDurationMinutes =
      submittedServiceDurationMinutes || (isFreeInHomeEstimate ? 30 : 0);

    if (!quoteOpsLedger || !customerName || !customerPhone || !fullAddress) {
      redirectWithTiming(
        res,
        303,
        buildOrdersRedirect(returnTo, "manual-order-invalid", { createOrder: "1" }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    try {
      const createdEntry = await quoteOpsLedger.recordSubmission({
        ok: true,
        requestId: buildManualOrderRequestId(customerName),
        sourceRoute: ADMIN_ORDERS_PATH,
        source: "Manual admin order",
        customerName,
        customerPhone,
        customerEmail,
        serviceType,
        serviceName: formatManualOrderServiceLabel(serviceType),
        totalPrice: 0,
        totalPriceCents: 0,
        selectedDate: "",
        selectedTime: "",
        fullAddress,
        httpStatus: 200,
        code: "MANUAL_ORDER_CREATED",
        retryable: false,
        warnings: [],
        errorMessage: "",
        contactId: selectedClientContactId,
        usedExistingContact: Boolean(selectedClientContactId),
        payloadForRetry: {
          ...(selectedClientAddressMeta
            ? {
                adminClient: {
                  addressBook: [selectedClientAddressMeta],
                },
              }
            : {}),
          calculatorData: buildManualOrderCalculatorData({
            serviceType,
            frequency,
            fullAddress,
            selectedDate,
            selectedTime,
            serviceDurationMinutes: totalServiceDurationMinutes,
            addressMeta: selectedClientAddressMeta,
          }),
        },
      });

      let updatedEntry = await quoteOpsLedger.updateOrderEntry(createdEntry.id, {
        createOrder: true,
        orderStatus: "new",
        selectedDate,
        selectedTime,
        serviceDurationMinutes: totalServiceDurationMinutes,
        frequency,
        totalPrice,
        paymentStatus: "unpaid",
      });

      if (updatedEntry && typeof applyAlreadyAcceptedPolicyForClient === "function") {
        const acceptedPolicyResult = await applyAlreadyAcceptedPolicyForClient(
          quoteOpsLedger,
          updatedEntry.id || createdEntry.id,
          updatedEntry
        );
        updatedEntry = (acceptedPolicyResult && acceptedPolicyResult.updatedEntry) || updatedEntry;
      }

      redirectWithTiming(
        res,
        303,
        buildOrdersRedirect(ADMIN_ORDERS_PATH, updatedEntry ? "manual-order-created" : "order-save-failed", {
          order: (updatedEntry || createdEntry).id,
        }),
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    } catch {
      redirectWithTiming(
        res,
        303,
        buildOrdersRedirect(returnTo, "order-save-failed", { createOrder: "1" }),
        requestStartNs,
        requestContext.cacheHit
      );
    }
  }

  return {
    handleCreateManualOrder,
  };
}

module.exports = {
  createAdminOrdersCreateHandlers,
};
