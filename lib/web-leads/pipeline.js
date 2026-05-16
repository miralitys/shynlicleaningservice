"use strict";

const { appendWebLeadRow } = require("./google-sheets");
const { sendTelegramLeadNotification } = require("./telegram");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logPipelineEvent(requestLogger, payload) {
  if (requestLogger && typeof requestLogger.log === "function") {
    requestLogger.log({
      ts: new Date().toISOString(),
      ...payload,
    });
  }
}

async function retryOnce(operation) {
  try {
    return await operation();
  } catch (firstError) {
    await wait(2000);
    try {
      return await operation();
    } catch (secondError) {
      secondError.firstError = firstError;
      throw secondError;
    }
  }
}

async function deliverWebLead(record, options = {}) {
  const requestLogger = options.requestLogger || null;
  const results = await Promise.allSettled([
    retryOnce(() => appendWebLeadRow(record.row, options)),
    sendTelegramLeadNotification(record, options),
  ]);

  const [sheetsResult, telegramResult] = results;
  if (sheetsResult.status === "fulfilled") {
    logPipelineEvent(requestLogger, {
      type: "web_leads_sheets_append_result",
      skipped: Boolean(sheetsResult.value && sheetsResult.value.skipped),
      reason: sheetsResult.value && sheetsResult.value.reason,
      lead_source: record.summary && record.summary.leadSource,
    });
  } else {
    logPipelineEvent(requestLogger, {
      type: "web_leads_sheets_append_error",
      message: sheetsResult.reason && sheetsResult.reason.message ? sheetsResult.reason.message : "Unknown Sheets error",
      lead_source: record.summary && record.summary.leadSource,
    });
  }

  if (telegramResult.status === "fulfilled") {
    logPipelineEvent(requestLogger, {
      type: "web_leads_telegram_result",
      skipped: Boolean(telegramResult.value && telegramResult.value.skipped),
      reason: telegramResult.value && telegramResult.value.reason,
      lead_source: record.summary && record.summary.leadSource,
    });
  } else {
    logPipelineEvent(requestLogger, {
      type: "web_leads_telegram_error",
      message: telegramResult.reason && telegramResult.reason.message ? telegramResult.reason.message : "Unknown Telegram error",
      lead_source: record.summary && record.summary.leadSource,
    });
  }

  return results;
}

function queueWebLeadDelivery(record, options = {}) {
  setImmediate(() => {
    deliverWebLead(record, options).catch((error) => {
      logPipelineEvent(options.requestLogger, {
        type: "web_leads_pipeline_unhandled_error",
        message: error && error.message ? error.message : "Unknown Web Leads pipeline error",
      });
    });
  });
}

module.exports = {
  deliverWebLead,
  queueWebLeadDelivery,
};
