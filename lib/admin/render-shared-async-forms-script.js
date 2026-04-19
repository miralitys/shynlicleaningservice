"use strict";

const ADMIN_SHARED_ASYNC_FORMS_SCRIPT = `        const asyncFormFeedbackTimers = new WeakMap();

        function setAsyncFormFeedback(form, message, state) {
          if (!(form instanceof HTMLFormElement)) return;
          const feedback = form.querySelector("[data-admin-async-feedback]");
          if (!(feedback instanceof HTMLElement)) return;
          const previousTimer = asyncFormFeedbackTimers.get(form);
          if (previousTimer) {
            window.clearTimeout(previousTimer);
            asyncFormFeedbackTimers.delete(form);
          }
          feedback.textContent = message || "";
          feedback.hidden = !message;
          if (state) {
            feedback.setAttribute("data-state", state);
          } else {
            feedback.removeAttribute("data-state");
          }
          if (message && state === "success") {
            const timerId = window.setTimeout(() => {
              feedback.hidden = true;
              feedback.textContent = "";
              feedback.removeAttribute("data-state");
              asyncFormFeedbackTimers.delete(form);
            }, 2200);
            asyncFormFeedbackTimers.set(form, timerId);
          }
        }

        function buildAsyncFormBody(form) {
          if (!(form instanceof HTMLFormElement)) return null;
          const hasSelectedFiles = Array.from(form.querySelectorAll('input[type="file"]')).some((input) => (
            input instanceof HTMLInputElement && input.files && input.files.length > 0
          ));
          if (hasSelectedFiles) return null;

          const formData = new FormData(form);
          const body = new URLSearchParams();
          for (const [key, value] of formData.entries()) {
            if (typeof value === "string") {
              body.append(key, value);
            }
          }
          return body;
        }

        function buildAsyncFormErrorMessage(form, payload) {
          const errorCode =
            payload && typeof payload.error === "string"
              ? payload.error
              : payload && typeof payload.notice === "string"
                ? payload.notice
                : "";
          switch (errorCode) {
            case "client-missing":
              return "Клиент больше не найден.";
            case "client-save-failed":
              return "Не удалось сохранить карточку клиента.";
            case "order-missing":
              return "Заказ больше не найден.";
            case "completion-save-failed":
              return "Не удалось сохранить отчёт клинера.";
            case "staff-failed":
            case "staff-missing":
              return "Не удалось сохранить карточку сотрудника.";
            case "assignment-conflict":
              return "Назначение конфликтует с календарём сотрудника.";
            case "assignment-save-failed":
              return "Не удалось сохранить назначение.";
            case "user-not-found":
            case "user-update-failed":
              return "Не удалось сохранить карточку сотрудника.";
            default:
              return form.getAttribute("data-admin-async-error") || "Не удалось сохранить изменения.";
          }
        }

        async function submitAsyncAdminForm(form, body) {
          const response = await fetch(form.getAttribute("action") || window.location.href, {
            method: String(form.getAttribute("method") || "POST").toUpperCase(),
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
          if (!response.ok || !payload || payload.ok !== true) {
            throw new Error(buildAsyncFormErrorMessage(form, payload));
          }
          return payload;
        }

        document.addEventListener("submit", async (event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          if (form.getAttribute("data-admin-async-save") !== "true") return;

          const body = buildAsyncFormBody(form);
          if (!body) return;

          event.preventDefault();

          const submitter =
            event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement
              ? event.submitter
              : (form.id
                  ? document.querySelector('button[form="' + form.id + '"][type="submit"], input[form="' + form.id + '"][type="submit"]')
                  : null) ||
                form.querySelector('button[type="submit"], input[type="submit"]');
          const idleLabel =
            submitter instanceof HTMLInputElement
              ? submitter.value
              : submitter instanceof HTMLButtonElement
                ? submitter.textContent
                : "";

          if (submitter instanceof HTMLButtonElement) {
            submitter.disabled = true;
            submitter.textContent = "Сохраняем...";
          } else if (submitter instanceof HTMLInputElement) {
            submitter.disabled = true;
            submitter.value = "Сохраняем...";
          }

          setAsyncFormFeedback(form, "", "");

          try {
            await submitAsyncAdminForm(form, body);
            setAsyncFormFeedback(
              form,
              form.getAttribute("data-admin-async-success") || "Сохранено.",
              "success"
            );
          } catch (error) {
            setAsyncFormFeedback(
              form,
              error && error.message ? error.message : "Не удалось сохранить изменения.",
              "error"
            );
          } finally {
            if (submitter instanceof HTMLButtonElement) {
              submitter.disabled = false;
              submitter.textContent = idleLabel || "Сохранить";
            } else if (submitter instanceof HTMLInputElement) {
              submitter.disabled = false;
              submitter.value = idleLabel || "Сохранить";
            }
          }
        });

        document.addEventListener("submit", async (event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement)) return;
          if (form.getAttribute("data-admin-ghl-sms") !== "true") return;

          const body = buildAsyncFormBody(form);
          if (!body) return;

          event.preventDefault();

          const submitter =
            event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement
              ? event.submitter
              : form.querySelector('button[type="submit"], input[type="submit"]');
          const idleLabel =
            submitter instanceof HTMLInputElement
              ? submitter.value
              : submitter instanceof HTMLButtonElement
                ? submitter.textContent
                : "";

          if (submitter instanceof HTMLButtonElement) {
            submitter.disabled = true;
            submitter.textContent = "Отправляем...";
          } else if (submitter instanceof HTMLInputElement) {
            submitter.disabled = true;
            submitter.value = "Отправляем...";
          }

          try {
            const response = await fetch(form.getAttribute("action") || window.location.href, {
              method: String(form.getAttribute("method") || "POST").toUpperCase(),
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
            if (smsPayload) {
              applyAdminGhlSmsPayload(form, smsPayload);
            }

            if (!response.ok || !payload || payload.ok !== true) {
              if (!smsPayload) {
                applyAdminGhlSmsPayload(form, {
                  feedbackState: "error",
                  feedbackMessage: "Не удалось отправить SMS. Проверьте соединение и попробуйте ещё раз.",
                  draft: form.querySelector('textarea[name="message"]') instanceof HTMLTextAreaElement
                    ? form.querySelector('textarea[name="message"]').value
                    : "",
                });
              }
              return;
            }
          } catch (error) {
            applyAdminGhlSmsPayload(form, {
              feedbackState: "error",
              feedbackMessage: "Не удалось отправить SMS. Проверьте соединение и попробуйте ещё раз.",
              draft: form.querySelector('textarea[name="message"]') instanceof HTMLTextAreaElement
                ? form.querySelector('textarea[name="message"]').value
                : "",
            });
          } finally {
            if (submitter instanceof HTMLButtonElement) {
              submitter.disabled = false;
              submitter.textContent = idleLabel || "Отправить SMS";
            } else if (submitter instanceof HTMLInputElement) {
              submitter.disabled = false;
              submitter.value = idleLabel || "Отправить SMS";
            }
          }
        });`;

module.exports = {
  ADMIN_SHARED_ASYNC_FORMS_SCRIPT,
};
