"use strict";

function defaultNormalizeString(value, maxLength = 0) {
  const stringValue = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmedValue = stringValue.trim();
  if (!maxLength || trimmedValue.length <= maxLength) return trimmedValue;
  return trimmedValue.slice(0, maxLength);
}

function createClientOrderDetailDialogs(deps = {}) {
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
    const notes = normalizeString(addressRecord.notes, 800) || "Пока без заметок";

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
            Домашние животные
            <select class="admin-input" name="addressPets">
              ${renderAdminSelectOptions(CLIENT_ADDRESS_PET_OPTIONS, addressRecord.pets, "Не указано")}
            </select>
          </label>
        </div>
        <label class="admin-label">
          Особые инструкции
          <textarea class="admin-input" name="addressNotes" placeholder="Ключи, код двери, что не трогать, аллергии">${escapeHtml(normalizeString(addressRecord.notes, 800))}</textarea>
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
          sizeDetails: normalizeString(addressRecord && addressRecord.sizeDetails, 250),
          pets: normalizeString(addressRecord && addressRecord.pets, 40).toLowerCase(),
          notes: normalizeString(addressRecord && addressRecord.notes, 800),
        }))
        .filter((addressRecord) => addressRecord.address)
      : [];
    const initialAddresses = addressValues.length > 0
      ? addressValues
      : [{ address: "", propertyType: "", squareFootage: "", roomCount: "", sizeDetails: "", pets: "", notes: "" }];
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

  function renderOrderSummaryCard(label, value, options = {}) {
    const toneClass = options.tone ? ` admin-order-summary-card-${escapeHtmlAttribute(options.tone)}` : "";
    const sizeClass = options.compact ? " admin-order-summary-card-compact" : "";
    const customClass = options.className ? ` ${escapeHtmlAttribute(options.className)}` : "";
    const valueMarkup = options.raw ? value : escapeHtml(value);
    return `<article class="admin-client-metric-card admin-order-summary-card${toneClass}${sizeClass}${customClass}">
      <div class="admin-order-summary-card-head">
        <span class="admin-client-metric-label">${escapeHtml(label)}</span>
        ${options.actions || ""}
      </div>
      <p class="admin-client-metric-value admin-order-summary-card-value">${valueMarkup}</p>
      ${options.note ? `<p class="admin-order-summary-card-note">${options.rawNote ? options.note : escapeHtml(options.note)}</p>` : ""}
      ${options.editor || ""}
    </article>`;
  }

  function renderOrderManagementDialog(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const staffRecords = Array.isArray(options.staffRecords) ? options.staffRecords : [];
    const canDelete = options.canDelete !== false;
    const dialogId = getOrderDialogId(order.id);
    const editFormId = `${dialogId}-edit-form`;
    const amountFormId = `${dialogId}-amount-form`;
    const amountEditPanelId = `${dialogId}-amount-edit-panel`;
    const paymentFormId = `${dialogId}-payment-form`;
    const paymentEditPanelId = `${dialogId}-payment-edit-panel`;
    const teamFormId = `${dialogId}-team-form`;
    const teamEditPanelId = `${dialogId}-team-edit-panel`;
    const dialogReturnTo = buildAdminRedirectPath(returnTo, {
      amountEditor: "",
    });
    const detailReturnTo = buildAdminRedirectPath(dialogReturnTo, {
      order: order.id,
    });
    const autoOpenAmountEditor = options.autoOpenAmountEditor === true;
    const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";
    const closeHref = options.closeHref || "";
    const titleLabel = order.customerName || "Карточка заказа";
    const assignedLabel = getOrderAssignedLabel(order, planningItem);
    const assignedSummaryLabel = formatOrderAssignedStaffSummary(
      parseOrderAssignedStaffNames(assignedLabel),
      {
        emptyLabel: "Не назначен",
        preferCount: true,
      }
    );
    const createdLabel = formatAdminDateTime(order.createdAt);
    const phoneLabel = formatAdminPhoneNumber(order.customerPhone) || "Телефон не указан";
    const emailLabel = order.customerEmail || "E-mail не указан";
    const contactLabel = [phoneLabel, emailLabel].filter(Boolean).join(" • ");
    const scheduleLabel = order.scheduleLabel || "Дата не указана";
    const quoteData = getOrderQuoteData(order);
    const completionData = getOrderCompletionData(order);
    const selectedServices = getOrderQuoteSelectedServices(quoteData);
    const quoteAddressLabel = formatOrderQuoteText(quoteData.address, "Не указан", 500);
    const quoteFullAddressLabel = formatOrderQuoteText(
      quoteData.fullAddress || order.fullAddress,
      "Не указан",
      500
    );
    const orderHeaderAddress =
      quoteFullAddressLabel !== "Не указан" ? quoteFullAddressLabel : order.fullAddress || "Адрес не указан";
    const orderStatusBadgeMarkup = renderOrderStatusBadge(order.orderStatus);
    const policyNeedsSignature =
      order.orderStatus !== "new" &&
      order.orderStatus !== "canceled" &&
      !Boolean(order.policyAccepted);
    const summaryStripBadges = [
      renderAdminBadge(order.serviceLabel, "outline"),
      order.frequency ? renderAdminBadge(order.frequencyLabel, "outline") : "",
      order.requestId ? renderAdminBadge(`Request ${order.requestId}`, "outline") : "",
      policyNeedsSignature ? renderAdminBadge("Политика не подписана", "danger") : "",
      !order.hasSchedule && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
        ? renderAdminBadge("Нужно назначить дату", "danger")
        : "",
      !order.isAssigned && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
        ? renderAdminBadge("Команда не назначена", "danger")
        : "",
      order.needsAttention ? renderAdminBadge("Есть вопрос по CRM", "danger") : "",
    ]
      .filter(Boolean)
      .join("");
    const serviceTypeLabel = formatOrderQuoteServiceType(quoteData.serviceType, order.serviceLabel);
    const frequencyLabel = formatOrderQuoteFrequency(quoteData.frequency, order.frequencyLabel);
    const requestedSlotLabel = formatOrderQuoteRequestedSlot(
      quoteData.formattedDateTime,
      quoteData.selectedDate || order.selectedDate,
      quoteData.selectedTime || order.selectedTime
    );
    const consentLabel = formatOrderQuoteBoolean(quoteData.consent);
    const roomsLabel = formatOrderQuoteText(quoteData.rooms, "Не указано", 32);
    const bathroomsLabel = formatOrderQuoteText(quoteData.bathrooms, "Не указано", 32);
    const squareFootageLabel = formatOrderQuoteSquareFootage(quoteData.squareMeters);
    const petsLabel = formatOrderQuotePetsLabel(quoteData.hasPets);
    const basementLabel = formatOrderQuoteBoolean(quoteData.basementCleaning);
    const addressLine2Label = formatOrderQuoteText(quoteData.addressLine2, "Не указано", 200);
    const cityLabel = formatOrderQuoteText(quoteData.city, "Не указано", 120);
    const stateLabel = formatOrderQuoteText(quoteData.state, "Не указано", 32);
    const zipLabel = formatOrderQuoteText(quoteData.zipCode, "Не указано", 32);
    const customerCommentMarkup = formatOrderQuoteMultiline(quoteData.additionalDetails);
    const visitCardMarkup = `<article class="admin-order-quote-card">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">Что запросил клиент</h4>
      </div>
      <div class="admin-order-quote-fields">
        ${renderOrderQuoteField("Тип уборки", serviceTypeLabel)}
        ${renderOrderQuoteField("Повторяемость", frequencyLabel)}
        ${renderOrderQuoteField("Запрошенный слот", requestedSlotLabel, { wide: true })}
        ${renderOrderQuoteField("Согласие", consentLabel)}
      </div>
    </article>`;
    const homeCardMarkup = `<article class="admin-order-quote-card">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">Дом и условия</h4>
      </div>
      <div class="admin-order-quote-fields">
        ${renderOrderQuoteField("Спальни", roomsLabel)}
        ${renderOrderQuoteField("Санузлы", bathroomsLabel)}
        ${renderOrderQuoteField("Размер дома", squareFootageLabel)}
        ${renderOrderQuoteField("Питомцы", petsLabel)}
        ${renderOrderQuoteField("Basement cleaning", basementLabel)}
      </div>
    </article>`;
    const servicesCardMarkup = `<article class="admin-order-quote-card">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">Дополнительные услуги</h4>
      </div>
      <div class="admin-order-quote-fields admin-order-quote-fields-services">
        ${renderOrderQuoteField(
          "Выбранные add-ons",
          selectedServices.length > 0 ? selectedServices.join(", ") : "Не выбраны",
          { wide: true }
        )}
        <div class="admin-order-quote-fields">
          ${renderOrderQuoteField(
            ORDER_QUOTE_QUANTITY_LABELS.interiorWindowsCleaning,
            getOrderQuoteQuantityValue(quoteData, "interiorWindowsCleaning")
          )}
          ${renderOrderQuoteField(
            ORDER_QUOTE_QUANTITY_LABELS.blindsCleaning,
            getOrderQuoteQuantityValue(quoteData, "blindsCleaning")
          )}
          ${renderOrderQuoteField(
            ORDER_QUOTE_QUANTITY_LABELS.bedLinenChange,
            getOrderQuoteQuantityValue(quoteData, "bedLinenChange")
          )}
        </div>
      </div>
    </article>`;
    const addressFields = [
      quoteAddressLabel !== "Не указан" && quoteAddressLabel !== quoteFullAddressLabel
        ? renderOrderQuoteField("Короткий адрес", quoteAddressLabel, { wide: true })
        : "",
      renderOrderQuoteField("Apt / suite", addressLine2Label),
      renderOrderQuoteField("Город", cityLabel),
      renderOrderQuoteField("Штат", stateLabel),
      renderOrderQuoteField("ZIP", zipLabel),
    ]
      .filter(Boolean)
      .join("");
    const addressCardMarkup = `<article class="admin-order-quote-card">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">Адрес из формы</h4>
      </div>
      <div class="admin-order-quote-fields">
        ${addressFields}
      </div>
    </article>`;
    const customerCommentCardMarkup = `<article class="admin-order-quote-card admin-order-quote-card-wide">
      <div class="admin-subsection-head">
        <h4 class="admin-subsection-title">Комментарий клиента</h4>
      </div>
      <div class="admin-order-quote-fields">
        ${renderOrderQuoteField("Комментарий клиента", customerCommentMarkup, { raw: true, wide: true })}
      </div>
    </article>`;
    const quoteCards = [
      visitCardMarkup,
      homeCardMarkup,
      servicesCardMarkup,
      addressCardMarkup,
      customerCommentCardMarkup,
    ].join("");
    const completionUpdatedAtLabel = completionData.updatedAt ? formatAdminDateTime(completionData.updatedAt) : "";
    const cleanerReportSection = `<section class="admin-order-section-card admin-order-cleaner-section">
      <div class="admin-subsection-head">
        <div>
          <h3 class="admin-subsection-title">Отчёт клинера</h3>
          <p class="admin-order-detail-copy">После выполнения заказа сюда загружаются все фото до, все фото после и комментарий клинера.</p>
        </div>
        <span
          class="admin-action-hint${completionUpdatedAtLabel ? "" : " admin-action-hint-hidden"}"
          data-admin-order-completion-updated-at
        >${completionUpdatedAtLabel ? `Обновлено ${escapeHtml(completionUpdatedAtLabel)}` : ""}</span>
      </div>
      <div class="admin-order-media-stack">
        <div class="admin-order-media-layout">
          ${renderOrderMediaGallery("Фото до", "Фото до ещё не загружены.", order.id, completionData.beforePhotos, "before")}
          ${renderOrderMediaGallery("Фото после", "Фото после ещё не загружены.", order.id, completionData.afterPhotos, "after")}
        </div>
        <div
          class="admin-form-grid admin-order-completion-panel"
          data-admin-order-completion-panel="true"
          data-admin-order-completion-entry-id="${escapeHtmlAttribute(order.id)}"
          data-admin-order-completion-return-to="${escapeHtmlAttribute(dialogReturnTo)}"
          data-admin-order-completion-action="${escapeHtmlAttribute(ADMIN_ORDERS_PATH)}"
        >
          <div class="admin-order-completion-grid">
            <label class="admin-label">
              Фото до
              <input class="admin-input admin-file-input" type="file" name="beforePhotos" accept="image/*" multiple>
              <span class="admin-input-help">Можно выбрать сразу весь набор фотографий до начала уборки.</span>
            </label>
            <label class="admin-label">
              Фото после
              <input class="admin-input admin-file-input" type="file" name="afterPhotos" accept="image/*" multiple>
              <span class="admin-input-help">Можно выбрать сразу весь набор фотографий после завершения заказа.</span>
            </label>
          </div>
          <div class="admin-inline-actions admin-form-actions">
            <button class="admin-button admin-button-secondary" type="button" data-admin-order-completion-submit>Сохранить фото</button>
            <span class="admin-action-hint">Если загрузить новые фото в одном из блоков, текущий набор в этом блоке заменится.</span>
          </div>
          <div class="admin-alert admin-alert-info admin-order-completion-feedback" data-admin-order-completion-feedback hidden></div>
        </div>
        <div
          class="admin-form-grid admin-order-cleaner-comment-form"
          data-admin-order-cleaner-comment-panel="true"
          data-admin-order-cleaner-comment-entry-id="${escapeHtmlAttribute(order.id)}"
          data-admin-order-cleaner-comment-return-to="${escapeHtmlAttribute(dialogReturnTo)}"
          data-admin-order-cleaner-comment-action="${escapeHtmlAttribute(ADMIN_ORDERS_PATH)}"
        >
          <label class="admin-label">
            Комментарий клинера
            <textarea class="admin-input admin-order-comment-field" name="cleanerComment" rows="5" placeholder="Что важно знать по этому заказу: результат, сложные зоны, материалы, доступ, нюансы...">${escapeHtml(completionData.cleanerComment)}</textarea>
          </label>
          <p class="admin-field-note" data-admin-async-feedback hidden></p>
          <div class="admin-inline-actions admin-form-actions">
            <button class="admin-button admin-button-secondary" type="button" data-admin-order-cleaner-comment-submit>Сохранить комментарий</button>
          </div>
          <div class="admin-alert admin-alert-info admin-order-cleaner-comment-feedback" data-admin-order-cleaner-comment-feedback hidden></div>
        </div>
      </div>
    </section>`;
    const amountHighlightCardMarkup = renderOrderSummaryCard(
      "Сумма",
      formatCurrencyAmount(order.totalPrice),
      {
        actions: `<div class="admin-order-summary-card-actions">
          <button
            class="admin-icon-button admin-edit-button"
            type="button"
            aria-label="Изменить сумму"
            title="Изменить сумму"
            data-admin-order-amount-open="${escapeHtmlAttribute(amountEditPanelId)}"
            data-admin-order-amount-edit-trigger="${escapeHtmlAttribute(amountEditPanelId)}"
            ${autoOpenAmountEditor ? "hidden" : ""}
          >
            ${renderAdminEditIcon("Изменить сумму")}
          </button>
          <button
            class="admin-icon-button admin-confirm-button"
            type="submit"
            form="${escapeHtmlAttribute(amountFormId)}"
            aria-label="Сохранить сумму"
            title="Сохранить сумму"
            data-admin-order-amount-action-for="${escapeHtmlAttribute(amountEditPanelId)}"
            ${autoOpenAmountEditor ? "" : "hidden"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9.55 17.2 4.8 12.45a.75.75 0 1 1 1.06-1.06l3.69 3.69 8.59-8.58a.75.75 0 1 1 1.06 1.06l-9.12 9.11a.75.75 0 0 1-1.06 0Z" fill="currentColor"/>
            </svg>
            <span class="admin-sr-only">Сохранить сумму</span>
          </button>
          <button
            class="admin-icon-button admin-close-button"
            type="button"
            aria-label="Отменить редактирование суммы"
            title="Отменить"
            data-admin-order-amount-cancel="${escapeHtmlAttribute(amountEditPanelId)}"
            data-admin-order-amount-action-for="${escapeHtmlAttribute(amountEditPanelId)}"
            ${autoOpenAmountEditor ? "" : "hidden"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6.53 5.47a.75.75 0 0 1 1.06 0L12 9.88l4.41-4.41a.75.75 0 1 1 1.06 1.06L13.06 10.94l4.41 4.41a.75.75 0 1 1-1.06 1.06L12 12l-4.41 4.41a.75.75 0 1 1-1.06-1.06l4.41-4.41-4.41-4.41a.75.75 0 0 1 0-1.06Z" fill="currentColor"/>
            </svg>
            <span class="admin-sr-only">Отменить редактирование суммы</span>
          </button>
        </div>`,
        editor: `<form
          class="admin-order-highlight-editor"
          id="${escapeHtmlAttribute(amountFormId)}"
          method="post"
          action="${ADMIN_ORDERS_PATH}"
          data-admin-order-amount-editor="${escapeHtmlAttribute(amountEditPanelId)}"
          ${autoOpenAmountEditor ? "" : "hidden"}
        >
          <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
          <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(detailReturnTo)}">
          <label class="admin-label admin-order-highlight-editor-field">
            Изменить сумму
            <input
              class="admin-input"
              type="text"
              name="totalPrice"
              value="${escapeHtmlAttribute(formatAdminOrderPriceInputValue(order.totalPrice))}"
              data-admin-reset-value="${escapeHtmlAttribute(formatAdminOrderPriceInputValue(order.totalPrice))}"
              inputmode="decimal"
              placeholder="180.00"
            >
          </label>
        </form>`,
      }
    );
    const teamHighlightCardMarkup = renderOrderSummaryCard("Команда", assignedSummaryLabel, {
      className: "admin-order-summary-card-team",
      tone: order.isAssigned ? "" : "danger",
      note: order.isAssigned ? "" : "Требуется назначение",
      actions: `<div class="admin-order-summary-card-actions">
        <button
          class="admin-icon-button admin-edit-button"
          type="button"
          aria-label="Изменить команду"
          title="Изменить команду"
          data-admin-order-team-open="${escapeHtmlAttribute(teamEditPanelId)}"
          data-admin-order-team-edit-trigger="${escapeHtmlAttribute(teamEditPanelId)}"
        >
          ${renderAdminEditIcon("Изменить команду")}
        </button>
        <button
          class="admin-icon-button admin-confirm-button"
          type="submit"
          form="${escapeHtmlAttribute(teamFormId)}"
          aria-label="Сохранить команду"
          title="Сохранить команду"
          data-admin-order-team-action-for="${escapeHtmlAttribute(teamEditPanelId)}"
          hidden
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9.55 17.2 4.8 12.45a.75.75 0 1 1 1.06-1.06l3.69 3.69 8.59-8.58a.75.75 0 1 1 1.06 1.06l-9.12 9.11a.75.75 0 0 1-1.06 0Z" fill="currentColor"/>
          </svg>
          <span class="admin-sr-only">Сохранить команду</span>
        </button>
        <button
          class="admin-icon-button admin-close-button"
          type="button"
          aria-label="Отменить редактирование команды"
          title="Отменить"
          data-admin-order-team-cancel="${escapeHtmlAttribute(teamEditPanelId)}"
          data-admin-order-team-action-for="${escapeHtmlAttribute(teamEditPanelId)}"
          hidden
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6.53 5.47a.75.75 0 0 1 1.06 0L12 9.88l4.41-4.41a.75.75 0 1 1 1.06 1.06L13.06 10.94l4.41 4.41a.75.75 0 1 1-1.06 1.06L12 12l-4.41 4.41a.75.75 0 1 1-1.06-1.06l4.41-4.41-4.41-4.41a.75.75 0 0 1 0-1.06Z" fill="currentColor"/>
          </svg>
          <span class="admin-sr-only">Отменить редактирование команды</span>
        </button>
      </div>`,
      editor: `<form
        class="admin-order-highlight-editor"
        id="${escapeHtmlAttribute(teamFormId)}"
        method="post"
        action="${ADMIN_ORDERS_PATH}"
        data-admin-order-team-editor="${escapeHtmlAttribute(teamEditPanelId)}"
        hidden
      >
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
        <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(detailReturnTo)}">
        <div class="admin-label admin-order-highlight-editor-field">
          <span>Переназначить команду</span>
          ${renderOrderResponsibleSelect(order, { planningItem, staffRecords })}
        </div>
      </form>`,
    });
    const paymentHighlightCardTone =
      order.paymentStatus === "paid" ? "" : order.paymentStatus === "partial" ? "" : "danger";
    const paymentHighlightCardMarkup = renderOrderSummaryCard("Оплата", order.paymentStatusLabel, {
      tone: paymentHighlightCardTone,
      note: order.paymentMethod ? order.paymentMethodLabel : "Способ оплаты не выбран",
      actions: `<div class="admin-order-summary-card-actions">
        <button
          class="admin-icon-button admin-edit-button"
          type="button"
          aria-label="Изменить оплату"
          title="Изменить оплату"
          data-admin-order-payment-open="${escapeHtmlAttribute(paymentEditPanelId)}"
          data-admin-order-payment-edit-trigger="${escapeHtmlAttribute(paymentEditPanelId)}"
        >
          ${renderAdminEditIcon("Изменить оплату")}
        </button>
        <button
          class="admin-icon-button admin-confirm-button"
          type="submit"
          form="${escapeHtmlAttribute(paymentFormId)}"
          aria-label="Сохранить оплату"
          title="Сохранить оплату"
          data-admin-order-payment-action-for="${escapeHtmlAttribute(paymentEditPanelId)}"
          hidden
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9.55 17.2 4.8 12.45a.75.75 0 1 1 1.06-1.06l3.69 3.69 8.59-8.58a.75.75 0 1 1 1.06 1.06l-9.12 9.11a.75.75 0 0 1-1.06 0Z" fill="currentColor"/>
          </svg>
          <span class="admin-sr-only">Сохранить оплату</span>
        </button>
        <button
          class="admin-icon-button admin-close-button"
          type="button"
          aria-label="Отменить редактирование оплаты"
          title="Отменить"
          data-admin-order-payment-cancel="${escapeHtmlAttribute(paymentEditPanelId)}"
          data-admin-order-payment-action-for="${escapeHtmlAttribute(paymentEditPanelId)}"
          hidden
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6.53 5.47a.75.75 0 0 1 1.06 0L12 9.88l4.41-4.41a.75.75 0 1 1 1.06 1.06L13.06 10.94l4.41 4.41a.75.75 0 1 1-1.06 1.06L12 12l-4.41 4.41a.75.75 0 1 1-1.06-1.06l4.41-4.41-4.41-4.41a.75.75 0 0 1 0-1.06Z" fill="currentColor"/>
          </svg>
          <span class="admin-sr-only">Отменить редактирование оплаты</span>
        </button>
      </div>`,
      editor: `<form
        class="admin-order-highlight-editor"
        id="${escapeHtmlAttribute(paymentFormId)}"
        method="post"
        action="${ADMIN_ORDERS_PATH}"
        data-admin-order-payment-editor="${escapeHtmlAttribute(paymentEditPanelId)}"
        hidden
      >
        <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
        <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(detailReturnTo)}">
        <div class="admin-order-control-fields">
          <label class="admin-label admin-order-control-field">
            Статус оплаты
            <select class="admin-input" name="paymentStatus">
              <option value="unpaid"${order.paymentStatus === "unpaid" ? " selected" : ""}>Unpaid</option>
              <option value="partial"${order.paymentStatus === "partial" ? " selected" : ""}>Partial</option>
              <option value="paid"${order.paymentStatus === "paid" ? " selected" : ""}>Paid</option>
            </select>
          </label>
          <label class="admin-label admin-order-control-field">
            Способ оплаты
            <select class="admin-input" name="paymentMethod">
              <option value=""${!order.paymentMethod ? " selected" : ""}>Not set</option>
              <option value="cash"${order.paymentMethod === "cash" ? " selected" : ""}>Cash</option>
              <option value="zelle"${order.paymentMethod === "zelle" ? " selected" : ""}>Zelle</option>
              <option value="card"${order.paymentMethod === "card" ? " selected" : ""}>Card</option>
              <option value="invoice"${order.paymentMethod === "invoice" ? " selected" : ""}>Invoice</option>
            </select>
          </label>
        </div>
      </form>`,
    });

    return `<dialog class="admin-dialog admin-dialog-wide admin-dialog-orders" id="${escapeHtmlAttribute(dialogId)}"${autoOpenAttr}${closeHref ? ` data-admin-dialog-return-url="${escapeHtmlAttribute(closeHref)}"` : ""} aria-labelledby="${escapeHtmlAttribute(`${dialogId}-title`)}">
      <div class="admin-dialog-panel admin-order-dialog-panel">
        <div class="admin-dialog-head admin-dialog-hero">
          <div class="admin-dialog-hero-main">
            <span class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(titleLabel))}">${escapeHtml(getAdminClientAvatarInitials(titleLabel))}</span>
            <div class="admin-dialog-copy-block admin-dialog-hero-copy">
              <p class="admin-card-eyebrow">Заказ</p>
              <div class="admin-dialog-hero-title-block">
                <div class="admin-dialog-hero-title-row">
                  <h2 class="admin-dialog-title" id="${escapeHtmlAttribute(`${dialogId}-title`)}">${escapeHtml(titleLabel)}</h2>
                  <span class="admin-dialog-hero-title-status">${orderStatusBadgeMarkup}</span>
                </div>
                <p class="admin-dialog-hero-detail">${escapeHtml(contactLabel)}</p>
                <p class="admin-dialog-hero-detail admin-client-dialog-address">${escapeHtml(orderHeaderAddress)}</p>
              </div>
            </div>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        <div class="admin-order-dialog-layout">
          <div class="admin-order-dialog-main">
            <section class="admin-client-summary-panel admin-order-summary-panel">
              <div class="admin-order-summary-head">
                <div class="admin-order-summary-copy-block">
                  <div class="admin-inline-badge-row admin-order-summary-strip">${summaryStripBadges}</div>
                </div>
              </div>
              <div class="admin-client-metric-grid admin-client-metric-grid-dialog admin-order-summary-grid">
                ${amountHighlightCardMarkup}
                ${renderOrderSummaryCard("Дата и время", scheduleLabel, {
                  note: order.hasSchedule ? "Визит уже назначен" : "Нужно выбрать окно уборки",
                  tone: order.hasSchedule ? "default" : "danger",
                })}
                ${teamHighlightCardMarkup}
                ${paymentHighlightCardMarkup}
                ${renderOrderSummaryCard("Создан", createdLabel, {
                  note: "Дата создания заказа",
                  compact: true,
                })}
              </div>
            </section>
            ${renderAdminGhlSmsComposer({
              req: options.req,
              actionPath: ADMIN_ORDERS_PATH,
              targetType: "order",
              targetRef: order.id,
              targetFieldName: "entryId",
              targetFieldValue: order.id,
              returnTo: detailReturnTo,
              phone: order.customerPhone,
              contactId: order && order.entry ? order.entry.contactId : "",
              historyEntries: getEntrySmsHistoryEntries(order && order.entry ? order.entry : {}),
              leadConnectorConfigured: Boolean(options.leadConnectorConfigured),
              canEdit: options.canEdit,
              noticePrefix: "order",
              title: "SMS по заказу",
              description: "Быстрая отправка сообщения клиенту по этому заказу через Go High Level.",
            })}
            <section class="admin-order-section-card admin-order-quote-section">
              <div class="admin-subsection-head">
                <h3 class="admin-subsection-title">Поля из формы клиента</h3>
              </div>
              <div class="admin-order-quote-grid">
                ${quoteCards}
              </div>
            </section>
            ${cleanerReportSection}
          </div>
          <aside class="admin-order-dialog-side">
            <section class="admin-order-section-card admin-order-side-card">
              <div class="admin-subsection-head">
                <h3 class="admin-subsection-title">Управление заказом</h3>
              </div>
              <form class="admin-form-grid admin-order-control-form" id="${escapeHtmlAttribute(editFormId)}" method="post" action="${ADMIN_ORDERS_PATH}">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(dialogReturnTo)}">
                <div class="admin-order-control-fields">
                  <label class="admin-label admin-order-control-field">
                    Статус заказа
                    <select class="admin-input" name="orderStatus">
                      <option value="new"${order.orderStatus === "new" ? " selected" : ""}>Новые</option>
                      <option value="scheduled"${order.orderStatus === "scheduled" ? " selected" : ""}>Запланировано</option>
                      <option value="in-progress"${order.orderStatus === "in-progress" ? " selected" : ""}>В работе</option>
                      <option value="rescheduled"${order.orderStatus === "rescheduled" ? " selected" : ""}>Перенесено</option>
                      <option value="invoice-sent"${order.orderStatus === "invoice-sent" ? " selected" : ""}>Инвойс отправлен</option>
                      <option value="paid"${order.orderStatus === "paid" ? " selected" : ""}>Оплачено</option>
                      <option value="awaiting-review"${order.orderStatus === "awaiting-review" ? " selected" : ""}>Ждем отзыв</option>
                      <option value="completed"${order.orderStatus === "completed" ? " selected" : ""}>Завершено</option>
                      <option value="canceled"${order.orderStatus === "canceled" ? " selected" : ""}>Отменено</option>
                    </select>
                  </label>
                  ${renderAdminPickerField({
                    pickerType: "date",
                    fieldId: `${editFormId}-selected-date`,
                    label: "Дата уборки",
                    className: "admin-order-control-field",
                    name: "selectedDate",
                    displayValue: formatAdminOrderDateInputValue(order.selectedDate),
                    nativeValue: order.selectedDate,
                    placeholder: "04/15/2026",
                    pickerLabel: "Выбрать дату уборки",
                  })}
                  ${renderAdminPickerField({
                    pickerType: "time",
                    fieldId: `${editFormId}-selected-time`,
                    label: "Время уборки",
                    className: "admin-order-control-field",
                    name: "selectedTime",
                    displayValue: formatAdminOrderTimeInputValue(order.selectedTime),
                    nativeValue: order.selectedTime,
                    placeholder: "1:30 PM",
                    pickerLabel: "Выбрать время уборки",
                  })}
                  <label class="admin-label admin-order-control-field">
                    Повторяемость
                    <select class="admin-input" name="frequency">
                      <option value=""${!order.frequency ? " selected" : ""}>Not set</option>
                      <option value="weekly"${order.frequency === "weekly" ? " selected" : ""}>Weekly</option>
                      <option value="biweekly"${order.frequency === "biweekly" ? " selected" : ""}>Bi-weekly</option>
                      <option value="monthly"${order.frequency === "monthly" ? " selected" : ""}>Monthly</option>
                    </select>
                  </label>
                </div>
              </form>
              <div class="admin-order-action-row">
                <button class="admin-button admin-order-primary-action" type="submit" form="${escapeHtmlAttribute(editFormId)}">Сохранить заказ</button>
                ${renderAdminDialogCloseButton(dialogId)}
                ${canDelete
                  ? `<form class="admin-inline-actions admin-order-delete-form" method="post" action="${ADMIN_ORDERS_PATH}">
                      <input type="hidden" name="action" value="delete-order">
                      <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(dialogReturnTo)}">
                      ${renderAdminDeleteIconButton(
                        "Удалить заказ",
                        "Удалить этот тестовый заказ? Запись исчезнет из заказов, клиентов и заявок."
                      )}
                    </form>`
                  : ""}
              </div>
            </section>
            ${renderOrderPolicyAcceptancePanel(order, { canEdit: options.canEdit, returnTo: detailReturnTo })}
          </aside>
        </div>
      </div>
    </dialog>`;
  }

  return {
    renderAdminClientDetailDialog,
    renderOrderManagementDialog,
  };
}

module.exports = {
  createClientOrderDetailDialogs,
};
