"use strict";

const { URL } = require("node:url");

const DEFAULT_API_BASE_URL = "https://services.leadconnectorhq.com";
const DEFAULT_API_VERSION = "2021-07-28";
const DEFAULT_CONVERSATIONS_API_VERSION = "2021-04-15";
const DEFAULT_CONTACT_SOURCE = "Website Calculator";
const DEFAULT_CONTACT_TAGS = ["Calculator", "Price Calculation", "Booking", "Website"];
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_NOTE_MAX_LENGTH = 4000;
const DEFAULT_TEXT_MAX_LENGTH = 120;
const DEFAULT_DETAILS_MAX_LENGTH = 2000;
const DEFAULT_SERVICE_LIST_LIMIT = 20;
const DEFAULT_QUANTITY_KEYS_LIMIT = 20;
const OPPORTUNITY_PIPELINES_DISCOVERY_PATH = "/opportunities/pipelines";
const CUSTOM_FIELD_DISCOVERY_ENDPOINTS = [
  "/locations/{locationId}/customFields",
  "/locations/{locationId}/customFields/",
  "/customFields/?locationId={locationId}",
  "/locations/{locationId}/objects/contact/custom-fields",
];
const ALLOWED_BASE_HOST_SUFFIXES = ["leadconnectorhq.com", "gohighlevel.com", "msgsndr.com"];
const ALLOWED_SERVICE_TYPES = new Set(["regular", "deep", "moving"]);
const ALLOWED_FREQUENCIES = new Set(["weekly", "biweekly", "monthly"]);
const CUSTOM_FIELD_ALIASES = Object.freeze({
  fullName: ["full_name", "fullname", "contact.fullname", "contact.full_name", "contact.name", "name"],
  firstName: ["first_name", "firstname", "contact.firstname", "contact.first_name"],
  lastName: ["last_name", "lastname", "contact.lastname", "contact.last_name"],
  phone: ["phone_number", "phone", "contact.phone"],
  email: ["email_address", "email", "contact.email"],
  serviceType: ["service_type", "type_of_cleaning", "cleaning_type", "contact.service_type"],
  frequency: ["contact.frequency", "visit_frequency"],
  rooms: ["room", "rooms", "bedroom", "bedrooms", "contact.rooms", "contact.bedrooms"],
  bathrooms: ["bathroom", "bathrooms", "contact.bathrooms"],
  squareMeters: [
    "square_meters",
    "squaremeters",
    "square_feet",
    "squarefeet",
    "home_size",
    "size_of_home",
    "contact.squaremeters",
  ],
  hasPets: ["has_pets", "pets", "pet", "contact.has_pets"],
  basementCleaning: ["basement_cleaning", "contact.basement_cleaning"],
  services: ["additional_services", "addons", "add_ons", "contact.additional_services"],
  interiorWindowsCleaning: ["interior_windows_cleaning", "contact.interior_windows_cleaning"],
  blindsCleaning: ["blinds_cleaning", "contact.blinds_cleaning"],
  bedLinenChange: ["bed_linen_change", "contact.bed_linen_change"],
  additionalDetails: ["additional_details", "details", "notes", "contact.additional_details"],
  totalPrice: ["total_price", "quote_total", "contact.total_price"],
  selectedDate: ["selected_date", "booking_date", "contact.booking_date"],
  selectedTime: ["selected_time", "booking_time", "contact.booking_time"],
  formattedDateTime: ["formatted_date_time", "requested_time", "appointment_datetime"],
  address: ["address1", "service_address", "contact.address1"],
  fullAddress: ["full_address", "service_full_address"],
  addressLine2: ["address2", "address_line_2", "contact.address2"],
  city: ["contact.city"],
  state: ["contact.state"],
  zipCode: ["zip_code", "postal_code", "zipcode", "contact.postal_code"],
  consent: ["marketing_consent", "sms_consent", "contact.marketing_consent"],
  source: ["lead_source", "contact.source"],
});

class LeadConnectorError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "LeadConnectorError";
    this.status = Number.isFinite(options.status) ? options.status : 500;
    this.code = options.code || "LEADCONNECTOR_ERROR";
    this.retryable = Boolean(options.retryable);
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

function cleanInlineText(value, maxLength = DEFAULT_TEXT_MAX_LENGTH) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanMultilineText(value, maxLength = DEFAULT_DETAILS_MAX_LENGTH) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeCustomFieldLookupKey(value) {
  return cleanInlineText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function stripContactPrefixFromLookupKey(value) {
  const normalized = normalizeCustomFieldLookupKey(value);
  if (!normalized.startsWith("contact")) return normalized;
  return normalized.slice("contact".length);
}

function normalizeOpportunityLookupName(value) {
  return cleanInlineText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripOpportunityPrefix(value) {
  return normalizeOpportunityLookupName(value)
    .replace(/^(pipelines?|stages?)\s+/, "")
    .trim();
}

function buildOpportunityLookupCandidates(value) {
  const raw = cleanInlineText(value, 180);
  if (!raw) return [];
  const candidates = new Set([
    normalizeOpportunityLookupName(raw),
    stripOpportunityPrefix(raw),
  ]);
  return Array.from(candidates).filter(Boolean);
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (Number.isFinite(min) && parsed < min) return min;
  if (Number.isFinite(max) && parsed > max) return max;
  return parsed;
}

function parsePositiveNumber(value, fallback = 0, min = 0, max = Number.POSITIVE_INFINITY) {
  const parsed = Number.parseFloat(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(parsed)) return fallback;
  if (Number.isFinite(min) && parsed < min) return min;
  if (Number.isFinite(max) && parsed > max) return max;
  return parsed;
}

function parseTagList(value, fallback = DEFAULT_CONTACT_TAGS) {
  const rawList = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",");

  const tags = rawList
    .map((item) => cleanInlineText(item, 64))
    .filter(Boolean)
    .slice(0, 25);

  return tags.length > 0 ? tags : [...fallback];
}

function isAllowedLeadConnectorHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return ALLOWED_BASE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function normalizeApiBaseUrl(rawValue) {
  const value = cleanInlineText(rawValue || DEFAULT_API_BASE_URL, 256);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new LeadConnectorError("Invalid GHL_API_BASE_URL", {
      status: 500,
      code: "INVALID_CONFIG",
    });
  }

  if (parsed.protocol !== "https:") {
    throw new LeadConnectorError("GHL_API_BASE_URL must use https", {
      status: 500,
      code: "INVALID_CONFIG",
    });
  }

  if (!isAllowedLeadConnectorHost(parsed.hostname)) {
    throw new LeadConnectorError("GHL_API_BASE_URL must point to LeadConnector/HighLevel", {
      status: 500,
      code: "INVALID_CONFIG",
    });
  }

  return parsed.origin;
}

