"use strict";

const crypto = require("crypto");

function createApiHandlers(deps = {}) {
  const {
    MAX_JSON_BODY_BYTES,
    QUOTE_PUBLIC_PATH,
    QUOTE_SUBMIT_ENDPOINT,
    SITE_ORIGIN,
    STRIPE_CHECKOUT_ENDPOINT,
    STRIPE_MAX_AMOUNT_CENTS,
    STRIPE_MIN_AMOUNT_CENTS,
    QuoteTokenError,
    calculateQuotePricing,
    createQuoteToken,
    enforcePostRateLimit,
    getLeadConnectorClient,
    getStripeClient,
    getStripeReturnOrigin,
    normalizeString,
    readJsonBody,
    verifyQuoteToken,
    writeHeadWithTiming,
    writeJsonWithTiming,
  } = deps;

  function buildRetryPayload(contactData, calculatorData, source, requestId, submittedAt, userAgent) {
    return {
      contactData,
      calculatorData,
      source,
      pageUrl: `${SITE_ORIGIN}${QUOTE_PUBLIC_PATH}`,
      requestId,
      submittedAt,
      userAgent,
    };
  }

  async function handleStripeCheckoutRequest(req, res, requestStartNs, requestContext, requestLogger) {
    requestContext.cacheHit = false;

    if (req.method !== "POST") {
      writeHeadWithTiming(
        res,
        405,
        {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          Allow: "POST",
        },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    if (enforcePostRateLimit(req, res, requestStartNs, requestContext, STRIPE_CHECKOUT_ENDPOINT)) {
      return;
    }

    const stripe = getStripeClient();
    if (!stripe) {
      writeJsonWithTiming(
        res,
        503,
        { error: "Payments are temporarily unavailable. Stripe is not configured." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    let body;
    try {
      body = await readJsonBody(req, MAX_JSON_BODY_BYTES);
    } catch (error) {
      const isLarge = String(error && error.message).toLowerCase().includes("payload");
      writeJsonWithTiming(
        res,
        isLarge ? 413 : 400,
        { error: isLarge ? "Request payload is too large" : "Invalid request body" },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const quoteToken = normalizeString(body.quoteToken, 5000);
    if (!quoteToken) {
      writeJsonWithTiming(
        res,
        400,
        { error: "A valid quote token is required." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    let checkoutQuote;
    try {
      checkoutQuote = verifyQuoteToken(quoteToken, { env: process.env });
    } catch (error) {
      const status = Number(error && error.status) || 400;
      const safeMessage =
        status >= 500
          ? "Payments are temporarily unavailable."
          : error instanceof QuoteTokenError && error.message
            ? error.message
            : "Invalid quote token.";
      writeJsonWithTiming(
        res,
        status,
        { error: safeMessage, code: error && error.code ? error.code : "INVALID_QUOTE_TOKEN" },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const amountCents = Number(checkoutQuote.totalPriceCents);
    if (
      !Number.isFinite(amountCents) ||
      amountCents < STRIPE_MIN_AMOUNT_CENTS ||
      amountCents > STRIPE_MAX_AMOUNT_CENTS
    ) {
      writeJsonWithTiming(
        res,
        400,
        {
          error: `Invalid amount. Allowed range is ${STRIPE_MIN_AMOUNT_CENTS / 100} to ${
            STRIPE_MAX_AMOUNT_CENTS / 100
          } USD.`,
        },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const origin = getStripeReturnOrigin();
    const successUrl = process.env.STRIPE_SUCCESS_URL || `${origin}/quote?payment=success`;
    const cancelUrl = process.env.STRIPE_CANCEL_URL || `${origin}/quote?payment=cancelled`;
    const serviceName = normalizeString(checkoutQuote.serviceName || "Cleaning Service", 120);
    const customerEmail = normalizeString(body.customerEmail, 320);
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail);

    const metadata = {
      service_type: normalizeString(checkoutQuote.serviceType || "", 100),
      selected_date: normalizeString(checkoutQuote.selectedDate || "", 100),
      selected_time: normalizeString(checkoutQuote.selectedTime || "", 100),
      customer_name: normalizeString(checkoutQuote.customerName || "", 250),
      customer_phone: normalizeString(checkoutQuote.customerPhone || "", 80),
      full_address: normalizeString(checkoutQuote.fullAddress || checkoutQuote.address || "", 500),
    };

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: {
                name: serviceName,
                description: "Cleaning service booking",
              },
            },
          },
        ],
        phone_number_collection: { enabled: true },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        ...(isValidEmail ? { customer_email: customerEmail } : {}),
      });

      writeJsonWithTiming(
        res,
        200,
        {
          url: session.url,
          id: session.id,
        },
        requestStartNs,
        requestContext.cacheHit
      );
    } catch (error) {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "stripe_checkout_error",
        message: error && error.message ? error.message : "Unknown Stripe error",
      });
      writeJsonWithTiming(
        res,
        502,
        { error: "Failed to create Stripe checkout session" },
        requestStartNs,
        requestContext.cacheHit
      );
    }
  }

  async function handleQuoteSubmissionRequest(
    req,
    res,
    requestStartNs,
    requestContext,
    requestLogger,
    quoteOpsLedger = null
  ) {
    requestContext.cacheHit = false;

    if (req.method !== "POST") {
      writeHeadWithTiming(
        res,
        405,
        {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          Allow: "POST",
        },
        requestStartNs,
        requestContext.cacheHit
      );
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    if (enforcePostRateLimit(req, res, requestStartNs, requestContext, QUOTE_SUBMIT_ENDPOINT)) {
      return;
    }

    let body;
    try {
      body = await readJsonBody(req, MAX_JSON_BODY_BYTES);
    } catch (error) {
      const isLarge = String(error && error.message).toLowerCase().includes("payload");
      writeJsonWithTiming(
        res,
        isLarge ? 413 : 400,
        { error: isLarge ? "Request payload is too large" : "Invalid request body" },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const contactData = body?.contactData || body?.contact || {
      fullName: body?.fullName,
      phone: body?.phone,
      email: body?.email,
    };
    const calculatorData = body?.calculatorData || body?.quote || {
      serviceType: body?.serviceType,
      totalPrice: body?.totalPrice,
      selectedDate: body?.selectedDate,
      selectedTime: body?.selectedTime,
      fullAddress: body?.fullAddress,
      address: body?.address,
      addressLine2: body?.addressLine2,
      city: body?.city,
      state: body?.state,
      zipCode: body?.zipCode,
      rooms: body?.rooms,
      bathrooms: body?.bathrooms,
      squareMeters: body?.squareMeters,
      hasPets: body?.hasPets,
      basementCleaning: body?.basementCleaning,
      frequency: body?.frequency,
      services: body?.services,
      quantityServices: body?.quantityServices,
      additionalDetails: body?.additionalDetails,
      consent: body?.consent,
      formattedDateTime: body?.formattedDateTime,
    };
    const requestId = normalizeString(req.headers["x-request-id"] || crypto.randomUUID(), 120);
    const submittedAt = normalizeString(body?.submittedAt || new Date().toISOString(), 64);

    const pricing = calculateQuotePricing(calculatorData);
    const submittedTotalPrice = Number(calculatorData && calculatorData.totalPrice);
    if (
      Number.isFinite(submittedTotalPrice) &&
      Math.abs(submittedTotalPrice - pricing.totalPrice) > 0.009
    ) {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "quote_total_repriced",
        submitted_total: submittedTotalPrice,
        canonical_total: pricing.totalPrice,
      });
    }

    const canonicalCalculatorData = {
      ...calculatorData,
      serviceType: pricing.serviceType,
      frequency: pricing.frequency,
      rooms: pricing.rooms,
      bathrooms: pricing.bathrooms,
      squareMeters: pricing.squareMeters,
      basementCleaning: pricing.basementCleaning,
      services: pricing.services,
      quantityServices: pricing.quantityServices,
      totalPrice: pricing.totalPrice,
    };
    const source = body?.source || "Website Quote";
    const userAgent = normalizeString(req.headers["user-agent"], 180);
    const payloadForRetry = buildRetryPayload(
      contactData,
      canonicalCalculatorData,
      source,
      requestId,
      submittedAt,
      userAgent
    );

    let leadConnector;
    try {
      leadConnector = getLeadConnectorClient();
    } catch (error) {
      const safeMessage = "Quote requests are temporarily unavailable.";
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "quote_client_init_error",
        message: error && error.message ? error.message : "Unknown LeadConnector init error",
      });
      if (quoteOpsLedger) {
        await quoteOpsLedger.recordSubmission({
          ok: false,
          requestId,
          sourceRoute: requestContext.route,
          source,
          customerName: contactData && contactData.fullName,
          customerPhone: contactData && contactData.phone,
          customerEmail: contactData && contactData.email,
          serviceType: pricing.serviceType,
          serviceName: pricing.serviceName,
          totalPrice: pricing.totalPrice,
          totalPriceCents: pricing.totalPriceCents,
          selectedDate: canonicalCalculatorData.selectedDate,
          selectedTime: canonicalCalculatorData.selectedTime,
          fullAddress: canonicalCalculatorData.fullAddress || canonicalCalculatorData.address,
          httpStatus: 503,
          code: "CLIENT_INIT_ERROR",
          retryable: false,
          errorMessage: safeMessage,
          payloadForRetry,
        });
      }
      writeJsonWithTiming(
        res,
        503,
        { error: safeMessage },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const result = await leadConnector.submitQuoteSubmission({
      contactData,
      calculatorData: canonicalCalculatorData,
      source,
      pageUrl: `${SITE_ORIGIN}${QUOTE_PUBLIC_PATH}`,
      requestId,
      userAgent,
      submittedAt,
    });

    if (!result.ok) {
      const resultStatus = Number(result.status) || 502;
      const safeErrorMessage =
        resultStatus >= 400 && resultStatus < 500
          ? result.message || "Failed to submit quote request"
          : "Quote requests are temporarily unavailable.";

      requestLogger.log({
        ts: new Date().toISOString(),
        type: "quote_submission_error",
        status: resultStatus,
        code: result.code,
        retryable: Boolean(result.retryable),
      });
      if (quoteOpsLedger) {
        await quoteOpsLedger.recordSubmission({
          ok: false,
          requestId,
          sourceRoute: requestContext.route,
          source,
          customerName: contactData && contactData.fullName,
          customerPhone: contactData && contactData.phone,
          customerEmail: contactData && contactData.email,
          serviceType: pricing.serviceType,
          serviceName: pricing.serviceName,
          totalPrice: pricing.totalPrice,
          totalPriceCents: pricing.totalPriceCents,
          selectedDate: canonicalCalculatorData.selectedDate,
          selectedTime: canonicalCalculatorData.selectedTime,
          fullAddress: canonicalCalculatorData.fullAddress || canonicalCalculatorData.address,
          httpStatus: resultStatus,
          code: result.code,
          retryable: Boolean(result.retryable),
          warnings: result.warnings,
          errorMessage: safeErrorMessage,
          payloadForRetry,
        });
      }
      writeJsonWithTiming(
        res,
        resultStatus,
        { error: safeErrorMessage, code: result.code },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    requestLogger.log({
      ts: new Date().toISOString(),
      type: "quote_submission_success",
      status: result.status,
      contact_id: result.contactId,
      custom_fields_updated: Boolean(result.customFieldsUpdated),
      custom_field_sync_reason: result.customFieldSyncReason || "",
      opportunity_sync_reason: result.opportunitySyncReason || "",
      warnings: result.warnings || [],
    });

    let quoteToken = "";
    try {
      quoteToken = createQuoteToken(
        {
          ...pricing,
          customerName: normalizeString(contactData && contactData.fullName, 250),
          customerPhone: normalizeString(contactData && contactData.phone, 80),
        },
        { env: process.env }
      );
    } catch (error) {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "quote_token_error",
        message: error && error.message ? error.message : "Unknown quote token error",
      });
    }

    if (quoteOpsLedger) {
      await quoteOpsLedger.recordSubmission({
        ok: true,
        requestId,
        sourceRoute: requestContext.route,
        source,
        customerName: contactData && contactData.fullName,
        customerPhone: contactData && contactData.phone,
        customerEmail: contactData && contactData.email,
        serviceType: pricing.serviceType,
        serviceName: pricing.serviceName,
        totalPrice: pricing.totalPrice,
        totalPriceCents: pricing.totalPriceCents,
        selectedDate: canonicalCalculatorData.selectedDate,
        selectedTime: canonicalCalculatorData.selectedTime,
        fullAddress: canonicalCalculatorData.fullAddress || canonicalCalculatorData.address,
        httpStatus: Number(result.status) || 200,
        code: result.code || "OK",
        retryable: Boolean(result.retryable),
        warnings: result.warnings,
        contactId: result.contactId,
        noteCreated: result.noteCreated,
        opportunityCreated: result.opportunityCreated,
        customFieldsUpdated: result.customFieldsUpdated,
        usedExistingContact: result.usedExistingContact,
        payloadForRetry,
      });
    }

    writeJsonWithTiming(
      res,
      Number(result.status) || 200,
      {
        ok: true,
        success: true,
        contactId: result.contactId,
        usedExistingContact: Boolean(result.usedExistingContact),
        customFieldsUpdated: Boolean(result.customFieldsUpdated),
        customFieldSyncReason: result.customFieldSyncReason || "",
        noteCreated: Boolean(result.noteCreated),
        opportunityCreated: Boolean(result.opportunityCreated),
        opportunitySyncReason: result.opportunitySyncReason || "",
        skipped: result.skipped || {},
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        pricing: {
          totalPrice: pricing.totalPrice,
          totalPriceCents: pricing.totalPriceCents,
          currency: pricing.currency,
          serviceName: pricing.serviceName,
        },
        quoteToken,
      },
      requestStartNs,
      requestContext.cacheHit
    );
  }

  return {
    handleQuoteSubmissionRequest,
    handleStripeCheckoutRequest,
  };
}

module.exports = {
  createApiHandlers,
};
