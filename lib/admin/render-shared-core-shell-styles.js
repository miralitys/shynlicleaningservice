"use strict";

const ADMIN_SHARED_CORE_SHELL_STYLES = `
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
        gap: 14px;
      }
      .admin-shell-with-sidebar {
        grid-template-columns: 280px minmax(0, 1fr);
        align-items: start;
      }
      .admin-sidebar {
        display: grid;
        gap: 12px;
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
        padding: 20px;
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
        gap: 12px;
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
      .admin-nav { gap: 8px; }
      .admin-sidebar-nav { gap: 6px; }
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
        justify-content: space-between;
        gap: 10px;
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
      .admin-nav-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 25px;
        height: 25px;
        padding: 0 8px;
        border-radius: 999px;
        background: linear-gradient(180deg, var(--accent), #87364e);
        color: #fff;
        font-size: 12px;
        line-height: 1;
        font-weight: 900;
        box-shadow: 0 10px 20px rgba(158, 67, 90, 0.22);
      }
      .admin-nav-link:hover {
        transform: none;
        border-color: rgba(158, 67, 90, 0.16);
        background: rgba(255,255,255,0.98);
        color: rgba(74, 31, 43, 0.96);
      }
      .admin-nav-item-shell { display: grid; gap: 0; }
      .admin-nav-item-shell-staff { gap: 8px; }
      .admin-nav-sublinks { display: grid; gap: 6px; padding-left: 14px; }
      .admin-nav-sublink {
        position: relative;
        display: flex;
        align-items: center;
        min-height: 38px;
        padding: 8px 15px 8px 18px;
        border: 1px solid rgba(24, 24, 27, 0.07);
        border-radius: 15px;
        background: rgba(255,255,255,0.92);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.82);
        color: var(--foreground);
        font-size: 14px;
        font-weight: 600;
        line-height: 1.2;
        text-decoration: none;
        transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
      }
      .admin-nav-sublink::before {
        content: "";
        position: absolute;
        top: 10px;
        bottom: 10px;
        left: 10px;
        width: 3px;
        border-radius: 999px;
        background: rgba(158, 67, 90, 0.14);
      }
      .admin-nav-sublink:hover {
        border-color: rgba(158, 67, 90, 0.16);
        background: rgba(255,255,255,0.98);
        color: rgba(74, 31, 43, 0.96);
      }
      .admin-nav-sublink-active {
        border-color: rgba(158, 67, 90, 0.2);
        background: linear-gradient(180deg, rgba(158, 67, 90, 0.08), rgba(255,255,255,0.98));
        color: var(--accent);
        font-weight: 700;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);
      }
      .admin-nav-sublink-active::before {
        background: linear-gradient(180deg, var(--accent), #d36f89);
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
      .admin-link-tile strong { display: block; font-size: 14px; margin-bottom: 6px; }
      .admin-link-tile span { display: block; color: var(--muted); font-size: 13px; line-height: 1.55; }
      .admin-divider { height: 1px; background: var(--border); margin: 2px 0; }
      .admin-panel { overflow: hidden; }
      .admin-hero {
        padding: 22px 28px 14px;
        border-bottom: 1px solid rgba(228, 228, 231, 0.88);
        background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(250,250,251,0.68));
      }
      .admin-hero-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(280px, 430px);
        align-items: center;
        gap: 16px 24px;
      }
      .admin-hero-copy { min-width: 0; display: grid; gap: 8px; }
      .admin-hero-side {
        min-width: 0;
        display: grid;
        gap: 10px;
        justify-items: stretch;
        align-self: center;
      }
      .admin-hero-summary {
        position: relative;
        display: flex;
        align-items: center;
        min-height: 84px;
        padding: 10px 16px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(249,245,247,0.9));
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);
      }
      .admin-hero-summary::before {
        content: "";
        position: absolute;
        top: 12px;
        bottom: 12px;
        left: 14px;
        width: 3px;
        border-radius: 999px;
        background: linear-gradient(180deg, var(--accent), #d36f89);
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
        margin: 0;
        padding-left: 14px;
        max-width: none;
        color: var(--muted-foreground);
        font-size: 15px;
        line-height: 1.55;
      }
      .admin-hero-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .admin-hero-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
        gap: 12px;
      }
      .admin-hero-actions .admin-dialog-launcher { gap: 0; }
      .admin-dialog-launcher-inline { display: flex; align-items: center; justify-content: flex-end; }
      .admin-content { padding: 20px 28px 24px; min-width: 0; }
      .admin-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.82));
        box-shadow: var(--shadow-sm);
      }
      .admin-card-header { padding: 16px 16px 0; display: grid; gap: 5px; }
      .admin-card-eyebrow {
        margin: 0;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-card-title { margin: 0; font-size: 18px; line-height: 1.2; }
      .admin-card-description { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.6; }
      .admin-card-content { padding: 16px; display: grid; gap: 14px; }
      .admin-stats-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
      .admin-section-grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      .admin-form { max-width: 520px; }
      .admin-form-grid-two { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
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
      .admin-checkbox-field { align-content: start; }
      .admin-checkbox-row {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 14px 16px;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-weight: 500;
        color: var(--muted-foreground);
        line-height: 1.45;
      }
      .admin-checkbox-row input[type="checkbox"] {
        margin: 2px 0 0;
        width: 18px;
        height: 18px;
        accent-color: var(--accent);
        flex: 0 0 auto;
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
      .admin-field-note[data-state="success"] { color: #1f7a71; }
      .admin-field-note[data-state="error"] { color: var(--danger); }
      .account-signature-field { display: grid; gap: 12px; }
      [data-account-w9-field][data-invalid="true"] { color: var(--danger); }
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
      .account-signature-clear { min-width: 128px; white-space: nowrap; }
      .account-signature-clear:disabled { opacity: 0.5; cursor: not-allowed; }
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
      .account-signature-field[data-has-signature="true"] .account-signature-surface::after { opacity: 0; }
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
      [data-account-signature-status][data-tone="success"] { color: var(--success); }
      [data-account-signature-status][data-tone="danger"] { color: var(--danger); }
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
      .admin-input::placeholder { color: #a1a1aa; }
      select.admin-input { padding-right: 40px; }
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
`;

module.exports = {
  ADMIN_SHARED_CORE_SHELL_STYLES,
};