function normalizePhoneNumber(rawValue) {
  const digits = String(rawValue ?? "").replace(/\D/g, "");
  if (digits.length === 10) {
    return {
      digits,
      e164: `+1${digits}`,
    };
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return {
      digits,
      e164: `+${digits}`,
    };
  }

  return null;
}

function normalizeEmail(rawValue) {
  const email = cleanInlineText(rawValue, 254).toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function normalizeServiceType(rawValue) {
  const value = cleanInlineText(rawValue, 32).toLowerCase();
  return ALLOWED_SERVICE_TYPES.has(value) ? value : "regular";
}

function normalizeFrequency(rawValue) {
  const value = cleanInlineText(rawValue, 32).toLowerCase();
  return ALLOWED_FREQUENCIES.has(value) ? value : "";
}

function normalizeServiceList(rawValue) {
  const list = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === "string"
      ? rawValue.split(",")
      : [];

  return Array.from(
    new Set(list.map((item) => cleanInlineText(item, 64)).filter(Boolean))
  ).slice(0, DEFAULT_SERVICE_LIST_LIMIT);
}

function normalizeQuantityServices(rawValue) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {};
  }

  const output = {};
  for (const [key, value] of Object.entries(rawValue)) {
    const normalizedKey = cleanInlineText(key, 64);
    if (!normalizedKey || !/^[A-Za-z0-9._-]+$/.test(normalizedKey)) continue;
    const parsed = parsePositiveNumber(value, 0, 0, 9999);
    output[normalizedKey] = Number.isFinite(parsed) ? Math.round(parsed) : 0;
    if (Object.keys(output).length >= DEFAULT_QUANTITY_KEYS_LIMIT) {
      break;
    }
  }

  return output;
}

function resolveSubmissionInputs(input = {}) {
  const contact = input.contactData || input.contact || input.customer || {};
  const quote = input.calculatorData || input.quote || input.calculation || {};

  return { contact, quote };
}

function normalizeQuoteSubmission(input = {}, options = {}) {
  const { contact, quote } = resolveSubmissionInputs(input);

  const fullName = cleanInlineText(
    contact.fullName || contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(" "),
    120
  );
  const phone = normalizePhoneNumber(contact.phone || contact.phoneNumber || input.phone || "");
  if (!fullName) {
    throw new LeadConnectorError("fullName is required", {
      status: 400,
      code: "INVALID_SUBMISSION",
    });
  }
  if (!phone) {
    throw new LeadConnectorError("A valid US phone number is required", {
      status: 400,
      code: "INVALID_SUBMISSION",
    });
  }

  const email = normalizeEmail(contact.email || input.email || quote.email || "");
  const firstName = cleanInlineText(contact.firstName || fullName.split(" ")[0] || fullName, 80);
  const lastName = cleanInlineText(
    contact.lastName || fullName.split(" ").slice(1).join(" "),
    80
  );

  const serviceType = normalizeServiceType(quote.serviceType);
  const frequency = normalizeFrequency(quote.frequency);
  const services = normalizeServiceList(quote.services);
  const quantityServices = normalizeQuantityServices(quote.quantityServices);
  const additionalDetails = cleanMultilineText(quote.additionalDetails, DEFAULT_DETAILS_MAX_LENGTH);
  const address = cleanInlineText(quote.address, 180);
  const fullAddress = cleanInlineText(quote.fullAddress, 180);
  const addressLine2 = cleanInlineText(quote.addressLine2, 120);
  const city = cleanInlineText(quote.city, 80);
  const state = cleanInlineText(quote.state, 32);
  const zipCode = cleanInlineText(quote.zipCode, 20);
  const selectedDate = cleanInlineText(quote.selectedDate, 32);
  const selectedTime = cleanInlineText(quote.selectedTime, 32);
  const formattedDateTime = cleanInlineText(quote.formattedDateTime, 120);
  const consent = parseBoolean(quote.consent ?? input.consent, false);
  const totalPrice = Math.max(0, Math.round(parsePositiveNumber(quote.totalPrice, 0, 0)));
  const rooms = Math.max(0, Math.round(parsePositiveNumber(quote.rooms, 0, 0)));
  const bathrooms = parsePositiveNumber(quote.bathrooms, 0, 0);
  const squareMeters = Math.max(0, Math.round(parsePositiveNumber(quote.squareMeters, 0, 0)));
  const hasPets = cleanInlineText(quote.hasPets, 16);
  const basementCleaning = cleanInlineText(quote.basementCleaning, 16);
  const source = cleanInlineText(input.source || quote.source || options.source || DEFAULT_CONTACT_SOURCE, 120) || DEFAULT_CONTACT_SOURCE;
  const pageUrl = cleanInlineText(input.pageUrl || input.requestOrigin || "", 256);
  const requestId = cleanInlineText(input.requestId || input.id || "", 120);
  const userAgent = cleanInlineText(input.userAgent || "", 180);
  const submittedAt = cleanInlineText(input.submittedAt || new Date().toISOString(), 64);

  return {
    contact: {
      fullName,
      firstName,
      lastName,
      phone: phone.digits,
      phoneE164: phone.e164,
      email,
    },
    quote: {
      serviceType,
      frequency,
      rooms,
      bathrooms,
      squareMeters,
      hasPets,
      basementCleaning,
      services,
      quantityServices,
      additionalDetails,
      totalPrice,
      selectedDate,
      selectedTime,
      formattedDateTime,
      address,
      fullAddress,
      addressLine2,
      city,
      state,
      zipCode,
      consent,
    },
    meta: {
      source,
      pageUrl,
      requestId,
      userAgent,
      submittedAt,
    },
  };
}

