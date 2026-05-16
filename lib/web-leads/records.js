"use strict";

const WEB_LEADS_HEADERS = Object.freeze([
  "Date/Time",
  "Lead Source",
  "Name",
  "Phone",
  "Email",
  "Zip Code",
  "Service",
  "Details",
  "Message",
  "GCLID",
  "Source / Medium",
  "Campaign",
  "Keyword",
  "Landing Page",
  "Status",
  "Price",
  "Order #",
  "Notes",
  "Upload Status",
  "Upload Date",
]);

const SERVICE_LABELS = Object.freeze({
  regular: "Regular Cleaning",
  deep: "Deep Cleaning",
  moving: "Move In/Move Out Cleaning",
});

const FREQUENCY_LABELS = Object.freeze({
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
});

function cleanCell(value, maxLength = 2000) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (/^(undefined|null|none)$/i.test(text)) return "";
  return text.slice(0, maxLength);
}

function normalizePhoneE164(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(value || "").trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return cleanCell(value, 40);
}

function formatChicagoDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(safeDate).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseCookieHeader(cookieHeader) {
  const output = {};
  String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) return;
      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1);
      try {
        output[name] = decodeURIComponent(value);
      } catch {
        output[name] = value;
      }
    });
  return output;
}

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stripQuery(value) {
  const text = cleanCell(value, 512);
  if (!text) return "";
  try {
    const parsed = new URL(text, "https://shynlicleaningservice.com");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return text.split("?")[0].split("#")[0];
  }
}

function extractAttribution(body = {}, req = null) {
  const cookies = parseCookieHeader(req && req.headers ? req.headers.cookie : "");
  const cookieAttribution = parseJsonObject(cookies.shynli_attribution);
  const bodyAttribution = body.attribution && typeof body.attribution === "object" ? body.attribution : {};
  const source = {
    ...cookieAttribution,
    ...bodyAttribution,
    gclid: body.gclid ?? bodyAttribution.gclid ?? cookieAttribution.gclid,
    utm_source: body.utm_source ?? bodyAttribution.utm_source ?? cookieAttribution.utm_source,
    utm_medium: body.utm_medium ?? bodyAttribution.utm_medium ?? cookieAttribution.utm_medium,
    utm_campaign: body.utm_campaign ?? bodyAttribution.utm_campaign ?? cookieAttribution.utm_campaign,
    utm_term: body.utm_term ?? bodyAttribution.utm_term ?? cookieAttribution.utm_term,
  };

  const landingPage =
    body.landingPage ||
    body.landing_page ||
    bodyAttribution.landing_page ||
    bodyAttribution.landingPage ||
    cookies.shynli_landing_page ||
    cookies._landing_page ||
    "";

  return {
    gclid: cleanCell(source.gclid, 160),
    utm_source: cleanCell(source.utm_source, 160),
    utm_medium: cleanCell(source.utm_medium, 160),
    utm_campaign: cleanCell(source.utm_campaign, 240),
    utm_term: cleanCell(source.utm_term, 240),
    landingPage: stripQuery(landingPage),
    pageVersion: cleanCell(body.page_version || body.pageVersion || bodyAttribution.page_version || "", 120),
  };
}

function resolveSourceMedium(attribution) {
  const source = cleanCell(attribution && attribution.utm_source, 120);
  const medium = cleanCell(attribution && attribution.utm_medium, 120);
  if (source && medium) return `${source} / ${medium}`;
  if (source) return source;
  if (medium) return medium;
  return "";
}

function resolveServiceLabel(serviceType, fallback = "") {
  const key = cleanCell(serviceType, 32).toLowerCase();
  return SERVICE_LABELS[key] || cleanCell(fallback, 120) || "General Inquiry";
}

function summarizeQuoteDetails(quote = {}, pricing = {}) {
  const parts = [];
  const serviceType = cleanCell(quote.serviceType || pricing.serviceType, 32).toLowerCase();
  const frequency = serviceType === "regular" ? FREQUENCY_LABELS[cleanCell(quote.frequency, 32)] || cleanCell(quote.frequency, 40) : "";
  const selectedDate = cleanCell(quote.selectedDate, 40);
  const selectedTime = cleanCell(quote.selectedTime, 40);
  const addons = Array.isArray(quote.services) ? quote.services.map((item) => cleanCell(item, 80)).filter(Boolean) : [];
  const quantityServices =
    quote.quantityServices && typeof quote.quantityServices === "object" && !Array.isArray(quote.quantityServices)
      ? Object.entries(quote.quantityServices)
          .filter(([, value]) => Number(value) > 0)
          .map(([key, value]) => `${cleanCell(key, 80)}: ${Number(value)}`)
      : [];

  if (frequency) parts.push(`Frequency: ${frequency}`);
  if (quote.rooms) parts.push(`Bedrooms: ${cleanCell(quote.rooms, 20)}`);
  if (quote.bathrooms) parts.push(`Bathrooms: ${cleanCell(quote.bathrooms, 20)}`);
  if (quote.squareMeters) parts.push(`Square feet: ${cleanCell(quote.squareMeters, 20)}`);
  if (quote.hasPets) parts.push(`Pets: ${cleanCell(quote.hasPets, 40)}`);
  if (quote.basementCleaning) parts.push(`Basement: ${cleanCell(quote.basementCleaning, 40)}`);
  if (addons.length) parts.push(`Add-ons: ${addons.join(", ")}`);
  if (quantityServices.length) parts.push(`Quantities: ${quantityServices.join(", ")}`);
  if (selectedDate || selectedTime) parts.push(`Preferred time: ${[selectedDate, selectedTime].filter(Boolean).join(" ")}`);
  if (Number(pricing.totalPrice || quote.totalPrice) > 0) parts.push(`Estimate: $${Number(pricing.totalPrice || quote.totalPrice).toFixed(2)}`);
  if (quote.requestType) parts.push(`Request type: ${cleanCell(quote.requestType, 40)}`);

  return parts.join(" | ");
}

