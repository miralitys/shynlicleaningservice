"use strict";

function defaultNormalizeString(value, maxLength = 0) {
  const stringValue = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmedValue = stringValue.trim();
  if (!maxLength || trimmedValue.length <= maxLength) return trimmedValue;
  return trimmedValue.slice(0, maxLength);
}

function createClientDetailUiHelpers(deps = {}) {
  const {
    ADMIN_CLIENTS_PATH,
    ADMIN_ORDERS_PATH,
    CLIENT_ADDRESS_PET_OPTIONS,
    CLIENT_ADDRESS_TYPE_OPTIONS,
    ORDER_QUOTE_QUANTITY_LABELS,
    buildAdminRedirectPath,
    buildFormattedScheduleLabel,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatAdminClientAddressPetsLabel,
    formatAdminClientAddressPropertyTypeLabel,
    formatAdminDateTime,
    formatAdminOrderDateInputValue,
    formatAdminOrderPriceInputValue,
    formatAdminOrderTimeInputValue,
    formatAdminPhoneNumber,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    formatClientAddressCountLabel,
    formatClientRequestCountLabel,
    formatOrderAssignedStaffSummary,
    formatOrderQuoteBoolean,
    formatOrderQuoteFrequency,
    formatOrderQuoteMultiline,
    formatOrderQuotePetsLabel,
    formatOrderQuoteRequestedSlot,
    formatOrderQuoteServiceType,
    formatOrderQuoteSquareFootage,
    formatOrderQuoteText,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getClientSmsHistoryEntries,
    getEntryOrderState,
    getEntrySmsHistoryEntries,
    getOrderAssignedLabel,
    getOrderCompletionData,
    getOrderDialogId,
    getOrderQuoteData,
    getOrderQuoteQuantityValue,
    getOrderQuoteSelectedServices,
    isOrderCreatedEntry,
    normalizeOrderStatus,
    normalizeString: normalizeStringFromDeps,
    parseOrderAssignedStaffNames,
    renderAdminBadge,
    renderAdminClientAddressRemoveButton,
    renderAdminClientInfoGrid,
    renderAdminClientStatusBadge,
    renderAdminDeleteIconButton,
    renderAdminDialogCloseButton,
    renderAdminEditIcon,
    renderAdminGhlSmsComposer,
    renderAdminPhoneInput,
    renderAdminPickerField,
    renderAdminSelectOptions,
    renderAdminToggleIconButton,
    renderOrderMediaGallery,
    renderOrderPaymentStatusBadge,
    renderOrderPolicyAcceptancePanel,
    renderOrderQuoteField,
    renderOrderResponsibleSelect,
    renderOrderStatusBadge,
  } = deps;
  const normalizeString =
    typeof normalizeStringFromDeps === "function" ? normalizeStringFromDeps : defaultNormalizeString;

function getAdminClientHistoryTeamLabel(entry, planningItem = null) {
  if (planningItem && Array.isArray(planningItem.assignedStaff) && planningItem.assignedStaff.length > 0) {
    return planningItem.assignedStaff
      .map((staffRecord) => normalizeString(staffRecord && staffRecord.name, 120))
      .filter(Boolean)
      .join(", ");
  }

  const adminOrder = getEntryOrderState(entry);
  const assignedFallback = normalizeString(
    adminOrder && (adminOrder.assignedStaff || adminOrder.assignee),
    160
  );

  if (assignedFallback) return assignedFallback;
  if (
    planningItem &&
    planningItem.assignment &&
    Array.isArray(planningItem.missingStaffIds) &&
    planningItem.missingStaffIds.length > 0
  ) {
    return "Команда назначена";
  }
  return "Команда не назначена";
}

function renderAdminClientHistoryItem(entry, planningItem = null) {
  const scheduledLabel = buildFormattedScheduleLabel(entry.selectedDate, entry.selectedTime) || "Дата не указана";
  const teamLabel = getAdminClientHistoryTeamLabel(entry, planningItem);
  return `<article class="admin-history-item admin-client-history-item">
    <div class="admin-client-history-header">
      <div class="admin-client-history-copy-block">
        <h3 class="admin-history-title">${escapeHtml(formatAdminServiceLabel(entry.serviceName))}</h3>
        <p class="admin-history-copy">${escapeHtml(formatAdminDateTime(entry.createdAt))}</p>
      </div>
      <div class="admin-client-history-side">
        <span class="admin-client-history-amount">${escapeHtml(formatCurrencyAmount(entry.totalPrice))}</span>
        ${renderAdminClientStatusBadge(entry.status)}
      </div>
    </div>
    <div class="admin-client-history-meta-row">
      <span class="admin-history-meta-chip">${escapeHtml(entry.requestId || "Номер не указан")}</span>
      <span class="admin-history-meta-chip">${escapeHtml(`Уборка: ${scheduledLabel}`)}</span>
      <span class="admin-history-meta-chip">${escapeHtml(`Команда: ${teamLabel}`)}</span>
    </div>
    <p class="admin-client-history-address">${escapeHtml(entry.fullAddress || "Адрес не указан")}</p>
  </article>`;
}

function getAdminClientEditPanelId(clientKey) {
  const normalized = normalizeString(clientKey, 180).toLowerCase();
  const safeKey = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `admin-client-edit-${safeKey || "panel"}`;
}

function renderAdminClientAddressTabs(client, returnTo = ADMIN_CLIENTS_PATH, activeAddressKey = "") {
  if (!client || !Array.isArray(client.addresses) || client.addresses.length === 0) return "";

  return `<div class="admin-client-address-switcher">
    <div class="admin-subsection-head admin-client-address-head">
      <h3 class="admin-subsection-title">Адреса клиента</h3>
      <span class="admin-action-hint">${escapeHtml(formatClientAddressCountLabel(client.addresses.length))}</span>
    </div>
    <div class="admin-client-address-list">
      ${client.addresses
        .map((addressRecord) => {
          const href = buildAdminRedirectPath(returnTo, {
            client: client.key,
            addressKey: addressRecord.key,
          });
          const className = [
            "admin-client-address-pill",
            addressRecord.key === activeAddressKey ? "admin-client-address-pill-active" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const metaCopy = [
            addressRecord.requestCount > 0
              ? formatClientRequestCountLabel(addressRecord.requestCount)
              : "Без заявок",
            addressRecord.propertyType ? formatAdminClientAddressPropertyTypeLabel(addressRecord.propertyType) : "",
          ]
            .filter(Boolean)
            .join(" • ");

          return `<a class="${className}" href="${escapeHtmlAttribute(href)}">
            <span class="admin-client-address-pill-copy">${escapeHtml(addressRecord.address || "Адрес не указан")}</span>
            <span class="admin-client-address-pill-meta">${escapeHtml(metaCopy)}</span>
          </a>`;
        })
        .join("")}
    </div>
  </div>`;
}

function renderAdminClientAddressProfileSection(addressRecord) {
  if (!addressRecord) return "";

  const squareFootage = normalizeString(addressRecord.squareFootage, 120) || "Не указан";
  const roomCount = normalizeString(addressRecord.roomCount, 120) || "Не указано";
  const bathroomCount = normalizeString(addressRecord.bathroomCount, 120) || "Не указано";
  const notes = normalizeString(addressRecord.notes, 4000) || "Пока без заметок";

  return `<section class="admin-client-section admin-client-address-profile-section">
    <div class="admin-subsection-head">
      <h3 class="admin-subsection-title">Параметры адреса</h3>
      <span class="admin-action-hint">Меняются при переключении адреса клиента</span>
    </div>
    <div class="admin-client-address-profile-grid">
      <article class="admin-client-address-fact">
        <span class="admin-client-address-fact-label">Тип объекта</span>
        <p class="admin-client-address-fact-value">${escapeHtml(formatAdminClientAddressPropertyTypeLabel(addressRecord.propertyType))}</p>
      </article>
      <article class="admin-client-address-fact">
        <span class="admin-client-address-fact-label">Метраж</span>
        <p class="admin-client-address-fact-value">${escapeHtml(squareFootage)}</p>
      </article>
      <article class="admin-client-address-fact">
        <span class="admin-client-address-fact-label">Комнаты</span>
        <p class="admin-client-address-fact-value">${escapeHtml(roomCount)}</p>
      </article>
      <article class="admin-client-address-fact">
        <span class="admin-client-address-fact-label">Туалеты</span>
        <p class="admin-client-address-fact-value">${escapeHtml(bathroomCount)}</p>
      </article>
      <article class="admin-client-address-fact">
        <span class="admin-client-address-fact-label">Домашние животные</span>
        <p class="admin-client-address-fact-value">${escapeHtml(formatAdminClientAddressPetsLabel(addressRecord.pets))}</p>
      </article>
    </div>
    <article class="admin-client-address-note-card">
      <span class="admin-client-address-fact-label">Особые инструкции</span>
      <p class="admin-client-address-note-copy">${escapeHtml(notes)}</p>
    </article>
  </section>`;
}

function renderAdminClientAddressInputRow(baseId, value = "", index = 0) {
  const addressRecord =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : { address: value };
  const inputId = normalizeString(`${baseId}-address-${index}`, 160);
  const suggestionsId = `${inputId}-suggestions`;

  return `<div class="admin-client-address-input-row" data-admin-client-address-row>
    <div class="admin-client-address-input-panel">
      <div class="admin-client-address-input-head">
        <span class="admin-client-address-input-title">Адрес клиента</span>
        ${renderAdminClientAddressRemoveButton()}
      </div>
      <label class="admin-label">
        Адрес
        <div class="admin-address-field" data-admin-address-field>
          <input
            class="admin-input"
            type="text"
            name="addresses"
            value="${escapeHtmlAttribute(normalizeString(addressRecord.address, 500))}"
            placeholder="58 South Grove Avenue, Elgin, IL"
            autocomplete="off"
            data-admin-address-autocomplete="true"
            data-admin-address-country="us"
            aria-autocomplete="list"
            aria-expanded="false"
            id="${escapeHtmlAttribute(inputId)}"
            aria-controls="${escapeHtmlAttribute(suggestionsId)}"
          >
          <div class="admin-address-suggestions" data-admin-address-suggestions hidden role="listbox" id="${escapeHtmlAttribute(suggestionsId)}"></div>
        </div>
      </label>
      <div class="admin-form-grid admin-form-grid-three admin-client-address-detail-grid">
        <label class="admin-label">
          Тип объекта
          <select class="admin-input" name="addressPropertyTypes">
            ${renderAdminSelectOptions(CLIENT_ADDRESS_TYPE_OPTIONS, addressRecord.propertyType, "Выберите тип")}
          </select>
        </label>
        <label class="admin-label">
          Метраж
          <input
            class="admin-input"
            type="text"
            name="addressSquareFootages"
            value="${escapeHtmlAttribute(normalizeString(addressRecord.squareFootage, 120))}"
            placeholder="1600 sq ft"
          >
        </label>
        <label class="admin-label">
          Комнаты
          <input
            class="admin-input"
            type="text"
            name="addressRoomCounts"
            value="${escapeHtmlAttribute(normalizeString(addressRecord.roomCount, 120))}"
            placeholder="3 комнаты"
          >
        </label>
        <label class="admin-label">
          Туалеты
          <input
            class="admin-input"
            type="text"
            name="addressBathroomCounts"
            value="${escapeHtmlAttribute(normalizeString(addressRecord.bathroomCount, 120))}"
            placeholder="2 туалета"
          >
        </label>
        <label class="admin-label">
          Домашние животные
          <select class="admin-input" name="addressPets">
            ${renderAdminSelectOptions(CLIENT_ADDRESS_PET_OPTIONS, addressRecord.pets, "Не указано")}
          </select>
        </label>
      </div>
      <label class="admin-label">
        Особые инструкции
        <textarea class="admin-input" name="addressNotes" placeholder="Ключи, код двери, что не трогать, аллергии">${escapeHtml(normalizeString(addressRecord.notes, 4000))}</textarea>
      </label>
    </div>
  </div>`;
}

function renderAdminClientEditPanel(client, returnTo = ADMIN_CLIENTS_PATH, panelId = "") {
  if (!client || !panelId) return "";
  const addressValues = Array.isArray(client.addresses)
    ? client.addresses
      .map((addressRecord) => ({
        address: normalizeString(addressRecord && addressRecord.address, 500),
        propertyType: normalizeString(addressRecord && addressRecord.propertyType, 40).toLowerCase(),
        squareFootage: normalizeString(addressRecord && addressRecord.squareFootage, 120),
        roomCount: normalizeString(addressRecord && addressRecord.roomCount, 120),
        bathroomCount: normalizeString(addressRecord && addressRecord.bathroomCount, 120),
        sizeDetails: normalizeString(addressRecord && addressRecord.sizeDetails, 250),
        pets: normalizeString(addressRecord && addressRecord.pets, 40).toLowerCase(),
        notes: normalizeString(addressRecord && addressRecord.notes, 4000),
      }))
      .filter((addressRecord) => addressRecord.address)
    : [];
  const initialAddresses = addressValues.length > 0
    ? addressValues
    : [{ address: "", propertyType: "", squareFootage: "", roomCount: "", bathroomCount: "", sizeDetails: "", pets: "", notes: "" }];
  const addressTemplateId = `${panelId}-address-template`;

  return `<section class="admin-client-section admin-staff-form-section" id="${escapeHtmlAttribute(panelId)}" data-admin-toggle-panel hidden>
    <div class="admin-subsection-head">
      <h3 class="admin-subsection-title">Редактирование клиента</h3>
      <span class="admin-action-hint">Обновляет карточку клиента во всех связанных заявках</span>
    </div>
    <form
      class="admin-form-grid"
      method="post"
      action="${ADMIN_CLIENTS_PATH}"
      data-admin-async-save="true"
      data-admin-save-confirm="true"
      data-admin-async-success="Карточка клиента сохранена."
      data-admin-async-error="Не удалось сохранить карточку клиента."
    >
      <input type="hidden" name="action" value="update-client">
      <input type="hidden" name="clientKey" value="${escapeHtmlAttribute(client.key)}">
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
      <div class="admin-form-grid admin-form-grid-two">
        <label class="admin-label">
          Имя клиента
          <input class="admin-input" type="text" name="name" value="${escapeHtmlText(client.name)}" required>
        </label>
        ${renderAdminPhoneInput("phone", client.phone)}
        <label class="admin-label">
          Email
          <input class="admin-input" type="email" name="email" value="${escapeHtmlText(client.email)}" placeholder="client@example.com">
        </label>
      </div>
      <div class="admin-label">
        <span>Адреса клиента</span>
        <div class="admin-client-address-editor" data-admin-client-address-editor data-admin-client-address-next-index="${escapeHtmlAttribute(String(initialAddresses.length))}">
          <div class="admin-client-address-input-list" data-admin-client-address-list>
            ${initialAddresses.map((addressRecord, itemIndex) => renderAdminClientAddressInputRow(panelId, addressRecord, itemIndex)).join("")}
          </div>
          <div class="admin-inline-actions">
            <button
              class="admin-button admin-button-secondary"
              type="button"
              data-admin-client-address-add="true"
              data-admin-client-address-template="${escapeHtmlAttribute(addressTemplateId)}"
            >Добавить адрес</button>
          </div>
          <small class="admin-field-hint">Для каждого адреса можно сохранить тип объекта, параметры дома, животных и заметки. При переключении адреса в карточке эти данные меняются вместе с историей заявок.</small>
          <template id="${escapeHtmlAttribute(addressTemplateId)}">${renderAdminClientAddressInputRow(panelId, {
            address: "",
            propertyType: "",
            squareFootage: "",
            roomCount: "",
            bathroomCount: "",
            sizeDetails: "",
            pets: "",
            notes: "",
          }, "__INDEX__")}</template>
        </div>
      </div>
      <p class="admin-field-note" data-admin-async-feedback hidden></p>
      <div class="admin-inline-actions">
        <button class="admin-button" type="submit">Сохранить клиента</button>
      </div>
    </form>
  </section>`;
}

function renderAdminClientDeleteForm(client, returnTo = ADMIN_CLIENTS_PATH, companionTargetId = "") {
  if (!client || !client.key) return "";
  const clientName = normalizeString(client.name, 120) || "этого клиента";
  const companionAttr = companionTargetId
    ? ` data-admin-toggle-companion="${escapeHtmlAttribute(companionTargetId)}" hidden`
    : "";
  return `<form
    class="admin-client-delete-form admin-client-head-delete-form"
    method="post"
    action="${ADMIN_CLIENTS_PATH}"${companionAttr}
  >
    <input type="hidden" name="action" value="delete-client">
    <input type="hidden" name="clientKey" value="${escapeHtmlAttribute(client.key)}">
    <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
    ${renderAdminDeleteIconButton(
      "Удалить клиента",
      `Удалить клиента ${clientName} и все связанные с ним заявки? Это действие нельзя отменить.`
    )}
  </form>`;
}

function getAdminClientEntryOrderStatus(entry) {
  if (!isOrderCreatedEntry(entry)) return "request";
  const payload =
    entry && entry.payloadForRetry && typeof entry.payloadForRetry === "object"
      ? entry.payloadForRetry
      : {};
  const calculatorData =
    payload.calculatorData && typeof payload.calculatorData === "object"
      ? payload.calculatorData
      : {};
  const adminOrder = getEntryOrderState(entry);
  const explicitStatus = normalizeOrderStatus(adminOrder.status, "");
  if (explicitStatus) return explicitStatus;
  const selectedDate = normalizeString(entry.selectedDate || calculatorData.selectedDate, 32);
  const selectedTime = normalizeString(entry.selectedTime || calculatorData.selectedTime, 32);
  if (selectedDate || selectedTime) return "scheduled";
  return "new";
}

function isAdminClientEntryActive(entry) {
  if (!isOrderCreatedEntry(entry)) return false;
  const orderStatus = getAdminClientEntryOrderStatus(entry);
  return orderStatus !== "completed" && orderStatus !== "canceled";
}

function renderAdminClientDetailPanel(client, returnTo = ADMIN_CLIENTS_PATH, options = {}) {
  if (!client) {
    return `<div class="admin-empty-state">Выберите клиента в таблице, чтобы открыть его контакты, сводку по заявкам и историю обращений.</div>`;
  }

  const planningByEntryId = options.planningByEntryId instanceof Map ? options.planningByEntryId : new Map();
  const activeAddressRecord =
    options.activeAddressRecord && typeof options.activeAddressRecord === "object"
      ? options.activeAddressRecord
      : Array.isArray(client.addresses)
        ? client.addresses[0] || null
        : null;
  const scopedEntries =
    activeAddressRecord && Array.isArray(activeAddressRecord.entries) ? activeAddressRecord.entries : [];
  const successfulEntries = scopedEntries.filter((entry) => normalizeString(entry.status, 32).toLowerCase() === "success").length;
  const issueCount = Math.max(0, scopedEntries.length - successfulEntries);
  const latestEntry = scopedEntries[0] || null;
  const activeEntry = scopedEntries.find((entry) => isAdminClientEntryActive(entry)) || null;
  const activeOrderStatus = activeEntry ? getAdminClientEntryOrderStatus(activeEntry) : "";
  const activeScheduledLabel = activeEntry
    ? buildFormattedScheduleLabel(activeEntry.selectedDate, activeEntry.selectedTime) || "Не указана"
    : "";
  const editPanelId = normalizeString(options.editPanelId, 200);
  const scopedLatestStatus =
    activeAddressRecord && activeAddressRecord.requestCount > 0 ? activeAddressRecord.latestStatus : "";
  const smsContactEntry = Array.isArray(client.entries)
    ? client.entries.find((entry) => normalizeString(entry && entry.contactId, 120))
    : null;
  const statusBadges = [
    renderAdminClientStatusBadge(scopedLatestStatus),
    renderAdminBadge(scopedEntries.length > 1 ? "Повторный адрес" : "Новый адрес", scopedEntries.length > 1 ? "outline" : "muted"),
    issueCount > 0 ? renderAdminBadge(`${issueCount} требуют внимания`, "danger") : renderAdminBadge("Без ошибок", "success"),
  ].join("");
  const summaryCopy = activeEntry
    ? `Активная заявка: ${formatAdminDateTime(activeEntry.createdAt)}`
    : latestEntry
      ? `Последняя заявка: ${formatAdminDateTime(latestEntry.createdAt)}`
      : "По выбранному адресу пока нет заявок.";
  const activeRequestItems = activeEntry
    ? [
        { label: "Услуга", value: formatAdminServiceLabel(activeEntry.serviceName || activeEntry.serviceType) },
        { label: "Сумма текущей заявки", value: formatCurrencyAmount(activeEntry.totalPrice) },
        { label: "Дата и время", value: activeScheduledLabel || "Не указана" },
        { label: "Статус заказа", value: renderOrderStatusBadge(activeOrderStatus), raw: true },
        { label: "Последнее обращение", value: formatAdminDateTime(activeEntry.createdAt) },
        { label: "Request ID", value: activeEntry.requestId || "Не указан" },
      ]
    : [];

  return `<div class="admin-client-dialog-body">
    <section class="admin-client-summary-panel">
      <div class="admin-client-summary-head">
        <div class="admin-client-summary-copy-block">
          <div class="admin-badge-row admin-client-badge-row">
            ${statusBadges}
          </div>
          <p class="admin-client-summary-copy">${escapeHtml(summaryCopy)}</p>
        </div>
      </div>
      <div class="admin-client-metric-grid admin-client-metric-grid-dialog">
        <article class="admin-client-metric-card">
          <span class="admin-client-metric-label">Последний статус</span>
          <div class="admin-client-metric-value">${renderAdminClientStatusBadge(scopedLatestStatus)}</div>
        </article>
        <article class="admin-client-metric-card">
          <span class="admin-client-metric-label">Заявок по адресу</span>
          <p class="admin-client-metric-value">${escapeHtml(String(activeAddressRecord ? activeAddressRecord.requestCount : scopedEntries.length))}</p>
        </article>
        <article class="admin-client-metric-card">
          <span class="admin-client-metric-label">Сумма по адресу</span>
          <p class="admin-client-metric-value">${escapeHtml(formatCurrencyAmount(activeAddressRecord ? activeAddressRecord.totalRevenue : 0))}</p>
        </article>
        <article class="admin-client-metric-card">
          <span class="admin-client-metric-label">Адресов клиента</span>
          <p class="admin-client-metric-value">${escapeHtml(String(Array.isArray(client.addresses) ? client.addresses.length : 0))}</p>
        </article>
      </div>
      ${renderAdminClientAddressTabs(
        client,
        returnTo,
        activeAddressRecord ? activeAddressRecord.key : ""
      )}
    </section>
    ${renderAdminClientAddressProfileSection(activeAddressRecord)}
    ${renderAdminGhlSmsComposer({
      req: options.req,
      actionPath: ADMIN_CLIENTS_PATH,
      targetType: "client",
      targetRef: client.key,
      targetFieldName: "clientKey",
      targetFieldValue: client.key,
      returnTo,
      phone: client.phone,
      contactId: smsContactEntry ? smsContactEntry.contactId : "",
      historyEntries: getClientSmsHistoryEntries(client),
      leadConnectorConfigured: Boolean(options.leadConnectorConfigured),
      canEdit: options.canEdit,
      noticePrefix: "client",
      title: "SMS клиенту",
      description: "Быстрая отправка сообщения через Go High Level прямо из карточки клиента.",
    })}
    ${renderAdminClientEditPanel(client, returnTo, editPanelId)}
    ${activeEntry
      ? `<section class="admin-client-section admin-client-section-side">
        <div class="admin-subsection-head">
          <h3 class="admin-subsection-title">Сводка по активной заявке</h3>
          <span class="admin-action-hint">${escapeHtml(activeEntry.requestId || "Номер не указан")}</span>
        </div>
        ${renderAdminClientInfoGrid(activeRequestItems)}
      </section>`
      : ""}
    <section class="admin-client-section">
      <div class="admin-subsection-head">
        <h3 class="admin-subsection-title">История заявок по адресу</h3>
        <span class="admin-action-hint">${escapeHtml(formatClientRequestCountLabel(activeAddressRecord ? activeAddressRecord.requestCount : scopedEntries.length))}</span>
      </div>
      ${scopedEntries.length > 0
        ? `<div class="admin-history-list admin-client-history-list">
            ${scopedEntries.map((entry) => renderAdminClientHistoryItem(entry, planningByEntryId.get(entry.id) || null)).join("")}
          </div>`
        : `<div class="admin-empty-state admin-client-history-empty">По этому адресу пока нет заявок. Добавленный адрес уже сохранён в карточке клиента.</div>`}
    </section>
  </div>`;
}

function renderAdminClientDetailDialog(client, returnTo = ADMIN_CLIENTS_PATH, options = {}) {
  if (!client) return "";
  const closeHref = options.closeHref || ADMIN_CLIENTS_PATH;
  const dialogId = normalizeString(options.dialogId, 200) || "admin-client-detail-dialog";
  const titleId = `${dialogId}-title`;
  const autoOpenAttr = options.autoOpen === false ? "" : ' data-admin-dialog-autopen="true"';
  const clientTitle = client.name || "Клиент";
  const editPanelId = getAdminClientEditPanelId(client.key);
  const activeAddressRecord =
    options.activeAddressRecord && typeof options.activeAddressRecord === "object"
      ? options.activeAddressRecord
      : Array.isArray(client.addresses)
        ? client.addresses[0] || null
        : null;
  const clientMeta = [formatAdminPhoneNumber(client.phone) || client.phone || "", client.email || ""].filter(Boolean).join(" • ") || "Контакты пока не заполнены";
  const clientAddressLine = activeAddressRecord && activeAddressRecord.address ? activeAddressRecord.address : client.address || "";
  return `<dialog
    class="admin-dialog admin-dialog-wide"
    id="${escapeHtmlAttribute(dialogId)}"${autoOpenAttr}${closeHref ? ` data-admin-dialog-return-url="${escapeHtmlAttribute(closeHref)}"` : ""}
    aria-labelledby="${escapeHtmlAttribute(titleId)}"
  >
    <div class="admin-dialog-panel admin-client-dialog-panel">
      <div class="admin-dialog-head admin-dialog-hero">
        <div class="admin-dialog-hero-main">
          <span class="admin-client-avatar admin-client-avatar-large ${getAdminClientAvatarToneClass(client.key)}">${escapeHtml(getAdminClientAvatarInitials(clientTitle))}</span>
          <div class="admin-dialog-copy-block admin-dialog-hero-copy admin-client-dialog-intro">
            <p class="admin-card-eyebrow">Клиент</p>
            <div class="admin-dialog-hero-title-block">
              <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(titleId)}">${escapeHtml(clientTitle)}</h2>
              <div class="admin-dialog-hero-meta-stack">
                <p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(clientMeta)}</p>
                ${clientAddressLine ? `<p class="admin-dialog-hero-detail admin-client-dialog-address">${escapeHtml(clientAddressLine)}</p>` : ""}
              </div>
            </div>
          </div>
        </div>
        <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
          ${renderAdminToggleIconButton("Редактировать клиента", editPanelId, {
            openLabel: "Скрыть",
            closedLabel: "Редактировать клиента",
          })}
          ${renderAdminClientDeleteForm(client, closeHref || ADMIN_CLIENTS_PATH, editPanelId)}
          ${renderAdminDialogCloseButton(dialogId)}
        </div>
      </div>
      ${renderAdminClientDetailPanel(client, returnTo, {
        closeHref,
        editPanelId,
        activeAddressRecord,
        planningByEntryId: options.planningByEntryId,
      })}
    </div>
  </dialog>`;
}

  return {
    getAdminClientHistoryTeamLabel,
    renderAdminClientHistoryItem,
    getAdminClientEditPanelId,
    renderAdminClientAddressTabs,
    renderAdminClientAddressProfileSection,
    renderAdminClientAddressInputRow,
    renderAdminClientEditPanel,
    getAdminClientEntryOrderStatus,
    isAdminClientEntryActive,
    renderAdminClientDetailPanel,
    renderAdminClientDetailDialog,
  };
}

module.exports = {
  createClientDetailUiHelpers,
};
