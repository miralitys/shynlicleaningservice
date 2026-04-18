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

function extractContactList(payload) {
  const list =
    (payload && payload.contacts) ||
    (payload && payload.data) ||
    (Array.isArray(payload) ? payload : []);
  return Array.isArray(list) ? list : [];
}

function normalizeContactPhoneDigits(value) {
  return cleanInlineText(value, 32).replace(/\D/g, "");
}

function buildPhoneQueryVariants(phoneDigits) {
  const normalizedDigits = normalizeContactPhoneDigits(phoneDigits);
  if (!normalizedDigits) return [];

  const variants = new Set([normalizedDigits]);
  const localDigits =
    normalizedDigits.length === 11 && normalizedDigits.startsWith("1")
      ? normalizedDigits.slice(1)
      : normalizedDigits;

  if (localDigits.length === 10) {
    variants.add(`+1${localDigits}`);
    variants.add(`1${localDigits}`);
    variants.add(`(${localDigits.slice(0, 3)}) ${localDigits.slice(3, 6)}-${localDigits.slice(6)}`);
    variants.add(`${localDigits.slice(0, 3)}-${localDigits.slice(3, 6)}-${localDigits.slice(6)}`);
  }

  return Array.from(variants).filter(Boolean);
}

function phoneDigitsMatch(left, right) {
  const leftDigits = normalizeContactPhoneDigits(left);
  const rightDigits = normalizeContactPhoneDigits(right);
  if (!leftDigits || !rightDigits) return false;
  return (
    leftDigits === rightDigits ||
    leftDigits.endsWith(rightDigits) ||
    rightDigits.endsWith(leftDigits)
  );
}

function getMatchingContactIdsFromPayload(payload, phoneDigits) {
  const normalizedDigits = normalizeContactPhoneDigits(phoneDigits);
  if (!normalizedDigits) return [];

  const seen = new Set();
  return extractContactList(payload)
    .filter((entry) =>
      phoneDigitsMatch(
        entry && (entry.phone || entry.phoneNumber || entry.mobilePhone || ""),
        normalizedDigits
      )
    )
    .map((entry) => cleanInlineText(extractContactId(entry || {}), 120))
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function hasMoreContactPages(payload, entriesCount, pageSize, currentPage) {
  const candidates = [
    payload && payload.meta,
    payload && payload.metadata,
    payload && payload.pagination,
    payload && payload.pageInfo,
    payload && payload.page_info,
    payload,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const nextPage = Number.parseInt(
      String(
        candidate.nextPage ||
          candidate.next_page ||
          candidate.next ||
          ""
      ),
      10
    );
    if (Number.isFinite(nextPage) && nextPage > currentPage) {
      return true;
    }

    const totalPages = Number.parseInt(
      String(candidate.totalPages || candidate.total_pages || ""),
      10
    );
    const reportedPage = Number.parseInt(
      String(candidate.page || candidate.currentPage || candidate.current_page || currentPage),
      10
    );
    if (Number.isFinite(totalPages) && Number.isFinite(reportedPage) && reportedPage < totalPages) {
      return true;
    }

    const totalCount = Number.parseInt(
      String(candidate.total || candidate.totalCount || candidate.total_count || ""),
      10
    );
    if (Number.isFinite(totalCount) && currentPage * pageSize < totalCount) {
      return true;
    }
  }

  return entriesCount >= pageSize;
}

async function findContactIdsByPhone(fetchImpl, config, phoneDigits, options = {}) {
  const normalizedDigits = cleanInlineText(phoneDigits, 32).replace(/\D/g, "");
  if (!normalizedDigits) {
    return {
      ok: true,
      status: 200,
      body: null,
      headers: null,
      contactIds: [],
    };
  }

  const pageSize = 100;
  const maxPages = Number.isFinite(options.maxPages) ? Math.max(1, options.maxPages) : 50;
  const queryVariants = options.includeQueryVariants
    ? buildPhoneQueryVariants(normalizedDigits)
    : [normalizedDigits];

  const requestContacts = async ({ query = "", page = 1 } = {}) => {
    const url = new URL("/contacts/", config.apiBaseUrl);
    url.searchParams.set("locationId", config.locationId);
    url.searchParams.set("limit", String(pageSize));
    if (page > 1) {
      url.searchParams.set("page", String(page));
    }
    if (query) {
      url.searchParams.set("query", query);
    }
    return requestJson(
      fetchImpl,
      url.toString(),
      {
        method: "GET",
        headers: buildRequestHeaders(config),
      },
      config.requestTimeoutMs
    );
  };

  let queriedResponse = null;
  const queriedMatches = [];
  for (const queryVariant of queryVariants) {
    const response = await requestContacts({ query: queryVariant });
    if (!queriedResponse || (!queriedResponse.ok && response.ok)) {
      queriedResponse = response;
    }
    if (!response.ok) continue;
    queriedMatches.push(...getMatchingContactIdsFromPayload(response.body, normalizedDigits));
    if (queriedMatches.length > 0) {
      break;
    }
  }
  const uniqueQueriedMatches = Array.from(new Set(queriedMatches));

  if (uniqueQueriedMatches.length > 0 && options.includeListFallback !== true) {
    return {
      ...queriedResponse,
      contactIds: uniqueQueriedMatches,
    };
  }

  let listResponse = null;
  const listMatches = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await requestContacts({ page });
    if (!listResponse || (!listResponse.ok && response.ok)) {
      listResponse = response;
    }
    if (!response.ok) break;

    const entries = extractContactList(response.body);
    const pageMatches = getMatchingContactIdsFromPayload(response.body, normalizedDigits);
    listMatches.push(...pageMatches);
    if (pageMatches.length > 0) {
      break;
    }

    if (!hasMoreContactPages(response.body, entries.length, pageSize, page)) {
      break;
    }
  }

  const contactIds = Array.from(new Set([...uniqueQueriedMatches, ...listMatches]));

  if (contactIds.length > 0) {
    return {
      ...(listResponse.ok ? listResponse : queriedResponse),
      contactIds,
    };
  }

  if (!listResponse.ok) {
    return {
      ...listResponse,
      contactIds: [],
    };
  }

  if (!queriedResponse.ok) {
    return {
      ...queriedResponse,
      contactIds: [],
    };
  }

  return {
    ...listResponse,
    contactIds: [],
  };
}

