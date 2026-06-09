"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAccountRenderers } = require("../lib/account/render");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createRenderers() {
  return createAccountRenderers({
    ACCOUNT_CONTRACT_DOWNLOAD_PATH: "/account/contract",
    ACCOUNT_W9_DOWNLOAD_PATH: "/account/w9",
    ACCOUNT_GOOGLE_CALENDAR_CONNECT_PATH: "/account/calendar/connect",
    ACCOUNT_LOGIN_PATH: "/account/login",
    ACCOUNT_LOGOUT_PATH: "/account/logout",
    ACCOUNT_ROOT_PATH: "/account",
    GOOGLE_TAG_MANAGER_CONTAINER_ID: "",
    escapeHtml,
    escapeHtmlAttribute: escapeHtml,
    escapeHtmlText: escapeHtml,
    formatAdminDateTime: (value) => value || "Не указано",
    formatAdminServiceLabel: (value) => value || "Regular",
    formatCurrencyAmount: (value) => `$${Number(value || 0).toFixed(2)}`,
    formatOrderCountLabel: (value) => `${value} заказов`,
    normalizeString: (value, maxLength = 0) => {
      const normalized = String(value == null ? "" : value).trim();
      return maxLength && normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
    },
    renderStaffStatusBadge: (status) => `<span>${escapeHtml(status || "")}</span>`,
    shared: {
      renderAdminBadge: (label, tone = "default") =>
        `<span class="admin-badge admin-badge-${escapeHtml(tone)}">${escapeHtml(label)}</span>`,
      renderAdminCard: (title, description, body) =>
        `<section data-card-title="${escapeHtml(title)}"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>${body}</section>`,
      renderAdminLayout: (title, content, options = {}) =>
        `<main data-layout-title="${escapeHtml(title)}">${options.sidebar || ""}${content}</main>${options.bodyScripts || ""}`,
      renderAdminPropertyList: (rows = []) =>
        `<dl>${rows.map((row) => `<dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd>`).join("")}</dl>`,
    },
  });
}

function buildCleanerConfirmation(date, time, address, serviceName, status = "confirmed") {
  return {
    signature: [date, time, address, serviceName].join("|"),
    byStaffId: {
      "staff-1": {
        status,
        respondedAt: "2099-01-01T12:00:00.000Z",
      },
    },
    updatedAt: "2099-01-01T12:00:00.000Z",
  };
}

function buildOrder({
  id,
  customerName,
  status = "scheduled",
  scheduleDate,
  scheduleTime = "09:00",
  updatedAt,
  confirmed = false,
  quoteData = null,
}) {
  const address = `${customerName} Address`;
  const serviceName = "Regular";
  const adminOrder = {
    status,
    selectedDate: scheduleDate,
    selectedTime: scheduleTime,
    updatedAt,
    createdAt: updatedAt,
  };
  if (confirmed) {
    adminOrder.cleanerConfirmation = buildCleanerConfirmation(scheduleDate, scheduleTime, address, serviceName);
  }

  const payloadForRetry = { adminOrder };
  if (quoteData && typeof quoteData === "object") {
    payloadForRetry.calculatorData = quoteData;
  }

  return {
    entry: {
      id,
      requestId: id,
      status: "success",
      customerName,
      customerPhone: "3125550101",
      fullAddress: address,
      serviceName,
      createdAt: updatedAt,
      updatedAt,
      selectedDate: scheduleDate,
      selectedTime: scheduleTime,
      payloadForRetry,
    },
    assignment: {
      entryId: id,
      staffIds: ["staff-1"],
      scheduleDate,
      scheduleTime,
      status: "confirmed",
      notes: "",
    },
    assignedStaff: [{ id: "staff-1", name: "Ariana Cleaner" }],
    missingStaffIds: [],
    scheduleDate,
    scheduleTime,
    hasSchedule: true,
    scheduleTimestamp: Date.parse(`${scheduleDate}T${scheduleTime}:00Z`),
    scheduleLabel: `${scheduleDate} ${scheduleTime}`,
    serviceDurationMinutes: 120,
    serviceDurationLabel: "2 hours",
    assignmentStatus: "confirmed",
    completion: {
      checklistItems: [],
      beforePhotos: [],
      afterPhotos: [],
      photosSkipped: false,
    },
  };
}

