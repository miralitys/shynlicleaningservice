"use strict";

const crypto = require("crypto");

function createApiHandlers(deps = {}) {
  const {
    MAX_JSON_BODY_BYTES,
    QUOTE_PUBLIC_PATH,
    QUOTE_PUBLIC_PATHS,
    QUOTE_SUBMIT_ENDPOINT,
    SITE_ORIGIN,
    STRIPE_CHECKOUT_ENDPOINT,
    STRIPE_WEBHOOK_ENDPOINT,
    STRIPE_MAX_AMOUNT_CENTS,
    STRIPE_MIN_AMOUNT_CENTS,
    QuoteTokenError,
    calculateQuotePricing,
    createQuoteToken,
    enforcePostRateLimit,
    getAutoNotificationService,
    getLeadConnectorClient,
    listLeadManagers,
    getStripeClient,
    getStripeReturnOrigin,
    normalizeString,
    readBufferBody,
    readJsonBody,
    verifyQuoteToken,
    writeHeadWithTiming,
    writeJsonWithTiming,
  } = deps;

  const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

  function getStripeWebhookSecret() {
    return normalizeString(process.env.STRIPE_WEBHOOK_SECRET, 512);
  }

  function buildStripeWebhookError(message, code = "INVALID_STRIPE_WEBHOOK_SIGNATURE", status = 400) {
    return new QuoteTokenError(message, {
      code,
      status,
    });
  }

  function verifyStripeWebhookSignature(rawBody, signatureHeader, secret) {
    const header = normalizeString(signatureHeader, 2000);
    if (!header || !secret) {
      throw buildStripeWebhookError("Invalid Stripe webhook signature.");
    }

    const parts = header.split(",").map((part) => part.trim()).filter(Boolean);
    const timestampPart = parts.find((part) => part.startsWith("t="));
    const signatures = parts
      .filter((part) => part.startsWith("v1="))
      .map((part) => part.slice(3))
      .filter(Boolean);
    const timestamp = Number.parseInt(timestampPart ? timestampPart.slice(2) : "", 10);

    if (!Number.isFinite(timestamp) || signatures.length === 0) {
      throw buildStripeWebhookError("Invalid Stripe webhook signature.");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
      throw buildStripeWebhookError(
        "Stripe webhook signature expired.",
        "EXPIRED_STRIPE_WEBHOOK_SIGNATURE"
      );
    }

    const signedPayload = `${timestamp}.${Buffer.from(rawBody).toString("utf8")}`;
    const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const matched = signatures.some((candidate) => {
      const actualBuffer = Buffer.from(String(candidate), "utf8");
      return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
    });

    if (!matched) {
      throw buildStripeWebhookError("Invalid Stripe webhook signature.");
    }
  }

  function resolvePublicQuotePath(rawPath) {
    const normalized = normalizeString(rawPath, 120);
    if (!normalized || !normalized.startsWith("/")) {
      return QUOTE_PUBLIC_PATH;
    }

    const candidate = normalized.split("#")[0].split("?")[0] || QUOTE_PUBLIC_PATH;
    if (QUOTE_PUBLIC_PATHS instanceof Set && QUOTE_PUBLIC_PATHS.has(candidate)) {
      return candidate;
    }

    return QUOTE_PUBLIC_PATH;
  }

  function buildRetryPayload(contactData, calculatorData, source, requestId, submittedAt, userAgent, pagePath) {
    return {
      contactData,
      calculatorData,
      source,
      pageUrl: `${SITE_ORIGIN}${resolvePublicQuotePath(pagePath)}`,
      requestId,
      submittedAt,
      userAgent,
    };
  }

  function getEntryAssignedManagerId(entry) {
    if (!entry || typeof entry !== "object") return "";
    const payload = entry.payloadForRetry && typeof entry.payloadForRetry === "object" ? entry.payloadForRetry : {};
    const adminLead = payload.adminLead && typeof payload.adminLead === "object" ? payload.adminLead : {};
    return normalizeString(adminLead.managerId, 120);
  }

  async function selectNextLeadManager(quoteOpsLedger) {
    if (
      !quoteOpsLedger ||
      typeof quoteOpsLedger.listEntries !== "function" ||
      typeof listLeadManagers !== "function"
    ) {
      return null;
    }

    const managers = await listLeadManagers();
    if (!Array.isArray(managers) || managers.length === 0) {
      return null;
    }
    if (managers.length === 1) {
      return managers[0];
    }

    const activeManagerIds = new Set(managers.map((manager) => normalizeString(manager.id, 120)).filter(Boolean));
    const entries = await quoteOpsLedger.listEntries({ limit: 250 });
    const lastAssignedEntry = (Array.isArray(entries) ? entries : []).find((entry) =>
      activeManagerIds.has(getEntryAssignedManagerId(entry))
    );
    const lastAssignedManagerId = getEntryAssignedManagerId(lastAssignedEntry);
    if (!lastAssignedManagerId) {
      return managers[0];
    }

    const lastIndex = managers.findIndex((manager) => manager.id === lastAssignedManagerId);
    if (lastIndex === -1) {
      return managers[0];
    }

    return managers[(lastIndex + 1) % managers.length] || managers[0];
  }

  async function recordQuoteSubmissionWithAutoManager(input, quoteOpsLedger) {
    if (!quoteOpsLedger || typeof quoteOpsLedger.recordSubmission !== "function") {
      return null;
    }

    const createdEntry = await quoteOpsLedger.recordSubmission(input);
    if (!createdEntry || typeof quoteOpsLedger.updateLeadEntry !== "function") {
      return createdEntry;
    }

    try {
      const manager = await selectNextLeadManager(quoteOpsLedger);
      if (!manager) {
        return createdEntry;
      }
      return (
        await quoteOpsLedger.updateLeadEntry(createdEntry.id, {
          managerId: manager.id,
          managerName: manager.name,
          managerEmail: manager.email,
        })
      ) || createdEntry;
    } catch {
      return createdEntry;
    }
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
    const returnPath = resolvePublicQuotePath(body.returnPath);
    const successUrl = process.env.STRIPE_SUCCESS_URL || `${origin}${returnPath}?payment=success`;
    const cancelUrl = process.env.STRIPE_CANCEL_URL || `${origin}${returnPath}?payment=cancelled`;
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

  async function handleStripeWebhookRequest(
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

    const webhookSecret = getStripeWebhookSecret();
    if (!webhookSecret) {
      writeJsonWithTiming(
        res,
        503,
        { error: "Stripe webhook is not configured." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    let rawBody;
    try {
      rawBody = await readBufferBody(req, 256 * 1024);
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

    try {
      verifyStripeWebhookSignature(rawBody, req.headers["stripe-signature"], webhookSecret);
    } catch (error) {
      writeJsonWithTiming(
        res,
        Number(error && error.status) || 400,
        {
          error: error && error.message ? error.message : "Invalid Stripe webhook signature.",
          code: error && error.code ? error.code : "INVALID_STRIPE_WEBHOOK_SIGNATURE",
        },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    let event;
    try {
      event = JSON.parse(Buffer.from(rawBody).toString("utf8"));
    } catch {
      writeJsonWithTiming(
        res,
        400,
        { error: "Invalid Stripe webhook body." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const eventType = normalizeString(event && event.type, 120);
    const sessionObject =
      event &&
      event.data &&
      event.data.object &&
      typeof event.data.object === "object"
        ? event.data.object
        : null;
    const requestId = normalizeString(
      sessionObject &&
      sessionObject.metadata &&
      typeof sessionObject.metadata === "object"
        ? sessionObject.metadata.request_id || sessionObject.client_reference_id
        : sessionObject && sessionObject.client_reference_id,
      120
    );

    if (
      requestId &&
      quoteOpsLedger &&
      (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded")
    ) {
      const updatedEntry = await quoteOpsLedger.recordPaymentEvent(requestId, {
        provider: "stripe",
        paymentStatus: "paid",
        paymentMethod: "card",
        stripeSessionId: normalizeString(sessionObject && sessionObject.id, 160),
        stripePaymentIntentId: normalizeString(sessionObject && sessionObject.payment_intent, 160),
        customerEmail: normalizeString(
          sessionObject &&
          sessionObject.customer_details &&
          sessionObject.customer_details.email
            ? sessionObject.customer_details.email
            : sessionObject && sessionObject.customer_email,
          250
        ).toLowerCase(),
        amountTotalCents: Number.isFinite(Number(sessionObject && sessionObject.amount_total))
          ? Number(sessionObject.amount_total)
          : 0,
        currency: normalizeString(sessionObject && sessionObject.currency, 12).toLowerCase(),
        rawPaymentStatus: normalizeString(sessionObject && sessionObject.payment_status, 40).toLowerCase(),
        eventId: normalizeString(event && event.id, 160),
        eventType,
        receivedAt: new Date().toISOString(),
      });

      requestLogger.log({
        ts: new Date().toISOString(),
        type: "stripe_webhook_payment_reconciled",
        endpoint: STRIPE_WEBHOOK_ENDPOINT,
        event_type: eventType,
        request_id: requestId,
        updated: Boolean(updatedEntry),
      });
    } else {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "stripe_webhook_ignored",
        endpoint: STRIPE_WEBHOOK_ENDPOINT,
        event_type: eventType,
        request_id: requestId,
      });
    }

    writeJsonWithTiming(
      res,
      200,
      { received: true },
      requestStartNs,
      requestContext.cacheHit
    );
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
    const publicQuotePath = resolvePublicQuotePath(body?.sourcePagePath || body?.pagePath || body?.returnPath);

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
      userAgent,
      publicQuotePath
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
        await recordQuoteSubmissionWithAutoManager({
          ok: false,
          requestId,
          sourceRoute: publicQuotePath,
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
        }, quoteOpsLedger);
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
      pageUrl: `${SITE_ORIGIN}${publicQuotePath}`,
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
        await recordQuoteSubmissionWithAutoManager({
          ok: false,
          requestId,
          sourceRoute: publicQuotePath,
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
        }, quoteOpsLedger);
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
      const recordedEntry = await recordQuoteSubmissionWithAutoManager({
        ok: true,
        requestId,
        sourceRoute: publicQuotePath,
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
      }, quoteOpsLedger);

      const autoNotificationService =
        typeof getAutoNotificationService === "function" ? getAutoNotificationService() : null;
      if (
        recordedEntry &&
        autoNotificationService &&
        typeof autoNotificationService.notifyQuoteSubmissionSuccess === "function"
      ) {
        try {
          await autoNotificationService.notifyQuoteSubmissionSuccess({
            entry: recordedEntry,
            pricing,
            leadConnectorClient: leadConnector,
          });
        } catch (error) {
          requestLogger.log({
            ts: new Date().toISOString(),
            type: "quote_submission_notification_error",
            entry_id: normalizeString(recordedEntry.id, 120),
            request_id: requestId,
            message: normalizeString(error && error.message ? error.message : "Quote notifications failed.", 300),
          });
        }
      }
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
    handleStripeWebhookRequest,
  };
}

module.exports = {
  createApiHandlers,
};
