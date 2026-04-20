"use strict";

function createSettingsUiHelpers(deps = {}) {
  const {
    escapeHtml,
    getRequestUrl,
    normalizeString,
  } = deps;

  function renderEmployeeToggleField(checked = true) {
    return `<div class="admin-label admin-checkbox-field">
      <span>Сотрудник</span>
      <input type="hidden" name="isEmployee" value="0">
      <label class="admin-checkbox-row">
        <input type="checkbox" name="isEmployee" value="1"${checked ? " checked" : ""}>
        <span>На этого пользователя можно назначать заказы</span>
      </label>
    </div>`;
  }
  function renderSettingsNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "saved") {
      return `<div class="admin-alert admin-alert-info">Отметки чек-листа сохранены.</div>`;
    }
    if (notice === "checklist-updated") {
      return `<div class="admin-alert admin-alert-info">Шаблон чек-листа обновлён.</div>`;
    }
    if (notice === "added") {
      return `<div class="admin-alert admin-alert-info">Новый пункт добавлен в шаблон.</div>`;
    }
    if (notice === "reset") {
      return `<div class="admin-alert admin-alert-info">Все отметки по этому шаблону сброшены.</div>`;
    }
    if (notice === "error") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить изменения. Попробуйте ещё раз.</div>`;
    }
    if (notice === "user-created") {
      return `<div class="admin-alert admin-alert-info">Пользователь создан.</div>`;
    }
    if (notice === "user-created-email-sent") {
      return `<div class="admin-alert admin-alert-info">Пользователь создан, письмо со ссылкой на подтверждение уже отправлено.</div>`;
    }
    if (notice === "user-created-email-skipped") {
      return `<div class="admin-alert admin-alert-info">Пользователь создан. Автоматическая отправка письма сейчас не настроена.</div>`;
    }
    if (notice === "user-created-email-failed") {
      return `<div class="admin-alert admin-alert-error">Пользователь создан, но письмо с подтверждением отправить не удалось.</div>`;
    }
    if (notice === "user-invite-sent") {
      return `<div class="admin-alert admin-alert-info">Письмо с подтверждением отправлено повторно.</div>`;
    }
    if (notice === "user-invite-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось отправить письмо повторно. Проверьте канал почты и текст ошибки в карточке пользователя.</div>`;
    }
    if (notice === "user-updated") {
      return `<div class="admin-alert admin-alert-info">Пользователь обновлён.</div>`;
    }
    if (notice === "user-deleted") {
      return `<div class="admin-alert admin-alert-info">Пользователь удалён.</div>`;
    }
    if (notice === "user-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить пользователя. Проверьте привязку к сотруднику, email и пароль.</div>`;
    }
    if (notice === "mail-connected") {
      return `<div class="admin-alert admin-alert-info">Google Mail подключён. Новые invite-письма будут уходить через Gmail API.</div>`;
    }
    if (notice === "mail-disconnected") {
      return `<div class="admin-alert admin-alert-info">Google Mail отключён.</div>`;
    }
    if (notice === "mail-connect-denied") {
      return `<div class="admin-alert admin-alert-error">Google Mail не был подключён: доступ в окне Google был отменён.</div>`;
    }
    if (notice === "mail-connect-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось завершить подключение Google Mail. Проверьте OAuth client, Gmail API и redirect URI.</div>`;
    }
    if (notice === "mail-unavailable") {
      return `<div class="admin-alert admin-alert-error">Google Mail OAuth пока не настроен. Добавьте client id/secret и подключите сервисный ящик.</div>`;
    }
    return "";
  }
  function getSettingsSection(req) {
    const reqUrl = getRequestUrl(req);
    const section = normalizeString(reqUrl.searchParams.get("section"), 32).toLowerCase();
    return section === "checklists" ? "checklists" : "users";
  }
  function formatSettingsPlural(count, one, few, many) {
    const absolute = Math.abs(Number(count || 0));
    const mod100 = absolute % 100;
    const mod10 = absolute % 10;
    if (mod100 >= 11 && mod100 <= 19) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
  }
  function formatSettingsMetaCount(count, one, few, many) {
    return `${count} ${formatSettingsPlural(count, one, few, many)}`;
  }
  return {
    renderEmployeeToggleField,
    renderSettingsNotice,
    getSettingsSection,
    formatSettingsPlural,
    formatSettingsMetaCount,
  };
}

module.exports = {
  createSettingsUiHelpers,
};
