"use strict";

const ADMIN_SHARED_LAYOUT_RUNTIME_SCRIPT = `        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            initializeAdminAutoSubmitPhoneRuntime();
            loadAdminGhlSmsHistoryWithin(document);
            startAdminGhlSmsHistoryPollingWithin(document);
          }, { once: true });
        } else {
          initializeAdminAutoSubmitPhoneRuntime();
          loadAdminGhlSmsHistoryWithin(document);
          startAdminGhlSmsHistoryPollingWithin(document);
        }

        document.addEventListener("click", async (event) => {
          const trigger = event.target instanceof Element
            ? event.target.closest("[data-admin-order-completion-submit]")
            : null;
          if (!(trigger instanceof HTMLButtonElement)) return;
          const panel = trigger.closest("[data-admin-order-completion-panel]");
          if (!(panel instanceof HTMLElement)) return;

          event.preventDefault();
          if (panel.getAttribute("data-admin-order-completion-pending") === "true") return;

          panel.setAttribute("data-admin-order-completion-pending", "true");
          setOrderCompletionPending(panel, true);
          setOrderCompletionFeedback(panel, "info", "");

          try {
            const request = buildOrderCompletionRequest(panel);
            if (!request) {
              setOrderCompletionFeedback(panel, "error", "Выберите хотя бы одно фото до или после.");
              return;
            }
            const requestUrl = new URL(request.actionUrl || window.location.href, window.location.href);
            requestUrl.searchParams.set("ajax", "1");
            const response = await window.fetch(requestUrl.toString(), {
              method: "POST",
              headers: request.headers,
              body: request.body,
              credentials: "same-origin",
            });

            let payload = null;
            try {
              payload = await response.json();
            } catch (error) {
              void error;
            }

            if (!response.ok || !payload || payload.ok !== true) {
              setOrderCompletionFeedback(
                panel,
                "error",
                payload && payload.message
                  ? payload.message
                  : "Не удалось сохранить фотографии. Попробуйте ещё раз."
              );
              return;
            }

            applyOrderCompletionPayload(panel, payload);
          } catch (error) {
            void error;
            setOrderCompletionFeedback(
              panel,
              "error",
              "Не удалось сохранить фотографии. Проверьте соединение и попробуйте ещё раз."
            );
          } finally {
            panel.setAttribute("data-admin-order-completion-pending", "false");
            setOrderCompletionPending(panel, false);
          }
        });

        document.addEventListener("click", async (event) => {
          const trigger = event.target instanceof Element
            ? event.target.closest("[data-admin-order-cleaner-comment-submit]")
            : null;
          if (!(trigger instanceof HTMLButtonElement)) return;
          const panel = trigger.closest("[data-admin-order-cleaner-comment-panel]");
          if (!(panel instanceof HTMLElement)) return;

          event.preventDefault();
          if (panel.getAttribute("data-admin-order-cleaner-comment-pending") === "true") return;

          panel.setAttribute("data-admin-order-cleaner-comment-pending", "true");
          setOrderCleanerCommentPending(panel, true);
          setOrderCleanerCommentFeedback(panel, "info", "");

          try {
            const request = buildOrderCleanerCommentRequest(panel);
            const requestUrl = new URL(request.actionUrl || window.location.href, window.location.href);
            requestUrl.searchParams.set("ajax", "1");
            const response = await window.fetch(requestUrl.toString(), {
              method: "POST",
              headers: request.headers,
              body: request.body,
              credentials: "same-origin",
            });

            let payload = null;
            try {
              payload = await response.json();
            } catch (error) {
              void error;
            }

            if (!response.ok || !payload || payload.ok !== true) {
              setOrderCleanerCommentFeedback(
                panel,
                "error",
                payload && payload.message
                  ? payload.message
                  : "Не удалось сохранить комментарий клинера. Попробуйте ещё раз."
              );
              return;
            }

            applyOrderCleanerCommentPayload(panel, payload);
          } catch (error) {
            void error;
            setOrderCleanerCommentFeedback(
              panel,
              "error",
              "Не удалось сохранить комментарий клинера. Проверьте соединение и попробуйте ещё раз."
            );
          } finally {
            panel.setAttribute("data-admin-order-cleaner-comment-pending", "false");
            setOrderCleanerCommentPending(panel, false);
          }
        });

        document.addEventListener("click", (event) => {
          const orderAmountOpenTrigger = event.target.closest("[data-admin-order-amount-open]");
          if (orderAmountOpenTrigger) {
            event.preventDefault();
            resetOrderPaymentEditors(document, { reset: true });
            resetOrderTeamEditors(document, { reset: true });
            const panelId = orderAmountOpenTrigger.getAttribute("data-admin-order-amount-open");
            const panel = panelId ? document.querySelector('[data-admin-order-amount-editor="' + panelId + '"]') : null;
            setOrderAmountEditorState(panelId, true);
            const firstField = panel ? panel.querySelector("input, textarea, select") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
              if (typeof firstField.select === "function") {
                firstField.select();
              }
            }
            return;
          }

          const orderAmountCancelTrigger = event.target.closest("[data-admin-order-amount-cancel]");
          if (orderAmountCancelTrigger) {
            event.preventDefault();
            closeOrderAmountEditor(orderAmountCancelTrigger.getAttribute("data-admin-order-amount-cancel"), { reset: true });
            return;
          }

          const orderPaymentOpenTrigger = event.target.closest("[data-admin-order-payment-open]");
          if (orderPaymentOpenTrigger) {
            event.preventDefault();
            resetOrderAmountEditors(document, { reset: true });
            resetOrderPaymentEditors(document, { reset: true });
            resetOrderTeamEditors(document, { reset: true });
            const panelId = orderPaymentOpenTrigger.getAttribute("data-admin-order-payment-open");
            const panel = panelId ? document.querySelector('[data-admin-order-payment-editor="' + panelId + '"]') : null;
            setOrderPaymentEditorState(panelId, true);
            const firstField = panel ? panel.querySelector("select, input, textarea") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
            }
            return;
          }

          const orderPaymentCancelTrigger = event.target.closest("[data-admin-order-payment-cancel]");
          if (orderPaymentCancelTrigger) {
            event.preventDefault();
            closeOrderPaymentEditor(orderPaymentCancelTrigger.getAttribute("data-admin-order-payment-cancel"), { reset: true });
            return;
          }

          const orderTeamOpenTrigger = event.target.closest("[data-admin-order-team-open]");
          if (orderTeamOpenTrigger) {
            event.preventDefault();
            resetOrderAmountEditors(document, { reset: true });
            resetOrderPaymentEditors(document, { reset: true });
            resetOrderTeamEditors(document, { reset: true });
            const panelId = orderTeamOpenTrigger.getAttribute("data-admin-order-team-open");
            const panel = panelId ? document.querySelector('[data-admin-order-team-editor="' + panelId + '"]') : null;
            setOrderTeamEditorState(panelId, true);
            const firstField = panel ? panel.querySelector("summary, input, textarea, select") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
            }
            return;
          }

          const orderTeamCancelTrigger = event.target.closest("[data-admin-order-team-cancel]");
          if (orderTeamCancelTrigger) {
            event.preventDefault();
            closeOrderTeamEditor(orderTeamCancelTrigger.getAttribute("data-admin-order-team-cancel"), { reset: true });
            return;
          }

          const activeOrderMultiselect = event.target.closest("[data-admin-order-multiselect]");
          if (!activeOrderMultiselect) {
            closeOrderMultiselects(null);
          }

          const activeTimeField = event.target.closest("[data-admin-picker-field='time']");
          if (!activeTimeField) {
            closeAllTimePickerPanels();
          }

          const pickerTrigger = event.target.closest("[data-admin-picker-trigger]");
          if (pickerTrigger) {
            event.preventDefault();
            openPickerField(pickerTrigger.closest("[data-admin-picker-field]"));
            return;
          }

          const addAddressTrigger = event.target.closest("[data-admin-client-address-add]");
          if (addAddressTrigger) {
            const editor = addAddressTrigger.closest("[data-admin-client-address-editor]");
            const list = editor ? editor.querySelector("[data-admin-client-address-list]") : null;
            const templateId = addAddressTrigger.getAttribute("data-admin-client-address-template");
            const template = templateId ? document.getElementById(templateId) : null;
            if (!editor || !list || !(template instanceof HTMLTemplateElement)) return;

            const nextIndex = Number(editor.getAttribute("data-admin-client-address-next-index") || "0");
            const markup = template.innerHTML.replace(/__INDEX__/g, String(Number.isFinite(nextIndex) ? nextIndex : 0));
            list.insertAdjacentHTML("beforeend", markup);
            editor.setAttribute("data-admin-client-address-next-index", String((Number.isFinite(nextIndex) ? nextIndex : 0) + 1));

            const newRow = list.lastElementChild;
            if (newRow && typeof window.__adminBindAddressAutocomplete === "function") {
              window.__adminBindAddressAutocomplete(newRow);
            }
            const firstField = newRow ? newRow.querySelector("input, textarea, select") : null;
            if (firstField && typeof firstField.focus === "function") {
              firstField.focus();
            }
            return;
          }

          const removeAddressTrigger = event.target.closest("[data-admin-client-address-remove]");
          if (removeAddressTrigger) {
            event.preventDefault();
            const row = removeAddressTrigger.closest("[data-admin-client-address-row]");
            if (!row) return;

            const list = row.parentElement;
            const nextFocusable =
              row.nextElementSibling?.querySelector("input, textarea, select, button") ||
              row.previousElementSibling?.querySelector("input, textarea, select, button") ||
              list?.parentElement?.querySelector("[data-admin-client-address-add]");

            row.remove();

            if (nextFocusable && typeof nextFocusable.focus === "function") {
              nextFocusable.focus();
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
        });

        document.addEventListener("input", (event) => {
          const nativeInput = event.target.closest("[data-admin-picker-native]");
          if (nativeInput) {
            syncPickerDisplayFromNative(nativeInput.closest("[data-admin-picker-field]"));
          }
        });

        document.addEventListener("change", (event) => {
          const nativeInput = event.target.closest("[data-admin-picker-native]");
          if (nativeInput) {
            syncPickerDisplayFromNative(nativeInput.closest("[data-admin-picker-field]"));
            return;
          }
          const displayInput = event.target.closest("[data-admin-picker-display]");
          if (displayInput) {
            const field = displayInput.closest("[data-admin-picker-field]");
            syncPickerNativeFromDisplay(field);
            if (field && field.getAttribute("data-admin-picker-field") === "time") {
              syncTimePanelFromField(field);
            }
          }
        });

        document.addEventListener("blur", (event) => {
          const displayInput = event.target.closest("[data-admin-picker-display]");
          if (displayInput) {
            const field = displayInput.closest("[data-admin-picker-field]");
            syncPickerNativeFromDisplay(field);
            if (field && field.getAttribute("data-admin-picker-field") === "time") {
              syncTimePanelFromField(field);
            }
          }
        }, true);

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
          if (event.key === "Escape") {
            const openTimeField = document.querySelector("[data-admin-picker-field='time'][data-admin-time-open='true']");
            if (openTimeField) {
              event.preventDefault();
              closeTimePickerPanel(openTimeField);
              return;
            }
            const openOrderMultiselect = document.querySelector("[data-admin-order-multiselect][open]");
            if (openOrderMultiselect) {
              event.preventDefault();
              closeOrderMultiselect(openOrderMultiselect);
              return;
            }
            const openOrderAmountEditor = document.querySelector("[data-admin-order-amount-editor]:not([hidden])");
            if (openOrderAmountEditor) {
              event.preventDefault();
              closeOrderAmountEditor(openOrderAmountEditor.getAttribute("data-admin-order-amount-editor"), { reset: true });
              return;
            }
            const openOrderPaymentEditor = document.querySelector("[data-admin-order-payment-editor]:not([hidden])");
            if (openOrderPaymentEditor) {
              event.preventDefault();
              closeOrderPaymentEditor(openOrderPaymentEditor.getAttribute("data-admin-order-payment-editor"), { reset: true });
              return;
            }
            const openOrderTeamEditor = document.querySelector("[data-admin-order-team-editor]:not([hidden])");
            if (openOrderTeamEditor) {
              event.preventDefault();
              closeOrderTeamEditor(openOrderTeamEditor.getAttribute("data-admin-order-team-editor"), { reset: true });
              return;
            }
          }
        });

        document.querySelectorAll("[data-admin-order-multiselect]").forEach((details) => {
          syncOrderMultiselectValue(details);
          setOrderMultiselectExpandedState(details);
          details.addEventListener("toggle", () => {
            if (details.hasAttribute("open")) {
              closeOrderMultiselects(details);
            }
            setOrderMultiselectExpandedState(details);
          });
        });

        syncOrderAmountEditors(document);
        syncOrderPaymentEditors(document);
        syncOrderTeamEditors(document);
`;

module.exports = {
  ADMIN_SHARED_LAYOUT_RUNTIME_SCRIPT,
};
