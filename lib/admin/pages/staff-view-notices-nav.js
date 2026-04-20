"use strict";

function createStaffViewNoticeNavHelpers(deps = {}) {
  const {
    ADMIN_STAFF_PATH,
    buildAdminRedirectPath,
    escapeHtml,
    getRequestUrl,
    normalizeString,
  } = deps;

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
        <article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtml(item.tone)}">
          <div class="admin-compact-summary-head">
            <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
            <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
          </div>
          <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
        </article>
      `).join("")}
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
    void stats;
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
    renderStaffNotice,
    renderStaffOverviewStrip,
    getStaffSection,
    buildStaffSectionPath,
    renderStaffSectionNav,
  };
}

module.exports = {
  createStaffViewNoticeNavHelpers,
};