async function findContactByPhone(fetchImpl, config, phoneDigits) {
  const result = await findContactIdsByPhone(fetchImpl, config, phoneDigits);
  return {
    ...result,
    contactId: cleanInlineText(
      Array.isArray(result && result.contactIds) ? result.contactIds[0] : "",
      120
    ),
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

function extractConversationList(payload) {
  const candidates = [
    payload && payload.conversations,
    payload && payload.items,
    payload && payload.results,
    payload && payload.data,
    Array.isArray(payload) ? payload : null,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function extractConversationMessages(payload) {
  const candidates = [
    payload && payload.messages,
    payload && payload.items,
    payload && payload.results,
    payload && payload.data,
    payload && payload.conversationMessages,
    Array.isArray(payload) ? payload : null,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function extractMessageText(payload) {
  if (!payload) return "";
  if (typeof payload === "string") {
    return cleanMultilineText(payload, 1000);
  }
  if (typeof payload !== "object") return "";

  const candidates = [
    payload.body,
    payload.message,
    payload.content,
    payload.text,
    payload.textBody,
    payload.bodyText,
    payload.html,
    payload.payload && payload.payload.body,
    payload.payload && payload.payload.message,
    payload.meta && payload.meta.body,
  ];

  for (const candidate of candidates) {
    const normalized = cleanMultilineText(candidate, 1000);
    if (normalized) return normalized;
  }

  return "";
}

function normalizeConversationMessageDirection(payload) {
  if (!payload || typeof payload !== "object") return "outbound";
  if (payload.inbound === true || payload.isInbound === true) return "inbound";
  if (payload.outbound === true || payload.isOutbound === true) return "outbound";

  const rawCandidates = [
    payload.direction,
    payload.messageDirection,
    payload.directionType,
    payload.messageType,
    payload.type,
    payload.status,
  ];

  for (const candidate of rawCandidates) {
    const normalized = cleanInlineText(candidate, 80).toLowerCase();
    if (!normalized) continue;
    if (
      normalized.includes("inbound") ||
      normalized.includes("incoming") ||
      normalized.includes("received")
    ) {
      return "inbound";
    }
    if (
      normalized.includes("outbound") ||
      normalized.includes("outgoing") ||
      normalized.includes("sent")
    ) {
      return "outbound";
    }
  }

  return "outbound";
}

function isSmsLikeConversationMessage(payload) {
  if (!payload || typeof payload !== "object") return false;

  const typeCandidates = [
    payload.type,
    payload.messageType,
    payload.channel,
    payload.messageChannel,
    payload.directionType,
    payload.meta && payload.meta.channel,
  ]
    .map((value) => cleanInlineText(value, 80).toLowerCase())
    .filter(Boolean);

  if (typeCandidates.some((value) => value.includes("sms"))) return true;
  if (
    typeCandidates.some(
      (value) =>
        value.includes("email") ||
        value.includes("call") ||
        value.includes("voicemail") ||
        value.includes("facebook") ||
        value.includes("instagram") ||
        value.includes("whatsapp") ||
        value.includes("review") ||
        value.includes("note")
    )
  ) {
    return false;
  }

  return Boolean(extractMessageText(payload));
}

function normalizeConversationMessageRecord(payload, fallbackConversationId = "") {
  if (!payload || typeof payload !== "object") return null;
  if (!isSmsLikeConversationMessage(payload)) return null;

  const message = extractMessageText(payload);
  if (!message) return null;

  return {
    id:
      cleanInlineText(
        payload.id ||
          payload.messageId ||
          payload.message && payload.message.id ||
          payload.data && payload.data.id ||
          "",
        120
      ) || "",
    sentAt: cleanInlineText(
      payload.dateAdded ||
        payload.dateCreated ||
        payload.createdAt ||
        payload.updatedAt ||
        payload.sentAt ||
        payload.date ||
        payload.timestamp ||
        "",
      80
    ),
    message,
    phone: cleanInlineText(
      payload.phone ||
        payload.phoneNumber ||
        payload.fromNumber ||
        payload.toNumber ||
        "",
      80
    ),
    contactId: cleanInlineText(
      payload.contactId ||
        payload.contact && (payload.contact.id || payload.contact.contactId) ||
        "",
      120
    ),
    channel: "ghl",
    direction: normalizeConversationMessageDirection(payload),
    source: normalizeConversationMessageDirection(payload) === "inbound" ? "client" : "manual",
    targetType: "",
    targetRef: "",
    conversationId: cleanInlineText(
      payload.conversationId ||
        payload.conversation && payload.conversation.id ||
        fallbackConversationId,
      120
    ),
    messageId: cleanInlineText(
      payload.messageId ||
        payload.id ||
        payload.message && payload.message.id ||
        "",
      120
    ),
  };
}

function buildSmsHistoryRecordKey(payload) {
  const messageId = cleanInlineText(payload && payload.messageId, 120);
  if (messageId) return `message:${messageId}`;

  return [
    "fallback",
    cleanInlineText(payload && payload.conversationId, 120),
    cleanInlineText(payload && payload.direction, 20).toLowerCase(),
    cleanInlineText(payload && payload.sentAt, 80),
    cleanInlineText(payload && payload.phone, 80),
    cleanMultilineText(payload && payload.message, 1000),
  ].join("|");
}

function dedupeConversationMessageRecords(entries = []) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeConversationMessageRecord(entry))
    .filter(Boolean)
    .filter((entry) => {
      const key = buildSmsHistoryRecordKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const leftMs = Date.parse(left.sentAt || "");
      const rightMs = Date.parse(right.sentAt || "");
      if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
        return rightMs - leftMs;
      }
      return cleanInlineText(right.sentAt, 80).localeCompare(cleanInlineText(left.sentAt, 80));
    });
}

async function findConversationsByContactId(fetchImpl, config, contactId) {
  const normalizedContactId = cleanInlineText(contactId, 120);
  if (!normalizedContactId) return [];

  const url = new URL("/conversations/search", config.apiBaseUrl);
  url.searchParams.set("locationId", config.locationId);
  url.searchParams.set("contactId", normalizedContactId);

  const response = await requestJson(
    fetchImpl,
    url.toString(),
    {
      method: "GET",
      headers: buildRequestHeaders(config, {
        version: config.conversationsApiVersion || DEFAULT_CONVERSATIONS_API_VERSION,
      }),
    },
    config.requestTimeoutMs
  );

  if (!response.ok) return [];

  const seen = new Set();
  return extractConversationList(response.body)
    .map((entry) =>
      cleanInlineText(
        entry &&
          (entry.id ||
            entry.conversationId ||
            entry.conversation && entry.conversation.id ||
            ""),
        120
      )
    )
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

async function listConversationMessages(fetchImpl, config, conversationId) {
  const normalizedConversationId = cleanInlineText(conversationId, 120);
  if (!normalizedConversationId) {
    return {
      ok: true,
      status: 200,
      body: { messages: [] },
      headers: null,
    };
  }

  const url = new URL(
    `/conversations/${encodeURIComponent(normalizedConversationId)}/messages`,
    config.apiBaseUrl
  );
  url.searchParams.set("limit", "100");

  return requestJson(
    fetchImpl,
    url.toString(),
    {
      method: "GET",
      headers: buildRequestHeaders(config, {
        version: config.conversationsApiVersion || DEFAULT_CONVERSATIONS_API_VERSION,
      }),
    },
    config.requestTimeoutMs
  );
}

function buildSmsContactSubmissionInput(input = {}, normalizedPhone) {
  if (!normalizedPhone) return null;

  const normalizedEmail = normalizeEmail(input.email || input.customerEmail || "");
  const requestedName = cleanInlineText(
    input.fullName ||
      input.customerName ||
      input.name ||
      [input.firstName, input.lastName].filter(Boolean).join(" "),
    120
  );
  const fallbackName =
    cleanInlineText(normalizedEmail, 120) ||
    cleanInlineText(`Client ${normalizedPhone.digits.slice(-4)}`, 120);
  const fullName = requestedName || fallbackName;

  return {
    contactData: {
      fullName,
      firstName: cleanInlineText(input.firstName || fullName.split(" ")[0] || fullName, 80),
      lastName: cleanInlineText(input.lastName || fullName.split(" ").slice(1).join(" "), 80),
      phone: normalizedPhone.e164,
      email: normalizedEmail,
    },
    calculatorData: {
      address: cleanInlineText(input.address, 180),
      fullAddress: cleanInlineText(input.fullAddress || input.address, 180),
      addressLine2: cleanInlineText(input.addressLine2, 120),
      city: cleanInlineText(input.city, 80),
      state: cleanInlineText(input.state, 32),
      zipCode: cleanInlineText(input.zipCode, 20),
    },
    source: cleanInlineText(input.source || "Admin SMS", 120) || "Admin SMS",
  };
}

async function findExistingSmsContact(fetchImpl, config, normalizedPhone) {
  const attempts = [];

  if (normalizedPhone) {
    const phoneResponse = await findContactByPhone(fetchImpl, config, normalizedPhone.digits);
    attempts.push(phoneResponse);
    if (phoneResponse.ok && phoneResponse.contactId) {
      return {
        contactId: cleanInlineText(phoneResponse.contactId, 120),
        attempts,
      };
    }
  }

  return {
    contactId: "",
    attempts,
  };
}

async function resolveSmsHistoryContactId(fetchImpl, config, directContactId, normalizedPhone) {
  const normalizedDirectContactId = cleanInlineText(directContactId, 120);
  if (normalizedDirectContactId) return normalizedDirectContactId;
  if (!normalizedPhone) return "";

  try {
    const lookupResult = await findExistingSmsContact(fetchImpl, config, normalizedPhone);
    return cleanInlineText(lookupResult && lookupResult.contactId, 120);
  } catch {
    return "";
  }
}

async function resolveSmsHistoryContactIds(fetchImpl, config, directContactId, normalizedPhone) {
  const contactIds = [];
  const normalizedDirectContactId = cleanInlineText(directContactId, 120);
  if (normalizedDirectContactId) {
    contactIds.push(normalizedDirectContactId);
  }
  if (normalizedPhone) {
    try {
      const lookupResult = await findContactIdsByPhone(fetchImpl, config, normalizedPhone.digits, {
        includeListFallback: true,
        includeQueryVariants: true,
        maxPages: 50,
      });
      if (lookupResult && Array.isArray(lookupResult.contactIds)) {
        for (const contactId of lookupResult.contactIds) {
          const normalizedContactId = cleanInlineText(contactId, 120);
          if (normalizedContactId) {
            contactIds.push(normalizedContactId);
          }
        }
      }
    } catch {
      // Best effort only for history reads.
    }
  }
  return Array.from(new Set(contactIds));
}

async function ensureSmsContactId(fetchImpl, config, input = {}, normalizedPhone) {
  const directContactId = cleanInlineText(input.contactId || "", 120);
  if (directContactId) {
    return {
      contactId: directContactId,
      createdContact: false,
      usedExistingContact: true,
      updatedExistingContact: false,
    };
  }

  if (!normalizedPhone) {
    throw new LeadConnectorError("A valid US phone number is required", {
      status: 400,
      code: "INVALID_PHONE",
    });
  }

  const lookupResult = await findExistingSmsContact(fetchImpl, config, normalizedPhone);
  if (lookupResult.contactId) {
    return {
      contactId: lookupResult.contactId,
      createdContact: false,
      usedExistingContact: true,
      updatedExistingContact: false,
    };
  }

  const submissionInput = buildSmsContactSubmissionInput(input, normalizedPhone);
  if (!submissionInput) {
    const failedLookup = lookupResult.attempts.find((attempt) => attempt && !attempt.ok);
    if (failedLookup) {
      throw new LeadConnectorError("Failed to find contact before sending SMS", {
        status: failedLookup.status || 502,
        code: "CONTACT_LOOKUP_FAILED",
        retryable: true,
        details: getResponseBodyFromResult(failedLookup),
      });
    }
    throw new LeadConnectorError("Contact not found in Go High Level", {
      status: 404,
      code: "CONTACT_NOT_FOUND",
    });
  }

  const submission = normalizeQuoteSubmission(submissionInput, {
    source: submissionInput.source,
  });
  const createResponse = await createContact(fetchImpl, config, submission);
  let createdContactId = cleanInlineText(
    createResponse.contactId || extractContactId(createResponse.body),
    120
  );

  if (createdContactId) {
    return {
      contactId: createdContactId,
      createdContact: true,
      usedExistingContact: false,
      updatedExistingContact: false,
    };
  }

  if (
    !createResponse.ok &&
    Number.isFinite(createResponse.status) &&
    createResponse.status >= 400 &&
    createResponse.status < 500
  ) {
    const retryLookup = await findExistingSmsContact(fetchImpl, config, normalizedPhone);
    const retryContactId = cleanInlineText(retryLookup.contactId, 120);
    if (retryContactId) {
      const updateResponse = await updateContact(fetchImpl, config, retryContactId, submission);
      if (!updateResponse.ok) {
        throw new LeadConnectorError("Failed to update existing contact before sending SMS", {
          status: updateResponse.status || 502,
          code: "CONTACT_UPDATE_FAILED",
          retryable: true,
          details: getResponseBodyFromResult(updateResponse),
        });
      }
      return {
        contactId: retryContactId,
        createdContact: false,
        usedExistingContact: true,
        updatedExistingContact: true,
      };
    }
  }

  if (!createResponse.ok) {
    throw new LeadConnectorError(
      extractResponseMessage(createResponse.body) || "Failed to create contact before sending SMS",
      {
        status: createResponse.status || 502,
        code: "CONTACT_CREATE_FAILED",
        retryable: Number(createResponse.status || 0) >= 500,
        details: getResponseBodyFromResult(createResponse),
      }
    );
  }

  throw new LeadConnectorError("Failed to resolve contact before sending SMS", {
    status: 502,
    code: "CONTACT_CREATE_FAILED",
    retryable: true,
    details: getResponseBodyFromResult(createResponse),
  });
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
    async getSmsHistory(input = {}) {
      if (!config.configured) {
        return buildNotConfiguredResult(config);
      }

      try {
        const normalizedPhone = normalizePhoneNumber(
          input.phone || input.customerPhone || input.phoneNumber || ""
        );
        const directContactId = cleanInlineText(input.contactId || "", 120);
        const directConversationIds = Array.from(
          new Set(
            [
              input.conversationId,
              ...(Array.isArray(input.conversationIds) ? input.conversationIds : []),
            ]
              .map((value) => cleanInlineText(value, 120))
              .filter(Boolean)
          )
        ).slice(0, 10);

        let resolvedContactId = directContactId;
        let conversationIds = directConversationIds;
        const resolvedContactIds = await resolveSmsHistoryContactIds(
          fetchImpl,
          config,
          resolvedContactId,
          normalizedPhone
        );

        if (resolvedContactIds.length > 0) {
          const conversationLists = await Promise.all(
            resolvedContactIds.map(async (contactId) => ({
              contactId,
              conversationIds: await findConversationsByContactId(fetchImpl, config, contactId),
            }))
          );
          const preferredConversationList =
            conversationLists.find((item) => Array.isArray(item.conversationIds) && item.conversationIds.length > 0) ||
            null;

          resolvedContactId = preferredConversationList
            ? preferredConversationList.contactId
            : resolvedContactId || resolvedContactIds[0];

          const discoveredConversationIds = Array.from(
            new Set(
              conversationLists.flatMap((item) =>
                Array.isArray(item.conversationIds) ? item.conversationIds : []
              )
            )
          );

          if (discoveredConversationIds.length > 0) {
            conversationIds = Array.from(
              new Set([
                ...directConversationIds,
                ...discoveredConversationIds,
              ])
            );
          }
        }

        if (conversationIds.length === 0) {
          return {
            ok: true,
            status: 200,
            code: "OK",
            contactId: resolvedContactId,
            phoneE164: normalizedPhone ? normalizedPhone.e164 : "",
            history: [],
          };
        }

        const responses = await Promise.all(
          conversationIds.map(async (conversationId) => ({
            conversationId,
            response: await listConversationMessages(fetchImpl, config, conversationId),
          }))
        );

        const successfulResponses = responses.filter((item) => item.response && item.response.ok);
        if (successfulResponses.length === 0) {
          const failedResponse = responses.find((item) => item.response && !item.response.ok);
          throw new LeadConnectorError(
            "Failed to load SMS history from Go High Level",
            {
              status:
                (failedResponse && failedResponse.response && failedResponse.response.status) || 502,
              code: "SMS_HISTORY_FETCH_FAILED",
              retryable: true,
              details:
                failedResponse && failedResponse.response
                  ? getResponseBodyFromResult(failedResponse.response)
                  : null,
            }
          );
        }

        const history = dedupeConversationMessageRecords(
          successfulResponses.flatMap(({ conversationId, response }) =>
            extractConversationMessages(response.body).map((item) =>
              normalizeConversationMessageRecord(item, conversationId)
            )
          )
        );

        return {
          ok: true,
          status: 200,
          code: "OK",
          contactId: resolvedContactId,
          phoneE164: normalizedPhone ? normalizedPhone.e164 : "",
          conversationIds,
          history,
        };
      } catch (error) {
        return toResultError(error);
      }
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
        const contactResolution = await ensureSmsContactId(fetchImpl, config, input, normalizedPhone);
        const contactId = cleanInlineText(contactResolution.contactId, 120);

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
          createdContact: Boolean(contactResolution.createdContact),
          usedExistingContact: Boolean(contactResolution.usedExistingContact),
          updatedExistingContact: Boolean(contactResolution.updatedExistingContact),
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
