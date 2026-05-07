"use strict";

function defaultNormalizeString(value, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!maxLength || normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength);
}

function createOrderManagementDialogBuilders(deps = {}) {
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
    getEntryCustomerSmsHistoryEntries,
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
    renderOrderServiceDurationInputs,
    renderOrderStatusBadge,
  } = deps;
  const normalizeString =
    typeof normalizeStringFromDeps === "function" ? normalizeStringFromDeps : defaultNormalizeString;

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

  function renderCleanerCommentLog(comments = [], fallbackComment = "") {
    const items = (Array.isArray(comments) ? comments : []).filter((comment) =>
      normalizeString(comment && comment.text, 1000)
    );
    const fallbackText = normalizeString(fallbackComment, 4000);
    const logItems = items.length
      ? items
      : fallbackText
        ? [
            {
              id: "legacy-cleaner-comment",
              text: fallbackText,
              authorName: "",
              createdAt: "",
            },
          ]
        : [];
    if (!logItems.length) return "";

    return `<div class="admin-order-cleaner-comment-log">
      ${logItems
        .map((comment, index) => {
          const text = normalizeString(comment && comment.text, 1000);
          const authorName = normalizeString(comment && comment.authorName, 120);
          const createdAt = normalizeString(comment && comment.createdAt, 80);
          const metaItems = [
            authorName || "Клинер",
            createdAt ? formatAdminDateTime(createdAt) : "",
          ].filter(Boolean);
          return `<article class="admin-order-cleaner-comment-item">
            <div class="admin-order-cleaner-comment-meta">
              <span>${escapeHtml(metaItems.join(" • ") || `Комментарий ${index + 1}`)}</span>
            </div>
            <div class="admin-order-cleaner-comment-copy">${formatOrderQuoteMultiline(text)}</div>
          </article>`;
        })
        .join("")}
    </div>`;
  }

  function renderOrderManagementDialog(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const staffRecords = Array.isArray(options.staffRecords) ? options.staffRecords : [];
    const canDelete = options.canDelete !== false;
    const canEdit = options.canEdit !== false;
    const canScheduleNextOrder = canEdit && Boolean(order.frequency) && !order.recurringNextEntryId;
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
    const hasCleanerBeforePhotos = completionData.beforePhotos.length > 0;
    const hasCleanerAfterPhotos = completionData.afterPhotos.length > 0;
    const cleanerComments = Array.isArray(completionData.cleanerComments)
      ? completionData.cleanerComments
      : [];
    const hasCleanerComment = Boolean(completionData.cleanerComment) || cleanerComments.length > 0;
    const hasCleanerReport = hasCleanerBeforePhotos || hasCleanerAfterPhotos || hasCleanerComment;
    const cleanerMediaGalleries = [
      hasCleanerBeforePhotos
        ? renderOrderMediaGallery("Фото до", "", order.id, completionData.beforePhotos, "before")
        : "",
      hasCleanerAfterPhotos
        ? renderOrderMediaGallery("Фото после", "", order.id, completionData.afterPhotos, "after")
        : "",
    ]
      .filter(Boolean)
      .join("");
    const cleanerReportSection = hasCleanerReport
      ? `<section class="admin-order-section-card admin-order-cleaner-section">
        <div class="admin-subsection-head">
          <div>
            <h3 class="admin-subsection-title">Отчёт клинера</h3>
            <p class="admin-order-detail-copy">Готовый отчёт появляется после того, как клинер загрузил фото или оставил комментарий.</p>
          </div>
          <span
            class="admin-action-hint${completionUpdatedAtLabel ? "" : " admin-action-hint-hidden"}"
            data-admin-order-completion-updated-at
          >${completionUpdatedAtLabel ? `Обновлено ${escapeHtml(completionUpdatedAtLabel)}` : ""}</span>
        </div>
        <div class="admin-order-media-stack">
          ${cleanerMediaGalleries ? `<div class="admin-order-media-layout">${cleanerMediaGalleries}</div>` : ""}
          ${hasCleanerComment
            ? `<article class="admin-order-quote-card admin-order-quote-card-wide admin-order-cleaner-comment-view">
              <div class="admin-subsection-head">
                <h4 class="admin-subsection-title">Комментарии клинера</h4>
              </div>
              ${renderCleanerCommentLog(cleanerComments, completionData.cleanerComment)}
            </article>`
            : ""}
        </div>
      </section>`
      : "";
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
          data-admin-save-confirm="true"
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
        data-admin-save-confirm="true"
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
        data-admin-save-confirm="true"
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
              historyEntries: getEntryCustomerSmsHistoryEntries(order && order.entry ? order.entry : {}),
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
              <form class="admin-form-grid admin-order-control-form" id="${escapeHtmlAttribute(editFormId)}" method="post" action="${ADMIN_ORDERS_PATH}" data-admin-save-confirm="true">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(dialogReturnTo)}">
                <div class="admin-order-control-fields">
                  <label class="admin-label admin-order-control-field">
                    Статус заказа
                    <select class="admin-input" name="orderStatus">
                      <option value="new"${order.orderStatus === "new" ? " selected" : ""}>Новые</option>
                      <option value="scheduled"${order.orderStatus === "scheduled" ? " selected" : ""}>Запланировано</option>
                      <option value="en-route"${order.orderStatus === "en-route" ? " selected" : ""}>В пути</option>
                      <option value="rescheduled"${order.orderStatus === "rescheduled" ? " selected" : ""}>Перенесено</option>
                      <option value="cleaning-started"${order.orderStatus === "cleaning-started" ? " selected" : ""}>Начать уборку</option>
                      <option value="checklist"${order.orderStatus === "checklist" ? " selected" : ""}>Чеклист</option>
                      <option value="photos"${order.orderStatus === "photos" ? " selected" : ""}>Фото</option>
                      <option value="cleaning-complete"${order.orderStatus === "cleaning-complete" ? " selected" : ""}>Уборка завершена</option>
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
                  ${renderOrderServiceDurationInputs({
                    fieldPrefix: editFormId,
                    serviceDurationMinutes: order.serviceDurationMinutes,
                    serviceDurationLabel: order.serviceDurationLabel,
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
                ${canScheduleNextOrder
                  ? `<button
                      class="admin-button admin-button-secondary"
                      type="submit"
                      form="${escapeHtmlAttribute(editFormId)}"
                      name="action"
                      value="schedule-next-order"
                    >Запланировать следующий визит</button>`
                  : order.recurringNextEntryId
                    ? renderAdminBadge("Следующий визит уже создан", "outline")
                    : ""}
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
    renderOrderManagementDialog,
    renderOrderSummaryCard,
  };
}

module.exports = {
  createOrderManagementDialogBuilders,
};