function buildQuoteNote(submission, maxLength = DEFAULT_NOTE_MAX_LENGTH) {
  const lines = [
    "WEBSITE QUOTE SUBMISSION",
    `Name: ${submission.contact.fullName}`,
    `Phone: ${submission.contact.phone}`,
  ];

  if (submission.contact.email) {
    lines.push(`Email: ${submission.contact.email}`);
  }

  lines.push(`Source: ${submission.meta.source}`);

  if (submission.meta.pageUrl) {
    lines.push(`Page: ${submission.meta.pageUrl}`);
  }

  if (submission.quote.serviceType) {
    lines.push(`Service type: ${submission.quote.serviceType}`);
  }
  if (submission.quote.frequency) {
    lines.push(`Frequency: ${submission.quote.frequency}`);
  }
  if (submission.quote.rooms) {
    lines.push(`Rooms: ${submission.quote.rooms}`);
  }
  if (submission.quote.bathrooms) {
    lines.push(`Bathrooms: ${submission.quote.bathrooms}`);
  }
  if (submission.quote.squareMeters) {
    lines.push(`Square meters: ${submission.quote.squareMeters}`);
  }
  if (submission.quote.hasPets) {
    lines.push(`Pets: ${submission.quote.hasPets}`);
  }
  if (submission.quote.basementCleaning) {
    lines.push(`Basement cleaning: ${submission.quote.basementCleaning}`);
  }
  if (submission.quote.services.length > 0) {
    lines.push(`Services: ${submission.quote.services.join(", ")}`);
  }

  const quantityEntries = Object.entries(submission.quote.quantityServices);
  if (quantityEntries.length > 0) {
    lines.push(
      `Quantity services: ${quantityEntries
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`
    );
  }

  if (submission.quote.address || submission.quote.fullAddress) {
    lines.push(
      `Address: ${[submission.quote.fullAddress, submission.quote.address, submission.quote.addressLine2, submission.quote.city, submission.quote.state, submission.quote.zipCode]
        .filter(Boolean)
        .join(", ")}`
    );
  }

  if (submission.quote.selectedDate || submission.quote.selectedTime || submission.quote.formattedDateTime) {
    lines.push(
      `Requested time: ${[submission.quote.formattedDateTime, submission.quote.selectedDate, submission.quote.selectedTime]
        .filter(Boolean)
        .join(" ")}`
    );
  }

  lines.push(`Total price: $${submission.quote.totalPrice}`);
  lines.push(`Consent: ${submission.quote.consent ? "yes" : "no"}`);
  lines.push(`Submitted at: ${submission.meta.submittedAt}`);

  return cleanMultilineText(lines.join("\n"), maxLength);
}

function buildContactPayload(submission, config) {
  const payload = {
    firstName: submission.contact.firstName,
    lastName: submission.contact.lastName,
    phone: submission.contact.phone,
    source: config.source,
    tags: config.tags,
    locationId: config.locationId,
  };

  if (submission.contact.email) {
    payload.email = submission.contact.email;
  }

  if (submission.quote.fullAddress || submission.quote.address) {
    payload.address1 = submission.quote.fullAddress || submission.quote.address;
  }
  if (submission.quote.city) {
    payload.city = submission.quote.city;
  }
  if (submission.quote.state) {
    payload.state = submission.quote.state;
  }
  if (submission.quote.zipCode) {
    payload.postalCode = submission.quote.zipCode;
  }

  return payload;
}

function buildOpportunityPayload(submission, config, contactId) {
  return buildOpportunityPlacementPayload(submission, config, contactId, {
    pipelineId: config.pipelineId,
    pipelineStageId: config.pipelineStageId,
  });
}

function buildCustomFieldLookupCandidates(logicalKey) {
  const candidates = new Set();
  const aliases = CUSTOM_FIELD_ALIASES[logicalKey] || [];

  for (const candidate of [logicalKey, ...aliases]) {
    const raw = cleanInlineText(candidate, 180);
    if (!raw) continue;
    const lower = raw.toLowerCase();
    const normalized = normalizeCustomFieldLookupKey(raw);
    const withoutContact = stripContactPrefixFromLookupKey(raw);
    candidates.add(raw);
    candidates.add(lower);
    if (normalized) candidates.add(normalized);
    if (withoutContact) candidates.add(withoutContact);
  }

  return Array.from(candidates);
}

function findCustomFieldId(fieldMap, logicalKey) {
  if (!fieldMap || typeof fieldMap !== "object") return "";

  for (const candidate of buildCustomFieldLookupCandidates(logicalKey)) {
    const match = cleanInlineText(fieldMap[candidate], 120);
    if (match) return match;
  }

  return "";
}

