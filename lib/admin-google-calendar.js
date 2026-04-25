"use strict";

const crypto = require("node:crypto");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3/";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const GOOGLE_CONNECTION_STATUS_VALUES = new Set(["connected", "attention"]);

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 200).toLowerCase();
}

function normalizeOrigin(value) {
  const raw = normalizeString(value, 500);
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function normalizeCalendarName(value, fallback) {
  return normalizeString(value, 120) || fallback;
}

function isAdminWorkspaceRole(role) {
  return normalizeString(role, 32).toLowerCase() === "admin";
}

function isEmployeeLinkedUser(user) {
  if (!user || typeof user !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(user, "isEmployee")) {
    const rawValue = user.isEmployee;
    if (rawValue === true || rawValue === false) return rawValue;
    const normalized = normalizeString(rawValue, 20).toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }
  return !isAdminWorkspaceRole(user.role);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function deriveScopedSecret(secret, scope) {
  return crypto
    .createHmac("sha256", String(secret || ""))
    .update(`admin-google-calendar:${scope}`)
    .digest("hex");
}

function signState(payload, secret) {
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", deriveScopedSecret(secret, "state"))
    .update(body)
    .digest("hex");
  return `${body}.${signature}`;
}

function verifyState(token, secret) {
  const raw = normalizeString(token, 6000);
  const [body, signature] = raw.split(".");
  if (!body || !signature) {
    throw new Error("GOOGLE_STATE_INVALID");
  }

  const expectedSignature = crypto
    .createHmac("sha256", deriveScopedSecret(secret, "state"))
    .update(body)
    .digest("hex");

  if (
    expectedSignature.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expectedSignature, "utf8"), Buffer.from(signature, "utf8"))
  ) {
    throw new Error("GOOGLE_STATE_INVALID");
  }

  const payload = JSON.parse(decodeBase64Url(body).toString("utf8"));
  const issuedAt = Number(payload && payload.iat);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > GOOGLE_STATE_MAX_AGE_MS) {
    throw new Error("GOOGLE_STATE_EXPIRED");
  }
  return payload;
}

function encryptTokenPayload(payload, secret) {
  if (!isObject(payload)) return null;
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(deriveScopedSecret(secret, "token-encryption"), salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: ciphertext.toString("base64"),
  };
}