function getDesktopCard(html, title) {
  const marker = `data-card-title="${title}"`;
  const startIndex = html.indexOf(marker);
  assert.notEqual(startIndex, -1, `Expected card ${title}`);
  const nextIndex = html.indexOf("data-card-title=", startIndex + marker.length);
  return html.slice(startIndex, nextIndex === -1 ? html.length : nextIndex);
}

function getMobileFocusCard(html) {
  const marker = `class="account-mobile-focus-card`;
  const startIndex = html.indexOf(marker);
  assert.notEqual(startIndex, -1, "Expected mobile focus card");
  const nextIndex = html.indexOf(`<div class="account-mobile-section">`, startIndex);
  return html.slice(startIndex, nextIndex === -1 ? html.length : nextIndex);
}

function getMobileOrdersSection(html) {
  const startIndex = html.indexOf("<h3>Мои заказы</h3>");
  assert.notEqual(startIndex, -1, "Expected mobile orders section");
  const completedIndex = html.indexOf("<h3>Выполненные заказы</h3>", startIndex);
  const detailIndex = html.indexOf(`class="account-mobile-detail-view"`, startIndex);
  const candidates = [completedIndex, detailIndex].filter((index) => index > startIndex);
  const endIndex = candidates.length ? Math.min(...candidates) : html.length;
  return html.slice(startIndex, endIndex);
}

function getMobileCalendarSection(html) {
  const startIndex = html.indexOf('class="account-mobile-calendar"');
  assert.notEqual(startIndex, -1, "Expected mobile calendar section");
  const detailIndex = html.indexOf('class="account-mobile-detail-view"', startIndex);
  const desktopIndex = html.indexOf('<div class="account-desktop-stats">', startIndex);
  const candidates = [detailIndex, desktopIndex].filter((index) => index > startIndex);
  const endIndex = candidates.length ? Math.min(...candidates) : html.length;
  return html.slice(startIndex, endIndex);
}

function getMobileDetailView(html, detailId) {
  const idIndex = html.indexOf(`id="${detailId}"`);
  assert.notEqual(idIndex, -1, `Expected mobile detail view ${detailId}`);
  const startIndex = html.lastIndexOf("<section", idIndex);
  assert.notEqual(startIndex, -1, `Expected section start for ${detailId}`);
  let depth = 0;
  let cursor = startIndex;
  const tagPattern = /<\/?section\b[^>]*>/g;
  tagPattern.lastIndex = startIndex;

  while (true) {
    const match = tagPattern.exec(html);
    assert.ok(match, `Expected section end for ${detailId}`);
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        cursor = tagPattern.lastIndex;
        break;
      }
    } else {
      depth += 1;
    }
  }

  return html.slice(startIndex, cursor);
}

test("renders active cleaner orders first and moves completed orders into history", () => {
  const renderers = createRenderers();
  const html = renderers.renderDashboardPage({
    user: {
      id: "user-1",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      staffId: "staff-1",
      role: "cleaner",
    },
    staffRecord: {
      id: "staff-1",
      name: "Ariana Cleaner",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      status: "active",
      w9: { document: { relativePath: "w9.pdf" } },
      contract: { document: { relativePath: "contract.pdf" } },
    },
    staffSummary: null,
    assignedOrders: [
      buildOrder({
        id: "completed-order",
        customerName: "Completed Client",
        status: "completed",
        scheduleDate: "2099-01-08",
        updatedAt: "2099-01-02T12:00:00.000Z",
        confirmed: true,
      }),
      buildOrder({
        id: "confirmed-active-order",
        customerName: "Confirmed Active Client",
        scheduleDate: "2099-01-05",
        updatedAt: "2099-01-03T12:00:00.000Z",
        confirmed: true,
      }),
      buildOrder({
        id: "new-pending-order",
        customerName: "Newest Pending Client",
        scheduleDate: "2099-02-10",
        updatedAt: "2099-01-04T12:00:00.000Z",
        confirmed: false,
      }),
    ],
    managerContact: null,
    calendarMeta: { configured: false, connected: false },
    payrollSummary: { records: [], totals: {} },
  });

  const activeCard = getDesktopCard(html, "Мои заявки");
  const completedCard = getDesktopCard(html, "Выполненные заказы");
  assert.ok(activeCard.indexOf("Newest Pending Client") < activeCard.indexOf("Confirmed Active Client"));
  assert.doesNotMatch(activeCard, /Completed Client/);
  assert.match(completedCard, /Completed Client/);
});

