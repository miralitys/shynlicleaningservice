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

  function renderMessageRows(records = []) {
    if (!Array.isArray(records) || records.length === 0) {
      return `<div class="admin-empty-state">Сообщений в этом списке пока нет.</div>`;
    }

    return `<div class="admin-table-wrap">
      <table class="admin-table admin-messages-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Статус</th>
            <th>Сообщение</th>
            <th>Когда</th>
          </tr>
        </thead>
        <tbody>
          ${records
            .map((record) => {
              const dialogId = buildMessageDialogId(record);
              const contacts = [record.customerPhone, record.customerEmail].filter(Boolean).join(" · ");
              return `<tr
                class="${record.status === "new" ? "admin-message-row-new " : ""}admin-table-row-clickable"
                tabindex="0"
                data-admin-dialog-row="true"
                data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
                aria-label="${escapeHtmlAttribute(`Открыть карточку ${record.isOrder ? "заказа" : "заявки"} ${record.customerName || "Клиент"}`)}"
              >
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-link">${escapeHtml(record.customerName)}</span>
                    <span class="admin-table-muted">${escapeHtml(contacts || record.requestId || "Контакты не указаны")}</span>
                  </div>
                </td>
                <td>${renderAdminBadge(record.statusLabel, record.statusTone)}</td>
                <td><p class="admin-message-preview">${escapeHtml(record.message)}</p></td>
                <td>${escapeHtml(record.sentAtLabel || "Дата не указана")}</td>
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
    const unreadRecords = records.filter((record) => record.status === "new");
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
    const dialogEntries = collectMessageDialogEntries(records, entries);
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
      { label: "Всего входящих", value: records.length },
      { label: "Клиентов с сообщениями", value: new Set(records.map((record) => record.entryId)).size },
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
                <p class="admin-message-summary-value">${escapeHtml(String(item.value))}</p>
              </article>`
            )
            .join("")}
        </div>
        ${renderAdminCard(
          "Новые сообщения",
          "Непрочитанные сообщения клиентов. Они всегда показываются сверху и имеют статус «Новый».",
          renderMessageRows(unreadRecords),
          { eyebrow: "Сообщения", muted: true }
        )}
        ${renderAdminCard(
          "Все сообщения",
          "История входящих сообщений по заявкам и заказам.",
          renderMessageRows(records),
          { eyebrow: "История", muted: true }
        )}
      </div>
      ${dialogsMarkup}`,
      {
        kicker: false,
        subtitle: "Входящие сообщения клиентов из SMS-истории заявок и заказов.",
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
