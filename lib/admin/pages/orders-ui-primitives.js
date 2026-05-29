"use strict";

const { splitOrderServiceDurationMinutes } = require("../../order-service-duration");

function createOrdersUiPrimitives(deps = {}) {
  const {
    ADMIN_MANUAL_ORDER_DIALOG_ID,
    ADMIN_ORDER_FREQUENCY_OPTIONS,
    ADMIN_ORDER_SERVICE_OPTIONS,
    ADMIN_ORDERS_PATH,
    buildOrdersReturnPath,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminPhoneNumber,
    formatStaffCountLabel,
    normalizeOrderStatus,
    normalizeString,
    renderAdminBadge,
    renderAdminDialogCloseButton,
    renderAdminPhoneInput,
    renderAdminPickerField,
    renderAdminSelectOptions,
    renderStaffAddressField,
  } = deps;

  function renderOrderServiceDurationInputs(options = {}) {
    const fieldPrefix = normalizeString(options.fieldPrefix, 120);
    const fieldIdBase = fieldPrefix ? `${fieldPrefix}-service-duration` : "admin-order-service-duration";
    const durationParts = splitOrderServiceDurationMinutes(options.serviceDurationMinutes);
    return `<div class="admin-form-grid admin-form-grid-three admin-form-grid-span-2">
      <label class="admin-label">
        Длительность (часы)
        <input
          class="admin-input"
          type="number"
          name="serviceDurationHours"
          min="0"
          max="24"
          step="1"
          value="${escapeHtmlAttribute(String(durationParts.hours || ""))}"
          placeholder="2"
          id="${escapeHtmlAttribute(`${fieldIdBase}-hours`)}"
        >
      </label>
      <label class="admin-label">
        Длительность (минуты)
        <input
          class="admin-input"
          type="number"
          name="serviceDurationMinutes"
          min="0"
          max="59"
          step="1"
          value="${escapeHtmlAttribute(String(durationParts.minutes || ""))}"
          placeholder="30"
          id="${escapeHtmlAttribute(`${fieldIdBase}-minutes`)}"
        >
      </label>
      <label class="admin-label">
        Оценка времени
        <input
          class="admin-input"
          type="text"
          value="${escapeHtmlAttribute(
            options.serviceDurationLabel && options.serviceDurationLabel !== "Не указана"
              ? options.serviceDurationLabel
              : "Укажите часы и минуты"
          )}"
          readonly
          tabindex="-1"
        >
      </label>
    </div>`;
  }

  function renderOrderStatusBadge(status) {
    const normalized = normalizeOrderStatus(status, "new");
    if (normalized === "completed") return renderAdminBadge("Завершено", "success");
    if (normalized === "canceled") return renderAdminBadge("Отменено", "danger");
    if (normalized === "paid") return renderAdminBadge("Оплачено", "success");
    if (normalized === "awaiting-review") return renderAdminBadge("Ждем отзыв", "default");
    if (normalized === "invoice-sent") return renderAdminBadge("Инвойс отправлен", "outline");
    if (normalized === "cleaning-complete") return renderAdminBadge("Уборка завершена", "success");
    if (normalized === "photos") return renderAdminBadge("Фото", "outline");
    if (normalized === "checklist") return renderAdminBadge("Чеклист", "outline");
    if (normalized === "cleaning-started") return renderAdminBadge("Начать уборку", "default");
    if (normalized === "rescheduled") return renderAdminBadge("Перенесено", "outline");
    if (normalized === "en-route") return renderAdminBadge("В пути", "default");
    if (normalized === "scheduled") return renderAdminBadge("Запланировано", "outline");
    return renderAdminBadge("Новые", "muted");
  }

  function renderOrderPaymentStatusBadge(status) {
    const normalized = normalizeString(status, 40).toLowerCase();
    if (normalized === "paid") return renderAdminBadge("Paid", "success");
    if (normalized === "partial") return renderAdminBadge("Partial", "outline");
    return renderAdminBadge("Unpaid", "danger");
  }

  function renderOrderPaymentMethodBadge(method) {
    const normalized = normalizeString(method, 40).toLowerCase();
    if (normalized === "cash") return renderAdminBadge("Cash", "outline");
    if (normalized === "zelle") return renderAdminBadge("Zelle", "outline");
    if (normalized === "card") return renderAdminBadge("Card", "outline");
    if (normalized === "invoice") return renderAdminBadge("Invoice", "outline");
    return renderAdminBadge("Payment method not set", "muted");
  }

  function renderOrdersMetric(label, value, copy, options = {}) {
    const className = options.emphasis
      ? "admin-orders-metric admin-orders-metric-emphasis"
      : "admin-orders-metric";

    return `<article class="${className}">
      <span class="admin-orders-metric-label">${escapeHtml(label)}</span>
      <strong class="admin-orders-metric-value">${escapeHtml(String(value))}</strong>
      <p class="admin-orders-metric-copy">${escapeHtml(copy)}</p>
    </article>`;
  }

  function renderOrderSnapshot(label, value, options = {}) {
    const className = options.wide
      ? "admin-order-snapshot admin-order-snapshot-wide"
      : "admin-order-snapshot";

    return `<div class="${className}">
      <span class="admin-order-snapshot-label">${escapeHtml(label)}</span>
      <p class="admin-order-snapshot-value">${escapeHtml(value)}</p>
    </div>`;
  }

  function escapeScriptJson(value) {
    return JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function getManualOrderClientContactId(client) {
    if (!client || !Array.isArray(client.entries)) return "";
    const entryWithContactId = client.entries.find((entry) => normalizeString(entry && entry.contactId, 120));
    return normalizeString(entryWithContactId && entryWithContactId.contactId, 120);
  }

  function formatManualOrderClientPhoneDigits(value) {
    let digits = normalizeString(value, 80).replace(/\D+/g, "");
    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    return digits.slice(0, 10);
  }

  function buildManualOrderClientLookupPayload(clientRecords = []) {
    return (Array.isArray(clientRecords) ? clientRecords : [])
      .map((client) => {
        const phoneDigits = formatManualOrderClientPhoneDigits(client && client.phone);
        const secondaryPhoneDigits = formatManualOrderClientPhoneDigits(client && client.secondaryPhone);
        const phoneLabels = [phoneDigits, secondaryPhoneDigits]
          .filter(Boolean)
          .filter((value, index, values) => values.indexOf(value) === index)
          .map((value) => (formatAdminPhoneNumber ? formatAdminPhoneNumber(value) : value));
        const addresses = Array.isArray(client && client.addresses)
          ? client.addresses
              .map((addressRecord) => ({
                key: normalizeString(addressRecord && addressRecord.key, 500),
                address: normalizeString(addressRecord && addressRecord.address, 500),
                propertyType: normalizeString(addressRecord && addressRecord.propertyType, 40),
                squareFootage: normalizeString(addressRecord && addressRecord.squareFootage, 120),
                roomCount: normalizeString(addressRecord && addressRecord.roomCount, 120),
                bathroomCount: normalizeString(addressRecord && addressRecord.bathroomCount, 120),
                sizeDetails: normalizeString(addressRecord && addressRecord.sizeDetails, 250),
                pets: normalizeString(addressRecord && addressRecord.pets, 40),
                notes: normalizeString(addressRecord && addressRecord.notes, 4000),
              }))
              .filter((addressRecord) => addressRecord.address)
          : [];

        if (addresses.length === 0 && client && client.address) {
          addresses.push({
            key: normalizeString(client.address, 500).toLowerCase(),
            address: normalizeString(client.address, 500),
            propertyType: "",
            squareFootage: "",
            roomCount: "",
            bathroomCount: "",
            sizeDetails: "",
            pets: "",
            notes: "",
          });
        }

        return {
          key: normalizeString(client && client.key, 250),
          name: normalizeString(client && client.name, 250),
          phone: phoneDigits,
          phoneLabel: phoneLabels[0] || "",
          secondaryPhone: secondaryPhoneDigits,
          secondaryPhoneLabel: phoneLabels[1] || "",
          phoneLabels,
          email: normalizeString(client && client.email, 250).toLowerCase(),
          contactId: getManualOrderClientContactId(client),
          address: addresses[0] ? addresses[0].address : "",
          addresses,
        };
      })
      .filter((client) => client.name || client.phone || client.secondaryPhone || client.email || client.address)
      .slice(0, 250);
  }

  function renderManualOrderClientLookup(clientRecords = []) {
    const payload = buildManualOrderClientLookupPayload(clientRecords);

    return `<div class="admin-manual-client-lookup admin-form-grid-span-2" data-admin-manual-client-lookup>
      <div class="admin-label">
        <label for="admin-manual-client-search">Поиск существующего клиента</label>
        <div class="admin-client-lookup-field">
          <input
            class="admin-input admin-client-lookup-input"
            id="admin-manual-client-search"
            type="search"
            autocomplete="off"
            placeholder="Имя, телефон, email или адрес"
            data-admin-manual-client-search
            aria-autocomplete="list"
            aria-expanded="false"
            aria-controls="admin-manual-client-suggestions"
          >
          <div
            class="admin-client-lookup-suggestions"
            id="admin-manual-client-suggestions"
            data-admin-manual-client-suggestions
            role="listbox"
            hidden
          ></div>
        </div>
      </div>
      <div class="admin-manual-client-selected" data-admin-manual-client-selected hidden></div>
      <input type="hidden" name="selectedClientKey" data-admin-manual-client-key>
      <input type="hidden" name="selectedClientContactId" data-admin-manual-client-contact-id>
      <input type="hidden" name="selectedClientAddress" data-admin-manual-client-address>
      <input type="hidden" name="selectedClientAddressPropertyType" data-admin-manual-client-address-property-type>
      <input type="hidden" name="selectedClientAddressSquareFootage" data-admin-manual-client-address-square-footage>
      <input type="hidden" name="selectedClientAddressRoomCount" data-admin-manual-client-address-room-count>
      <input type="hidden" name="selectedClientAddressBathroomCount" data-admin-manual-client-address-bathroom-count>
      <input type="hidden" name="selectedClientAddressSizeDetails" data-admin-manual-client-address-size-details>
      <input type="hidden" name="selectedClientAddressPets" data-admin-manual-client-address-pets>
      <input type="hidden" name="selectedClientAddressNotes" data-admin-manual-client-address-notes>
      <script type="application/json" data-admin-manual-client-data>${escapeScriptJson(payload)}</script>
    </div>`;
  }

  function renderManualOrderClientLookupScript() {
    return `<script>
      (() => {
        const lookup = document.querySelector("[data-admin-manual-client-lookup]");
        if (!lookup) return;

        const form = lookup.closest("form");
        const searchInput = lookup.querySelector("[data-admin-manual-client-search]");
        const suggestions = lookup.querySelector("[data-admin-manual-client-suggestions]");
        const selectedPanel = lookup.querySelector("[data-admin-manual-client-selected]");
        const dataNode = lookup.querySelector("[data-admin-manual-client-data]");
        if (!form || !searchInput || !suggestions || !selectedPanel || !dataNode) return;

        let clients = [];
        try {
          clients = JSON.parse(dataNode.textContent || "[]");
        } catch {
          clients = [];
        }

        const hiddenFields = {
          key: lookup.querySelector("[data-admin-manual-client-key]"),
          contactId: lookup.querySelector("[data-admin-manual-client-contact-id]"),
          address: lookup.querySelector("[data-admin-manual-client-address]"),
          propertyType: lookup.querySelector("[data-admin-manual-client-address-property-type]"),
          squareFootage: lookup.querySelector("[data-admin-manual-client-address-square-footage]"),
          roomCount: lookup.querySelector("[data-admin-manual-client-address-room-count]"),
          bathroomCount: lookup.querySelector("[data-admin-manual-client-address-bathroom-count]"),
          sizeDetails: lookup.querySelector("[data-admin-manual-client-address-size-details]"),
          pets: lookup.querySelector("[data-admin-manual-client-address-pets]"),
          notes: lookup.querySelector("[data-admin-manual-client-address-notes]"),
        };

        const customerNameInput = form.elements.customerName;
        const customerPhoneInput = form.elements.customerPhone;
        const customerEmailInput = form.elements.customerEmail;
        const addressInput = form.elements.fullAddress;

        function normalize(value) {
          return String(value || "").trim().toLowerCase();
        }

        function phoneDigits(value) {
          let digits = String(value || "").replace(/\\D+/g, "");
          while (digits.length > 10 && digits.startsWith("1")) {
            digits = digits.slice(1);
          }
          return digits.slice(0, 10);
        }

        function dispatchFieldInput(input) {
          if (!input) return;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        function getPrimaryAddress(client) {
          const addresses = Array.isArray(client && client.addresses) ? client.addresses : [];
          return addresses.find((addressRecord) => addressRecord && addressRecord.address) || {
            key: "",
            address: client && client.address ? client.address : "",
          };
        }

        function getClientAddresses(client) {
          const addresses = Array.isArray(client && client.addresses)
            ? client.addresses.filter((addressRecord) => addressRecord && addressRecord.address)
            : [];
          return addresses.length > 0 ? addresses : [getPrimaryAddress(client)].filter((addressRecord) => addressRecord.address);
        }

        function getClientSearchText(client) {
          const addresses = Array.isArray(client.addresses) ? client.addresses : [];
          return [
            client.name,
            client.phone,
            client.phoneLabel,
            client.secondaryPhone,
            client.secondaryPhoneLabel,
            ...(Array.isArray(client.phoneLabels) ? client.phoneLabels : []),
            client.email,
            client.address,
            ...addresses.map((addressRecord) => addressRecord && addressRecord.address),
          ].join(" ").toLowerCase();
        }

        const searchableClients = clients.map((client) => ({
          ...client,
          searchText: getClientSearchText(client),
          phoneDigits: [client.phone, client.secondaryPhone].map(phoneDigits).filter(Boolean).join(" "),
        }));

        function hideSuggestions() {
          suggestions.hidden = true;
          suggestions.replaceChildren();
          searchInput.setAttribute("aria-expanded", "false");
        }

        function setHiddenValue(key, value) {
          if (hiddenFields[key]) hiddenFields[key].value = value || "";
        }

        function renderSelectedClient(client, addressRecord) {
          selectedPanel.replaceChildren();
          const title = document.createElement("strong");
          title.className = "admin-manual-client-selected-name";
          title.textContent = client.name || "Клиент";

          const meta = document.createElement("span");
          meta.className = "admin-manual-client-selected-meta";
          const phoneLabel = (Array.isArray(client.phoneLabels) && client.phoneLabels.length > 0)
            ? client.phoneLabels.join(" / ")
            : client.phoneLabel || client.phone;
          meta.textContent = [phoneLabel, client.email].filter(Boolean).join(" • ");

          const address = document.createElement("span");
          address.className = "admin-manual-client-selected-address";
          address.textContent = addressRecord && addressRecord.address ? addressRecord.address : "Адрес не указан";

          selectedPanel.append(title, meta, address);
          selectedPanel.hidden = false;
        }

        function applyClient(client, addressRecord) {
          const selectedAddress = addressRecord && addressRecord.address ? addressRecord : getPrimaryAddress(client);
          if (customerNameInput) customerNameInput.value = client.name || "";
          if (customerPhoneInput) customerPhoneInput.value = phoneDigits(client.phone);
          if (customerEmailInput) customerEmailInput.value = client.email || "";
          if (addressInput && selectedAddress.address) addressInput.value = selectedAddress.address;

          setHiddenValue("key", client.key);
          setHiddenValue("contactId", client.contactId);
          setHiddenValue("address", selectedAddress.address);
          setHiddenValue("propertyType", selectedAddress.propertyType);
          setHiddenValue("squareFootage", selectedAddress.squareFootage);
          setHiddenValue("roomCount", selectedAddress.roomCount);
          setHiddenValue("bathroomCount", selectedAddress.bathroomCount);
          setHiddenValue("sizeDetails", selectedAddress.sizeDetails);
          setHiddenValue("pets", selectedAddress.pets);
          setHiddenValue("notes", selectedAddress.notes);

          searchInput.value = [client.name, client.phoneLabel || client.phone].filter(Boolean).join(" • ");
          renderSelectedClient(client, selectedAddress);
          hideSuggestions();

          [customerNameInput, customerPhoneInput, customerEmailInput, addressInput].forEach(dispatchFieldInput);
        }

        function createSuggestionButton(client, addressRecord, index) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "admin-client-lookup-suggestion";
          button.setAttribute("role", "option");
          button.setAttribute("data-admin-manual-client-option", String(index));

          const main = document.createElement("span");
          main.className = "admin-client-lookup-suggestion-main";
          main.textContent = client.name || client.phoneLabel || client.email || "Клиент";

          const meta = document.createElement("span");
          meta.className = "admin-client-lookup-suggestion-copy";
          const phoneLabel = (Array.isArray(client.phoneLabels) && client.phoneLabels.length > 0)
            ? client.phoneLabels.join(" / ")
            : client.phoneLabel || client.phone;
          meta.textContent = [phoneLabel, client.email, addressRecord && addressRecord.address]
            .filter(Boolean)
            .join(" • ");

          button.append(main, meta);
          button.addEventListener("click", () => applyClient(client, addressRecord));
          return button;
        }

        function renderSuggestions() {
          const query = normalize(searchInput.value);
          const queryDigits = phoneDigits(query);
          suggestions.replaceChildren();

          if (!query) {
            hideSuggestions();
            return;
          }

          const matches = [];
          for (const client of searchableClients) {
            const textMatches = client.searchText.includes(query);
            const phoneMatches = queryDigits && client.phoneDigits.includes(queryDigits);
            if (!textMatches && !phoneMatches) continue;

            const addresses = getClientAddresses(client);
            const addressMatches = addresses.filter((addressRecord) =>
              normalize(addressRecord.address).includes(query)
            );
            const addressOptions = (addressMatches.length > 0 ? addressMatches : addresses.slice(0, 2));

            if (addressOptions.length === 0) {
              matches.push({ client, addressRecord: getPrimaryAddress(client) });
            } else {
              addressOptions.forEach((addressRecord) => matches.push({ client, addressRecord }));
            }

            if (matches.length >= 8) break;
          }

          matches.splice(8);

          if (matches.length === 0) {
            const empty = document.createElement("div");
            empty.className = "admin-client-lookup-empty";
            empty.textContent = "Клиент не найден";
            suggestions.append(empty);
          } else {
            matches.forEach((match, index) => {
              suggestions.append(createSuggestionButton(match.client, match.addressRecord, index));
            });
          }

          suggestions.hidden = false;
          searchInput.setAttribute("aria-expanded", "true");
        }

        searchInput.addEventListener("input", renderSuggestions);
        searchInput.addEventListener("focus", renderSuggestions);
        searchInput.addEventListener("keydown", (event) => {
          if (event.key === "Escape") hideSuggestions();
        });

        document.addEventListener("click", (event) => {
          if (!lookup.contains(event.target)) hideSuggestions();
        });
      })();
    </script>`;
  }

  function renderCreateManualOrderForm(options = {}) {
    const returnTo = buildOrdersReturnPath(options.returnTo || ADMIN_ORDERS_PATH);

    return `<form class="admin-form-grid" method="post" action="${ADMIN_ORDERS_PATH}" data-admin-save-confirm="true">
      <input type="hidden" name="action" value="create-manual-order">
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
      ${renderManualOrderClientLookup(options.clientRecords)}
      <div class="admin-form-grid admin-form-grid-two">
        <label class="admin-label">
          Имя клиента
          <input class="admin-input" type="text" name="customerName" placeholder="Emily Johnson" required>
        </label>
        ${renderAdminPhoneInput("customerPhone", "", {
          label: "Телефон клиента",
          placeholder: "3125550199",
          required: true,
        })}
        <label class="admin-label">
          Email
          <input class="admin-input" type="email" name="customerEmail" placeholder="client@example.com">
        </label>
        <label class="admin-label">
          Тип уборки
          <select class="admin-input" name="serviceType">
            ${renderAdminSelectOptions(ADMIN_ORDER_SERVICE_OPTIONS, "standard")}
          </select>
        </label>
        ${renderAdminPickerField({
          pickerType: "date",
          fieldId: "admin-manual-order-selected-date",
          label: "Дата уборки",
          name: "selectedDate",
          displayValue: "",
          nativeValue: "",
          placeholder: "04/15/2026",
          pickerLabel: "Выбрать дату уборки",
        })}
        ${renderAdminPickerField({
          pickerType: "time",
          fieldId: "admin-manual-order-selected-time",
          label: "Время уборки",
          name: "selectedTime",
          displayValue: "",
          nativeValue: "",
          placeholder: "1:30 PM",
          pickerLabel: "Выбрать время уборки",
        })}
        ${renderOrderServiceDurationInputs({
          fieldPrefix: "admin-manual-order",
          serviceDurationMinutes: 0,
          serviceDurationLabel: "",
        })}
        <label class="admin-label">
          Повторяемость
          <select class="admin-input" name="frequency">
            ${renderAdminSelectOptions(ADMIN_ORDER_FREQUENCY_OPTIONS, "", "Not set")}
          </select>
        </label>
        <label class="admin-label">
          Сумма заказа
          <input class="admin-input" type="text" name="totalPrice" inputmode="decimal" placeholder="240.00">
        </label>
      </div>
      ${renderStaffAddressField({
        id: "admin-manual-order-address",
        name: "fullAddress",
        placeholder: "215 North Elm Street, Naperville, IL 60563",
        required: true,
      })}
      <div class="admin-inline-actions">
        <button class="admin-button" type="submit">Создать заказ</button>
        <button class="admin-button admin-button-secondary" type="button" data-admin-dialog-close="${ADMIN_MANUAL_ORDER_DIALOG_ID}">Отмена</button>
      </div>
      <p class="admin-helper-copy">Используйте форму для заказов, которые пришли не через заявку на сайте.</p>
    </form>`;
  }

  function renderCreateManualOrderDialog(options = {}) {
    const autoOpenAttr = options.autoOpen ? ' data-admin-dialog-autopen="true"' : "";

    return `<dialog class="admin-dialog admin-dialog-wide" id="${ADMIN_MANUAL_ORDER_DIALOG_ID}"${autoOpenAttr} aria-labelledby="admin-manual-order-create-title">
      <div class="admin-dialog-panel">
        <div class="admin-dialog-head">
          <div class="admin-dialog-copy-block">
            <p class="admin-card-eyebrow">Заказы</p>
            <h2 class="admin-dialog-title" id="admin-manual-order-create-title">Добавить заказ вручную</h2>
            <p class="admin-dialog-copy">Создайте заказ сразу в рабочей таблице, если он пришёл не через заявку.</p>
          </div>
          ${renderAdminDialogCloseButton(ADMIN_MANUAL_ORDER_DIALOG_ID)}
        </div>
        ${renderCreateManualOrderForm(options)}
        ${renderManualOrderClientLookupScript()}
      </div>
    </dialog>`;
  }

  function getOrderDialogId(orderId) {
    const normalized = normalizeString(orderId, 120);
    const safeSuffix = normalized.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `admin-order-detail-dialog-${safeSuffix || "record"}`;
  }

  function getOrderAssignedLabel(order, planningItem) {
    const planningTeamLabel =
      planningItem && planningItem.assignedStaff.length > 0
        ? planningItem.assignedStaff.map((staffRecord) => staffRecord.name).join(", ")
        : "";
    return planningTeamLabel || order.assignedStaff || "Не назначен";
  }

  function parseOrderAssignedStaffNames(value, maxItems = 8) {
    const rawItems = Array.isArray(value) ? value : String(value || "").split(",");
    const seen = new Set();
    const output = [];

    for (const item of rawItems) {
      const normalized = normalizeString(item, 120);
      if (!normalized || seen.has(normalized.toLowerCase())) continue;
      seen.add(normalized.toLowerCase());
      output.push(normalized);
      if (output.length >= maxItems) break;
    }

    return output;
  }

  function filterOrderAssignedStaffNames(value, hiddenStaffNames = new Set()) {
    const normalizedHiddenStaffNames =
      hiddenStaffNames instanceof Set ? hiddenStaffNames : new Set();
    return parseOrderAssignedStaffNames(value).filter(
      (name) => !normalizedHiddenStaffNames.has(name.toLowerCase())
    );
  }

  function getOrderResponsibleOptions(order, staffRecords = [], planningItem = null) {
    const assignedValues = [
      ...parseOrderAssignedStaffNames(order && order.assignedStaff),
      ...parseOrderAssignedStaffNames(
        planningItem && Array.isArray(planningItem.assignedStaff) && planningItem.assignedStaff.length > 0
          ? planningItem.assignedStaff.map((staffRecord) => normalizeString(staffRecord && staffRecord.name, 120))
          : []
      ),
    ];
    const optionMap = new Map();

    for (const record of Array.isArray(staffRecords) ? staffRecords : []) {
      const name = normalizeString(record && record.name, 120);
      if (!name) continue;
      const status = normalizeString(record && record.status, 40).toLowerCase();
      if (status === "active" || assignedValues.includes(name)) {
        optionMap.set(name.toLowerCase(), name);
      }
    }

    for (const value of assignedValues) {
      optionMap.set(value.toLowerCase(), value);
    }

    return Array.from(optionMap.values()).sort((left, right) =>
      left.localeCompare(right, "en", { sensitivity: "base" })
    );
  }

  function formatOrderAssignedStaffSummary(values = [], options = {}) {
    const emptyLabel = normalizeString(options.emptyLabel, 120) || "Не назначен";
    const preferCount = options.preferCount === true;
    const maxVisible = Number.isFinite(options.maxVisible)
      ? Math.max(1, Math.min(4, Math.floor(options.maxVisible)))
      : 2;
    const normalizedValues = Array.isArray(values)
      ? values.map((value) => normalizeString(value, 120)).filter(Boolean)
      : [];

    if (normalizedValues.length === 0) return emptyLabel;
    if (normalizedValues.length === 1) return normalizedValues[0];
    if (preferCount) return formatStaffCountLabel(normalizedValues.length);
    if (normalizedValues.length <= maxVisible) return normalizedValues.join(", ");

    const hiddenCount = normalizedValues.length - maxVisible;
    return `${normalizedValues.slice(0, maxVisible).join(", ")} +${hiddenCount}`;
  }

  function renderOrderResponsibleSelect(order, options = {}) {
    const planningItem = options.planningItem || null;
    const selectableStaff = getOrderResponsibleOptions(order, options.staffRecords || [], planningItem);
    const selectedValues = parseOrderAssignedStaffNames(
      order && order.assignedStaff
        ? order.assignedStaff
        : planningItem && Array.isArray(planningItem.assignedStaff) && planningItem.assignedStaff.length > 0
          ? planningItem.assignedStaff.map((staffRecord) => normalizeString(staffRecord && staffRecord.name, 120))
          : []
    );
    const selectedLookup = new Set(selectedValues.map((value) => value.toLowerCase()));
    const selectedLabel = formatOrderAssignedStaffSummary(selectedValues, {
      emptyLabel: "Не назначен",
      preferCount: true,
    });
    const optionsMarkup =
      selectableStaff.length > 0
        ? selectableStaff
            .map((staffName) => `<label class="admin-order-multiselect-option">
              <input class="admin-order-multiselect-checkbox" type="checkbox" name="assignedStaff" value="${escapeHtmlAttribute(staffName)}"${selectedLookup.has(staffName.toLowerCase()) ? " checked" : ""}>
              <span>${escapeHtml(staffName)}</span>
            </label>`)
            .join("")
        : `<div class="admin-order-multiselect-empty">Добавьте активных сотрудников в разделе staff, чтобы переназначить заказ.</div>`;

    return `<details
      class="admin-order-multiselect"
      data-admin-order-multiselect="true"
      data-admin-order-multiselect-empty-label="Не назначен"
      data-admin-order-multiselect-max-visible="2"
    >
      <summary class="admin-input admin-order-multiselect-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="admin-order-multiselect-value">${escapeHtml(selectedLabel)}</span>
        <span class="admin-order-multiselect-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path d="M5.25 7.5 10 12.25 14.75 7.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
          </svg>
        </span>
      </summary>
      <div class="admin-order-multiselect-panel" role="listbox" aria-multiselectable="true">
        <input type="hidden" name="assignedStaff" value="">
        <div class="admin-order-multiselect-list">
          ${optionsMarkup}
        </div>
      </div>
    </details>`;
  }

  return {
    renderOrderStatusBadge,
    renderOrderPaymentStatusBadge,
    renderOrderPaymentMethodBadge,
    renderOrdersMetric,
    renderOrderSnapshot,
    renderCreateManualOrderForm,
    renderCreateManualOrderDialog,
    renderOrderServiceDurationInputs,
    getOrderDialogId,
    getOrderAssignedLabel,
    parseOrderAssignedStaffNames,
    filterOrderAssignedStaffNames,
    getOrderResponsibleOptions,
    formatOrderAssignedStaffSummary,
    renderOrderResponsibleSelect,
    formatAdminPhoneNumber,
  };
}

module.exports = {
  createOrdersUiPrimitives,
};
