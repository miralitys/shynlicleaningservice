"use strict";

const ADMIN_SHARED_DIALOG_LOGOUT_SCRIPT = `        const dialogSelector = "dialog.admin-dialog";
        const confirmDialog = document.getElementById("admin-confirm-dialog");
        const confirmTitle = document.getElementById("admin-confirm-title");
        const confirmCopy = document.getElementById("admin-confirm-copy");
        const saveConfirmDialog = document.getElementById("admin-save-confirm-dialog");
        let pendingConfirmForm = null;
        let pendingSaveConfirmSubmission = null;
        let pendingSaveConfirmActionResolve = null;

        function syncAdminOrderCancelScope(statusSelect) {
          if (!(statusSelect instanceof HTMLSelectElement)) return;
          const form = statusSelect.form;
          const field = form ? form.querySelector("[data-admin-order-cancel-scope]") : null;
          if (!(field instanceof HTMLElement)) return;
          field.hidden = statusSelect.value !== "canceled";
        }

        function getAdminSaveConfirmSubmitter(form, submitter) {
          if (!(form instanceof HTMLFormElement)) return null;
          if (
            (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
            submitter.form === form
          ) {
            return submitter;
          }
          if (form.id) {
            const externalSubmitter = document.querySelector(
              'button[form="' + form.id + '"][type="submit"], input[form="' + form.id + '"][type="submit"]'
            );
            if (
              (externalSubmitter instanceof HTMLButtonElement || externalSubmitter instanceof HTMLInputElement) &&
              externalSubmitter.form === form
            ) {
              return externalSubmitter;
            }
          }
          const localSubmitter = form.querySelector('button[type="submit"], input[type="submit"]');
          return localSubmitter instanceof HTMLButtonElement || localSubmitter instanceof HTMLInputElement
            ? localSubmitter
            : null;
        }

        function submitAdminSaveConfirmedForm() {
          const pendingSubmission = pendingSaveConfirmSubmission;
          pendingSaveConfirmSubmission = null;
          if (!pendingSubmission || !(pendingSubmission.form instanceof HTMLFormElement)) return;
          const form = pendingSubmission.form;
          const submitter = getAdminSaveConfirmSubmitter(form, pendingSubmission.submitter);
          form.setAttribute("data-admin-save-confirm-approved", "true");
          if (typeof form.requestSubmit === "function") {
            if (submitter) {
              form.requestSubmit(submitter);
            } else {
              form.requestSubmit();
            }
          } else {
            HTMLFormElement.prototype.submit.call(form);
          }
        }

        window.__adminConfirmSaveAction = function confirmAdminSaveAction() {
          return new Promise((resolve) => {
            if (pendingSaveConfirmActionResolve || pendingSaveConfirmSubmission) {
              resolve(false);
              return;
            }

            if (!saveConfirmDialog) {
              resolve(window.confirm("Сохранить?"));
              return;
            }

            pendingSaveConfirmActionResolve = resolve;
            openDialog(saveConfirmDialog);
          });
        };

        document.addEventListener("submit", (event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          if (form.getAttribute("data-admin-save-confirm") !== "true") return;
          if (form.getAttribute("data-admin-save-confirm-approved") === "true") {
            form.removeAttribute("data-admin-save-confirm-approved");
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();
          if (pendingSaveConfirmActionResolve) {
            pendingSaveConfirmActionResolve(false);
            pendingSaveConfirmActionResolve = null;
          }
          pendingSaveConfirmSubmission = {
            form,
            submitter: event.submitter || null,
          };

          if (saveConfirmDialog) {
            openDialog(saveConfirmDialog);
            return;
          }

          if (window.confirm("Сохранить?")) {
            submitAdminSaveConfirmedForm();
          } else {
            pendingSaveConfirmSubmission = null;
          }
        }, true);

        function setLogoutPending(form, pending) {
          if (!(form instanceof HTMLFormElement)) return;
          form.setAttribute("data-admin-logout-pending", pending ? "true" : "false");
          const submitter = form.querySelector("[data-admin-logout-trigger], button[type='submit'], input[type='submit']");
          if (submitter instanceof HTMLButtonElement) {
            submitter.disabled = pending;
            submitter.setAttribute("aria-busy", pending ? "true" : "false");
          } else if (submitter instanceof HTMLInputElement) {
            submitter.disabled = pending;
            submitter.setAttribute("aria-busy", pending ? "true" : "false");
          }
        }

        async function submitLogoutForm(form) {
          if (!(form instanceof HTMLFormElement)) return;
          if (form.getAttribute("data-admin-logout-pending") === "true") return;

          const action = form.getAttribute("action") || window.location.href;
          const method = String(form.getAttribute("method") || "POST").toUpperCase();
          const isBodylessMethod = method === "GET" || method === "HEAD";
          const requestBody = isBodylessMethod
            ? undefined
            : new URLSearchParams(new FormData(form)).toString();

          setLogoutPending(form, true);

          try {
            const response = await window.fetch(action, {
              method,
              headers: isBodylessMethod
                ? {
                    Accept: "text/html,application/xhtml+xml",
                  }
                : {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    Accept: "text/html,application/xhtml+xml",
                  },
              body: requestBody,
              credentials: "same-origin",
              redirect: "follow",
            });

            if (response.redirected || response.ok) {
              window.location.assign(response.url || action);
              return;
            }
          } catch (error) {
            void error;
          }

          setLogoutPending(form, false);
          HTMLFormElement.prototype.submit.call(form);
        }`;