function decryptTokenPayload(payload, secret) {
  const version = Number(payload && payload.version);
  const salt = normalizeString(payload && payload.salt, 128);
  const iv = normalizeString(payload && payload.iv, 128);
  const tag = normalizeString(payload && payload.tag, 128);
  const data = normalizeString(payload && payload.data, 12000);
  if (version !== 1 || !salt || !iv || !tag || !data) {
    throw new Error("GOOGLE_TOKEN_PAYLOAD_INVALID");
  }

  const key = crypto.scryptSync(
    deriveScopedSecret(secret, "token-encryption"),
    Buffer.from(salt, "hex"),
    32
  );
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

function sanitizeEncryptedTokenPayload(payload) {
  const version = Number(payload && payload.version);
  const salt = normalizeString(payload && payload.salt, 128);
  const iv = normalizeString(payload && payload.iv, 128);
  const tag = normalizeString(payload && payload.tag, 128);
  const data = normalizeString(payload && payload.data, 12000);
  if (version !== 1 || !salt || !iv || !tag || !data) return null;
  return { version: 1, salt, iv, tag, data };
}

function sanitizeGoogleCalendarConnection(input = {}) {
  const source = isObject(input) ? input : {};
  const provider = normalizeString(source.provider, 32).toLowerCase();
  if (provider !== "google") return null;

  const tokenCipher = sanitizeEncryptedTokenPayload(source.tokenCipher);
  if (!tokenCipher) return null;

  const status = normalizeString(source.status, 32).toLowerCase();
  return {
    provider: "google",
    status: GOOGLE_CONNECTION_STATUS_VALUES.has(status) ? status : "connected",
    accountEmail: normalizeEmail(source.accountEmail),
    workCalendarId: normalizeString(source.workCalendarId, 240),
    workCalendarName: normalizeCalendarName(source.workCalendarName, "SHYNLI Work"),
    unavailableCalendarId: normalizeString(source.unavailableCalendarId, 240),
    unavailableCalendarName: normalizeCalendarName(
      source.unavailableCalendarName,
      "SHYNLI Unavailable"
    ),
    tokenCipher,
    tokenExpiresAt: normalizeString(source.tokenExpiresAt, 80),
    connectedAt: normalizeString(source.connectedAt, 80),
    updatedAt: normalizeString(source.updatedAt, 80),
    lastSyncAt: normalizeString(source.lastSyncAt, 80),
    lastAvailabilitySyncAt: normalizeString(source.lastAvailabilitySyncAt, 80),
    lastError: normalizeString(source.lastError, 400),
  };
}

function sanitizeGoogleCalendarEventLink(input = {}) {
  const source = isObject(input) ? input : {};
  const eventId = normalizeString(source.eventId, 240);
  if (!eventId) return null;
  return {
    eventId,
    calendarId: normalizeString(source.calendarId, 240),
    htmlLink: normalizeString(source.htmlLink, 500),
    updatedAt: normalizeString(source.updatedAt, 80),
  };
}

function sanitizeGoogleCalendarSync(input = {}) {
  const source = isObject(input) ? input : {};
  const googleSource = isObject(source.google) ? source.google : source;
  const byStaffIdSource = isObject(googleSource.byStaffId) ? googleSource.byStaffId : {};
  const byStaffId = {};

  for (const [staffId, rawLink] of Object.entries(byStaffIdSource)) {
    const normalizedStaffId = normalizeString(staffId, 120);
    const link = sanitizeGoogleCalendarEventLink(rawLink);
    if (!normalizedStaffId || !link) continue;
    byStaffId[normalizedStaffId] = link;
  }

  if (Object.keys(byStaffId).length === 0) return null;
  return { google: { byStaffId } };
}

function setGoogleCalendarEventLink(syncState, staffId, link) {
  const normalizedStaffId = normalizeString(staffId, 120);
  if (!normalizedStaffId) {
    return sanitizeGoogleCalendarSync(syncState);
  }

  const nextState = sanitizeGoogleCalendarSync(syncState) || { google: { byStaffId: {} } };
  if (link) {
    const sanitizedLink = sanitizeGoogleCalendarEventLink(link);
    if (sanitizedLink) {
      nextState.google.byStaffId[normalizedStaffId] = sanitizedLink;
    }
  } else {
    delete nextState.google.byStaffId[normalizedStaffId];
  }

  return sanitizeGoogleCalendarSync(nextState);
}

function getGoogleCalendarEventLink(syncState, staffId) {
  const normalized = sanitizeGoogleCalendarSync(syncState);
  const normalizedStaffId = normalizeString(staffId, 120);
  if (!normalized || !normalizedStaffId) return null;
  return normalized.google.byStaffId[normalizedStaffId] || null;
}

function hasGoogleCalendarConnection(record = {}) {
  return Boolean(sanitizeGoogleCalendarConnection(record.calendar));
}

function loadAdminGoogleCalendarConfig(env = process.env, options = {}) {
  const siteOrigin = normalizeOrigin(
    options.siteOrigin || env.PUBLIC_SITE_ORIGIN || env.SITE_BASE_URL || "https://shynlicleaningservice.com"
  );
  const clientId = normalizeString(
    env.GOOGLE_CALENDAR_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID,
    400
  );
  const clientSecret = normalizeString(
    env.GOOGLE_CALENDAR_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET,
    400
  );
  const redirectPath =
    normalizeString(env.GOOGLE_CALENDAR_REDIRECT_PATH, 160) || "/admin/google-calendar/callback";
  const timeZone =
    normalizeString(env.GOOGLE_CALENDAR_TIME_ZONE, 120) ||
    normalizeString(env.TZ, 120) ||
    "America/Chicago";
  const workCalendarName = normalizeCalendarName(
    env.GOOGLE_CALENDAR_WORK_NAME,
    "SHYNLI Work"
  );
  const unavailableCalendarName = normalizeCalendarName(
    env.GOOGLE_CALENDAR_UNAVAILABLE_NAME,
    "SHYNLI Unavailable"
  );
  const eventDurationMinutes = Math.max(
    30,
    Number(env.GOOGLE_CALENDAR_DEFAULT_EVENT_DURATION_MINUTES || 180) || 180
  );
  const unavailableLookAheadDays = Math.max(
    7,
    Number(env.GOOGLE_CALENDAR_UNAVAILABLE_LOOKAHEAD_DAYS || 45) || 45
  );
  const redirectUri = siteOrigin
    ? new URL(redirectPath, `${siteOrigin}/`).toString()
    : "";

  return {
    configured: Boolean(clientId && clientSecret && redirectUri),
    clientId,
    clientSecret,
    redirectPath,
    redirectUri,
    scope: GOOGLE_CALENDAR_SCOPE,
    timeZone,
    workCalendarName,
    unavailableCalendarName,
    eventDurationMinutes,
    unavailableLookAheadDays,
    siteOrigin,
  };
}

function parseJsonResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getTimeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const output = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    output[part.type] = part.value;
  }
  return output;
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtcTimestamp = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtcTimestamp - date.getTime()) / 60000);
}

function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function localDateTimeToInstant(dateValue, timeValue, timeZone) {
  const normalizedDate = normalizeString(dateValue, 32);
  const normalizedTime = normalizeString(timeValue, 32);
  if (!normalizedDate || !normalizedTime) return null;

  const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = normalizedTime.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const baseUtcTimestamp = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let offsetMinutes = getTimeZoneOffsetMinutes(new Date(baseUtcTimestamp), timeZone);
  let utcTimestamp = baseUtcTimestamp - offsetMinutes * 60 * 1000;
  const adjustedOffsetMinutes = getTimeZoneOffsetMinutes(new Date(utcTimestamp), timeZone);
  if (adjustedOffsetMinutes !== offsetMinutes) {
    offsetMinutes = adjustedOffsetMinutes;
    utcTimestamp = baseUtcTimestamp - offsetMinutes * 60 * 1000;
  }

  return {
    date: new Date(utcTimestamp),
    offsetMinutes,
    localDate: normalizedDate,
    localTime: normalizedTime,
  };
}

function formatZonedDateTime(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${formatUtcOffset(offsetMinutes)}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Math.max(0, Number(minutes) || 0) * 60 * 1000);
}

function addDays(dateValue, days) {
  const match = normalizeString(dateValue, 32).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0));
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return next.toISOString().slice(0, 10);
}

function parseEventBoundary(value, isEndBoundary = false) {
  const normalized = normalizeString(value, 80);
  if (!normalized) return NaN;
  const parsed = Date.parse(normalized);
  if (Number.isFinite(parsed)) return parsed;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  const timestamp = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    0,
    0,
    0
  );
  return isEndBoundary ? timestamp : timestamp;
}

