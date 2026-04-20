"use strict";

const { getEntryOrderCompletionData, getEntryOrderState } = require("../admin-order-state");
const { createClientsPageRenderer } = require("./pages/clients-page");
const { createClientOrderDetailDialogs } = require("./pages/client-order-detail-dialogs");
const { createDashboardPageRenderer } = require("./pages/dashboard-page");
const { createAdminGhlSmsComposerHelpers } = require("./pages/admin-ghl-sms-composer");
const { createOrdersPageRenderer } = require("./pages/orders-page");
const { createOrdersUiHelpers } = require("./pages/orders-ui");
const { createQuoteOpsHelpers } = require("./pages/quote-ops-helpers");
const { createQuoteOpsPageRenderer } = require("./pages/quote-ops-page");
const { createQuoteOpsUiHelpers } = require("./pages/quote-ops-ui");
const { createQuoteOpsRuntimeScripts } = require("./pages/quote-ops-runtime-scripts");
const { createSettingsChecklistHelpers } = require("./pages/settings-checklists");
const { createSettingsPageRenderer } = require("./pages/settings-page");
const { createSettingsUsersHelpers } = require("./pages/settings-users");
const { createSettingsUiHelpers } = require("./pages/settings-ui");
const { createStaffRuntimeScripts } = require("./pages/staff-runtime-scripts");
const { createStaffUiHelpers } = require("./pages/staff-ui");
const { createStaffPageRenderer } = require("./pages/staff-page");
const { createWorkspaceHelpers } = require("./pages/workspace-helpers");
const {
  formatW9FederalTaxClassificationLabel,
  formatW9TinTypeLabel,
} = require("../staff-w9");

