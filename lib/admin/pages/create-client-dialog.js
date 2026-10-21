"use strict";

function renderCreateClientDialog({ autoOpen = false, closeButton = "" } = {}) {
  return `<dialog class="admin-dialog admin-dialog-wide" id="admin-client-create-dialog"
    aria-labelledby="admin-client-create-title" data-admin-dialog-dirty-confirm="true"${autoOpen ? ' data-admin-dialog-autopen="true"' : ""}>
    <div class="admin-dialog-panel">
      <div class="admin-dialog-head">
        <h2 class="admin-dialog-title" id="admin-client-create-title">Добавить клиента</h2>
        ${closeButton}
      </div>
      <form class="admin-form-grid" method="post" action="/admin/clients">
        <input type="hidden" name="action" value="create-client">
        <div class="admin-form-grid admin-form-grid-two">
          <label class="admin-label">Имя клиента
            <input class="admin-input" name="name" autocomplete="name" maxlength="250" required>
          </label>
          <label class="admin-label">Телефон
            <input class="admin-input" type="tel" name="phone" autocomplete="tel" maxlength="80">
          </label>
          <label class="admin-label">Email
            <input class="admin-input" type="email" name="email" autocomplete="email" maxlength="250">
          </label>
          <label class="admin-label">Адрес
            <input class="admin-input" name="address" autocomplete="street-address" maxlength="500">
          </label>
          <label class="admin-label">Спальни
            <input class="admin-input" type="number" name="roomCount" min="0" step="1">
          </label>
          <label class="admin-label">Санузлы
            <input class="admin-input" type="number" name="bathroomCount" min="0" step="0.5">
          </label>
          <label class="admin-label">Площадь, sq ft
            <input class="admin-input" type="number" name="squareFootage" min="0" step="1">
          </label>
        </div>
        <label class="admin-label">Комментарий к клиенту
          <textarea class="admin-input" name="notes" maxlength="4000" rows="3"></textarea>
        </label>
        <div class="admin-inline-actions">
          <button class="admin-button" type="submit">Добавить клиента</button>
          <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="admin-client-create-dialog">Отмена</button>
        </div>
      </form>
    </div>
  </dialog>`;
}

module.exports = { renderCreateClientDialog };