test("prioritizes the cleaner order opened from an SMS link", () => {
  const renderers = createRenderers();
  const html = renderers.renderDashboardPage(
    {
      user: {
        id: "user-1",
        email: "ariana.cleaner@example.com",
        phone: "3125550100",
        staffId: "staff-1",
        role: "cleaner",
      },
      staffRecord: {
        id: "staff-1",
        name: "Ariana Cleaner",
        email: "ariana.cleaner@example.com",
        phone: "3125550100",
        status: "active",
        w9: { document: { relativePath: "w9.pdf" } },
        contract: { document: { relativePath: "contract.pdf" } },
      },
      staffSummary: null,
      assignedOrders: [
        buildOrder({
          id: "newer-pending-order",
          customerName: "Newer Pending Client",
          scheduleDate: "2099-02-10",
          updatedAt: "2099-01-04T12:00:00.000Z",
          confirmed: false,
        }),
        buildOrder({
          id: "sms-focused-order",
          customerName: "SMS Focused Client",
          scheduleDate: "2099-02-11",
          updatedAt: "2099-01-02T12:00:00.000Z",
          confirmed: false,
        }),
      ],
      managerContact: null,
      calendarMeta: { configured: false, connected: false },
      payrollSummary: { records: [], totals: {} },
    },
    {
      focusedOrderId: "sms-focused-order",
    }
  );

  const activeCard = getDesktopCard(html, "Мои заявки");
  assert.ok(activeCard.indexOf("SMS Focused Client") < activeCard.indexOf("Newer Pending Client"));
  assert.match(html, /data-account-focused-detail-id="account-mobile-order-detail-sms-focused-order"/);
  assert.match(html, /Заказ из SMS/);
  assert.match(html, /Открыто из SMS\. Подтвердите или отклоните именно этот заказ\./);
});

test("shows the nearest scheduled order in the mobile next order card", () => {
  const renderers = createRenderers();
  const html = renderers.renderDashboardPage({
    user: {
      id: "user-1",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      staffId: "staff-1",
      role: "cleaner",
    },
    staffRecord: {
      id: "staff-1",
      name: "Ariana Cleaner",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      status: "active",
      w9: { document: { relativePath: "w9.pdf" } },
      contract: { document: { relativePath: "contract.pdf" } },
    },
    staffSummary: null,
    assignedOrders: [
      buildOrder({
        id: "later-needs-reply-order",
        customerName: "Mildred Walker",
        scheduleDate: "2099-06-15",
        scheduleTime: "09:00",
        updatedAt: "2099-01-04T12:00:00.000Z",
        confirmed: false,
      }),
      buildOrder({
        id: "nearest-confirmed-order",
        customerName: "Mona",
        scheduleDate: "2099-06-10",
        scheduleTime: "08:00",
        updatedAt: "2099-01-02T12:00:00.000Z",
        confirmed: true,
      }),
    ],
    managerContact: null,
    calendarMeta: { configured: false, connected: false },
    payrollSummary: { records: [], totals: {} },
  });

  const activeCard = getDesktopCard(html, "Мои заявки");
  assert.ok(activeCard.indexOf("Mildred Walker") < activeCard.indexOf("Mona"));

  const mobileFocusCard = getMobileFocusCard(html);
  assert.match(mobileFocusCard, /Следующий заказ/);
  assert.match(mobileFocusCard, /Mona/);
  assert.doesNotMatch(mobileFocusCard, /Mildred Walker/);

  const mobileOrdersSection = getMobileOrdersSection(html);
  assert.ok(mobileOrdersSection.indexOf("Mona") < mobileOrdersSection.indexOf("Mildred Walker"));
});