function buildWebLeadRow(fields) {
  const row = [
    cleanCell(fields.dateTime) || formatChicagoDateTime(),
    cleanCell(fields.leadSource, 80),
    cleanCell(fields.name, 160),
    normalizePhoneE164(fields.phone),
    cleanCell(fields.email, 254).toLowerCase(),
    cleanCell(fields.zipCode, 80),
    cleanCell(fields.service, 160),
    cleanCell(fields.details, 4000),
    cleanCell(fields.message, 4000),
    cleanCell(fields.gclid, 200),
    cleanCell(fields.sourceMedium, 240),
    cleanCell(fields.campaign, 240),
    cleanCell(fields.keyword, 240),
    stripQuery(fields.landingPage),
    "New",
    "",
    "",
    "",
    "",
    "",
  ];
  return row.slice(0, WEB_LEADS_HEADERS.length);
}

function buildQuoteWebLeadRecord({ body = {}, req = null, contactData = {}, calculatorData = {}, pricing = {}, source = "", publicQuotePath = "", siteOrigin = "" } = {}) {
  const attribution = extractAttribution(body, req);
  const landingPage =
    attribution.landingPage ||
    stripQuery(body.pageUrl || body.sourcePageUrl || body.sourcePage || body.page || "") ||
    (siteOrigin && publicQuotePath ? `${String(siteOrigin).replace(/\/+$/, "")}${publicQuotePath}` : "");
  const isPopupOrContact = /popup|callback|call/i.test(source || body.source || "");
  const service = resolveServiceLabel(calculatorData.serviceType || pricing.serviceType, pricing.serviceName);
  const details = summarizeQuoteDetails(calculatorData, pricing);

  return {
    kind: "quote",
    row: buildWebLeadRow({
      dateTime: formatChicagoDateTime(body.submittedAt || new Date()),
      leadSource: isPopupOrContact ? "website_contact" : "website_quiz",
      name: contactData.fullName || contactData.name,
      phone: contactData.phone,
      email: contactData.email,
      zipCode: calculatorData.zipCode,
      service,
      details,
      message: calculatorData.additionalDetails,
      gclid: attribution.gclid,
      sourceMedium: resolveSourceMedium(attribution),
      campaign: attribution.utm_campaign,
      keyword: attribution.utm_term,
      landingPage,
    }),
    summary: {
      leadSource: isPopupOrContact ? "website_contact" : "website_quiz",
      name: cleanCell(contactData.fullName || contactData.name, 160),
      phone: normalizePhoneE164(contactData.phone),
      service,
      zipCode: cleanCell(calculatorData.zipCode, 80),
      gclid: attribution.gclid,
      landingPage,
      source,
    },
  };
}

function buildApplicationWebLeadRecord({ body = {}, req = null, application = {}, source = "" } = {}) {
  const attribution = extractAttribution(body, req);
  const landingPage =
    attribution.landingPage ||
    stripQuery(body.pageUrl || body.page || body.sourcePageUrl || "");
  return {
    kind: "application",
    row: buildWebLeadRow({
      dateTime: formatChicagoDateTime(body.submittedAt || new Date()),
      leadSource: "website_application",
      name: application.fullName || application.name,
      phone: application.phone || application.phoneNumber,
      email: application.email,
      zipCode: application.zipCode || application.zip,
      service: "Application",
      details: application.experience || application.cleaningExperience,
      message: application.details || application.about || application.notes,
      gclid: attribution.gclid,
      sourceMedium: resolveSourceMedium(attribution),
      campaign: attribution.utm_campaign,
      keyword: attribution.utm_term,
      landingPage,
    }),
    summary: {
      leadSource: "website_application",
      name: cleanCell(application.fullName || application.name, 160),
      phone: normalizePhoneE164(application.phone || application.phoneNumber),
      service: "Application",
      zipCode: cleanCell(application.zipCode || application.zip, 80),
      gclid: attribution.gclid,
      landingPage,
      source,
    },
  };
}

module.exports = {
  WEB_LEADS_HEADERS,
  buildApplicationWebLeadRecord,
  buildQuoteWebLeadRecord,
  buildWebLeadRow,
  cleanCell,
  extractAttribution,
  formatChicagoDateTime,
  normalizePhoneE164,
};
