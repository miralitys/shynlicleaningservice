"use strict";

const DEFAULT_TIMEOUT_MS = 1600;

function clean(value, maxLength = 800) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function loadTelegramConfig(options = {}) {
  const env = options.env || process.env;
  const botToken = clean(env.WEB_LEADS_TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN, 300);
  const chatId = clean(env.WEB_LEADS_TELEGRAM_CHAT_ID || env.TELEGRAM_CHAT_ID, 120);
  return {
    configured: Boolean(botToken && chatId),
    botToken,
    chatId,
    fetch: options.fetch || global.fetch,
    timeoutMs: Number.parseInt(env.WEB_LEADS_TELEGRAM_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT_MS,
  };
}

function formatTelegramLeadMessage(record) {
  const summary = record && record.summary ? record.summary : {};
  const lines = [
    "New Shynli lead",
    `Type: ${clean(summary.leadSource) || "website"}`,
    `Name: ${clean(summary.name) || "-"}`,
    `Phone: ${clean(summary.phone) || "-"}`,
    `Service: ${clean(summary.service) || "-"}`,
  ];
  if (summary.zipCode) lines.push(`ZIP: ${clean(summary.zipCode)}`);
  if (summary.gclid) lines.push(`GCLID: ${clean(summary.gclid, 24)}...`);
  if (summary.landingPage) lines.push(`Landing: ${clean(summary.landingPage, 180)}`);
  return lines.join("\n");
}

async function sendTelegramLeadNotification(record, options = {}) {
  const config = options.config || loadTelegramConfig(options);
  if (!config.configured) {
    return {
      ok: true,
      skipped: true,
      reason: "telegram_not_configured",
    };
  }
  if (typeof config.fetch !== "function") {
    throw new Error("A fetch implementation is required for Telegram notifications.");
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), Math.max(500, config.timeoutMs))
    : null;
  try {
    const response = await config.fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: formatTelegramLeadMessage(record),
        disable_web_page_preview: true,
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(`Telegram lead notification failed with status ${response.status || 0}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return {
      ok: true,
      status: response.status,
      payload,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

module.exports = {
  formatTelegramLeadMessage,
  loadTelegramConfig,
  sendTelegramLeadNotification,
};
