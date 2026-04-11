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

  function renderAdminAppSidebar(activePath) {
    const navItemByPath = new Map(ADMIN_APP_NAV_ITEMS.map((item) => [item.path, item]));
    const navGroups = [
      ["/admin"],
      ["/admin/quote-ops"],
      ["/admin/orders", "/admin/clients"],
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
            .map((item) => `<a class="admin-nav-link${item.path === activePath ? " admin-nav-link-active" : ""}" href="${item.path}">${escapeHtml(item.label)}</a>`)
            .join("")}
        </div>`;
      })
      .filter(Boolean)
      .join("");

    return `
      <div class="admin-sidebar-card">
        <div class="admin-brand">
          <div class="admin-brand-mark">S</div>
          <div>
            <p class="admin-sidebar-label">SHYNLI CLEANING</p>
            <h2 class="admin-sidebar-title">Панель управления</h2>
          </div>
        </div>
        <p class="admin-sidebar-copy">Основные рабочие разделы.</p>
        <nav class="admin-nav">
          ${navMarkup}
        </nav>
        <div class="admin-inline-actions admin-sidebar-actions">
          <form class="admin-logout-form" method="post" action="${ADMIN_LOGOUT_PATH}">
            <button class="admin-button admin-button-secondary" type="submit">Выйти</button>
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
      .admin-sidebar-copy {
        margin: 0 0 18px;
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
      .admin-nav-group {
        display: grid;
        gap: 6px;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }
      .admin-nav-group + .admin-nav-group {
        margin-top: 2px;
        padding-top: 8px;
        border-top: 1px solid rgba(24, 24, 27, 0.08);
      }
      .admin-nav-link:hover,
      .admin-link-tile:hover {
        border-color: rgba(158, 67, 90, 0.24);
        background: rgba(255,255,255,0.96);
        transform: translateY(-1px);
      }
      .admin-nav-link {
        position: relative;
        padding: 10px 14px 10px 18px;
        border-color: rgba(24, 24, 27, 0.08);
        border-radius: 14px;
        background: rgba(255,255,255,0.88);
        box-shadow: none;
        font-size: 15px;
        line-height: 1.25;
      }
      .admin-nav-link:hover {
        transform: none;
        border-color: rgba(158, 67, 90, 0.16);
        background: rgba(255,255,255,0.96);
      }
      .admin-nav-link-active {
        border-color: rgba(158, 67, 90, 0.18);
        background: rgba(158, 67, 90, 0.08);
        color: var(--accent);
        font-weight: 700;
        box-shadow: none;
      }
      .admin-nav-link-active::before {
        content: "";
        position: absolute;
        top: 8px;
        bottom: 8px;
        left: 8px;
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
      .admin-field-note {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
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
      .admin-input-code {
        text-align: center;
        letter-spacing: 0.24em;
        font-size: 24px;
        font-weight: 700;
      }
      .admin-address-field {
        position: relative;
      }
      .admin-address-suggestions {
        position: absolute;
        left: 0;
        right: 0;
        top: calc(100% + 8px);
        z-index: 24;
        display: grid;
        gap: 4px;
        padding: 8px;
        border: 1px solid rgba(228, 228, 231, 0.96);
        border-radius: 16px;
        background: rgba(255,255,255,0.98);
        box-shadow: 0 18px 38px rgba(24, 24, 27, 0.12);
        backdrop-filter: blur(16px);
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
        margin-top: 16px;
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
        border-radius: 20px;
        background: rgba(255,255,255,0.98);
      }
      .admin-quote-success-table {
        min-width: 1180px;
      }
      .admin-quote-table-action {
        width: 112px;
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
      .admin-table {
        width: 100%;
        min-width: 0;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .admin-clients-table {
        min-width: 1160px;
      }
      .admin-orders-table {
        min-width: 1240px;
      }
      .admin-staff-table {
        min-width: 980px;
      }
      .admin-table th,
      .admin-table td {
        padding: 16px;
        border-bottom: 1px solid rgba(228, 228, 231, 0.92);
        vertical-align: top;
        text-align: left;
        min-width: 0;
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
      .admin-clients-table th,
      .admin-clients-table td {
        padding: 18px 20px;
      }
      .admin-orders-table th,
      .admin-orders-table td {
        padding: 18px 20px;
      }
      .admin-staff-table th,
      .admin-staff-table td {
        padding: 18px 20px;
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
      .admin-table tbody tr:last-child td {
        border-bottom: 0;
      }
      .admin-table tbody tr:hover td {
        background: rgba(158, 67, 90, 0.04);
      }
      .admin-table-row-clickable {
        cursor: pointer;
      }
      .admin-table-row-clickable:focus-visible td {
        background: rgba(158, 67, 90, 0.06);
      }
      .admin-table-row-active td {
        background: rgba(158, 67, 90, 0.08);
      }
      .admin-table-row-active td:first-child {
        box-shadow: inset 4px 0 0 var(--accent);
      }
      .admin-table-link {
        font-weight: 700;
        font-size: 16px;
        line-height: 1.25;
        text-decoration: none;
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
        gap: 14px;
        min-width: 0;
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
        gap: 4px;
        min-width: 0;
      }
      .admin-table-cell-stack {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      .admin-table-strong {
        font-weight: 600;
        line-height: 1.45;
      }
      .admin-table-muted {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
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
      .admin-client-dialog-meta {
        word-break: break-word;
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
      }
      .admin-order-quote-card {
        display: grid;
        gap: 14px;
        padding: 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: var(--radius-md);
        background: rgba(255,255,255,0.92);
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
        margin: 0 0 14px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
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
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        list-style: none;
      }
      .admin-order-editor summary::-webkit-details-marker {
        display: none;
      }
      .admin-order-editor summary::after {
        content: "Открыть поля";
        color: var(--accent);
        font-size: 13px;
        font-weight: 700;
      }
      .admin-order-editor[open] summary::after {
        content: "Скрыть";
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
        .admin-compact-summary-strip,
        .admin-overview-strip,
        .admin-diagnostics-grid,
        .admin-clients-filter-bar,
        .admin-orders-filter-bar,
        .admin-client-metric-grid,
        .admin-client-info-grid,
        .admin-client-contact-grid,
        .admin-client-detail-grid {
          grid-template-columns: 1fr;
        }
        .admin-clients-search-form,
        .admin-clients-toolbar-left {
          width: 100%;
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

        function closeDialog(dialog) {
          if (!dialog) return;
          const returnUrl = dialog.getAttribute("data-admin-dialog-return-url");
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

        document.addEventListener("click", (event) => {
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

        document.addEventListener("keydown", (event) => {
          if ((event.key === "Enter" || event.key === " ") && event.target instanceof HTMLElement) {
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

        document.querySelectorAll(\`\${dialogSelector}[data-admin-dialog-autopen="true"]\`).forEach((dialog) => {
          openDialog(dialog);
        });

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
