"use strict";

function createSettingsUsersHelpers(deps = {}) {
  const {
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
  } = deps;

  function buildSettingsSectionPath(section, notice = "", extraParams = {}) {
    const normalizedSection = section === "checklists" ? "checklists" : "users";
    return buildAdminRedirectPath(ADMIN_SETTINGS_PATH, {
      section: normalizedSection,
      notice,
      ...extraParams,
    });
  }

  function buildSettingsRedirectPath(serviceType, notice = "") {
    const normalizedServiceType = normalizeString(serviceType, 32).toLowerCase();
    const pathWithQuery = buildSettingsSectionPath("checklists", notice, {
      serviceType: normalizedServiceType,
    });
    return normalizedServiceType ? `${pathWithQuery}#settings-${normalizedServiceType}` : pathWithQuery;
  }

  function buildSettingsUsersRedirectPath(notice = "") {
    return `${buildSettingsSectionPath("users", notice)}#settings-users`;
  }

  function renderSettingsSectionNav(activeSection, stats = {}, options = {}) {
    const checklistCount = Number.isFinite(stats.checklistCount) ? stats.checklistCount : 0;
    const userCount = Number.isFinite(stats.userCount) ? stats.userCount : 0;
    const actions = options.actions || "";
    const items = [
      {
        key: "users",
        label: "Пользователи",
        meta: formatSettingsMetaCount(userCount, "аккаунт", "аккаунта", "аккаунтов"),
        href: buildSettingsSectionPath("users"),
      },
      {
        key: "checklists",
        label: "Чек-листы",
        meta: formatSettingsMetaCount(checklistCount, "шаблон", "шаблона", "шаблонов"),
        href: buildSettingsSectionPath("checklists"),
      },
    ];

    return `<div class="admin-settings-nav-row">
      <div class="admin-subnav-strip admin-settings-nav">
        ${items
          .map(
            (item) => `<a class="admin-subnav-link admin-settings-nav-link${item.key === activeSection ? " admin-subnav-link-active admin-settings-nav-link-active" : ""}" href="${item.href}">
              <span class="admin-settings-nav-label">${escapeHtml(item.label)}</span>
              <span class="admin-settings-nav-meta">${escapeHtml(item.meta)}</span>
            </a>`
          )
          .join("")}
      </div>
      ${actions ? `<div class="admin-settings-nav-actions">${actions}</div>` : ""}
    </div>`;
  }

  function formatSettingsUserStatusLabel(status) {
    return status === "inactive" ? "Не активен" : "Активен";
  }

  function formatSettingsUserRoleLabel(role) {
    if (role === "admin") return "Админ";
    if (role === "manager") return "Менеджер";
    return "Клинер";
  }

  function formatInviteEmailErrorMessage(errorValue) {
    const normalized = normalizeString(errorValue, 240);
    if (!normalized) return "";

    const rawMessage = normalized.replace(/^ACCOUNT_INVITE_EMAIL_SEND_FAILED:/i, "").trim();
    const compact = rawMessage.toLowerCase();

    if (compact.includes("google_mail_connection_missing")) {
      return "Google Mail ещё не подключён. Подключите сервисный ящик в блоке почты выше.";
    }
    if (compact.includes("invalid_grant")) {
      return "Google отключил refresh token или соединение истекло. Переподключите Gmail.";
    }
    if (
      compact.includes("insufficient") ||
      compact.includes("permission") ||
      compact.includes("gmail.send")
    ) {
      return "Google не дал приложению право на отправку писем. Переподключите Gmail и подтвердите доступ.";
    }
    if (
      compact.includes("invalid login") ||
      compact.includes("username and password not accepted") ||
      compact.includes("535")
    ) {
      return "SMTP не принял логин или app password. Проверьте relay mailbox и пароль приложения.";
    }
    if (compact.includes("missing credentials")) {
      return "В Render не подхватились SMTP логин или пароль.";
    }
    if (
      compact.includes("econnrefused") ||
      compact.includes("connection timeout") ||
      compact.includes("etimedout") ||
      compact.includes("enotfound")
    ) {
      return "Не удалось подключиться к SMTP relay. Проверьте host, port и доступность Google SMTP.";
    }
    if (compact.includes("tls")) {
      return "SMTP отклонил TLS-соединение. Проверьте настройки TLS в Google Workspace и Render.";
    }
    if (compact.includes("auth")) {
      return "Google Workspace отклонил SMTP-аутентификацию. Проверьте relay rule и app password.";
    }

    return rawMessage;
  }

  function renderInviteEmailStatusCard(status = {}) {
    const googleConfigured = Boolean(status.googleConfigured);
    const googleConnected = Boolean(status.googleConnected);
    const legacyConfigured = Boolean(status.legacyConfigured);
    const connectHref = status.googleAccountEmail
      ? `${ADMIN_GOOGLE_MAIL_CONNECT_PATH}?email=${encodeURIComponent(status.googleAccountEmail)}`
      : ADMIN_GOOGLE_MAIL_CONNECT_PATH;

    let copy = "Автоматическая отправка invite-писем пока не настроена.";
    let details = `<div class="admin-empty-state">Подключите Gmail API, чтобы письма с подтверждением email уходили без SMTP relay.</div>`;
    let collapsedStatus = "Почта ещё не настроена";
    let collapsedMeta = "Нужно подключить сервисный ящик";

    if (googleConnected) {
      copy = "Сервисный ящик подключён через Gmail API. Новые invite-письма уходят сразу через Google.";
      collapsedStatus = "Подключено через Gmail API";
      collapsedMeta = status.googleAccountEmail || "Google Mail OAuth2";
      details = `<div class="admin-property-list">
        <div class="admin-property-row">
          <span class="admin-property-label">Канал</span>
          <span class="admin-property-value">Google Mail OAuth2</span>
        </div>
        <div class="admin-property-row">
          <span class="admin-property-label">Аккаунт</span>
          <span class="admin-property-value">${escapeHtml(status.googleAccountEmail || "Подключён")}</span>
        </div>
        ${status.legacyFromEmail ? `<div class="admin-property-row">
          <span class="admin-property-label">From header</span>
          <span class="admin-property-value">${escapeHtml(status.legacyFromEmail)}</span>
        </div>` : ""}
      </div>`;
    } else if (googleConfigured) {
      copy = "Google Mail OAuth уже настроен. Осталось один раз подключить сервисный ящик и invite-письма начнут уходить через Gmail API.";
      collapsedStatus = "Gmail готов к подключению";
      collapsedMeta = "OAuth client уже настроен";
      details = `<div class="admin-empty-state">OAuth client найден, но соединение с Google Mail ещё не завершено.</div>`;
    } else if (legacyConfigured) {
      copy = "Сейчас письма уходят через legacy transport. Gmail API можно подключить здесь же для более надёжной отправки.";
      collapsedStatus = "Сейчас работает legacy transport";
      collapsedMeta = status.legacyProvider || "Email";
      details = `<div class="admin-property-list">
        <div class="admin-property-row">
          <span class="admin-property-label">Канал</span>
          <span class="admin-property-value">${escapeHtml(status.legacyProvider || "Email")}</span>
        </div>
        ${status.legacyFromEmail ? `<div class="admin-property-row">
          <span class="admin-property-label">From header</span>
          <span class="admin-property-value">${escapeHtml(status.legacyFromEmail)}</span>
        </div>` : ""}
      </div>`;
    }

    return renderAdminCard(
      "Почта приглашений",
      copy,
      `<details class="admin-details admin-settings-disclosure">
        <summary class="admin-settings-disclosure-summary">
          <span class="admin-settings-disclosure-copy">
            <span class="admin-settings-disclosure-title">${escapeHtml(collapsedStatus)}</span>
            <span class="admin-settings-disclosure-meta">${escapeHtml(collapsedMeta)}</span>
          </span>
          <span class="admin-settings-disclosure-toggle">Открыть детали</span>
        </summary>
        <div class="admin-settings-disclosure-body">
          ${details}
          ${status.googleLastError ? `<p class="admin-helper-copy" style="margin-top:10px;color:#b42318;">${escapeHtml(formatInviteEmailErrorMessage(status.googleLastError))}</p>` : ""}
          <div class="admin-inline-actions" style="margin-top:14px;">
            ${googleConfigured
              ? `<a class="admin-button" href="${connectHref}">${googleConnected ? "Переподключить Gmail" : "Подключить Gmail"}</a>`
              : `<span class="admin-helper-copy">Добавьте GOOGLE_MAIL_CLIENT_ID и GOOGLE_MAIL_CLIENT_SECRET в Render, затем вернитесь сюда.</span>`}
            ${googleConnected
              ? `<form method="post" action="${ADMIN_SETTINGS_PATH}">
                  <input type="hidden" name="action" value="disconnect-google-mail">
                  <button class="admin-button admin-button-secondary" type="submit">Отключить</button>
                </form>`
              : ""}
          </div>
        </div>
      </details>`,
      { eyebrow: "Почта", muted: true }
    );
  }

  function renderSettingsCreateUserForm(options = {}) {
    const inviteStatus = options.inviteEmailStatus || {};
    const inviteHelperCopy = options.inviteEmailConfigured
      ? inviteStatus.googleConnected
        ? `После создания сотрудник получит письмо через Gmail API от ${escapeHtml(inviteStatus.googleAccountEmail || "подключённого ящика")}. После подтверждения email он сам задаст первый пароль.`
        : "После создания сотрудник получит письмо со ссылкой на подтверждение email и сам задаст первый пароль."
      : inviteStatus.googleConfigured
        ? "Google Mail OAuth уже настроен, но сервисный ящик ещё не подключён. Сначала завершите подключение в блоке почты выше."
        : "Если письмо-приглашение не настроено, задайте стартовый пароль вручную. Иначе сотрудник не завершит первый вход.";

    return `<form
      class="admin-form-grid"
      method="post"
      action="${ADMIN_SETTINGS_PATH}"
      data-admin-async-save="true"
      data-admin-async-success="Карточка сотрудника сохранена."
      data-admin-async-error="Не удалось сохранить карточку сотрудника."
    >
      <input type="hidden" name="action" value="create_user">
      <div class="admin-form-grid admin-form-grid-two">
        <label class="admin-label">
          Имя сотрудника
          <input class="admin-input" type="text" name="name" placeholder="Anna Petrova" required>
        </label>
        <label class="admin-label">
          Роль
          <select class="admin-input" name="role">
            ${USER_ROLE_VALUES.map((role) => `<option value="${escapeHtmlAttribute(role)}">${escapeHtml(formatSettingsUserRoleLabel(role))}</option>`).join("")}
          </select>
        </label>
        ${renderEmployeeToggleField(true)}
        <label class="admin-label">
          Доступ в систему
          <select class="admin-input" name="status">
            ${USER_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}">${escapeHtml(formatSettingsUserStatusLabel(status))}</option>`).join("")}
          </select>
        </label>
        <label class="admin-label">
          Статус сотрудника
          <select class="admin-input" name="staffStatus">
            ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}">${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
          </select>
        </label>
        <label class="admin-label">
          Email для входа
          <input class="admin-input" type="email" name="email" placeholder="employee@shynli.com" required>
        </label>
        ${renderAdminPhoneInput("phone", "", { required: true })}
        ${renderStaffCompensationFields({})}
      </div>
      ${renderStaffAddressField({
        id: "settings-user-create-address",
        required: true,
      })}
      <label class="admin-label">
        Заметки
        <textarea class="admin-input" name="notes" placeholder="Районы, предпочтительные смены, комментарий по сотруднику"></textarea>
      </label>
      <label class="admin-label">
        Стартовый пароль
        <input class="admin-input" type="password" name="password" minlength="8" placeholder="Необязательно. Оставьте пустым для первого входа через email">
      </label>
      <div class="admin-inline-actions">
        <button class="admin-button" type="submit">Создать сотрудника и кабинет</button>
        <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-user-create-dialog">Отмена</button>
      </div>
      <p class="admin-helper-copy">${inviteHelperCopy}</p>
    </form>`;
  }

  function renderCreateUserDialog(options = {}) {
    const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";

    return `<dialog class="admin-dialog" id="admin-user-create-dialog"${autoOpenAttr} aria-labelledby="admin-user-create-title">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">Пользователи</p>
            <h2 class="admin-dialog-title" id="admin-user-create-title">Новый сотрудник</h2>
            <p class="admin-dialog-copy">Создайте сотрудника и его личный кабинет одним действием.</p>
          </div>
          ${renderAdminDialogCloseButton("admin-user-create-dialog")}
        </div>
        ${renderSettingsCreateUserForm(options)}
      </div>
    </dialog>`;
  }

  function renderSettingsUserEditor(user, linkedStaff, staffSummary, options = {}) {
    const roleBadgeTone =
      user.role === "admin" ? "success" : user.role === "manager" ? "outline" : "muted";
    const verificationBadge =
      user.emailVerificationRequired && !user.emailVerifiedAt
        ? renderAdminBadge("Ждёт подтверждения email", "outline")
        : "";
    const inactiveBadge =
      normalizeString(user.status, 32).toLowerCase() === "inactive"
        ? renderAdminBadge("Не активен", "muted")
        : "";
    const inviteErrorCopy = !user.emailVerifiedAt && user.inviteEmailLastError
      ? formatInviteEmailErrorMessage(user.inviteEmailLastError)
      : "";
    const canResendInvite = options.inviteEmailConfigured && !user.emailVerifiedAt;

    return `<form class="admin-form-grid" method="post" action="${ADMIN_SETTINGS_PATH}">
      <input type="hidden" name="action" value="update_user">
      <input type="hidden" name="userId" value="${escapeHtmlAttribute(user.id)}">
      <input type="hidden" name="staffId" value="${escapeHtmlAttribute(user.staffId || "")}">
      <div class="admin-inline-badge-row">
        ${renderAdminBadge(formatSettingsUserRoleLabel(user.role), roleBadgeTone)}
        ${inactiveBadge}
        ${user.lastLoginAt ? renderAdminBadge(`Вход: ${formatAdminDateTime(user.lastLoginAt)}`, "outline") : renderAdminBadge("Пока не входил", "muted")}
        ${verificationBadge}
      </div>
      ${inviteErrorCopy ? `<p class="admin-helper-copy" style="margin-top:8px;color:#b42318;">${escapeHtml(inviteErrorCopy)}</p>` : ""}
      <div class="admin-form-grid admin-form-grid-two">
        <label class="admin-label">
          Имя сотрудника
          <input class="admin-input" type="text" name="name" value="${escapeHtmlText(linkedStaff ? linkedStaff.name : "")}" required>
        </label>
        <label class="admin-label">
          Роль
          <select class="admin-input" name="role">
            ${USER_ROLE_VALUES.map((role) => `<option value="${escapeHtmlAttribute(role)}"${user.role === role ? " selected" : ""}>${escapeHtml(formatSettingsUserRoleLabel(role))}</option>`).join("")}
          </select>
        </label>
        ${renderEmployeeToggleField(isEmployeeLinkedUser(user))}
        <label class="admin-label">
          Доступ в систему
          <select class="admin-input" name="status">
            ${USER_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${user.status === status ? " selected" : ""}>${escapeHtml(formatSettingsUserStatusLabel(status))}</option>`).join("")}
          </select>
        </label>
        <label class="admin-label">
          Статус сотрудника
          <select class="admin-input" name="staffStatus">
            ${STAFF_STATUS_VALUES.map((status) => `<option value="${escapeHtmlAttribute(status)}"${(linkedStaff ? linkedStaff.status : "active") === status ? " selected" : ""}>${escapeHtml(formatStaffStatusLabel(status))}</option>`).join("")}
          </select>
        </label>
        <label class="admin-label">
          Email
          <input class="admin-input" type="email" name="email" value="${escapeHtmlText(user.email)}" required>
        </label>
        ${renderAdminPhoneInput("phone", user.phone)}
        ${renderStaffCompensationFields({
          value: linkedStaff ? linkedStaff.compensationValue : "",
          type: linkedStaff ? linkedStaff.compensationType : "fixed",
        })}
      </div>
      ${renderStaffAddressField({
        id: `settings-user-address-${user.id}`,
        value: linkedStaff ? linkedStaff.address : "",
      })}
      <label class="admin-label">
        Заметки
        <textarea class="admin-input" name="notes" placeholder="Районы, доступность, комментарий по сотруднику">${escapeHtml(linkedStaff ? linkedStaff.notes : "")}</textarea>
      </label>
      <label class="admin-label">
        Новый пароль
        <input class="admin-input" type="password" name="password" minlength="8" placeholder="Оставьте пустым, если менять не нужно">
      </label>
      <p class="admin-field-note" data-admin-async-feedback hidden></p>
      <div class="admin-inline-actions">
        <button class="admin-button" type="submit">Сохранить сотрудника</button>
      </div>
    </form>
    ${canResendInvite
      ? `<form class="admin-inline-actions" method="post" action="${ADMIN_SETTINGS_PATH}">
          <input type="hidden" name="action" value="resend_user_invite">
          <input type="hidden" name="userId" value="${escapeHtmlAttribute(user.id)}">
          <input type="hidden" name="staffName" value="${escapeHtmlAttribute(linkedStaff ? linkedStaff.name : user.email)}">
          <button class="admin-button admin-button-secondary" type="submit">Отправить письмо ещё раз</button>
        </form>`
      : ""}
    ${options.canDelete
      ? `<form class="admin-inline-actions admin-inline-actions-end" method="post" action="${ADMIN_SETTINGS_PATH}">
          <input type="hidden" name="action" value="delete_user">
          <input type="hidden" name="userId" value="${escapeHtmlAttribute(user.id)}">
          ${renderAdminDeleteIconButton("Удалить пользователя")}
        </form>`
      : ""}
    ${staffSummary ? `<p class="admin-helper-copy">Сейчас у сотрудника ${escapeHtml(formatOrderCountLabel(staffSummary.assignedCount))} и ${escapeHtml(formatOrderCountLabel(staffSummary.upcomingWeekCount))} на ближайшие 7 дней.</p>` : ""}`;
  }

  function renderSettingsUserDialog(user, linkedStaff, staffSummary, options = {}) {
    const dialogId = `admin-settings-user-dialog-${escapeHtmlAttribute(user.id)}`;
    const subtitle = linkedStaff
      ? `${formatSettingsUserRoleLabel(user.role)} • ${staffSummary ? formatOrderCountLabel(staffSummary.assignedCount) : "0 заказов"}`
      : "Привязка к сотруднику потеряна.";
    const titleLabel = linkedStaff ? linkedStaff.name : user.email;
    const contactLabel = [user.email, formatAdminPhoneNumber(user.phone) || user.phone || ""].filter(Boolean).join(" • ");
    const addressLabel = linkedStaff && linkedStaff.address ? linkedStaff.address : "";
    const avatarToneSeed = linkedStaff ? linkedStaff.name || linkedStaff.id : user.email || user.id;

    return `<dialog class="admin-dialog" id="${dialogId}" aria-labelledby="${dialogId}-title">
      <div class="admin-dialog-panel admin-client-dialog-panel">
        <div class="admin-dialog-head admin-dialog-hero">
          <div class="admin-dialog-hero-main">
            <div class="admin-client-avatar admin-client-avatar-large ${escapeHtmlAttribute(getAdminClientAvatarToneClass(avatarToneSeed))}">${escapeHtml(getAdminClientAvatarInitials(titleLabel))}</div>
            <div class="admin-dialog-copy-block admin-dialog-hero-copy">
              <p class="admin-card-eyebrow">Пользователь</p>
              <div class="admin-dialog-hero-title-block">
                <h2 class="admin-dialog-title" id="${dialogId}-title">${escapeHtml(titleLabel)}</h2>
                <p class="admin-dialog-hero-subtitle">${escapeHtml(subtitle)}</p>
                <div class="admin-dialog-hero-meta-stack">
                  ${contactLabel ? `<p class="admin-dialog-hero-detail admin-client-dialog-meta">${escapeHtml(contactLabel)}</p>` : ""}
                  ${addressLabel ? `<p class="admin-dialog-hero-detail admin-client-dialog-address">${escapeHtml(addressLabel)}</p>` : ""}
                </div>
              </div>
            </div>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions admin-dialog-hero-actions">
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        ${renderSettingsUserEditor(user, linkedStaff, staffSummary, options)}
      </div>
    </dialog>`;
  }

  function renderSettingsUsersSection(users, staffRecords, staffSummaryById = new Map(), options = {}) {
    const createUserDialog = renderCreateUserDialog(options);

    if (!users.length) {
      return `<div id="settings-users"></div>
        <div class="admin-empty-state">Пользователей пока нет. Нажмите «Добавить сотрудника», и у него сразу появится личный кабинет.</div>
        ${createUserDialog}`;
    }

    const userRows = [];
    const userDialogs = [];

    users.forEach((user) => {
      const linkedStaff = staffRecords.find((record) => record.id === user.staffId) || null;
      const staffSummary = linkedStaff ? staffSummaryById.get(linkedStaff.id) || null : null;
      const dialogId = `admin-settings-user-dialog-${escapeHtmlAttribute(user.id)}`;
      const verificationText =
        user.emailVerificationRequired && user.emailVerifiedAt
          ? "Подтверждён"
          : user.emailVerificationRequired
            ? "Ждёт email"
            : "Без шага email";
      const inviteText = user.inviteEmailLastError
        ? "Ошибка письма"
        : user.inviteEmailSentAt
          ? `Отправлено ${formatAdminDateTime(user.inviteEmailSentAt)}`
          : "Не отправлялось";

      userRows.push(`<tr
          class="admin-table-row-clickable"
          tabindex="0"
          data-admin-dialog-row="true"
          data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
          aria-label="${escapeHtmlAttribute(`Открыть пользователя ${linkedStaff ? linkedStaff.name : user.email}`)}"
        >
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-link">${escapeHtml(linkedStaff ? linkedStaff.name : user.email)}</span>
              <span class="admin-table-muted">${escapeHtml(formatSettingsUserRoleLabel(user.role))}</span>
            </div>
          </td>
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-strong">${escapeHtml(user.email)}</span>
              <span class="admin-table-muted">${escapeHtml(formatAdminPhoneNumber(user.phone) || "Телефон не указан")}</span>
            </div>
          </td>
          <td>
            <div class="admin-inline-badge-row">
              ${renderAdminBadge(formatSettingsUserStatusLabel(user.status), user.status === "active" ? "success" : "muted")}
              ${renderAdminBadge(verificationText, user.emailVerificationRequired && !user.emailVerifiedAt ? "outline" : "muted")}
            </div>
          </td>
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-strong">${escapeHtml(staffSummary ? formatOrderCountLabel(staffSummary.assignedCount) : "0 заказов")}</span>
              <span class="admin-table-muted">${escapeHtml(staffSummary ? formatOrderCountLabel(staffSummary.upcomingWeekCount) : "0 заказов")} на 7 дней</span>
            </div>
          </td>
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-strong">${escapeHtml(user.lastLoginAt ? formatAdminDateTime(user.lastLoginAt) : "Пока не входил")}</span>
              <span class="admin-table-muted">${escapeHtml(inviteText)}</span>
            </div>
          </td>
        </tr>`);
      userDialogs.push(renderSettingsUserDialog(user, linkedStaff, staffSummary, options));
    });

    return `<div id="settings-users"></div>
      <div class="admin-table-wrap admin-settings-table-wrap">
        <table class="admin-table admin-settings-users-table">
          <thead>
            <tr>
              <th>Пользователь</th>
            <th>Контакты</th>
            <th>Доступ</th>
            <th>Нагрузка</th>
            <th>Активность</th>
          </tr>
        </thead>
        <tbody>${userRows.join("")}</tbody>
      </table>
      </div>
      ${userDialogs.join("")}
      ${createUserDialog}`;
  }

  return {
    buildSettingsRedirectPath,
    buildSettingsUsersRedirectPath,
    renderInviteEmailStatusCard,
    renderSettingsSectionNav,
    renderSettingsUsersSection,
  };
}

module.exports = {
  createSettingsUsersHelpers,
};
