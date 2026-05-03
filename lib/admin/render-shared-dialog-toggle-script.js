"use strict";

const ADMIN_SHARED_DIALOG_LOGOUT_SCRIPT = `        const dialogSelector = "dialog.admin-dialog";
        const confirmDialog = document.getElementById("admin-confirm-dialog");
        const confirmTitle = document.getElementById("admin-confirm-title");
        const confirmCopy = document.getElementById("admin-confirm-copy");
        let pendingConfirmForm = null;

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

        function openDialog(dialog, options) {
          if (!dialog) return;
          if (typeof dialog.showModal === "function") {
            if (!dialog.open) dialog.showModal();
          } else {
            dialog.setAttribute("open", "open");
          }
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

        function closeDialog(dialog) {
          if (!dialog) return;
          const returnUrl = dialog.getAttribute("data-admin-dialog-return-url");
          stopAdminGhlSmsHistoryPollingWithin(dialog);
          resetTogglePanels(dialog);
          resetOrderAmountEditors(dialog, { reset: true });
          resetOrderPaymentEditors(dialog, { reset: true });
          resetOrderTeamEditors(dialog, { reset: true });
          if (typeof dialog.close === "function") {
            if (dialog.open) dialog.close();
          } else {
            dialog.removeAttribute("open");
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
          if (returnUrl) {
            const currentPath = window.location.pathname + window.location.search;
            if (returnUrl !== currentPath) {
              window.location.assign(returnUrl);
            }
          }
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

        document.querySelectorAll(dialogSelector).forEach((dialog) => {
          dialog.addEventListener("close", updateDialogState);
          dialog.addEventListener("cancel", (event) => {
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

        syncAdminPhoneInputs(document);

        updateDialogState();`;

module.exports = {
  ADMIN_SHARED_DIALOG_LOGOUT_SCRIPT,
  ADMIN_SHARED_DIALOG_STATE_SCRIPT,
};
