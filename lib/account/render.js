"use strict";

function createAccountRenderers(deps = {}) {
  const {
    ACCOUNT_LOGIN_PATH,
    ACCOUNT_LOGOUT_PATH,
    ACCOUNT_ROOT_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatAdminDateTime,
    formatAdminServiceLabel,
    formatCurrencyAmount,
    formatOrderCountLabel,
    renderAssignmentStatusBadge,
    renderStaffStatusBadge,
    shared,
  } = deps;
  const {
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderAdminPropertyList,
  } = shared;

  function formatPhone(value) {
    const raw = String(value || "").trim();
    if (!raw) return "Не указан";
    const digits = raw.replace(/\D+/g, "");
    let normalizedDigits = digits;
    while (normalizedDigits.length > 10 && normalizedDigits.startsWith("1")) {
      normalizedDigits = normalizedDigits.slice(1);
    }
    normalizedDigits = normalizedDigits.slice(0, 10);
    if (normalizedDigits.length === 10) {
      return `+1(${normalizedDigits.slice(0, 3)})${normalizedDigits.slice(3, 6)}-${normalizedDigits.slice(6)}`;
    }
    return raw;
  }

  function renderPhoneInputAttributes() {
    return ' data-admin-phone-input="true" inputmode="numeric" autocomplete="tel-national" maxlength="15" placeholder="+1(000)000-0000"';
  }

  function renderAccountSidebar(userContext, activeKey = "dashboard") {
    const user = userContext && userContext.user ? userContext.user : null;
    const staffRecord = userContext && userContext.staffRecord ? userContext.staffRecord : null;
    const assignmentCount = userContext && Number.isFinite(userContext.assignmentCount) ? userContext.assignmentCount : 0;

    const statusBadges = [
      staffRecord ? renderStaffStatusBadge(staffRecord.status) : renderAdminBadge("Не привязан", "danger"),
      assignmentCount > 0 ? renderAdminBadge(formatOrderCountLabel(assignmentCount), "outline") : renderAdminBadge("Пока без заявок", "muted"),
    ].join("");

    const sidebarLinks = [
      { key: "dashboard", label: "Мой кабинет", href: ACCOUNT_ROOT_PATH },
    ];

    return `<div class="admin-sidebar-card">
      <div class="admin-brand">
        <div class="admin-brand-mark">S</div>
        <div>
          <p class="admin-sidebar-label">SHYNLI CLEANING</p>
          <h2 class="admin-sidebar-title">Кабинет сотрудника</h2>
        </div>
      </div>
      <p class="admin-sidebar-copy">Личный доступ к назначенным заявкам и профилю.</p>
      <div class="admin-badge-row">${statusBadges}</div>
      <nav class="admin-nav" style="margin-top:18px;">
        <div class="admin-nav-group">
          ${sidebarLinks
            .map((item) => `<a class="admin-nav-link${item.key === activeKey ? " admin-nav-link-active" : ""}" href="${item.href}">${escapeHtml(item.label)}</a>`)
            .join("")}
        </div>
      </nav>
      <div class="admin-divider" style="margin:18px 0;"></div>
      ${renderAdminPropertyList([
        { label: "Сотрудник", value: staffRecord ? staffRecord.name : "Не найден" },
        { label: "Email", value: user ? user.email : "Не указан" },
        { label: "Телефон", value: user ? formatPhone(user.phone) : "Не указан" },
      ])}
      <div class="admin-inline-actions admin-sidebar-actions">
        <form class="admin-logout-form" method="post" action="${ACCOUNT_LOGOUT_PATH}">
          <button class="admin-button admin-button-secondary" type="submit">Выйти</button>
        </form>
      </div>
    </div>`;
  }

  function renderAccountNotice(notice) {
    if (notice === "profile-saved") {
      return `<div class="admin-alert admin-alert-info">Профиль обновлён.</div>`;
    }
    if (notice === "password-saved") {
      return `<div class="admin-alert admin-alert-info">Пароль обновлён.</div>`;
    }
    if (notice === "profile-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить профиль. Проверьте email и телефон.</div>`;
    }
    if (notice === "password-error") {
      return `<div class="admin-alert admin-alert-error">Не удалось изменить пароль. Проверьте текущий пароль и совпадение новых значений.</div>`;
    }
    return "";
  }

  function renderAccountAssignmentsTable(orderItems = []) {
    if (!orderItems.length) {
      return `<div class="admin-empty-state">Пока на вас ничего не назначено. Как только администратор привяжет заявку, она появится здесь.</div>`;
    }

    return `<div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Услуга</th>
            <th>Дата и время</th>
            <th>Статус</th>
            <th>Адрес</th>
            <th>Комментарий</th>
          </tr>
        </thead>
        <tbody>
          ${orderItems
            .map((item) => `<tr>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(item.entry.customerName || "Клиент")}</span>
                  <span class="admin-table-muted">${escapeHtml(item.entry.requestId || item.entry.id)}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(formatAdminServiceLabel(item.entry.serviceName || item.entry.serviceType))}</span>
                  <span class="admin-table-muted">${escapeHtml(formatCurrencyAmount(item.entry.totalPrice))}</span>
                </div>
              </td>
              <td>
                <div class="admin-table-cell-stack">
                  <span class="admin-table-strong">${escapeHtml(item.scheduleLabel || "Не указано")}</span>
                  <span class="admin-table-muted">${escapeHtml(formatAdminDateTime(item.entry.createdAt))}</span>
                </div>
              </td>
              <td>
                <div class="admin-inline-badge-row">
                  ${renderAssignmentStatusBadge(item.assignmentStatus)}
                  ${item.entry.status === "success" ? renderAdminBadge("CRM ок", "success") : renderAdminBadge("Нужно проверить", item.entry.status === "warning" ? "default" : "danger")}
                </div>
              </td>
              <td>
                ${item.entry.fullAddress
                  ? `<span class="admin-line-clamp-two">${escapeHtml(item.entry.fullAddress)}</span>`
                  : `<span class="admin-table-muted">Не указан</span>`}
              </td>
              <td>
                ${item.assignment && item.assignment.notes
                  ? `<span class="admin-line-clamp-two">${escapeHtml(item.assignment.notes)}</span>`
                  : `<span class="admin-table-muted">Без комментария</span>`}
              </td>
            </tr>`)
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderLoginPage(options = {}) {
    const errorBlock = options.error
      ? `<div class="admin-alert admin-alert-error">${escapeHtml(options.error)}</div>`
      : "";
    const infoBlock = options.info
      ? `<div class="admin-alert admin-alert-info">${escapeHtml(options.info)}</div>`
      : "";

    return renderAdminLayout(
      "Вход сотрудника",
      `${errorBlock}
      ${infoBlock}
      <div class="admin-section-grid admin-form-grid-two">
        ${renderAdminCard(
          "Вход",
          "Используйте свою рабочую почту и пароль.",
          `<form class="admin-form" method="post" action="${ACCOUNT_LOGIN_PATH}" autocomplete="on">
            <label class="admin-label">
              Почта
              <input class="admin-input" type="email" name="email" value="${escapeHtmlText(options.email || "")}" autocomplete="username" required>
            </label>
            <label class="admin-label">
              Пароль
              <input class="admin-input" type="password" name="password" autocomplete="current-password" required>
            </label>
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit">Войти</button>
            </div>
          </form>`,
          { eyebrow: "Доступ" }
        )}
        ${renderAdminCard(
          "Что будет внутри",
          "После входа вы увидите только свои заявки и сможете обновить личные данные.",
          `<ul class="admin-feature-list">
            <li>Назначенные на вас заявки.</li>
            <li>Ваш телефон и email.</li>
            <li>Смена собственного пароля.</li>
          </ul>`,
          { eyebrow: "Кабинет", muted: true }
        )}
      </div>`,
      {
        subtitle: "Личный кабинет сотрудника для работы с назначенными заявками.",
        sidebar: `<div class="admin-sidebar-card">
          <div class="admin-brand">
            <div class="admin-brand-mark">S</div>
            <div>
              <p class="admin-sidebar-label">SHYNLI CLEANING</p>
              <h2 class="admin-sidebar-title">Кабинет сотрудника</h2>
            </div>
          </div>
          <p class="admin-sidebar-copy">Отдельный вход для сотрудников команды.</p>
        </div>`,
      }
    );
  }

  function renderUnavailablePage() {
    return renderAdminLayout(
      "Кабинет недоступен",
      renderAdminCard(
        "Доступ пока не настроен",
        "Пользовательские аккаунты ещё не подключены.",
        `<div class="admin-alert admin-alert-error">Обратитесь к администратору, чтобы вам создали аккаунт.</div>`,
        { eyebrow: "Статус", muted: true }
      ),
      {
        subtitle: "Когда администратор создаст пользователя, здесь появится доступ.",
      }
    );
  }

  function renderDashboardPage(userContext, options = {}) {
    const noticeBlock = renderAccountNotice(options.notice || "");
    const user = userContext.user;
    const staffRecord = userContext.staffRecord;
    const staffSummary = userContext.staffSummary;
    const assignedOrders = Array.isArray(userContext.assignedOrders) ? userContext.assignedOrders : [];

    const upcomingCount = assignedOrders.filter((item) => item.hasSchedule).length;
    const needsAttentionCount = assignedOrders.filter((item) => item.assignmentStatus === "issue" || item.entry.status !== "success").length;
    const completedCount = assignedOrders.filter((item) => item.assignmentStatus === "completed").length;

    return renderAdminLayout(
      "Мой кабинет",
      `${noticeBlock}
      ${!staffRecord ? `<div class="admin-alert admin-alert-error">Этот аккаунт не привязан к карточке сотрудника. Обратитесь к администратору.</div>` : ""}
      <div class="admin-stats-grid">
        ${renderAdminCard("Назначено", "Все ваши заявки.", `<p class="admin-metric-value">${escapeHtml(String(assignedOrders.length))}</p>`, { eyebrow: "Кабинет" })}
        ${renderAdminCard("Со временем", "Где уже указаны дата или время.", `<p class="admin-metric-value">${escapeHtml(String(upcomingCount))}</p>`, { eyebrow: "Кабинет", muted: true })}
        ${renderAdminCard("Нужно проверить", "Назначения с вопросами или CRM-сигналами.", `<p class="admin-metric-value">${escapeHtml(String(needsAttentionCount))}</p>`, { eyebrow: "Кабинет", muted: true })}
        ${renderAdminCard("Завершено", "Уже отмеченные выезды.", `<p class="admin-metric-value">${escapeHtml(String(completedCount))}</p>`, { eyebrow: "Кабинет", muted: true })}
      </div>
      <div class="admin-section-grid">
        ${renderAdminCard(
          "Мои заявки",
          "Все заявки и выезды, назначенные именно на вас.",
          renderAccountAssignmentsTable(assignedOrders),
          { eyebrow: "Работа" }
        )}
      </div>
      <div class="admin-section-grid admin-form-grid-two">
        ${renderAdminCard(
          "Профиль",
          "Измените контакты, которые видят администраторы и которые используются в вашей карточке.",
          `<form class="admin-form" method="post" action="${ACCOUNT_ROOT_PATH}">
            <input type="hidden" name="action" value="save-profile">
            <label class="admin-label">
              Email
              <input class="admin-input" type="email" name="email" value="${escapeHtmlText(user.email || "")}" required>
            </label>
            <label class="admin-label">
              Телефон
              <input class="admin-input" type="tel" name="phone" value="${escapeHtmlText(formatPhone(user.phone) === "Не указан" ? "" : formatPhone(user.phone))}"${renderPhoneInputAttributes()}>
            </label>
            <div class="admin-inline-actions">
              <button class="admin-button" type="submit">Сохранить профиль</button>
            </div>
          </form>`,
          { eyebrow: "Профиль", muted: true }
        )}
        ${renderAdminCard(
          "Пароль",
          "Меняйте пароль отдельно, чтобы вход оставался под вашим контролем.",
          `<form class="admin-form" method="post" action="${ACCOUNT_ROOT_PATH}">
            <input type="hidden" name="action" value="change-password">
            <label class="admin-label">
              Текущий пароль
              <input class="admin-input" type="password" name="currentPassword" autocomplete="current-password" required>
            </label>
            <label class="admin-label">
              Новый пароль
              <input class="admin-input" type="password" name="newPassword" autocomplete="new-password" minlength="8" required>
            </label>
            <label class="admin-label">
              Повторите новый пароль
              <input class="admin-input" type="password" name="confirmPassword" autocomplete="new-password" minlength="8" required>
            </label>
            <div class="admin-inline-actions">
              <button class="admin-button admin-button-secondary" type="submit">Обновить пароль</button>
            </div>
          </form>`,
          { eyebrow: "Безопасность", muted: true }
        )}
      </div>`,
      {
        subtitle: staffSummary
          ? `Добро пожаловать. Здесь видны только ваши назначения и личные настройки.`
          : "Личный кабинет сотрудника.",
        sidebar: renderAccountSidebar(
          {
            user,
            staffRecord,
            assignmentCount: assignedOrders.length,
          },
          "dashboard"
        ),
      }
    );
  }

  return {
    renderDashboardPage,
    renderLoginPage,
    renderUnavailablePage,
  };
}

module.exports = {
  createAccountRenderers,
};
