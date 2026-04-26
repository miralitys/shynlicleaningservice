"use strict";

function createOrdersUiQuoteHelpers(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    ORDER_QUOTE_QUANTITY_LABELS,
    ORDER_QUOTE_SERVICE_ALIASES,
    ORDER_QUOTE_SERVICE_LABELS,
    ORDER_QUOTE_SQUARE_FOOTAGE_LABELS,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminCalendarDate,
    formatAdminClockTime,
    formatAdminDateTime,
    getEntryOrderCompletionData,
    normalizeString,
    renderAdminPropertyList,
  } = deps;

  function getOrderQuoteData(order) {
    const payload =
      order && order.entry && order.entry.payloadForRetry && typeof order.entry.payloadForRetry === "object"
        ? order.entry.payloadForRetry
        : {};
    return payload.calculatorData && typeof payload.calculatorData === "object" ? payload.calculatorData : {};
  }

  function getOrderCompletionData(order) {
    const completion = getEntryOrderCompletionData(order && order.entry ? order.entry : null);

    function normalizeAssets(value = [], kind = "before") {
      const items = Array.isArray(value) ? value : [];
      const output = [];
      const seen = new Set();

      for (const asset of items) {
        if (!asset || typeof asset !== "object") continue;
        const assetId = normalizeString(asset.id, 180);
        if (!assetId || seen.has(assetId)) continue;
        seen.add(assetId);
        output.push({
          id: assetId,
          kind,
          fileName: normalizeString(asset.fileName, 180) || assetId,
          uploadedAt: normalizeString(asset.uploadedAt, 80),
          sizeBytes: Math.max(0, Number(asset.sizeBytes) || 0),
        });
      }

      return output;
    }

    function normalizeCleanerComments(value = []) {
      return (Array.isArray(value) ? value : [])
        .map((comment) => ({
          id: normalizeString(comment && comment.id, 120),
          text: normalizeString(comment && comment.text, 1000),
          authorName: normalizeString(comment && comment.authorName, 120),
          authorEmail: normalizeString(comment && comment.authorEmail, 250),
          createdAt: normalizeString(comment && comment.createdAt, 80),
        }))
        .filter((comment) => comment.text);
    }

    return {
      cleanerComment: normalizeString(completion.cleanerComment, 4000),
      cleanerComments: normalizeCleanerComments(completion.cleanerComments),
      beforePhotos: normalizeAssets(completion.beforePhotos, "before"),
      afterPhotos: normalizeAssets(completion.afterPhotos, "after"),
      updatedAt: normalizeString(completion.updatedAt, 80),
    };
  }

  function normalizeOrderQuoteToken(value) {
    return normalizeString(value, 80)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function normalizeOrderQuoteList(value) {
    const source = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [];

    return source
      .map((entry) => normalizeString(entry, 120))
      .filter(Boolean);
  }

  function formatOrderQuoteText(value, emptyLabel = "Не указано", maxLength = 500) {
    const normalized = normalizeString(value, maxLength);
    return normalized || emptyLabel;
  }

  function formatOrderQuoteDateValue(value, emptyLabel = "Не указана") {
    const formatted = formatAdminCalendarDate(value);
    return formatted === "Не указано" ? emptyLabel : formatted;
  }

  function formatOrderQuoteTimeValue(value, emptyLabel = "Не указано") {
    const formatted = formatAdminClockTime(value);
    return formatted === "Не указано" ? emptyLabel : formatted;
  }

  function buildFormattedScheduleLabel(dateValue, timeValue) {
    const formattedDate = formatAdminCalendarDate(dateValue);
    const formattedTime = formatAdminClockTime(timeValue);
    const hasDate = formattedDate && formattedDate !== "Не указано";
    const hasTime = formattedTime && formattedTime !== "Не указано";

    if (hasDate && hasTime) return `${formattedDate}, ${formattedTime}`;
    if (hasDate) return formattedDate;
    if (hasTime) return formattedTime;
    return "";
  }

  function formatOrderQuoteRequestedSlot(formattedValue, dateValue, timeValue) {
    const scheduleLabel = buildFormattedScheduleLabel(dateValue, timeValue);
    if (scheduleLabel) return scheduleLabel;

    const normalized = normalizeString(formattedValue, 120);
    if (!normalized) return "Не указано";

    const parsedDate = new Date(normalized.replace(/\s+at\s+/i, " "));
    if (!Number.isNaN(parsedDate.getTime())) {
      return formatAdminDateTime(parsedDate);
    }

    return normalized;
  }

  function formatOrderQuoteBoolean(value, emptyLabel = "Не указано") {
    if (value === true || value === false) return value ? "Да" : "Нет";
    const normalized = normalizeString(value, 64);
    if (!normalized) return emptyLabel;
    const compact = normalized.toLowerCase();
    if (["yes", "true", "1", "on"].includes(compact)) return "Да";
    if (["no", "false", "0", "off"].includes(compact)) return "Нет";
    return normalized;
  }

  function formatOrderQuotePetsLabel(value, emptyLabel = "Не указано") {
    if (value === true || value === false) return value ? "Да" : "Нет";
    const normalized = normalizeString(value, 64);
    if (!normalized) return emptyLabel;
    const compact = normalized.toLowerCase();
    if (["no", "none", "false", "0", "off"].includes(compact)) return "Нет";
    if (compact === "cat") return "Кошка";
    if (compact === "dog") return "Собака";
    if (["yes", "true", "1", "on"].includes(compact)) return "Да";
    return normalized;
  }

  function formatOrderQuoteServiceType(value, fallback = "Не указано") {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
    if (!normalized) return fallback;
    if (normalized === "regular" || normalized === "standard") return "Standard";
    if (normalized === "deep") return "Deep";
    if (["moving", "move-in/out", "move-in-out", "moveout", "moveinout"].includes(normalized)) {
      return "Move-in/out";
    }
    return normalizeString(value, 80) || fallback;
  }

  function formatOrderQuoteFrequency(value, fallback = "Not set") {
    const normalized = normalizeString(value, 40)
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    if (!normalized) return fallback;
    if (normalized === "weekly") return "Weekly";
    if (normalized === "monthly") return "Monthly";
    if (normalized === "biweekly") return "Bi-weekly";
    return normalizeString(value, 80) || fallback;
  }

  function formatOrderQuoteSquareFootage(value) {
    const normalized = normalizeString(value, 32);
    if (!normalized) return "Не указано";
    const numeric = Number(normalized.replace(",", "."));
    if (Number.isFinite(numeric)) {
      const mapped = ORDER_QUOTE_SQUARE_FOOTAGE_LABELS[String(Math.round(numeric))];
      if (mapped) return mapped;
      return `${Math.round(numeric)} sq ft`;
    }
    return normalized;
  }

  function getOrderQuoteSelectedServices(quoteData = {}) {
    const selected = new Set();
    for (const source of [quoteData.services, quoteData.addOns, quoteData.extras]) {
      for (const item of normalizeOrderQuoteList(source)) {
        const normalizedKey = normalizeOrderQuoteToken(item);
        const serviceKey = ORDER_QUOTE_SERVICE_ALIASES[normalizedKey] || item;
        const label = ORDER_QUOTE_SERVICE_LABELS[serviceKey];
        selected.add(label || item);
      }
    }
    return Array.from(selected);
  }

  function getOrderQuoteQuantityValue(quoteData = {}, key) {
    const quantityServices =
      quoteData && quoteData.quantityServices && typeof quoteData.quantityServices === "object"
        ? quoteData.quantityServices
        : {};
    const rawValue = quantityServices[key];
    if (rawValue === 0 || rawValue === "0") return "0";
    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue) && numericValue >= 0) return String(Math.round(numericValue));
    return formatOrderQuoteText(rawValue, "0", 32);
  }

  function formatOrderQuoteMultiline(value, emptyLabel = "Не указано") {
    const normalized = String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!normalized) return escapeHtml(emptyLabel);
    return escapeHtml(normalized).replace(/\n/g, "<br>");
  }

  function buildOrderMediaPath(orderId, assetId) {
    return `${ADMIN_ORDERS_PATH}?media=1&entryId=${encodeURIComponent(orderId)}&asset=${encodeURIComponent(assetId)}`;
  }

  function formatOrderMediaCountLabel(count, emptyLabel) {
    const normalized = Math.max(0, Number(count) || 0);
    if (normalized === 0) return emptyLabel;
    if (normalized === 1) return "1 файл";
    if (normalized >= 2 && normalized <= 4) return `${normalized} файла`;
    return `${normalized} файлов`;
  }

  function renderOrderMediaGallery(title, emptyLabel, orderId, assets = [], kind = "") {
    const items = Array.isArray(assets) ? assets : [];
    return `<article class="admin-order-media-panel">
      <div class="admin-subsection-head admin-order-media-head">
        <div>
          <h4 class="admin-subsection-title">${escapeHtml(title)}</h4>
          <p class="admin-order-media-copy" data-admin-order-media-copy>${escapeHtml(formatOrderMediaCountLabel(items.length, emptyLabel))}</p>
        </div>
      </div>
      <div
        class="admin-order-media-body"
        data-admin-order-media-body
        data-admin-order-media-kind="${escapeHtmlAttribute(kind)}"
        data-admin-order-media-title="${escapeHtmlAttribute(title)}"
        data-admin-order-media-empty-label="${escapeHtmlAttribute(emptyLabel)}"
      >
        ${items.length > 0
          ? `<div class="admin-order-media-file-list">
              ${items
                .map((asset, index) => {
                  const mediaPath = buildOrderMediaPath(orderId, asset.id);
                  const fileName = asset.fileName || `${title} ${index + 1}`;
                  return `<article class="admin-order-media-file">
                    <span class="admin-order-media-file-icon" aria-hidden="true">IMG</span>
                    <div class="admin-order-media-file-copy">
                      <strong>${escapeHtml(fileName)}</strong>
                      <span>${escapeHtml(title)} ${escapeHtml(String(index + 1))}</span>
                    </div>
                    <a class="admin-order-media-view-button" href="${escapeHtmlAttribute(mediaPath)}" target="_blank" rel="noreferrer">Посмотреть</a>
                  </article>`;
                })
                .join("")}
            </div>`
          : `<div class="admin-order-media-empty">${escapeHtml(emptyLabel)}</div>`}
      </div>
    </article>`;
  }

  function renderOrderQuoteField(label, value, options = {}) {
    const className = options.wide
      ? "admin-order-quote-field admin-order-quote-field-wide"
      : "admin-order-quote-field";
    const content = options.raw ? value : escapeHtml(value);

    return `<div class="${className}">
      <span class="admin-order-quote-field-label">${escapeHtml(label)}</span>
      <p class="admin-order-quote-field-value">${content}</p>
    </div>`;
  }

  function renderOrderDetailCard(title, body, options = {}) {
    const className = options.wide
      ? "admin-order-detail-card admin-order-detail-card-wide"
      : "admin-order-detail-card";
    return `<article class="${className}">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">${escapeHtml(title)}</h4>
        ${options.hint ? `<span class="admin-action-hint">${escapeHtml(options.hint)}</span>` : ""}
      </div>
      ${options.description ? `<p class="admin-card-copy admin-order-detail-copy">${escapeHtml(options.description)}</p>` : ""}
      ${body}
    </article>`;
  }

  function renderOrderPropertyCard(title, rows = [], options = {}) {
    return renderOrderDetailCard(title, renderAdminPropertyList(rows), options);
  }

  function renderOrderBriefCard(title, body, options = {}) {
    const className = options.wide
      ? "admin-order-brief-card admin-order-brief-card-wide"
      : "admin-order-brief-card";
    return `<article class="${className}">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">${escapeHtml(title)}</h4>
        ${options.hint ? `<span class="admin-action-hint">${escapeHtml(options.hint)}</span>` : ""}
      </div>
      ${options.description ? `<p class="admin-card-copy admin-order-brief-copy">${escapeHtml(options.description)}</p>` : ""}
      ${body}
    </article>`;
  }

  function renderOrderBriefFact(label, value, options = {}) {
    const className = options.wide
      ? "admin-order-brief-fact admin-order-brief-fact-wide"
      : "admin-order-brief-fact";
    const content = options.raw ? value : escapeHtml(value);

    return `<div class="${className}">
      <span class="admin-order-brief-fact-label">${escapeHtml(label)}</span>
      <p class="admin-order-brief-fact-value">${content}</p>
    </div>`;
  }

  function renderOrderServicePills(items = [], emptyLabel = "Дополнительные add-ons не выбраны.") {
    if (!Array.isArray(items) || items.length === 0) {
      return `<p class="admin-order-service-empty">${escapeHtml(emptyLabel)}</p>`;
    }

    return `<div class="admin-order-service-pills">
      ${items.map((item) => `<span class="admin-order-service-pill">${escapeHtml(item)}</span>`).join("")}
    </div>`;
  }

  return {
    getOrderQuoteData,
    getOrderCompletionData,
    normalizeOrderQuoteToken,
    normalizeOrderQuoteList,
    formatOrderQuoteText,
    formatOrderQuoteDateValue,
    formatOrderQuoteTimeValue,
    formatOrderQuoteRequestedSlot,
    buildFormattedScheduleLabel,
    formatOrderQuoteBoolean,
    formatOrderQuotePetsLabel,
    formatOrderQuoteServiceType,
    formatOrderQuoteFrequency,
    formatOrderQuoteSquareFootage,
    getOrderQuoteSelectedServices,
    getOrderQuoteQuantityValue,
    formatOrderQuoteMultiline,
    buildOrderMediaPath,
    formatOrderMediaCountLabel,
    renderOrderMediaGallery,
    renderOrderQuoteField,
    renderOrderDetailCard,
    renderOrderPropertyCard,
    renderOrderBriefCard,
    renderOrderBriefFact,
    renderOrderServicePills,
  };
}

module.exports = {
  createOrdersUiQuoteHelpers,
};