function buildAssignmentScheduleWindow(entry = {}, assignment = {}, timeZone, durationMinutes) {
  const scheduleDate = normalizeString(
    assignment.scheduleDate || entry.selectedDate,
    32
  );
  const scheduleTime = normalizeString(
    assignment.scheduleTime || entry.selectedTime,
    32
  );

  if (!scheduleDate) {
    return {
      scheduleDate: "",
      scheduleTime: "",
      allDay: false,
      hasWindow: false,
      startMs: NaN,
      endMs: NaN,
      startDateTime: "",
      endDateTime: "",
      startDate: "",
      endDate: "",
    };
  }

  if (!scheduleTime) {
    const startMs = parseEventBoundary(scheduleDate, false);
    const endDate = addDays(scheduleDate, 1);
    const endMs = parseEventBoundary(endDate, true);
    return {
      scheduleDate,
      scheduleTime: "",
      allDay: true,
      hasWindow: true,
      startMs,
      endMs,
      startDateTime: "",
      endDateTime: "",
      startDate: scheduleDate,
      endDate,
    };
  }

  const startInstant = localDateTimeToInstant(scheduleDate, scheduleTime, timeZone);
  if (!startInstant) {
    return {
      scheduleDate,
      scheduleTime,
      allDay: false,
      hasWindow: false,
      startMs: NaN,
      endMs: NaN,
      startDateTime: "",
      endDateTime: "",
      startDate: "",
      endDate: "",
    };
  }

  const endDate = addMinutes(startInstant.date, durationMinutes);
  return {
    scheduleDate,
    scheduleTime,
    allDay: false,
    hasWindow: true,
    startMs: startInstant.date.getTime(),
    endMs: endDate.getTime(),
    startDateTime: `${startInstant.localDate}T${startInstant.localTime}:00${formatUtcOffset(
      startInstant.offsetMinutes
    )}`,
    endDateTime: formatZonedDateTime(endDate, timeZone),
    startDate: "",
    endDate: "",
  };
}

function getEntryAdminOrder(entry = {}) {
  const payload = isObject(entry.payloadForRetry) ? entry.payloadForRetry : {};
  return isObject(payload.adminOrder) ? payload.adminOrder : {};
}

function getEntryOrderStatus(entry = {}) {
  const adminOrder = getEntryAdminOrder(entry);
  const normalized = normalizeString(adminOrder.status, 40)
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (normalized === "completed") return "completed";
  if (normalized === "canceled" || normalized === "cancelled") return "canceled";
  if (normalized === "rescheduled") return "rescheduled";
  if (normalized === "in-progress" || normalized === "en-route") return "en-route";
  if (normalized === "cleaning-started") return "cleaning-started";
  if (normalized === "checklist") return "checklist";
  if (normalized === "photos" || normalized === "photo") return "photos";
  if (normalized === "cleaning-complete") return "cleaning-complete";
  if (normalized === "scheduled") return "scheduled";
  if (entry.selectedDate || entry.selectedTime) return "scheduled";
  return "new";
}

function buildCalendarEventSummary(entry = {}) {
  const customerName = normalizeString(entry.customerName, 200) || "Client";
  const serviceLabel = normalizeString(entry.serviceName || entry.serviceType, 120) || "Cleaning";
  return `SHYNLI: ${customerName} — ${serviceLabel}`;
}

function buildCalendarEventDescription(entry = {}, assignment = {}, staffRecord = {}, siteOrigin = "") {
  const lines = [
    `Client: ${normalizeString(entry.customerName, 200) || "Not set"}`,
    `Service: ${normalizeString(entry.serviceName || entry.serviceType, 120) || "Cleaning"}`,
    `Address: ${normalizeString(entry.fullAddress, 500) || "Not set"}`,
  ];

  const contactBits = [
    normalizeString(entry.customerPhone, 80),
    normalizeEmail(entry.customerEmail),
  ].filter(Boolean);
  if (contactBits.length > 0) {
    lines.push(`Contacts: ${contactBits.join(" • ")}`);
  }

  if (normalizeString(entry.requestId, 120)) {
    lines.push(`Request ID: ${normalizeString(entry.requestId, 120)}`);
  }

  if (normalizeString(assignment.notes, 800)) {
    lines.push(`Team note: ${normalizeString(assignment.notes, 800)}`);
  }

  if (normalizeString(staffRecord.name, 160)) {
    lines.push(`Assigned cleaner: ${normalizeString(staffRecord.name, 160)}`);
  }

  if (siteOrigin) {
    lines.push(`Admin: ${siteOrigin}/admin/staff`);
  }

  return lines.join("\n");
}

