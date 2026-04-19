"use strict";

const ADMIN_SHARED_GHL_SMS_SCRIPT = `        const ADMIN_GHL_SMS_POLL_INTERVAL_MS = 12000;
        const adminGhlSmsPollers = new WeakMap();

        function renderAdminSmsFeedbackHtml(state, message) {
          if (!message) return "";
          const normalizedState = state === "success" ? "info" : "error";
          return '<div class="admin-alert admin-alert-' + normalizedState + '">' + escapeAdminHtml(message) + "</div>";
        }

        function renderAdminSmsHistoryListHtml(items) {
          if (!Array.isArray(items) || items.length === 0) {
            return '<div class="admin-empty-state admin-ghl-sms-history-empty">История SMS появится здесь после первой отправки.</div>';
          }

          const scrollClass = items.length > 2 ? " is-scrollable" : "";

          return '<div class="admin-history-list admin-ghl-sms-history-list' + scrollClass + '">' + items.map((item) => {
            const sourceTone =
              item && item.sourceTone === "muted"
                ? "admin-badge admin-badge-muted"
                : item && item.sourceTone === "outline"
                  ? "admin-badge admin-badge-outline"
                  : item && item.source === "automatic"
                    ? "admin-badge admin-badge-muted"
                    : item && item.source === "client"
                      ? "admin-badge admin-badge-outline"
                      : "admin-badge admin-badge-success";
            const directionTone = "admin-badge admin-badge-outline";
            const channelTone = "admin-badge admin-badge-outline";
            const badges = [
              '<span class="' + sourceTone + '">' + escapeAdminHtml(item && item.sourceLabel ? item.sourceLabel : "Вручную") + "</span>",
              '<span class="' + directionTone + '">' + escapeAdminHtml(item && item.directionLabel ? item.directionLabel : "Исходящее") + "</span>",
              '<span class="' + channelTone + '">' + escapeAdminHtml(item && item.channelLabel ? item.channelLabel : "Go High Level") + "</span>",
            ].join("");
            return '<article class="admin-history-item admin-client-history-item admin-ghl-sms-history-item">' +
              '<div class="admin-ghl-sms-history-top">' +
                '<div class="admin-client-history-copy-block">' +
                  '<div class="admin-ghl-sms-history-title-row">' +
                    '<h3 class="admin-history-title">SMS</h3>' +
                    '<p class="admin-history-copy">' + escapeAdminHtml(item && item.sentAtLabel ? item.sentAtLabel : "Дата не указана") + "</p>" +
                  "</div>" +
                  '<div class="admin-ghl-sms-history-badges">' + badges + "</div>" +
                "</div>" +
              "</div>" +
              '<div class="admin-ghl-sms-history-bubble">' +
                '<p class="admin-client-history-address admin-ghl-sms-history-message">' + escapeAdminHtml(item && item.message ? item.message : "") + "</p>" +
              "</div>" +
            "</article>";
          }).join("") + "</div>";
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
            const countHost = root.querySelector("[data-admin-ghl-sms-history-count]");
            if (countHost instanceof HTMLElement) {
              countHost.textContent =
                smsPayload.historyCountLabel ||
                (smsPayload.history.length > 0 ? String(smsPayload.history.length) + " SMS" : "Пока пусто");
            }
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
