"use strict";

function createQuoteOpsRuntimeScripts(deps = {}) {
  const { ADMIN_QUOTE_OPS_PATH } = deps;

  function renderQuoteOpsFunnelScript(activeSection) {
    return `<script>
      (() => {
        const activeSection = ${JSON.stringify(activeSection)};
        document.querySelectorAll('[data-lead-next-status="true"]').forEach((select) => {
          const form = select.closest("form");
          if (!form) return;
          const contactField = form.querySelector('[data-lead-next-contact-field="true"]');
          const syncFieldVisibility = () => {
            if (!contactField) return;
            const visible = String(select.value || "") === "discussion";
            contactField.setAttribute("data-visible", visible ? "true" : "false");
            const input = contactField.querySelector("input");
            if (input) {
              input.required = visible;
            }
          };
          syncFieldVisibility();
          select.addEventListener("change", syncFieldVisibility);
        });

        document.querySelectorAll("[data-quote-task-contacted-toggle]").forEach((button) => {
          const targetId = button.getAttribute("data-quote-task-contacted-toggle");
          if (!targetId) return;
          const panel = document.querySelector('[data-quote-task-contacted-panel="' + targetId + '"]');
          const dialog = document.getElementById(targetId);
          if (!panel) return;
          button.addEventListener("click", () => {
            const nextHidden = !panel.hidden;
            panel.hidden = nextHidden;
            button.setAttribute("aria-expanded", nextHidden ? "false" : "true");
            if (!nextHidden) {
              const firstField = panel.querySelector("select, input");
              if (firstField && typeof firstField.focus === "function") {
                firstField.focus();
              }
            }
          });
          if (dialog) {
            dialog.addEventListener("close", () => {
              panel.hidden = true;
              button.setAttribute("aria-expanded", "false");
            });
          }
        });

        const stageForm = document.querySelector('[data-quote-funnel-stage-form="true"]');
        const stageEntryInput = stageForm ? stageForm.querySelector('input[name="entryId"]') : null;
        const stageStatusInput = stageForm ? stageForm.querySelector('input[name="leadStatus"]') : null;
        const stageReturnInput = stageForm ? stageForm.querySelector('input[name="returnTo"]') : null;
        const discussionDialog = document.getElementById("admin-quote-funnel-discussion-dialog");
        const discussionForm = discussionDialog ? discussionDialog.querySelector('[data-quote-funnel-discussion-form="true"]') : null;
        const discussionEntryInput = discussionDialog ? discussionDialog.querySelector('input[name="entryId"]') : null;
        const discussionReturnInput = discussionDialog ? discussionDialog.querySelector('input[name="returnTo"]') : null;
        const discussionContactInput = discussionDialog ? discussionDialog.querySelector('input[name="discussionNextContactAt"]') : null;

        let draggedCard = null;
        let pendingDiscussionCard = null;
        let pendingDiscussionLane = null;

        function createBadge(label, tone) {
          const badge = document.createElement("span");
          let className = "admin-badge";
          if (tone === "success") className += " admin-badge-success";
          else if (tone === "muted") className += " admin-badge-muted";
          else if (tone === "danger") className += " admin-badge-danger";
          else if (tone === "outline") className += " admin-badge-outline";
          badge.className = className;
          badge.textContent = label;
          return badge;
        }

        function getLeadBadgeMeta(status) {
          const normalized = String(status || "new");
          if (normalized === "confirmed") return { label: "Подтверждено", tone: "success" };
          if (normalized === "discussion") return { label: "Обсуждение", tone: "outline" };
          if (normalized === "no-response") return { label: "Без ответа", tone: "default" };
          if (normalized === "declined") return { label: "Отказ", tone: "danger" };
          return { label: "New", tone: "muted" };
        }

        function refreshLaneUi(lane) {
          if (!lane) return;
          const list = lane.querySelector('[data-quote-funnel-list="true"]');
          const countTarget = lane.querySelector('[data-quote-funnel-count="true"]');
          if (countTarget && list) {
            const count = list.querySelectorAll('[data-quote-funnel-card="true"]').length;
            countTarget.replaceChildren(createBadge(String(count), "outline"));
          }
          if (!list) return;
          const hasCards = list.querySelector('[data-quote-funnel-card="true"]');
          const emptyState = list.querySelector(".admin-quote-funnel-empty");
          if (hasCards && emptyState) {
            emptyState.remove();
          } else if (!hasCards && !emptyState) {
            const placeholder = document.createElement("div");
            placeholder.className = "admin-quote-funnel-empty";
            placeholder.textContent = "В этой колонке пока нет заявок.";
            list.appendChild(placeholder);
          }
        }

        function moveCardToLane(card, lane) {
          const list = lane ? lane.querySelector('[data-quote-funnel-list="true"]') : null;
          if (!card || !list) return;
          const emptyState = list.querySelector(".admin-quote-funnel-empty");
          if (emptyState) emptyState.remove();
          list.prepend(card);
        }

        function applyLeadPayloadToCard(card, payload) {
          if (!card || !payload || !payload.entry) return;
          const entry = payload.entry;
          const badgeMeta = getLeadBadgeMeta(entry.leadStatus);
          const deadlineRowTarget = card.querySelector('[data-quote-card-deadline-row="true"]');
          const stageTarget = card.querySelector('[data-quote-card-stage="true"]');
          const managerTarget = card.querySelector('[data-quote-card-manager-name="true"]');
          const taskTarget = card.querySelector('[data-quote-card-task-value="true"]');
          const dueLabelTarget = card.querySelector('[data-quote-card-due-label="true"]');
          const dueValueTarget = card.querySelector('[data-quote-card-due-value="true"]');

          card.setAttribute("data-quote-entry-status", String(entry.leadStatus || "new"));
          card.setAttribute("data-locked", entry.locked ? "true" : "false");
          card.setAttribute("draggable", entry.locked ? "false" : "true");

          if (stageTarget) {
            stageTarget.replaceChildren(createBadge(badgeMeta.label, badgeMeta.tone));
          }
          if (managerTarget) {
            managerTarget.textContent = entry.managerLabel || "Без менеджера";
          }
          if (taskTarget) {
            taskTarget.textContent = entry.taskLabel || "Нет открытой задачи";
          }
          if (dueValueTarget) {
            dueValueTarget.textContent = entry.dueLabel || "—";
          }
          if (deadlineRowTarget) {
            deadlineRowTarget.hidden = Boolean(entry.hideDeadline);
          }
          if (dueLabelTarget) {
            dueLabelTarget.textContent = "Дедлайн";
            dueLabelTarget.classList.toggle(
              "admin-quote-funnel-card-detail-label-danger",
              Boolean(entry.dueOverdue)
            );
          }
        }

        function buildAjaxErrorMessage(payload, fallbackMessage = "Не удалось сохранить новый этап заявки.") {
          const errorCode = payload && typeof payload.error === "string" ? payload.error : "";
          if (errorCode === "discussion-contact-required") {
            return "Укажите следующий контакт с клиентом.";
          }
          if (errorCode === "lead-missing") {
            return "Заявка больше не найдена.";
          }
          return fallbackMessage;
        }

        async function submitStageChange(formData) {
          const response = await fetch(${JSON.stringify(ADMIN_QUOTE_OPS_PATH)}, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              Accept: "application/json",
              "X-SHYNLI-ADMIN-AJAX": "1",
            },
            body: new URLSearchParams(formData).toString(),
            credentials: "same-origin",
          });
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          if (!response.ok || !payload || payload.ok !== true) {
            throw new Error(buildAjaxErrorMessage(payload));
          }
          return payload;
        }

        async function submitNotesUpdate(formData) {
          const response = await fetch(${JSON.stringify(ADMIN_QUOTE_OPS_PATH)}, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              Accept: "application/json",
              "X-SHYNLI-ADMIN-AJAX": "1",
            },
            body: new URLSearchParams(formData).toString(),
            credentials: "same-origin",
          });
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          if (!response.ok || !payload || payload.ok !== true) {
            throw new Error(buildAjaxErrorMessage(payload, "Не удалось сохранить заметки."));
          }
          return payload;
        }

        document.querySelectorAll('[data-quote-entry-notes-form="true"]').forEach((form) => {
          if (!(form instanceof HTMLFormElement)) return;
          const textarea = form.querySelector('textarea[name="notes"]');
          const submitButton = form.querySelector('button[type="submit"]');
          const feedback = form.querySelector('[data-quote-entry-notes-feedback="true"]');
          let feedbackTimer = 0;

          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!(textarea instanceof HTMLTextAreaElement)) return;
            if (!(submitButton instanceof HTMLButtonElement)) return;

            submitButton.disabled = true;
            submitButton.textContent = "Сохраняем...";
            if (feedback instanceof HTMLElement) {
              feedback.hidden = true;
              feedback.textContent = "";
            }

            try {
              const payload = await submitNotesUpdate(new FormData(form));
              textarea.value = payload && payload.entry && typeof payload.entry.notes === "string" ? payload.entry.notes : textarea.value;
              if (feedback instanceof HTMLElement) {
                feedback.textContent = "Заметки сохранены.";
                feedback.hidden = false;
              }
            } catch (error) {
              if (feedback instanceof HTMLElement) {
                feedback.textContent = error && error.message ? error.message : "Не удалось сохранить заметки.";
                feedback.hidden = false;
              } else {
                window.alert(error && error.message ? error.message : "Не удалось сохранить заметки.");
              }
            } finally {
              submitButton.disabled = false;
              submitButton.textContent = "Сохранить";
              if (feedback instanceof HTMLElement) {
                window.clearTimeout(feedbackTimer);
                feedbackTimer = window.setTimeout(() => {
                  feedback.hidden = true;
                }, 2200);
              }
            }
          });
        });

        if (activeSection !== "funnel") return;

        document.querySelectorAll('[data-quote-funnel-card="true"]').forEach((card) => {
          if (card.getAttribute("draggable") !== "true") return;
          card.addEventListener("dragstart", () => {
            draggedCard = card;
            card.classList.add("is-dragging");
          });
          card.addEventListener("dragend", () => {
            card.classList.remove("is-dragging");
          });
        });

        document.querySelectorAll("[data-lead-dropzone]").forEach((lane) => {
          lane.addEventListener("dragover", (event) => {
            if (!draggedCard) return;
            event.preventDefault();
            lane.setAttribute("data-drop-active", "true");
          });
          lane.addEventListener("dragleave", () => {
            lane.removeAttribute("data-drop-active");
          });
          lane.addEventListener("drop", async (event) => {
            if (!draggedCard || !stageForm || !stageEntryInput || !stageStatusInput || !stageReturnInput) return;
            event.preventDefault();
            lane.removeAttribute("data-drop-active");
            const nextStatus = lane.getAttribute("data-lead-dropzone");
            const entryId = draggedCard.getAttribute("data-quote-entry-id") || "";
            const returnTo = draggedCard.querySelector('input[name="returnTo"]')?.value || "/admin/quote-ops?section=funnel";
            const previousStatus = draggedCard.getAttribute("data-quote-entry-status") || "";
            if (!nextStatus || !entryId || nextStatus === previousStatus) {
              draggedCard = null;
              return;
            }
            if (nextStatus === "discussion" && discussionDialog && discussionEntryInput && discussionReturnInput) {
              discussionEntryInput.value = entryId;
              discussionReturnInput.value = returnTo;
              if (discussionContactInput) discussionContactInput.value = "";
              pendingDiscussionCard = draggedCard;
              pendingDiscussionLane = lane;
              if (typeof discussionDialog.showModal === "function") {
                discussionDialog.showModal();
              }
              draggedCard = null;
              return;
            }
            const card = draggedCard;
            const sourceLane = card.closest("[data-lead-dropzone]");
            const sourceList = card.parentElement;
            const sourceNextSibling = card.nextElementSibling;
            stageEntryInput.value = entryId;
            stageStatusInput.value = nextStatus;
            stageReturnInput.value = returnTo;
            card.classList.add("is-saving");
            moveCardToLane(card, lane);
            refreshLaneUi(sourceLane);
            refreshLaneUi(lane);
            try {
              const payload = await submitStageChange(new FormData(stageForm));
              applyLeadPayloadToCard(card, payload);
            } catch (error) {
              if (sourceList) {
                if (sourceNextSibling && sourceNextSibling.parentElement === sourceList) {
                  sourceList.insertBefore(card, sourceNextSibling);
                } else {
                  sourceList.appendChild(card);
                }
              }
              refreshLaneUi(sourceLane);
              refreshLaneUi(lane);
              window.alert(error && error.message ? error.message : "Не удалось сохранить новый этап заявки.");
            } finally {
              card.classList.remove("is-saving");
              card.classList.remove("is-dragging");
              draggedCard = null;
            }
          });
        });

        if (discussionDialog) {
          discussionDialog.addEventListener("close", () => {
            pendingDiscussionCard = null;
            pendingDiscussionLane = null;
          });
        }

        if (discussionForm) {
          discussionForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!pendingDiscussionCard || !pendingDiscussionLane) {
              discussionForm.submit();
              return;
            }

            const card = pendingDiscussionCard;
            const lane = pendingDiscussionLane;
            const sourceLane = card.closest("[data-lead-dropzone]");
            const sourceList = card.parentElement;
            const sourceNextSibling = card.nextElementSibling;

            card.classList.add("is-saving");
            moveCardToLane(card, lane);
            refreshLaneUi(sourceLane);
            refreshLaneUi(lane);

            try {
              const payload = await submitStageChange(new FormData(discussionForm));
              applyLeadPayloadToCard(card, payload);
              if (typeof discussionDialog.close === "function") {
                discussionDialog.close();
              }
            } catch (error) {
              if (sourceList) {
                if (sourceNextSibling && sourceNextSibling.parentElement === sourceList) {
                  sourceList.insertBefore(card, sourceNextSibling);
                } else {
                  sourceList.appendChild(card);
                }
              }
              refreshLaneUi(sourceLane);
              refreshLaneUi(lane);
              window.alert(error && error.message ? error.message : "Не удалось сохранить новый этап заявки.");
            } finally {
              card.classList.remove("is-saving");
              pendingDiscussionCard = null;
              pendingDiscussionLane = null;
            }
          });
        }
      })();
    </script>`;
  }

  return {
    renderQuoteOpsFunnelScript,
  };
}

module.exports = {
  createQuoteOpsRuntimeScripts,
};
