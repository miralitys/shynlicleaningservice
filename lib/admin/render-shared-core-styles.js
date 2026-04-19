"use strict";

const ADMIN_SHARED_CORE_STYLES = [
  `
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
        padding-left: 14px;
      }
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
        margin: 2px 0;
      }
      .admin-panel {
        overflow: hidden;
      }
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
      .admin-hero-copy {
        min-width: 0;
        display: grid;
        gap: 8px;
      }
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
      .admin-hero-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .admin-hero-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
        gap: 12px;
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
        padding: 20px 28px 24px;
        min-width: 0;
      }
      .admin-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.82));
        box-shadow: var(--shadow-sm);
      }
      .admin-card-header {
        padding: 16px 16px 0;
        display: grid;
        gap: 5px;
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
        padding: 16px;
        display: grid;
        gap: 14px;
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
      .admin-checkbox-field {
        align-content: start;
      }
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
      .admin-field-note[data-state="success"] {
        color: #1f7a71;
      }
      .admin-field-note[data-state="error"] {
        color: var(--danger);
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
`,
  `
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
      .admin-table {
        width: max-content;
        min-width: 100%;
        border-collapse: collapse;
        table-layout: auto;
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
`,
  `
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
      .admin-settings-nav-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px 16px;
      }
      .admin-settings-nav {
        flex: 1 1 420px;
        margin-bottom: 0;
      }
      .admin-settings-nav-actions {
        margin-left: auto;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        flex: 0 0 auto;
      }
      .admin-subnav-strip {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .admin-subnav-link {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        padding: 0 16px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: rgba(255,255,255,0.78);
        color: var(--muted-foreground);
        font-weight: 600;
        text-decoration: none;
        transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
      }
      .admin-subnav-link:hover {
        border-color: rgba(158, 67, 90, 0.18);
        background: rgba(255,255,255,0.94);
        color: rgba(74, 31, 43, 0.96);
      }
      .admin-subnav-link-active {
        border-color: rgba(158, 67, 90, 0.22);
        background: rgba(158, 67, 90, 0.10);
        color: var(--accent);
      }
      .admin-settings-nav-link {
        gap: 10px;
        justify-content: space-between;
        min-width: 0;
        padding: 0 14px;
      }
      .admin-settings-nav-label {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
      }
      .admin-settings-nav-meta {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(24, 24, 27, 0.06);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        white-space: nowrap;
      }
      .admin-settings-nav-link-active .admin-settings-nav-meta {
        background: rgba(158, 67, 90, 0.12);
        color: var(--accent);
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
        gap: 10px;
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
      .admin-dialog-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: start;
        padding: 18px 20px;
        border: 1px solid rgba(228, 228, 231, 0.92);
        border-radius: 28px;
        background:
          radial-gradient(circle at top left, rgba(158, 67, 90, 0.08), transparent 38%),
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,246,247,0.96));
        box-shadow: 0 18px 34px rgba(15, 23, 42, 0.06);
      }
      .admin-dialog-hero-main {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        min-width: 0;
      }
      .admin-dialog-hero-copy {
        display: grid;
        gap: 6px;
        min-width: 0;
        padding-top: 2px;
      }
      .admin-dialog-hero-title-block {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      .admin-dialog-hero .admin-dialog-title {
        font-size: 26px;
        line-height: 1.02;
      }
      .admin-dialog-hero-subtitle {
        margin: 0;
        color: var(--foreground);
        font-size: 16px;
        line-height: 1.35;
        font-weight: 700;
      }
      .admin-dialog-hero-detail {
        margin: 0;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.35;
        word-break: break-word;
      }
      .admin-dialog-hero-meta-stack {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .admin-dialog-hero-actions {
        justify-self: end;
        justify-content: flex-end;
        margin-left: 0;
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
        gap: 14px;
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
      }
`,
  `
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
      .admin-settings-disclosure {
        margin-top: 2px;
      }
      .admin-settings-disclosure summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        list-style: none;
      }
      .admin-settings-disclosure summary::-webkit-details-marker {
        display: none;
      }
      .admin-settings-disclosure-copy {
        display: grid;
        gap: 4px;
      }
      .admin-settings-disclosure-title {
        font-size: 15px;
        font-weight: 700;
      }
      .admin-settings-disclosure-meta {
        font-size: 13px;
        font-weight: 500;
        color: var(--muted);
      }
      .admin-settings-disclosure-toggle {
        font-size: 13px;
        font-weight: 700;
        color: var(--accent);
        white-space: nowrap;
      }
      .admin-settings-disclosure-body {
        display: grid;
        gap: 14px;
        margin-top: 14px;
      }
      .admin-logout-form {
        margin: 0;
        width: 100%;
      }
`,
].join("\n");

module.exports = {
  ADMIN_SHARED_CORE_STYLES,
};
