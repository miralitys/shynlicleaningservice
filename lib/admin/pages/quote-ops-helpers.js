"use strict";

function createQuoteOpsHelpers(deps = {}) {
  const {
    ADMIN_QUOTE_OPS_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminServiceLabel,
    getEntryAdminLeadData,
    getEntryLeadTasks,
    getLeadStatus,
    getRequestUrl,
    normalizeLeadStatus,
    normalizeString,
    renderAdminBadge,
  } = deps;

  function renderQuoteOpsStatusBadge(status) {
    if (status === "success") return renderAdminBadge("Успешно", "success");
    if (status === "warning") return renderAdminBadge("Проверить", "default");
    return renderAdminBadge("Ошибка", "danger");
  }

  function renderLeadStatusBadge(status) {
    const normalized = normalizeLeadStatus(status, "new");
    if (normalized === "confirmed") return renderAdminBadge("Подтверждено", "success");
    if (normalized === "discussion") return renderAdminBadge("Обсуждение", "outline");
    if (normalized === "no-response") return renderAdminBadge("Без ответа", "default");
    if (normalized === "declined") return renderAdminBadge("Отказ", "danger");
    return renderAdminBadge("New", "muted");
  }

  function getQuoteLeadManager(entry) {
    const adminLead = getEntryAdminLeadData(entry);
    return {
      id: normalizeString(adminLead.managerId, 120),
      name: normalizeString(adminLead.managerName, 200),
      email: normalizeString(adminLead.managerEmail, 250).toLowerCase(),
    };
  }

  function renderQuoteOpsManagerSelect(managerOptions, selectedManagerId) {
    const normalizedSelectedManagerId = normalizeString(selectedManagerId, 120);
    return `<select class="admin-input" name="managerId">
      ${managerOptions.length === 0 ? '<option value="">Не назначен</option>' : ""}
      ${managerOptions.map((manager) => `
        <option value="${escapeHtmlAttribute(manager.id)}"${manager.id === normalizedSelectedManagerId ? " selected" : ""}>
          ${escapeHtml(manager.name)}
        </option>
      `).join("")}
    </select>`;
  }

  function renderQuoteOpsSectionNav(activeSection) {
    const items = [
      { id: "list", label: "Лента", href: `${ADMIN_QUOTE_OPS_PATH}` },
      { id: "funnel", label: "Статус", href: `${ADMIN_QUOTE_OPS_PATH}?section=funnel` },
      { id: "tasks", label: "Таски", href: `${ADMIN_QUOTE_OPS_PATH}?section=tasks` },
    ];

    return `<div class="admin-subnav-strip">
      ${items.map((item) => `
        <a class="admin-subnav-link${activeSection === item.id ? " admin-subnav-link-active" : ""}" href="${item.href}">
          ${escapeHtml(item.label)}
        </a>
      `).join("")}
    </div>`;
  }

  function formatAdminDateTimeInputValue(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    const formatted = date.toLocaleString("sv-SE", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return formatted.replace(" ", "T");
  }

  function buildQuoteOpsTaskRecords(entries = []) {
    return entries.flatMap((entry) => {
      const leadStatus = getLeadStatus(entry);
      const manager = getQuoteLeadManager(entry);
      return getEntryLeadTasks(entry).map((task) => ({
        ...task,
        entry,
        leadStatus,
        manager,
        customerName: normalizeString(entry.customerName || "Клиент", 200),
        requestId: normalizeString(entry.requestId, 120),
        serviceLabel: formatAdminServiceLabel(entry.serviceName || entry.serviceType),
      }));
    });
  }

  function getQuoteOpsStatusMeta(status) {
    if (status === "success") {
      return {
        label: "Успешно",
        tone: "success",
        kicker: "",
        title: "Все заявки",
        copy: "Эти заявки дошли до CRM без ошибок и warning-статусов.",
      };
    }
    if (status === "warning") {
      return {
        label: "Проверить",
        tone: "default",
        kicker: "Нужна проверка",
        title: "Есть warning-статусы",
        copy: "CRM приняла заявку, но часть полей или действий требует ручной проверки.",
      };
    }
    return {
      label: "Ошибка",
      tone: "danger",
      kicker: "Сбой синхронизации",
      title: "Нужна ручная проверка",
      copy: "Эти заявки не дошли до CRM с первого раза и должны быть в приоритете.",
    };
  }

  function formatQuoteOpsEntryCountLabel(count) {
    const normalized = Math.max(0, Number(count) || 0);
    const mod10 = normalized % 10;
    const mod100 = normalized % 100;

    if (mod10 === 1 && mod100 !== 11) return `${normalized} заявка`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${normalized} заявки`;
    return `${normalized} заявок`;
  }

  function renderQuoteOpsOverviewStrip(metrics) {
    const items = [
      {
        label: "Заявки",
        value: metrics.totalEntries,
        copy: "Весь поток заявок с сайта.",
        tone: "accent",
      },
      {
        label: "Успешно",
        value: metrics.successCount,
        copy: "Без ошибок и warning-статусов.",
        tone: "success",
      },
      {
        label: "Внимание",
        value: metrics.attentionCount,
        copy: "Ошибка CRM или warning после отправки.",
        tone: metrics.attentionCount > 0 ? "danger" : "default",
      },
      {
        label: "За 24 часа",
        value: metrics.recentCount,
        copy: "Новая входящая нагрузка за последние сутки.",
        tone: "default",
      },
    ];

    return `<div class="admin-compact-summary-strip admin-quote-ops-summary-strip">
      ${items.map((item) => `
        <article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtmlAttribute(item.tone)}">
          <div class="admin-compact-summary-head">
            <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
            <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
          </div>
          <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
        </article>
      `).join("")}
    </div>`;
  }

  function renderQuoteOpsNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "order-created") {
      return `<div class="admin-alert admin-alert-info">Заявка подтверждена и переведена в заказ.</div>`;
    }
    if (notice === "lead-confirmed") {
      return `<div class="admin-alert admin-alert-info">Заявка подтверждена. Заказ создан автоматически.</div>`;
    }
    if (notice === "lead-stage-saved") {
      return `<div class="admin-alert admin-alert-info">Статус заявки обновлён.</div>`;
    }
    if (notice === "lead-notes-saved") {
      return `<div class="admin-alert admin-alert-info">Заметки сохранены.</div>`;
    }
    if (notice === "lead-deleted") {
      return `<div class="admin-alert admin-alert-info">Заявка удалена.</div>`;
    }
    if (notice === "task-saved") {
      return `<div class="admin-alert admin-alert-info">Задача обновлена.</div>`;
    }
    if (notice === "task-created") {
      return `<div class="admin-alert admin-alert-info">Таск создан.</div>`;
    }
    if (notice === "task-invalid") {
      return `<div class="admin-alert admin-alert-error">Укажите заявку, название таска и дедлайн.</div>`;
    }
    if (notice === "manager-saved") {
      return `<div class="admin-alert admin-alert-info">Менеджер закреплён за заявкой.</div>`;
    }
    if (notice === "discussion-contact-required") {
      return `<div class="admin-alert admin-alert-error">Для этапа «Обсуждение» укажите следующий контакт с клиентом.</div>`;
    }
    if (notice === "lead-save-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось обновить заявку. Попробуйте ещё раз.</div>`;
    }
    if (notice === "lead-missing") {
      return `<div class="admin-alert admin-alert-error">Заявка не найдена.</div>`;
    }
    if (notice === "retry-success") {
      return `<div class="admin-alert admin-alert-info">Повторная отправка выполнена.</div>`;
    }
    if (notice === "retry-failed") {
      return `<div class="admin-alert admin-alert-error">Повторная отправка не удалась. Проверьте заявку ниже.</div>`;
    }
    if (notice === "retry-missing") {
      return `<div class="admin-alert admin-alert-error">Заявка не найдена.</div>`;
    }
    if (notice === "quote-sms-sent") {
      return `<div class="admin-alert admin-alert-info">SMS по заявке отправлена через Go High Level.</div>`;
    }
    if (notice === "quote-sms-empty") {
      return `<div class="admin-alert admin-alert-error">Введите текст сообщения перед отправкой SMS.</div>`;
    }
    if (notice === "quote-sms-unavailable") {
      return `<div class="admin-alert admin-alert-error">Go High Level сейчас не настроен для отправки SMS.</div>`;
    }
    if (notice === "quote-sms-contact-missing" || notice === "quote-sms-failed") {
      const smsError = normalizeString(reqUrl.searchParams.get("smsError"), 240);
      return `<div class="admin-alert admin-alert-error">${escapeHtml(smsError || "Не удалось отправить SMS по заявке.")}</div>`;
    }
    return "";
  }

  function renderQuoteOpsInfoItem(label, value, options = {}) {
    return `<article class="admin-quote-entry-info${options.wide ? " admin-quote-entry-info-wide" : ""}">
      <span class="admin-quote-entry-info-label">${escapeHtml(label)}</span>
      <p class="admin-quote-entry-info-value">${value}</p>
    </article>`;
  }

  function renderQuoteOpsCrmItem(label, value) {
    return `<article class="admin-quote-entry-crm-item">
      <span class="admin-quote-entry-crm-label">${escapeHtml(label)}</span>
      <p class="admin-quote-entry-crm-value">${escapeHtml(value || "—")}</p>
    </article>`;
  }

  function getQuoteOpsDialogId(entryId) {
    const normalized = normalizeString(entryId, 120);
    const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `admin-quote-entry-detail-dialog-${safeSuffix || "record"}`;
  }

  return {
    buildQuoteOpsTaskRecords,
    formatAdminDateTimeInputValue,
    formatQuoteOpsEntryCountLabel,
    getQuoteLeadManager,
    getQuoteOpsDialogId,
    getQuoteOpsStatusMeta,
    renderLeadStatusBadge,
    renderQuoteOpsCrmItem,
    renderQuoteOpsInfoItem,
    renderQuoteOpsManagerSelect,
    renderQuoteOpsNotice,
    renderQuoteOpsOverviewStrip,
    renderQuoteOpsSectionNav,
    renderQuoteOpsStatusBadge,
  };
}

module.exports = {
  createQuoteOpsHelpers,
};
