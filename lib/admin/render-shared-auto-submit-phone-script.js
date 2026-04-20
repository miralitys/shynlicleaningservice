"use strict";

const ADMIN_SHARED_AUTO_SUBMIT_PHONE_SCRIPT = `        const autoSubmitTimers = new WeakMap();
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
          let digits = String(value || "").replace(/\\D+/g, "");
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

        function initializeAdminAutoSubmitPhoneRuntime() {
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
        });`;

module.exports = {
  ADMIN_SHARED_AUTO_SUBMIT_PHONE_SCRIPT,
};
