"use strict";

function createStaffViewUiHelpers(deps = {}) {
  const {
    GOOGLE_PLACES_API_KEY,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
    ADMIN_STAFF_GOOGLE_CONNECT_PATH,
    ADMIN_STAFF_PATH,
    ADMIN_STAFF_W9_DOWNLOAD_PATH,
    ASSIGNMENT_STATUS_VALUES,
    STAFF_COMPENSATION_OPTIONS,
    STAFF_TEAM_CALENDAR_DAYS,
    STAFF_TEAM_CALENDAR_FUTURE_DAYS,
    STAFF_TEAM_CALENDAR_PAST_DAYS,
    STAFF_TEAM_CALENDAR_TIME_ZONE,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatAdminClockTime,
    formatCurrencyAmount,
    formatAdminDateTime,
    formatAdminPhoneNumber,
    formatAdminServiceLabel,
    formatAssignmentStatusLabel,
    formatOrderCountLabel,
    formatStaffCountLabel,
    formatStaffStatusLabel,
    formatW9FederalTaxClassificationLabel,
    formatW9TinTypeLabel,
    formatWorkspaceRoleLabel,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getEntrySmsHistoryEntries,
    getStaffSmsHistoryEntries,
    getRequestUrl,
    inferWorkspaceRoleValue,
    buildAdminRedirectPath,
    isAdminLinkedUser,
    normalizeString,
    renderAdminSelectOptions,
    renderAdminBadge,
    renderAdminClientInfoGrid,
    renderAdminDeleteIconButton,
    renderAdminDialogCloseButton,
    renderAdminGhlSmsComposer,
    renderAdminPhoneInput,
    renderAdminPickerField,
    renderAdminToggleIconButton,
    renderAssignmentStatusBadge,
    renderQuoteOpsStatusBadge,
    renderStaffStatusBadge,
    STAFF_STATUS_VALUES,
    USER_ROLE_VALUES,
  } = deps;

function normalizeCompensationFieldValue(value) {
  const normalized = normalizeString(value, 32).replace(/,/g, ".");
  if (!normalized) return "";
  const cleaned = normalized.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";
  const [wholePart, ...fractionParts] = cleaned.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionParts.join("").slice(0, 2);
  return fraction ? `${whole}.${fraction}` : whole;
}
function formatStaffCompensationTypeLabel(value) {
  return normalizeString(value, 32).toLowerCase() === "percent" ? "Процент" : "Фиксированная оплата";
}
function formatStaffCompensationLabel(record = {}) {
  const value = normalizeCompensationFieldValue(
    record && (record.compensationValue || record.salaryValue || record.payRateValue)
  );
  if (!value) return "Не указана";
  if (normalizeString(record && record.compensationType, 32).toLowerCase() === "percent") {
    return `${value}%`;
  }
  return formatCurrencyAmount(value);
}
function renderStaffCompensationFields(options = {}) {
  const value = normalizeCompensationFieldValue(options.value);
  const type = normalizeString(options.type, 32).toLowerCase() === "percent" ? "percent" : "fixed";

  return `<label class="admin-label">
      Оплата
      <input
        class="admin-input"
        type="text"
        name="${escapeHtmlAttribute(options.valueName || "compensationValue")}"
        value="${escapeHtmlText(value)}"
        inputmode="decimal"
        placeholder="${escapeHtmlAttribute(options.placeholder || "30")}"
      >
    </label>
    <label class="admin-label">
      Тип оплаты
      <select class="admin-input" name="${escapeHtmlAttribute(options.typeName || "compensationType")}">
        ${renderAdminSelectOptions(STAFF_COMPENSATION_OPTIONS, type)}
      </select>
    </label>`;
}
function renderStaffNotice(req) {
  const reqUrl = getRequestUrl(req);
  const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
  const conflictedStaff = normalizeString(reqUrl.searchParams.get("staff"), 240);
  if (notice === "staff-created") {
    return `<div class="admin-alert admin-alert-info">Сотрудник добавлен в команду.</div>`;
  }
  if (notice === "staff-updated") {
    return `<div class="admin-alert admin-alert-info">Карточка сотрудника обновлена.</div>`;
  }
  if (notice === "staff-deleted") {
    return `<div class="admin-alert admin-alert-info">Сотрудник удалён, его назначения очищены.</div>`;
  }
  if (notice === "assignment-saved") {
    return `<div class="admin-alert admin-alert-info">Назначение и график сохранены.</div>`;
  }
  if (notice === "assignment-saved-calendar-error") {
    return `<div class="admin-alert admin-alert-error">Назначение сохранено, но Google Calendar не обновился. Проверьте подключение у сотрудника.</div>`;
  }
  if (notice === "assignment-cleared") {
    return `<div class="admin-alert admin-alert-info">Назначение очищено.</div>`;
  }
  if (notice === "assignment-conflict") {
    return `<div class="admin-alert admin-alert-error">Назначение не сохранено: ${escapeHtml(conflictedStaff || "сотрудник")} отмечен как unavailable в Google Calendar.</div>`;
  }
  if (notice === "calendar-connected") {
    return `<div class="admin-alert admin-alert-info">Google Calendar подключён. Подтверждённые назначения теперь будут уходить в календарь сотрудника.</div>`;
  }
  if (notice === "calendar-disconnected") {
    return `<div class="admin-alert admin-alert-info">Google Calendar отключён у сотрудника.</div>`;
  }
  if (notice === "calendar-connect-denied") {
    return `<div class="admin-alert admin-alert-error">Подключение Google Calendar отменено на стороне Google.</div>`;
  }
  if (notice === "calendar-unavailable") {
    return `<div class="admin-alert admin-alert-error">Google Calendar ещё не настроен на сервере. Добавьте OAuth credentials в Render.</div>`;
  }
  if (notice === "calendar-connect-failed") {
    return `<div class="admin-alert admin-alert-error">Не удалось подключить Google Calendar. Попробуйте ещё раз.</div>`;
  }
  if (notice === "w9-reminder-sent") {
    return `<div class="admin-alert admin-alert-info">Напоминание о Contract и W-9 отправлено сотруднику повторно.</div>`;
  }
  if (notice === "w9-reminder-unavailable") {
    return `<div class="admin-alert admin-alert-error">Автоматическая отправка email сейчас не настроена. Подключите почту в разделе «Настройки → Пользователи».</div>`;
  }
  if (notice === "w9-reminder-admin") {
    return `<div class="admin-alert admin-alert-info">Для админов onboarding-документы не отправляются: они не участвуют в разделе сотрудников.</div>`;
  }
  if (notice === "w9-reminder-error") {
    return `<div class="admin-alert admin-alert-error">Не удалось отправить напоминание о Contract и W-9. Проверьте почтовые настройки и попробуйте ещё раз.</div>`;
  }
  if (notice === "staff-failed") {
    return `<div class="admin-alert admin-alert-error">Не удалось сохранить изменения. Проверьте форму и попробуйте снова.</div>`;
  }
  return "";
}
function renderStaffOverviewStrip(planning) {
  const items = [
    {
      label: "Команда",
      value: planning.staff.length,
      copy: "Всего сотрудников в базе команды.",
      tone: "accent",
    },
    {
      label: "Активны",
      value: planning.activeStaffCount,
      copy: "Можно ставить в график прямо сейчас.",
      tone: "success",
    },
    {
      label: "Назначены",
      value: planning.assignedScheduledCount,
      copy: "Заказы уже закрыты командой.",
      tone: "default",
    },
    {
      label: "Пробелы",
      value: planning.unassignedScheduledCount,
      copy: "Смены ещё ждут назначения.",
      tone: planning.unassignedScheduledCount > 0 ? "danger" : "default",
    },
  ];

  return `<div class="admin-compact-summary-strip">
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
function getStaffDialogId(staffId) {
  const normalized = normalizeString(staffId, 120);
  const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `admin-staff-edit-dialog-${safeSuffix || "record"}`;
}
function renderStaffAddressField(options = {}) {
  const inputId = normalizeString(options.id, 160);
  const fieldName = normalizeString(options.name, 80) || "address";
  const placeholder =
    normalizeString(options.placeholder, 200) || "215 North Elm Street, Naperville, IL";
  const value = normalizeString(options.value, 500);
  const suggestionsId = inputId ? `${inputId}-suggestions` : "";
  const requiredAttr = options.required ? " required" : "";

  return `<label class="admin-label">
    Адрес
    <div class="admin-address-field" data-admin-address-field>
      <input
        class="admin-input"
        type="text"
        name="${escapeHtmlAttribute(fieldName)}"
        value="${escapeHtmlAttribute(value)}"
        placeholder="${escapeHtmlAttribute(placeholder)}"
        autocomplete="off"
        data-admin-address-autocomplete="true"
        data-admin-address-country="us"
        aria-autocomplete="list"
        aria-expanded="false"${inputId ? ` id="${escapeHtmlAttribute(inputId)}"` : ""}${suggestionsId ? ` aria-controls="${escapeHtmlAttribute(suggestionsId)}"` : ""}${requiredAttr}
      >
      <div class="admin-address-suggestions" data-admin-address-suggestions hidden role="listbox"${suggestionsId ? ` id="${escapeHtmlAttribute(suggestionsId)}"` : ""}></div>
    </div>
  </label>`;
}
function getStaffNextOrderName(staffSummary) {
  if (!staffSummary || !staffSummary.nextOrder) return "Ожидает назначения";
  return (
    staffSummary.nextOrder.entry.customerName ||
    staffSummary.nextOrder.entry.fullAddress ||
    staffSummary.nextOrder.entry.requestId ||
    "Заказ"
  );
}
function renderStaffCalendarPanel(staffSummary) {
  const calendarMeta =
    staffSummary && staffSummary.calendarMeta && typeof staffSummary.calendarMeta === "object"
      ? staffSummary.calendarMeta
      : { configured: false, connected: false };

  if (!calendarMeta.configured) {
    return `<section class="admin-client-section admin-client-section-side admin-staff-calendar-section">
      <div class="admin-subsection-head">
        <h3 class="admin-subsection-title">Google Calendar</h3>
        <span class="admin-action-hint">Не настроен</span>
      </div>
      <div class="admin-empty-state">Чтобы подключать календарь клинера и учитывать day off, добавьте Google OAuth credentials в Render.</div>
    </section>`;
  }

  const connectHref = `${ADMIN_STAFF_GOOGLE_CONNECT_PATH}?staffId=${encodeURIComponent(staffSummary.id)}`;
  const infoItems = calendarMeta.connected
    ? [
        { label: "Аккаунт", value: calendarMeta.accountEmail || "Подключён" },
        { label: "Рабочий календарь", value: calendarMeta.workCalendarName || "SHYNLI Work" },
        { label: "Day off", value: calendarMeta.unavailableCalendarName || "SHYNLI Unavailable" },
        {
          label: "Следующий unavailable",
          value: calendarMeta.nextUnavailableLabel || "Пока нет блоков",
          wide: true,
        },
        {
          label: "Подсказка",
          value: "Клинер отмечает выходные и недоступность в календаре SHYNLI Unavailable. Подтверждённые заказы прилетают в SHYNLI Work.",
          wide: true,
        },
      ]
    : [
        {
          label: "Статус",
          value: "Google Calendar пока не подключён",
          wide: true,
        },
        {
          label: "Что произойдёт",
          value: "После подключения подтверждённые уборки будут попадать в календарь сотрудника, а day off из SHYNLI Unavailable будет блокировать назначения.",
          wide: true,
        },
      ];

  return `<section class="admin-client-section admin-client-section-side admin-staff-calendar-section">
    <div class="admin-subsection-head">
      <h3 class="admin-subsection-title">Google Calendar</h3>
      <span class="admin-action-hint">${escapeHtml(calendarMeta.connected ? "Подключён" : "Ожидает подключения")}</span>
    </div>
    ${calendarMeta.syncError ? `<div class="admin-alert admin-alert-error">${escapeHtml(calendarMeta.syncError)}</div>` : ""}
    ${renderAdminClientInfoGrid(infoItems, { compact: true })}
    <div class="admin-inline-actions admin-staff-calendar-actions">
      ${calendarMeta.connected
        ? `<a class="admin-button admin-button-secondary" href="${escapeHtmlAttribute(connectHref)}">Переподключить</a>
            <form method="post" action="${ADMIN_STAFF_PATH}">
              <input type="hidden" name="action" value="disconnect-google-calendar">
              <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
              <button class="admin-button admin-button-secondary" type="submit">Отключить</button>
            </form>`
        : `<a class="admin-button" href="${escapeHtmlAttribute(connectHref)}">Подключить Google Calendar</a>`}
    </div>
  </section>`;
}
function renderStaffEditDialog(staffSummary, options = {}) {
  const canDelete = options.canDelete !== false;
  const linkedUser = staffSummary && staffSummary.linkedUser ? staffSummary.linkedUser : null;
  const accessRoleValue =
    linkedUser && linkedUser.role
      ? linkedUser.role
      : inferWorkspaceRoleValue(staffSummary.role) || "cleaner";
  const roleLabel = formatWorkspaceRoleLabel(accessRoleValue);
  const nextShiftLabel = staffSummary.nextOrder ? staffSummary.nextOrder.scheduleLabel : "Пока без смены";
  const formattedPhone = formatAdminPhoneNumber(staffSummary.phone) || "";
  const contactLabel = [formattedPhone, staffSummary.email].filter(Boolean).join(" • ") || "Контакты не указаны";
  const nextOrderName = getStaffNextOrderName(staffSummary);
  const compensationLabel = formatStaffCompensationLabel(staffSummary);
  const calendarMeta =
    staffSummary && staffSummary.calendarMeta && typeof staffSummary.calendarMeta === "object"
      ? staffSummary.calendarMeta
      : { configured: false, connected: false };
  const detailReturnTo = (() => {
    try {
      const reqUrl = getRequestUrl(options.req);
      return `${reqUrl.pathname}${reqUrl.search}`;
    } catch {
      return ADMIN_STAFF_PATH;
    }
  })();
  const dialogId = getStaffDialogId(staffSummary.id);
  const editFormId = `${dialogId}-form`;
  const editPanelId = `${dialogId}-edit-panel`;
  const titleLabel = staffSummary.name || "Сотрудник";
  const summaryBadges = [
    renderStaffStatusBadge(staffSummary.status),
    renderAdminBadge(roleLabel, accessRoleValue === "admin" ? "success" : accessRoleValue === "manager" ? "outline" : "muted"),
    renderAdminBadge(
      staffSummary.nextOrder ? "Есть ближайшая смена" : "Свободен",
      staffSummary.nextOrder ? "default" : "muted"
    ),
    calendarMeta.configured
      ? renderAdminBadge(
          calendarMeta.connected ? "Google Calendar" : "Calendar не подключён",
          calendarMeta.connected ? "success" : "muted"
        )
      : "",
  ].join("");
  const heroCopy = staffSummary.nextOrder
    ? `Ближайший выезд запланирован на ${nextShiftLabel}. Следующий заказ: ${nextOrderName}.`
    : "Сотрудник пока свободен: карточка готова для контактов, адреса и будущих назначений.";
  const workloadItems = [
    { label: "Следующая смена", value: nextShiftLabel },
    { label: "Следующий заказ", value: nextOrderName },
    { label: "В графике", value: formatOrderCountLabel(staffSummary.scheduledCount) },
    { label: "На 7 дней", value: formatOrderCountLabel(staffSummary.upcomingWeekCount) },
    { label: "Заметки", value: staffSummary.notes || "Пока без внутренних заметок", wide: true },
  ];
  const contractRecord = staffSummary && staffSummary.contract ? staffSummary.contract : null;
  const w9Record = staffSummary && staffSummary.w9 ? staffSummary.w9 : null;
  const contractDownloadPath =
    contractRecord && contractRecord.document && contractRecord.document.relativePath
      ? `${ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH}?staffId=${encodeURIComponent(staffSummary.id)}`
      : "";
  const w9DownloadPath =
    w9Record && w9Record.document && w9Record.document.relativePath
      ? `${ADMIN_STAFF_W9_DOWNLOAD_PATH}?staffId=${encodeURIComponent(staffSummary.id)}`
      : "";
  const w9ReminderAvailable = Boolean(
    linkedUser &&
      linkedUser.id &&
      linkedUser.email &&
      !isAdminLinkedUser(linkedUser)
  );
  const documentsInfoItems = [
    {
      label: "Contract",
      value: contractRecord ? "PDF прикреплён" : "Ещё не подписан",
    },
    {
      label: "W-9",
      value: w9Record ? "PDF прикреплён" : "Ещё не заполнен",
    },
    {
      label: "Contract подписан",
      value: contractRecord && contractRecord.generatedAt
        ? formatAdminDateTime(contractRecord.generatedAt)
        : "Не указано",
    },
    {
      label: "W-9 сформирован",
      value: w9Record && w9Record.generatedAt
        ? formatAdminDateTime(w9Record.generatedAt)
        : "Не указано",
    },
    {
      label: "Tax classification",
      value: w9Record
        ? formatW9FederalTaxClassificationLabel(w9Record.federalTaxClassification)
        : "Не указано",
    },
    {
      label: "TIN",
      value: w9Record
        ? `${formatW9TinTypeLabel(w9Record.tinType)} ${w9Record.maskedTin || ""}`.trim()
        : "Не указано",
    },
    {
      label: "Адрес",
      value:
        (w9Record &&
          [w9Record.addressLine1, w9Record.cityStateZip].filter(Boolean).join(", ")) ||
        (contractRecord &&
          [
            contractRecord.contractorAddressLine1,
            contractRecord.contractorCityStateZip,
          ]
            .filter(Boolean)
            .join(", ")) ||
        "Не указан",
      wide: true,
    },
  ];
  const documentsComplete = Boolean(contractRecord && w9Record);
  const documentsPanelMarkup = `${renderAdminClientInfoGrid(documentsInfoItems)}
    <div class="admin-inline-actions admin-w9-preview-actions">
      ${contractDownloadPath
        ? `<a class="admin-button admin-button-secondary" href="${escapeHtmlAttribute(contractDownloadPath)}" download>Скачать Contract</a>`
        : ""}
      ${w9DownloadPath
        ? `<a class="admin-button admin-button-secondary" href="${escapeHtmlAttribute(w9DownloadPath)}" download>Скачать W-9</a>`
        : ""}
      ${!documentsComplete && w9ReminderAvailable
        ? `<form class="admin-inline-actions admin-w9-empty-actions" method="post" action="${ADMIN_STAFF_PATH}">
            <input type="hidden" name="action" value="resend-staff-w9-reminder">
            <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
            <input type="hidden" name="userId" value="${escapeHtmlAttribute(linkedUser.id)}">
            <input type="hidden" name="staffName" value="${escapeHtmlAttribute(staffSummary.name || linkedUser.email)}">
            <button class="admin-button admin-button-secondary" type="submit">Отправить повторно</button>
          </form>`
        : ""}
    </div>
    ${!documentsComplete
      ? `<div class="admin-alert admin-alert-muted" style="margin-top:16px;">Сотрудник ещё не завершил onboarding-документы. Напоминание отправит ссылку на Contract + W-9 в личном кабинете.</div>`
      : ""}`;

  return `<dialog class="admin-dialog" id="${escapeHtmlAttribute(dialogId)}" aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
    <div class="admin-dialog-panel admin-staff-dialog-panel">
      <div class="admin-dialog-head admin-dialog-hero">
        <div class="admin-dialog-hero-main">
          <div class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(staffSummary.name))}">${escapeHtml(getAdminClientAvatarInitials(staffSummary.name))}</div>
          <div class="admin-dialog-copy-block admin-dialog-hero-copy">
            <p class="admin-card-eyebrow">Команда</p>
            <div class="admin-dialog-hero-title-block">
              <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(titleLabel)} <span class="admin-staff-dialog-title-role">(${escapeHtml(roleLabel)})</span></h2>
              <div class="admin-dialog-hero-meta-stack">
                <p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(contactLabel)}</p>
                ${staffSummary.address ? `<p class="admin-dialog-hero-detail admin-staff-dialog-address">${escapeHtml(staffSummary.address)}</p>` : ""}
              </div>
            </div>
          </div>
        </div>
        <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
          ${renderAdminToggleIconButton("Редактировать сотрудника", editPanelId, {
            openLabel: "Скрыть",
            closedLabel: "Редактировать сотрудника",
          })}
          ${renderAdminDialogCloseButton(dialogId)}
        </div>
      </div>
      <div class="admin-client-dialog-body admin-staff-dialog-body">
        <section class="admin-client-summary-panel admin-staff-summary-panel">
          <div class="admin-client-summary-head">
            <div class="admin-client-summary-copy-block">
              <div class="admin-badge-row admin-client-badge-row">
                ${summaryBadges}
              </div>
              <p class="admin-client-summary-copy">${escapeHtml(heroCopy)}</p>
            </div>
          </div>
          <div class="admin-client-metric-grid admin-client-metric-grid-dialog">
            <article class="admin-client-metric-card">
              <span class="admin-client-metric-label">Роль</span>
              <p class="admin-client-metric-value">${escapeHtml(roleLabel)}</p>
            </article>
            <article class="admin-client-metric-card">
              <span class="admin-client-metric-label">Оплата</span>
              <p class="admin-client-metric-value">${escapeHtml(compensationLabel)}</p>
            </article>
            <article class="admin-client-metric-card">
              <span class="admin-client-metric-label">В графике</span>
              <p class="admin-client-metric-value">${escapeHtml(formatOrderCountLabel(staffSummary.scheduledCount))}</p>
            </article>
            <article class="admin-client-metric-card">
              <span class="admin-client-metric-label">На 7 дней</span>
              <p class="admin-client-metric-value">${escapeHtml(formatOrderCountLabel(staffSummary.upcomingWeekCount))}</p>
            </article>
            <article class="admin-client-metric-card">
              <span class="admin-client-metric-label">Следующая смена</span>
              <p class="admin-client-metric-value">${escapeHtml(nextShiftLabel)}</p>
            </article>
          </div>
        </section>
        <section class="admin-client-section admin-client-section-side admin-staff-workload-section">
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Рабочая сводка</h3>
            <span class="admin-action-hint">Смены и заметки</span>
          </div>
          ${renderAdminClientInfoGrid(workloadItems)}
        </section>
        <section class="admin-client-section admin-client-section-side admin-staff-workload-section">
          <div class="admin-subsection-head">
            <h3 class="admin-subsection-title">Документы сотрудника</h3>
            <span class="admin-action-hint">Contract и W-9</span>
          </div>
          ${documentsPanelMarkup}
        </section>
        ${renderAdminGhlSmsComposer({
          req: options.req,
          actionPath: ADMIN_STAFF_PATH,
          targetType: "staff",
          targetRef: staffSummary.id,
          targetFieldName: "staffId",
          targetFieldValue: staffSummary.id,
          returnTo: detailReturnTo,
          phone: staffSummary.phone,
          contactId: "",
          historyEntries: getStaffSmsHistoryEntries(staffSummary),
          leadConnectorConfigured: Boolean(options.leadConnectorConfigured),
          canEdit: options.canEdit,
          noticePrefix: "staff",
          title: "SMS сотруднику",
          description: "Быстрая отправка сообщения сотруднику через Go High Level.",
          messagePlaceholder: "Напишите сотруднику короткое SMS-сообщение...",
        })}
        ${renderStaffCalendarPanel(staffSummary)}
        <section class="admin-client-section admin-staff-form-section" id="${escapeHtmlAttribute(editPanelId)}" data-admin-toggle-panel hidden>
          <form
            class="admin-form-grid"
            id="${escapeHtmlAttribute(editFormId)}"
            method="post"
            action="${ADMIN_STAFF_PATH}"
            data-admin-async-save="true"
            data-admin-async-success="Карточка сотрудника сохранена."
            data-admin-async-error="Не удалось сохранить карточку сотрудника."
          >
            <input type="hidden" name="action" value="update-staff">
            <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
            ${linkedUser ? `<input type="hidden" name="userId" value="${escapeHtmlAttribute(linkedUser.id)}">` : ""}
            <div class="admin-form-grid admin-form-grid-two">
              <label class="admin-label">
                Имя
                <input class="admin-input" type="text" name="name" value="${escapeHtmlText(staffSummary.name)}" required>
              </label>
              <label class="admin-label">
                Роль
                <select class="admin-input" name="role">
                  ${USER_ROLE_VALUES.map((role) => `<option value="${escapeHtmlAttribute(role)}"${accessRoleValue === role ? " selected" : ""}>${escapeHtml(formatWorkspaceRoleLabel(role))}</option>`).join("")}
                </select>
                <small class="admin-field-hint">Эта роль используется и в карточке сотрудника, и для прав доступа.</small>
              </label>
              ${renderAdminPhoneInput("phone", staffSummary.phone)}
              <label class="admin-label">
                Email
                <input class="admin-input" type="email" name="email" value="${escapeHtmlText(staffSummary.email)}" placeholder="team@shynli.com">
              </label>
              ${renderStaffCompensationFields({
                value: staffSummary.compensationValue,
                type: staffSummary.compensationType,
              })}
            </div>
            ${renderStaffAddressField({
              id: `${dialogId}-address`,
              value: staffSummary.address,
            })}
            <label class="admin-label">
              Статус
              <select class="admin-input" name="status">
                ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${staffSummary.status === status ? " selected" : ""}>${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
              </select>
            </label>
            <label class="admin-label">
              Заметки
              <textarea class="admin-input" name="notes" placeholder="Районы, предпочтительные смены, ключи, транспорт">${escapeHtml(staffSummary.notes)}</textarea>
            </label>
            <p class="admin-field-note" data-admin-async-feedback hidden></p>
          </form>
          <div class="admin-dialog-actions-row">
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit" form="${escapeHtmlAttribute(editFormId)}">Сохранить карточку</button>
            </div>
            ${canDelete
              ? `<form class="admin-inline-actions admin-inline-actions-end" method="post" action="${ADMIN_STAFF_PATH}">
                  <input type="hidden" name="action" value="delete-staff">
                  <input type="hidden" name="staffId" value="${escapeHtmlAttribute(staffSummary.id)}">
                  ${renderAdminDeleteIconButton("Удалить сотрудника")}
                </form>`
              : ""}
          </div>
        </section>
      </div>
    </div>
  </dialog>`;
}
function renderStaffTableRow(staffSummary) {
  const contactBits = [];
  const formattedPhone = formatAdminPhoneNumber(staffSummary.phone);
  if (formattedPhone) {
    contactBits.push(`<span class="admin-table-strong">${escapeHtml(formattedPhone)}</span>`);
  }
  if (staffSummary.email) {
    contactBits.push(`<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.email)}</span>`);
  }
  if (staffSummary.address) {
    contactBits.push(`<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.address)}</span>`);
  }
  const contactCell = contactBits.length
    ? `<div class="admin-table-cell-stack">${contactBits.join("")}</div>`
    : `<span class="admin-table-muted">Не указаны</span>`;
  const nextOrderName = getStaffNextOrderName(staffSummary);
  const dialogId = getStaffDialogId(staffSummary.id);

  return `<tr
    class="admin-table-row-clickable"
    tabindex="0"
    data-admin-dialog-row="true"
    data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
    aria-label="${escapeHtmlAttribute(`Открыть карточку сотрудника ${staffSummary.name || "Сотрудник"}`)}"
  >
    <td>
      <div class="admin-client-table-cell">
        <div class="admin-client-avatar ${escapeHtmlAttribute(getAdminClientAvatarToneClass(staffSummary.name))}">${escapeHtml(getAdminClientAvatarInitials(staffSummary.name))}</div>
        <div class="admin-table-stack">
          <span class="admin-table-link">${escapeHtml(staffSummary.name || "Сотрудник")}</span>
          <span class="admin-table-muted">${escapeHtml(staffSummary.role || "Роль не указана")}</span>
          ${staffSummary.notes ? `<span class="admin-table-muted admin-line-clamp-two">${escapeHtml(staffSummary.notes)}</span>` : ""}
        </div>
      </div>
    </td>
    <td>${contactCell}</td>
    <td>
      <div class="admin-table-cell-stack">
        ${renderStaffStatusBadge(staffSummary.status)}
      </div>
    </td>
    <td>
      <div class="admin-table-cell-stack">
        <span class="admin-table-strong">${escapeHtml(formatOrderCountLabel(staffSummary.scheduledCount))}</span>
        <span class="admin-table-muted">${escapeHtml(formatOrderCountLabel(staffSummary.upcomingWeekCount))} на 7 дней</span>
      </div>
    </td>
    <td>
      <div class="admin-table-cell-stack">
        <span class="admin-table-strong">${escapeHtml(staffSummary.nextOrder ? staffSummary.nextOrder.scheduleLabel : "Пока без смены")}</span>
        <span class="admin-table-muted admin-line-clamp-two">${escapeHtml(nextOrderName)}</span>
      </div>
    </td>
  </tr>`;
}
function renderStaffSummaryTable(staffSummaries, options = {}) {
  if (!staffSummaries.length) {
    return `<div class="admin-empty-state">Пока сотрудников нет. Создайте первого сотрудника в разделе "Настройки → Пользователи", и он сразу появится в команде и назначениях.</div>`;
  }

  return `<div class="admin-table-wrap admin-staff-table-wrap">
    <table class="admin-table admin-staff-table">
      <thead>
        <tr>
          <th>Сотрудник</th>
          <th>Контакты</th>
          <th>Статус</th>
          <th>Нагрузка</th>
          <th>Следующая смена</th>
        </tr>
      </thead>
      <tbody>
        ${staffSummaries.map((record) => renderStaffTableRow(record)).join("")}
      </tbody>
    </table>
    ${staffSummaries.map((record) => renderStaffEditDialog(record, options)).join("")}
  </div>`;
}
function getStaffSection(req) {
  const reqUrl = getRequestUrl(req);
  const section = normalizeString(reqUrl.searchParams.get("section"), 32).toLowerCase();
  if (section === "calendar" || section === "assignments") return section;
  if (section === "team") return "team";

  const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
  if (notice.startsWith("assignment-")) return "assignments";
  return "team";
}
function buildStaffSectionPath(section, extra = {}) {
  const normalizedSection =
    section === "calendar" ? "calendar" : section === "assignments" ? "assignments" : "team";
  const params = {
    section: normalizedSection,
    ...extra,
  };
  if (normalizedSection !== "calendar") {
    delete params.calendarStart;
  }
  return buildAdminRedirectPath(ADMIN_STAFF_PATH, params);
}
function renderStaffSectionNav(activeSection, stats = {}, calendarStartDate) {
  const items = [
    {
      key: "team",
      label: "Команда",
      href: buildStaffSectionPath("team"),
    },
    {
      key: "calendar",
      label: "Календарь команды",
      href: buildStaffSectionPath("calendar", { calendarStart: calendarStartDate }),
    },
    {
      key: "assignments",
      label: "Назначения и график",
      href: buildStaffSectionPath("assignments"),
    },
  ];

  return `<div class="admin-subnav-strip">
    ${items
      .map(
        (item) => `<a class="admin-subnav-link${item.key === activeSection ? " admin-subnav-link-active" : ""}" href="${item.href}">${escapeHtml(item.label)}</a>`
      )
      .join("")}
  </div>`;
}

  return {
    normalizeCompensationFieldValue,
    formatStaffCompensationTypeLabel,
    formatStaffCompensationLabel,
    renderStaffCompensationFields,
    renderStaffNotice,
    renderStaffOverviewStrip,
    getStaffDialogId,
    renderStaffAddressField,
    getStaffNextOrderName,
    renderStaffCalendarPanel,
    renderStaffEditDialog,
    renderStaffTableRow,
    renderStaffSummaryTable,
    getStaffSection,
    buildStaffSectionPath,
    renderStaffSectionNav,
  };
}

module.exports = {
  createStaffViewUiHelpers,
};