function createAdminPageRenderers(deps = {}) {
  const {
    ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
    ADMIN_CLIENTS_PATH,
    ADMIN_GOOGLE_CALENDAR_CALLBACK_PATH,
    ADMIN_GOOGLE_MAIL_CONNECT_PATH,
    ADMIN_INTEGRATIONS_PATH,
    ADMIN_ORDERS_PATH,
    ADMIN_ROOT_PATH,
    ADMIN_RUNTIME_PATH,
    ADMIN_SETTINGS_PATH,
    ADMIN_STAFF_PATH,
    ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
    ADMIN_STAFF_W9_DOWNLOAD_PATH,
    ADMIN_STAFF_GOOGLE_CONNECT_PATH,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_QUOTE_OPS_RETRY_PATH,
    ASSIGNMENT_STATUS_VALUES,
    GOOGLE_PLACES_API_KEY,
    QUOTE_OPS_LEDGER_LIMIT,
    QUOTE_PUBLIC_PATH,
    STAFF_STATUS_VALUES,
    USER_ROLE_VALUES,
    USER_STATUS_VALUES,
    buildAdminRedirectPath,
    buildOrdersReturnPath,
    buildQuoteOpsReturnPath,
    buildStaffPlanningContext,
    collectAdminClientRecords,
    collectAdminOrderRecords,
    countOrdersByStatus,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterAdminClientRecords,
    filterAdminOrderRecords,
    filterQuoteOpsEntries,
    formatAdminCalendarDate,
    formatAdminClockTime,
    formatAdminDateTime,
    formatAdminOrderDateInputValue,
    formatAdminOrderPriceInputValue,
    formatAdminOrderTimeInputValue,
    formatAdminServiceLabel,
    formatAssignmentStatusLabel,
    formatCurrencyAmount,
    formatLeadStatusLabel,
    formatOrderCountLabel,
    formatStaffCountLabel,
    formatStaffStatusLabel,
    getAdminClientsFilters,
    getEntryAdminLeadData,
    getEntryLeadTasks,
    getEntryOpenLeadTask,
    getOrdersFilters,
    getQuoteOpsFilters,
    getLeadStatus,
    isOrderCreatedEntry,
    getRequestUrl,
    normalizeLeadStatus,
    normalizeOrderStatus,
    normalizeString,
    renderAssignmentStatusBadge,
    renderStaffStatusBadge,
    shared,
  } = deps;
  const {
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderAdminPropertyList,
  } = shared;
  const {
    formatWorkspaceRoleLabel,
    isEmployeeLinkedUser,
    isAdminLinkedUser,
    collectNonAssignableStaffIds,
    filterStaffSnapshotByHiddenStaffIds,
    inferWorkspaceRoleValue,
    getWorkspaceAccessContext,
    collectQuoteOpsManagerOptions,
  } = createWorkspaceHelpers({ normalizeString });
  const ORDER_QUOTE_SERVICE_LABELS = Object.freeze({
    ovenCleaning: "Oven Cleaning",
    refrigeratorCleaning: "Inside Refrigerator Cleaning",
    baseboardCleaning: "Baseboard Cleaning (whole house)",
    doorsCleaning: "Doors Cleaning",
    insideCabinets: "Inside Cabinets Cleaning",
    rangeHood: "Range hood",
    furniturePolishing: "Wood Furniture Polishing",
  });
  const ORDER_QUOTE_SERVICE_ALIASES = Object.freeze({
    ovencleaning: "ovenCleaning",
    insideoven: "ovenCleaning",
    insideovencleaning: "ovenCleaning",
    refrigeratorcleaning: "refrigeratorCleaning",
    insidefridge: "refrigeratorCleaning",
    insidefridgecleaning: "refrigeratorCleaning",
    fridge: "refrigeratorCleaning",
    fridgecleaning: "refrigeratorCleaning",
    baseboardcleaning: "baseboardCleaning",
    baseboards: "baseboardCleaning",
    doorscleaning: "doorsCleaning",
    doors: "doorsCleaning",
    insidecabinets: "insideCabinets",
    cabinets: "insideCabinets",
    rangehood: "rangeHood",
    furniturepolishing: "furniturePolishing",
    woodfurniturepolishing: "furniturePolishing",
  });
  const ORDER_QUOTE_QUANTITY_LABELS = Object.freeze({
    interiorWindowsCleaning: "Interior Windows Cleaning",
    blindsCleaning: "Blinds Cleaning",
    bedLinenChange: "Bed Linen / Sofa Cover Change",
  });
  const STAFF_COMPENSATION_OPTIONS = Object.freeze([
    { value: "fixed", label: "Фиксированная оплата" },
    { value: "percent", label: "Процент" },
  ]);
  const ADMIN_ORDER_SERVICE_OPTIONS = Object.freeze([
    { value: "standard", label: "Standard" },
    { value: "deep", label: "Deep" },
    { value: "move-in/out", label: "Move-in/out" },
  ]);
  const ADMIN_ORDER_FREQUENCY_OPTIONS = Object.freeze([
    { value: "weekly", label: "Weekly" },
    { value: "biweekly", label: "Bi-weekly" },
    { value: "monthly", label: "Monthly" },
  ]);
  const ADMIN_MANUAL_ORDER_DIALOG_ID = "admin-manual-order-create-dialog";
  const ORDER_QUOTE_SQUARE_FOOTAGE_LABELS = Object.freeze({
    0: "700 - 1,200 sq ft",
    1: "1,201 - 2,000 sq ft",
    2: "2,001 - 2,500 sq ft",
    3: "2,501 - 3,000 sq ft",
    4: "3,001 - 3,500 sq ft",
    5: "3,501 - 4,000 sq ft",
    6: "4,001 - 5,000 sq ft",
    7: "5,001+ sq ft",
    950: "700 - 1,200 sq ft",
    1600: "1,201 - 2,000 sq ft",
    2250: "2,001 - 2,500 sq ft",
    2750: "2,501 - 3,000 sq ft",
    3250: "3,001 - 3,500 sq ft",
    3750: "3,501 - 4,000 sq ft",
    4500: "4,001 - 5,000 sq ft",
    5500: "5,001+ sq ft",
    6500: "5,001+ sq ft",
  });
  const STAFF_TEAM_CALENDAR_PAST_DAYS = 31;
  const STAFF_TEAM_CALENDAR_FUTURE_DAYS = 31;
  const STAFF_TEAM_CALENDAR_DAYS = STAFF_TEAM_CALENDAR_PAST_DAYS + STAFF_TEAM_CALENDAR_FUTURE_DAYS + 1;
  const STAFF_TEAM_CALENDAR_TIME_ZONE = "America/Chicago";
  const DASHBOARD_NEW_REQUESTS_LIMIT = 8;
  const DASHBOARD_QUOTE_OPS_PAGE_LIMIT = Math.min(QUOTE_OPS_LEDGER_LIMIT, 120);
  const CLIENTS_QUOTE_OPS_PAGE_LIMIT = Math.min(QUOTE_OPS_LEDGER_LIMIT, 160);
  const STAFF_QUOTE_OPS_PAGE_LIMIT = Math.min(QUOTE_OPS_LEDGER_LIMIT, 120);
  const SETTINGS_QUOTE_OPS_PAGE_LIMIT = Math.min(QUOTE_OPS_LEDGER_LIMIT, 120);
  const QUOTE_OPS_PAGE_LEDGER_LIMIT = Math.min(QUOTE_OPS_LEDGER_LIMIT, 180);
  const CLIENT_ADDRESS_TYPE_OPTIONS = Object.freeze([
    { value: "house", label: "Дом" },
    { value: "apartment", label: "Квартира" },
    { value: "office", label: "Офис" },
    { value: "airbnb", label: "Airbnb" },
  ]);
  const CLIENT_ADDRESS_PET_OPTIONS = Object.freeze([
    { value: "none", label: "Нет" },
    { value: "cat", label: "Кошка" },
    { value: "dog", label: "Собака" },
  ]);
  const {
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
  } = createQuoteOpsHelpers({
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
  });
  const {
    renderStaffAddressAutocompleteScript,
    renderStaffTravelEstimateScript,
    renderStaffTeamCalendarDragScript,
  } = createStaffRuntimeScripts({
    GOOGLE_PLACES_API_KEY,
  });
  const { renderQuoteOpsFunnelScript } = createQuoteOpsRuntimeScripts({
    ADMIN_QUOTE_OPS_PATH,
  });
  const {
    getAdminSmsComposerState,
    getEntryAdminSmsData,
    getEntrySmsHistoryEntries,
    getClientSmsHistoryEntries,
    getStaffSmsHistoryEntries,
    formatAdminSmsHistorySourceLabel,
    getAdminSmsHistorySourceTone,
    formatAdminSmsHistoryDirectionLabel,
    formatAdminSmsHistoryCountLabel,
    renderAdminSmsHistoryItems,
    renderAdminSmsFeedback,
    renderAdminGhlSmsComposer,
  } = createAdminGhlSmsComposerHelpers({
    ADMIN_QUOTE_OPS_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminDateTime,
    formatAdminPhoneNumber,
    getRequestUrl,
    normalizeString,
    renderAdminBadge,
    renderAdminCard,
  });
  const {
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
    getStaffCalendarTodayDateValue,
    normalizeStaffCalendarDateValue,
    parseStaffCalendarDate,
    addDaysToStaffCalendarDate,
    buildStaffTeamCalendarWindow,
    formatStaffTeamCalendarRangeLabel,
    getStaffTeamCalendarStartDate,
    doesStaffTeamCalendarBlockCoverDay,
    renderStaffTeamCalendarAssignmentEntry,
    renderStaffTeamCalendarAvailabilityEntry,
    renderStaffTeamCalendarCell,
    renderStaffTeamCalendarTable,
    renderCreateStaffDialog,
    getStaffAssignmentDialogId,
    renderStaffAssignmentTableRow,
    renderStaffAssignmentDialog,
    renderStaffAssignmentsTable,
    renderStaffAssignmentDialogs,
    renderStaffTravelEstimateList,
    renderStaffTravelEstimateItem,
  } = createStaffUiHelpers({
    GOOGLE_PLACES_API_KEY,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_STAFF_CONTRACT_DOWNLOAD_PATH,
    ADMIN_STAFF_GOOGLE_CONNECT_PATH,
    ADMIN_STAFF_PATH,
    ADMIN_STAFF_W9_DOWNLOAD_PATH,
    ASSIGNMENT_STATUS_VALUES,
    STAFF_COMPENSATION_OPTIONS,
    STAFF_STATUS_VALUES,
    STAFF_TEAM_CALENDAR_DAYS,
    STAFF_TEAM_CALENDAR_FUTURE_DAYS,
    STAFF_TEAM_CALENDAR_PAST_DAYS,
    STAFF_TEAM_CALENDAR_TIME_ZONE,
    USER_ROLE_VALUES,
    buildAdminRedirectPath,
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
    isAdminLinkedUser,
    normalizeString,
    renderAdminBadge,
    renderAdminClientInfoGrid,
    renderAdminDeleteIconButton,
    renderAdminDialogCloseButton,
    renderAdminGhlSmsComposer,
    renderAdminPhoneInput,
    renderAdminPickerField,
    renderAdminSelectOptions,
    renderAdminToggleIconButton,
    renderAssignmentStatusBadge,
    renderQuoteOpsStatusBadge,
    renderStaffStatusBadge,
  });
  const {
    renderEmployeeToggleField,
    renderSettingsNotice,
    getSettingsSection,
    formatSettingsPlural,
    formatSettingsMetaCount,
  } = createSettingsUiHelpers({
    escapeHtml,
    getRequestUrl,
    normalizeString,
  });
  const { renderSettingsChecklistsTable, renderSettingsChecklistEditorScript } =
    createSettingsChecklistHelpers({
      ADMIN_SETTINGS_PATH,
      escapeHtml,
      escapeHtmlAttribute,
      escapeHtmlText,
      formatSettingsMetaCount,
      normalizeString,
      renderAdminBadge,
      renderAdminDialogCloseButton,
      renderAdminToggleIconButton,
    });
  const {
    buildSettingsRedirectPath,
    buildSettingsUsersRedirectPath,
    renderInviteEmailStatusCard,
    renderSettingsSectionNav,
    renderSettingsUsersSection,
  } = createSettingsUsersHelpers({
    ADMIN_GOOGLE_MAIL_CONNECT_PATH,
    ADMIN_SETTINGS_PATH,
    STAFF_STATUS_VALUES,
    USER_ROLE_VALUES,
    USER_STATUS_VALUES,
    buildAdminRedirectPath,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatAdminDateTime,
    formatAdminPhoneNumber,
    formatOrderCountLabel,
    formatSettingsMetaCount,
    formatStaffStatusLabel,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    isEmployeeLinkedUser,
    normalizeString,
    renderAdminBadge,
    renderAdminCard,
    renderAdminDeleteIconButton,
    renderAdminDialogCloseButton,
    renderAdminPhoneInput,
    renderEmployeeToggleField,
    renderStaffAddressField,
    renderStaffCompensationFields,
  });
  const {
    renderOrderStatusBadge,
    renderOrderPaymentStatusBadge,
    renderOrderPaymentMethodBadge,
    renderOrdersMetric,
    renderOrderSnapshot,
    renderCreateManualOrderForm,
    renderCreateManualOrderDialog,
    getOrderDialogId,
    getOrderAssignedLabel,
    parseOrderAssignedStaffNames,
    filterOrderAssignedStaffNames,
    getOrderResponsibleOptions,
    formatOrderAssignedStaffSummary,
    renderOrderResponsibleSelect,
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
    renderOrderPolicyAcceptancePanel,
    renderOrderServicePills,
    renderOrderTableRow,
    renderOrderEntryCard,
  } = createOrdersUiHelpers({
    ADMIN_MANUAL_ORDER_DIALOG_ID,
    ADMIN_ORDER_FREQUENCY_OPTIONS,
    ADMIN_ORDER_SERVICE_OPTIONS,
    ADMIN_ORDERS_PATH,
    ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
    ORDER_QUOTE_QUANTITY_LABELS,
    ORDER_QUOTE_SERVICE_ALIASES,
    ORDER_QUOTE_SERVICE_LABELS,
    ORDER_QUOTE_SQUARE_FOOTAGE_LABELS,
    buildOrdersReturnPath,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminCalendarDate,
    formatAdminClockTime,
    formatAdminDateTime,
    formatAdminOrderDateInputValue,
    formatAdminOrderTimeInputValue,
    formatAdminPhoneNumber,
    formatCurrencyAmount,
    formatStaffCountLabel,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getEntryOrderCompletionData,
    normalizeOrderStatus,
    normalizeString,
    renderAdminBadge,
    renderAdminDeleteIconButton,
    renderAdminDialogCloseButton,
    renderAdminEditIcon,
    renderAdminPhoneInput,
    renderAdminPickerField,
    renderAdminPropertyList,
    renderAdminSelectOptions,
    renderQuoteOpsStatusBadge,
    renderStaffAddressField,
  });
  const { renderAdminClientDetailDialog, renderOrderManagementDialog } =
    createClientOrderDetailDialogs({
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
      normalizeString,
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
    });
  const {
    renderQuoteOpsDiagnostics,
    renderQuoteOpsEntryCard,
    renderQuoteOpsSuccessTable,
    renderQuoteOpsDetailDialog,
    renderQuoteOpsWorkspaceStyle,
    renderQuoteOpsFunnelCard,
    renderQuoteOpsFunnelLane,
    renderQuoteOpsTaskResultDialog,
    renderQuoteOpsTaskTableRow,
    renderQuoteOpsDiscussionStageDialog,
    renderQuoteOpsLane,
  } = createQuoteOpsUiHelpers({
    ADMIN_ORDERS_PATH,
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_QUOTE_OPS_RETRY_PATH,
    ORDER_QUOTE_QUANTITY_LABELS,
    buildAdminRedirectPath,
    buildFormattedScheduleLabel,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatAdminDateTime,
    formatAdminDateTimeInputValue,
    formatAdminPhoneNumber,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    formatQuoteOpsEntryCountLabel,
    formatOrderQuoteBoolean,
    formatOrderQuoteDateValue,
    formatOrderQuoteFrequency,
    formatOrderQuoteMultiline,
    formatOrderQuotePetsLabel,
    formatOrderQuoteRequestedSlot,
    formatOrderQuoteServiceType,
    formatOrderQuoteSquareFootage,
    formatOrderQuoteText,
    formatOrderQuoteTimeValue,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getEntryAdminLeadData,
    getEntryLeadTasks,
    getEntryOpenLeadTask,
    getEntrySmsHistoryEntries,
    getLeadStatus,
    getOrderQuoteData,
    getOrderQuoteQuantityValue,
    getOrderQuoteSelectedServices,
    getQuoteLeadManager,
    getQuoteOpsDialogId,
    getQuoteOpsStatusMeta,
    isOrderCreatedEntry,
    normalizeString,
    renderAdminBadge,
    renderAdminCard,
    renderAdminClientDetailDialog,
    renderAdminClientInfoGrid,
    renderAdminDeleteIconButton,
    renderAdminDialogCloseButton,
    renderAdminGhlSmsComposer,
    renderAdminHiddenInput,
    renderLeadStatusBadge,
    renderOrderManagementDialog,
    renderOrderQuoteField,
    renderQuoteOpsCrmItem,
    renderQuoteOpsInfoItem,
    renderQuoteOpsManagerSelect,
    renderQuoteOpsStatusBadge,
  });


  async function getProjectedOrderRecords(adminRuntime = {}, allEntries = []) {
    const orderStore =
      adminRuntime && adminRuntime.orderStore && typeof adminRuntime.orderStore.getSnapshot === "function"
        ? adminRuntime.orderStore
        : null;
    if (!orderStore) {
      return collectAdminOrderRecords(allEntries);
    }

    if (typeof orderStore.replaceEntries === "function") {
      await orderStore.replaceEntries(allEntries, "admin-read-sync");
    }
    const snapshot = await orderStore.getSnapshot();
    return snapshot && Array.isArray(snapshot.orders) ? snapshot.orders : [];
  }

  function renderAdminClientStatusBadge(status) {
    const normalized = normalizeString(status, 32).toLowerCase();
    if (!normalized) return renderAdminBadge("Без статуса", "muted");
    return renderQuoteOpsStatusBadge(normalized);
  }

  function formatClientRequestCountLabel(count) {
    const normalized = Math.max(0, Number(count) || 0);
    const mod10 = normalized % 10;
    const mod100 = normalized % 100;

    if (mod10 === 1 && mod100 !== 11) return `${normalized} заявка`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${normalized} заявки`;
    return `${normalized} заявок`;
  }

  function formatClientAddressCountLabel(count) {
    const normalized = Math.max(0, Number(count) || 0);
    const mod10 = normalized % 10;
    const mod100 = normalized % 100;

    if (mod10 === 1 && mod100 !== 11) return `${normalized} адрес`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${normalized} адреса`;
    return `${normalized} адресов`;
  }

  function formatAdminClientAddressPropertyTypeLabel(value) {
    const normalized = normalizeString(value, 40).toLowerCase();
    if (normalized === "house") return "Дом";
    if (normalized === "apartment") return "Квартира";
    if (normalized === "office") return "Офис";
    if (normalized === "airbnb") return "Airbnb";
    return "Не указан";
  }

  function formatAdminClientAddressPetsLabel(value) {
    const normalized = normalizeString(value, 40).toLowerCase();
    if (normalized === "none") return "Нет";
    if (normalized === "cat") return "Кошка";
    if (normalized === "dog") return "Собака";
    return "Не указано";
  }

  function renderAdminSelectOptions(options = [], selectedValue = "", placeholder = "") {
    const normalizedSelectedValue = normalizeString(selectedValue, 80).toLowerCase();
    return [
      placeholder
        ? `<option value="">${escapeHtml(placeholder)}</option>`
        : "",
      ...options.map((option) => {
        const value = normalizeString(option && option.value, 80).toLowerCase();
        const label = normalizeString(option && option.label, 120) || value;
        return `<option value="${escapeHtmlAttribute(value)}"${value === normalizedSelectedValue ? " selected" : ""}>${escapeHtml(label)}</option>`;
      }),
    ].join("");
  }

  function formatAdminPhoneNumber(value) {
    const raw = normalizeString(value, 80);
    if (!raw) return "";

    let digits = raw.replace(/\D+/g, "");
    if (!digits) return "";

    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) {
      digits = digits.slice(0, 10);
    }

    if (digits.length !== 10) return "";
    return `+1(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  function formatAdminPhoneFieldValue(value) {
    const raw = normalizeString(value, 80);
    if (!raw) return "";
    let digits = raw.replace(/\D+/g, "");
    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) {
      digits = digits.slice(0, 10);
    }
    return digits.slice(0, 10);
  }

  function renderAdminPhoneInput(name, value = "", options = {}) {
    const fieldLabel = normalizeString(options.label, 80) || "Телефон";
    const autocomplete = normalizeString(options.autocomplete, 80) || "tel-national";
    const placeholder = normalizeString(options.placeholder, 40) || "6305550101";
    const inputValue = formatAdminPhoneFieldValue(value);
    const requiredAttr = options.required ? " required" : "";
    const onInputAttr = " oninput=\"this.value=this.value.replace(/\\D+/g,'').slice(0,10)\"";

    return `<label class="admin-label">
      ${escapeHtml(fieldLabel)}
      <input class="admin-input admin-phone-input" type="tel" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlText(inputValue)}" inputmode="numeric" autocomplete="${escapeHtmlAttribute(autocomplete)}" maxlength="10" placeholder="${escapeHtmlAttribute(placeholder)}"${onInputAttr}${requiredAttr}>
    </label>`;
  }


  function renderAdminHiddenInput(name, value) {
    const normalized = normalizeString(value, 250);
    if (!normalized) return "";
    return `<input type="hidden" name="${escapeHtmlAttribute(name)}" value="${escapeHtmlAttribute(normalized)}">`;
  }

  function renderAdminDeleteIconButton(label, confirmMessage) {
    const normalizedLabel = normalizeString(label, 120) || "Удалить";
    const normalizedConfirm = normalizeString(confirmMessage, 400);
    const confirmAttrs = ` data-admin-confirm="true" data-admin-confirm-title="Точно удалить?"${normalizedConfirm ? ` data-admin-confirm-message="${escapeHtmlAttribute(normalizedConfirm)}"` : ""}`;

    return `<button
      class="admin-icon-button admin-delete-button"
      type="button"
      aria-label="${escapeHtmlAttribute(normalizedLabel)}"
      title="${escapeHtmlAttribute(normalizedLabel)}"${confirmAttrs}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 3.75h6a1.25 1.25 0 0 1 1.25 1.25V6h3a.75.75 0 0 1 0 1.5h-1.02l-.78 10.64A2.25 2.25 0 0 1 15.2 20.25H8.8a2.25 2.25 0 0 1-2.24-2.11L5.78 7.5H4.75a.75.75 0 0 1 0-1.5h3V5A1.25 1.25 0 0 1 9 3.75Zm5.75 2.25V5.25H9.25V6h5.5Zm-6.69 1.5.74 10.53a.75.75 0 0 0 .75.72h5.9a.75.75 0 0 0 .75-.72l.74-10.53H8.06Zm2.19 2.25a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
      </svg>
      <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>
    </button>`;
  }

  function renderAdminClientAddressRemoveButton() {
    const label = "Удалить адрес";
    return `<button
      class="admin-icon-button admin-delete-button admin-client-address-remove-button"
      type="button"
      aria-label="${escapeHtmlAttribute(label)}"
      title="${escapeHtmlAttribute(label)}"
      data-admin-client-address-remove="true"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 3.75h6a1.25 1.25 0 0 1 1.25 1.25V6h3a.75.75 0 0 1 0 1.5h-1.02l-.78 10.64A2.25 2.25 0 0 1 15.2 20.25H8.8a2.25 2.25 0 0 1-2.24-2.11L5.78 7.5H4.75a.75.75 0 0 1 0-1.5h3V5A1.25 1.25 0 0 1 9 3.75Zm5.75 2.25V5.25H9.25V6h5.5Zm-6.69 1.5.74 10.53a.75.75 0 0 0 .75.72h5.9a.75.75 0 0 0 .75-.72l.74-10.53H8.06Zm2.19 2.25a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
      </svg>
      <span class="admin-sr-only">${escapeHtml(label)}</span>
    </button>`;
  }

  function renderAdminToggleIconButton(label, targetId, options = {}) {
    const normalizedLabel = normalizeString(label, 120) || "Открыть";
    const normalizedTargetId = normalizeString(targetId, 200);
    if (!normalizedTargetId) return "";
    const openLabel = normalizeString(options.openLabel, 120) || "Скрыть";
    const closedLabel = normalizeString(options.closedLabel, 120) || normalizedLabel;

    return `<button
      class="admin-icon-button admin-edit-button"
      type="button"
      aria-label="${escapeHtmlAttribute(normalizedLabel)}"
      title="${escapeHtmlAttribute(normalizedLabel)}"
      data-admin-toggle-icon="true"
      data-admin-toggle-target="${escapeHtmlAttribute(normalizedTargetId)}"
      data-admin-toggle-label-open="${escapeHtmlAttribute(openLabel)}"
      data-admin-toggle-label-closed="${escapeHtmlAttribute(closedLabel)}"
      aria-controls="${escapeHtmlAttribute(normalizedTargetId)}"
      aria-expanded="false"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M16.86 3.84a2.25 2.25 0 0 1 3.18 3.18l-9.9 9.9a3 3 0 0 1-1.33.79l-3.24.92a.75.75 0 0 1-.92-.92l.92-3.24a3 3 0 0 1 .79-1.33l9.9-9.9Zm2.12 1.06a.75.75 0 0 0-1.06 0l-1.05 1.06 2.12 2.12 1.05-1.06a.75.75 0 0 0 0-1.06L18.98 4.9Zm-3.17 2.12-8.79 8.79a1.5 1.5 0 0 0-.4.67l-.56 1.99 1.99-.56a1.5 1.5 0 0 0 .67-.4l8.79-8.79-2.12-2.12ZM4.5 20.25h15a.75.75 0 0 1 0 1.5h-15a.75.75 0 0 1 0-1.5Z" fill="currentColor"/>
      </svg>
      <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>
    </button>`;
  }

  function renderAdminEditIcon(label = "Редактировать") {
    const normalizedLabel = normalizeString(label, 120) || "Редактировать";

    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M16.86 3.84a2.25 2.25 0 0 1 3.18 3.18l-9.9 9.9a3 3 0 0 1-1.33.79l-3.24.92a.75.75 0 0 1-.92-.92l.92-3.24a3 3 0 0 1 .79-1.33l9.9-9.9Zm2.12 1.06a.75.75 0 0 0-1.06 0l-1.05 1.06 2.12 2.12 1.05-1.06a.75.75 0 0 0 0-1.06L18.98 4.9Zm-3.17 2.12-8.79 8.79a1.5 1.5 0 0 0-.4.67l-.56 1.99 1.99-.56a1.5 1.5 0 0 0 .67-.4l8.79-8.79-2.12-2.12ZM4.5 20.25h15a.75.75 0 0 1 0 1.5h-15a.75.75 0 0 1 0-1.5Z" fill="currentColor"/>
    </svg>
    <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>`;
  }

  function renderAdminCloseIcon(label = "Закрыть") {
    const normalizedLabel = normalizeString(label, 120) || "Закрыть";

    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.53 5.47a.75.75 0 0 1 1.06 0L12 9.88l4.41-4.41a.75.75 0 1 1 1.06 1.06L13.06 10.94l4.41 4.41a.75.75 0 1 1-1.06 1.06L12 12l-4.41 4.41a.75.75 0 1 1-1.06-1.06l4.41-4.41-4.41-4.41a.75.75 0 0 1 0-1.06Z" fill="currentColor"/>
    </svg>
    <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>`;
  }

  function renderAdminDialogCloseButton(dialogId, label = "Закрыть") {
    const normalizedDialogId = normalizeString(dialogId, 200);
    const normalizedLabel = normalizeString(label, 120) || "Закрыть";
    if (!normalizedDialogId) return "";

    return `<button
      class="admin-icon-button admin-close-button"
      type="button"
      aria-label="${escapeHtmlAttribute(normalizedLabel)}"
      title="${escapeHtmlAttribute(normalizedLabel)}"
      data-admin-dialog-close="${escapeHtmlAttribute(normalizedDialogId)}"
    >
      ${renderAdminCloseIcon(normalizedLabel)}
    </button>`;
  }

  function renderAdminCalendarIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.75 2.75a.75.75 0 0 1 .75.75V5h7V3.5a.75.75 0 0 1 1.5 0V5h.75A2.75 2.75 0 0 1 20.5 7.75v9.5A2.75 2.75 0 0 1 17.75 20h-11A2.75 2.75 0 0 1 4 17.25v-9.5A2.75 2.75 0 0 1 6.75 5h.75V3.5a.75.75 0 0 1 .75-.75ZM5.5 9.5v7.75c0 .69.56 1.25 1.25 1.25h11c.69 0 1.25-.56 1.25-1.25V9.5h-13Zm1.25-3A1.25 1.25 0 0 0 5.5 7.75V8h13v-.25c0-.69-.56-1.25-1.25-1.25h-.75V8a.75.75 0 0 1-1.5 0V6.5h-7V8a.75.75 0 0 1-1.5 0V6.5h-.75Z" fill="currentColor"/>
    </svg>`;
  }

  function renderAdminClockIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3.25a8.75 8.75 0 1 1 0 17.5 8.75 8.75 0 0 1 0-17.5Zm0 1.5a7.25 7.25 0 1 0 0 14.5 7.25 7.25 0 0 0 0-14.5Zm0 2.5a.75.75 0 0 1 .75.75v3.69l2.47 1.43a.75.75 0 0 1-.75 1.3l-2.85-1.64a.75.75 0 0 1-.37-.65V8a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
    </svg>`;
  }

  function renderAdminPickerField(config = {}) {
    const pickerType = normalizeString(config.pickerType, 16).toLowerCase() === "time" ? "time" : "date";
    const fieldId = normalizeString(config.fieldId, 200) || `admin-picker-${pickerType}`;
    const nativeId = `${fieldId}-native`;
    const label = normalizeString(config.label, 120);
    const extraClassName = normalizeString(config.className, 160);
    const inputName = normalizeString(config.name, 80);
    const displayValue = normalizeString(config.displayValue, 64);
    const nativeValue = normalizeString(config.nativeValue, 32);
    const placeholder = normalizeString(config.placeholder, 40);
    const pickerLabel =
      normalizeString(config.pickerLabel, 120) || (pickerType === "time" ? "Выбрать время" : "Выбрать дату");
    const inputModeAttr = pickerType === "date" ? ' inputmode="numeric"' : "";
    const nativeAttrs = pickerType === "time" ? ' step="60"' : "";
    const iconMarkup = pickerType === "time" ? renderAdminClockIcon() : renderAdminCalendarIcon();
    const labelClassName = extraClassName ? `admin-label ${escapeHtmlAttribute(extraClassName)}` : "admin-label";
    const timePanelMarkup =
      pickerType === "time"
        ? `<div class="admin-time-picker-panel" data-admin-time-panel hidden>
            <div class="admin-time-picker-grid">
              <label class="admin-time-picker-cell">
                <span class="admin-time-picker-label">Hour</span>
                <select class="admin-input admin-time-picker-select" data-admin-time-hour>
                  ${Array.from({ length: 12 }, (_, index) => {
                    const hour = String(index + 1);
                    return `<option value="${hour}">${hour}</option>`;
                  }).join("")}
                </select>
              </label>
              <label class="admin-time-picker-cell">
                <span class="admin-time-picker-label">Minute</span>
                <select class="admin-input admin-time-picker-select" data-admin-time-minute>
                  ${Array.from({ length: 60 }, (_, index) => {
                    const minute = String(index).padStart(2, "0");
                    return `<option value="${minute}">${minute}</option>`;
                  }).join("")}
                </select>
              </label>
              <label class="admin-time-picker-cell">
                <span class="admin-time-picker-label">AM/PM</span>
                <select class="admin-input admin-time-picker-select" data-admin-time-meridiem>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </label>
            </div>
          </div>`
        : "";

    return `<label class="${labelClassName}">
      ${escapeHtml(label)}
      <div class="admin-picker-field" data-admin-picker-field="${escapeHtmlAttribute(pickerType)}">
        <input
          class="admin-input admin-picker-display"
          type="text"
          name="${escapeHtmlAttribute(inputName)}"
          value="${escapeHtmlAttribute(displayValue)}"
          placeholder="${escapeHtmlAttribute(placeholder)}"
          autocomplete="off"
          data-admin-picker-display="${escapeHtmlAttribute(pickerType)}"
          id="${escapeHtmlAttribute(fieldId)}"${inputModeAttr}
        >
        <input
          class="admin-picker-native"
          type="${escapeHtmlAttribute(pickerType)}"
          value="${escapeHtmlAttribute(nativeValue)}"
          tabindex="-1"
          aria-hidden="true"
          data-admin-picker-native="${escapeHtmlAttribute(pickerType)}"
          id="${escapeHtmlAttribute(nativeId)}"${nativeAttrs}
        >
        <button
          class="admin-picker-trigger"
          type="button"
          data-admin-picker-trigger="${escapeHtmlAttribute(pickerType)}"
          aria-label="${escapeHtmlAttribute(pickerLabel)}"
          title="${escapeHtmlAttribute(pickerLabel)}"
          aria-controls="${escapeHtmlAttribute(nativeId)}"${pickerType === "time" ? ' aria-expanded="false"' : ""}
        >
          ${iconMarkup}
        </button>
        ${timePanelMarkup}
      </div>
    </label>`;
  }

  function getAdminClientAvatarInitials(value) {
    const normalized = normalizeString(value, 120);
    if (!normalized) return "?";
    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  }

  function getAdminClientAvatarToneClass(value) {
    const normalized = normalizeString(value, 250);
    let hash = 0;
    for (const character of normalized) {
      hash = (hash + character.charCodeAt(0)) % 5;
    }
    return `admin-client-avatar-tone-${hash + 1}`;
  }

  function renderAdminClientInfoGrid(items = [], options = {}) {
    const className = [
      "admin-client-info-grid",
      options.compact ? "admin-client-info-grid-compact" : "",
      options.columns === 3 ? "admin-client-info-grid-three" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `<div class="${className}">
      ${items
        .map((item) => {
          const itemClassName = item.wide
            ? "admin-client-info-card admin-client-info-card-wide"
            : "admin-client-info-card";
          const valueMarkup = item.raw ? item.value : escapeHtml(item.value);
          return `<article class="${itemClassName}">
            <span class="admin-client-info-label">${escapeHtml(item.label)}</span>
            <p class="admin-client-info-value">${valueMarkup}</p>
            ${item.hint ? `<p class="admin-client-info-hint">${item.raw ? item.hint : escapeHtml(item.hint)}</p>` : ""}
          </article>`;
        })
        .join("")}
    </div>`;
  }

  function renderAdminClientAddressPreview(client) {
    const addresses = Array.isArray(client && client.addresses)
      ? client.addresses
        .map((addressRecord) => normalizeString(addressRecord && addressRecord.address, 500))
        .filter(Boolean)
      : [];

    if (addresses.length === 0 && client && client.address) {
      addresses.push(normalizeString(client.address, 500));
    }

    if (addresses.length === 0) {
      return `<span class="admin-table-muted">Не указан</span>`;
    }

    const visibleAddresses = addresses.slice(0, 3);
    const hiddenCount = Math.max(0, addresses.length - visibleAddresses.length);
    const hiddenTitle = hiddenCount > 0
      ? `Ещё ${hiddenCount} ${formatClientAddressCountLabel(hiddenCount)}`
      : "";

    return `<div class="admin-client-address-preview-list">
      ${visibleAddresses
        .map((address) => `<span class="admin-client-address-preview-item">${escapeHtml(address)}</span>`)
        .join("")}
      ${hiddenCount > 0
        ? `<span class="admin-client-address-preview-more" title="${escapeHtmlAttribute(hiddenTitle)}">+${escapeHtml(String(hiddenCount))}</span>`
        : ""}
    </div>`;
  }

  function renderClientsNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "client-saved") {
      return `<div class="admin-alert admin-alert-info">Карточка клиента обновлена.</div>`;
    }
    if (notice === "client-deleted") {
      return `<div class="admin-alert admin-alert-info">Клиент и его заявки удалены.</div>`;
    }
    if (notice === "client-missing") {
      return `<div class="admin-alert admin-alert-error">Клиент не найден.</div>`;
    }
    if (notice === "client-save-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить клиента. Попробуйте ещё раз.</div>`;
    }
    if (notice === "client-delete-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось удалить клиента. Попробуйте ещё раз.</div>`;
    }
    if (notice === "client-sms-sent") {
      return `<div class="admin-alert admin-alert-info">SMS клиенту отправлена через Go High Level.</div>`;
    }
    if (notice === "client-sms-empty") {
      return `<div class="admin-alert admin-alert-error">Введите текст сообщения перед отправкой SMS.</div>`;
    }
    if (notice === "client-sms-unavailable") {
      return `<div class="admin-alert admin-alert-error">Go High Level сейчас не настроен для отправки SMS.</div>`;
    }
    if (notice === "client-sms-contact-missing" || notice === "client-sms-failed") {
      const smsError = normalizeString(reqUrl.searchParams.get("smsError"), 240);
      return `<div class="admin-alert admin-alert-error">${escapeHtml(smsError || "Не удалось отправить SMS клиенту.")}</div>`;
    }
    return "";
  }


  const renderClientsPage = createClientsPageRenderer({
    ADMIN_CLIENTS_PATH,
    CLIENTS_QUOTE_OPS_PAGE_LIMIT,
    buildAdminRedirectPath,
    buildStaffPlanningContext,
    collectAdminClientRecords,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterAdminClientRecords,
    formatAdminDateTime,
    formatAdminPhoneNumber,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    formatClientRequestCountLabel,
    getAdminClientAvatarInitials,
    getAdminClientAvatarToneClass,
    getAdminClientsFilters,
    getWorkspaceAccessContext,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminClientAddressPreview,
    renderAdminClientDetailDialog,
    renderAdminClientStatusBadge,
    renderAdminHiddenInput,
    renderAdminLayout,
    renderClientsNotice,
    renderStaffAddressAutocompleteScript,
  });

  const renderDashboardPage = createDashboardPageRenderer({
    ADMIN_QUOTE_OPS_PATH,
    ADMIN_ROOT_PATH,
    DASHBOARD_NEW_REQUESTS_LIMIT,
    DASHBOARD_QUOTE_OPS_PAGE_LIMIT,
    STAFF_TEAM_CALENDAR_TIME_ZONE,
    buildFormattedScheduleLabel,
    buildQuoteOpsTaskRecords,
    buildStaffPlanningContext,
    collectAdminClientRecords,
    collectNonAssignableStaffIds,
    collectQuoteOpsManagerOptions,
    escapeHtml,
    escapeHtmlAttribute,
    filterStaffSnapshotByHiddenStaffIds,
    formatAdminDateTime,
    formatAdminPhoneNumber,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    getProjectedOrderRecords,
    getQuoteOpsDialogId,
    getWorkspaceAccessContext,
    isOrderCreatedEntry,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderLeadStatusBadge,
    renderOrderManagementDialog,
    renderOrderTableRow,
    renderQuoteOpsDetailDialog,
    renderQuoteOpsStatusBadge,
    renderQuoteOpsTaskResultDialog,
    renderQuoteOpsWorkspaceStyle,
  });


  const renderOrdersPage = createOrdersPageRenderer({
    ADMIN_MANUAL_ORDER_DIALOG_ID,
    ADMIN_ORDERS_PATH,
    QUOTE_OPS_LEDGER_LIMIT,
    buildAdminRedirectPath,
    buildStaffPlanningContext,
    collectNonAssignableStaffIds,
    countOrdersByStatus,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterAdminOrderRecords,
    filterOrderAssignedStaffNames,
    filterStaffSnapshotByHiddenStaffIds,
    formatCurrencyAmount,
    getOrderAssignedLabel,
    getOrderDialogId,
    getOrdersFilters,
    getProjectedOrderRecords,
    getRequestUrl,
    getWorkspaceAccessContext,
    normalizeOrderStatus,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminHiddenInput,
    renderAdminLayout,
    renderCreateManualOrderDialog,
    renderOrderManagementDialog,
    renderOrderPaymentStatusBadge,
    renderOrderStatusBadge,
    renderOrderTableRow,
    renderQuoteOpsStatusBadge,
  });


  const renderStaffPage = createStaffPageRenderer({
    ADMIN_STAFF_PATH,
    STAFF_QUOTE_OPS_PAGE_LIMIT,
    buildStaffPlanningContext,
    collectNonAssignableStaffIds,
    filterStaffSnapshotByHiddenStaffIds,
    getRequestUrl,
    getStaffSection,
    getStaffTeamCalendarStartDate,
    getWorkspaceAccessContext,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminCard,
    renderAdminLayout,
    renderStaffAddressAutocompleteScript,
    renderStaffAssignmentDialogs,
    renderStaffAssignmentsTable,
    renderStaffNotice,
    renderStaffOverviewStrip,
    renderStaffSectionNav,
    renderStaffSummaryTable,
    renderStaffTeamCalendarDragScript,
    renderStaffTeamCalendarTable,
    renderStaffTravelEstimateScript,
  });


  const renderSettingsPage = createSettingsPageRenderer({
    ADMIN_SETTINGS_PATH,
    SETTINGS_QUOTE_OPS_PAGE_LIMIT,
    buildStaffPlanningContext,
    getRequestUrl,
    getSettingsSection,
    getWorkspaceAccessContext,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminCard,
    renderAdminLayout,
    renderInviteEmailStatusCard,
    renderSettingsChecklistsTable,
    renderSettingsChecklistEditorScript,
    renderSettingsNotice,
    renderSettingsSectionNav,
    renderSettingsUsersSection,
    renderStaffAddressAutocompleteScript,
  });


  const renderQuoteOpsPage = createQuoteOpsPageRenderer({
    ADMIN_QUOTE_OPS_PATH,
    QUOTE_OPS_PAGE_LEDGER_LIMIT,
    buildAdminRedirectPath,
    buildQuoteOpsTaskRecords,
    collectQuoteOpsManagerOptions,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterQuoteOpsEntries,
    getLeadStatus,
    getQuoteOpsFilters,
    getWorkspaceAccessContext,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminHiddenInput,
    renderAdminLayout,
    renderQuoteOpsDetailDialog,
    renderQuoteOpsDiscussionStageDialog,
    renderQuoteOpsFunnelLane,
    renderQuoteOpsFunnelScript,
    renderQuoteOpsLane,
    renderQuoteOpsNotice,
    renderQuoteOpsOverviewStrip,
    renderQuoteOpsSectionNav,
    renderQuoteOpsTaskResultDialog,
    renderQuoteOpsTaskTableRow,
    renderQuoteOpsWorkspaceStyle,
  });

  function renderIntegrationsPage(req, config, adminRuntime = {}) {
    const accessContext = getWorkspaceAccessContext(adminRuntime);
    return renderAdminLayout(
      "Раздел скрыт",
      `${renderAdminCard(
          "Раздел скрыт",
          "Этот технический раздел скрыт из интерфейса.",
          `<div class="admin-alert admin-alert-info">Вернитесь в основные рабочие разделы админки.</div>`,
          { eyebrow: "Инфо", muted: true }
        )}`,
      {
        kicker: "SHYNLI CLEANING",
        subtitle: "Технические разделы скрыты.",
        sidebar: renderAdminAppSidebar(ADMIN_ROOT_PATH, accessContext),
      }
    );
  }

  function renderRuntimePage(req, config, adminRuntime = {}) {
    return renderIntegrationsPage(req, config, adminRuntime);
  }

  async function renderAdminAppPage(route, req, config, adminRuntime = {}, quoteOpsLedger = null, staffStore = null) {
    if (route === ADMIN_ROOT_PATH) return renderDashboardPage(req, config, quoteOpsLedger, adminRuntime);
    if (route === ADMIN_CLIENTS_PATH) return renderClientsPage(req, config, quoteOpsLedger, staffStore, adminRuntime);
    if (route === ADMIN_ORDERS_PATH) return renderOrdersPage(req, config, quoteOpsLedger, staffStore, adminRuntime);
    if (route === ADMIN_STAFF_PATH) return renderStaffPage(req, config, quoteOpsLedger, staffStore, adminRuntime);
    if (route === ADMIN_SETTINGS_PATH) {
      return renderSettingsPage(req, config, adminRuntime.settingsStore, adminRuntime.usersStore, staffStore, quoteOpsLedger, adminRuntime);
    }
    if (route === ADMIN_QUOTE_OPS_PATH) return renderQuoteOpsPage(req, config, quoteOpsLedger, adminRuntime, staffStore);
    if (route === ADMIN_INTEGRATIONS_PATH) return renderDashboardPage(req, config, quoteOpsLedger, adminRuntime);
    if (route === ADMIN_RUNTIME_PATH) return renderDashboardPage(req, config, quoteOpsLedger, adminRuntime);
    return renderDashboardPage(req, config, quoteOpsLedger, adminRuntime);
  }

  return {
    buildSettingsRedirectPath,
    buildSettingsUsersRedirectPath,
    renderAdminAppPage,
    renderDashboardPage,
    renderIntegrationsPage,
    renderLoginPage: shared.renderLoginPage,
    renderOrdersPage,
    renderQuoteOpsPage,
    renderRuntimePage,
    renderSettingsPage,
    renderStaffPage,
    renderTwoFactorPage: shared.renderTwoFactorPage,
    renderAdminLayout,
    renderAdminUnavailablePage: shared.renderAdminUnavailablePage,
  };
}

module.exports = {
  createAdminPageRenderers,
};
