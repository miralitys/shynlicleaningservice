"use strict";

const crypto = require("crypto");
const {
  extractServiceAreaZipFromText,
  isSupportedServiceAreaZip,
  normalizeServiceAreaZip,
} = require("../service-area-zips");

function resolveQuoteServiceAreaZip(calculatorData) {
  const explicitZip = normalizeServiceAreaZip(calculatorData && calculatorData.zipCode);
  if (explicitZip) return explicitZip;

  const fallbackSources = [
    calculatorData && calculatorData.fullAddress,
    calculatorData && calculatorData.address,
    calculatorData && calculatorData.addressLine2,
  ];

  for (const source of fallbackSources) {
    const extractedZip = extractServiceAreaZipFromText(source);
    if (extractedZip) return extractedZip;
  }

  return "";
}

function createApiHandlers(deps = {}) {
  const {
    CLEANER_APPLICATION_SUBMIT_ENDPOINT,
    MAX_JSON_BODY_BYTES,
    GHL_INBOUND_SMS_WEBHOOK_ENDPOINT,
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

  function getGhlInboundSmsWebhookSecret() {
    return normalizeString(process.env.GHL_INBOUND_SMS_WEBHOOK_SECRET, 512);
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

  function getSafeRequestUrl(req) {
    try {
      return new URL(req.url || "/", `http://${req && req.headers ? req.headers.host || "localhost" : "localhost"}`);
    } catch {
      return new URL("http://localhost/");
    }
  }

  function hasValidGhlInboundSmsWebhookSecret(req) {
    const configuredSecret = getGhlInboundSmsWebhookSecret();
    if (!configuredSecret) return true;

    const requestUrl = getSafeRequestUrl(req);
    const candidateSecrets = [
      req && req.headers ? req.headers["x-ghl-webhook-secret"] : "",
      req && req.headers ? req.headers["x-shynli-webhook-secret"] : "",
      requestUrl.searchParams.get("secret") || "",
    ]
      .map((value) => normalizeString(value, 512))
      .filter(Boolean);

    return candidateSecrets.some((candidate) => {
      const left = Buffer.from(candidate, "utf8");
      const right = Buffer.from(configuredSecret, "utf8");
      return left.length === right.length && crypto.timingSafeEqual(left, right);
    });
  }

  function getObjectPath(source, path) {
    if (!source || typeof source !== "object") return "";
    const segments = String(path || "").split(".").filter(Boolean);
    let current = source;
    for (const segment of segments) {
      if (!current || typeof current !== "object" || Array.isArray(current) || !(segment in current)) {
        return "";
      }
      current = current[segment];
    }
    return current;
  }

  function pickWebhookString(sources, paths, maxLength = 500) {
    for (const source of Array.isArray(sources) ? sources : []) {
      for (const path of Array.isArray(paths) ? paths : []) {
        const value = path.includes(".") ? getObjectPath(source, path) : source && source[path];
        if (typeof value !== "string" && typeof value !== "number") continue;
        const normalized = normalizeString(value, maxLength);
        if (normalized) return normalized;
      }
    }
    return "";
  }

  function normalizePhoneDigits(value) {
    let digits = normalizeString(value, 80).replace(/\D+/g, "");
    if (!digits) return "";
    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    return digits.slice(0, 10);
  }

  function phoneDigitsMatch(left, right) {
    return Boolean(left && right && normalizePhoneDigits(left) === normalizePhoneDigits(right));
  }

  function parseLooseWebhookBody(rawBody) {
    const bodyText = Buffer.from(rawBody || "").toString("utf8").trim();
    if (!bodyText) return null;

    try {
      const parsed = JSON.parse(bodyText);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {}

    try {
      const params = new URLSearchParams(bodyText);
      const payload = Object.fromEntries(params.entries());
      return Object.keys(payload).length > 0 ? payload : null;
    } catch {
      return null;
    }
  }

  function buildWebhookSources(payload) {
    const sources = [];
    const candidates = [
      payload,
      payload && payload.message,
      payload && payload.payload,
      payload && payload.data,
      payload && payload.eventData,
      payload && payload.messageData,
      payload && payload.webhookData,
    ];
    for (const candidate of candidates) {
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        sources.push(candidate);
      }
    }
    return sources;
  }

  function normalizeWebhookTimestamp(value) {
    const normalized = normalizeString(value, 80);
    if (!normalized) return new Date().toISOString();
    const timestampMs = Date.parse(normalized);
    return Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : new Date().toISOString();
  }

  function normalizeGhlInboundSmsPayload(payload) {
    const sources = buildWebhookSources(payload);
    const message = pickWebhookString(sources, [
      "body",
      "text",
      "content",
      "message.body",
      "message.text",
      "message.content",
      "payload.body",
      "data.body",
    ], 1000);
    const messageType = pickWebhookString(sources, [
      "messageType",
      "type",
      "message.messageType",
      "message.type",
    ], 80).toUpperCase();
    const eventType = pickWebhookString(sources, [
      "type",
      "eventType",
      "event",
      "triggerType",
      "webhookType",
    ], 120);
    const directionValue = pickWebhookString(sources, [
      "direction",
      "message.direction",
      "messageDirection",
      "payload.direction",
    ], 40).toLowerCase();
    const phone = pickWebhookString(sources, [
      "from",
      "fromNumber",
      "message.from",
      "phone",
      "phoneNumber",
      "contact.phone",
      "contactPhone",
      "message.phone",
    ], 120);
    const phoneDigits = normalizePhoneDigits(phone);
    return {
      eventType,
      messageType,
      direction:
        directionValue === "inbound" || /inbound/i.test(eventType) ? "inbound" : directionValue || "inbound",
      message,
      phone,
      phoneDigits,
      contactId: pickWebhookString(sources, [
        "contactId",
        "contact.id",
        "message.contactId",
        "message.contact.id",
      ], 120),
      conversationId: pickWebhookString(sources, [
        "conversationId",
        "conversation.id",
        "message.conversationId",
      ], 120),
      messageId: pickWebhookString(sources, [
        "messageId",
        "message.messageId",
        "message.id",
        "id",
      ], 120),
      locationId: pickWebhookString(sources, [
        "locationId",
        "location.id",
        "message.locationId",
      ], 120),
      sentAt: normalizeWebhookTimestamp(
        pickWebhookString(sources, [
          "dateAdded",
          "createdAt",
          "timestamp",
          "message.dateAdded",
          "message.createdAt",
        ], 80)
      ),
    };
  }

  function getEntrySmsHistory(entry = {}) {
    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    const adminSms = payload.adminSms && typeof payload.adminSms === "object" ? payload.adminSms : {};
    return Array.isArray(adminSms.history) ? adminSms.history : [];
  }

  function isOrderLikeEntry(entry = {}) {
    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    const adminOrder = payload.adminOrder && typeof payload.adminOrder === "object" ? payload.adminOrder : {};
    return Boolean(
      adminOrder &&
        (adminOrder.isCreated ||
          normalizeString(adminOrder.status, 40) ||
          normalizeString(adminOrder.selectedDate, 32) ||
          normalizeString(adminOrder.selectedTime, 32))
    );
  }

  function buildSmsHistoryEntryKey(entry = {}) {
    const messageId = normalizeString(entry && entry.messageId, 120);
    if (messageId) return `message:${messageId}`;
    return [
      normalizeString(entry && entry.conversationId, 120),
      normalizeString(entry && entry.direction, 20).toLowerCase(),
      normalizeString(entry && entry.sentAt, 80),
      normalizePhoneDigits(entry && entry.phone),
      normalizeString(entry && entry.message, 1000),
    ].join("|");
  }

  function prependSmsHistoryEntry(existingEntries = [], entry = null) {
    if (!entry) return Array.isArray(existingEntries) ? existingEntries : [];
    const nextEntryKey = buildSmsHistoryEntryKey(entry);
    const currentEntries = Array.isArray(existingEntries) ? existingEntries : [];
    if (currentEntries.some((candidate) => buildSmsHistoryEntryKey(candidate) === nextEntryKey)) {
      return currentEntries;
    }
    return [entry, ...currentEntries].slice(0, 50);
  }

  function buildInboundSmsHistoryRecord(payload, options = {}) {
    return {
      id: normalizeString(payload.messageId, 120) || crypto.randomUUID(),
      sentAt: normalizeWebhookTimestamp(payload.sentAt),
      message: normalizeString(payload.message, 1000),
      phone: normalizeString(payload.phone, 80),
      contactId: normalizeString(options.contactId || payload.contactId, 120),
      channel: "ghl",
      direction: "inbound",
      source: "client",
      targetType: normalizeString(options.targetType, 40).toLowerCase(),
      targetRef: normalizeString(options.targetRef, 160),
      conversationId: normalizeString(payload.conversationId, 120),
      messageId: normalizeString(payload.messageId, 120),
    };
  }

  function getEntryOrderStatus(entry = {}) {
    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    const adminOrder = payload.adminOrder && typeof payload.adminOrder === "object" ? payload.adminOrder : {};
    return normalizeString(adminOrder.status, 40).toLowerCase();
  }

  function scoreEntrySmsTarget(entry, payload) {
    if (!entry || typeof entry !== "object") return -1;
    const history = getEntrySmsHistory(entry);
    let score = 0;
    if (
      payload.conversationId &&
      history.some((item) => normalizeString(item && item.conversationId, 120) === payload.conversationId)
    ) {
      score += 100;
    }
    if (payload.contactId) {
      if (normalizeString(entry.contactId, 120) === payload.contactId) {
        score += 80;
      } else if (
        history.some((item) => normalizeString(item && item.contactId, 120) === payload.contactId)
      ) {
        score += 70;
      }
    }
    if (phoneDigitsMatch(entry.customerPhone, payload.phoneDigits)) {
      score += 40;
    }
    if (isOrderLikeEntry(entry)) {
      score += 10;
      const orderStatus = getEntryOrderStatus(entry);
      if (orderStatus && !["completed", "canceled"].includes(orderStatus)) {
        score += 5;
      }
    }
    return score;
  }

  function scoreStaffSmsTarget(staffRecord, payload) {
    if (!staffRecord || typeof staffRecord !== "object") return -1;
    const history = Array.isArray(staffRecord.smsHistory) ? staffRecord.smsHistory : [];
    let score = 0;
    if (
      payload.conversationId &&
      history.some((item) => normalizeString(item && item.conversationId, 120) === payload.conversationId)
    ) {
      score += 100;
    }
    if (
      payload.contactId &&
      history.some((item) => normalizeString(item && item.contactId, 120) === payload.contactId)
    ) {
      score += 80;
    }
    if (phoneDigitsMatch(staffRecord.phone, payload.phoneDigits)) {
      score += 40;
    }
    return score;
  }

  function selectBestSmsTarget(entryCandidates = [], staffCandidates = []) {
    const ranked = [];
    for (const entry of Array.isArray(entryCandidates) ? entryCandidates : []) {
      const score = entry.score;
      if (!(score > 0)) continue;
      ranked.push({
        kind: "entry",
        score,
        priority: isOrderLikeEntry(entry.record) ? 2 : 1,
        updatedAt: Date.parse(normalizeString(entry.record && (entry.record.updatedAt || entry.record.createdAt), 80)) || 0,
        record: entry.record,
      });
    }
    for (const staff of Array.isArray(staffCandidates) ? staffCandidates : []) {
      const score = staff.score;
      if (!(score > 0)) continue;
      ranked.push({
        kind: "staff",
        score,
        priority: 0,
        updatedAt: Date.parse(normalizeString(staff.record && (staff.record.updatedAt || staff.record.createdAt), 80)) || 0,
        record: staff.record,
      });
    }

    ranked.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.priority !== left.priority) return right.priority - left.priority;
      return right.updatedAt - left.updatedAt;
    });

    return ranked[0] || null;
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
      request_id: normalizeString(checkoutQuote.requestId || "", 120),
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
        client_reference_id: normalizeString(checkoutQuote.requestId || "", 120) || undefined,
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

  async function handleGhlInboundSmsWebhookRequest(
    req,
    res,
    requestStartNs,
    requestContext,
    requestLogger,
    quoteOpsLedger = null,
    staffStore = null
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

    if (!hasValidGhlInboundSmsWebhookSecret(req)) {
      writeJsonWithTiming(
        res,
        401,
        { error: "Invalid webhook secret." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    let rawBody;
    try {
      rawBody = await readBufferBody(req, MAX_JSON_BODY_BYTES);
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

    const parsedBody = parseLooseWebhookBody(rawBody);
    if (!parsedBody) {
      writeJsonWithTiming(
        res,
        400,
        { error: "Invalid webhook body." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const payload = normalizeGhlInboundSmsPayload(parsedBody);
    const configuredLocationId = normalizeString(process.env.GHL_LOCATION_ID, 120);
    if (
      configuredLocationId &&
      payload.locationId &&
      payload.locationId !== configuredLocationId
    ) {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "ghl_inbound_sms_ignored_location",
        endpoint: GHL_INBOUND_SMS_WEBHOOK_ENDPOINT,
        location_id: payload.locationId,
      });
      writeJsonWithTiming(
        res,
        202,
        { received: true, ignored: true, reason: "location-mismatch" },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    if (!payload.message || !payload.phoneDigits) {
      writeJsonWithTiming(
        res,
        400,
        { error: "Inbound SMS payload is missing message or phone." },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const normalizedMessageType = normalizeString(payload.messageType, 80).toUpperCase();
    if (normalizedMessageType && normalizedMessageType !== "SMS") {
      writeJsonWithTiming(
        res,
        202,
        { received: true, ignored: true, reason: "unsupported-message-type" },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    if (payload.direction !== "inbound") {
      writeJsonWithTiming(
        res,
        202,
        { received: true, ignored: true, reason: "not-inbound" },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const entryCandidates = quoteOpsLedger && typeof quoteOpsLedger.listEntries === "function"
      ? (await quoteOpsLedger.listEntries({ limit: 1000 })).map((record) => ({
          record,
          score: scoreEntrySmsTarget(record, payload),
        }))
      : [];
    const staffSnapshot =
      staffStore && typeof staffStore.getSnapshot === "function" ? await staffStore.getSnapshot() : null;
    const staffCandidates = staffSnapshot && Array.isArray(staffSnapshot.staff)
      ? staffSnapshot.staff.map((record) => ({
          record,
          score: scoreStaffSmsTarget(record, payload),
        }))
      : [];
    const bestTarget = selectBestSmsTarget(entryCandidates, staffCandidates);

    if (!bestTarget) {
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "ghl_inbound_sms_unmatched",
        endpoint: GHL_INBOUND_SMS_WEBHOOK_ENDPOINT,
        phone: payload.phone,
        contact_id: payload.contactId,
        conversation_id: payload.conversationId,
      });
      writeJsonWithTiming(
        res,
        202,
        { received: true, ignored: true, reason: "target-not-found" },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    let persisted = null;
    if (bestTarget.kind === "entry") {
      const entry = bestTarget.record;
      const nextHistory = prependSmsHistoryEntry(
        getEntrySmsHistory(entry),
        buildInboundSmsHistoryRecord(payload, {
          contactId: payload.contactId || entry.contactId,
          targetType: isOrderLikeEntry(entry) ? "order" : "client",
          targetRef: normalizeString(entry.id, 120),
        })
      );
      persisted =
        isOrderLikeEntry(entry) && typeof quoteOpsLedger.updateOrderEntry === "function"
          ? await quoteOpsLedger.updateOrderEntry(entry.id, {
              contactId: payload.contactId || entry.contactId,
              smsHistory: nextHistory,
            })
          : await quoteOpsLedger.updateClientEntry(entry.id, {
              contactId: payload.contactId || entry.contactId,
              smsHistory: nextHistory,
            });
    } else if (bestTarget.kind === "staff") {
      const staffRecord = bestTarget.record;
      const nextHistory = prependSmsHistoryEntry(
        Array.isArray(staffRecord.smsHistory) ? staffRecord.smsHistory : [],
        buildInboundSmsHistoryRecord(payload, {
          targetType: "staff",
          targetRef: normalizeString(staffRecord.id, 120),
        })
      );
      persisted = await staffStore.updateStaff(staffRecord.id, {
        smsHistory: nextHistory,
      });
    }

    requestLogger.log({
      ts: new Date().toISOString(),
      type: "ghl_inbound_sms_received",
      endpoint: GHL_INBOUND_SMS_WEBHOOK_ENDPOINT,
      phone: payload.phone,
      contact_id: payload.contactId,
      conversation_id: payload.conversationId,
      target_kind: bestTarget.kind,
      target_id: normalizeString(bestTarget.record && bestTarget.record.id, 120),
      persisted: Boolean(persisted),
    });

    writeJsonWithTiming(
      res,
      200,
      {
        received: true,
        matched: Boolean(persisted),
        target: bestTarget.kind,
        targetId: normalizeString(bestTarget.record && bestTarget.record.id, 120),
      },
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
    const serviceAreaZip = resolveQuoteServiceAreaZip(canonicalCalculatorData);
    if (!serviceAreaZip || !isSupportedServiceAreaZip(serviceAreaZip)) {
      const safeMessage = serviceAreaZip
        ? `Sorry, we do not currently service ZIP code ${serviceAreaZip}.`
        : "Please enter a valid 5-digit ZIP code within our service area.";
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "quote_submission_unsupported_zip",
        zip_code: serviceAreaZip,
      });
      writeJsonWithTiming(
        res,
        400,
        {
          error: safeMessage,
          code: "UNSUPPORTED_SERVICE_AREA_ZIP",
        },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }
    canonicalCalculatorData.zipCode = serviceAreaZip;
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
        errorMessage: result.warningMessage || "",
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
        warningMessage: result.warningMessage || "",
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

  async function handleCleanerApplicationSubmissionRequest(
    req,
    res,
    requestStartNs,
    requestContext,
    requestLogger
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

    if (enforcePostRateLimit(req, res, requestStartNs, requestContext, CLEANER_APPLICATION_SUBMIT_ENDPOINT)) {
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

    const application = body?.application || body?.cleanerApplication || body?.contact || body || {};
    const requestId = normalizeString(req.headers["x-request-id"] || crypto.randomUUID(), 120);
    const submittedAt = normalizeString(body?.submittedAt || new Date().toISOString(), 64);
    const source = body?.source || application?.source || "Website Cleaner Application";
    const userAgent = normalizeString(req.headers["user-agent"], 180);

    let leadConnector;
    try {
      leadConnector = getLeadConnectorClient();
    } catch (error) {
      const safeMessage = "Applications are temporarily unavailable.";
      requestLogger.log({
        ts: new Date().toISOString(),
        type: "cleaner_application_client_init_error",
        message: error && error.message ? error.message : "Unknown LeadConnector init error",
      });
      writeJsonWithTiming(
        res,
        503,
        { error: safeMessage },
        requestStartNs,
        requestContext.cacheHit
      );
      return;
    }

    const result = await leadConnector.submitCleanerApplication({
      application: {
        fullName: application?.fullName || application?.name,
        phone: application?.phone || application?.phoneNumber,
        email: application?.email,
        zipCode: application?.zipCode || application?.zip,
        experience: application?.experience || application?.cleaningExperience,
        details: application?.details || application?.about || application?.notes,
      },
      source,
      pageUrl: normalizeString(body?.pageUrl || body?.page || body?.sourcePageUrl || "", 256),
      requestId,
      userAgent,
      submittedAt,
    });

    if (!result.ok) {
      const resultStatus = Number(result.status) || 502;
      const safeErrorMessage =
        resultStatus >= 400 && resultStatus < 500
          ? result.message || "Failed to submit application"
          : "Applications are temporarily unavailable.";

      requestLogger.log({
        ts: new Date().toISOString(),
        type: "cleaner_application_submission_error",
        status: resultStatus,
        code: result.code,
        retryable: Boolean(result.retryable),
      });
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
      type: "cleaner_application_submission_success",
      status: result.status,
      contact_id: result.contactId,
      warnings: result.warnings || [],
    });

    writeJsonWithTiming(
      res,
      Number(result.status) || 200,
      {
        ok: true,
        success: true,
        contactId: result.contactId,
        usedExistingContact: Boolean(result.usedExistingContact),
        noteCreated: Boolean(result.noteCreated),
        skipped: result.skipped || {},
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
      },
      requestStartNs,
      requestContext.cacheHit
    );
  }

  return {
    handleCleanerApplicationSubmissionRequest,
    handleGhlInboundSmsWebhookRequest,
    handleQuoteSubmissionRequest,
    handleStripeCheckoutRequest,
    handleStripeWebhookRequest,
  };
}

module.exports = {
  createApiHandlers,
};
