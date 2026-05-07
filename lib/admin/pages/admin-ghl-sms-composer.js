"use strict";

const {
  filterCustomerSmsHistoryEntries,
} = require("../sms-history-filters");

function createAdminGhlSmsComposerHelpers(deps = {}) {
  const {
    ADMIN_QUOTE_OPS_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminDateTime,
    formatAdminPhoneNumber,
    getRequestUrl,
    normalizeString,
    renderAdminBadge,
    renderAdminCard,
  } = deps;

  function getAdminSmsComposerState(req, target, ref) {
    if (!req || !target || !ref) {
      return { notice: "", draft: "", error: "" };
    }

    const reqUrl = getRequestUrl(req);
    const smsTarget = normalizeString(reqUrl.searchParams.get("smsTarget"), 40).toLowerCase();
    const smsRef = normalizeString(reqUrl.searchParams.get("smsRef"), 160);
    if (smsTarget !== normalizeString(target, 40).toLowerCase() || smsRef !== normalizeString(ref, 160)) {
      return { notice: "", draft: "", error: "" };
    }

    return {
      notice: normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase(),
      draft: normalizeString(reqUrl.searchParams.get("smsDraft"), 1000),
      error: normalizeString(reqUrl.searchParams.get("smsError"), 240),
    };
  }

  function getEntryAdminSmsData(entry = {}) {
    const payload =
      entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
        ? entry.payloadForRetry
        : {};
    return payload.adminSms && typeof payload.adminSms === "object" ? payload.adminSms : {};
  }

  function normalizeSmsHistoryEntry(item) {
    if (!item || typeof item !== "object") return null;
    const message = normalizeString(item.message, 1000);
    if (!message) return null;
    return {
      id: normalizeString(item.id, 120),
      sentAt: normalizeString(item.sentAt || item.createdAt, 80),
      message,
      phone: normalizeString(item.phone, 80),
      contactId: normalizeString(item.contactId, 120),
      channel: normalizeString(item.channel, 40).toLowerCase() || "ghl",
      direction: normalizeString(item.direction, 20).toLowerCase() === "inbound" ? "inbound" : "outbound",
      source: normalizeString(item.source, 20).toLowerCase() === "automatic" ? "automatic" : "manual",
      targetType: normalizeString(item.targetType, 40).toLowerCase(),
      targetRef: normalizeString(item.targetRef, 160),
      conversationId: normalizeString(item.conversationId, 120),
      messageId: normalizeString(item.messageId, 120),
      status: normalizeString(item.status, 20).toLowerCase() === "failed" ? "failed" : "sent",
      errorCode: normalizeString(item.errorCode, 80).toUpperCase(),
      errorMessage: normalizeString(item.errorMessage, 300),
      recipientName: normalizeString(item.recipientName, 200),
      recipientRole: normalizeString(item.recipientRole, 40).toLowerCase(),
      readAt: normalizeString(item.readAt || item.seenAt || item.openedAt, 80),
    };
  }

  function sortSmsHistoryEntries(left, right) {
    const leftMs = Date.parse(left.sentAt || "");
    const rightMs = Date.parse(right.sentAt || "");
    if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
      return rightMs - leftMs;
    }
    return normalizeString(right.sentAt, 80).localeCompare(normalizeString(left.sentAt, 80));
  }

  function getEntrySmsHistoryEntries(entry = {}) {
    const history = getEntryAdminSmsData(entry).history;
    if (!Array.isArray(history)) return [];
    return history.map(normalizeSmsHistoryEntry).filter(Boolean).sort(sortSmsHistoryEntries);
  }

  function getEntryCustomerSmsHistoryEntries(entry = {}) {
    return filterCustomerSmsHistoryEntries(entry, getEntrySmsHistoryEntries(entry)).sort(sortSmsHistoryEntries);
  }

  function getClientSmsHistoryEntries(client = {}) {
    if (!client || !Array.isArray(client.entries)) return [];
    return client.entries.flatMap((entry) => getEntrySmsHistoryEntries(entry)).sort(sortSmsHistoryEntries);
  }

  function getClientCustomerSmsHistoryEntries(client = {}) {
    if (!client || !Array.isArray(client.entries)) return [];
    return client.entries
      .flatMap((entry) =>
        filterCustomerSmsHistoryEntries(
          {
            ...entry,
            customerPhone: normalizeString(client.phone || (entry && entry.customerPhone), 80),
            contactId: normalizeString(entry && entry.contactId, 120),
            clientKey: normalizeString(client.key, 160),
          },
          getEntrySmsHistoryEntries(entry)
        )
      )
      .sort(sortSmsHistoryEntries);
  }

  function getStaffSmsHistoryEntries(staffRecord = {}) {
    if (!staffRecord || !Array.isArray(staffRecord.smsHistory)) return [];
    return staffRecord.smsHistory.map(normalizeSmsHistoryEntry).filter(Boolean).sort(sortSmsHistoryEntries);
  }

  function formatAdminSmsHistorySourceLabel(value) {
    const normalized = normalizeString(value, 20).toLowerCase();
    if (normalized === "automatic") return "Автоматически";
    if (normalized === "client") return "Клиент";
    return "Вручную";
  }

  function getAdminSmsHistorySourceTone(value) {
    const normalized = normalizeString(value, 20).toLowerCase();
    if (normalized === "automatic") return "muted";
    if (normalized === "client") return "outline";
    return "success";
  }

  function formatAdminSmsHistoryDirectionLabel(value) {
    return normalizeString(value, 20).toLowerCase() === "inbound" ? "Входящее" : "Исходящее";
  }

  function formatAdminSmsHistoryCountLabel(count) {
    const numeric = Math.max(0, Number.parseInt(String(count || 0), 10) || 0);
    if (numeric === 0) return "Пока пусто";
    return `${numeric} SMS`;
  }

  function getAdminSmsHistoryFilterDefinitions() {
    return [
      { value: "inbound", label: "Входящие" },
      { value: "outbound", label: "Исходящие" },
      { value: "automatic", label: "Автоматические" },
      { value: "manual", label: "Ручные" },
    ];
  }

  function renderAdminSmsHistoryFilters() {
    const filters = getAdminSmsHistoryFilterDefinitions();
    return `<div class="admin-ghl-sms-filter-row" data-admin-ghl-sms-filters>
      ${filters
        .map(
          (filter) => `<button
            class="admin-ghl-sms-filter-button"
            type="button"
            data-admin-ghl-sms-filter="${escapeHtmlAttribute(filter.value)}"
            aria-pressed="false"
          >${escapeHtml(filter.label)}</button>`
        )
        .join("")}
    </div>`;
  }

  function formatAdminSmsHistoryTargetLabel(entry = {}) {
    const recipientRole = normalizeString(entry.recipientRole, 40).toLowerCase();
    const targetType = normalizeString(entry.targetType, 40).toLowerCase();
    if (recipientRole === "admin" || targetType === "admin") return "Админ";
    if (recipientRole === "manager" || targetType === "manager") return "Менеджер";
    if (recipientRole === "staff" || targetType === "staff") return "Сотрудник";
    if (targetType === "quote" || targetType === "client") return "Клиент";
    return "SMS";
  }

  function renderAdminSmsHistoryItems(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return `<div class="admin-empty-state admin-ghl-sms-history-empty">История SMS появится здесь после первой отправки.</div>`;
    }

    const scrollClass = entries.length > 2 ? " is-scrollable" : "";

    return `<div class="admin-history-list admin-ghl-sms-history-list${scrollClass}" data-admin-ghl-sms-history-list>
      ${entries
        .map((entry) => {
          const sentAtLabel =
            entry.sentAt && typeof formatAdminDateTime === "function"
              ? formatAdminDateTime(entry.sentAt)
              : "Дата не указана";
          const metaBadges = [
            renderAdminBadge(formatAdminSmsHistorySourceLabel(entry.source), getAdminSmsHistorySourceTone(entry.source)),
            renderAdminBadge(formatAdminSmsHistoryDirectionLabel(entry.direction), "outline"),
            entry.channel === "ghl" ? renderAdminBadge("Go High Level", "outline") : "",
            renderAdminBadge(formatAdminSmsHistoryTargetLabel(entry), "outline"),
            renderAdminBadge(entry.status === "failed" ? "Не доставлено" : "Отправлено", entry.status === "failed" ? "error" : "success"),
          ]
            .filter(Boolean)
            .join("");
          const recipientMeta = [
            normalizeString(entry.recipientName, 200),
            entry.phone ? formatAdminPhoneNumber(entry.phone) || entry.phone : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return `<article
            class="admin-history-item admin-client-history-item admin-ghl-sms-history-item"
            data-admin-ghl-sms-history-item
            data-admin-ghl-sms-source="${escapeHtmlAttribute(entry.source)}"
            data-admin-ghl-sms-direction="${escapeHtmlAttribute(entry.direction)}"
          >
            <div class="admin-ghl-sms-history-top">
              <div class="admin-client-history-copy-block">
                <div class="admin-ghl-sms-history-title-row">
                  <h3 class="admin-history-title">SMS</h3>
                  <p class="admin-history-copy">${escapeHtml(sentAtLabel)}</p>
                </div>
                <div class="admin-ghl-sms-history-badges">${metaBadges}</div>
                ${recipientMeta ? `<p class="admin-history-copy">${escapeHtml(recipientMeta)}</p>` : ""}
              </div>
            </div>
            <div class="admin-ghl-sms-history-bubble">
              <p class="admin-client-history-address admin-ghl-sms-history-message">${escapeHtml(entry.message)}</p>
            </div>
            ${entry.status === "failed" && entry.errorMessage ? `<p class="admin-history-copy">${escapeHtml(entry.errorMessage)}</p>` : ""}
          </article>`;
        })
        .join("")}
    </div>`;
  }

  function renderAdminSmsFeedback(noticeState, noticePrefix) {
    const notice = normalizeString(noticeState && noticeState.notice, 80).toLowerCase();
    const prefix = normalizeString(noticePrefix, 40).toLowerCase();
    const error = normalizeString(noticeState && noticeState.error, 240);

    if (!notice || !prefix || !notice.startsWith(`${prefix}-sms-`)) return "";
    if (notice === `${prefix}-sms-sent`) {
      return `<div class="admin-alert admin-alert-info">SMS отправлена через Go High Level.</div>`;
    }
    if (notice === `${prefix}-sms-empty`) {
      return `<div class="admin-alert admin-alert-error">Введите текст сообщения перед отправкой.</div>`;
    }
    if (notice === `${prefix}-sms-unavailable`) {
      return `<div class="admin-alert admin-alert-error">Go High Level сейчас не настроен для отправки SMS.</div>`;
    }
    if (notice === `${prefix}-sms-contact-missing`) {
      return `<div class="admin-alert admin-alert-error">${escapeHtml(error || "В Go High Level не найден контакт или телефон для отправки SMS.")}</div>`;
    }
    if (notice === `${prefix}-sms-failed`) {
      return `<div class="admin-alert admin-alert-error">${escapeHtml(error || "Не удалось отправить SMS через Go High Level.")}</div>`;
    }
    return "";
  }

  function renderAdminGhlSmsComposer(options = {}) {
    if (options.canEdit === false) return "";

    const noticePrefix = normalizeString(options.noticePrefix, 40).toLowerCase();
    const targetType = normalizeString(options.targetType, 40).toLowerCase();
    const targetRef = normalizeString(options.targetRef, 160);
    const targetFieldName = normalizeString(options.targetFieldName, 80);
    const targetFieldValue = normalizeString(options.targetFieldValue, 160);
    const actionPath = normalizeString(options.actionPath, 200) || ADMIN_QUOTE_OPS_PATH;
    const returnTo = normalizeString(options.returnTo, 1000);
    const title = normalizeString(options.title, 120) || "SMS через Go High Level";
    const description = normalizeString(options.description, 240) || "Сообщение уйдёт клиенту прямо из этой карточки.";
    const messagePlaceholder =
      normalizeString(options.messagePlaceholder, 240) ||
      "Напишите клиенту короткое SMS-сообщение...";
    const phone = normalizeString(options.phone, 80);
    const phoneLabel = formatAdminPhoneNumber(phone) || phone;
    const hasPhone = Boolean(phoneLabel);
    const hasContact = Boolean(normalizeString(options.contactId, 120));
    const composerState = getAdminSmsComposerState(options.req, targetType, targetRef);
    const feedbackMarkup = renderAdminSmsFeedback(composerState, noticePrefix);
    const historyEntries = Array.isArray(options.historyEntries) ? options.historyEntries : [];
    const historyMarkup = renderAdminSmsHistoryItems(historyEntries);
    const historyCountLabel = formatAdminSmsHistoryCountLabel(historyEntries.length);

    if (!options.leadConnectorConfigured) {
      return "";
    }

    return renderAdminCard(
      title,
      hasPhone ? `${description} Номер: ${phoneLabel}.` : description,
      `<div class="admin-ghl-sms-layout"
          data-admin-ghl-sms-root
          data-admin-ghl-sms-target="${escapeHtmlAttribute(targetType)}"
          data-admin-ghl-sms-action-path="${escapeHtmlAttribute(actionPath)}"
          data-admin-ghl-sms-load-action="${escapeHtmlAttribute(`load-${targetType}-sms-history`)}"
          data-admin-ghl-sms-target-field="${escapeHtmlAttribute(targetFieldName)}"
          data-admin-ghl-sms-target-value="${escapeHtmlAttribute(targetFieldValue)}"
          data-admin-ghl-sms-return-to="${escapeHtmlAttribute(returnTo)}">
        <div class="admin-ghl-sms-compose-column">
          <div data-admin-ghl-sms-feedback>${feedbackMarkup}</div>
          ${!hasPhone && !hasContact
            ? `<div class="admin-alert admin-alert-error">У клиента нет телефона или GHL contact ID. SMS сейчас отправить нельзя.</div>`
            : `<form class="admin-form admin-form-grid admin-ghl-sms-form" method="post" action="${escapeHtmlAttribute(actionPath)}" data-admin-ghl-sms="true">
                <input type="hidden" name="action" value="${escapeHtmlAttribute(`send-${targetType}-sms`)}">
                <input type="hidden" name="${escapeHtmlAttribute(targetFieldName)}" value="${escapeHtmlAttribute(targetFieldValue)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                <label class="admin-label">
                  Сообщение
                  <textarea class="admin-input" name="message" rows="4" maxlength="1000" placeholder="${escapeHtmlAttribute(messagePlaceholder)}">${escapeHtml(composerState.draft)}</textarea>
                </label>
                <div class="admin-inline-actions">
                  <button class="admin-button admin-button-secondary" type="submit">Отправить SMS</button>
                  <span class="admin-action-hint">${escapeHtml(hasPhone ? `Через GHL на ${phoneLabel}` : "Через контакт Go High Level")}</span>
                </div>
              </form>`}
        </div>
        <aside class="admin-ghl-sms-history-column">
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">История SMS</h3>
            <span class="admin-action-hint" data-admin-ghl-sms-history-count>${escapeHtml(historyCountLabel)}</span>
          </div>
          ${renderAdminSmsHistoryFilters()}
          <div data-admin-ghl-sms-history>${historyMarkup}</div>
          <div class="admin-empty-state admin-ghl-sms-history-empty" data-admin-ghl-sms-filter-empty hidden>Для этого фильтра пока нет SMS.</div>
        </aside>
      </div>`,
      {
        eyebrow: "SMS",
        muted: true,
        className: "admin-ghl-sms-card",
      }
    );
  }

  return {
    formatAdminSmsHistoryDirectionLabel,
    formatAdminSmsHistorySourceLabel,
    formatAdminSmsHistoryCountLabel,
    getAdminSmsHistorySourceTone,
    getAdminSmsComposerState,
    getClientSmsHistoryEntries,
    getClientCustomerSmsHistoryEntries,
    getEntryAdminSmsData,
    getEntryCustomerSmsHistoryEntries,
    getEntrySmsHistoryEntries,
    getStaffSmsHistoryEntries,
    renderAdminGhlSmsComposer,
    renderAdminSmsFeedback,
    renderAdminSmsHistoryItems,
  };
}

module.exports = {
  createAdminGhlSmsComposerHelpers,
};