function buildUnavailableBlockLabel(block = {}, timeZone) {
  const summary = normalizeString(block.summary, 200) || "Day off";
  if (block.allDay && block.startDate) {
    return `${summary} • ${block.startDate}`;
  }
  const startText = Number.isFinite(block.startMs)
    ? new Date(block.startMs).toLocaleString("en-US", {
        timeZone,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Time blocked";
  return `${summary} • ${startText}`;
}

function mapGoogleEventToUnavailableBlock(event = {}) {
  if (!isObject(event) || normalizeString(event.status, 32).toLowerCase() === "cancelled") {
    return null;
  }

  const startDateTime = normalizeString(event.start && event.start.dateTime, 80);
  const endDateTime = normalizeString(event.end && event.end.dateTime, 80);
  const startDate = normalizeString(event.start && event.start.date, 32);
  const endDate = normalizeString(event.end && event.end.date, 32);

  return {
    id: normalizeString(event.id, 240),
    summary: normalizeString(event.summary, 200) || "Day off",
    allDay: Boolean(startDate && endDate && !startDateTime && !endDateTime),
    startDate,
    endDate,
    startMs: parseEventBoundary(startDateTime || startDate, false),
    endMs: parseEventBoundary(endDateTime || endDate, true),
    htmlLink: normalizeString(event.htmlLink, 500),
  };
}

function doWindowsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  if (![leftStart, leftEnd, rightStart, rightEnd].every((value) => Number.isFinite(value))) {
    return false;
  }
  return leftStart < rightEnd && rightStart < leftEnd;
}

function createAdminGoogleCalendarClient(options = {}) {
  const config =
    options.config || loadAdminGoogleCalendarConfig(options.env || process.env, options);
  const fetchImpl = options.fetch || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for Google Calendar.");
  }

  async function requestJson(url, requestOptions = {}) {
    const headers = {
      ...(requestOptions.headers || {}),
    };

    const response = await fetchImpl(String(url), {
      ...requestOptions,
      headers,
    });
    const text = await response.text();
    const body = parseJsonResponse(text);
    if (!response.ok) {
      const error = new Error(
        body && typeof body === "object"
          ? normalizeString(body.error_description || (body.error && body.error.message) || body.message, 500)
          : `Google Calendar request failed with status ${response.status}`
      );
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  async function requestGoogleApi(pathname, accessToken, requestOptions = {}) {
    const url = new URL(pathname, GOOGLE_CALENDAR_API_BASE_URL);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      ...(requestOptions.body ? { "Content-Type": "application/json" } : {}),
      ...(requestOptions.headers || {}),
    };
    return requestJson(url.toString(), {
      ...requestOptions,
      headers,
    });
  }

  async function exchangeAuthorizationCode(code) {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: normalizeString(code, 4000),
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    });
    return requestJson(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  }

  async function refreshAccessToken(refreshToken) {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: normalizeString(refreshToken, 4000),
      grant_type: "refresh_token",
    });
    return requestJson(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  }

  async function listOwnedCalendars(accessToken) {
    const response = await requestGoogleApi(
      "users/me/calendarList?minAccessRole=owner&showHidden=false",
      accessToken,
      { method: "GET" }
    );
    return Array.isArray(response && response.items) ? response.items : [];
  }

  async function createCalendar(accessToken, summary) {
    return requestGoogleApi("calendars", accessToken, {
      method: "POST",
      body: JSON.stringify({
        summary,
        timeZone: config.timeZone,
      }),
    });
  }

  async function ensureManagedCalendars(accessToken) {
    const calendars = await listOwnedCalendars(accessToken);
    const primary = calendars.find((item) => item && item.primary) || calendars[0] || {};
    const accountEmail = normalizeEmail(primary.id || primary.summaryOverride || primary.summary);

    const findBySummary = (summary) =>
      calendars.find(
        (item) =>
          normalizeString(item.summary, 120) === summary ||
          normalizeString(item.summaryOverride, 120) === summary
      );

    let workCalendar = findBySummary(config.workCalendarName);
    if (!workCalendar) {
      workCalendar = await createCalendar(accessToken, config.workCalendarName);
    }

    let unavailableCalendar = findBySummary(config.unavailableCalendarName);
    if (!unavailableCalendar) {
      unavailableCalendar = await createCalendar(accessToken, config.unavailableCalendarName);
    }

    return {
      accountEmail,
      workCalendar,
      unavailableCalendar,
    };
  }

  async function getAuthorizedConnection(connection, secret) {
    const normalizedConnection = sanitizeGoogleCalendarConnection(connection);
    if (!normalizedConnection) {
      throw new Error("GOOGLE_CONNECTION_MISSING");
    }

    const tokens = decryptTokenPayload(normalizedConnection.tokenCipher, secret);
    const accessToken = normalizeString(tokens.accessToken, 4000);
    const refreshTokenValue = normalizeString(tokens.refreshToken, 4000);
    const tokenExpiresAt = normalizeString(
      tokens.tokenExpiresAt || normalizedConnection.tokenExpiresAt,
      80
    );
    const expiresAtMs = Date.parse(tokenExpiresAt);
    const expiresSoon = !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + 60 * 1000;

    if (accessToken && !expiresSoon) {
      return {
        accessToken,
        connection: normalizedConnection,
        changed: false,
      };
    }

    if (!refreshTokenValue) {
      throw new Error("GOOGLE_REFRESH_TOKEN_MISSING");
    }

    const refreshed = await refreshAccessToken(refreshTokenValue);
    const nextTokens = {
      accessToken: normalizeString(refreshed.access_token, 4000),
      refreshToken: normalizeString(refreshed.refresh_token, 4000) || refreshTokenValue,
      tokenExpiresAt: new Date(
        Date.now() + Math.max(60, Number(refreshed.expires_in || 3600)) * 1000
      ).toISOString(),
    };
    const nextConnection = sanitizeGoogleCalendarConnection({
      ...normalizedConnection,
      tokenCipher: encryptTokenPayload(nextTokens, secret),
      tokenExpiresAt: nextTokens.tokenExpiresAt,
      updatedAt: new Date().toISOString(),
      lastError: "",
    });

    return {
      accessToken: nextTokens.accessToken,
      connection: nextConnection,
      changed: true,
    };
  }

  return {
    config,
    isConfigured() {
      return Boolean(config.configured);
    },
    buildConnectUrl({ staffId, secret, loginHint = "" } = {}) {
      if (!config.configured) {
        throw new Error("GOOGLE_CALENDAR_NOT_CONFIGURED");
      }
      const normalizedStaffId = normalizeString(staffId, 120);
      if (!normalizedStaffId) {
        throw new Error("STAFF_ID_REQUIRED");
      }
      const state = signState(
        {
          staffId: normalizedStaffId,
          iat: Date.now(),
        },
        secret
      );

      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", config.scope);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("include_granted_scopes", "true");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("state", state);
      if (loginHint) {
        url.searchParams.set("login_hint", normalizeEmail(loginHint));
      }
      return url.toString();
    },
    async exchangeCode({ code, state, secret }) {
      if (!config.configured) {
        throw new Error("GOOGLE_CALENDAR_NOT_CONFIGURED");
      }
      const parsedState = verifyState(state, secret);
      const tokens = await exchangeAuthorizationCode(code);
      const accessToken = normalizeString(tokens.access_token, 4000);
      const refreshTokenValue = normalizeString(tokens.refresh_token, 4000);
      if (!accessToken || !refreshTokenValue) {
        throw new Error("GOOGLE_TOKEN_RESPONSE_INVALID");
      }

      const ensuredCalendars = await ensureManagedCalendars(accessToken);
      const tokenExpiresAt = new Date(
        Date.now() + Math.max(60, Number(tokens.expires_in || 3600)) * 1000
      ).toISOString();

      return {
        staffId: normalizeString(parsedState.staffId, 120),
        connection: sanitizeGoogleCalendarConnection({
          provider: "google",
          status: "connected",
          accountEmail: ensuredCalendars.accountEmail,
          workCalendarId: normalizeString(ensuredCalendars.workCalendar && ensuredCalendars.workCalendar.id, 240),
          workCalendarName: normalizeCalendarName(
            ensuredCalendars.workCalendar && ensuredCalendars.workCalendar.summary,
            config.workCalendarName
          ),
          unavailableCalendarId: normalizeString(
            ensuredCalendars.unavailableCalendar && ensuredCalendars.unavailableCalendar.id,
            240
          ),
          unavailableCalendarName: normalizeCalendarName(
            ensuredCalendars.unavailableCalendar && ensuredCalendars.unavailableCalendar.summary,
            config.unavailableCalendarName
          ),
          tokenCipher: encryptTokenPayload(
            {
              accessToken,
              refreshToken: refreshTokenValue,
              tokenExpiresAt,
            },
            secret
          ),
          tokenExpiresAt,
          connectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastError: "",
        }),
      };
    },
    async listUnavailableBlocks({ connection, secret, timeMin, timeMax }) {
      const auth = await getAuthorizedConnection(connection, secret);
      const calendarId = normalizeString(auth.connection.unavailableCalendarId, 240);
      if (!calendarId) {
        return {
          connection: auth.connection,
          changed: auth.changed,
          blocks: [],
        };
      }

      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
      });
      if (timeMin) params.set("timeMin", normalizeString(timeMin, 80));
      if (timeMax) params.set("timeMax", normalizeString(timeMax, 80));
      params.set("timeZone", config.timeZone);

      const response = await requestGoogleApi(
        `calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        auth.accessToken,
        { method: "GET" }
      );

      return {
        connection: auth.connection,
        changed: auth.changed,
        blocks: Array.isArray(response && response.items)
          ? response.items.map(mapGoogleEventToUnavailableBlock).filter(Boolean)
          : [],
      };
    },
    async upsertWorkEvent({ connection, secret, externalEventId = "", eventInput = {} }) {
      const auth = await getAuthorizedConnection(connection, secret);
      const calendarId = normalizeString(auth.connection.workCalendarId, 240);
      if (!calendarId) {
        throw new Error("GOOGLE_WORK_CALENDAR_MISSING");
      }

      const eventWindow = buildAssignmentScheduleWindow(
        eventInput.entry,
        eventInput.assignment,
        config.timeZone,
        config.eventDurationMinutes
      );
      if (!eventWindow.hasWindow) {
        throw new Error("GOOGLE_EVENT_WINDOW_MISSING");
      }

      const payload = {
        summary: buildCalendarEventSummary(eventInput.entry),
        description: buildCalendarEventDescription(
          eventInput.entry,
          eventInput.assignment,
          eventInput.staffRecord,
          config.siteOrigin
        ),
        location: normalizeString(eventInput.entry && eventInput.entry.fullAddress, 500),
        reminders: {
          useDefault: true,
        },
        extendedProperties: {
          private: {
            shynliEntryId: normalizeString(eventInput.entry && eventInput.entry.id, 120),
            shynliRequestId: normalizeString(eventInput.entry && eventInput.entry.requestId, 120),
            shynliStaffId: normalizeString(eventInput.staffRecord && eventInput.staffRecord.id, 120),
          },
        },
      };

      if (eventWindow.allDay) {
        payload.start = { date: eventWindow.startDate };
        payload.end = { date: eventWindow.endDate };
      } else {
        payload.start = {
          dateTime: eventWindow.startDateTime,
          timeZone: config.timeZone,
        };
        payload.end = {
          dateTime: eventWindow.endDateTime,
          timeZone: config.timeZone,
        };
      }

      const normalizedEventId = normalizeString(externalEventId, 240);
      const method = normalizedEventId ? "PUT" : "POST";
      const path = normalizedEventId
        ? `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(normalizedEventId)}`
        : `calendars/${encodeURIComponent(calendarId)}/events`;

      const response = await requestGoogleApi(
        `${path}?sendUpdates=none`,
        auth.accessToken,
        {
          method,
          body: JSON.stringify(payload),
        }
      );

      return {
        connection: auth.connection,
        changed: auth.changed,
        eventLink: sanitizeGoogleCalendarEventLink({
          eventId: normalizeString(response && response.id, 240),
          calendarId,
          htmlLink: normalizeString(response && response.htmlLink, 500),
          updatedAt: new Date().toISOString(),
        }),
      };
    },
    async deleteWorkEvent({ connection, secret, externalEventId }) {
      const normalizedEventId = normalizeString(externalEventId, 240);
      const auth = await getAuthorizedConnection(connection, secret);
      const calendarId = normalizeString(auth.connection.workCalendarId, 240);
      if (!calendarId || !normalizedEventId) {
        return {
          connection: auth.connection,
          changed: auth.changed,
          deleted: false,
        };
      }

      try {
        await requestGoogleApi(
          `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(normalizedEventId)}?sendUpdates=none`,
          auth.accessToken,
          { method: "DELETE" }
        );
      } catch (error) {
        if (Number(error && error.status) !== 404) {
          throw error;
        }
      }

      return {
        connection: auth.connection,
        changed: auth.changed,
        deleted: true,
      };
    },
    buildUnavailableBlockLabel(block) {
      return buildUnavailableBlockLabel(block, config.timeZone);
    },
    buildAssignmentScheduleWindow(entry, assignment) {
      return buildAssignmentScheduleWindow(
        entry,
        assignment,
        config.timeZone,
        config.eventDurationMinutes
      );
    },
    getEntryOrderStatus,
  };
}

function createAdminGoogleCalendarIntegration(options = {}) {
  const {
    client,
    staffStore,
    quoteOpsLedger,
    usersStore,
  } = options;

  async function persistUpdatedConnection(staffId, connection) {
    if (!staffStore || typeof staffStore.updateStaff !== "function") return;
    const sanitized = sanitizeGoogleCalendarConnection(connection);
    if (!sanitized) return;
    await staffStore.updateStaff(staffId, {
      calendar: sanitized,
    });
  }

  function getSecret(config) {
    const explicitSecret = normalizeString(
      (client && client.config && client.config.secretOverride) || "",
      4096
    );
    const sourceSecret =
      explicitSecret ||
      normalizeString(process.env.GOOGLE_CALENDAR_SECRET, 4096) ||
      normalizeString(config && config.masterSecret, 4096) ||
      normalizeString(config && config.passwordHash, 4096);

    if (!sourceSecret) {
      throw new Error("GOOGLE_CALENDAR_SECRET_MISSING");
    }

    return deriveScopedSecret(sourceSecret, "integration");
  }

  async function getSnapshot() {
    return staffStore ? staffStore.getSnapshot() : { staff: [], assignments: [] };
  }

  async function getNonAssignableStaffIds() {
    if (!usersStore || typeof usersStore.getSnapshot !== "function") {
      return new Set();
    }
    const usersSnapshot = await usersStore.getSnapshot();
    const blockedIds = new Set();
    (Array.isArray(usersSnapshot && usersSnapshot.users) ? usersSnapshot.users : []).forEach((user) => {
      const staffId = normalizeString(user && user.staffId, 120);
      if (!staffId) return;
      if (!isEmployeeLinkedUser(user)) {
        blockedIds.add(staffId);
      }
    });
    return blockedIds;
  }

  async function listStaffAvailabilityBlocks(staffRecord, config) {
    const connection = sanitizeGoogleCalendarConnection(staffRecord && staffRecord.calendar);
    if (!connection || !client || !client.isConfigured || !client.isConfigured()) {
      return {
        connection,
        blocks: [],
      };
    }

    const now = new Date();
    const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(
      now.getTime() + client.config.unavailableLookAheadDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const result = await client.listUnavailableBlocks({
      connection,
      secret: getSecret(config),
      timeMin,
      timeMax,
    });
    if (result.changed && result.connection) {
      await persistUpdatedConnection(staffRecord.id, result.connection);
    }
    return result;
  }

  function sanitizeAvailabilityBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return [];
    return blocks
      .map((block) => ({
        id: normalizeString(block && block.id, 240),
        summary: normalizeString(block && block.summary, 200) || "Day off",
        allDay: Boolean(block && block.allDay),
        startDate: normalizeString(block && block.startDate, 32),
        endDate: normalizeString(block && block.endDate, 32),
        startMs: Number.isFinite(block && block.startMs) ? block.startMs : NaN,
        endMs: Number.isFinite(block && block.endMs) ? block.endMs : NaN,
        htmlLink: normalizeString(block && block.htmlLink, 500),
      }))
      .filter((block) => block.summary && (block.startDate || Number.isFinite(block.startMs)));
  }

  function buildCalendarMeta(staffRecord, availabilityResult = {}) {
    const connection = sanitizeGoogleCalendarConnection(staffRecord && staffRecord.calendar);
    if (!client || !client.isConfigured || !client.isConfigured()) {
      return {
        configured: false,
        connected: false,
        accountEmail: "",
        workCalendarName: "",
        unavailableCalendarName: "",
        nextUnavailableLabel: "",
        syncError: "",
      };
    }

    if (!connection) {
      return {
        configured: true,
        connected: false,
        accountEmail: "",
        workCalendarName: "",
        unavailableCalendarName: "",
        nextUnavailableLabel: "",
        syncError: "",
      };
    }

    const blocks = Array.isArray(availabilityResult.blocks) ? availabilityResult.blocks : [];
    const nextBlock = blocks
      .filter((block) => Number.isFinite(block.startMs) && block.endMs >= Date.now())
      .sort((left, right) => left.startMs - right.startMs)[0] || null;

    return {
      configured: true,
      connected: true,
      accountEmail: connection.accountEmail,
      workCalendarName: connection.workCalendarName,
      unavailableCalendarName: connection.unavailableCalendarName,
      nextUnavailableLabel: nextBlock ? client.buildUnavailableBlockLabel(nextBlock) : "",
      syncError: normalizeString(connection.lastError, 400),
    };
  }

  async function loadStaffCalendarStates(staffSummaries, config) {
    if (!Array.isArray(staffSummaries) || staffSummaries.length === 0) return [];

    const results = await Promise.all(
      staffSummaries.map(async (staffSummary) => {
        try {
          const availabilityResult = await listStaffAvailabilityBlocks(staffSummary, config);
          return {
            ...staffSummary,
            calendarMeta: buildCalendarMeta(staffSummary, availabilityResult),
            calendarAvailabilityBlocks: sanitizeAvailabilityBlocks(availabilityResult.blocks),
          };
        } catch (error) {
          const connection = sanitizeGoogleCalendarConnection(staffSummary && staffSummary.calendar);
          if (connection) {
            const nextConnection = sanitizeGoogleCalendarConnection({
              ...connection,
              status: "attention",
              lastError: normalizeString(error && error.message, 400) || "Не удалось прочитать Google Calendar.",
              updatedAt: new Date().toISOString(),
            });
            await persistUpdatedConnection(staffSummary.id, nextConnection);
            return {
              ...staffSummary,
              calendarMeta: buildCalendarMeta(
                { ...staffSummary, calendar: nextConnection },
                { blocks: [] }
              ),
              calendarAvailabilityBlocks: [],
            };
          }
          return {
            ...staffSummary,
            calendarMeta: buildCalendarMeta(staffSummary, { blocks: [] }),
            calendarAvailabilityBlocks: [],
          };
        }
      })
    );

    return results;
  }

  async function handleOAuthCallback({ code, state, config }) {
    if (!client || !client.isConfigured || !client.isConfigured()) {
      throw new Error("GOOGLE_CALENDAR_NOT_CONFIGURED");
    }
    const exchangeResult = await client.exchangeCode({
      code,
      state,
      secret: getSecret(config),
    });
    const snapshot = await getSnapshot();
    const staffRecord = snapshot.staff.find(
      (record) => record.id === exchangeResult.staffId
    );
    if (!staffRecord) {
      throw new Error("STAFF_NOT_FOUND");
    }

    await staffStore.updateStaff(staffRecord.id, {
      calendar: exchangeResult.connection,
    });
    await syncStaffAssignments(staffRecord.id, config);
    return exchangeResult.staffId;
  }

  async function buildConnectUrl(staffId, config, loginHint = "") {
    if (!client || !client.isConfigured || !client.isConfigured()) {
      throw new Error("GOOGLE_CALENDAR_NOT_CONFIGURED");
    }
    return client.buildConnectUrl({
      staffId,
      secret: getSecret(config),
      loginHint,
    });
  }

  async function deleteLinkedEvent(connection, config, eventLink) {
    if (!eventLink || !eventLink.eventId) return connection;
    const result = await client.deleteWorkEvent({
      connection,
      secret: getSecret(config),
      externalEventId: eventLink.eventId,
    });
    return result.connection || connection;
  }

  async function syncAssignment(entryId, config, providedEntry = null) {
    if (!client || !client.isConfigured || !client.isConfigured() || !staffStore) {
      return { ok: true };
    }

    const snapshot = await getSnapshot();
    const nonAssignableStaffIds = await getNonAssignableStaffIds();
    const assignment = snapshot.assignments.find((record) => record.entryId === entryId);
    if (!assignment) return { ok: true };

    const entry = providedEntry || (quoteOpsLedger ? await quoteOpsLedger.getEntry(entryId) : null);
    if (!entry) return { ok: false };

    const window = client.buildAssignmentScheduleWindow(entry, assignment);
    const orderStatus = client.getEntryOrderStatus(entry);
    const eligible =
      assignment.status === "confirmed" &&
      window.hasWindow &&
      orderStatus !== "completed" &&
      orderStatus !== "canceled" &&
      window.endMs >= Date.now() - 60 * 60 * 1000;

    let nextSyncState = sanitizeGoogleCalendarSync(assignment.calendarSync);
    const selectedStaffIds = new Set(
      (Array.isArray(assignment.staffIds) ? assignment.staffIds : []).filter(
        (staffId) => !nonAssignableStaffIds.has(normalizeString(staffId, 120))
      )
    );
    const staffById = new Map(snapshot.staff.map((record) => [record.id, record]));
    const linkedStaffIds = new Set(
      nextSyncState ? Object.keys(nextSyncState.google.byStaffId) : []
    );
    const syncTargetIds = new Set([...selectedStaffIds, ...linkedStaffIds]);

    for (const staffId of syncTargetIds) {
      const staffRecord = staffById.get(staffId) || null;
      const connection = sanitizeGoogleCalendarConnection(staffRecord && staffRecord.calendar);
      const existingLink = getGoogleCalendarEventLink(nextSyncState, staffId);
      const assignable = !nonAssignableStaffIds.has(normalizeString(staffId, 120));

      if (!staffRecord || !connection || !eligible || !selectedStaffIds.has(staffId) || !assignable) {
        if (existingLink && connection) {
          const updatedConnection = await deleteLinkedEvent(connection, config, existingLink);
          if (updatedConnection !== connection) {
            await persistUpdatedConnection(staffId, updatedConnection);
          }
        }
        nextSyncState = setGoogleCalendarEventLink(nextSyncState, staffId, null);
        continue;
      }

      const syncResult = await client.upsertWorkEvent({
        connection,
        secret: getSecret(config),
        externalEventId: existingLink ? existingLink.eventId : "",
        eventInput: {
          entry,
          assignment,
          staffRecord,
        },
      });
      if (syncResult.changed && syncResult.connection) {
        await persistUpdatedConnection(staffId, syncResult.connection);
      }
      nextSyncState = setGoogleCalendarEventLink(
        nextSyncState,
        staffId,
        syncResult.eventLink
      );
    }

    await staffStore.setAssignment(entryId, {
      calendarSync: nextSyncState,
    });
    return { ok: true };
  }

  async function clearAssignmentEvents(entryId, config) {
    if (!client || !client.isConfigured || !client.isConfigured() || !staffStore) {
      return { ok: true };
    }
    const snapshot = await getSnapshot();
    const assignment = snapshot.assignments.find((record) => record.entryId === entryId);
    if (!assignment) return { ok: true };

    const syncState = sanitizeGoogleCalendarSync(assignment.calendarSync);
    if (!syncState) return { ok: true };
    const staffById = new Map(snapshot.staff.map((record) => [record.id, record]));

    for (const [staffId, eventLink] of Object.entries(syncState.google.byStaffId)) {
      const staffRecord = staffById.get(staffId);
      const connection = sanitizeGoogleCalendarConnection(staffRecord && staffRecord.calendar);
      if (!connection) continue;
      const updatedConnection = await deleteLinkedEvent(connection, config, eventLink);
      if (updatedConnection !== connection) {
        await persistUpdatedConnection(staffId, updatedConnection);
      }
    }

    return { ok: true };
  }

  async function disconnectStaffCalendar(staffId, config) {
    if (!staffStore) return false;
    const snapshot = await getSnapshot();
    const staffRecord = snapshot.staff.find((record) => record.id === normalizeString(staffId, 120));
    if (!staffRecord) {
      throw new Error("STAFF_NOT_FOUND");
    }

    const connection = sanitizeGoogleCalendarConnection(staffRecord.calendar);
    if (!connection) {
      await staffStore.updateStaff(staffRecord.id, { calendar: null });
      return true;
    }

    for (const assignment of snapshot.assignments.filter((record) => record.staffIds.includes(staffRecord.id))) {
      const eventLink = getGoogleCalendarEventLink(assignment.calendarSync, staffRecord.id);
      if (eventLink) {
        const updatedConnection = await deleteLinkedEvent(connection, config, eventLink);
        if (updatedConnection !== connection) {
          await persistUpdatedConnection(staffRecord.id, updatedConnection);
        }
        await staffStore.setAssignment(assignment.entryId, {
          calendarSync: setGoogleCalendarEventLink(assignment.calendarSync, staffRecord.id, null),
        });
      }
    }

    await staffStore.updateStaff(staffRecord.id, { calendar: null });
    return true;
  }

  async function syncStaffAssignments(staffId, config) {
    if (!staffStore) return;
    const snapshot = await getSnapshot();
    const relevantAssignments = snapshot.assignments.filter((record) =>
      record.staffIds.includes(normalizeString(staffId, 120))
    );
    for (const assignment of relevantAssignments) {
      await syncAssignment(assignment.entryId, config);
    }
  }

  async function findAssignmentConflicts({ entry, assignmentInput, config }) {
    if (!client || !client.isConfigured || !client.isConfigured() || !staffStore) {
      return [];
    }

    const candidateAssignment = {
      scheduleDate: normalizeString(
        assignmentInput.scheduleDate || entry.selectedDate,
        32
      ),
      scheduleTime: normalizeString(
        assignmentInput.scheduleTime || entry.selectedTime,
        32
      ),
    };
    const window = client.buildAssignmentScheduleWindow(entry, candidateAssignment);
    if (!window.hasWindow) return [];

    const snapshot = await getSnapshot();
    const nonAssignableStaffIds = await getNonAssignableStaffIds();
    const conflicts = [];
    for (const staffId of Array.isArray(assignmentInput.staffIds) ? assignmentInput.staffIds : []) {
      if (nonAssignableStaffIds.has(normalizeString(staffId, 120))) continue;
      const staffRecord = snapshot.staff.find((record) => record.id === staffId);
      const connection = sanitizeGoogleCalendarConnection(staffRecord && staffRecord.calendar);
      if (!staffRecord || !connection) continue;

      const rangeStart = new Date(window.startMs - 24 * 60 * 60 * 1000).toISOString();
      const rangeEnd = new Date(window.endMs + 24 * 60 * 60 * 1000).toISOString();
      const availabilityResult = await client.listUnavailableBlocks({
        connection,
        secret: getSecret(config),
        timeMin: rangeStart,
        timeMax: rangeEnd,
      });
      if (availabilityResult.changed && availabilityResult.connection) {
        await persistUpdatedConnection(staffRecord.id, availabilityResult.connection);
      }

      const blockingEvent = availabilityResult.blocks.find((block) =>
        doWindowsOverlap(window.startMs, window.endMs, block.startMs, block.endMs)
      );
      if (blockingEvent) {
        conflicts.push({
          staffId: staffRecord.id,
          name: staffRecord.name,
          label: client.buildUnavailableBlockLabel(blockingEvent),
        });
      }
    }

    return conflicts;
  }

  return {
    client,
    isConfigured() {
      return Boolean(client && client.isConfigured && client.isConfigured());
    },
    buildConnectUrl,
    buildCalendarMeta,
    clearAssignmentEvents,
    disconnectStaffCalendar,
    findAssignmentConflicts,
    handleOAuthCallback,
    hasConnection(record) {
      return hasGoogleCalendarConnection(record);
    },
    loadStaffCalendarStates,
    syncAssignment,
    syncStaffAssignments,
  };
}

module.exports = {
  buildAssignmentScheduleWindow,
  createAdminGoogleCalendarClient,
  createAdminGoogleCalendarIntegration,
  hasGoogleCalendarConnection,
  loadAdminGoogleCalendarConfig,
  sanitizeGoogleCalendarConnection,
  sanitizeGoogleCalendarEventLink,
  sanitizeGoogleCalendarSync,
  setGoogleCalendarEventLink,
  getGoogleCalendarEventLink,
};
