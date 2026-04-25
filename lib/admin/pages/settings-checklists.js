"use strict";

function createSettingsChecklistHelpers(deps = {}) {
  const {
    ADMIN_SETTINGS_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    formatSettingsMetaCount,
    normalizeString,
    renderAdminBadge,
    renderAdminDialogCloseButton,
    renderAdminToggleIconButton,
  } = deps;

  function renderChecklistEditorRemoveButton(label = "Удалить пункт") {
    const normalizedLabel = normalizeString(label, 120) || "Удалить пункт";
    return `<button
      class="admin-icon-button admin-delete-button"
      type="button"
      data-admin-checklist-remove-item="true"
      aria-label="${escapeHtmlAttribute(normalizedLabel)}"
      title="${escapeHtmlAttribute(normalizedLabel)}"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 3.75h6a1.25 1.25 0 0 1 1.25 1.25V6h3a.75.75 0 0 1 0 1.5h-1.02l-.78 10.64A2.25 2.25 0 0 1 15.2 20.25H8.8a2.25 2.25 0 0 1-2.24-2.11L5.78 7.5H4.75a.75.75 0 0 1 0-1.5h3V5A1.25 1.25 0 0 1 9 3.75Zm5.75 2.25V5.25H9.25V6h5.5Zm-6.69 1.5.74 10.53a.75.75 0 0 0 .75.72h5.9a.75.75 0 0 0 .75-.72l.74-10.53H8.06Zm2.19 2.25a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V10.5a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
      </svg>
      <span class="admin-sr-only">${escapeHtml(normalizedLabel)}</span>
    </button>`;
  }

  function renderChecklistEditorRow(item, index) {
    return `<div class="admin-checklist-edit-row" data-admin-checklist-edit-row>
      <span class="admin-checklist-edit-index">${escapeHtml(String(index + 1))}</span>
      <input type="hidden" name="itemId" value="${escapeHtmlAttribute(item.id)}">
      <div class="admin-checklist-edit-fields">
        <input class="admin-input admin-checklist-edit-input" type="text" name="itemLabel" value="${escapeHtmlText(item.label)}" maxlength="240" placeholder="Например: проверить зеркала">
        <input class="admin-input admin-checklist-edit-input admin-checklist-edit-hint" type="text" name="itemHint" value="${escapeHtmlText(item.hint || "")}" maxlength="240" placeholder="Подсказка, например: все комнаты">
      </div>
      ${renderChecklistEditorRemoveButton()}
    </div>`;
  }

  function renderChecklistTemplatePreview(template) {
    const itemCountLabel = formatSettingsMetaCount(template.items.length, "пункт", "пункта", "пунктов");

    return `<div id="settings-${escapeHtmlAttribute(template.serviceType)}"></div>
      <section class="admin-checklist-template-shell">
        <div class="admin-checklist-template-hero">
          <div class="admin-checklist-template-copy">
            <div class="admin-inline-badge-row">
              ${renderAdminBadge(template.serviceType, "outline")}
              ${renderAdminBadge(itemCountLabel, "muted")}
            </div>
            <p class="admin-checklist-summary">${escapeHtml(template.description)}</p>
          </div>
        </div>
        <div class="admin-checklist-preview-list">
          ${template.items.length > 0
            ? template.items
                .map(
                  (item, index) => `<article class="admin-checklist-preview-item">
                    <span class="admin-checklist-preview-index">${escapeHtml(String(index + 1))}</span>
                    <div class="admin-checklist-preview-copy">
                      <strong>${escapeHtml(item.label)}</strong>
                      ${item.hint ? `<span>${escapeHtml(item.hint)}</span>` : ""}
                    </div>
                  </article>`
                )
                .join("")
            : `<div class="admin-empty-state">В этом шаблоне пока нет пунктов.</div>`}
        </div>
      </section>`;
  }

  function renderSettingsTemplateEditor(template, panelId) {
    const templateHtml = escapeHtmlAttribute(
      `<div class="admin-checklist-edit-row" data-admin-checklist-edit-row>
        <span class="admin-checklist-edit-index">0</span>
        <input type="hidden" name="itemId" value="">
        <div class="admin-checklist-edit-fields">
          <input class="admin-input admin-checklist-edit-input" type="text" name="itemLabel" value="" maxlength="240" placeholder="Например: проверить зеркала">
          <input class="admin-input admin-checklist-edit-input admin-checklist-edit-hint" type="text" name="itemHint" value="" maxlength="240" placeholder="Подсказка, например: все комнаты">
        </div>
        ${renderChecklistEditorRemoveButton()}
      </div>`
    );

    return `<section class="admin-client-section admin-checklist-edit-section" id="${escapeHtmlAttribute(panelId)}" data-admin-toggle-panel hidden>
      <form class="admin-form-grid" method="post" action="${ADMIN_SETTINGS_PATH}">
        <input type="hidden" name="action" value="save_checklist_template">
        <input type="hidden" name="serviceType" value="${escapeHtmlAttribute(template.serviceType)}">
        <div class="admin-checklist-edit-list" data-admin-checklist-item-list data-admin-checklist-item-template="${templateHtml}">
          ${template.items.length > 0
            ? template.items.map((item, index) => renderChecklistEditorRow(item, index)).join("")
            : ""}
        </div>
        <div class="admin-inline-actions admin-checklist-edit-actions">
          <button class="admin-button admin-button-secondary" type="button" data-admin-checklist-add-item="true">Добавить пункт</button>
          <button class="admin-button" type="submit">Сохранить шаблон</button>
        </div>
        <p class="admin-helper-copy">Пустые строки не сохраняются. Подсказка у пункта необязательна. Любой пункт можно удалить прямо в режиме редактирования.</p>
      </form>
    </section>`;
  }

  function renderChecklistTemplateDialog(template) {
    const dialogId = `admin-checklist-template-dialog-${escapeHtmlAttribute(template.serviceType)}`;
    const editPanelId = `${dialogId}-edit-panel`;

    return `<dialog class="admin-dialog" id="${dialogId}" aria-labelledby="${dialogId}-title">
      <div class="admin-dialog-panel admin-checklist-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">Чек-лист</p>
            <h2 class="admin-dialog-title" id="${dialogId}-title">${escapeHtml(template.title)}</h2>
            <p class="admin-dialog-copy">${escapeHtml(template.description)}</p>
          </div>
          <div class="admin-inline-actions admin-dialog-head-actions">
            ${renderAdminToggleIconButton("Редактировать чек-лист", editPanelId, {
              openLabel: "Скрыть редактирование чек-листа",
              closedLabel: "Редактировать чек-лист",
            })}
            ${renderAdminDialogCloseButton(dialogId)}
          </div>
        </div>
        ${renderChecklistTemplatePreview(template)}
        ${renderSettingsTemplateEditor(template, editPanelId)}
      </div>
    </dialog>`;
  }

  function renderSettingsChecklistsTable(templates = []) {
    if (!templates.length) {
      return `<div class="admin-empty-state">Шаблоны пока не подготовлены.</div>`;
    }

    const rows = templates
      .map((template) => {
        const dialogId = `admin-checklist-template-dialog-${escapeHtmlAttribute(template.serviceType)}`;
        return `<tr
          class="admin-table-row-clickable"
          tabindex="0"
          data-admin-dialog-row="true"
          data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
          aria-label="${escapeHtmlAttribute(`Открыть шаблон чек-листа ${template.title}`)}"
        >
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-link">${escapeHtml(template.title)}</span>
              <span class="admin-table-muted">${escapeHtml(template.serviceType)}</span>
            </div>
          </td>
          <td>
            <span class="admin-line-clamp-two">${escapeHtml(template.description)}</span>
          </td>
          <td>
            <div class="admin-table-cell-stack">
              <span class="admin-table-strong">${escapeHtml(String(template.items.length))}</span>
              <span class="admin-table-muted">${escapeHtml(formatSettingsMetaCount(template.items.length, "пункт", "пункта", "пунктов"))}</span>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    const dialogs = templates.map((template) => renderChecklistTemplateDialog(template)).join("");

    return `<div class="admin-table-wrap admin-settings-table-wrap">
      <table class="admin-table admin-settings-checklists-table">
        <thead>
          <tr>
            <th>Шаблон</th>
            <th>Описание</th>
            <th>Пункты</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${dialogs}`;
  }

  function renderSettingsChecklistEditorScript() {
    return `<script>
      (() => {
        function renumberChecklistRows(scope) {
          if (!scope || typeof scope.querySelectorAll !== "function") return;
          scope.querySelectorAll("[data-admin-checklist-edit-row]").forEach((row, index) => {
            const indexNode = row.querySelector(".admin-checklist-edit-index");
            if (indexNode) {
              indexNode.textContent = String(index + 1);
            }
          });
        }

        document.addEventListener("click", (event) => {
          const addTrigger = event.target.closest("[data-admin-checklist-add-item]");
          if (addTrigger) {
            const form = addTrigger.closest("form");
            const list = form && form.querySelector("[data-admin-checklist-item-list]");
            if (!list) return;
            const templateHtml = list.getAttribute("data-admin-checklist-item-template") || "";
            if (!templateHtml) return;
            const nextRow = document.createRange().createContextualFragment(templateHtml).firstElementChild;
            if (!nextRow) return;
            list.appendChild(nextRow);
            renumberChecklistRows(list);
            const nextInput = nextRow.querySelector('input[name="itemLabel"]');
            if (nextInput && typeof nextInput.focus === "function") {
              nextInput.focus();
            }
            return;
          }

          const removeTrigger = event.target.closest("[data-admin-checklist-remove-item]");
          if (!removeTrigger) return;
          const row = removeTrigger.closest("[data-admin-checklist-edit-row]");
          const list = row && row.parentElement;
          if (!row || !list) return;
          row.remove();
          renumberChecklistRows(list);
        });

        document.querySelectorAll("[data-admin-checklist-item-list]").forEach((list) => {
          renumberChecklistRows(list);
        });
      })();
    </script>`;
  }

  return {
    renderSettingsChecklistsTable,
    renderSettingsChecklistEditorScript,
  };
}

module.exports = {
  createSettingsChecklistHelpers,
};