test("renders cleaner checklist completion without a photo upload step", () => {
  const renderers = createRenderers();
  const checklistOrder = buildOrder({
    id: "checklist-order",
    customerName: "Checklist Client",
    status: "checklist",
    scheduleDate: "2099-01-05",
    updatedAt: "2099-01-03T12:00:00.000Z",
    confirmed: true,
  });
  checklistOrder.completion = {
    checklistItems: [
      { id: "item-1", label: "Kitchen", hint: "", completed: true },
      { id: "item-2", label: "Bathroom", hint: "", completed: true },
      { id: "item-3", label: "Проветрить помещения", hint: "Окна открыть перед уходом", completed: true },
    ],
    beforePhotos: [],
    afterPhotos: [],
    photosSkipped: false,
  };
  const legacyPhotosOrder = buildOrder({
    id: "legacy-photos-order",
    customerName: "Legacy Photos Client",
    status: "photos",
    scheduleDate: "2099-01-06",
    updatedAt: "2099-01-04T12:00:00.000Z",
    confirmed: true,
  });

  const html = renderers.renderDashboardPage({
    user: {
      id: "user-1",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      staffId: "staff-1",
      role: "cleaner",
    },
    staffRecord: {
      id: "staff-1",
      name: "Ariana Cleaner",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      status: "active",
      w9: { document: { relativePath: "w9.pdf" } },
      contract: { document: { relativePath: "contract.pdf" } },
    },
    staffSummary: null,
    assignedOrders: [checklistOrder, legacyPhotosOrder],
    managerContact: null,
    calendarMeta: { configured: false, connected: false },
    payrollSummary: { records: [], totals: {} },
  });

  const activeCard = getDesktopCard(html, "Мои заявки");
  const completedCard = getDesktopCard(html, "Выполненные заказы");
  assert.match(activeCard, /Checklist Client/);
  assert.match(activeCard, /Завершить уборку/);
  assert.match(activeCard, /account-checklist-check/);
  assert.match(activeCard, /account-checklist-copy/);
  assert.doesNotMatch(activeCard, /Окна открыть перед уходом/);
  assert.doesNotMatch(activeCard, /data-account-photo-editor/);
  assert.doesNotMatch(activeCard, /complete-assignment-photos/);
  assert.doesNotMatch(activeCard, /Выбрать фото/);
  assert.doesNotMatch(activeCard, />Фото</);
  assert.doesNotMatch(activeCard, /Legacy Photos Client/);
  assert.match(completedCard, /Legacy Photos Client/);
  assert.match(completedCard, /Уборка завершена/);
});

test("keeps cleaner en-route action disabled until two hours before the appointment", () => {
  const renderers = createRenderers();
  const html = renderers.renderDashboardPage({
    user: {
      id: "user-1",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      staffId: "staff-1",
      role: "cleaner",
    },
    staffRecord: {
      id: "staff-1",
      name: "Ariana Cleaner",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      status: "active",
      w9: { document: { relativePath: "w9.pdf" } },
      contract: { document: { relativePath: "contract.pdf" } },
    },
    staffSummary: null,
    assignedOrders: [
      buildOrder({
        id: "future-confirmed-order",
        customerName: "Future Confirmed Client",
        status: "scheduled",
        scheduleDate: "2099-01-05",
        scheduleTime: "09:00",
        updatedAt: "2099-01-03T12:00:00.000Z",
        confirmed: true,
      }),
    ],
    managerContact: null,
    calendarMeta: { configured: false, connected: false },
    payrollSummary: { records: [], totals: {} },
  });

  assert.match(html, /Кнопка «Я в пути» станет активной за 2 часа до начала уборки\./);
  assert.match(html, /name="action" value="mark-assignment-en-route"/);
  assert.match(html, /<button[^>]*disabled[^>]*>Я в пути<\/button>/);
});

test("keeps confirmed mobile order detail actions from overlapping content", () => {
  const renderers = createRenderers();
  const html = renderers.renderDashboardPage({
    user: {
      id: "user-1",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      staffId: "staff-1",
      role: "cleaner",
    },
    staffRecord: {
      id: "staff-1",
      name: "Ariana Cleaner",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      status: "active",
      w9: { document: { relativePath: "w9.pdf" } },
      contract: { document: { relativePath: "contract.pdf" } },
    },
    staffSummary: null,
    assignedOrders: [
      buildOrder({
        id: "future-confirmed-order",
        customerName: "Future Confirmed Client",
        status: "scheduled",
        scheduleDate: "2099-01-05",
        scheduleTime: "09:00",
        updatedAt: "2099-01-03T12:00:00.000Z",
        confirmed: true,
      }),
    ],
    managerContact: null,
    calendarMeta: { configured: false, connected: false },
    payrollSummary: { records: [], totals: {} },
  });

  const detailView = getMobileDetailView(html, "account-mobile-order-detail-future-confirmed-order");
  assert.match(detailView, /account-mobile-detail-primary-button/);
  assert.doesNotMatch(detailView, /account-mobile-action-stack-bottom/);
  assert.equal((detailView.match(/account-mobile-detail-primary-button/g) || []).length, 1);
});

