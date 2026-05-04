"use strict";

const { buildOrderServiceDurationMinutes } = require("../order-service-duration");

function createAdminOrdersCreateHandlers(deps = {}) {
  const {
    buildManualOrderRequestId,
    formatManualOrderServiceLabel,
    buildOrdersRedirect,
    normalizeManualOrderFrequency,
    normalizeManualOrderServiceType,
    getFormValue,
    redirectWithTiming,
    ADMIN_ORDERS_PATH,
  } = deps;

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
    const fullAddress = getFormValue(formBody, "fullAddress", 500);
    const serviceType = normalizeManualOrderServiceType(getFormValue(formBody, "serviceType", 40));
    const selectedDate = getFormValue(formBody, "selectedDate", 32);
    const selectedTime = getFormValue(formBody, "selectedTime", 32);
    const serviceDurationHours = getFormValue(formBody, "serviceDurationHours", 8);
    const serviceDurationMinutes = getFormValue(formBody, "serviceDurationMinutes", 8);
    const frequency =
      serviceType === "standard"
        ? normalizeManualOrderFrequency(getFormValue(formBody, "frequency", 40))
        : "";
    const totalPrice = getFormValue(formBody, "totalPrice", 64);
    const totalServiceDurationMinutes = buildOrderServiceDurationMinutes(
      serviceDurationHours,
      serviceDurationMinutes
    );

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

    if (!totalServiceDurationMinutes) {
      redirectWithTiming(
        res,
        303,
        buildOrdersRedirect(returnTo, "manual-order-duration-invalid", { createOrder: "1" }),
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
        payloadForRetry: {
          calculatorData: {
            serviceType,
            frequency,
            fullAddress,
            address: fullAddress,
            selectedDate,
            selectedTime,
            serviceDurationMinutes: totalServiceDurationMinutes,
          },
        },
      });

      const updatedEntry = await quoteOpsLedger.updateOrderEntry(createdEntry.id, {
        createOrder: true,
        orderStatus: "new",
        selectedDate,
        selectedTime,
        serviceDurationMinutes: totalServiceDurationMinutes,
        frequency,
        totalPrice,
        paymentStatus: "unpaid",
      });

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