const ADMIN_SHARED_DIALOG_STATE_SCRIPT = `        function updateDialogState() {
          const hasOpenDialog = Array.from(document.querySelectorAll(dialogSelector)).some((dialog) => dialog.hasAttribute("open"));
          document.documentElement.classList.toggle("admin-dialog-open", hasOpenDialog);
          document.body.classList.toggle("admin-dialog-open", hasOpenDialog);
        }

        function getDialogScrollContainer(dialog, target) {
          if (!(dialog instanceof HTMLElement) || !(target instanceof HTMLElement)) return dialog;
          let node = target.parentElement;
          while (node && node !== dialog) {
            const style = window.getComputedStyle(node);
            const overflowY = style ? style.overflowY : "";
            if (
              (overflowY === "auto" || overflowY === "scroll") &&
              node.scrollHeight > node.clientHeight + 8
            ) {
              return node;
            }
            node = node.parentElement;
          }
          return dialog;
        }

        function scrollDialogToTarget(dialog, focusSelector) {
          if (!(dialog instanceof HTMLElement) || !focusSelector) return;
          const target = dialog.querySelector(focusSelector);
          if (!(target instanceof HTMLElement)) return;
          const scrollContainer = getDialogScrollContainer(dialog, target);
          if (!(scrollContainer instanceof HTMLElement)) return;

          const containerRect = scrollContainer.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const nextScrollTop =
            targetRect.top - containerRect.top + scrollContainer.scrollTop - 16;

          if (typeof scrollContainer.scrollTo === "function") {
            scrollContainer.scrollTo({
              top: Math.max(0, nextScrollTop),
              left: 0,
              behavior: "auto",
            });
          } else {
            scrollContainer.scrollTop = Math.max(0, nextScrollTop);
          }
        }

        function scheduleDialogTargetScroll(dialog, focusSelector) {
          if (!(dialog instanceof HTMLElement) || !focusSelector) return;
          const attemptScroll = (attempt) => {
            window.requestAnimationFrame(() => {
              scrollDialogToTarget(dialog, focusSelector);
              if (attempt < 3) {
                window.setTimeout(() => attemptScroll(attempt + 1), attempt === 0 ? 120 : 220);
              }
            });
          };
          attemptScroll(0);
        }

        function serializeDialogFormState(dialog) {
          if (!(dialog instanceof HTMLElement)) return "";
          return Array.from(dialog.querySelectorAll("input, select, textarea"))
            .map((field, index) => {
              if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement) && !(field instanceof HTMLTextAreaElement)) return "";
              const tagName = field.tagName.toLowerCase();
              const type = field instanceof HTMLInputElement ? String(field.type || "").toLowerCase() : tagName;
              if (type === "button" || type === "submit" || type === "reset") return "";
              const key = field.getAttribute("name") || field.id || String(index);
              const value =
                field instanceof HTMLInputElement && (type === "checkbox" || type === "radio")
                  ? (field.checked ? "checked" : "unchecked")
                  : String(field.value || "");
              return [tagName, type, key, value].join("\\u001f");
            })
            .filter(Boolean)
            .join("\\u001e");
        }

        function hasDialogDirtyCloseGuard(dialog) {
          return Boolean(
            dialog instanceof HTMLElement &&
            dialog.getAttribute("data-admin-dialog-dirty-confirm") === "true"
          );
        }

        function captureDialogCleanState(dialog) {
          if (!hasDialogDirtyCloseGuard(dialog)) return;
          dialog.setAttribute("data-admin-dialog-clean-state", serializeDialogFormState(dialog));
        }

        function isDialogCloseGuardDirty(dialog) {
          if (!hasDialogDirtyCloseGuard(dialog)) return false;
          const cleanState = dialog.getAttribute("data-admin-dialog-clean-state");
          if (cleanState === null) {
            captureDialogCleanState(dialog);
            return false;
          }
          return serializeDialogFormState(dialog) !== cleanState;
        }

        function canCloseDialog(dialog, options) {
          if (!isDialogCloseGuardDirty(dialog)) return true;
          if (options && options.skipDirtyConfirm) return true;
          const message =
            dialog.getAttribute("data-admin-dialog-dirty-message") ||
            "В форме есть несохранённые данные. Закрыть окно и сбросить их?";
          return window.confirm(message);
        }

        function renderAdminMessageReadBadgeHtml() {
          return '<span class="admin-badge admin-badge-muted">Прочитано</span>';
        }

        function updateAdminMessageUnreadSummary(delta) {
          const numericDelta = Number.parseInt(String(delta || 0), 10) || 0;
          if (numericDelta <= 0) return;
          document.querySelectorAll("[data-admin-message-summary-unread]").forEach((summaryNode) => {
            if (!(summaryNode instanceof HTMLElement)) return;
            const currentValue = Number.parseInt(summaryNode.textContent || "0", 10) || 0;
            summaryNode.textContent = String(Math.max(0, currentValue - numericDelta));
          });
        }

        function ensureAdminUnreadListEmptyState() {
          document.querySelectorAll('[data-admin-message-list="unread"]').forEach((listRoot) => {
            if (!(listRoot instanceof HTMLElement)) return;
            const tbody = listRoot.querySelector("tbody");
            if (!(tbody instanceof HTMLElement)) return;
            if (tbody.querySelectorAll("tr").length > 0) return;
            const emptyState = document.createElement("div");
            emptyState.className = "admin-empty-state";
            emptyState.setAttribute("data-admin-message-empty-state", "true");
            emptyState.textContent = "Сообщений в этом списке пока нет.";
            listRoot.replaceWith(emptyState);
          });
        }

        function updateAdminMessageDialogRowsRead(dialogKey, changedCount) {
          const normalizedDialogKey = typeof dialogKey === "string" ? dialogKey : "";
          if (!normalizedDialogKey) return;
          const numericChangedCount = Math.max(0, Number.parseInt(String(changedCount || 0), 10) || 0);
          let removedUnreadRows = 0;

          document.querySelectorAll("[data-admin-message-dialog-key]").forEach((row) => {
            if (!(row instanceof HTMLElement)) return;
            if (row.getAttribute("data-admin-message-dialog-key") !== normalizedDialogKey) return;

            const unreadCount = Math.max(
              0,
              Number.parseInt(row.getAttribute("data-admin-message-unread-count") || "0", 10) || 0
            );
            row.setAttribute("data-admin-message-status", "read");
            row.setAttribute("data-admin-message-unread-count", "0");
            row.setAttribute("data-admin-message-refs", "[]");
            row.removeAttribute("data-admin-message-read-pending");
            row.classList.remove("admin-message-row-new");

            const statusCell = row.querySelector("[data-admin-message-status-cell]");
            if (statusCell instanceof HTMLElement) {
              statusCell.innerHTML = "";
            }

            if ((row.getAttribute("data-admin-message-list-kind") || "").toLowerCase() === "unread") {
              row.remove();
              removedUnreadRows += numericChangedCount || unreadCount;
            }
          });

          if (removedUnreadRows > 0) {
            updateAdminMessageUnreadSummary(removedUnreadRows);
            ensureAdminUnreadListEmptyState();
          }
        }

        function updateAdminMessageRowsRead(entryId, messageKey) {
          const normalizedEntryId = typeof entryId === "string" ? entryId : "";
          const normalizedMessageKey = typeof messageKey === "string" ? messageKey : "";
          if (!normalizedEntryId || !normalizedMessageKey) return;

          let removedUnreadRows = 0;
          document.querySelectorAll("[data-admin-message-key]").forEach((row) => {
            if (!(row instanceof HTMLElement)) return;
            if (
              row.getAttribute("data-admin-message-entry-id") !== normalizedEntryId ||
              row.getAttribute("data-admin-message-key") !== normalizedMessageKey
            ) {
              return;
            }

            row.setAttribute("data-admin-message-status", "read");
            row.removeAttribute("data-admin-message-read-pending");
            row.classList.remove("admin-message-row-new");

            const statusCell = row.querySelector("[data-admin-message-status-cell]");
            if (statusCell instanceof HTMLElement) {
              statusCell.innerHTML = renderAdminMessageReadBadgeHtml();
            }

            if ((row.getAttribute("data-admin-message-list-kind") || "").toLowerCase() === "unread") {
              row.remove();
              removedUnreadRows += 1;
            }
          });

          if (removedUnreadRows > 0) {
            updateAdminMessageUnreadSummary(removedUnreadRows);
            ensureAdminUnreadListEmptyState();
          }
        }

        async function markAdminMessageRowRead(row) {
          if (!(row instanceof HTMLElement)) return;
          if ((row.getAttribute("data-admin-message-status") || "").toLowerCase() !== "new") return;
          if (row.getAttribute("data-admin-message-read-pending") === "true") return;

          const entryId = row.getAttribute("data-admin-message-entry-id") || "";
          const messageKey = row.getAttribute("data-admin-message-key") || "";
          const messageRefs = row.getAttribute("data-admin-message-refs") || "";
          const dialogKey = row.getAttribute("data-admin-message-dialog-key") || "";
          if ((!entryId || !messageKey) && !messageRefs) return;

          row.setAttribute("data-admin-message-read-pending", "true");

          try {
            const response = await window.fetch(window.location.pathname + window.location.search, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                Accept: "application/json",
                "X-SHYNLI-ADMIN-AJAX": "1",
              },
              body: new URLSearchParams({
                action: "mark-message-read",
                entryId,
                messageKey,
                messageRefs,
              }).toString(),
              credentials: "same-origin",
            });

            let payload = null;
            try {
              payload = await response.json();
            } catch (error) {
              void error;
            }

            if (!response.ok || !payload || payload.ok !== true) {
              row.removeAttribute("data-admin-message-read-pending");
              return;
            }

            if (dialogKey) {
              updateAdminMessageDialogRowsRead(dialogKey, payload.changedCount || row.getAttribute("data-admin-message-unread-count") || 0);
            } else {
              updateAdminMessageRowsRead(entryId, messageKey);
            }
          } catch (error) {
            void error;
            row.removeAttribute("data-admin-message-read-pending");
          }
        }

        function openDialog(dialog, options) {
          if (!dialog) return;
          if (typeof dialog.showModal === "function") {
            if (!dialog.open) dialog.showModal();
          } else {
            dialog.setAttribute("open", "open");
          }
          captureDialogCleanState(dialog);
          updateDialogState();
          loadAdminGhlSmsHistoryWithin(dialog, { force: true });
          startAdminGhlSmsHistoryPollingWithin(dialog);
          const focusSelector =
            options && typeof options.focusSelector === "string" ? options.focusSelector.trim() : "";
          if (focusSelector) {
            scheduleDialogTargetScroll(dialog, focusSelector);
          }
        }

        function setToggleTriggerState(trigger, expanded) {
          if (!trigger) return;
          const openLabel = trigger.getAttribute("data-admin-toggle-label-open") || "Скрыть";
          const closedLabel = trigger.getAttribute("data-admin-toggle-label-closed") || "Открыть";
          const label = expanded ? openLabel : closedLabel;
          trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
          if (trigger.hasAttribute("data-admin-toggle-icon")) {
            trigger.setAttribute("aria-label", label);
            trigger.setAttribute("title", label);
            const srOnlyLabel = trigger.querySelector(".admin-sr-only");
            if (srOnlyLabel) srOnlyLabel.textContent = label;
            return;
          }
          trigger.textContent = label;
        }

        function setToggleStateByTarget(targetId, expanded) {
          if (!targetId) return;
          document.querySelectorAll("[data-admin-toggle-target]").forEach((trigger) => {
            if (trigger.getAttribute("data-admin-toggle-target") === targetId) {
              setToggleTriggerState(trigger, expanded);
            }
          });
          document.querySelectorAll("[data-admin-toggle-companion]").forEach((companion) => {
            if (companion.getAttribute("data-admin-toggle-companion") === targetId) {
              companion.hidden = !expanded;
            }
          });
        }

        function resetTogglePanels(scope) {
          if (!scope || typeof scope.querySelectorAll !== "function") return;
          scope.querySelectorAll("[data-admin-toggle-panel]").forEach((panel) => {
            panel.hidden = true;
            if (panel.id) {
              setToggleStateByTarget(panel.id, false);
            }
          });
        }

        function closeDialog(dialog, options) {
          if (!dialog) return;
          if (!canCloseDialog(dialog, options)) return;
          const returnUrl = dialog.getAttribute("data-admin-dialog-return-url");
          stopAdminGhlSmsHistoryPollingWithin(dialog);
          resetTogglePanels(dialog);
          resetOrderAmountEditors(dialog, { reset: true });
          resetOrderScheduleEditors(dialog, { reset: true });
          resetOrderPaymentEditors(dialog, { reset: true });
          resetOrderTeamEditors(dialog, { reset: true });
          if (typeof dialog.close === "function") {
            if (dialog.open) dialog.close();
          } else {
            dialog.removeAttribute("open");
          }
          if (hasDialogDirtyCloseGuard(dialog)) {
            dialog.removeAttribute("data-admin-dialog-clean-state");
          }
          updateDialogState();
          if (dialog === confirmDialog) {
            pendingConfirmForm = null;
            if (confirmTitle) confirmTitle.textContent = "Точно удалить?";
            if (confirmCopy) {
              confirmCopy.textContent = "";
              confirmCopy.hidden = true;
            }
          }
          if (dialog === saveConfirmDialog) {
            pendingSaveConfirmSubmission = null;
            if (pendingSaveConfirmActionResolve) {
              pendingSaveConfirmActionResolve(false);
              pendingSaveConfirmActionResolve = null;
            }
          }
          if (returnUrl) {
            const currentPath = window.location.pathname + window.location.search;
            if (returnUrl !== currentPath) {
              window.location.assign(returnUrl);
            }
          }
        }

        function clearAdminOrderQuoteMirrors(form) {
          if (!(form instanceof HTMLFormElement)) return;
          form.querySelectorAll("[data-admin-order-quote-mirror]").forEach((field) => field.remove());
        }

        function setAdminOrderReturnTo(form, value) {
          if (!(form instanceof HTMLFormElement)) return;
          const returnToField = form.elements.namedItem("returnTo");
          if (returnToField instanceof HTMLInputElement) {
            returnToField.value = value || returnToField.value;
          }
        }

        function mirrorAdminOrderQuoteFields(primarySaveTrigger) {
          if (!(primarySaveTrigger instanceof HTMLButtonElement)) return;
          const primaryForm = primarySaveTrigger.form;
          if (!(primaryForm instanceof HTMLFormElement)) return;

          clearAdminOrderQuoteMirrors(primaryForm);
          const listReturnTo = primarySaveTrigger.getAttribute("data-admin-order-list-return-to") || "";
          setAdminOrderReturnTo(primaryForm, listReturnTo);

          const quoteFormId = primarySaveTrigger.getAttribute("data-admin-order-quote-form") || "";
          const quoteForm = quoteFormId ? document.getElementById(quoteFormId) : null;
          const quotePanel = quoteForm instanceof HTMLFormElement
            ? quoteForm.closest("[data-admin-toggle-panel]")
            : null;
          if (!(quoteForm instanceof HTMLFormElement) || !quotePanel || quotePanel.hidden) return;

          for (const [name, value] of new FormData(quoteForm).entries()) {
            if (["action", "entryId", "returnTo"].includes(name) || typeof value !== "string") continue;
            const mirrorField = document.createElement("input");
            mirrorField.type = "hidden";
            mirrorField.name = name;
            mirrorField.value = value;
            mirrorField.setAttribute("data-admin-order-quote-mirror", "true");
            primaryForm.appendChild(mirrorField);
          }

          const actionField = document.createElement("input");
          actionField.type = "hidden";
          actionField.name = "action";
          actionField.value = "update-order-with-quote-fields";
          actionField.setAttribute("data-admin-order-quote-mirror", "true");
          primaryForm.appendChild(actionField);
          setAdminOrderReturnTo(
            primaryForm,
            primarySaveTrigger.getAttribute("data-admin-order-detail-return-to") || listReturnTo
          );
        }

        document.addEventListener("submit", (event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          if (form.getAttribute("data-admin-logout-form") === "true") {
            event.preventDefault();
            void submitLogoutForm(form);
            return;
          }
        });

        document.addEventListener("click", (event) => {
          const submitControl = event.target instanceof Element
            ? event.target.closest('button[type="submit"], input[type="submit"]')
            : null;
          const primaryOrderSave = submitControl instanceof HTMLButtonElement &&
            submitControl.hasAttribute("data-admin-order-primary-save")
              ? submitControl
              : null;
          if (primaryOrderSave) {
            mirrorAdminOrderQuoteFields(primaryOrderSave);
          } else if (submitControl && submitControl.form instanceof HTMLFormElement) {
            clearAdminOrderQuoteMirrors(submitControl.form);
          }

          const trigger = event.target instanceof Element
            ? event.target.closest("[data-admin-logout-trigger]")
            : null;
          if (trigger) {
            const form =
              trigger.closest("form[data-admin-logout-form='true']") ||
              trigger.closest("form.admin-logout-form");
            if (!(form instanceof HTMLFormElement)) return;
            event.preventDefault();
            void submitLogoutForm(form);
            return;
          }

          const confirmTrigger = event.target.closest("[data-admin-confirm]");
          if (confirmTrigger) {
            pendingConfirmForm = confirmTrigger.form || confirmTrigger.closest("form");
            if (!pendingConfirmForm || !confirmDialog) return;
            if (confirmTitle) {
              confirmTitle.textContent = confirmTrigger.getAttribute("data-admin-confirm-title") || "Точно удалить?";
            }
            if (confirmCopy) {
              const message = confirmTrigger.getAttribute("data-admin-confirm-message") || "";
              confirmCopy.textContent = message;
              confirmCopy.hidden = !message;
            }
            openDialog(confirmDialog);
            return;
          }

          const confirmAccept = event.target.closest("[data-admin-confirm-accept]");
          if (confirmAccept) {
            const formToSubmit = pendingConfirmForm;
            if (!formToSubmit) {
              closeDialog(confirmDialog);
              return;
            }
            pendingConfirmForm = null;
            closeDialog(confirmDialog);
            if (typeof formToSubmit.requestSubmit === "function") {
              formToSubmit.requestSubmit();
            } else {
              formToSubmit.submit();
            }
            return;
          }

          const saveConfirmAccept = event.target.closest("[data-admin-save-confirm-accept]");
          if (saveConfirmAccept) {
            if (pendingSaveConfirmActionResolve) {
              const resolve = pendingSaveConfirmActionResolve;
              pendingSaveConfirmActionResolve = null;
              closeDialog(saveConfirmDialog);
              resolve(true);
              return;
            }
            submitAdminSaveConfirmedForm();
            closeDialog(saveConfirmDialog);
            return;
          }

          const toggleTrigger = event.target.closest("[data-admin-toggle-target]");
          if (toggleTrigger) {
            const targetId = toggleTrigger.getAttribute("data-admin-toggle-target");
            const panel = targetId ? document.getElementById(targetId) : null;
            if (!panel) return;
            const expanded = panel.hidden;
            panel.hidden = !expanded;
            setToggleStateByTarget(targetId, expanded);
            if (expanded) {
              const firstField = panel.querySelector("input, textarea, select");
              if (firstField && typeof firstField.focus === "function") {
                firstField.focus();
              }
            }
            return;
          }

          const openTrigger = event.target.closest("[data-admin-dialog-open]");
          if (openTrigger) {
            if (openTrigger.hasAttribute("data-admin-dialog-row")) {
              const interactiveTarget = event.target.closest(
                "a, button, input, select, textarea, label, summary, form, [data-admin-dialog-ignore]"
              );
              if (interactiveTarget && interactiveTarget !== openTrigger) {
                return;
              }
            }
            const dialog = document.getElementById(openTrigger.getAttribute("data-admin-dialog-open"));
            openDialog(dialog, {
              focusSelector: openTrigger.getAttribute("data-admin-dialog-focus") || "",
            });
            if (openTrigger.hasAttribute("data-admin-message-key")) {
              void markAdminMessageRowRead(openTrigger);
            }
            return;
          }

          const closeTrigger = event.target.closest("[data-admin-dialog-close]");
          if (closeTrigger) {
            const dialog = document.getElementById(closeTrigger.getAttribute("data-admin-dialog-close"));
            closeDialog(dialog);
            return;
          }

          const dialog = event.target.closest(dialogSelector);
          if (dialog && event.target === dialog) {
            closeDialog(dialog);
          }
        });

        document.addEventListener("keydown", (event) => {
          if ((event.key === "Enter" || event.key === " ") && event.target instanceof HTMLElement) {
            const rowOpenTrigger = event.target.closest("[data-admin-dialog-open][data-admin-dialog-row]");
            if (rowOpenTrigger && event.target === rowOpenTrigger) {
              event.preventDefault();
              const dialog = document.getElementById(rowOpenTrigger.getAttribute("data-admin-dialog-open"));
              openDialog(dialog, {
                focusSelector: rowOpenTrigger.getAttribute("data-admin-dialog-focus") || "",
              });
              if (rowOpenTrigger.hasAttribute("data-admin-message-key")) {
                void markAdminMessageRowRead(rowOpenTrigger);
              }
              return;
            }
          }
          if (event.key !== "Escape") return;
          const openDialogs = Array.from(document.querySelectorAll(dialogSelector)).filter((dialog) => dialog.hasAttribute("open"));
          const lastDialog = openDialogs[openDialogs.length - 1] || null;
          if (lastDialog && typeof lastDialog.showModal !== "function") {
            event.preventDefault();
            closeDialog(lastDialog);
          }
        });

        document.addEventListener("change", (event) => {
          const statusSelect = event.target instanceof Element
            ? event.target.closest("[data-admin-order-status-select]")
            : null;
          if (statusSelect) syncAdminOrderCancelScope(statusSelect);
        });

        document.querySelectorAll(dialogSelector).forEach((dialog) => {
          dialog.addEventListener("close", updateDialogState);
          dialog.addEventListener("cancel", (event) => {
            if (hasDialogDirtyCloseGuard(dialog)) {
              event.preventDefault();
              closeDialog(dialog);
              return;
            }
            if (dialog.getAttribute("data-admin-dialog-return-url")) {
              event.preventDefault();
              closeDialog(dialog);
              return;
            }
            setTimeout(updateDialogState, 0);
          });
        });

        document.querySelectorAll(dialogSelector + '[data-admin-dialog-autopen="true"]').forEach((dialog) => {
          openDialog(dialog);
        });

        document.querySelectorAll("[data-admin-toggle-target]").forEach((trigger) => {
          const targetId = trigger.getAttribute("data-admin-toggle-target");
          const panel = targetId ? document.getElementById(targetId) : null;
          setToggleTriggerState(trigger, panel ? !panel.hidden : false);
        });

        document.querySelectorAll("[data-admin-order-status-select]").forEach(syncAdminOrderCancelScope);
        syncAdminPhoneInputs(document);

        updateDialogState();`;

module.exports = {
  ADMIN_SHARED_DIALOG_LOGOUT_SCRIPT,
  ADMIN_SHARED_DIALOG_STATE_SCRIPT,
};
