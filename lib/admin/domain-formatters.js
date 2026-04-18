"use strict";

function createAdminDomainFormatters(deps = {}) {
  const { ADMIN_TIME_ZONE = "America/Chicago", adminSharedRenderers, normalizeString } = deps;

  function formatCurrencyAmount(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function formatAdminDateTime(value) {
    if (!value) return "Не указано";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Не указано";
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: ADMIN_TIME_ZONE,
    });
  }

  function formatAdminServiceLabel(value) {
    const normalized = normalizeString(value, 120).toLowerCase();
    if (!normalized) return "Уборка";
    if (normalized.includes("regular")) return "Регулярная уборка";
    if (normalized.includes("deep")) return "Генеральная уборка";
    if (normalized.includes("moving") || normalized.includes("move")) return "Уборка перед переездом";
    return normalizeString(value, 120);
  }

  function formatRussianPlural(count, one, few, many) {
    const absolute = Math.abs(Number(count || 0));
    const mod100 = absolute % 100;
    const mod10 = absolute % 10;
    if (mod100 >= 11 && mod100 <= 19) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
  }

  function formatOrderCountLabel(count) {
    return `${count} ${formatRussianPlural(count, "заказ", "заказа", "заказов")}`;
  }

  function formatStaffCountLabel(count) {
    return `${count} ${formatRussianPlural(count, "сотрудник", "сотрудника", "сотрудников")}`;
  }

  function formatAdminCalendarDate(value) {
    const normalized = normalizeString(value, 32);
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return normalized || "Не указано";
    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    });
  }

  function formatAdminClockTime(value) {
    const normalized = normalizeString(value, 32);
    if (!normalized) return "Не указано";

    const twelveHourMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
    if (twelveHourMatch) {
      const hours = Number(twelveHourMatch[1]);
      const minutes = Number(twelveHourMatch[2]);
      const meridiem = twelveHourMatch[3].toUpperCase();
      if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
        const normalizedHours =
          meridiem === "PM" && hours !== 12 ? hours + 12 : meridiem === "AM" && hours === 12 ? 0 : hours;
        return new Date(Date.UTC(2000, 0, 1, normalizedHours, minutes, 0)).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "UTC",
        });
      }
    }

    const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!twentyFourHourMatch) return normalized;

    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return normalized;

    return new Date(Date.UTC(2000, 0, 1, hours, minutes, 0)).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    });
  }

  function normalizeAdminOrderDateInput(value) {
    const normalized = normalizeString(value, 32);
    if (!normalized) return "";

    const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${year}-${month}-${day}`;
    }

    const usMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      const [, month, day, year] = usMatch;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const dotMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dotMatch) {
      const [, day, month, year] = dotMatch;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    return normalized;
  }

  function formatAdminOrderDateInputValue(value) {
    const normalized = normalizeAdminOrderDateInput(value);
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return normalized;
    const [, year, month, day] = match;
    return `${month}/${day}/${year}`;
  }

  function normalizeAdminOrderPriceInput(value, fallback = null) {
    const normalized = normalizeString(value, 64);
    if (!normalized) return fallback;

    let compact = normalized.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "");
    if (!compact) return fallback;

    if (compact.includes(".") && compact.includes(",")) {
      compact = compact.replace(/,/g, "");
    } else if (!compact.includes(".") && compact.includes(",")) {
      compact = compact.replace(/,/g, ".");
    } else {
      compact = compact.replace(/,/g, "");
    }

    const parsed = Number(compact);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Number(parsed.toFixed(2));
  }

  function formatAdminOrderPriceInputValue(value) {
    const normalized = normalizeAdminOrderPriceInput(value, null);
    if (!Number.isFinite(normalized)) return "";
    return normalized.toFixed(2);
  }

  function normalizeAdminOrderTimeInput(value) {
    const normalized = normalizeString(value, 32);
    if (!normalized) return "";

    const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (twentyFourHourMatch) {
      const hours = Number(twentyFourHourMatch[1]);
      const minutes = Number(twentyFourHourMatch[2]);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }
    }

    const meridiemMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i);
    if (meridiemMatch) {
      let hours = Number(meridiemMatch[1]);
      const minutes = Number(meridiemMatch[2] || "00");
      const meridiem = meridiemMatch[3].toUpperCase();
      if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
        if (meridiem === "P" && hours < 12) hours += 12;
        if (meridiem === "A" && hours === 12) hours = 0;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      }
    }

    return normalized;
  }

  function formatAdminOrderTimeInputValue(value) {
    const normalized = normalizeAdminOrderTimeInput(value);
    const match = normalized.match(/^(\d{2}):(\d{2})$/);
    if (!match) return normalized;

    let hours = Number(match[1]);
    const minutes = match[2];
    const meridiem = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${meridiem}`;
  }

  function formatAdminScheduleLabel(dateValue, timeValue) {
    const normalizedDate = normalizeString(dateValue, 32);
    const normalizedTime = normalizeString(timeValue, 32);
    if (!normalizedDate && !normalizedTime) return "Дата не указана";
    if (!normalizedDate) return normalizedTime ? `Время: ${formatAdminClockTime(normalizedTime)}` : "Дата не указана";
    if (!normalizedTime) return formatAdminCalendarDate(normalizedDate);
    return `${formatAdminCalendarDate(normalizedDate)}, ${formatAdminClockTime(normalizedTime)}`;
  }

  function toAdminScheduleTimestamp(dateValue, timeValue) {
    const normalizedDate = normalizeString(dateValue, 32);
    const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return NaN;
    const [, year, month, day] = match;
    const timeMatch = normalizeString(timeValue, 32).match(/^(\d{1,2}):(\d{2})/);
    const hours = timeMatch ? Number(timeMatch[1]) : 12;
    const minutes = timeMatch ? Number(timeMatch[2]) : 0;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), hours, minutes, 0);
  }

  function formatStaffStatusLabel(status) {
    if (status === "inactive") return "Не активен";
    if (status === "on_leave") return "В отпуске";
    return "Активен";
  }

  function formatAssignmentStatusLabel(status) {
    if (status === "confirmed") return "Подтверждено";
    if (status === "completed") return "Завершено";
    if (status === "issue") return "Нужно проверить";
    return "Запланировано";
  }

  function renderStaffStatusBadge(status) {
    if (status === "inactive") return adminSharedRenderers.renderAdminBadge(formatStaffStatusLabel(status), "muted");
    if (status === "on_leave") return adminSharedRenderers.renderAdminBadge(formatStaffStatusLabel(status), "outline");
    return adminSharedRenderers.renderAdminBadge(formatStaffStatusLabel(status), "success");
  }

  function renderAssignmentStatusBadge(status) {
    if (status === "completed") {
      return adminSharedRenderers.renderAdminBadge(formatAssignmentStatusLabel(status), "success");
    }
    if (status === "confirmed") {
      return adminSharedRenderers.renderAdminBadge(formatAssignmentStatusLabel(status), "default");
    }
    if (status === "issue") {
      return adminSharedRenderers.renderAdminBadge(formatAssignmentStatusLabel(status), "danger");
    }
    return adminSharedRenderers.renderAdminBadge(formatAssignmentStatusLabel(status), "outline");
  }

  return {
    formatCurrencyAmount,
    formatAdminDateTime,
    formatAdminServiceLabel,
    formatOrderCountLabel,
    formatStaffCountLabel,
    formatAdminCalendarDate,
    formatAdminClockTime,
    normalizeAdminOrderDateInput,
    formatAdminOrderDateInputValue,
    normalizeAdminOrderPriceInput,
    formatAdminOrderPriceInputValue,
    normalizeAdminOrderTimeInput,
    formatAdminOrderTimeInputValue,
    formatAdminScheduleLabel,
    toAdminScheduleTimestamp,
    formatStaffStatusLabel,
    formatAssignmentStatusLabel,
    renderStaffStatusBadge,
    renderAssignmentStatusBadge,
  };
}

module.exports = {
  createAdminDomainFormatters,
};