test("renders client quote options and comments in the mobile order detail", () => {
  const renderers = createRenderers();
  const html = renderers.renderDashboardPage({
    user: {
      id: "user-1",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      staffId: "staff-1",
      role: "cleaner",
    },
    staffRecord: {
      id: "staff-1",
      name: "Ariana Cleaner",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      status: "active",
      w9: { document: { relativePath: "w9.pdf" } },
      contract: { document: { relativePath: "contract.pdf" } },
    },
    staffSummary: null,
    assignedOrders: [
      buildOrder({
        id: "quoted-detail-order",
        customerName: "Quoted Detail Client",
        status: "scheduled",
        scheduleDate: "2099-01-05",
        scheduleTime: "09:00",
        updatedAt: "2099-01-03T12:00:00.000Z",
        confirmed: true,
        quoteData: {
          rooms: "2",
          bathrooms: "2",
          squareMeters: "1500",
          hasPets: "dog",
          basementCleaning: "yes",
          services: ["ovenCleaning", "insideCabinets"],
          extras: ["insideFridge"],
          quantityServices: {
            interiorWindowsCleaning: 4,
            blindsCleaning: 2,
            bedLinenChange: 1,
          },
          additionalDetails: "Gate code 1942.\nPlease focus the kitchen first.",
        },
      }),
    ],
    managerContact: null,
    calendarMeta: { configured: false, connected: false },
    payrollSummary: { records: [], totals: {} },
  });

  const detailView = getMobileDetailView(html, "account-mobile-order-detail-quoted-detail-order");
  assert.match(detailView, /Детали заявки/);
  assert.match(detailView, /Oven Cleaning/);
  assert.match(detailView, /Inside Cabinets Cleaning/);
  assert.match(detailView, /Inside Refrigerator Cleaning/);
  assert.match(detailView, /Interior Windows Cleaning: 4/);
  assert.match(detailView, /Blinds Cleaning: 2/);
  assert.match(detailView, /Bed Linen \/ Sofa Cover Change: 1/);
  assert.match(detailView, /Basement Cleaning/);
  assert.match(detailView, /Комментарий клиента/);
  assert.match(detailView, /Gate code 1942\.<br>Please focus the kitchen first\./);
});

test("renders cleaner calendar cards with the scheduled time range", () => {
  const renderers = createRenderers();
  const html = renderers.renderCalendarPage(
    {
      user: {
        id: "user-1",
        email: "ariana.cleaner@example.com",
        phone: "3125550100",
        staffId: "staff-1",
        role: "cleaner",
      },
      staffRecord: {
        id: "staff-1",
        name: "Ariana Cleaner",
        email: "ariana.cleaner@example.com",
        phone: "3125550100",
        status: "active",
        w9: { document: { relativePath: "w9.pdf" } },
        contract: { document: { relativePath: "contract.pdf" } },
      },
      assignedOrders: [
        {
          ...buildOrder({
            id: "calendar-order",
            customerName: "Calendar Range Client",
            scheduleDate: "2099-02-10",
            scheduleTime: "09:00",
            updatedAt: "2099-01-04T12:00:00.000Z",
            confirmed: true,
          }),
          serviceDurationMinutes: 210,
          serviceDurationLabel: "3 hours 30 minutes",
        },
      ],
      managerContact: null,
      calendarMeta: { configured: false, connected: false },
      payrollSummary: { records: [], totals: {} },
    },
    {
      calendarDate: "2099-02-10",
      calendarView: "today",
    }
  );

  assert.match(html, /Calendar Range Client/);
  assert.match(html, /09:00 - 12:30/);
});

