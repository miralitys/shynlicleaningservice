"use strict";

function createAdminSharedRenderers(deps = {}) {
  const {
    adminAuth,
    ADMIN_APP_NAV_ITEMS,
    ADMIN_LOGIN_PATH,
    ADMIN_2FA_PATH,
    ADMIN_LOGOUT_PATH,
    QUOTE_PUBLIC_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
  } = deps;

  function renderAdminBadge(label, tone = "default") {
    const toneClass =
      tone === "success"
        ? " admin-badge-success"
        : tone === "muted"
          ? " admin-badge-muted"
          : tone === "danger"
            ? " admin-badge-danger"
            : tone === "outline"
              ? " admin-badge-outline"
              : "";
    return `<span class="admin-badge${toneClass}">${escapeHtml(label)}</span>`;
  }

  function renderAdminCard(title, description, body, options = {}) {
    const eyebrow = options.eyebrow ? `<p class="admin-card-eyebrow">${escapeHtml(options.eyebrow)}</p>` : "";
    const baseClass = options.muted ? "admin-card admin-card-muted" : "admin-card";
    const cardClass = options.className ? `${baseClass} ${options.className}` : baseClass;
    const headerClass = options.headerClass ? `admin-card-header ${options.headerClass}` : "admin-card-header";
    const contentClass = options.contentClass ? `admin-card-content ${options.contentClass}` : "admin-card-content";
    return `<section class="${cardClass}">
      ${(eyebrow || title || description) ? `<div class="${headerClass}">
        ${eyebrow}
        ${title ? `<h2 class="admin-card-title">${escapeHtml(title)}</h2>` : ""}
        ${description ? `<p class="admin-card-description">${escapeHtml(description)}</p>` : ""}
      </div>` : ""}
      <div class="${contentClass}">
        ${body}
      </div>
    </section>`;
  }

  function renderAdminAuthSidebar(activeStep) {
    const steps = [
      {
        key: "login",
        index: "01",
        title: "Вход",
        description: "Введите почту и пароль.",
      },
      {
        key: "2fa",
        index: "02",
        title: "Код",
        description: "Подтвердите вход кодом из приложения.",
      },
      {
        key: "dashboard",
        index: "03",
        title: "Панель",
        description: "После подтверждения откроется админка.",
      },
    ];

    return `
      <div class="admin-sidebar-card">
        <div class="admin-brand">
          <div class="admin-brand-mark">S</div>
          <div>
            <p class="admin-sidebar-label">SHYNLI CLEANING</p>
            <h2 class="admin-sidebar-title">Панель управления</h2>
          </div>
        </div>
        <p class="admin-sidebar-copy">Вход в рабочую панель SHYNLI CLEANING.</p>
        <div class="admin-step-list">
          ${steps
            .map(
              (step) => `<div class="admin-step${activeStep === step.key ? " admin-step-active" : ""}">
                <span class="admin-step-index">${step.index}</span>
                <div class="admin-step-copy">
                  <strong>${escapeHtml(step.title)}</strong>
                  <span>${escapeHtml(step.description)}</span>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </div>
      <div class="admin-sidebar-card admin-sidebar-card-muted">
        <p class="admin-sidebar-label">Как войти</p>
        <ul class="admin-feature-list">
          <li>Сначала введите почту и пароль.</li>
          <li>Затем подтвердите вход кодом из приложения.</li>
          <li>Если приложение ещё не настроено, используйте QR-код на следующем шаге.</li>
        </ul>
      </div>`;
  }

  function renderAdminAppSidebar(activePath, options = {}) {
    const navItemByPath = new Map(ADMIN_APP_NAV_ITEMS.map((item) => [item.path, item]));
    const logoutPath = options.logoutPath || ADMIN_LOGOUT_PATH;
    const activeStaffSection =
      activePath === "/admin/staff"
        ? options.staffSection === "calendar"
          ? "calendar"
          : options.staffSection === "assignments"
            ? "assignments"
            : "team"
        : null;
    const roleBadge = options.roleLabel
      ? `<div class="admin-badge-row admin-sidebar-role-badge">${renderAdminBadge(options.roleLabel, options.roleTone || "outline")}</div>`
      : "";
    const navGroups = [
      ["/admin"],
      ["/admin/quote-ops"],
      ["/admin/orders"],
      ["/admin/clients"],
      ["/admin/staff"],
      ["/admin/settings"],
    ];

    const navMarkup = navGroups
      .map((group) => {
        const items = group
          .map((path) => navItemByPath.get(path))
          .filter(Boolean);
        if (items.length === 0) return "";
        const isActiveGroup = items.some((item) => item.path === activePath);
        return `<div class="admin-nav-group${isActiveGroup ? " admin-nav-group-active" : ""}">
          ${items
            .map((item) => {
              const isStaffItem = item.path === "/admin/staff";
              const isActiveItem = item.path === activePath && (!isStaffItem || activeStaffSection === "team");
              const staffSubnav = isStaffItem
                ? `<div class="admin-nav-sublinks">
                    <a class="admin-nav-sublink${activeStaffSection === "calendar" ? " admin-nav-sublink-active" : ""}" href="/admin/staff?section=calendar">Календарь</a>
                    <a class="admin-nav-sublink${activeStaffSection === "assignments" ? " admin-nav-sublink-active" : ""}" href="/admin/staff?section=assignments">График</a>
                  </div>`
                : "";
              return `<div class="admin-nav-item-shell${isStaffItem ? " admin-nav-item-shell-staff" : ""}">
                <a class="admin-nav-link${isActiveItem ? " admin-nav-link-active" : ""}${isStaffItem && activeStaffSection ? " admin-nav-link-parent-active" : ""}" href="${item.path}">${escapeHtml(item.label)}</a>
                ${staffSubnav}
              </div>`;
            })
            .join("")}
        </div>`;
      })
      .filter(Boolean)
      .join("");

    return `
      <div class="admin-sidebar-card admin-sidebar-workspace-card">
        <div class="admin-sidebar-top">
          <div class="admin-brand admin-sidebar-brand">
          <div class="admin-brand-mark">S</div>
          <div class="admin-sidebar-brand-copy">
            <p class="admin-sidebar-label">SHYNLI CLEANING</p>
            <h2 class="admin-sidebar-title">Панель управления</h2>
          </div>
        </div>
        <p class="admin-sidebar-copy">Основные рабочие разделы.</p>
        </div>
      ${roleBadge}
      <nav class="admin-nav admin-sidebar-nav">
          ${navMarkup}
        </nav>
        <div class="admin-inline-actions admin-sidebar-actions">
          <form class="admin-logout-form" method="post" action="${logoutPath}">
            <button class="admin-sidebar-logout-button" type="submit">
              <span class="admin-sidebar-logout-copy">
                <span class="admin-sidebar-logout-title">Выйти</span>
                <span class="admin-sidebar-logout-hint">Завершить сессию и вернуться ко входу</span>
              </span>
              <span class="admin-sidebar-logout-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M10.75 4.75a.75.75 0 0 1 0 1.5H6.5a.75.75 0 0 0-.75.75v10a.75.75 0 0 0 .75.75h4.25a.75.75 0 0 1 0 1.5H6.5a2.25 2.25 0 0 1-2.25-2.25V7A2.25 2.25 0 0 1 6.5 4.75h4.25Zm4.72 2.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H9.75a.75.75 0 0 1 0-1.5h8.69l-2.97-2.97a.75.75 0 0 1 0-1.06Z" fill="currentColor"/>
                </svg>
              </span>
            </button>
          </form>
        </div>
      </div>`;
  }

  function renderAdminLayout(title, content, options = {}) {
    const pageTitle = `${title} | SHYNLI CLEANING`;
    const subtitle = options.subtitle ? `<p class="admin-subtitle">${escapeHtml(options.subtitle)}</p>` : "";
    const heroMeta = options.heroMeta ? `<div class="admin-hero-meta">${options.heroMeta}</div>` : "";
    const heroActions = options.heroActions ? `<div class="admin-hero-actions">${options.heroActions}</div>` : "";
    const bodyScripts = options.bodyScripts || "";
    const kicker = options.kicker === false ? "" : escapeHtml(options.kicker || "SHYNLI CLEANING");
    const sidebar = options.sidebar ? `<aside class="admin-sidebar">${options.sidebar}</aside>` : "";
    const shellClass = options.sidebar ? "admin-shell admin-shell-with-sidebar" : "admin-shell";

    return `<!DOCTYPE html>
  <html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>${escapeHtml(pageTitle)}</title>
    <style>
      :root {
        --background: #f6f7fb;
        --foreground: #18181b;
        --card: rgba(255, 255, 255, 0.94);
        --card-muted: rgba(250, 250, 251, 0.96);
        --border: #e4e4e7;
        --input: #d4d4d8;
        --muted: #71717a;
        --muted-foreground: #52525b;
        --accent: #9e435a;
        --accent-foreground: #ffffff;
        --accent-soft: rgba(158, 67, 90, 0.12);
        --success: #0f766e;
        --success-soft: rgba(15, 118, 110, 0.12);
        --danger: #b91c1c;
        --danger-soft: rgba(185, 28, 28, 0.10);
        --shadow-lg: 0 28px 70px rgba(24, 24, 27, 0.10);
        --shadow-sm: 0 1px 2px rgba(24, 24, 27, 0.05);
        --radius-xl: 28px;
        --radius-lg: 22px;
        --radius-md: 16px;
        --radius-sm: 12px;
        --page-top-offset: 20px;
      }
      * { box-sizing: border-box; }
      html {
        color-scheme: light;
        scrollbar-gutter: stable;
      }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Montserrat", "Segoe UI", sans-serif;
        color: var(--foreground);
        background:
          radial-gradient(circle at top left, rgba(158, 67, 90, 0.10), transparent 32%),
          radial-gradient(circle at top right, rgba(99, 102, 241, 0.08), transparent 24%),
          linear-gradient(180deg, #fcfcfd 0%, var(--background) 100%);
        padding: var(--page-top-offset) 0 40px;
      }
      html.admin-dialog-open,
      body.admin-dialog-open {
        overflow: hidden;
      }
      a {
        color: inherit;
        text-decoration-color: rgba(158, 67, 90, 0.28);
        text-underline-offset: 3px;
      }
      code {
        font-family: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.92em;
        background: rgba(24, 24, 27, 0.04);
        border: 1px solid rgba(24, 24, 27, 0.05);
        padding: 0.16em 0.42em;
        border-radius: 999px;
      }
      .admin-shell {
        width: 100%;
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }
      .admin-shell-with-sidebar {
        grid-template-columns: 280px minmax(0, 1fr);
        align-items: start;
      }
      .admin-sidebar {
        display: grid;
        gap: 16px;
        position: sticky;
        top: var(--page-top-offset);
      }
      .admin-sidebar-card,
      .admin-panel {
        border: 1px solid var(--border);
        border-radius: var(--radius-xl);
        background: var(--card);
        box-shadow: var(--shadow-lg);
        backdrop-filter: blur(18px);
        min-width: 0;
      }
      .admin-sidebar-card {
        padding: 22px;
        box-shadow: var(--shadow-sm);
      }
      .admin-sidebar-card-muted,
      .admin-card-muted {
        background: var(--card-muted);
      }
      .admin-brand {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 12px;
      }
      .admin-brand-mark {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 14px;
        background: linear-gradient(135deg, var(--accent), #c55d78);
        color: var(--accent-foreground);
        font-size: 20px;
        font-weight: 700;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.28);
      }
      .admin-sidebar-label {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .admin-sidebar-title {
        margin: 4px 0 0;
        font-size: 20px;
        line-height: 1.2;
      }
      .admin-sidebar-workspace-card {
        display: grid;
        gap: 14px;
      }
      .admin-sidebar-top {
        display: grid;
        gap: 10px;
      }
      .admin-sidebar-brand {
        margin-bottom: 0;
        align-items: flex-start;
      }
      .admin-sidebar-brand-copy {
        display: grid;
        gap: 4px;
      }
      .admin-sidebar-copy {
        margin: 0;
        color: var(--muted-foreground);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-step-list,
      .admin-nav,
      .admin-badge-row,
      .admin-property-list,
      .admin-content,
      .admin-feature-list,
      .admin-link-grid,
      .admin-stats-grid,
      .admin-section-grid,
      .admin-form,
      .admin-form-grid {
        display: grid;
        gap: 14px;
      }
      .admin-step {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr);
        gap: 12px;
        padding: 14px;
        border: 1px solid transparent;
        border-radius: var(--radius-md);
        background: rgba(24, 24, 27, 0.02);
      }
      .admin-step-active {
        border-color: rgba(158, 67, 90, 0.22);
        background: linear-gradient(180deg, rgba(158, 67, 90, 0.10), rgba(255,255,255,0.88));
      }
      .admin-step-index {
        display: grid;
        place-items: center;
        height: 36px;
        border-radius: 12px;
        background: rgba(24, 24, 27, 0.06);
        font-size: 12px;
        font-weight: 700;
        color: var(--muted-foreground);
      }
      .admin-step-active .admin-step-index {
        background: rgba(158, 67, 90, 0.16);
        color: var(--accent);
      }
      .admin-step-copy {
        display: grid;
        gap: 4px;
      }
      .admin-step-copy strong {
        font-size: 14px;
      }
      .admin-step-copy span {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-nav-link,
      .admin-link-tile {
        display: block;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 13px 14px;
        background: rgba(255,255,255,0.72);
        color: var(--foreground);
        text-decoration: none;
        transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
      }
      .admin-nav {
        gap: 8px;
      }
      .admin-sidebar-nav {
        gap: 6px;
      }
      .admin-nav-group {
        display: grid;
        gap: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }
      .admin-nav-group + .admin-nav-group {
        margin-top: 0;
        padding-top: 0;
        border-top: 0;
      }
      .admin-nav-link:hover,
      .admin-link-tile:hover {
        border-color: rgba(158, 67, 90, 0.24);
        background: rgba(255,255,255,0.96);
        transform: translateY(-1px);
      }
      .admin-nav-link {
        position: relative;
        display: flex;
        align-items: center;
        min-height: 42px;
        padding: 8px 15px 8px 18px;
        border-color: rgba(24, 24, 27, 0.07);
        border-radius: 15px;
        background: rgba(255,255,255,0.92);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.82);
        font-size: 15px;
        line-height: 1.2;
        font-weight: 500;
      }
      .admin-nav-link:hover {
        transform: none;
        border-color: rgba(158, 67, 90, 0.16);
        background: rgba(255,255,255,0.98);
        color: rgba(74, 31, 43, 0.96);
      }
      .admin-nav-item-shell {
        display: grid;
        gap: 0;
      }
      .admin-nav-item-shell-staff {
        gap: 8px;
      }
      .admin-nav-sublinks {
        display: grid;
        gap: 6px;
        padding-left: 18px;
      }
      .admin-nav-sublink {
        position: relative;
        display: flex;
        align-items: center;
        min-height: 32px;
        padding: 4px 12px 4px 22px;
        border-radius: 12px;
        color: var(--muted-foreground);
        font-size: 14px;
        font-weight: 600;
        line-height: 1.2;
        text-decoration: none;
        transition: background 0.18s ease, color 0.18s ease;
      }
      .admin-nav-sublink::before {
        content: "";
        position: absolute;
        left: 8px;
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: rgba(158, 67, 90, 0.22);
      }
      .admin-nav-sublink:hover {
        background: rgba(158, 67, 90, 0.08);
        color: rgba(74, 31, 43, 0.96);
      }
      .admin-nav-sublink-active {
        background: rgba(158, 67, 90, 0.12);
        color: var(--accent);
      }
      .admin-nav-sublink-active::before {
        background: var(--accent);
      }
      .admin-nav-link-parent-active {
        border-color: rgba(158, 67, 90, 0.14);
        color: rgba(74, 31, 43, 0.96);
      }
      .admin-nav-link-active {
        border-color: rgba(158, 67, 90, 0.2);
        background: linear-gradient(180deg, rgba(158, 67, 90, 0.08), rgba(255,255,255,0.98));
        color: var(--accent);
        font-weight: 700;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);
      }
      .admin-nav-link-active::before {
        content: "";
        position: absolute;
        top: 10px;
        bottom: 10px;
        left: 10px;
        width: 3px;
        border-radius: 999px;
        background: linear-gradient(180deg, var(--accent), #d36f89);
      }
      .admin-link-tile strong {
        display: block;
        font-size: 14px;
        margin-bottom: 6px;
      }
      .admin-link-tile span {
        display: block;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-divider {
        height: 1px;
        background: var(--border);
        margin: 4px 0;
      }
      .admin-panel {
        overflow: hidden;
      }
      .admin-hero {
        padding: 28px 30px 18px;
        border-bottom: 1px solid rgba(228, 228, 231, 0.88);
        background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,250,251,0.68));
      }
      .admin-hero-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 18px;
        flex-wrap: wrap;
      }
      .admin-hero-copy {
        min-width: 0;
        flex: 1 1 560px;
      }
      .admin-kicker {
        margin: 0 0 10px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .admin-title {
        margin: 0;
        font-size: clamp(30px, 4vw, 40px);
        line-height: 1.05;
        letter-spacing: -0.04em;
      }
      .admin-subtitle {
        margin: 12px 0 0;
        max-width: 760px;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.7;
      }
      .admin-hero-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 18px;
      }
      .admin-hero-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
        gap: 12px;
        flex: 0 0 auto;
      }
      .admin-hero-actions .admin-dialog-launcher {
        gap: 0;
      }
      .admin-dialog-launcher-inline {
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }
      .admin-content {
        padding: 24px 30px 30px;
        min-width: 0;
      }
      .admin-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.82));
        box-shadow: var(--shadow-sm);
      }
      .admin-card-header {
        padding: 20px 20px 0;
        display: grid;
        gap: 6px;
      }
      .admin-card-eyebrow {
        margin: 0;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-card-title {
        margin: 0;
        font-size: 18px;
        line-height: 1.2;
      }
      .admin-card-description {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
      }
      .admin-card-content {
        padding: 20px;
        display: grid;
        gap: 16px;
      }
      .admin-stats-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .admin-section-grid {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }
      .admin-form {
        max-width: 520px;
      }
      .admin-form-grid-two {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }
      .admin-form-grid-three {
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        align-items: end;
      }
      .admin-label {
        display: grid;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        color: var(--foreground);
      }
      .admin-field-hint {
        margin: -2px 0 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
        font-weight: 500;
      }
      .admin-field-note {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .account-signature-field {
        display: grid;
        gap: 12px;
      }
      [data-account-w9-field][data-invalid="true"] {
        color: var(--danger);
      }
      [data-account-w9-field][data-invalid="true"] .admin-input {
        border-color: rgba(185, 28, 28, 0.42);
        background: rgba(185, 28, 28, 0.04);
        box-shadow: 0 0 0 4px rgba(185, 28, 28, 0.08);
      }
      [data-account-w9-field][data-invalid="true"] .admin-field-hint,
      [data-account-w9-field][data-invalid="true"] .admin-field-note {
        color: rgba(146, 38, 38, 0.88);
      }
      [data-account-w9-field="certificationConfirmed"][data-invalid="true"] {
        padding: 12px 14px;
        border: 1px solid rgba(185, 28, 28, 0.26);
        border-radius: var(--radius-sm);
        background: rgba(185, 28, 28, 0.04);
      }
      .account-signature-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
      }
      .account-signature-label {
        display: inline-block;
        margin-bottom: 4px;
        font-size: 14px;
        font-weight: 700;
        color: var(--foreground);
      }
      .account-signature-clear {
        min-width: 128px;
        white-space: nowrap;
      }
      .account-signature-clear:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .account-signature-surface {
        position: relative;
        border: 1px dashed rgba(158, 67, 90, 0.34);
        border-radius: var(--radius-md);
        background:
          linear-gradient(180deg, rgba(158, 67, 90, 0.03), rgba(255, 255, 255, 0.92)),
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent 30px,
            rgba(24, 24, 27, 0.04) 30px,
            rgba(24, 24, 27, 0.04) 31px
          );
        overflow: hidden;
      }
      .account-signature-field[data-invalid="true"] .account-signature-surface {
        border-color: rgba(185, 28, 28, 0.42);
        box-shadow: 0 0 0 4px rgba(185, 28, 28, 0.08);
      }
      .account-signature-surface::after {
        content: "Подпишите здесь";
        position: absolute;
        left: 18px;
        bottom: 16px;
        color: rgba(113, 113, 122, 0.78);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.01em;
        pointer-events: none;
      }
      .account-signature-field[data-has-signature="true"] .account-signature-surface::after {
        opacity: 0;
      }
      .account-signature-canvas {
        display: block;
        width: 100%;
        height: auto;
        min-height: 220px;
        aspect-ratio: 900 / 320;
        cursor: crosshair;
        touch-action: none;
        user-select: none;
      }
      .account-signature-canvas:focus {
        outline: none;
        box-shadow: inset 0 0 0 3px rgba(158, 67, 90, 0.12);
      }
      [data-account-signature-status][data-tone="success"] {
        color: var(--success);
      }
      [data-account-signature-status][data-tone="danger"] {
        color: var(--danger);
      }
      .admin-input {
        width: 100%;
        height: 46px;
        border: 1px solid var(--input);
        border-radius: var(--radius-sm);
        padding: 0 14px;
        font: inherit;
        background: rgba(255,255,255,0.9);
        color: var(--foreground);
        transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
      }
      .admin-input::placeholder {
        color: #a1a1aa;
      }
      select.admin-input {
        padding-right: 40px;
      }
      textarea.admin-input {
        min-height: 120px;
        height: auto;
        padding-top: 12px;
        padding-bottom: 12px;
        resize: vertical;
      }
      .admin-input:focus {
        outline: none;
        border-color: rgba(158, 67, 90, 0.48);
        box-shadow: 0 0 0 4px rgba(158, 67, 90, 0.12);
        background: #fff;
      }
      .admin-phone-field {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 46px;
        padding: 0 14px;
        border: 1px solid var(--input);
        border-radius: var(--radius-sm);
        background: rgba(255,255,255,0.9);
        transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
      }
      .admin-phone-field:focus-within {
        border-color: rgba(158, 67, 90, 0.48);
        box-shadow: 0 0 0 4px rgba(158, 67, 90, 0.12);
        background: #fff;
      }
      .admin-phone-prefix {
        flex: 0 0 auto;
        color: var(--foreground);
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .admin-phone-field .admin-input {
        height: 44px;
        border: 0;
        border-radius: 0;
        padding: 0;
        background: transparent;
        box-shadow: none;
        min-width: 0;
      }
      .admin-phone-field .admin-input:focus {
        border-color: transparent;
        box-shadow: none;
        background: transparent;
      }
      .admin-picker-field {
        position: relative;
      }
      .admin-picker-display {
        padding-right: 56px;
      }
      .admin-picker-native {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        border: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        clip-path: inset(50%);
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
      }
      .admin-picker-trigger {
        position: absolute;
        top: 50%;
        right: 10px;
        transform: translateY(-50%);
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--muted-foreground);
        cursor: pointer;
        transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
      }
      .admin-picker-trigger:hover {
        background: rgba(24, 24, 27, 0.06);
        color: var(--foreground);
      }
      .admin-picker-trigger:focus-visible {
        outline: none;
        background: rgba(158, 67, 90, 0.10);
        color: var(--accent);
        box-shadow: 0 0 0 3px rgba(158, 67, 90, 0.14);
      }
      .admin-picker-trigger svg {
        width: 20px;
        height: 20px;
      }
      .admin-time-picker-panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 40;
        width: min(320px, calc(100vw - 40px));
        display: grid;
        gap: 10px;
        padding: 12px;
        border: 1px solid rgba(228, 228, 231, 0.96);
        border-radius: 16px;
        background: rgba(255,255,255,0.98);
        box-shadow: var(--shadow-lg);
      }
      .admin-time-picker-panel[hidden] {
        display: none;
      }
      .admin-time-picker-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .admin-time-picker-cell {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      .admin-time-picker-label {
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-time-picker-select {
        min-width: 0;
        padding-right: 32px;
      }
      .admin-input-code {
        text-align: center;
        letter-spacing: 0.24em;
        font-size: 24px;
        font-weight: 700;
      }
      .admin-address-field {
        display: grid;
        gap: 8px;
      }
      .admin-address-suggestions {
        position: relative;
        display: grid;
        gap: 4px;
        padding: 8px;
        border: 1px solid rgba(228, 228, 231, 0.96);
        border-radius: 16px;
        background: rgba(255,255,255,0.98);
        box-shadow: 0 18px 38px rgba(24, 24, 27, 0.12);
        backdrop-filter: blur(16px);
      }
      .admin-address-suggestions[hidden] {
        display: none;
      }
      .admin-address-suggestion {
        width: 100%;
        padding: 12px 14px;
        border: 0;
        border-radius: 12px;
        background: transparent;
        color: var(--foreground);
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background 0.18s ease, color 0.18s ease;
      }
      .admin-address-suggestion:hover,
      .admin-address-suggestion:focus-visible {
        outline: none;
        background: rgba(158, 67, 90, 0.08);
      }
      .admin-address-suggestion-main {
        display: block;
        font-size: 14px;
        line-height: 1.45;
        font-weight: 700;
      }
      .admin-address-suggestion-copy {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .admin-inline-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
      }
      .admin-inline-actions-end {
        justify-content: flex-end;
        margin-left: auto;
      }
      .admin-dialog-actions-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .admin-sidebar-actions {
        margin-top: 4px;
        padding-top: 14px;
        border-top: 1px solid rgba(24, 24, 27, 0.08);
      }
      .admin-sidebar-role-badge {
        margin: -2px 0 2px;
      }
      .admin-sidebar-role-badge .admin-badge {
        width: 100%;
        min-height: 32px;
        padding: 0 14px;
        border-radius: 999px;
        letter-spacing: 0.06em;
      }
      .admin-sidebar-logout-button {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 14px 16px;
        border: 1px solid rgba(158, 67, 90, 0.14);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,245,247,0.96));
        color: var(--foreground);
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        box-shadow: 0 10px 22px rgba(24, 24, 27, 0.06);
      }
      .admin-sidebar-logout-button:hover {
        transform: translateY(-1px);
        border-color: rgba(158, 67, 90, 0.22);
        background: linear-gradient(180deg, rgba(255,255,255,1), rgba(249,245,247,0.98));
        box-shadow: 0 14px 28px rgba(24, 24, 27, 0.08);
      }
      .admin-sidebar-logout-button:focus-visible {
        outline: none;
        border-color: rgba(158, 67, 90, 0.32);
        box-shadow: 0 0 0 4px rgba(158, 67, 90, 0.12);
      }
      .admin-sidebar-logout-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .admin-sidebar-logout-title {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.2;
      }
      .admin-sidebar-logout-hint {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .admin-sidebar-logout-icon {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 999px;
        background: rgba(158, 67, 90, 0.12);
        color: var(--accent);
      }
      .admin-sidebar-logout-icon svg {
        width: 18px;
        height: 18px;
        display: block;
      }
      .admin-form-actions {
        grid-column: 1 / -1;
      }
      .admin-checkbox-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .admin-checkbox {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: rgba(255,255,255,0.84);
        cursor: pointer;
      }
      .admin-checkbox input {
        margin-top: 3px;
        accent-color: var(--accent);
      }
      .admin-checkbox span {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .admin-checkbox strong {
        font-size: 14px;
        line-height: 1.3;
      }
      .admin-checkbox small {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .admin-entry-list {
        display: grid;
        gap: 14px;
      }
      .admin-overview-tile-success {
        border-color: rgba(15, 118, 110, 0.18);
        background: linear-gradient(180deg, rgba(15, 118, 110, 0.10), rgba(255,255,255,0.94));
      }
      .admin-overview-tile-danger {
        border-color: rgba(185, 28, 28, 0.18);
        background: linear-gradient(180deg, rgba(185, 28, 28, 0.08), rgba(255,255,255,0.94));
      }
      .admin-quote-ops-page,
      .admin-quote-ops-main,
      .admin-quote-ops-side,
      .admin-quote-lanes {
        display: grid;
        gap: 18px;
        min-width: 0;
      }
      .admin-quote-ops-overview {
        grid-template-columns: 1fr;
      }
      .admin-quote-ops-layout {
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(0, 1fr) 320px;
        align-items: start;
      }
      .admin-quote-ops-side {
        position: sticky;
        top: var(--page-top-offset);
      }
      .admin-quote-ops-filter-head,
      .admin-quote-lane-head,
      .admin-quote-entry-head,
      .admin-quote-entry-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px 18px;
        flex-wrap: wrap;
      }
      .admin-quote-ops-panel-kicker,
      .admin-quote-lane-kicker {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-quote-ops-panel-kicker,
      .admin-quote-lane-warning .admin-quote-lane-kicker {
        color: var(--accent);
      }
      .admin-quote-lane-success .admin-quote-lane-kicker {
        color: var(--success);
      }
      .admin-quote-lane-error .admin-quote-lane-kicker {
        color: var(--danger);
      }
      .admin-quote-ops-panel-title,
      .admin-quote-lane-title {
        margin: 6px 0 0;
        font-size: clamp(22px, 3vw, 28px);
        line-height: 1.1;
        letter-spacing: -0.03em;
      }
      .admin-quote-ops-panel-copy,
      .admin-quote-lane-copy {
        margin: 10px 0 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-quote-ops-filter-meta {
        display: grid;
        gap: 10px;
        padding: 16px 18px;
        border: 1px solid rgba(228, 228, 231, 0.9);
        border-radius: 18px;
        background: rgba(250,250,251,0.78);
      }
      .admin-quote-ops-filter-meta-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px 18px;
        flex-wrap: wrap;
      }
      .admin-quote-ops-filter-actions {
        display: grid;
        gap: 10px;
        justify-items: end;
        align-content: start;
      }
      .admin-quote-ops-filter-disclosure {
        width: 100%;
      }
      .admin-quote-ops-filter-disclosure[open] {
        width: 100%;
      }
      .admin-quote-ops-filter-actions .admin-quote-ops-filter-disclosure {
        width: auto;
      }
      .admin-quote-ops-filter-panel {
        display: grid;
        gap: 14px;
      }
      .admin-quote-ops-filter-form {
        display: grid;
        gap: 14px;
      }
      .admin-quote-ops-filter-inline-row {
        display: grid;
        gap: 14px 18px;
        grid-template-columns: minmax(280px, 1.2fr) repeat(2, minmax(180px, 220px)) auto;
        align-items: end;
      }
      .admin-quote-ops-filter-search {
        min-width: 0;
      }
      .admin-quote-ops-filter-inline-actions {
        justify-content: flex-end;
        flex-wrap: nowrap;
      }
      .admin-quote-ops-filter-hint {
        margin: 0;
      }
      .admin-quote-ops-filter-badges,
      .admin-quote-lane-meta,
      .admin-quote-entry-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .admin-quote-lane {
        padding: 20px;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,245,247,0.90));
        box-shadow: var(--shadow-sm);
        min-width: 0;
        max-width: 100%;
      }
      .admin-quote-lane-success {
        border-color: rgba(15, 118, 110, 0.16);
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(240,249,248,0.92));
      }
      .admin-quote-lane-warning {
        border-color: rgba(158, 67, 90, 0.18);
      }
      .admin-quote-lane-error {
        border-color: rgba(185, 28, 28, 0.18);
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(254,242,242,0.92));
      }
      .admin-quote-lane-list {
        display: grid;
        gap: 14px;
      }
      .admin-quote-table-wrap {
        width: 100%;
        max-width: 100%;
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
        touch-action: pan-x;
        overscroll-behavior-x: contain;
      }
      .admin-quote-success-table {
        min-width: 1380px;
      }
      .admin-quote-success-table th:nth-child(1),
      .admin-quote-success-table td:nth-child(1) {
        min-width: 320px;
      }
      .admin-quote-success-table th:nth-child(2),
      .admin-quote-success-table td:nth-child(2) {
        min-width: 380px;
      }
      .admin-quote-success-table th:nth-child(3),
      .admin-quote-success-table td:nth-child(3) {
        min-width: 320px;
      }
      .admin-quote-success-table th:nth-child(4),
      .admin-quote-success-table td:nth-child(4) {
        min-width: 240px;
      }
      .admin-quote-success-table th:nth-child(5),
      .admin-quote-success-table td:nth-child(5) {
        min-width: 140px;
      }
      .admin-quote-entry {
        position: relative;
        display: grid;
        gap: 16px;
        padding: 18px;
        border: 1px solid rgba(228, 228, 231, 0.94);
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,251,0.92));
        overflow: hidden;
      }
      .admin-quote-entry::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: var(--accent);
      }
      .admin-quote-entry-success {
        border-color: rgba(15, 118, 110, 0.18);
      }
      .admin-quote-entry-success::before {
        background: var(--success);
      }
      .admin-quote-entry-error {
        border-color: rgba(185, 28, 28, 0.18);
      }
      .admin-quote-entry-error::before {
        background: var(--danger);
      }
      .admin-quote-entry-main {
        display: grid;
        gap: 8px;
        min-width: 0;
        flex: 1 1 340px;
      }
      .admin-quote-entry-topline {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.4;
      }
      .admin-quote-entry-separator {
        width: 4px;
        height: 4px;
        border-radius: 999px;
        background: rgba(113, 113, 122, 0.45);
      }
      .admin-quote-entry-title {
        margin: 0;
        font-size: clamp(22px, 3vw, 28px);
        line-height: 1.08;
        letter-spacing: -0.04em;
        word-break: break-word;
      }
      .admin-quote-entry-title-button {
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .admin-quote-entry-title-button:hover,
      .admin-quote-entry-title-button:focus-visible {
        color: var(--accent);
      }
      .admin-quote-entry-copy {
        margin: 0;
        color: var(--muted-foreground);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-quote-entry-side {
        display: grid;
        gap: 10px;
        justify-items: end;
        min-width: 0;
      }
      .admin-quote-entry-amount {
        font-size: clamp(24px, 3vw, 30px);
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.04em;
      }
      .admin-quote-entry-crm-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .admin-quote-entry-crm-item,
      .admin-quote-entry-info {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 14px;
      }
      .admin-quote-entry-crm-item {
        padding: 12px 14px;
        background: rgba(248,249,252,0.9);
        display: grid;
        gap: 6px;
      }
      .admin-quote-entry-crm-label,
      .admin-quote-entry-info-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-quote-entry-crm-value,
      .admin-quote-entry-info-value {
        margin: 0;
        word-break: break-word;
      }
      .admin-quote-entry-crm-value {
        font-size: 14px;
        font-weight: 600;
        line-height: 1.5;
      }
      .admin-quote-entry-info-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-quote-entry-info {
        padding: 14px;
        background: rgba(255,255,255,0.9);
        display: grid;
        gap: 8px;
      }
      .admin-quote-entry-info-wide {
        grid-column: 1 / -1;
      }
      .admin-quote-entry-info-value {
        display: grid;
        gap: 4px;
        font-size: 14px;
        line-height: 1.6;
      }
      .admin-quote-entry-info-value span {
        display: block;
      }
      .admin-quote-entry-feedback {
        display: grid;
        gap: 6px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid transparent;
      }
      .admin-quote-entry-feedback strong {
        font-size: 13px;
        line-height: 1.35;
      }
      .admin-quote-entry-feedback span {
        color: var(--muted-foreground);
        font-size: 14px;
        line-height: 1.6;
      }
      .admin-quote-entry-feedback-warning {
        background: rgba(158, 67, 90, 0.08);
        border-color: rgba(158, 67, 90, 0.16);
      }
      .admin-quote-entry-feedback-warning strong {
        color: var(--accent);
      }
      .admin-quote-entry-feedback-error {
        background: var(--danger-soft);
        border-color: rgba(185, 28, 28, 0.16);
      }
      .admin-quote-entry-feedback-error strong {
        color: var(--danger);
      }
      .admin-quote-entry-footer .admin-action-hint {
        flex: 1 1 320px;
      }
      .admin-clients-layout {
        display: grid;
        gap: 20px;
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
      }
      .admin-overview-strip {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .admin-compact-summary-strip {
        display: grid;
        gap: 1px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        padding: 1px;
        border-radius: 20px;
        background: rgba(228, 228, 231, 0.92);
        box-shadow: var(--shadow-sm);
        overflow: hidden;
      }
      .admin-compact-summary-item {
        display: grid;
        gap: 8px;
        min-width: 0;
        padding: 14px 16px;
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,251,0.90));
      }
      .admin-compact-summary-item-accent {
        background: linear-gradient(180deg, rgba(158, 67, 90, 0.10), rgba(255,255,255,0.96));
      }
      .admin-compact-summary-item-success {
        background: linear-gradient(180deg, rgba(15, 118, 110, 0.10), rgba(255,255,255,0.96));
      }
      .admin-compact-summary-item-danger {
        background: linear-gradient(180deg, rgba(185, 28, 28, 0.08), rgba(255,255,255,0.96));
      }
      .admin-compact-summary-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .admin-compact-summary-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-compact-summary-value {
        margin: 0;
        font-size: 28px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.04em;
        white-space: nowrap;
      }
      .admin-compact-summary-copy {
        margin: 0;
        color: var(--muted-foreground);
        font-size: 12px;
        line-height: 1.45;
      }
      .admin-overview-tile {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,251,0.88));
        padding: 14px 16px;
        display: grid;
        gap: 6px;
      }
      .admin-overview-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-overview-value {
        margin: 0;
        font-size: 26px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.04em;
      }
      .admin-overview-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-diagnostics-strip {
        display: grid;
        gap: 12px;
        padding: 14px 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: linear-gradient(180deg, rgba(250,250,251,0.9), rgba(255,255,255,0.98));
      }
      .admin-diagnostics-head {
        display: grid;
        gap: 8px;
      }
      .admin-diagnostics-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .admin-diagnostics-card {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-sm);
        background: rgba(255,255,255,0.84);
        padding: 12px 14px;
      }
      .admin-diagnostics-label {
        display: block;
        margin-bottom: 6px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-diagnostics-value {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        word-break: break-word;
      }
      .admin-clients-card .admin-card-header {
        padding: 16px 18px 0;
        gap: 4px;
      }
      .admin-clients-card .admin-card-content {
        padding: 14px 18px 18px;
        gap: 12px;
      }
      .admin-clients-card .admin-card-title {
        font-size: 20px;
      }
      .admin-clients-card .admin-card-description {
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-orders-card .admin-card-header {
        padding: 16px 20px 0;
        gap: 4px;
      }
      .admin-orders-card .admin-card-content {
        padding-top: 14px;
      }
      .admin-orders-card .admin-card-title {
        font-size: 20px;
      }
      .admin-orders-card .admin-card-description {
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-clients-workspace {
        display: grid;
        gap: 12px;
      }
      .admin-orders-workspace {
        display: grid;
        gap: 14px;
      }
      .admin-orders-toolbar-shell {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 460px);
        align-items: start;
        gap: 12px 16px;
      }
      .admin-clients-toolbar-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 460px);
        align-items: start;
        gap: 12px 16px;
      }
      .admin-clients-toolbar-left {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        min-width: 0;
        position: relative;
        z-index: 12;
      }
      .admin-filter-disclosure {
        min-width: 0;
        position: relative;
      }
      .admin-filter-disclosure > summary {
        list-style: none;
      }
      .admin-filter-disclosure > summary::-webkit-details-marker {
        display: none;
      }
      .admin-filter-disclosure[open] {
        z-index: 18;
      }
      .admin-clients-toolbar-button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 0 14px;
        border: 1px solid rgba(212, 212, 216, 0.92);
        border-radius: 999px;
        background: rgba(255,255,255,0.96);
        box-shadow: none;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        color: var(--foreground);
        transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
      }
      .admin-clients-toolbar-button:hover {
        border-color: rgba(158, 67, 90, 0.28);
        background: #fff;
        transform: translateY(-1px);
      }
      .admin-filter-disclosure[open] > .admin-clients-toolbar-button {
        border-color: rgba(158, 67, 90, 0.32);
        background: rgba(158, 67, 90, 0.08);
        color: var(--accent);
      }
      .admin-clients-toolbar-button-secondary {
        background: rgba(250,250,251,0.96);
      }
      .admin-clients-toolbar-count {
        display: inline-grid;
        place-items: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 999px;
        background: rgba(158, 67, 90, 0.12);
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
      }
      .admin-filter-disclosure-panel {
        position: absolute;
        top: calc(100% + 10px);
        left: 0;
        width: min(760px, calc(100vw - 140px));
        min-width: 580px;
        margin-top: 0;
        padding: 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 18px;
        background: rgba(255,255,255,0.98);
        box-shadow: 0 22px 48px rgba(24, 24, 27, 0.12);
      }
      .admin-orders-filter-toggle {
        min-width: 0;
      }
      .admin-orders-filter-toggle[open] {
        z-index: auto;
      }
      .admin-orders-filter-inline-panel {
        grid-column: 1 / -1;
        position: static;
        width: 100%;
        min-width: 0;
        margin-top: 0;
        padding: 0 18px;
        border: 1px solid transparent;
        border-radius: 18px;
        background: rgba(255,255,255,0.98);
        box-shadow: none;
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        transform: translateY(-8px);
        transition:
          max-height 0.24s ease,
          opacity 0.18s ease,
          transform 0.24s ease,
          padding 0.24s ease,
          border-color 0.24s ease,
          box-shadow 0.24s ease;
      }
      .admin-orders-filter-toggle[open] + .admin-clients-search-form + .admin-orders-filter-inline-panel {
        padding: 16px 18px;
        border-color: rgba(228, 228, 231, 0.92);
        box-shadow: var(--shadow-sm);
        max-height: 320px;
        overflow: visible;
        opacity: 1;
        transform: translateY(0);
      }
      .admin-clients-toolbar-disclosure[open] {
        width: auto;
      }
      .admin-clients-filter-bar {
        display: grid;
        gap: 10px 12px;
        grid-template-columns: repeat(3, minmax(160px, 1fr)) auto;
        align-items: end;
      }
      .admin-orders-filter-bar {
        display: grid;
        gap: 12px 14px;
        grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
        align-items: end;
      }
      .admin-clients-filter-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-start;
        align-items: center;
        align-self: end;
      }
      .admin-clients-filter-actions .admin-button,
      .admin-clients-filter-actions .admin-link-button {
        min-height: 40px;
        padding: 0 14px;
        box-shadow: none;
      }
      .admin-clients-search-form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 8px;
        width: 100%;
        max-width: 460px;
        margin-left: auto;
      }
      .admin-clients-search-box {
        position: relative;
        min-width: 0;
        max-width: none;
      }
      .admin-clients-search-icon {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--muted);
        font-size: 16px;
        line-height: 1;
        pointer-events: none;
      }
      .admin-clients-search-input {
        height: 42px;
        padding-left: 40px;
        border-radius: 14px;
        background: rgba(255,255,255,0.98);
      }
      .admin-clients-search-submit {
        min-height: 42px;
        padding: 0 16px;
        box-shadow: none;
      }
      .admin-clients-toolbar-link {
        color: var(--muted-foreground);
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
        white-space: nowrap;
      }
      .admin-clients-toolbar-link:hover {
        color: var(--accent);
        text-decoration: underline;
      }
      .admin-badge-row-inline {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-clients-meta-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px 14px;
      }
      .admin-clients-meta-main {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      .admin-clients-active-badges {
        gap: 6px;
      }
      .admin-clients-summary-copy {
        margin: 0;
        max-width: none;
        color: var(--muted-foreground);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-clients-meta-hint {
        text-align: right;
        white-space: nowrap;
      }
      .admin-clients-diagnostics-disclosure .admin-filter-disclosure-panel {
        width: min(560px, calc(100vw - 140px));
        min-width: 420px;
        background: rgba(250,250,251,0.98);
      }
      .admin-table-wrap {
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        scrollbar-gutter: stable both-edges;
        padding-bottom: 2px;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.88);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.36);
      }
      .admin-inline-badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-clients-table-wrap {
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
      }
      .admin-orders-table-wrap {
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
      }
      .admin-staff-table-wrap {
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
      }
      .admin-settings-table-wrap {
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
      }
      .admin-table {
        width: max-content;
        min-width: 100%;
        border-collapse: collapse;
        table-layout: auto;
      }
      .admin-clients-table {
        min-width: 1160px;
      }
      .admin-orders-table {
        min-width: 1240px;
      }
      .admin-staff-table {
        min-width: 1320px;
      }
      .admin-settings-users-table {
        min-width: 1120px;
      }
      .admin-settings-checklists-table {
        min-width: 980px;
      }
      .admin-staff-schedule-table {
        min-width: 1120px;
      }
      .admin-table th,
      .admin-table td {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(228, 228, 231, 0.92);
        vertical-align: top;
        text-align: left;
        min-width: 0;
      }
      .admin-table:not(.admin-team-calendar-table) th,
      .admin-table:not(.admin-team-calendar-table) td {
        white-space: nowrap;
      }
      .admin-table th {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
        background: rgba(250,250,251,0.98);
        white-space: nowrap;
      }
      .admin-settings-users-table th,
      .admin-settings-users-table td,
      .admin-settings-checklists-table th,
      .admin-settings-checklists-table td {
        white-space: normal;
      }
      .admin-clients-table th,
      .admin-clients-table td {
        padding: 14px 16px;
      }
      .admin-orders-table th,
      .admin-orders-table td {
        padding: 14px 16px;
      }
      .admin-staff-table th,
      .admin-staff-table td {
        padding: 14px 16px;
      }
      .admin-staff-table th:nth-child(1),
      .admin-staff-table td:nth-child(1) {
        width: 320px;
        min-width: 320px;
      }
      .admin-staff-table th:nth-child(2),
      .admin-staff-table td:nth-child(2) {
        width: 300px;
        min-width: 300px;
      }
      .admin-staff-table th:nth-child(3),
      .admin-staff-table td:nth-child(3) {
        width: 180px;
        min-width: 180px;
      }
      .admin-staff-table th:nth-child(4),
      .admin-staff-table td:nth-child(4) {
        width: 220px;
        min-width: 220px;
      }
      .admin-staff-table th:nth-child(5),
      .admin-staff-table td:nth-child(5) {
        width: 300px;
        min-width: 300px;
      }
      .admin-staff-schedule-table th,
      .admin-staff-schedule-table td {
        padding: 14px 16px;
      }
      .admin-clients-table th {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: none;
        color: #4d5a72;
        background: rgba(248,249,252,0.98);
      }
      .admin-orders-table th {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: none;
        color: #4d5a72;
        background: rgba(248,249,252,0.98);
      }
      .admin-staff-table th {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: none;
        color: #4d5a72;
        background: rgba(248,249,252,0.98);
      }
      .admin-staff-schedule-table th {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: none;
        color: #4d5a72;
        background: rgba(248,249,252,0.98);
      }
      .admin-team-calendar-shell {
        display: grid;
        gap: 14px;
      }
      .admin-team-calendar-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px 16px;
      }
      .admin-team-calendar-copy {
        display: grid;
        gap: 4px;
      }
      .admin-team-calendar-range {
        font-size: 15px;
        line-height: 1.3;
      }
      .admin-team-calendar-meta {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-team-calendar-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .admin-team-calendar-wrap {
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 4px;
        cursor: grab;
        touch-action: pan-x;
        overscroll-behavior-x: contain;
      }
      .admin-team-calendar-wrap.admin-team-calendar-wrap-dragging,
      .admin-team-calendar-wrap.admin-team-calendar-wrap-dragging * {
        cursor: grabbing !important;
        user-select: none;
      }
      .admin-team-calendar-table {
        width: max(100%, calc(220px + (var(--admin-team-calendar-days, 7) * 200px)));
        min-width: max-content;
        border-collapse: separate;
        border-spacing: 0;
        table-layout: fixed;
      }
      .admin-team-calendar-table th,
      .admin-team-calendar-table td {
        padding: 10px 12px;
        vertical-align: top;
      }
      .admin-team-calendar-table th:not(.admin-team-calendar-staff-col),
      .admin-team-calendar-table td:not(.admin-team-calendar-staff-col) {
        width: 200px;
        min-width: 200px;
        border-left: 2px solid rgba(203, 213, 225, 0.72);
        position: relative;
        z-index: 1;
      }
      .admin-team-calendar-table th:last-child,
      .admin-team-calendar-table td:last-child {
        border-right: 2px solid rgba(203, 213, 225, 0.72);
      }
      .admin-team-calendar-staff-col {
        position: sticky;
        left: 0;
        z-index: 8;
        width: 220px;
        min-width: 220px;
        background: #ffffff !important;
        isolation: isolate;
      }
      .admin-team-calendar-staff-col::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        background: #ffffff;
        box-shadow:
          inset -1px 0 0 rgba(203, 213, 225, 0.9),
          14px 0 0 #ffffff,
          18px 0 22px rgba(15, 23, 42, 0.08);
        pointer-events: none;
      }
      .admin-team-calendar-table thead .admin-team-calendar-staff-col {
        z-index: 9;
        background: #f8f9fc !important;
      }
      .admin-team-calendar-table thead .admin-team-calendar-staff-col::before {
        background: #f8f9fc;
        box-shadow:
          inset -1px 0 0 rgba(203, 213, 225, 0.9),
          14px 0 0 #f8f9fc,
          18px 0 22px rgba(15, 23, 42, 0.08);
      }
      .admin-team-calendar-day-head {
        display: grid;
        gap: 1px;
      }
      .admin-team-calendar-day-weekday {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: #4d5a72;
      }
      .admin-team-calendar-day-date {
        font-size: 12px;
        font-weight: 600;
        color: #1f2937;
      }
      .admin-team-calendar-cell {
        display: grid;
        gap: 6px;
        min-height: 40px;
        min-width: 0;
        overflow: hidden;
      }
      .admin-team-calendar-empty {
        min-height: 40px;
        display: grid;
        place-items: center;
        color: var(--muted);
        font-size: 12px;
      }
      .admin-team-calendar-staff-col .admin-table-stack {
        gap: 3px;
      }
      .admin-team-calendar-staff-col .admin-inline-badge-row {
        gap: 6px;
      }
      .admin-team-calendar-staff-col .admin-badge {
        min-height: 24px;
        padding: 0 8px;
        font-size: 11px;
      }
      .admin-team-calendar-entry {
        display: grid;
        gap: 3px;
        width: 100%;
        min-width: 0;
        padding: 8px 9px;
        border-radius: 12px;
        border: 1px solid rgba(24, 24, 27, 0.08);
        background: rgba(255,255,255,0.94);
        overflow: hidden;
      }
      .admin-team-calendar-entry-button {
        appearance: none;
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: pointer;
      }
      .admin-team-calendar-entry-button:hover {
        border-color: rgba(158, 67, 90, 0.24);
        box-shadow: 0 6px 20px rgba(158, 67, 90, 0.08);
      }
      .admin-team-calendar-entry-button:focus-visible {
        outline: 2px solid rgba(158, 67, 90, 0.32);
        outline-offset: 2px;
      }
      .admin-team-calendar-entry-order {
        background: rgba(158, 67, 90, 0.06);
        border-color: rgba(158, 67, 90, 0.16);
      }
      .admin-team-calendar-entry-order-confirmed {
        background: rgba(158, 67, 90, 0.08);
      }
      .admin-team-calendar-entry-order-completed {
        background: rgba(14, 116, 144, 0.08);
        border-color: rgba(14, 116, 144, 0.16);
      }
      .admin-team-calendar-entry-order-issue {
        background: rgba(185, 28, 28, 0.08);
        border-color: rgba(185, 28, 28, 0.18);
      }
      .admin-team-calendar-entry-unavailable {
        background: rgba(75, 85, 99, 0.08);
        border-color: rgba(75, 85, 99, 0.14);
      }
      .admin-team-calendar-entry-head {
        display: grid;
        grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
        align-items: start;
        gap: 6px;
      }
      .admin-team-calendar-entry-time,
      .admin-team-calendar-entry-status {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.01em;
        text-transform: uppercase;
        line-height: 1.15;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-team-calendar-entry-time {
        color: #334155;
      }
      .admin-team-calendar-entry-status {
        color: rgba(31, 41, 55, 0.68);
        justify-self: end;
        text-align: right;
      }
      .admin-team-calendar-entry-title {
        font-size: 12px;
        line-height: 1.25;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .admin-team-calendar-entry-copy {
        color: var(--muted);
        font-size: 11px;
        line-height: 1.3;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .admin-table tbody tr:last-child td {
        border-bottom: 0;
      }
      .admin-table tbody tr:hover td {
        background: rgba(158, 67, 90, 0.04);
      }
      .admin-table-row-clickable {
        cursor: pointer;
        outline: none;
      }
      .admin-table-row-clickable:focus-visible td,
      .admin-table-row-clickable:focus-within td {
        background: rgba(158, 67, 90, 0.08);
      }
      .admin-table-row-clickable:focus-visible td:first-child,
      .admin-table-row-clickable:focus-within td:first-child {
        box-shadow: inset 4px 0 0 var(--accent);
      }
      .admin-table-row-active td {
        background: rgba(158, 67, 90, 0.08);
      }
      .admin-table-row-active td:first-child {
        box-shadow: inset 4px 0 0 var(--accent);
      }
      .admin-table-link {
        font-weight: 700;
        font-size: 15px;
        line-height: 1.2;
        text-decoration: none;
      }
      .admin-staff-table .admin-table-link {
        display: inline-block;
        white-space: nowrap;
      }
      .admin-table-link:hover {
        text-decoration: underline;
        text-decoration-color: rgba(158, 67, 90, 0.28);
      }
      .admin-table-link-button {
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .admin-table-link-button:hover {
        color: var(--accent);
      }
      .admin-client-table-cell {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .admin-table .admin-client-avatar {
        width: 38px;
        height: 38px;
        font-size: 15px;
      }
      .admin-staff-table .admin-client-table-cell {
        min-width: 260px;
      }
      .admin-client-avatar {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        border: 1px solid rgba(228, 228, 231, 0.96);
        display: grid;
        place-items: center;
        flex: none;
        font-size: 16px;
        font-weight: 700;
        color: #30405f;
      }
      .admin-client-avatar-tone-1 {
        background: #e9f1ff;
      }
      .admin-client-avatar-tone-2 {
        background: #edf8df;
      }
      .admin-client-avatar-tone-3 {
        background: #ffefdf;
      }
      .admin-client-avatar-tone-4 {
        background: #e7f7f3;
      }
      .admin-client-avatar-tone-5 {
        background: #f4ecef;
      }
      .admin-table-stack {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .admin-table-cell-stack {
        display: grid;
        gap: 3px;
        min-width: 0;
      }
      .admin-travel-estimate-list {
        display: grid;
        gap: 10px;
      }
      .admin-travel-estimate-list-compact {
        gap: 8px;
      }
      .admin-travel-estimate-stack {
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(158, 67, 90, 0.12);
        background: rgba(250, 246, 247, 0.84);
      }
      .admin-client-address-preview-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        min-width: 0;
      }
      .admin-client-address-preview-item,
      .admin-client-address-preview-more {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 5px 9px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 999px;
        background: rgba(250, 250, 251, 0.96);
        font-size: 12px;
        line-height: 1.35;
      }
      .admin-client-address-preview-item {
        max-width: 100%;
        color: var(--foreground);
        word-break: break-word;
      }
      .admin-client-address-preview-more {
        background: var(--accent-soft);
        border-color: rgba(158, 67, 90, 0.18);
        color: var(--accent);
        font-weight: 700;
        white-space: nowrap;
      }
      .admin-table-strong {
        font-weight: 600;
        line-height: 1.3;
      }
      .admin-table-muted {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.35;
      }
      .admin-table:not(.admin-team-calendar-table) .admin-line-clamp-two {
        display: block;
        -webkit-line-clamp: unset;
        overflow: visible;
        white-space: inherit;
      }
      .admin-line-clamp-two {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }
      .admin-table-number {
        white-space: nowrap;
        font-weight: 600;
      }
      .admin-staff-table-actions {
        width: 132px;
      }
      .admin-client-panel-head {
        display: grid;
        gap: 14px;
      }
      .admin-client-title-block {
        display: grid;
        gap: 6px;
      }
      .admin-client-title {
        margin: 0;
        font-size: clamp(22px, 2vw, 30px);
        line-height: 1.15;
        word-break: break-word;
      }
      .admin-client-dialog-panel {
        gap: 16px;
      }
      .admin-client-dialog-intro {
        gap: 0;
      }
      .admin-client-dialog-title-row {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
      }
      .admin-client-avatar-large {
        width: 56px;
        height: 56px;
        font-size: 20px;
      }
      .admin-client-dialog-title-block {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      .admin-client-dialog-meta-stack {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .admin-staff-dialog-title-role {
        color: var(--muted-foreground);
        font-weight: 600;
      }
      .admin-staff-dialog-address {
        word-break: break-word;
      }
      .admin-client-dialog-meta {
        word-break: break-word;
      }
      .admin-client-dialog-address {
        word-break: break-word;
      }
      .admin-client-dialog-head-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }
      .admin-client-dialog-body {
        display: grid;
        gap: 14px;
      }
      .admin-client-summary-panel,
      .admin-client-section {
        display: grid;
        gap: 14px;
        padding: 16px 18px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-lg);
        background: rgba(255,255,255,0.94);
      }
      [data-admin-toggle-panel][hidden] {
        display: none !important;
      }
      [data-admin-order-amount-editor][hidden],
      [data-admin-order-amount-action-for][hidden],
      [data-admin-order-amount-edit-trigger][hidden],
      [data-admin-order-team-editor][hidden],
      [data-admin-order-team-action-for][hidden],
      [data-admin-order-team-edit-trigger][hidden] {
        display: none !important;
      }
      .admin-client-summary-panel {
        background: linear-gradient(180deg, rgba(249,250,251,0.96), rgba(255,255,255,0.98));
      }
      .admin-client-summary-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px 14px;
        flex-wrap: wrap;
      }
      .admin-client-summary-copy-block {
        display: grid;
        gap: 8px;
      }
      .admin-client-badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .admin-client-summary-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-client-address-switcher {
        display: grid;
        gap: 10px;
      }
      .admin-client-address-head {
        align-items: center;
      }
      .admin-client-address-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .admin-client-address-editor {
        display: grid;
        gap: 10px;
      }
      .admin-client-address-input-list {
        display: grid;
        gap: 10px;
      }
      .admin-client-address-input-row {
        display: grid;
        gap: 8px;
      }
      .admin-client-address-input-panel {
        display: grid;
        gap: 12px;
        padding: 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 18px;
        background: rgba(250, 250, 251, 0.78);
      }
      .admin-client-address-input-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .admin-client-address-input-title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .admin-client-address-remove-button {
        flex: 0 0 auto;
      }
      .admin-client-address-detail-grid {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }
      .admin-client-address-profile-section {
        display: grid;
        gap: 12px;
      }
      .admin-client-address-profile-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .admin-client-address-fact,
      .admin-client-address-note-card {
        padding: 14px 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 16px;
        background: rgba(255,255,255,0.86);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);
      }
      .admin-client-address-note-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(249, 245, 247, 0.94));
        border-color: rgba(158, 67, 90, 0.14);
      }
      .admin-client-address-fact-label {
        display: block;
        margin-bottom: 8px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .admin-client-address-fact-value,
      .admin-client-address-note-copy {
        margin: 0;
        color: var(--foreground);
        font-weight: 700;
        line-height: 1.45;
        word-break: break-word;
      }
      .admin-client-address-fact-value {
        font-size: 15px;
      }
      .admin-client-address-note-copy {
        font-size: 14px;
        font-weight: 600;
        line-height: 1.6;
      }
      .admin-client-address-pill {
        display: inline-grid;
        gap: 2px;
        min-width: min(280px, 100%);
        padding: 10px 12px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 14px;
        background: rgba(255,255,255,0.82);
        color: var(--foreground);
        text-decoration: none;
        transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
      }
      .admin-client-address-pill:hover {
        border-color: rgba(158, 67, 90, 0.28);
        background: rgba(255,255,255,0.96);
      }
      .admin-client-address-pill-active {
        border-color: rgba(158, 67, 90, 0.34);
        background: rgba(158, 67, 90, 0.08);
        box-shadow: 0 0 0 3px rgba(158, 67, 90, 0.10);
      }
      .admin-client-address-pill-copy {
        font-size: 14px;
        line-height: 1.45;
        font-weight: 600;
        word-break: break-word;
      }
      .admin-client-address-pill-meta {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      @media (max-width: 900px) {
        .admin-team-calendar-toolbar {
          align-items: flex-start;
        }
        .admin-team-calendar-actions {
          width: 100%;
        }
      }
      .admin-client-metric-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-client-metric-grid-dialog {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .admin-client-metric-card,
      .admin-client-contact-card {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        padding: 12px 14px;
        background: rgba(255,255,255,0.84);
      }
      .admin-client-metric-label,
      .admin-client-contact-label {
        display: block;
        margin-bottom: 8px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .admin-client-metric-value,
      .admin-client-contact-value {
        margin: 0;
        font-size: 14px;
        line-height: 1.45;
        word-break: break-word;
      }
      .admin-client-metric-value {
        font-size: 15px;
        font-weight: 700;
      }
      .admin-client-info-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-client-info-grid-compact {
        grid-template-columns: 1fr;
      }
      .admin-client-info-card {
        display: grid;
        gap: 6px;
        padding: 12px 14px;
        border: 1px solid rgba(228, 228, 231, 0.88);
        border-radius: 14px;
        background: rgba(249,250,251,0.92);
        min-width: 0;
      }
      .admin-client-info-card-wide {
        grid-column: 1 / -1;
      }
      .admin-client-info-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-client-info-value {
        margin: 0;
        color: var(--foreground);
        font-size: 15px;
        line-height: 1.45;
        font-weight: 600;
        word-break: break-word;
      }
      .admin-client-info-hint {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .admin-client-contact-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-dialog-panel {
        gap: 18px;
      }
      .admin-order-dialog-address {
        max-width: 78ch;
      }
      .admin-order-dialog-layout {
        display: grid;
        gap: 16px;
        grid-template-columns: 1fr;
        align-items: start;
      }
      .admin-order-dialog-main,
      .admin-order-dialog-side {
        display: grid;
        gap: 16px;
        align-content: start;
      }
      .admin-order-section-card {
        display: grid;
        gap: 14px;
        padding: 18px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-lg);
        background: rgba(255,255,255,0.92);
        box-shadow: var(--shadow-sm);
      }
      .admin-order-summary-panel {
        background:
          linear-gradient(135deg, rgba(158, 67, 90, 0.08), rgba(255,255,255,0) 52%),
          linear-gradient(180deg, rgba(255,255,255,0.96), rgba(249,245,247,0.94));
      }
      .admin-order-summary-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .admin-order-summary-copy-block {
        display: grid;
        gap: 10px;
      }
      .admin-order-summary-copy,
      .admin-order-summary-ok,
      .admin-order-detail-copy,
      .admin-order-detail-note {
        margin: 0;
      }
      .admin-order-summary-copy,
      .admin-order-summary-ok,
      .admin-order-detail-copy {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-order-summary-ok {
        padding: 12px 14px;
        border: 1px solid rgba(15, 118, 110, 0.14);
        border-radius: 14px;
        background: rgba(15, 118, 110, 0.08);
        color: var(--success);
      }
      .admin-order-summary-flags {
        align-items: flex-start;
      }
      .admin-order-highlight-grid,
      .admin-order-detail-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-highlight-card,
      .admin-order-detail-card {
        display: grid;
        gap: 8px;
        min-width: 0;
        padding: 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(250,250,251,0.9);
      }
      .admin-order-highlight-card-danger {
        border-color: rgba(185, 28, 28, 0.16);
        background: rgba(185, 28, 28, 0.06);
      }
      .admin-order-highlight-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .admin-order-highlight-head-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
        flex: 0 0 auto;
      }
      .admin-order-highlight-head-actions .admin-icon-button {
        flex: 0 0 auto;
      }
      .admin-order-highlight-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .admin-order-highlight-value {
        margin: 0;
        font-size: 22px;
        line-height: 1.18;
        font-weight: 700;
        letter-spacing: -0.03em;
        word-break: break-word;
      }
      .admin-order-highlight-note {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-order-highlight-editor {
        display: grid;
        gap: 8px;
        padding-top: 10px;
        margin-top: 4px;
        border-top: 1px solid rgba(228, 228, 231, 0.92);
      }
      .admin-order-highlight-editor-field {
        gap: 6px;
      }
      .admin-confirm-button {
        color: var(--success);
        background: rgba(15, 118, 110, 0.08);
        border-color: rgba(15, 118, 110, 0.18);
      }
      .admin-confirm-button:hover {
        color: #0b5f59;
        background: rgba(15, 118, 110, 0.14);
        border-color: rgba(15, 118, 110, 0.24);
      }
      .admin-close-button {
        color: var(--muted-foreground);
      }
      .admin-close-button:hover {
        color: var(--foreground);
      }
      .admin-order-detail-card-wide {
        grid-column: 1 / -1;
      }
      .admin-order-detail-card .admin-property-row {
        padding-bottom: 10px;
      }
      .admin-order-detail-note {
        color: var(--foreground);
        font-size: 14px;
        line-height: 1.7;
        word-break: break-word;
      }
      .admin-order-brief-layout {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-brief-card {
        display: grid;
        gap: 10px;
        min-width: 0;
        padding: 12px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,245,247,0.9));
      }
      .admin-order-brief-card-wide {
        grid-column: 1 / -1;
      }
      .admin-order-brief-copy {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .admin-order-brief-stack {
        display: grid;
        gap: 10px;
      }
      .admin-order-brief-overview {
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(0, 1.35fr) repeat(2, minmax(170px, 0.6fr));
        align-items: start;
      }
      .admin-order-brief-metric {
        display: grid;
        gap: 5px;
        min-width: 0;
        padding: 10px 12px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 14px;
        background: rgba(255,255,255,0.84);
      }
      .admin-order-brief-metric-wide {
        grid-column: span 1;
      }
      .admin-order-brief-metric-label,
      .admin-order-brief-fact-label {
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-order-brief-metric-value,
      .admin-order-brief-fact-value {
        margin: 0;
        color: var(--foreground);
        font-weight: 700;
        letter-spacing: -0.03em;
        word-break: break-word;
      }
      .admin-order-brief-metric-value {
        font-size: 20px;
        line-height: 1.18;
      }
      .admin-order-brief-metric-meta {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .admin-order-brief-payment,
      .admin-order-brief-payment .admin-inline-badge-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .admin-order-brief-fact-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      }
      .admin-order-brief-fact {
        display: grid;
        gap: 4px;
        min-width: 0;
        padding: 10px 12px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 12px;
        background: rgba(255,255,255,0.78);
      }
      .admin-order-brief-fact-wide {
        grid-column: 1 / -1;
      }
      .admin-order-brief-fact-value {
        font-size: 14px;
        line-height: 1.4;
        font-weight: 600;
      }
      .admin-order-service-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .admin-order-service-pill {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        padding: 6px 10px;
        border: 1px solid rgba(158, 67, 90, 0.14);
        border-radius: 999px;
        background: rgba(158, 67, 90, 0.08);
        color: var(--accent);
        font-size: 12px;
        line-height: 1.35;
        font-weight: 600;
      }
      .admin-order-service-empty,
      .admin-order-client-note {
        margin: 0;
        padding: 10px 12px;
        border-radius: 14px;
      }
      .admin-order-service-empty {
        border: 1px dashed rgba(158, 67, 90, 0.18);
        background: rgba(255,255,255,0.76);
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .admin-order-address-hero {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 14px;
        background: rgba(255,255,255,0.84);
      }
      .admin-order-address-main {
        margin: 0;
        color: var(--foreground);
        font-size: 18px;
        line-height: 1.3;
        font-weight: 700;
        letter-spacing: -0.02em;
        word-break: break-word;
      }
      .admin-order-address-sub {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
        word-break: break-word;
      }
      .admin-order-client-note {
        border: 1px solid rgba(228, 228, 231, 0.92);
        background: rgba(248,245,247,0.76);
        color: var(--foreground);
        font-size: 13px;
        line-height: 1.55;
        word-break: break-word;
      }
      .admin-order-media-stack {
        display: grid;
        gap: 16px;
      }
      .admin-order-media-layout,
      .admin-order-completion-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-media-panel {
        display: grid;
        gap: 12px;
        min-width: 0;
        padding: 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(250,250,251,0.9);
      }
      .admin-order-media-head {
        align-items: flex-start;
      }
      .admin-order-media-copy {
        margin: 4px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-order-media-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }
      .admin-order-media-card {
        display: grid;
        gap: 8px;
        min-width: 0;
        color: inherit;
        text-decoration: none;
      }
      .admin-order-media-thumb {
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        display: block;
        border-radius: 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        background: rgba(255,255,255,0.96);
        box-shadow: var(--shadow-sm);
      }
      .admin-order-media-caption {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
        word-break: break-word;
      }
      .admin-order-media-empty {
        padding: 14px;
        border: 1px dashed rgba(158, 67, 90, 0.18);
        border-radius: 16px;
        background: rgba(255,255,255,0.82);
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-file-input {
        padding: 14px 16px;
      }
      .admin-input-help {
        display: block;
        margin-top: 8px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .admin-order-comment-field {
        min-height: 140px;
        resize: vertical;
      }
      .admin-order-side-card {
        gap: 12px;
      }
      .admin-order-control-form {
        gap: 10px;
      }
      .admin-order-control-fields,
      .admin-order-control-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-control-field {
        gap: 6px;
        font-size: 13px;
      }
      .admin-order-control-field-wide {
        grid-column: 1 / -1;
      }
      .admin-order-multiselect {
        position: relative;
      }
      .admin-order-multiselect[open] {
        z-index: 48;
      }
      .admin-order-multiselect > summary {
        list-style: none;
      }
      .admin-order-multiselect > summary::-webkit-details-marker {
        display: none;
      }
      .admin-order-multiselect-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 46px;
        cursor: pointer;
      }
      .admin-order-multiselect-value {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .admin-order-multiselect-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        color: var(--muted);
        flex: 0 0 auto;
        transition: transform 0.18s ease, color 0.18s ease;
      }
      .admin-order-multiselect-icon svg {
        width: 18px;
        height: 18px;
      }
      .admin-order-multiselect[open] .admin-order-multiselect-icon {
        transform: rotate(180deg);
        color: var(--foreground);
      }
      .admin-order-multiselect-panel {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        right: 0;
        z-index: 49;
        display: grid;
        gap: 8px;
        padding: 10px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 16px;
        background: rgba(255,255,255,0.98);
        box-shadow: var(--shadow-sm);
        max-height: min(320px, calc(100vh - 220px));
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .admin-order-multiselect-list {
        display: grid;
        gap: 6px;
      }
      .admin-order-multiselect-option {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        padding: 8px 10px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 12px;
        background: rgba(250,250,251,0.92);
        font-size: 13px;
        line-height: 1.4;
        color: var(--foreground);
        cursor: pointer;
      }
      .admin-order-multiselect-empty {
        padding: 8px 10px;
        border: 1px dashed rgba(158, 67, 90, 0.18);
        border-radius: 12px;
        background: rgba(255,255,255,0.84);
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .admin-order-multiselect-checkbox {
        width: 16px;
        height: 16px;
        margin: 0;
        flex: 0 0 auto;
      }
      .admin-order-action-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .admin-order-primary-action {
        flex: 1 1 220px;
      }
      .admin-order-action-row > .admin-button-secondary {
        flex: 0 1 auto;
      }
      .admin-client-detail-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
      }
      .admin-client-contact-card-wide {
        grid-column: 1 / -1;
      }
      .admin-client-section-side {
        align-content: start;
      }
      .admin-staff-workload-section {
        align-content: start;
      }
      .admin-staff-calendar-section {
        align-content: start;
      }
      .admin-staff-calendar-actions {
        margin-top: 14px;
      }
      .admin-staff-calendar-actions form {
        margin: 0;
      }
      .admin-w9-empty-state {
        display: grid;
        gap: 14px;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
      }
      .admin-w9-empty-copy {
        min-width: 0;
      }
      .admin-w9-empty-title {
        margin: 0;
        color: var(--foreground);
        font-size: 15px;
        line-height: 1.6;
        font-weight: 600;
      }
      .admin-w9-empty-hint {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.7;
      }
      .admin-w9-empty-actions {
        margin: 0;
        justify-self: end;
      }
      .admin-w9-preview-actions {
        margin-top: 14px;
      }
      .admin-client-actions-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-order-quote-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start;
      }
      .admin-order-quote-card {
        display: grid;
        gap: 14px;
        padding: 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.92);
        align-self: start;
        align-content: start;
      }
      .admin-order-quote-card-wide {
        grid-column: 1 / -1;
      }
      .admin-order-quote-fields {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .admin-order-quote-fields-primary {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .admin-order-quote-fields-services {
        grid-template-columns: 1fr;
      }
      .admin-order-quote-field {
        display: grid;
        gap: 6px;
        min-width: 0;
        padding: 12px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 14px;
        background: rgba(248, 245, 247, 0.72);
      }
      .admin-order-quote-field-wide {
        grid-column: 1 / -1;
      }
      .admin-order-quote-field-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .admin-order-quote-field-value,
      .admin-order-quote-note {
        margin: 0;
        color: var(--foreground);
        font-size: 15px;
        line-height: 1.55;
        word-break: break-word;
      }
      .admin-order-quote-field-value {
        font-weight: 600;
      }
      .admin-order-quote-note {
        font-size: 14px;
      }
      .admin-client-actions-bar {
        display: grid;
        gap: 10px;
        padding-top: 2px;
      }
      .admin-client-action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-client-action-row .admin-link-button {
        min-height: 40px;
        padding: 0 14px;
        box-shadow: none;
      }
      .admin-client-danger-row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .admin-client-delete-form {
        margin: 0;
        display: inline-flex;
        align-items: center;
      }
      .admin-subsection-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .admin-subsection-title {
        margin: 0;
        font-size: 15px;
        line-height: 1.3;
      }
      .admin-history-list {
        display: grid;
        gap: 10px;
      }
      .admin-history-item {
        display: grid;
        gap: 10px;
        padding: 14px 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.84);
      }
      .admin-history-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .admin-client-history-list {
        gap: 10px;
      }
      .admin-client-history-item {
        gap: 8px;
        padding: 14px 16px;
      }
      .admin-client-history-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .admin-client-history-copy-block {
        display: grid;
        gap: 4px;
      }
      .admin-client-history-side {
        display: grid;
        gap: 6px;
        justify-items: end;
      }
      .admin-client-history-amount {
        font-size: 15px;
        font-weight: 700;
        line-height: 1.2;
      }
      .admin-client-history-meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .admin-history-meta-chip {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(248,249,252,0.98);
        border: 1px solid rgba(228, 228, 231, 0.92);
        color: var(--muted-foreground);
        font-size: 12px;
        font-weight: 600;
      }
      .admin-client-history-address {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-client-history-empty {
        min-height: 0;
      }
      .admin-history-title,
      .admin-history-copy {
        margin: 0;
      }
      .admin-history-title {
        font-size: 15px;
        line-height: 1.35;
      }
      .admin-history-copy {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-history-meta {
        display: grid;
        gap: 6px;
        color: var(--muted-foreground);
        font-size: 13px;
        line-height: 1.6;
      }
      .admin-checklist-list {
        display: grid;
        gap: 10px;
      }
      .admin-checklist-dialog-panel {
        gap: 20px;
      }
      .admin-checklist-template-shell {
        display: grid;
        gap: 18px;
      }
      .admin-checklist-template-hero {
        padding: 18px 20px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 20px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,245,247,0.92)),
          radial-gradient(circle at top right, rgba(158, 67, 90, 0.08), transparent 46%);
      }
      .admin-checklist-template-copy {
        display: grid;
        gap: 10px;
      }
      .admin-checklist-preview-list {
        display: grid;
        gap: 10px;
      }
      .admin-checklist-preview-item {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 18px;
        background: rgba(255,255,255,0.84);
      }
      .admin-checklist-preview-index,
      .admin-checklist-edit-index {
        display: inline-grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 14px;
        background: rgba(158, 67, 90, 0.10);
        color: var(--accent);
        font-size: 13px;
        font-weight: 700;
        line-height: 1;
      }
      .admin-checklist-preview-copy {
        min-width: 0;
      }
      .admin-checklist-preview-copy strong {
        display: block;
        font-size: 16px;
        line-height: 1.45;
        word-break: break-word;
      }
      .admin-checklist-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-sm);
        background: rgba(255,255,255,0.78);
      }
      .admin-checklist-row input[type="checkbox"] {
        width: 18px;
        height: 18px;
        margin-top: 2px;
        accent-color: var(--accent);
        flex: none;
      }
      .admin-checklist-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .admin-checklist-copy strong,
      .admin-checklist-copy span {
        word-break: break-word;
      }
      .admin-checklist-copy span {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-checklist-summary {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
      }
      .admin-checklist-edit-section {
        gap: 14px;
      }
      .admin-checklist-edit-list {
        display: grid;
        gap: 10px;
      }
      .admin-checklist-edit-row {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
      }
      .admin-checklist-edit-input {
        min-width: 0;
      }
      .admin-checklist-edit-actions {
        flex-wrap: wrap;
      }
      .admin-entry-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.84);
        padding: 16px;
        display: grid;
        gap: 14px;
      }
      .admin-entry-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .admin-entry-title {
        margin: 0;
        font-size: 16px;
        line-height: 1.3;
      }
      .admin-entry-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-entry-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.6;
      }
      .admin-entry-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      }
      .admin-mini-stat {
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-sm);
        padding: 12px;
        background: rgba(250,250,251,0.88);
      }
      .admin-mini-label {
        display: block;
        margin-bottom: 4px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-mini-value {
        margin: 0;
        font-size: 14px;
        line-height: 1.45;
        word-break: break-word;
      }
      .admin-toolbar {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .admin-toolbar-soft {
        padding: 12px 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(250,250,251,0.86);
      }
      .admin-settings-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .admin-settings-nav-link {
        display: grid;
        gap: 4px;
        min-width: 200px;
        padding: 12px 16px;
        border: 1px solid rgba(24, 24, 27, 0.08);
        border-radius: 16px;
        background: rgba(255,255,255,0.78);
        color: inherit;
        text-decoration: none;
        transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
      }
      .admin-settings-nav-link:hover {
        border-color: rgba(158, 67, 90, 0.2);
        background: rgba(255,255,255,0.94);
      }
      .admin-settings-nav-link-active {
        border-color: rgba(158, 67, 90, 0.22);
        background: rgba(158, 67, 90, 0.08);
        box-shadow: inset 0 0 0 1px rgba(158, 67, 90, 0.05);
      }
      .admin-settings-nav-label {
        font-size: 15px;
        font-weight: 700;
        line-height: 1.2;
      }
      .admin-settings-nav-meta {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .admin-empty-state {
        padding: 20px;
        border: 1px dashed rgba(158, 67, 90, 0.24);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.72);
        color: var(--muted);
        font-size: 14px;
        line-height: 1.7;
      }
      .admin-action-hint {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-helper-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.6;
      }
      .admin-dialog-launcher {
        display: grid;
        gap: 14px;
        align-content: start;
      }
      .admin-dialog {
        width: min(760px, calc(100vw - 24px));
        max-width: 760px;
        margin: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
      }
      .admin-dialog-wide {
        width: min(980px, calc(100vw - 24px));
        max-width: 980px;
      }
      .admin-dialog-orders {
        width: min(1240px, calc(100vw - 24px));
        max-width: 1240px;
      }
      .admin-dialog::backdrop {
        background: rgba(24, 24, 27, 0.44);
        backdrop-filter: blur(6px);
      }
      .admin-dialog-panel {
        display: grid;
        gap: 16px;
        padding: 20px;
        border: 1px solid rgba(228, 228, 231, 0.96);
        border-radius: var(--radius-xl);
        background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,245,247,0.96));
        box-shadow: var(--shadow-lg);
      }
      .admin-dialog-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .admin-dialog-head-actions {
        margin-left: auto;
      }
      .admin-dialog-copy-block {
        display: grid;
        gap: 8px;
      }
      .admin-dialog-title {
        margin: 0;
        font-size: 22px;
        line-height: 1.1;
        letter-spacing: -0.03em;
      }
      .admin-dialog-copy {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
      }
      .admin-confirm-dialog .admin-dialog-panel {
        gap: 20px;
      }
      .admin-confirm-dialog .admin-dialog-copy-block {
        gap: 6px;
      }
      .admin-confirm-dialog-actions {
        justify-content: flex-end;
      }
      .admin-button,
      .admin-link-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 44px;
        padding: 0 16px;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        background: linear-gradient(180deg, var(--accent), #88384d);
        color: var(--accent-foreground);
        font: inherit;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
        transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease;
        box-shadow: 0 12px 24px rgba(158, 67, 90, 0.18);
      }
      .admin-button:hover,
      .admin-link-button:hover {
        transform: translateY(-1px);
        background: linear-gradient(180deg, #a94962, #7a3043);
      }
      .admin-button:disabled,
      .admin-link-button[aria-disabled="true"] {
        cursor: not-allowed;
        opacity: 0.6;
        transform: none;
        background: linear-gradient(180deg, rgba(158, 67, 90, 0.62), rgba(136, 56, 77, 0.62));
        box-shadow: none;
      }
      .admin-button:disabled:hover,
      .admin-link-button[aria-disabled="true"]:hover {
        transform: none;
        background: linear-gradient(180deg, rgba(158, 67, 90, 0.62), rgba(136, 56, 77, 0.62));
      }
      .admin-icon-button {
        display: inline-grid;
        place-items: center;
        width: 38px;
        height: 38px;
        padding: 0;
        border: 1px solid rgba(228, 228, 231, 0.96);
        border-radius: 12px;
        background: rgba(255,255,255,0.84);
        color: rgba(82, 82, 91, 0.88);
        cursor: pointer;
        transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        box-shadow: none;
      }
      .admin-icon-button:hover {
        transform: translateY(-1px);
        background: rgba(255,255,255,0.96);
      }
      .admin-icon-button:focus-visible {
        outline: 2px solid rgba(158, 67, 90, 0.24);
        outline-offset: 2px;
      }
      .admin-icon-button svg {
        width: 16px;
        height: 16px;
        display: block;
      }
      .admin-edit-button:hover {
        border-color: rgba(158, 67, 90, 0.18);
        color: rgba(122, 48, 67, 0.92);
      }
      .admin-delete-button:hover {
        border-color: rgba(185, 28, 28, 0.18);
        color: rgba(146, 38, 38, 0.84);
      }
      .admin-delete-button:active {
        transform: none;
        background: rgba(185, 28, 28, 0.08);
      }
      .admin-table-action-button {
        min-height: 38px;
        width: 100%;
        padding: 0 14px;
        font-size: 14px;
        box-shadow: none;
      }
      .admin-settings-section-stack {
        display: grid;
        gap: 18px;
      }
      .admin-button-secondary {
        background: rgba(255,255,255,0.84);
        border-color: var(--border);
        color: var(--foreground);
        box-shadow: none;
      }
      .admin-button-secondary:hover {
        background: rgba(255,255,255,0.96);
      }
      .admin-button-danger {
        background: rgba(185, 28, 28, 0.08);
        border-color: rgba(185, 28, 28, 0.24);
        color: var(--danger);
        box-shadow: none;
      }
      .admin-button-danger:hover {
        background: rgba(185, 28, 28, 0.12);
        border-color: rgba(185, 28, 28, 0.3);
        color: var(--danger);
        box-shadow: none;
      }
      .admin-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .admin-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid transparent;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        white-space: nowrap;
      }
      .admin-badge-success {
        background: var(--success-soft);
        color: var(--success);
      }
      .admin-badge-muted {
        background: rgba(113, 113, 122, 0.10);
        color: var(--muted-foreground);
      }
      .admin-badge-danger {
        background: var(--danger-soft);
        color: var(--danger);
      }
      .admin-badge-outline {
        background: transparent;
        border-color: var(--border);
        color: var(--muted-foreground);
      }
      .admin-alert {
        margin: 0;
        border-radius: var(--radius-md);
        padding: 14px 16px;
        font-size: 14px;
        line-height: 1.6;
        border: 1px solid transparent;
      }
      .admin-alert-error {
        background: var(--danger-soft);
        border-color: rgba(185, 28, 28, 0.16);
        color: var(--danger);
      }
      .admin-alert-info {
        background: var(--success-soft);
        border-color: rgba(15, 118, 110, 0.16);
        color: var(--success);
      }
      .admin-feature-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .admin-feature-list li {
        position: relative;
        padding-left: 18px;
        color: var(--muted-foreground);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-feature-list li::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0.72em;
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: var(--accent);
      }
      .admin-property-list {
        gap: 12px;
      }
      .admin-property-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(228, 228, 231, 0.92);
      }
      .admin-property-row:last-child {
        padding-bottom: 0;
        border-bottom: 0;
      }
      .admin-property-label {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-property-value {
        color: var(--foreground);
        font-size: 14px;
        line-height: 1.55;
        font-weight: 600;
        text-align: right;
        word-break: break-word;
      }
      .admin-metric-value,
      .admin-card-copy {
        margin: 0;
      }
      .admin-card-copy {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
      }
      .admin-metric-value {
        font-size: 24px;
        font-weight: 700;
        line-height: 1.05;
        letter-spacing: -0.03em;
      }
      .admin-orders-page {
        display: grid;
        gap: 18px;
      }
      .admin-orders-hero {
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(0, 1.05fr) minmax(320px, 1fr);
        padding: 20px;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,245,247,0.92));
        box-shadow: var(--shadow-sm);
      }
      .admin-orders-hero-main,
      .admin-orders-side-block {
        display: grid;
        gap: 10px;
      }
      .admin-orders-kicker,
      .admin-orders-panel-kicker,
      .admin-orders-lane-kicker {
        margin: 0;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-orders-total {
        margin: 0;
        font-size: clamp(28px, 4vw, 38px);
        line-height: 1.05;
        letter-spacing: -0.04em;
      }
      .admin-orders-copy,
      .admin-orders-panel-copy,
      .admin-orders-lane-copy {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.65;
      }
      .admin-orders-metrics {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .admin-orders-metric {
        min-height: 118px;
        padding: 14px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.82);
        display: grid;
        gap: 8px;
        align-content: start;
      }
      .admin-orders-metric-emphasis {
        border-color: rgba(158, 67, 90, 0.2);
        background: linear-gradient(180deg, rgba(158, 67, 90, 0.10), rgba(255,255,255,0.94));
      }
      .admin-orders-metric-label,
      .admin-order-snapshot-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-orders-metric-value {
        margin: 0;
        font-size: 26px;
        line-height: 1.05;
        letter-spacing: -0.03em;
      }
      .admin-orders-panel-title,
      .admin-orders-lane-title {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
      }
      .admin-orders-metric-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-orders-layout {
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);
        align-items: start;
      }
      .admin-orders-filters-panel,
      .admin-orders-side-panel,
      .admin-orders-lane {
        padding: 18px;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: rgba(255,255,255,0.88);
        box-shadow: var(--shadow-sm);
      }
      .admin-orders-filters-panel,
      .admin-orders-side-panel,
      .admin-orders-lanes,
      .admin-order-stack {
        display: grid;
        gap: 16px;
      }
      .admin-orders-side-panel {
        position: sticky;
        top: var(--page-top-offset);
      }
      .admin-orders-panel-head,
      .admin-orders-lane-head,
      .admin-order-card-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
        flex-wrap: wrap;
      }
      .admin-orders-filter-form {
        gap: 16px;
      }
      .admin-orders-lane-meta {
        display: grid;
        gap: 8px;
        justify-items: end;
      }
      .admin-orders-lane-count {
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        border-radius: 14px;
        background: rgba(158, 67, 90, 0.12);
        color: var(--accent);
        font-size: 18px;
        font-weight: 700;
      }
      .admin-order-card {
        position: relative;
        overflow: hidden;
        padding: 18px 18px 18px 22px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 20px;
        background: rgba(255,255,255,0.96);
        box-shadow: 0 10px 30px rgba(24, 24, 27, 0.04);
        display: grid;
        gap: 14px;
      }
      .admin-order-card::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: rgba(158, 67, 90, 0.24);
      }
      .admin-order-card-new::before {
        background: #9e435a;
      }
      .admin-order-card-scheduled::before {
        background: #0f766e;
      }
      .admin-order-card-in-progress::before {
        background: #1d4ed8;
      }
      .admin-order-card-completed::before {
        background: #2f855a;
      }
      .admin-order-card-rescheduled::before {
        background: #b45309;
      }
      .admin-order-card-canceled::before {
        background: #b91c1c;
      }
      .admin-order-card-attention {
        box-shadow: 0 16px 32px rgba(185, 28, 28, 0.06);
      }
      .admin-order-title-block {
        display: grid;
        gap: 6px;
      }
      .admin-order-request {
        margin: 0;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-order-title {
        margin: 0;
        font-size: 20px;
        line-height: 1.15;
      }
      .admin-order-caption,
      .admin-order-focus-copy {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.6;
      }
      .admin-order-focus {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .admin-order-snapshot-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .admin-order-snapshot {
        padding: 12px 14px;
        border: 1px solid rgba(228, 228, 231, 0.88);
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(250,250,251,0.92), rgba(255,255,255,0.98));
        display: grid;
        gap: 6px;
      }
      .admin-order-snapshot-wide {
        grid-column: 1 / -1;
      }
      .admin-order-snapshot-value {
        margin: 0;
        font-size: 14px;
        line-height: 1.55;
        word-break: break-word;
      }
      .admin-order-editor {
        border-style: solid;
        border-color: rgba(228, 228, 231, 0.88);
        background: rgba(252,252,253,0.92);
      }
      .admin-order-editor summary {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 12px;
        list-style: none;
      }
      .admin-order-editor-summary {
        margin-left: auto;
      }
      .admin-order-editor summary::-webkit-details-marker {
        display: none;
      }
      .admin-order-editor summary::after {
        content: none;
      }
      .admin-order-editor[open] summary::after {
        content: none;
      }
      .admin-order-editor-body {
        display: grid;
        gap: 14px;
        margin-top: 14px;
      }
      .admin-orders-status-stack {
        display: grid;
        gap: 8px;
      }
      .admin-order-form {
        gap: 14px;
      }
      .admin-order-delete-form {
        justify-content: flex-end;
        padding-top: 4px;
        margin-left: auto;
      }
      .admin-order-action-row .admin-order-delete-form {
        margin-left: 0;
        padding-top: 0;
      }
      .admin-code {
        margin: 0;
        padding: 14px 16px;
        border-radius: var(--radius-sm);
        border: 1px solid rgba(24, 24, 27, 0.06);
        background: #18181b;
        color: #fafafa;
        font-size: 13px;
        line-height: 1.65;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .admin-qr-card {
        display: grid;
        justify-items: center;
        gap: 12px;
        text-align: center;
      }
      .admin-qr-image {
        width: 220px;
        height: 220px;
        max-width: 100%;
        display: block;
        padding: 10px;
        border-radius: 18px;
        background: #ffffff;
        border: 1px solid var(--border);
        box-shadow: var(--shadow-sm);
      }
      details.admin-details {
        border: 1px dashed rgba(158, 67, 90, 0.24);
        border-radius: var(--radius-md);
        padding: 14px 16px;
        background: rgba(255,255,255,0.82);
      }
      details.admin-details summary {
        cursor: pointer;
        font-weight: 700;
        color: var(--foreground);
      }
      .admin-logout-form {
        margin: 0;
        width: 100%;
      }
      @media (max-width: 980px) {
        .admin-shell-with-sidebar {
          grid-template-columns: 1fr;
        }
        .admin-sidebar {
          position: static;
        }
        .admin-compact-summary-strip,
        .admin-overview-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .admin-clients-filter-bar {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .admin-orders-filter-bar {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .admin-clients-layout {
          grid-template-columns: 1fr;
        }
        .admin-clients-toolbar-row,
        .admin-clients-meta-row {
          grid-template-columns: 1fr;
          align-items: stretch;
        }
        .admin-orders-toolbar-shell {
          grid-template-columns: 1fr;
        }
        .admin-clients-search-form {
          width: 100%;
          max-width: none;
          margin-left: 0;
          grid-template-columns: minmax(0, 1fr) auto;
        }
        .admin-clients-search-box {
          max-width: none;
        }
        .admin-orders-hero,
        .admin-orders-layout {
          grid-template-columns: 1fr;
        }
        .admin-orders-side-panel {
          position: static;
        }
        .admin-quote-ops-layout {
          grid-template-columns: 1fr;
        }
        .admin-quote-ops-side {
          position: static;
        }
        .admin-quote-success-table {
          min-width: 980px;
        }
      }
      @media (max-width: 720px) {
        body {
          padding: 10px 0 28px;
        }
        .account-signature-header {
          flex-direction: column;
          align-items: stretch;
        }
        .account-signature-clear {
          width: 100%;
        }
        .admin-sidebar-role-badge {
          margin: -4px 0 4px;
        }
        .admin-hero {
          padding: 22px 18px 16px;
        }
        .admin-hero-head {
          gap: 14px;
        }
        .admin-hero-copy,
        .admin-hero-actions {
          width: 100%;
          flex-basis: 100%;
        }
        .admin-hero-actions {
          justify-content: stretch;
        }
        .admin-hero-actions .admin-dialog-launcher-inline,
        .admin-hero-actions .admin-dialog-launcher-inline > *:not(dialog) {
          width: 100%;
        }
        .admin-content {
          padding: 18px;
        }
        .admin-sidebar-card {
          padding: 18px;
        }
        .admin-card-header,
        .admin-card-content {
          padding-left: 16px;
          padding-right: 16px;
        }
        .admin-inline-actions > * {
          width: 100%;
        }
        .admin-inline-actions > .admin-icon-button,
        .admin-inline-actions > .admin-delete-button {
          width: 38px;
        }
        .admin-inline-actions .admin-action-hint {
          width: 100%;
        }
        .admin-w9-empty-state {
          grid-template-columns: 1fr;
        }
        .admin-w9-empty-actions {
          justify-self: stretch;
        }
        .admin-compact-summary-strip,
        .admin-overview-strip,
        .admin-diagnostics-grid,
        .admin-clients-filter-bar,
        .admin-orders-filter-bar,
        .admin-client-metric-grid,
        .admin-client-info-grid,
        .admin-client-contact-grid,
        .admin-client-detail-grid,
        .admin-order-dialog-layout,
        .admin-order-highlight-grid,
        .admin-order-detail-grid,
        .admin-order-brief-layout,
        .admin-order-brief-overview,
        .admin-order-brief-fact-grid,
        .admin-order-control-fields,
        .admin-order-control-grid,
        .admin-order-media-layout,
        .admin-order-completion-grid {
          grid-template-columns: 1fr;
        }
        .admin-clients-search-form,
        .admin-clients-toolbar-left {
          width: 100%;
        }
        .admin-orders-filter-toggle + .admin-clients-search-form + .admin-orders-filter-inline-panel {
          max-height: 0;
        }
        .admin-orders-filter-toggle[open] + .admin-clients-search-form + .admin-orders-filter-inline-panel {
          max-height: 720px;
        }
        .admin-clients-toolbar-disclosure[open] {
          width: 100%;
        }
        .admin-clients-toolbar-button {
          width: 100%;
          justify-content: space-between;
        }
        .admin-filter-disclosure,
        .admin-clients-search-box {
          width: 100%;
        }
        .admin-filter-disclosure-panel {
          position: static;
          width: 100%;
          min-width: 0;
          margin-top: 10px;
        }
        .admin-order-multiselect-panel {
          max-height: min(280px, calc(100vh - 180px));
        }
        .admin-clients-filter-actions,
        .admin-client-action-row,
        .admin-client-danger-row {
          justify-content: stretch;
        }
        .admin-client-danger-row {
          flex-wrap: wrap;
          align-items: flex-start;
        }
        .admin-clients-meta-main {
          width: 100%;
        }
        .admin-clients-meta-hint {
          text-align: left;
          white-space: normal;
        }
        .admin-client-table-cell {
          align-items: flex-start;
        }
        .admin-client-avatar {
          width: 38px;
          height: 38px;
          font-size: 15px;
        }
        .admin-client-history-side {
          justify-items: start;
        }
        .admin-client-dialog-title-row,
        .admin-client-summary-head {
          align-items: flex-start;
        }
        .admin-client-dialog-head-actions {
          width: 100%;
        }
        .admin-client-avatar-large {
          width: 48px;
          height: 48px;
          font-size: 18px;
        }
        .admin-clients-filter-actions > *,
        .admin-client-action-row > *,
        .admin-clients-search-form > button,
        .admin-clients-search-form > a {
          width: 100%;
        }
        .admin-input-code {
          font-size: 20px;
        }
        .admin-property-row {
          flex-direction: column;
        }
        .admin-property-value {
          text-align: left;
        }
        .admin-order-quote-grid,
        .admin-order-quote-fields,
        .admin-order-quote-fields-primary {
          grid-template-columns: 1fr;
        }
        .admin-order-brief-metric-value {
          font-size: 18px;
        }
        .admin-order-address-main {
          font-size: 16px;
        }
        .admin-order-section-card {
          padding: 16px;
        }
        .admin-order-action-row > .admin-button,
        .admin-order-action-row > form {
          width: 100%;
        }
        .admin-orders-hero,
        .admin-orders-filters-panel,
        .admin-orders-side-panel,
        .admin-orders-lane,
        .admin-order-card {
          padding: 16px;
        }
        .admin-order-card {
          padding-left: 18px;
        }
        .admin-order-snapshot-grid {
          grid-template-columns: 1fr;
        }
        .admin-orders-lane-meta {
          justify-items: start;
        }
        .admin-quote-ops-filter-head,
        .admin-quote-lane-head,
        .admin-quote-entry-head,
        .admin-quote-entry-footer {
          flex-direction: column;
          align-items: stretch;
        }
        .admin-quote-ops-filter-actions {
          justify-items: start;
        }
        .admin-quote-ops-filter-actions .admin-quote-ops-filter-disclosure {
          width: 100%;
        }
        .admin-quote-ops-filter-inline-row {
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-quote-ops-filter-inline-actions {
          justify-content: flex-start;
          flex-wrap: wrap;
        }
        .admin-quote-ops-filter-hint {
          text-align: left;
        }
        .admin-quote-ops-filter-badges,
        .admin-quote-lane-meta,
        .admin-quote-entry-badges {
          width: 100%;
        }
        .admin-quote-lane,
        .admin-quote-entry {
          padding: 16px;
        }
        .admin-quote-entry-side {
          justify-items: start;
        }
        .admin-quote-entry-crm-grid,
        .admin-quote-entry-info-grid {
          grid-template-columns: 1fr;
        }
        .admin-quote-entry-info-wide {
          grid-column: auto;
        }
        .admin-quote-entry-footer > * {
          width: 100%;
        }
        .admin-dialog {
          width: calc(100vw - 20px);
        }
        .admin-dialog-panel {
          padding: 18px;
        }
        .admin-dialog-head > * {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main class="${shellClass}">
      ${sidebar}
      <section class="admin-panel">
        <div class="admin-hero">
          <div class="admin-hero-head">
            <div class="admin-hero-copy">
              ${kicker ? `<p class="admin-kicker">${kicker}</p>` : ""}
              <h1 class="admin-title">${escapeHtml(title)}</h1>
              ${subtitle}
            </div>
            ${heroActions}
          </div>
          ${heroMeta}
        </div>
        <div class="admin-content">
          ${content}
        </div>
      </section>
    </main>
    <dialog class="admin-dialog admin-confirm-dialog" id="admin-confirm-dialog" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-copy">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-copy-block">
          <p class="admin-card-eyebrow">Подтверждение</p>
          <h2 class="admin-dialog-title" id="admin-confirm-title">Точно удалить?</h2>
          <p class="admin-dialog-copy" id="admin-confirm-copy" hidden></p>
        </div>
        <div class="admin-inline-actions admin-confirm-dialog-actions">
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-confirm-dialog">Нет</button>
          <button class="admin-button" type="button" data-admin-confirm-accept="true">Да</button>
        </div>
      </div>
    </dialog>
    <script>
      (() => {
        const dialogSelector = "dialog.admin-dialog";
        const confirmDialog = document.getElementById("admin-confirm-dialog");
        const confirmTitle = document.getElementById("admin-confirm-title");
        const confirmCopy = document.getElementById("admin-confirm-copy");
        let pendingConfirmForm = null;
        const autoSubmitTimers = new WeakMap();

        function parseAdminDateInput(value) {
          const normalized = String(value || "").trim();
          if (!normalized) return "";
          let match = normalized.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
          if (match) return match[1] + "-" + match[2] + "-" + match[3];
          match = normalized.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/);
          if (match) {
            const month = match[1].padStart(2, "0");
            const day = match[2].padStart(2, "0");
            return match[3] + "-" + month + "-" + day;
          }
          match = normalized.match(/^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})$/);
          if (match) {
            const day = match[1].padStart(2, "0");
            const month = match[2].padStart(2, "0");
            return match[3] + "-" + month + "-" + day;
          }
          return "";
        }

        function formatAdminDateInput(value) {
          const match = String(value || "").trim().match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
          if (!match) return "";
          return match[2] + "/" + match[3] + "/" + match[1];
        }

        function parseAdminTimeInput(value) {
          const normalized = String(value || "").trim();
          if (!normalized) return "";

          let match = normalized.match(/^(\\d{1,2}):(\\d{2})$/);
          if (match) {
            const hours = Number(match[1]);
            const minutes = Number(match[2]);
            if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
              return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
            }
          }

          match = normalized.match(/^(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?m?\\.?$/i);
          if (!match) return "";
          let hours = Number(match[1]);
          const minutes = Number(match[2] || "00");
          const meridiem = match[3].toUpperCase();
          if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return "";
          if (meridiem === "P" && hours < 12) hours += 12;
          if (meridiem === "A" && hours === 12) hours = 0;
          return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
        }

        function formatAdminTimeInput(value) {
          const match = String(value || "").trim().match(/^(\\d{2}):(\\d{2})(?::\\d{2})?$/);
          if (!match) return "";
          let hours = Number(match[1]);
          const minutes = match[2];
          const meridiem = hours >= 12 ? "PM" : "AM";
          hours = hours % 12 || 12;
          return hours + ":" + minutes + " " + meridiem;
        }

        function getAdminTimeParts(value) {
          const normalizedValue = parseAdminTimeInput(value);
          const match = normalizedValue.match(/^(\\d{2}):(\\d{2})$/);
          if (!match) return null;
          let hours = Number(match[1]);
          const minutes = match[2];
          const meridiem = hours >= 12 ? "PM" : "AM";
          hours = hours % 12 || 12;
          return {
            hour: String(hours),
            minute: minutes,
            meridiem,
          };
        }

        function closeTimePickerPanel(field) {
          if (!field) return;
          const panel = field.querySelector("[data-admin-time-panel]");
          const trigger = field.querySelector("[data-admin-picker-trigger='time']");
          field.removeAttribute("data-admin-time-open");
          if (panel) panel.hidden = true;
          if (trigger) trigger.setAttribute("aria-expanded", "false");
        }

        function closeAllTimePickerPanels(exceptField) {
          document.querySelectorAll("[data-admin-picker-field='time'][data-admin-time-open='true']").forEach((field) => {
            if (field !== exceptField) closeTimePickerPanel(field);
          });
        }

        function syncTimePanelFromValue(field, value) {
          if (!field) return;
          const hourSelect = field.querySelector("[data-admin-time-hour]");
          const minuteSelect = field.querySelector("[data-admin-time-minute]");
          const meridiemSelect = field.querySelector("[data-admin-time-meridiem]");
          if (!hourSelect || !minuteSelect || !meridiemSelect) return;
          const parts = getAdminTimeParts(value);
          hourSelect.value = parts ? parts.hour : "12";
          minuteSelect.value = parts ? parts.minute : "00";
          meridiemSelect.value = parts ? parts.meridiem : "AM";
        }

        function syncTimePanelFromField(field) {
          if (!field) return;
          const nativeInput = field.querySelector("[data-admin-picker-native]");
          const displayInput = field.querySelector("[data-admin-picker-display]");
          const sourceValue = nativeInput && nativeInput.value ? nativeInput.value : displayInput ? displayInput.value : "";
          syncTimePanelFromValue(field, sourceValue);
        }

        function applyTimePanelSelection(field) {
          if (!field) return;
          const hourSelect = field.querySelector("[data-admin-time-hour]");
          const minuteSelect = field.querySelector("[data-admin-time-minute]");
          const meridiemSelect = field.querySelector("[data-admin-time-meridiem]");
          const nativeInput = field.querySelector("[data-admin-picker-native]");
          const displayInput = field.querySelector("[data-admin-picker-display]");
          if (!hourSelect || !minuteSelect || !meridiemSelect || !nativeInput || !displayInput) return;

          let hours = Number(hourSelect.value || "0");
          const minutes = String(minuteSelect.value || "").padStart(2, "0");
          const meridiem = String(meridiemSelect.value || "").toUpperCase();
          if (!Number.isFinite(hours) || hours < 1 || hours > 12 || !/^\\d{2}$/.test(minutes) || !/^(AM|PM)$/.test(meridiem)) {
            return;
          }
          if (meridiem === "PM" && hours !== 12) hours += 12;
          if (meridiem === "AM" && hours === 12) hours = 0;

          const canonicalValue = String(hours).padStart(2, "0") + ":" + minutes;
          nativeInput.value = canonicalValue;
          displayInput.value = formatAdminTimeInput(canonicalValue);
        }

        function syncPickerNativeFromDisplay(field) {
          if (!field) return;
          const pickerType = field.getAttribute("data-admin-picker-field");
          const displayInput = field.querySelector("[data-admin-picker-display]");
          const nativeInput = field.querySelector("[data-admin-picker-native]");
          if (!displayInput || !nativeInput) return;
          const currentValue = String(displayInput.value || "").trim();
          if (!currentValue) {
            nativeInput.value = "";
            return;
          }
          const parsedValue = pickerType === "time" ? parseAdminTimeInput(currentValue) : parseAdminDateInput(currentValue);
          if (parsedValue) {
            nativeInput.value = parsedValue;
            if (pickerType === "time") {
              syncTimePanelFromValue(field, parsedValue);
            }
          }
        }

        function syncPickerDisplayFromNative(field) {
          if (!field) return;
          const pickerType = field.getAttribute("data-admin-picker-field");
          const displayInput = field.querySelector("[data-admin-picker-display]");
          const nativeInput = field.querySelector("[data-admin-picker-native]");
          if (!displayInput || !nativeInput) return;
          if (!nativeInput.value) {
            displayInput.value = "";
            if (pickerType === "time") {
              syncTimePanelFromValue(field, "");
            }
            return;
          }
          displayInput.value = pickerType === "time" ? formatAdminTimeInput(nativeInput.value) : formatAdminDateInput(nativeInput.value);
          if (pickerType === "time") {
            syncTimePanelFromValue(field, nativeInput.value);
          }
        }

        function openPickerField(field) {
          if (!field) return;
          const pickerType = field.getAttribute("data-admin-picker-field");
          if (pickerType === "time") {
            const panel = field.querySelector("[data-admin-time-panel]");
            const trigger = field.querySelector("[data-admin-picker-trigger='time']");
            if (!panel) return;
            if (field.getAttribute("data-admin-time-open") === "true") {
              closeTimePickerPanel(field);
              return;
            }
            closeAllTimePickerPanels(field);
            syncPickerNativeFromDisplay(field);
            syncTimePanelFromField(field);
            panel.hidden = false;
            field.setAttribute("data-admin-time-open", "true");
            if (trigger) trigger.setAttribute("aria-expanded", "true");
            const firstSelect = panel.querySelector("select");
            if (firstSelect && typeof firstSelect.focus === "function") {
              firstSelect.focus({ preventScroll: true });
            }
            return;
          }
          const nativeInput = field.querySelector("[data-admin-picker-native]");
          if (!nativeInput) return;
          syncPickerNativeFromDisplay(field);
          nativeInput.focus({ preventScroll: true });
          if (typeof nativeInput.showPicker === "function") {
            nativeInput.showPicker();
            return;
          }
          if (typeof nativeInput.click === "function") {
            nativeInput.click();
          }
        }

        function setOrderMultiselectExpandedState(details) {
          if (!details) return;
          const summary = details.querySelector("summary");
          if (summary) {
            summary.setAttribute("aria-expanded", details.hasAttribute("open") ? "true" : "false");
          }
        }

        function syncOrderMultiselectValue(details) {
          if (!details) return;
          const valueNode = details.querySelector(".admin-order-multiselect-value");
          if (!valueNode) return;
          const emptyLabel = details.getAttribute("data-admin-order-multiselect-empty-label") || "Не назначен";
          const selectedValues = [];
          const seen = new Set();
          details.querySelectorAll(".admin-order-multiselect-checkbox:checked").forEach((checkbox) => {
            const value = String(checkbox.value || "").trim();
            const key = value.toLowerCase();
            if (!value || seen.has(key)) return;
            seen.add(key);
            selectedValues.push(value);
          });
          valueNode.textContent = selectedValues.length > 0 ? selectedValues.join(", ") : emptyLabel;
        }

        function closeOrderMultiselect(details) {
          if (!details || !details.hasAttribute("open")) return;
          details.open = false;
          setOrderMultiselectExpandedState(details);
        }

        function closeOrderMultiselects(exceptDetails) {
          document.querySelectorAll("[data-admin-order-multiselect][open]").forEach((details) => {
            if (details !== exceptDetails) {
              closeOrderMultiselect(details);
            }
          });
        }

        function resetAdminFields(scope) {
          if (!scope || typeof scope.querySelectorAll !== "function") return;
          scope.querySelectorAll("[data-admin-reset-value]").forEach((field) => {
            if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement) && !(field instanceof HTMLSelectElement)) {
              return;
            }
            field.value = field.getAttribute("data-admin-reset-value") || "";
          });
        }

        function setOrderAmountEditorState(panelId, expanded) {
          if (!panelId) return;
          document.querySelectorAll("[data-admin-order-amount-editor]").forEach((panel) => {
            if (panel.getAttribute("data-admin-order-amount-editor") === panelId) {
              panel.hidden = !expanded;
            }
          });
          document.querySelectorAll("[data-admin-order-amount-edit-trigger]").forEach((button) => {
            if (button.getAttribute("data-admin-order-amount-edit-trigger") === panelId) {
              button.hidden = expanded;
            }
          });
          document.querySelectorAll("[data-admin-order-amount-action-for]").forEach((button) => {
            if (button.getAttribute("data-admin-order-amount-action-for") === panelId) {
              button.hidden = !expanded;
            }
          });
        }

        function closeOrderAmountEditor(panelId, options = {}) {
          if (!panelId) return;
          const panel = document.querySelector('[data-admin-order-amount-editor="' + panelId + '"]');
          if (panel && options.reset !== false) {
            resetAdminFields(panel);
          }
          setOrderAmountEditorState(panelId, false);
        }

        function resetOrderAmountEditors(scope, options = {}) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-order-amount-editor]").forEach((panel) => {
            closeOrderAmountEditor(panel.getAttribute("data-admin-order-amount-editor"), options);
          });
        }

        function syncOrderAmountEditors(scope) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-order-amount-editor]").forEach((panel) => {
            const panelId = panel.getAttribute("data-admin-order-amount-editor");
            if (!panelId) return;
            setOrderAmountEditorState(panelId, !panel.hidden);
          });
        }

        function setOrderTeamEditorState(panelId, expanded) {
          if (!panelId) return;
          document.querySelectorAll("[data-admin-order-team-editor]").forEach((panel) => {
            if (panel.getAttribute("data-admin-order-team-editor") === panelId) {
              panel.hidden = !expanded;
            }
          });
          document.querySelectorAll("[data-admin-order-team-edit-trigger]").forEach((button) => {
            if (button.getAttribute("data-admin-order-team-edit-trigger") === panelId) {
              button.hidden = expanded;
            }
          });
          document.querySelectorAll("[data-admin-order-team-action-for]").forEach((button) => {
            if (button.getAttribute("data-admin-order-team-action-for") === panelId) {
              button.hidden = !expanded;
            }
          });
        }

        function closeOrderTeamEditor(panelId, options = {}) {
          if (!panelId) return;
          const panel = document.querySelector('[data-admin-order-team-editor="' + panelId + '"]');
          if (panel && options.reset !== false) {
            const form = panel.closest("form");
            if (form && typeof form.reset === "function") {
              form.reset();
            }
            panel.querySelectorAll("[data-admin-order-multiselect]").forEach((details) => {
              closeOrderMultiselect(details);
              syncOrderMultiselectValue(details);
            });
          }
          setOrderTeamEditorState(panelId, false);
        }

        function resetOrderTeamEditors(scope, options = {}) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-order-team-editor]").forEach((panel) => {
            closeOrderTeamEditor(panel.getAttribute("data-admin-order-team-editor"), options);
          });
        }

        function syncOrderTeamEditors(scope) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-order-team-editor]").forEach((panel) => {
            const panelId = panel.getAttribute("data-admin-order-team-editor");
            if (!panelId) return;
            setOrderTeamEditorState(panelId, !panel.hidden);
          });
        }

        function updateDialogState() {
          const hasOpenDialog = Array.from(document.querySelectorAll(dialogSelector)).some((dialog) => dialog.hasAttribute("open"));
          document.documentElement.classList.toggle("admin-dialog-open", hasOpenDialog);
          document.body.classList.toggle("admin-dialog-open", hasOpenDialog);
        }

        function openDialog(dialog) {
          if (!dialog) return;
          if (typeof dialog.showModal === "function") {
            if (!dialog.open) dialog.showModal();
          } else {
            dialog.setAttribute("open", "open");
          }
          updateDialogState();
        }

        function setToggleTriggerState(trigger, expanded) {
          if (!trigger) return;
          const openLabel = trigger.getAttribute("data-admin-toggle-label-open") || "Скрыть";
          const closedLabel = trigger.getAttribute("data-admin-toggle-label-closed") || "Открыть";
          const label = expanded ? openLabel : closedLabel;
          trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
          if (trigger.hasAttribute("data-admin-toggle-icon")) {
            trigger.setAttribute("aria-label", label);
            trigger.setAttribute("title", label);
            const srOnlyLabel = trigger.querySelector(".admin-sr-only");
            if (srOnlyLabel) srOnlyLabel.textContent = label;
            return;
          }
          trigger.textContent = label;
        }

        function setToggleStateByTarget(targetId, expanded) {
          if (!targetId) return;
          document.querySelectorAll("[data-admin-toggle-target]").forEach((trigger) => {
            if (trigger.getAttribute("data-admin-toggle-target") === targetId) {
              setToggleTriggerState(trigger, expanded);
            }
          });
        }

        function resetTogglePanels(scope) {
          if (!scope || typeof scope.querySelectorAll !== "function") return;
          scope.querySelectorAll("[data-admin-toggle-panel]").forEach((panel) => {
            panel.hidden = true;
            if (panel.id) {
              setToggleStateByTarget(panel.id, false);
            }
          });
        }

        function closeDialog(dialog) {
          if (!dialog) return;
          const returnUrl = dialog.getAttribute("data-admin-dialog-return-url");
          resetTogglePanels(dialog);
          resetOrderAmountEditors(dialog, { reset: true });
          resetOrderTeamEditors(dialog, { reset: true });
          if (typeof dialog.close === "function") {
            if (dialog.open) dialog.close();
          } else {
            dialog.removeAttribute("open");
          }
          updateDialogState();
          if (dialog === confirmDialog) {
            pendingConfirmForm = null;
            if (confirmTitle) confirmTitle.textContent = "Точно удалить?";
            if (confirmCopy) {
              confirmCopy.textContent = "";
              confirmCopy.hidden = true;
            }
          }
          if (returnUrl) {
            const currentPath = window.location.pathname + window.location.search;
            if (returnUrl !== currentPath) {
              window.location.assign(returnUrl);
            }
          }
        }

        const autoSubmitFocusStorageKey = "adminAutoSubmitFocus";
        const autoSubmitScrollStorageKey = "adminAutoSubmitScroll";

        function clearAutoSubmitTimer(form) {
          if (!form) return;
          const timerId = autoSubmitTimers.get(form);
          if (timerId) {
            window.clearTimeout(timerId);
            autoSubmitTimers.delete(form);
          }
        }

        function writeAutoSubmitFocusState(state) {
          if (!state) return;
          try {
            window.sessionStorage.setItem(autoSubmitFocusStorageKey, JSON.stringify(state));
          } catch (error) {
            void error;
          }
        }

        function clearAutoSubmitFocusState() {
          try {
            window.sessionStorage.removeItem(autoSubmitFocusStorageKey);
          } catch (error) {
            void error;
          }
        }

        function writeAutoSubmitScrollState(state) {
          if (!state) return;
          try {
            window.sessionStorage.setItem(autoSubmitScrollStorageKey, JSON.stringify(state));
          } catch (error) {
            void error;
          }
        }

        function clearAutoSubmitScrollState() {
          try {
            window.sessionStorage.removeItem(autoSubmitScrollStorageKey);
          } catch (error) {
            void error;
          }
        }

        function captureAutoSubmitFocus(form, target) {
          if (!(form instanceof HTMLFormElement)) return;
          if (form.getAttribute("data-admin-auto-submit-restore-focus") !== "true") return;
          if (!(target instanceof HTMLElement)) return;

          const fieldName = target.getAttribute("name");
          const fieldId = target.getAttribute("id");
          if (!fieldName && !fieldId) return;

          const state = {
            pathname: window.location.pathname,
            search: window.location.search,
            formAction: form.getAttribute("action") || "",
            fieldName: fieldName || "",
            fieldId: fieldId || "",
            selectionStart:
              target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
                ? target.selectionStart
                : null,
            selectionEnd:
              target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
                ? target.selectionEnd
                : null,
          };
          writeAutoSubmitFocusState(state);
        }

        function captureAutoSubmitScroll(form) {
          if (!(form instanceof HTMLFormElement)) return;
          const targetSelector = form.getAttribute("data-admin-auto-submit-scroll-target");
          if (!targetSelector) return;

          const offsetValue = Number(form.getAttribute("data-admin-auto-submit-scroll-offset") || 0);
          const safeOffset = Number.isFinite(offsetValue) ? Math.max(0, offsetValue) : 0;
          let pathname = window.location.pathname;

          try {
            const actionUrl = new URL(form.getAttribute("action") || window.location.pathname, window.location.href);
            pathname = actionUrl.pathname;
          } catch (error) {
            void error;
          }

          writeAutoSubmitScrollState({
            pathname,
            targetSelector,
            offset: safeOffset,
            timestamp: Date.now(),
          });
        }

        function restoreAutoSubmitScroll() {
          let state = null;
          try {
            const raw = window.sessionStorage.getItem(autoSubmitScrollStorageKey);
            if (!raw) return;
            state = JSON.parse(raw);
          } catch (error) {
            clearAutoSubmitScrollState();
            return;
          }

          clearAutoSubmitScrollState();

          if (!state || state.pathname !== window.location.pathname) return;
          if (!state.targetSelector) return;
          const ageMs = Date.now() - Number(state.timestamp || 0);
          if (!Number.isFinite(ageMs) || ageMs > 15000) return;

          const target = document.querySelector(state.targetSelector);
          if (!(target instanceof HTMLElement)) return;

          const offset = Number.isFinite(Number(state.offset)) ? Number(state.offset) : 0;
          window.requestAnimationFrame(() => {
            const top = window.scrollY + target.getBoundingClientRect().top - Math.max(0, offset);
            window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
          });
        }

        function restoreAutoSubmitFocus() {
          let state = null;
          try {
            const raw = window.sessionStorage.getItem(autoSubmitFocusStorageKey);
            if (!raw) return;
            state = JSON.parse(raw);
          } catch (error) {
            clearAutoSubmitFocusState();
            return;
          }

          clearAutoSubmitFocusState();

          if (!state || state.pathname !== window.location.pathname) return;

          let target = null;
          if (state.fieldId) {
            target = document.getElementById(state.fieldId);
          }
          if (!target && state.fieldName) {
            target = document.getElementsByName(state.fieldName)[0] || null;
          }
          if (!(target instanceof HTMLElement)) return;

          window.requestAnimationFrame(() => {
            if (!(target instanceof HTMLElement)) return;
            target.focus({ preventScroll: true });
            if (
              (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
              Number.isInteger(state.selectionStart) &&
              Number.isInteger(state.selectionEnd)
            ) {
              const safeStart = Math.max(0, Math.min(Number(state.selectionStart), target.value.length));
              const safeEnd = Math.max(safeStart, Math.min(Number(state.selectionEnd), target.value.length));
              target.setSelectionRange(safeStart, safeEnd);
            }
          });
        }

        function shouldSubmitAutoTextInput(target, form) {
          if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return true;
          const minLength = Number(form.getAttribute("data-admin-auto-submit-min-length") || 0);
          if (!Number.isFinite(minLength) || minLength <= 0) return true;
          const nextValue = String(target.value || "").trim();
          return nextValue.length === 0 || nextValue.length >= minLength;
        }

        function submitAutoForm(form, target = null) {
          if (!form || form.getAttribute("data-admin-auto-submitting") === "true") return;
          clearAutoSubmitTimer(form);
          form.setAttribute("data-admin-auto-submitting", "true");
          captureAutoSubmitScroll(form);
          captureAutoSubmitFocus(form, target);
          if (typeof form.requestSubmit === "function") {
            form.requestSubmit();
          } else {
            form.submit();
          }
        }

        function scheduleAutoFormSubmit(form, delayMs, target = null) {
          if (!form) return;
          clearAutoSubmitTimer(form);
          const safeDelay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
          const timerId = window.setTimeout(() => {
            autoSubmitTimers.delete(form);
            submitAutoForm(form, target);
          }, safeDelay);
          autoSubmitTimers.set(form, timerId);
        }

        function normalizeAdminPhoneDigits(value) {
          let digits = String(value || "").replace(/\D+/g, "");
          if (!digits) return "";
          while (digits.length > 10 && digits.startsWith("1")) {
            digits = digits.slice(1);
          }
          if (digits.length > 10) {
            digits = digits.slice(0, 10);
          }
          return digits.slice(0, 10);
        }

        function clampAdminPhoneInput(input) {
          if (!(input instanceof HTMLInputElement)) return;
          const nextValue = normalizeAdminPhoneDigits(input.value);
          if (input.value !== nextValue) {
            input.value = nextValue;
          }
        }

        function syncAdminPhoneInputs(root) {
          const scope = root && typeof root.querySelectorAll === "function" ? root : document;
          scope.querySelectorAll("[data-admin-phone-input]").forEach((input) => {
            clampAdminPhoneInput(input);
          });
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            syncAdminPhoneInputs(document);
            restoreAutoSubmitScroll();
            restoreAutoSubmitFocus();
          }, { once: true });
        } else {
          syncAdminPhoneInputs(document);
          restoreAutoSubmitScroll();
          restoreAutoSubmitFocus();
        }

        document.addEventListener("submit", (event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          if (!form.matches("[data-admin-auto-submit]")) return;
          clearAutoSubmitTimer(form);
          captureAutoSubmitScroll(form);
        });

        document.addEventListener("change", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          const orderMultiselectCheckbox = target.closest(".admin-order-multiselect-checkbox");
          if (orderMultiselectCheckbox) {
            syncOrderMultiselectValue(orderMultiselectCheckbox.closest("[data-admin-order-multiselect]"));
          }
          const timePickerControl = target.closest("[data-admin-time-hour], [data-admin-time-minute], [data-admin-time-meridiem]");
          if (timePickerControl) {
            applyTimePanelSelection(timePickerControl.closest("[data-admin-picker-field]"));
            return;
          }
          if (target.matches("[data-admin-phone-input]")) {
            clampAdminPhoneInput(target);
          }
          const form = target.closest("form[data-admin-auto-submit]");
          if (!(form instanceof HTMLFormElement)) return;
          if (target.matches('select, input[type="checkbox"], input[type="radio"], input[type="date"], input[type="time"]')) {
            submitAutoForm(form, target);
          }
        });

        document.addEventListener("input", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          if (target.matches("[data-admin-phone-input]")) {
            clampAdminPhoneInput(target);
          }
          const form = target.closest("form[data-admin-auto-submit]");
          if (!(form instanceof HTMLFormElement)) return;
          if (target.matches('input[type="search"], input[type="text"], input[type="tel"], input[type="email"], textarea')) {
            if (!shouldSubmitAutoTextInput(target, form)) {
              clearAutoSubmitTimer(form);
              clearAutoSubmitFocusState();
              return;
            }
            const delayMs = Number(form.getAttribute("data-admin-auto-submit-delay") || 320);
            scheduleAutoFormSubmit(form, delayMs, target);
          }
        });

        document.addEventListener("focusin", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          if (target.matches("[data-admin-phone-input]")) {
            clampAdminPhoneInput(target);
          }
        });

        document.addEventListener("click", (event) => {
          const orderAmountOpenTrigger = event.target.closest("[data-admin-order-amount-open]");
          if (orderAmountOpenTrigger) {
            event.preventDefault();
            resetOrderTeamEditors(document, { reset: true });
            const panelId = orderAmountOpenTrigger.getAttribute("data-admin-order-amount-open");
            const panel = panelId ? document.querySelector('[data-admin-order-amount-editor="' + panelId + '"]') : null;
            setOrderAmountEditorState(panelId, true);
            const firstField = panel ? panel.querySelector("input, textarea, select") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
              if (typeof firstField.select === "function") {
                firstField.select();
              }
            }
            return;
          }

          const orderAmountCancelTrigger = event.target.closest("[data-admin-order-amount-cancel]");
          if (orderAmountCancelTrigger) {
            event.preventDefault();
            closeOrderAmountEditor(orderAmountCancelTrigger.getAttribute("data-admin-order-amount-cancel"), { reset: true });
            return;
          }

          const orderTeamOpenTrigger = event.target.closest("[data-admin-order-team-open]");
          if (orderTeamOpenTrigger) {
            event.preventDefault();
            resetOrderAmountEditors(document, { reset: true });
            resetOrderTeamEditors(document, { reset: true });
            const panelId = orderTeamOpenTrigger.getAttribute("data-admin-order-team-open");
            const panel = panelId ? document.querySelector('[data-admin-order-team-editor="' + panelId + '"]') : null;
            setOrderTeamEditorState(panelId, true);
            const firstField = panel ? panel.querySelector("summary, input, textarea, select") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
            }
            return;
          }

          const orderTeamCancelTrigger = event.target.closest("[data-admin-order-team-cancel]");
          if (orderTeamCancelTrigger) {
            event.preventDefault();
            closeOrderTeamEditor(orderTeamCancelTrigger.getAttribute("data-admin-order-team-cancel"), { reset: true });
            return;
          }

          const activeOrderMultiselect = event.target.closest("[data-admin-order-multiselect]");
          if (!activeOrderMultiselect) {
            closeOrderMultiselects(null);
          }

          const activeTimeField = event.target.closest("[data-admin-picker-field='time']");
          if (!activeTimeField) {
            closeAllTimePickerPanels();
          }

          const confirmTrigger = event.target.closest("[data-admin-confirm]");
          if (confirmTrigger) {
            pendingConfirmForm = confirmTrigger.form || confirmTrigger.closest("form");
            if (!pendingConfirmForm || !confirmDialog) return;
            if (confirmTitle) {
              confirmTitle.textContent = confirmTrigger.getAttribute("data-admin-confirm-title") || "Точно удалить?";
            }
            if (confirmCopy) {
              const message = confirmTrigger.getAttribute("data-admin-confirm-message") || "";
              confirmCopy.textContent = message;
              confirmCopy.hidden = !message;
            }
            openDialog(confirmDialog);
            return;
          }

          const confirmAccept = event.target.closest("[data-admin-confirm-accept]");
          if (confirmAccept) {
            const formToSubmit = pendingConfirmForm;
            if (!formToSubmit) {
              closeDialog(confirmDialog);
              return;
            }
            pendingConfirmForm = null;
            closeDialog(confirmDialog);
            if (typeof formToSubmit.requestSubmit === "function") {
              formToSubmit.requestSubmit();
            } else {
              formToSubmit.submit();
            }
            return;
          }

          const pickerTrigger = event.target.closest("[data-admin-picker-trigger]");
          if (pickerTrigger) {
            event.preventDefault();
            openPickerField(pickerTrigger.closest("[data-admin-picker-field]"));
            return;
          }

          const addAddressTrigger = event.target.closest("[data-admin-client-address-add]");
          if (addAddressTrigger) {
            const editor = addAddressTrigger.closest("[data-admin-client-address-editor]");
            const list = editor ? editor.querySelector("[data-admin-client-address-list]") : null;
            const templateId = addAddressTrigger.getAttribute("data-admin-client-address-template");
            const template = templateId ? document.getElementById(templateId) : null;
            if (!editor || !list || !(template instanceof HTMLTemplateElement)) return;

            const nextIndex = Number(editor.getAttribute("data-admin-client-address-next-index") || "0");
            const markup = template.innerHTML.replace(/__INDEX__/g, String(Number.isFinite(nextIndex) ? nextIndex : 0));
            list.insertAdjacentHTML("beforeend", markup);
            editor.setAttribute("data-admin-client-address-next-index", String((Number.isFinite(nextIndex) ? nextIndex : 0) + 1));

            const newRow = list.lastElementChild;
            if (newRow && typeof window.__adminBindAddressAutocomplete === "function") {
              window.__adminBindAddressAutocomplete(newRow);
            }
            const firstField = newRow ? newRow.querySelector("input, textarea, select") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
            }
            return;
          }

          const removeAddressTrigger = event.target.closest("[data-admin-client-address-remove]");
          if (removeAddressTrigger) {
            event.preventDefault();
            const row = removeAddressTrigger.closest("[data-admin-client-address-row]");
            if (!row) return;

            const list = row.parentElement;
            const nextFocusable =
              row.nextElementSibling?.querySelector("input, textarea, select, button") ||
              row.previousElementSibling?.querySelector("input, textarea, select, button") ||
              list?.parentElement?.querySelector("[data-admin-client-address-add]");

            row.remove();

            if (nextFocusable && typeof nextFocusable.focus === "function") {
              nextFocusable.focus();
            }
            return;
          }

          const toggleTrigger = event.target.closest("[data-admin-toggle-target]");
          if (toggleTrigger) {
            const targetId = toggleTrigger.getAttribute("data-admin-toggle-target");
            const panel = targetId ? document.getElementById(targetId) : null;
            if (!panel) return;
            const expanded = panel.hidden;
            panel.hidden = !expanded;
            setToggleStateByTarget(targetId, expanded);
            if (expanded) {
              const firstField = panel.querySelector("input, textarea, select");
              if (firstField && typeof firstField.focus === "function") {
                firstField.focus();
              }
            }
            return;
          }

          const rowTrigger = event.target.closest("[data-admin-row-href]");
          if (rowTrigger) {
            const interactiveTrigger = event.target.closest("a, button, input, select, textarea, summary, label");
            if (!interactiveTrigger) {
              const href = rowTrigger.getAttribute("data-admin-row-href");
              if (href) {
                window.location.assign(href);
              }
              return;
            }
          }

          const openTrigger = event.target.closest("[data-admin-dialog-open]");
          if (openTrigger) {
            const dialog = document.getElementById(openTrigger.getAttribute("data-admin-dialog-open"));
            openDialog(dialog);
            return;
          }

          const closeTrigger = event.target.closest("[data-admin-dialog-close]");
          if (closeTrigger) {
            const dialog = document.getElementById(closeTrigger.getAttribute("data-admin-dialog-close"));
            closeDialog(dialog);
            return;
          }

          const dialog = event.target.closest(dialogSelector);
          if (dialog && event.target === dialog) {
            closeDialog(dialog);
          }
        });

        document.addEventListener("input", (event) => {
          const nativeInput = event.target.closest("[data-admin-picker-native]");
          if (nativeInput) {
            syncPickerDisplayFromNative(nativeInput.closest("[data-admin-picker-field]"));
          }
        });

        document.addEventListener("change", (event) => {
          const nativeInput = event.target.closest("[data-admin-picker-native]");
          if (nativeInput) {
            syncPickerDisplayFromNative(nativeInput.closest("[data-admin-picker-field]"));
            return;
          }
          const displayInput = event.target.closest("[data-admin-picker-display]");
          if (displayInput) {
            const field = displayInput.closest("[data-admin-picker-field]");
            syncPickerNativeFromDisplay(field);
            if (field && field.getAttribute("data-admin-picker-field") === "time") {
              syncTimePanelFromField(field);
            }
          }
        });

        document.addEventListener("blur", (event) => {
          const displayInput = event.target.closest("[data-admin-picker-display]");
          if (displayInput) {
            const field = displayInput.closest("[data-admin-picker-field]");
            syncPickerNativeFromDisplay(field);
            if (field && field.getAttribute("data-admin-picker-field") === "time") {
              syncTimePanelFromField(field);
            }
          }
        }, true);

        document.addEventListener("keydown", (event) => {
          if ((event.key === "Enter" || event.key === " ") && event.target instanceof HTMLElement) {
            const rowOpenTrigger = event.target.closest("[data-admin-dialog-open][data-admin-dialog-row]");
            if (rowOpenTrigger && event.target === rowOpenTrigger) {
              event.preventDefault();
              const dialog = document.getElementById(rowOpenTrigger.getAttribute("data-admin-dialog-open"));
              openDialog(dialog);
              return;
            }

            const rowTrigger = event.target.closest("[data-admin-row-href]");
            if (rowTrigger && event.target === rowTrigger) {
              event.preventDefault();
              const href = rowTrigger.getAttribute("data-admin-row-href");
              if (href) {
                window.location.assign(href);
              }
              return;
            }
          }
          if (event.key === "Escape") {
            const openTimeField = document.querySelector("[data-admin-picker-field='time'][data-admin-time-open='true']");
            if (openTimeField) {
              event.preventDefault();
              closeTimePickerPanel(openTimeField);
              return;
            }
            const openOrderMultiselect = document.querySelector("[data-admin-order-multiselect][open]");
            if (openOrderMultiselect) {
              event.preventDefault();
              closeOrderMultiselect(openOrderMultiselect);
              return;
            }
            const openOrderAmountEditor = document.querySelector("[data-admin-order-amount-editor]:not([hidden])");
            if (openOrderAmountEditor) {
              event.preventDefault();
              closeOrderAmountEditor(openOrderAmountEditor.getAttribute("data-admin-order-amount-editor"), { reset: true });
              return;
            }
            const openOrderTeamEditor = document.querySelector("[data-admin-order-team-editor]:not([hidden])");
            if (openOrderTeamEditor) {
              event.preventDefault();
              closeOrderTeamEditor(openOrderTeamEditor.getAttribute("data-admin-order-team-editor"), { reset: true });
              return;
            }
          }
          if (event.key !== "Escape") return;
          const openDialogs = Array.from(document.querySelectorAll(dialogSelector)).filter((dialog) => dialog.hasAttribute("open"));
          const lastDialog = openDialogs[openDialogs.length - 1] || null;
          if (lastDialog && typeof lastDialog.showModal !== "function") {
            event.preventDefault();
            closeDialog(lastDialog);
          }
        });

        document.querySelectorAll(dialogSelector).forEach((dialog) => {
          dialog.addEventListener("close", updateDialogState);
          dialog.addEventListener("cancel", (event) => {
            if (dialog.getAttribute("data-admin-dialog-return-url")) {
              event.preventDefault();
              closeDialog(dialog);
              return;
            }
            setTimeout(updateDialogState, 0);
          });
        });

        document.querySelectorAll("[data-admin-order-multiselect]").forEach((details) => {
          syncOrderMultiselectValue(details);
          setOrderMultiselectExpandedState(details);
          details.addEventListener("toggle", () => {
            if (details.hasAttribute("open")) {
              closeOrderMultiselects(details);
            }
            setOrderMultiselectExpandedState(details);
          });
        });

        syncOrderAmountEditors(document);
        syncOrderTeamEditors(document);

        document.querySelectorAll(\`\${dialogSelector}[data-admin-dialog-autopen="true"]\`).forEach((dialog) => {
          openDialog(dialog);
        });

        document.querySelectorAll("[data-admin-toggle-target]").forEach((trigger) => {
          const targetId = trigger.getAttribute("data-admin-toggle-target");
          const panel = targetId ? document.getElementById(targetId) : null;
          setToggleTriggerState(trigger, panel ? !panel.hidden : false);
        });

        syncAdminPhoneInputs(document);

        updateDialogState();
      })();
    </script>
    ${bodyScripts}
  </body>
  </html>`;
  }

  function renderAdminUnavailablePage() {
    return renderAdminLayout(
      "Админка недоступна",
      `${renderAdminCard(
        "Вход временно недоступен",
        "Нужные настройки для входа пока не завершены.",
        `<div class="admin-alert admin-alert-error">Админка сейчас недоступна. Пожалуйста, обратитесь к разработчику.</div>`,
        { eyebrow: "Статус", muted: true }
      )}`,
      {
        kicker: "SHYNLI CLEANING",
        subtitle: "Как только настройки будут готовы, вход снова заработает.",
        sidebar: renderAdminAuthSidebar("login"),
      }
    );
  }

  function renderLoginPage(config, options = {}) {
    const errorBlock = options.error
      ? `<div class="admin-alert admin-alert-error">${escapeHtml(options.error)}</div>`
      : "";
    const infoBlock = options.info
      ? `<div class="admin-alert admin-alert-info">${escapeHtml(options.info)}</div>`
      : "";

    return renderAdminLayout(
      "Вход в админку",
      `${errorBlock}
        ${infoBlock}
        <div class="admin-section-grid admin-form-grid-two">
          ${renderAdminCard(
            "Вход",
            "Введите почту и пароль.",
            `<form class="admin-form" method="post" action="${ADMIN_LOGIN_PATH}" autocomplete="on">
              <label class="admin-label">
                Почта
                <input class="admin-input" type="email" name="email" value="${escapeHtmlText(options.email || config.email)}" autocomplete="username" required>
              </label>
              <label class="admin-label">
                Пароль
                <input class="admin-input" type="password" name="password" autocomplete="current-password" required>
              </label>
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit">Продолжить</button>
                <span class="admin-action-hint">Шаг 1 из 2.</span>
              </div>
            </form>`,
            { eyebrow: "Вход" }
          )}
          ${renderAdminCard(
            "Дальше",
            "После пароля понадобится код из приложения.",
            `<ul class="admin-feature-list">
              <li>Если приложение ещё не настроено, на следующем шаге появится QR-код.</li>
              <li>Для входа нужен текущий 6-значный код.</li>
              <li>После подтверждения откроется админка.</li>
            </ul>`,
            { eyebrow: "Подсказка", muted: true }
          )}
        </div>`,
      {
        subtitle: "Введите почту и пароль, затем подтвердите вход кодом из приложения.",
        sidebar: renderAdminAuthSidebar("login"),
      }
    );
  }

  function renderTwoFactorPage(config, options = {}) {
    const errorBlock = options.error
      ? `<div class="admin-alert admin-alert-error">${escapeHtml(options.error)}</div>`
      : "";
    const secret = options.secret || adminAuth.getTotpSecretMaterial(config);
    const qrMarkup = options.qrMarkup || "";

    return renderAdminLayout(
      "Подтверждение входа",
      `${errorBlock}
        <div class="admin-section-grid admin-form-grid-two">
          ${renderAdminCard(
            "Код из приложения",
            "Введите текущий 6-значный код.",
            `<form class="admin-form" method="post" action="${ADMIN_2FA_PATH}" autocomplete="off">
              <label class="admin-label">
                Код
                <input class="admin-input admin-input-code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" name="code" placeholder="123456" autocomplete="one-time-code" required>
              </label>
              <p class="admin-field-note">Шаг 2 из 2.</p>
              <div class="admin-inline-actions">
                <button class="admin-button" type="submit">Подтвердить вход</button>
                <a class="admin-link-button admin-button-secondary" href="${ADMIN_LOGIN_PATH}">Назад</a>
              </div>
            </form>`,
            { eyebrow: "Код" }
          )}
          ${renderAdminCard(
            "Настройка приложения",
            "Если приложение ещё не подключено, используйте QR-код или ключ ниже.",
            `<details class="admin-details" open>
              <summary>QR-код и ключ</summary>
              <div class="admin-form-grid admin-form-grid-two" style="margin-top:14px;">
                ${renderAdminCard(
                  "QR-код",
                  "Откройте приложение и отсканируйте код.",
                  qrMarkup
                    ? `<div class="admin-qr-card">
                        ${qrMarkup}
                        <p class="admin-field-note">Подойдёт Google Authenticator, 1Password и похожие приложения.</p>
                      </div>`
                    : `<p class="admin-field-note">Если QR-код не появился, используйте ключ вручную.</p>`,
                  { eyebrow: "QR", muted: true }
                )}
                ${renderAdminCard(
                  "Ключ вручную",
                  "Введите эти данные в приложении, если QR-код не используется.",
                  `<div class="admin-property-list">
                    <div class="admin-property-row">
                      <span class="admin-property-label">Сервис</span>
                      <span class="admin-property-value">${escapeHtml(config.issuer)}</span>
                    </div>
                    <div class="admin-property-row">
                      <span class="admin-property-label">Аккаунт</span>
                      <span class="admin-property-value">${escapeHtml(config.email)}</span>
                    </div>
                    <div class="admin-property-row">
                      <span class="admin-property-label">Ключ</span>
                      <span class="admin-property-value"><code>${escapeHtml(secret.base32)}</code></span>
                    </div>
                  </div>`,
                  { eyebrow: "Ключ", muted: true }
                )}
              </div>
            </details>`,
            { eyebrow: "Настройка", muted: true }
          )}
        </div>`,
      {
        subtitle: "Введите код из приложения для подтверждения входа.",
        sidebar: renderAdminAuthSidebar("2fa"),
      }
    );
  }

  function renderAdminPropertyList(rows = []) {
    return `<div class="admin-property-list">
      ${rows
        .map(
          (row) => `<div class="admin-property-row">
            <span class="admin-property-label">${escapeHtml(row.label)}</span>
            <span class="admin-property-value">${row.raw ? row.value : escapeHtml(row.value)}</span>
          </div>`
        )
        .join("")}
    </div>`;
  }

  return {
    renderAdminAppSidebar,
    renderAdminAuthSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderAdminPropertyList,
    renderAdminUnavailablePage,
    renderLoginPage,
    renderTwoFactorPage,
  };
}

module.exports = {
  createAdminSharedRenderers,
};
