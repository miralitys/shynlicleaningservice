"use strict";

const { createAdminMessagesDomain } = require("../messages-domain");

function createMessagesPageRenderer(deps = {}) {
  const {
    ADMIN_MESSAGES_PATH,
    QUOTE_OPS_LEDGER_LIMIT,
    collectQuoteOpsManagerOptions,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminDateTime,
    getEntryCustomerSmsHistoryEntries,
    getEntrySmsHistoryEntries,
    getOrderDialogId,
    getProjectedOrderRecords,
    getQuoteOpsDialogId,
    getWorkspaceAccessContext,
    isOrderCreatedEntry,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderOrderManagementDialog,
    renderQuoteOpsDetailDialog,
    renderQuoteOpsWorkspaceStyle,
  } = deps;

  const PAGE_LEDGER_LIMIT = Math.min(QUOTE_OPS_LEDGER_LIMIT || 250, 500);
  const messageDomain = createAdminMessagesDomain({
    getEntryCustomerSmsHistoryEntries,
    getEntrySmsHistoryEntries,
    isOrderCreatedEntry,
    normalizeString,
  });

  function renderMessagesPageStyle() {
    return `<style>
      .admin-messages-page {
        display: grid;
        gap: 24px;
      }
      .admin-messages-summary-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      .admin-message-summary-card {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 24px;
        padding: 18px;
        background: rgba(255, 255, 255, 0.9);
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.06);
      }
      .admin-message-summary-label {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-message-summary-value {
        margin: 0;
        color: var(--foreground);
        font-size: clamp(30px, 5vw, 46px);
        line-height: 0.95;
        font-weight: 900;
      }
      .admin-messages-table .admin-table-cell-stack {
        min-width: 0;
      }
      .admin-message-dialog-title-row {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 100%;
      }
      .admin-message-unread-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        height: 24px;
        padding: 0 8px;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
        white-space: nowrap;
      }
      .admin-message-preview {
        max-width: 560px;
        color: var(--foreground);
        font-weight: 700;
        line-height: 1.45;
        white-space: normal;
      }
      .admin-message-row-new td:first-child {
        box-shadow: inset 4px 0 0 var(--accent);
      }
      @media (max-width: 900px) {
        .admin-messages-summary-strip {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    </style>`;
  }

  function buildMessageDialogId(record = {}) {
    const entryId = normalizeString(record.entryId, 120);
    if (!entryId) return "";
    return record.isOrder ? getOrderDialogId(entryId) : getQuoteOpsDialogId(entryId);
  }

  function renderMessageUnreadBadge(unreadCount) {
    const count = Math.max(0, Number.parseInt(String(unreadCount || 0), 10) || 0);
    if (count <= 0) return "";
    return `<span class="admin-message-unread-badge" data-admin-message-unread-badge="true">${escapeHtml(
      `${count} ${count === 1 ? "новое" : "новых"}`
    )}</span>`;
  }

  function renderMessageRows(dialogs = [], options = {}) {
    const listKind = normalizeString(options.listKind, 20).toLowerCase();
    if (!Array.isArray(dialogs) || dialogs.length === 0) {
      return `<div class="admin-empty-state" data-admin-message-empty-state="true">Диалогов в этом списке пока нет.</div>`;
    }

    return `<div class="admin-table-wrap" data-admin-message-list="${escapeHtmlAttribute(listKind || "all")}">
      <table class="admin-table admin-messages-table">
        <thead>
          <tr>
            <th>Диалог</th>
            <th>Последнее сообщение</th>
            <th>Когда</th>
            <th>Новые</th>
          </tr>
        </thead>
        <tbody>
          ${dialogs
            .map((dialog) => {
              const dialogId = buildMessageDialogId(dialog);
              const contacts = [dialog.customerPhone, dialog.customerEmail].filter(Boolean).join(" · ");
              const unreadCount = Math.max(0, Number(dialog.unreadCount) || 0);
              return `<tr
                class="${unreadCount > 0 ? "admin-message-row-new " : ""}admin-table-row-clickable"
                tabindex="0"
                data-admin-dialog-row="true"
                data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
                data-admin-dialog-focus=".admin-ghl-sms-card"
                data-admin-message-dialog-key="${escapeHtmlAttribute(dialog.dialogKey || dialog.id || "")}"
                data-admin-message-entry-id="${escapeHtmlAttribute(dialog.entryId || "")}"
                data-admin-message-key="${escapeHtmlAttribute(dialog.messageKey || dialog.latestMessageKey || "")}"
                data-admin-message-refs="${escapeHtmlAttribute(JSON.stringify(dialog.unreadRefs || []))}"
                data-admin-message-unread-count="${escapeHtmlAttribute(String(unreadCount))}"
                data-admin-message-status="${escapeHtmlAttribute(dialog.status || "")}"
                data-admin-message-list-kind="${escapeHtmlAttribute(listKind || "all")}"
                aria-label="${escapeHtmlAttribute(`Открыть диалог ${dialog.customerName || "Клиент"}`)}"
              >
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-message-dialog-title-row">
                      <span class="admin-table-link">${escapeHtml(dialog.customerName)}</span>
                    </span>
                    <span class="admin-table-muted">${escapeHtml(contacts || dialog.requestId || "Контакты не указаны")}</span>
                    <span class="admin-table-muted">${escapeHtml(
                      `${Number(dialog.messageCount) || 0} SMS в переписке`
                    )}</span>
                  </div>
                </td>
                <td><p class="admin-message-preview">${escapeHtml(dialog.message)}</p></td>
                <td>${escapeHtml(dialog.sentAtLabel || "Дата не указана")}</td>
                <td data-admin-message-status-cell="true" data-admin-message-unread-cell="true">${renderMessageUnreadBadge(unreadCount)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  function collectMessageDialogEntries(records = [], entries = []) {
    const entryById = new Map(
      (Array.isArray(entries) ? entries : [])
        .filter((entry) => normalizeString(entry && entry.id, 120))
        .map((entry) => [normalizeString(entry.id, 120), entry])
    );
    const seenEntryIds = new Set();
    return (Array.isArray(records) ? records : [])
      .map((record) => {
        const entryId = normalizeString(record && record.entryId, 120);
        if (!entryId || seenEntryIds.has(entryId)) return null;
        seenEntryIds.add(entryId);
        const entry = entryById.get(entryId);
        if (!entry) return null;
        return {
          record,
          entry,
        };
      })
      .filter(Boolean);
  }

  async function renderMessagesPage(req, config, quoteOpsLedger, adminRuntime = {}) {
    void req;
    void config;
    const entries = quoteOpsLedger
      ? await quoteOpsLedger.listEntries({ limit: PAGE_LEDGER_LIMIT })
      : [];
    const records = messageDomain.collectAdminMessageRecords(entries, { formatAdminDateTime });
    const dialogRecords = messageDomain.collectAdminMessageDialogRecords(records);
    const unreadRecords = records.filter((record) => record.status === "new");
    const unreadDialogs = dialogRecords.filter((record) => Number(record.unreadCount) > 0);
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    const managerOptions = await collectQuoteOpsManagerOptions(
      adminRuntime,
      adminRuntime && adminRuntime.staffStore ? adminRuntime.staffStore : null
    );
    const projectedOrderRecords = await getProjectedOrderRecords(adminRuntime, entries);
    const orderById = new Map(
      projectedOrderRecords
        .filter((order) => normalizeString(order && order.id, 120))
        .map((order) => [normalizeString(order.id, 120), order])
    );
    const dialogEntries = collectMessageDialogEntries(dialogRecords, entries);
    const dialogsMarkup = dialogEntries
      .map(({ record, entry }) => {
        if (record.isOrder) {
          const orderRecord = orderById.get(normalizeString(entry.id, 120));
          if (!orderRecord) return "";
          return renderOrderManagementDialog(orderRecord, ADMIN_MESSAGES_PATH, {
            closeHref: ADMIN_MESSAGES_PATH,
            canEdit: accessContext.canEdit,
            leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
          });
        }
        return renderQuoteOpsDetailDialog(entry, ADMIN_MESSAGES_PATH, managerOptions, {
          req,
          canEdit: accessContext.canEdit,
          closeHref: ADMIN_MESSAGES_PATH,
          leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
        });
      })
      .join("");

    const summaryItems = [
      { label: "Новые", value: unreadRecords.length },
      { label: "Диалогов с новыми", value: unreadDialogs.length },
      { label: "Всего диалогов", value: dialogRecords.length },
    ];

    return renderAdminLayout(
      "Сообщения",
      `${typeof renderQuoteOpsWorkspaceStyle === "function" ? renderQuoteOpsWorkspaceStyle() : ""}
      ${renderMessagesPageStyle()}
      <div class="admin-messages-page">
        <div class="admin-messages-summary-strip">
          ${summaryItems
            .map(
              (item) => `<article class="admin-message-summary-card">
                <p class="admin-message-summary-label">${escapeHtml(item.label)}</p>
                <p class="admin-message-summary-value"${item.label === "Новые" ? ' data-admin-message-summary-unread="true"' : ""}>${escapeHtml(String(item.value))}</p>
              </article>`
            )
            .join("")}
        </div>
        ${renderAdminCard(
          "Диалоги с новыми сообщениями",
          "Одна строка на клиента; бейдж показывает количество непрочитанных SMS в диалоге.",
          renderMessageRows(unreadDialogs, { listKind: "unread" }),
          { eyebrow: "Сообщения", muted: true }
        )}
        ${renderAdminCard(
          "Все диалоги",
          "История SMS с клиентами сгруппирована по диалогам.",
          renderMessageRows(dialogRecords, { listKind: "all" }),
          { eyebrow: "История", muted: true }
        )}
      </div>
      ${dialogsMarkup}`,
      {
        kicker: false,
        subtitle: "Переписки с клиентами из SMS-истории заявок и заказов.",
        sidebar: renderAdminAppSidebar(ADMIN_MESSAGES_PATH, accessContext),
      }
    );
  }

  return {
    renderMessagesPage,
  };
}

module.exports = {
  createMessagesPageRenderer,
};