function extractOpportunityPipelines(payload) {
  const candidates = [
    payload && payload.pipelines,
    payload && payload.data,
    payload && payload.items,
    payload && payload.results,
    Array.isArray(payload) ? payload : null,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function extractOpportunityStages(pipeline) {
  const candidates = [
    pipeline && pipeline.stages,
    pipeline && pipeline.pipelineStages,
    pipeline && pipeline.pipeline_stages,
    pipeline && pipeline.stageList,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function matchesOpportunityLookupByIdOrName(entity, targetId, targetName) {
  const entityId = cleanInlineText(entity && (entity.id || entity.pipelineId || entity.stageId), 128);
  if (targetId && entityId && entityId === targetId) return true;

  const entityNames = [
    cleanInlineText(entity && (entity.name || entity.pipelineName || entity.stageName || entity.label), 180),
    cleanInlineText(entity && entity.displayName, 180),
  ].filter(Boolean);

  if (!targetName || entityNames.length === 0) return false;

  const targetCandidates = buildOpportunityLookupCandidates(targetName);
  if (targetCandidates.length === 0) return false;

  return entityNames.some((name) => {
    const entityCandidates = buildOpportunityLookupCandidates(name);
    return entityCandidates.some((candidate) => targetCandidates.includes(candidate));
  });
}

function buildOpportunityPlacementPayload(submission, config, contactId, placement) {
  if (!config.createOpportunity) return null;
  if (!placement || !placement.pipelineId || !placement.pipelineStageId) return null;

  return {
    locationId: config.locationId,
    contactId,
    pipelineId: placement.pipelineId,
    pipelineStageId: placement.pipelineStageId,
    name: cleanInlineText(
      ["Website Quote", submission.contact.fullName, submission.quote.serviceType ? `(${submission.quote.serviceType})` : ""]
        .filter(Boolean)
        .join(" "),
      180
    ),
    monetaryValue: Math.max(0, Math.round(submission.quote.totalPrice || 0)),
    source: config.source,
    status: "open",
  };
}

function getResponseBodyFromResult(result) {
  if (!result) return null;
  if (typeof result.body === "object" && result.body !== null) return result.body;
  if (typeof result.body === "string" && result.body.trim()) return { message: result.body };
  return null;
}

function extractResponseMessage(body) {
  if (!body) return "";
  if (typeof body === "string") return cleanInlineText(body, 240);
  if (typeof body !== "object") return "";

  const candidates = [
    body.message,
    body.error,
    body.details,
    body.description,
    body.msg,
    body.detail,
    body.error_description,
    body.meta && body.meta.message,
    body.data && body.data.message,
    Array.isArray(body.errors) && body.errors.length > 0
      ? body.errors[0] && (body.errors[0].message || body.errors[0].error || body.errors[0].detail)
      : "",
  ];

  for (const candidate of candidates) {
    const normalized = cleanInlineText(candidate, 240);
    if (normalized) return normalized;
  }

  return "";
}

function extractContactId(payload) {
  if (!payload || typeof payload !== "object") return "";
  return cleanInlineText(
    payload.contact?.id || payload.contact?.contactId || payload.id || payload.data?.id || payload.data?.contactId || payload.result?.id || "",
    120
  );
}

function extractConversationId(payload) {
  if (!payload || typeof payload !== "object") return "";
  return cleanInlineText(
    payload.conversationId || payload.conversation?.id || payload.data?.conversationId || payload.data?.conversation?.id || "",
    120
  );
}

function extractMessageId(payload) {
  if (!payload || typeof payload !== "object") return "";
  return cleanInlineText(
    payload.messageId ||
      payload.id ||
      payload.message?.id ||
      payload.data?.id ||
      payload.data?.messageId ||
      "",
    120
  );
}

function looksDuplicateLike(status, body) {
  const bodyText = JSON.stringify(body || {}).toLowerCase();
  return (
    status === 409 ||
    status === 422 ||
    (status === 400 && /duplicate|duplicated|already exists|already exist/.test(bodyText))
  );
}

function buildRequestHeaders(config, options = {}) {
  const version = cleanInlineText(options.version, 32) || config.apiVersion;
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    Version: version,
  };
}

async function requestJson(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
      redirect: "error",
    });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    let body = null;
    if (contentType.includes("application/json")) {
      try {
        body = await response.json();
      } catch {
        body = null;
      }
    } else {
      try {
        body = await response.text();
      } catch {
        body = null;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
      headers: response.headers,
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new LeadConnectorError("LeadConnector request timed out", {
        status: 504,
        code: "UPSTREAM_TIMEOUT",
        retryable: true,
      });
    }

    throw new LeadConnectorError("LeadConnector request failed", {
      status: 502,
      code: "UPSTREAM_REQUEST_FAILED",
      retryable: true,
      details: cleanInlineText(error && error.message ? error.message : "", 180),
    });
  } finally {
    clearTimeout(timer);
  }
}

async function createContact(fetchImpl, config, submission) {
  const url = new URL("/contacts/", config.apiBaseUrl).toString();
  const response = await requestJson(
    fetchImpl,
    url,
    {
      method: "POST",
      headers: buildRequestHeaders(config),
      body: JSON.stringify(buildContactPayload(submission, config)),
    },
    config.requestTimeoutMs
  );

  if (response.ok) {
    return {
      ...response,
      contactId: extractContactId(response.body),
    };
  }

  return response;
}

async function findContactByPhone(fetchImpl, config, phoneDigits) {
  const url = new URL("/contacts/", config.apiBaseUrl);
  url.searchParams.set("phone", phoneDigits);
  url.searchParams.set("locationId", config.locationId);

  const response = await requestJson(
    fetchImpl,
    url.toString(),
    {
      method: "GET",
      headers: buildRequestHeaders(config),
    },
    config.requestTimeoutMs
  );

  if (!response.ok) {
    return {
      ...response,
      contactId: "",
    };
  }

  const body = response.body;
  const list =
    (body && body.contacts) ||
    (body && body.data) ||
    (Array.isArray(body) ? body : []);

  const first = Array.isArray(list) && list.length > 0 ? list[0] : null;
  return {
    ...response,
    contactId: extractContactId(first || {}),
  };
}

async function updateContact(fetchImpl, config, contactId, submission) {
  const url = new URL(`/contacts/${encodeURIComponent(contactId)}`, config.apiBaseUrl).toString();
  const payload = buildContactPayload(submission, config);
  delete payload.locationId;

  return requestJson(
    fetchImpl,
    url,
    {
      method: "PUT",
      headers: buildRequestHeaders(config),
      body: JSON.stringify(payload),
    },
    config.requestTimeoutMs
  );
}

async function sendConversationMessage(fetchImpl, config, payload) {
  const url = new URL("/conversations/messages", config.apiBaseUrl).toString();
  return requestJson(
    fetchImpl,
    url,
    {
      method: "POST",
      headers: buildRequestHeaders(config, {
        version: config.conversationsApiVersion || DEFAULT_CONVERSATIONS_API_VERSION,
      }),
      body: JSON.stringify(payload),
    },
    config.requestTimeoutMs
  );
}

function buildDiscoveredCustomFieldMap(payload) {
  const fields = payload && (
    payload.customFields ||
    payload.fields ||
    payload.data ||
    payload.custom_fields ||
    (Array.isArray(payload) ? payload : null)
  );
  const list = Array.isArray(fields) ? fields : [];
  const map = {};

  for (const field of list) {
    const objectType = cleanInlineText(
      field && (field.objectType || field.object_type || field.object),
      64
    ).toLowerCase();
    if (objectType && objectType !== "contact") continue;

    const key = cleanInlineText(
      field && (field.name || field.key || field.fieldKey || field.uniqueKey || field.fieldName),
      180
    );
    const fieldId = cleanInlineText(
      field && (field.id || field.fieldId || field.customFieldId),
      120
    );
    if (!key || !fieldId) continue;

    const raw = key;
    const lower = raw.toLowerCase();
    const normalized = normalizeCustomFieldLookupKey(raw);
    const withoutContact = stripContactPrefixFromLookupKey(raw);
    map[raw] = fieldId;
    map[lower] = fieldId;
    if (normalized) map[normalized] = fieldId;
    if (withoutContact) map[withoutContact] = fieldId;
  }

  return Object.keys(map).length > 0 ? map : null;
}

async function discoverCustomFieldMap(fetchImpl, config) {
  const locationId = cleanInlineText(config.locationId, 128);
  if (!locationId) return null;

  for (const pathTemplate of CUSTOM_FIELD_DISCOVERY_ENDPOINTS) {
    const path = pathTemplate.replaceAll("{locationId}", encodeURIComponent(locationId));
    const url = new URL(path, config.apiBaseUrl).toString();
    try {
      const response = await requestJson(
        fetchImpl,
        url,
        {
          method: "GET",
          headers: buildRequestHeaders(config),
        },
        config.requestTimeoutMs
      );
      if (!response.ok) continue;
      const map = buildDiscoveredCustomFieldMap(response.body);
      if (map) return map;
    } catch {
      continue;
    }
  }

  return null;
}

async function resolveCustomFieldMap(fetchImpl, config) {
  if (config.customFieldMap && typeof config.customFieldMap === "object") {
    return config.customFieldMap;
  }

  if (!config.enableCustomFieldAutoDiscovery) {
    return null;
  }

  if (config.discoveredCustomFieldMapLoaded) {
    return config.discoveredCustomFieldMap || null;
  }

  if (!config.discoveredCustomFieldMapPromise) {
    config.discoveredCustomFieldMapPromise = discoverCustomFieldMap(fetchImpl, config)
      .then((map) => {
        config.discoveredCustomFieldMap = map;
        config.discoveredCustomFieldMapLoaded = true;
        return map;
      })
      .catch(() => {
        config.discoveredCustomFieldMap = null;
        config.discoveredCustomFieldMapLoaded = true;
        return null;
      })
      .finally(() => {
        config.discoveredCustomFieldMapPromise = null;
      });
  }

  return config.discoveredCustomFieldMapPromise;
}

async function discoverOpportunityPlacement(fetchImpl, config) {
  const locationId = cleanInlineText(config.locationId, 128);
  if (!locationId) {
    return { pipelineId: "", pipelineStageId: "", reason: "opportunity_location_missing" };
  }

  const url = new URL(OPPORTUNITY_PIPELINES_DISCOVERY_PATH, config.apiBaseUrl);
  url.searchParams.set("locationId", locationId);

  try {
    const response = await requestJson(
      fetchImpl,
      url.toString(),
      {
        method: "GET",
        headers: buildRequestHeaders(config),
      },
      config.requestTimeoutMs
    );

    if (!response.ok) {
      return { pipelineId: "", pipelineStageId: "", reason: "opportunity_pipeline_lookup_failed" };
    }

    const pipelines = extractOpportunityPipelines(response.body);
    if (pipelines.length === 0) {
      return { pipelineId: "", pipelineStageId: "", reason: "opportunity_pipeline_lookup_empty" };
    }

    const pipeline = pipelines.find((candidate) =>
      matchesOpportunityLookupByIdOrName(candidate, config.pipelineId, config.pipelineName)
    );
    if (!pipeline) {
      return { pipelineId: "", pipelineStageId: "", reason: "opportunity_pipeline_not_found" };
    }

    const stages = extractOpportunityStages(pipeline);
    if (stages.length === 0) {
      return { pipelineId: "", pipelineStageId: "", reason: "opportunity_stage_lookup_empty" };
    }

    const stage = stages.find((candidate) =>
      matchesOpportunityLookupByIdOrName(candidate, config.pipelineStageId, config.pipelineStageName)
    );
    if (!stage) {
      return { pipelineId: "", pipelineStageId: "", reason: "opportunity_stage_not_found" };
    }

    return {
      pipelineId: cleanInlineText(pipeline.id || pipeline.pipelineId, 128),
      pipelineStageId: cleanInlineText(stage.id || stage.stageId, 128),
      reason: "opportunity_discovered",
    };
  } catch {
    return { pipelineId: "", pipelineStageId: "", reason: "opportunity_pipeline_lookup_failed" };
  }
}

async function resolveOpportunityPlacement(fetchImpl, config) {
  if (!config.createOpportunity) {
    return { pipelineId: "", pipelineStageId: "", reason: "opportunity_disabled" };
  }

  if (config.pipelineId && config.pipelineStageId) {
    return {
      pipelineId: config.pipelineId,
      pipelineStageId: config.pipelineStageId,
      reason: "opportunity_configured",
    };
  }

  if (!config.enableOpportunityAutoDiscovery) {
    return { pipelineId: "", pipelineStageId: "", reason: "opportunity_auto_discovery_disabled" };
  }

  if (config.discoveredOpportunityPlacementLoaded) {
    return config.discoveredOpportunityPlacement;
  }

  if (!config.discoveredOpportunityPlacementPromise) {
    config.discoveredOpportunityPlacementPromise = discoverOpportunityPlacement(fetchImpl, config)
      .then((placement) => {
        config.discoveredOpportunityPlacement = placement;
        config.discoveredOpportunityPlacementLoaded = true;
        return placement;
      })
      .catch(() => {
        config.discoveredOpportunityPlacement = {
          pipelineId: "",
          pipelineStageId: "",
          reason: "opportunity_pipeline_lookup_failed",
        };
        config.discoveredOpportunityPlacementLoaded = true;
        return config.discoveredOpportunityPlacement;
      })
      .finally(() => {
        config.discoveredOpportunityPlacementPromise = null;
      });
  }

  return config.discoveredOpportunityPlacementPromise;
}

async function updateCustomFields(fetchImpl, config, contactId, submission) {
  const fieldMap = await resolveCustomFieldMap(fetchImpl, config);
  if (!fieldMap || typeof fieldMap !== "object") {
    return { ok: true, skipped: true, reason: "no_custom_field_map" };
  }

  const customFields = [];
  const entries = {
    fullName: submission.contact.fullName,
    firstName: submission.contact.firstName,
    lastName: submission.contact.lastName,
    phone: submission.contact.phone,
    email: submission.contact.email,
    serviceType: submission.quote.serviceType,
    frequency: submission.quote.frequency,
    rooms: String(submission.quote.rooms),
    bathrooms: String(submission.quote.bathrooms),
    squareMeters: String(submission.quote.squareMeters),
    hasPets: submission.quote.hasPets,
    basementCleaning: submission.quote.basementCleaning,
    services: submission.quote.services.join(", "),
    interiorWindowsCleaning: String(submission.quote.quantityServices.interiorWindowsCleaning || 0),
    blindsCleaning: String(submission.quote.quantityServices.blindsCleaning || 0),
    bedLinenChange: String(submission.quote.quantityServices.bedLinenChange || 0),
    additionalDetails: submission.quote.additionalDetails,
    totalPrice: String(submission.quote.totalPrice),
    selectedDate: submission.quote.selectedDate,
    selectedTime: submission.quote.selectedTime,
    formattedDateTime: submission.quote.formattedDateTime,
    address: submission.quote.address,
    fullAddress: submission.quote.fullAddress,
    addressLine2: submission.quote.addressLine2,
    city: submission.quote.city,
    state: submission.quote.state,
    zipCode: submission.quote.zipCode,
    consent: submission.quote.consent ? "yes" : "no",
    source: submission.meta.source,
  };

  for (const [logicalKey, value] of Object.entries(entries)) {
    if (value === undefined || value === null || value === "") continue;
    const customFieldId = findCustomFieldId(fieldMap, logicalKey);
    if (!customFieldId) continue;
    customFields.push({
      id: customFieldId,
      value: cleanInlineText(value, 500),
    });
  }

  if (customFields.length === 0) {
    return { ok: true, skipped: true, reason: "no_mapped_custom_fields" };
  }

  const url = new URL(`/contacts/${encodeURIComponent(contactId)}`, config.apiBaseUrl).toString();
  return requestJson(
    fetchImpl,
    url,
    {
      method: "PUT",
      headers: buildRequestHeaders(config),
      body: JSON.stringify({ customFields }),
    },
    config.requestTimeoutMs
  );
}

async function createNote(fetchImpl, config, contactId, submission) {
  if (!config.enableNotes) {
    return { ok: true, skipped: true, reason: "notes_disabled" };
  }

  const url = new URL(`/contacts/${encodeURIComponent(contactId)}/notes`, config.apiBaseUrl).toString();
  return requestJson(
    fetchImpl,
    url,
    {
      method: "POST",
      headers: buildRequestHeaders(config),
      body: JSON.stringify({ body: buildQuoteNote(submission, config.noteMaxLength) }),
    },
    config.requestTimeoutMs
  );
}

async function createOpportunity(fetchImpl, config, contactId, submission) {
  const placement = await resolveOpportunityPlacement(fetchImpl, config);
  const payload = buildOpportunityPlacementPayload(submission, config, contactId, placement);
  if (!payload) {
    return {
      ok: true,
      skipped: true,
      reason: placement && placement.reason ? placement.reason : "opportunity_not_configured",
    };
  }

  const url = new URL("/opportunities/", config.apiBaseUrl).toString();
  return requestJson(
    fetchImpl,
    url,
    {
      method: "POST",
      headers: buildRequestHeaders(config),
      body: JSON.stringify(payload),
    },
    config.requestTimeoutMs
  );
}

function loadLeadConnectorConfig(env = process.env) {
  const apiKey = cleanInlineText(env.GHL_API_KEY, 256);
  const locationId = cleanInlineText(env.GHL_LOCATION_ID, 128);
  const apiBaseUrl = normalizeApiBaseUrl(env.GHL_API_BASE_URL || DEFAULT_API_BASE_URL);
  const apiVersion = cleanInlineText(env.GHL_API_VERSION || DEFAULT_API_VERSION, 32) || DEFAULT_API_VERSION;
  const conversationsApiVersion =
    cleanInlineText(env.GHL_CONVERSATIONS_API_VERSION || DEFAULT_CONVERSATIONS_API_VERSION, 32) ||
    DEFAULT_CONVERSATIONS_API_VERSION;

  return {
    configured: Boolean(apiKey && locationId),
    apiKey,
    locationId,
    apiBaseUrl,
    apiVersion,
    conversationsApiVersion,
    source: cleanInlineText(env.GHL_CONTACT_SOURCE || DEFAULT_CONTACT_SOURCE, 120) || DEFAULT_CONTACT_SOURCE,
    tags: parseTagList(env.GHL_CONTACT_TAGS || DEFAULT_CONTACT_TAGS),
    requestTimeoutMs: parsePositiveInt(env.GHL_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, 1000, 60000),
    noteMaxLength: parsePositiveInt(env.GHL_NOTE_MAX_LENGTH, DEFAULT_NOTE_MAX_LENGTH, 500, 10000),
    enableNotes: parseBoolean(env.GHL_ENABLE_NOTES, true),
    createOpportunity: parseBoolean(env.GHL_CREATE_OPPORTUNITY, true),
    pipelineId: cleanInlineText(env.GHL_PIPELINE_ID, 128),
    pipelineStageId: cleanInlineText(env.GHL_PIPELINE_STAGE_ID, 128),
    pipelineName: cleanInlineText(env.GHL_PIPELINE_NAME, 120) || "Main",
    pipelineStageName: cleanInlineText(env.GHL_PIPELINE_STAGE_NAME, 120) || "New Lead",
    enableOpportunityAutoDiscovery: parseBoolean(env.GHL_AUTO_DISCOVER_OPPORTUNITY_PIPELINE, true),
    discoveredOpportunityPlacement: {
      pipelineId: "",
      pipelineStageId: "",
      reason: "opportunity_not_configured",
    },
    discoveredOpportunityPlacementLoaded: false,
    discoveredOpportunityPlacementPromise: null,
    customFieldMap: parseCustomFieldMap(env.GHL_CUSTOM_FIELDS_JSON),
    enableCustomFieldAutoDiscovery: parseBoolean(env.GHL_AUTO_DISCOVER_CUSTOM_FIELDS, true),
    discoveredCustomFieldMap: null,
    discoveredCustomFieldMapLoaded: false,
    discoveredCustomFieldMapPromise: null,
  };
}

function parseCustomFieldMap(rawValue) {
  if (!rawValue) return null;

  try {
    const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const map = {};
    for (const [key, value] of Object.entries(parsed)) {
      const normalizedKey = cleanInlineText(key, 80);
      const normalizedValue = cleanInlineText(value, 120);
      if (!normalizedKey || !normalizedValue) continue;
      map[normalizedKey] = normalizedValue;
      map[normalizedKey.toLowerCase()] = normalizedValue;
      const lookupKey = normalizeCustomFieldLookupKey(normalizedKey);
      const contactlessLookupKey = stripContactPrefixFromLookupKey(normalizedKey);
      if (lookupKey) map[lookupKey] = normalizedValue;
      if (contactlessLookupKey) map[contactlessLookupKey] = normalizedValue;
    }
    return Object.keys(map).length > 0 ? map : null;
  } catch {
    return null;
  }
}

function toResultError(error) {
  if (error instanceof LeadConnectorError) {
    return {
      ok: false,
      status: error.status,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details,
    };
  }

  return {
    ok: false,
    status: 500,
    code: "LEADCONNECTOR_ERROR",
    message: cleanInlineText(error && error.message ? error.message : "LeadConnector submission failed", 200),
    retryable: false,
  };
}

function buildNotConfiguredResult(config) {
  return {
    ok: false,
    status: 503,
    code: "NOT_CONFIGURED",
    message: "LeadConnector is not configured.",
    retryable: false,
    missing: {
      apiKey: !config.apiKey,
      locationId: !config.locationId,
    },
  };
}

function createLeadConnectorClient(options = {}) {
  const config = options.config || loadLeadConnectorConfig(options.env || process.env);
  const fetchImpl = options.fetch || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new LeadConnectorError("A fetch implementation is required", {
      status: 500,
      code: "INVALID_RUNTIME",
    });
  }

  return {
    config,
    isConfigured() {
      return config.configured;
    },
    normalizeSubmission(input, normalizeOptions) {
      return normalizeQuoteSubmission(input, normalizeOptions);
    },
    buildNote(submission) {
      return buildQuoteNote(submission);
    },
    buildContactPayload(submission) {
      return buildContactPayload(submission, config);
    },
    buildOpportunityPayload(submission, contactId, placement) {
      return buildOpportunityPlacementPayload(submission, config, contactId, placement || {
        pipelineId: config.pipelineId,
        pipelineStageId: config.pipelineStageId,
      });
    },
    async sendSmsMessage(input = {}) {
      const message = cleanMultilineText(input.message, 1000);
      if (!message) {
        return toResultError(
          new LeadConnectorError("SMS message is required", {
            status: 400,
            code: "SMS_MESSAGE_REQUIRED",
          })
        );
      }

      if (!config.configured) {
        return buildNotConfiguredResult(config);
      }

      try {
        const normalizedPhone = normalizePhoneNumber(
          input.phone || input.customerPhone || input.phoneNumber || input.toNumber || ""
        );
        let contactId = cleanInlineText(input.contactId || "", 120);

        if (!contactId) {
          if (!normalizedPhone) {
            return toResultError(
              new LeadConnectorError("A valid US phone number is required", {
                status: 400,
                code: "INVALID_PHONE",
              })
            );
          }

          const searchResponse = await findContactByPhone(fetchImpl, config, normalizedPhone.digits);
          if (!searchResponse.ok) {
            return toResultError(
              new LeadConnectorError("Failed to find contact before sending SMS", {
                status: searchResponse.status || 502,
                code: "CONTACT_LOOKUP_FAILED",
                retryable: true,
                details: getResponseBodyFromResult(searchResponse),
              })
            );
          }

          contactId = cleanInlineText(searchResponse.contactId, 120);
        }

        if (!contactId) {
          return toResultError(
            new LeadConnectorError("Contact not found in Go High Level", {
              status: 404,
              code: "CONTACT_NOT_FOUND",
            })
          );
        }

        const response = await sendConversationMessage(fetchImpl, config, {
          type: "SMS",
          contactId,
          message,
          status: "pending",
          ...(normalizedPhone ? { toNumber: normalizedPhone.e164 } : {}),
        });

        if (!response.ok) {
          return toResultError(
            new LeadConnectorError(
              extractResponseMessage(response.body) || "Failed to send SMS via Go High Level",
              {
                status: response.status || 502,
                code: "SMS_SEND_FAILED",
                retryable: Number(response.status || 0) >= 500,
                details: getResponseBodyFromResult(response),
              }
            )
          );
        }

        return {
          ok: true,
          status: response.status || 200,
          code: "OK",
          contactId,
          phoneE164: normalizedPhone ? normalizedPhone.e164 : "",
          conversationId: extractConversationId(response.body),
          messageId: extractMessageId(response.body),
          message,
        };
      } catch (error) {
        return toResultError(error);
      }
    },
    async submitQuoteSubmission(input, submitOptions = {}) {
      let submission;
      try {
        submission = normalizeQuoteSubmission(input, submitOptions);
      } catch (error) {
        return toResultError(error);
      }

      if (!config.configured) {
        return buildNotConfiguredResult(config);
      }

      const result = {
        ok: false,
        status: 500,
        code: "LEADCONNECTOR_ERROR",
        retryable: false,
        warnings: [],
        submission: {
          contact: {
            fullName: submission.contact.fullName,
            phone: submission.contact.phone,
          },
          source: submission.meta.source,
        },
      };

      try {
        let contactId = cleanInlineText(submitOptions.contactId || "", 120);
        let createResponse = null;
        let usedExistingContact = false;

        if (!contactId) {
          createResponse = await createContact(fetchImpl, config, submission);
          contactId = extractContactId(createResponse.body);
        }

        if (
          !contactId &&
          createResponse &&
          !createResponse.ok &&
          Number.isFinite(createResponse.status) &&
          createResponse.status >= 400 &&
          createResponse.status < 500
        ) {
          const searchResponse = await findContactByPhone(fetchImpl, config, submission.contact.phone);
          contactId = searchResponse.contactId;
          if (contactId) {
            usedExistingContact = true;
            const updateResponse = await updateContact(fetchImpl, config, contactId, submission);
            if (!updateResponse.ok) {
              return {
                ...toResultError(
                  new LeadConnectorError("Failed to update existing contact", {
                    status: updateResponse.status || 502,
                    code: "CONTACT_UPDATE_FAILED",
                    retryable: true,
                    details: getResponseBodyFromResult(updateResponse),
                  })
                ),
              };
            }
          }
        }

        if (!contactId) {
          return {
            ...toResultError(
              new LeadConnectorError("Failed to create contact", {
                status: createResponse ? createResponse.status : 502,
                code: "CONTACT_CREATE_FAILED",
                retryable: true,
                details: getResponseBodyFromResult(createResponse),
              })
            ),
          };
        }

        const customFieldResponse = await updateCustomFields(fetchImpl, config, contactId, submission);
        if (!customFieldResponse.ok) {
          result.warnings.push("custom_fields_update_failed");
        } else if (customFieldResponse.skipped) {
          result.warnings.push("custom_fields_skipped");
        }

        const noteResponse = await createNote(fetchImpl, config, contactId, submission);
        if (!noteResponse.ok) {
          result.warnings.push("note_failed");
        }

        const opportunityResponse = await createOpportunity(fetchImpl, config, contactId, submission);
        if (!opportunityResponse.ok) {
          result.warnings.push("opportunity_failed");
        }

        result.ok = true;
        result.status = usedExistingContact ? 200 : 201;
        result.code = "OK";
        result.contactId = contactId;
        result.usedExistingContact = usedExistingContact;
        result.customFieldsUpdated = Boolean(customFieldResponse && customFieldResponse.ok && !customFieldResponse.skipped);
        result.customFieldSyncReason = cleanInlineText(
          customFieldResponse && customFieldResponse.reason,
          120
        );
        result.noteCreated = Boolean(noteResponse && noteResponse.ok && !noteResponse.skipped);
        result.opportunityCreated = Boolean(opportunityResponse && opportunityResponse.ok && !opportunityResponse.skipped);
        result.opportunitySyncReason = cleanInlineText(
          opportunityResponse && opportunityResponse.reason,
          120
        );
        result.skipped = {
          customFields: Boolean(customFieldResponse && customFieldResponse.skipped),
          notes: Boolean(noteResponse && noteResponse.skipped),
          opportunity: Boolean(opportunityResponse && opportunityResponse.skipped),
        };
        return result;
      } catch (error) {
        return toResultError(error);
      }
    },
  };
}

module.exports = {
  LeadConnectorError,
  buildContactPayload,
  buildOpportunityPayload,
  buildQuoteNote,
  cleanInlineText,
  cleanMultilineText,
  createLeadConnectorClient,
  loadLeadConnectorConfig,
  normalizePhoneNumber,
  normalizeQuoteSubmission,
  parseBoolean,
  parseCustomFieldMap,
  parsePositiveInt,
  parsePositiveNumber,
};