test("keeps the mobile month calendar list collapsed until a day is selected", () => {
  const renderers = createRenderers();
  const userContext = {
    user: {
      id: "user-1",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      staffId: "staff-1",
      role: "cleaner",
    },
    staffRecord: {
      id: "staff-1",
      name: "Ariana Cleaner",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      status: "active",
      w9: { document: { relativePath: "w9.pdf" } },
      contract: { document: { relativePath: "contract.pdf" } },
    },
    assignedOrders: [
      buildOrder({
        id: "past-completed-order",
        customerName: "Cheryl Whitten",
        status: "completed",
        scheduleDate: "2099-06-02",
        scheduleTime: "09:00",
        updatedAt: "2099-01-04T12:00:00.000Z",
        confirmed: true,
      }),
      buildOrder({
        id: "future-confirmed-order",
        customerName: "Mona Future",
        scheduleDate: "2099-06-15",
        scheduleTime: "08:00",
        updatedAt: "2099-01-05T12:00:00.000Z",
        confirmed: true,
      }),
    ],
    managerContact: null,
    calendarMeta: { configured: false, connected: false },
    payrollSummary: { records: [], totals: {} },
  };

  const monthHtml = renderers.renderCalendarPage(userContext, {
    calendarDate: "2099-06-08",
    calendarView: "month",
  });
  const monthMobileCalendar = getMobileCalendarSection(monthHtml);
  assert.match(monthMobileCalendar, /account-mobile-calendar-month-nav/);
  assert.match(monthMobileCalendar, /href="\/account\?section=calendar&amp;view=month&amp;date=2099-05-01"/);
  assert.match(monthMobileCalendar, /href="\/account\?section=calendar&amp;view=month&amp;date=2099-07-01"/);
  assert.match(monthMobileCalendar, /href="\/account\?section=calendar&amp;view=month&amp;date=2099-06-02&amp;showDay=1"/);
  assert.doesNotMatch(monthMobileCalendar, /account-mobile-calendar-order-card/);
  assert.doesNotMatch(monthMobileCalendar, /Cheryl Whitten/);

  const selectedDayHtml = renderers.renderCalendarPage(userContext, {
    calendarDate: "2099-06-02",
    calendarView: "month",
    calendarShowDay: true,
  });
  const selectedDayMobileCalendar = getMobileCalendarSection(selectedDayHtml);
  assert.match(selectedDayMobileCalendar, /account-mobile-calendar-order-card/);
  assert.match(selectedDayMobileCalendar, /Cheryl Whitten/);
  assert.doesNotMatch(selectedDayMobileCalendar, /Mona Future/);
});

test("shows payroll amount inside the mobile-visible payroll row", () => {
  const renderers = createRenderers();
  const html = renderers.renderPayrollPage({
    user: {
      id: "user-1",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      staffId: "staff-1",
      role: "cleaner",
    },
    staffRecord: {
      id: "staff-1",
      name: "Ariana Cleaner",
      email: "ariana.cleaner@example.com",
      phone: "3125550100",
      status: "active",
      w9: { document: { relativePath: "w9.pdf" } },
      contract: { document: { relativePath: "contract.pdf" } },
    },
    assignedOrders: [],
    payrollSummary: {
      rows: [
        {
          customerName: "Payroll Mobile Client",
          serviceName: "Regular",
          selectedDate: "2099-01-05",
          selectedTime: "09:00",
          amountCents: 4375,
          compensationType: "percent",
          compensationValue: "50",
          appliedCompensationValue: "25",
          teamSize: 2,
          status: "owed",
          paidAt: "",
        },
      ],
      totals: {
        owedCents: 4375,
        paidCents: 0,
        totalCents: 4375,
        rowsCount: 1,
        owedCount: 1,
        paidCount: 0,
      },
    },
    managerContact: null,
    calendarMeta: { configured: false, connected: false },
  });

  assert.match(html, /account-payroll-mobile-amount/);
  assert.match(html, /Payroll Mobile Client/);
  assert.match(html, /К выплате/);
  assert.match(html, /\$43\.75/);
  assert.match(html, /Payroll Mobile Client[\s\S]*account-payroll-mobile-amount[\s\S]*\$43\.75/);
});
