"use strict";

const ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT = `        function parseAdminDateInput(value) {
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
          const maxVisible = Number(details.getAttribute("data-admin-order-multiselect-max-visible") || "2");
          valueNode.textContent = formatOrderMultiselectSummary(selectedValues, emptyLabel, maxVisible);
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

        function formatOrderMultiselectSummary(values, emptyLabel, maxVisible) {
          const safeEmptyLabel = String(emptyLabel || "Не назначен");
          const normalizedValues = Array.isArray(values)
            ? values.map((value) => String(value || "").trim()).filter(Boolean)
            : [];
          const safeMaxVisible = Number.isFinite(Number(maxVisible))
            ? Math.max(1, Math.min(4, Math.floor(Number(maxVisible))))
            : 2;

          if (normalizedValues.length === 0) return safeEmptyLabel;
          if (normalizedValues.length <= safeMaxVisible) return normalizedValues.join(", ");

          return normalizedValues.slice(0, safeMaxVisible).join(", ") + " +" + String(normalizedValues.length - safeMaxVisible);
        }`;

module.exports = {
  ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT,
};
