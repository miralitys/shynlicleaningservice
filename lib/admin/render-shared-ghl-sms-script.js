"use strict";

const ADMIN_SHARED_GHL_SMS_SCRIPT = `        const ADMIN_GHL_SMS_POLL_INTERVAL_MS = 12000;
        const adminGhlSmsPollers = new WeakMap();

        function formatAdminSmsHistoryCountLabel(count) {
          const numeric = Math.max(0, Number.parseInt(String(count || 0), 10) || 0);
          if (numeric === 0) return "Пока пусто";
          return String(numeric) + " SMS";
        }

        function renderAdminSmsFeedbackHtml(state, message) {
          if (!message) return "";
          const normalizedState = state === "success" ? "info" : "error";
          return '<div class="admin-alert admin-alert-' + normalizedState + '">' + escapeAdminHtml(message) + "</div>";
        }

        function renderAdminSmsHistoryListHtml(items) {
          if (!Array.isArray(items) || items.length === 0) {
            return '<div class="admin-empty-state admin-ghl-sms-history-empty">Пока нет сообщений. Напишите клиенту ниже — переписка появится здесь.</div>';
          }

          const sortedItems = items.slice().sort((left, right) => {
            const leftMs = Date.parse(left && left.sentAt ? left.sentAt : "");
            const rightMs = Date.parse(right && right.sentAt ? right.sentAt : "");
            if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) {
              return leftMs - rightMs;
            }
            return String(left && left.sentAt ? left.sentAt : "").localeCompare(String(right && right.sentAt ? right.sentAt : ""));
          });
          const scrollClass = items.length > 2 ? " is-scrollable" : "";
          const previewHint = items.length > 2
            ? '<p class="admin-ghl-sms-thread-hint">Показаны последние сообщения. Прокрутите, чтобы увидеть всю переписку.</p>'
            : "";

          return '<div class="admin-history-list admin-ghl-sms-history-list' + scrollClass + '">' + previewHint + sortedItems.map((item) => {
            const direction = item && item.direction === "inbound" ? "inbound" : "outbound";
            const bubbleClass = direction === "inbound" ? "is-inbound" : "is-outbound";
            const message = item && item.message ? String(item.message) : "";
            const errorMessage = item && item.errorMessage ? String(item.errorMessage) : "";
            const shouldShowError = Boolean(item && item.status === "failed" && errorMessage && errorMessage !== message);
            const metaLabels = [
              direction === "inbound" ? "Клиент" : "SHYNLI",
              item && item.sourceLabel ? item.sourceLabel : "Вручную",
              item && item.status === "failed" ? "Не доставлено" : "",
            ].filter(Boolean).join(" · ");
            return '<article class="admin-history-item admin-client-history-item admin-ghl-sms-history-item ' + bubbleClass + '" data-admin-ghl-sms-history-item data-admin-ghl-sms-source="' + escapeAdminHtml(item && item.source ? item.source : "manual") + '" data-admin-ghl-sms-direction="' + escapeAdminHtml(direction) + '">' +
              '<div class="admin-ghl-sms-history-bubble">' +
                '<p class="admin-client-history-address admin-ghl-sms-history-message">' + escapeAdminHtml(message) + "</p>" +
                '<div class="admin-ghl-sms-message-meta">' +
                  '<span>' + escapeAdminHtml(metaLabels) + "</span>" +
                  '<span>' + escapeAdminHtml(item && item.sentAtLabel ? item.sentAtLabel : "Дата не указана") + "</span>" +
                "</div>" +
              "</div>" +
              (shouldShowError ? '<p class="admin-history-copy">' + escapeAdminHtml(errorMessage) + "</p>" : "") +
            "</article>";
          }).join("") + "</div>";
        }

        function getAdminGhlSmsFilterValue(target) {
          const root = resolveAdminGhlSmsRoot(target);
          if (!(root instanceof HTMLElement)) return "";
          return (root.getAttribute("data-admin-ghl-sms-active-filter") || "").toLowerCase();
        }

        function setAdminGhlSmsFilterValue(target, value) {
          const root = resolveAdminGhlSmsRoot(target);
          if (!(root instanceof HTMLElement)) return;
          const normalized = typeof value === "string" ? value.toLowerCase() : "";
          if (normalized) {
            root.setAttribute("data-admin-ghl-sms-active-filter", normalized);
          } else {
            root.removeAttribute("data-admin-ghl-sms-active-filter");
          }
        }

        function matchesAdminGhlSmsFilter(item, filterValue) {
          if (!(item instanceof HTMLElement)) return false;
          switch (filterValue) {
            case "inbound":
              return (item.getAttribute("data-admin-ghl-sms-direction") || "").toLowerCase() === "inbound";
            case "outbound":
              return (item.getAttribute("data-admin-ghl-sms-direction") || "").toLowerCase() === "outbound";
            case "automatic":
              return (item.getAttribute("data-admin-ghl-sms-source") || "").toLowerCase() === "automatic";
            case "manual":
              return (item.getAttribute("data-admin-ghl-sms-source") || "").toLowerCase() === "manual";
            default:
              return true;
          }
        }

        function applyAdminGhlSmsFilter(target) {
          const root = resolveAdminGhlSmsRoot(target);
          if (!(root instanceof HTMLElement)) return;

          const filterValue = getAdminGhlSmsFilterValue(root);
          const historyItems = Array.from(root.querySelectorAll("[data-admin-ghl-sms-history-item]"));
          const historyHost = root.querySelector("[data-admin-ghl-sms-history]");
          let visibleCount = 0;

          historyItems.forEach((item) => {
            const matches = matchesAdminGhlSmsFilter(item, filterValue);
            item.hidden = !matches;
            item.classList.toggle("is-admin-ghl-sms-filtered-out", !matches);
            item.setAttribute("aria-hidden", matches ? "false" : "true");
            if (matches) {
              visibleCount += 1;
            }
          });

          root.querySelectorAll("[data-admin-ghl-sms-filter]").forEach((button) => {
            if (!(button instanceof HTMLElement)) return;
            const buttonValue = (button.getAttribute("data-admin-ghl-sms-filter") || "").toLowerCase();
            const isActive = Boolean(filterValue) && buttonValue === filterValue;
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
            button.classList.toggle("is-active", isActive);
          });

          const countHost = root.querySelector("[data-admin-ghl-sms-history-count]");
          if (countHost instanceof HTMLElement) {
            countHost.textContent = formatAdminSmsHistoryCountLabel(visibleCount);
          }

          const showFilterEmpty = Boolean(filterValue) && historyItems.length > 0 && visibleCount === 0;
          if (historyHost instanceof HTMLElement) {
            historyHost.hidden = showFilterEmpty;
          }

          const filterEmptyHost = root.querySelector("[data-admin-ghl-sms-filter-empty]");
          if (filterEmptyHost instanceof HTMLElement) {
            filterEmptyHost.hidden = !showFilterEmpty;
          }
        }

        function resolveAdminGhlSmsRoot(target) {
          if (target instanceof HTMLFormElement) {
            return target.closest("[data-admin-ghl-sms-root]");
          }
          if (target instanceof HTMLElement) {
            return target.matches("[data-admin-ghl-sms-root]")
              ? target
              : target.closest("[data-admin-ghl-sms-root]");
          }
          return null;
        }

        function stopAdminGhlSmsHistoryPolling(target) {
          const root = resolveAdminGhlSmsRoot(target);
          if (!(root instanceof HTMLElement)) return;
          const timerId = adminGhlSmsPollers.get(root);
          if (timerId) {
            window.clearInterval(timerId);
            adminGhlSmsPollers.delete(root);
          }
        }

        function startAdminGhlSmsHistoryPolling(target) {
          const root = resolveAdminGhlSmsRoot(target);
          if (!(root instanceof HTMLElement)) return;

          const parentDialog = root.closest(dialogSelector);
          if (parentDialog instanceof HTMLElement && !parentDialog.hasAttribute("open")) {
            return;
          }

          stopAdminGhlSmsHistoryPolling(root);
          const configuredInterval = Number(root.getAttribute("data-admin-ghl-sms-poll-ms") || "");
          const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 5000
            ? configuredInterval
            : ADMIN_GHL_SMS_POLL_INTERVAL_MS;

          const timerId = window.setInterval(() => {
            if (!document.contains(root)) {
              stopAdminGhlSmsHistoryPolling(root);
              return;
            }
            if (document.hidden) return;
            const nextParentDialog = root.closest(dialogSelector);
            if (nextParentDialog instanceof HTMLElement && !nextParentDialog.hasAttribute("open")) {
              return;
            }
            void loadAdminGhlSmsHistory(root);
          }, intervalMs);

          adminGhlSmsPollers.set(root, timerId);
        }

        function applyAdminGhlSmsPayload(target, smsPayload) {
          const root = resolveAdminGhlSmsRoot(target);
          if (!(root instanceof HTMLElement) || !smsPayload || typeof smsPayload !== "object") return;

          const feedbackHost = root.querySelector("[data-admin-ghl-sms-feedback]");
          if (
            feedbackHost instanceof HTMLElement &&
            (Object.prototype.hasOwnProperty.call(smsPayload, "feedbackState") ||
              Object.prototype.hasOwnProperty.call(smsPayload, "feedbackMessage"))
          ) {
            feedbackHost.innerHTML = renderAdminSmsFeedbackHtml(smsPayload.feedbackState, smsPayload.feedbackMessage);
          }

          if (Array.isArray(smsPayload.history)) {
            const historyHost = root.querySelector("[data-admin-ghl-sms-history]");
            if (historyHost instanceof HTMLElement) {
              historyHost.innerHTML = renderAdminSmsHistoryListHtml(smsPayload.history);
            }
            applyAdminGhlSmsFilter(root);
          }

          const messageField = root.querySelector('textarea[name="message"]');
          if (
            messageField instanceof HTMLTextAreaElement &&
            Object.prototype.hasOwnProperty.call(smsPayload, "draft")
          ) {
            messageField.value = typeof smsPayload.draft === "string" ? smsPayload.draft : "";
          }
        }

        async function loadAdminGhlSmsHistory(target, options = {}) {
          const root = resolveAdminGhlSmsRoot(target);
          if (!(root instanceof HTMLElement)) return;
          if (root.getAttribute("data-admin-ghl-sms-loading") === "true") return;

          const actionPath = root.getAttribute("data-admin-ghl-sms-action-path") || window.location.pathname;
          const loadAction = root.getAttribute("data-admin-ghl-sms-load-action");
          const targetFieldName = root.getAttribute("data-admin-ghl-sms-target-field");
          const targetFieldValue = root.getAttribute("data-admin-ghl-sms-target-value");
          const returnTo = root.getAttribute("data-admin-ghl-sms-return-to") || "";

          if (!loadAction || !targetFieldName || !targetFieldValue) return;

          const parentDialog = root.closest(dialogSelector);
          if (
            parentDialog instanceof HTMLElement &&
            !parentDialog.hasAttribute("open") &&
            options.allowClosedDialog !== true
          ) {
            return;
          }

          root.setAttribute("data-admin-ghl-sms-loading", "true");
          const body = new URLSearchParams();
          body.set("action", loadAction);
          body.set(targetFieldName, targetFieldValue);
          if (returnTo) {
            body.set("returnTo", returnTo);
          }

          try {
            const response = await fetch(actionPath, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                Accept: "application/json",
                "X-SHYNLI-ADMIN-AJAX": "1",
              },
              body: body.toString(),
              credentials: "same-origin",
            });

            let payload = null;
            try {
              payload = await response.json();
            } catch (error) {
              void error;
            }

            const smsPayload = payload && payload.sms && typeof payload.sms === "object" ? payload.sms : null;
            if (response.ok && payload && payload.ok === true && smsPayload) {
              applyAdminGhlSmsPayload(root, smsPayload);
            }
          } catch (error) {
            void error;
          } finally {
            root.removeAttribute("data-admin-ghl-sms-loading");
          }
        }

        function loadAdminGhlSmsHistoryWithin(scope, options = {}) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-ghl-sms-root]").forEach((root) => {
            void loadAdminGhlSmsHistory(root, options);
          });
        }

        document.addEventListener("click", (event) => {
          const clickTarget =
            event.target instanceof Element
              ? event.target
              : event.target && event.target.parentElement instanceof Element
                ? event.target.parentElement
                : null;
          const filterButton = clickTarget
            ? clickTarget.closest("[data-admin-ghl-sms-filter]")
            : null;
          if (!(filterButton instanceof HTMLElement)) return;
          const root = resolveAdminGhlSmsRoot(filterButton);
          if (!(root instanceof HTMLElement)) return;

          event.preventDefault();
          const nextFilter = (filterButton.getAttribute("data-admin-ghl-sms-filter") || "").toLowerCase();
          const currentFilter = getAdminGhlSmsFilterValue(root);
          setAdminGhlSmsFilterValue(root, currentFilter === nextFilter ? "" : nextFilter);
          applyAdminGhlSmsFilter(root);
        });

        function startAdminGhlSmsHistoryPollingWithin(scope) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-ghl-sms-root]").forEach((root) => {
            startAdminGhlSmsHistoryPolling(root);
          });
        }

        function stopAdminGhlSmsHistoryPollingWithin(scope) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-ghl-sms-root]").forEach((root) => {
            stopAdminGhlSmsHistoryPolling(root);
          });
        }`;

module.exports = {
  ADMIN_SHARED_GHL_SMS_SCRIPT,
};
