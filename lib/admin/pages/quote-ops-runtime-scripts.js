"use strict";

function createQuoteOpsRuntimeScripts(deps = {}) {
  const { ADMIN_QUOTE_OPS_PATH } = deps;

  function renderQuoteOpsFunnelScript(activeSection) {
    return `<script>
      (() => {
        const activeSection = ${JSON.stringify(activeSection)};
        const manualTaskForm = document.querySelector(".admin-quote-manual-task-form");
        if (manualTaskForm) {
          const clientPicker = manualTaskForm.querySelector('[data-quote-task-client-picker="true"]');
          const searchShell = manualTaskForm.querySelector(".admin-quote-task-client-search-shell");
          const searchInput = manualTaskForm.querySelector('[data-quote-task-client-search="true"]');
          const entryInput = manualTaskForm.querySelector('[data-quote-task-entry-id="true"]');
          const results = manualTaskForm.querySelector('[data-quote-task-client-results="true"]');
          const emptyState = manualTaskForm.querySelector('[data-quote-task-client-empty="true"]');
          const selection = manualTaskForm.querySelector('[data-quote-task-client-selection="true"]');
          const changeButton = manualTaskForm.querySelector('[data-quote-task-client-change="true"]');
          const clientError = manualTaskForm.querySelector('[data-quote-task-client-error="true"]');
          const assigneeSelect = manualTaskForm.querySelector('select[name="assigneeId"]');
          const titleInput = manualTaskForm.querySelector('[data-quote-task-title-input="true"]');
          const dueInput = manualTaskForm.querySelector('[data-quote-task-due-input="true"]');
          const resultButtons = results
            ? Array.from(results.querySelectorAll('[data-quote-task-client-result="true"]'))
            : [];

          const normalizeSearchValue = (value) => String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-zа-яё0-9@.+]+/gi, " ")
            .trim();

          const closeClientResults = () => {
            if (results) results.hidden = true;
            if (searchInput) searchInput.setAttribute("aria-expanded", "false");
          };

          const renderClientResults = () => {
            if (!results || !searchInput) return;
            const query = normalizeSearchValue(searchInput.value);
            let visibleCount = 0;
            resultButtons.forEach((button) => {
              const matches = !query || normalizeSearchValue(button.getAttribute("data-search")).includes(query);
              const visible = matches && visibleCount < 7;
              button.hidden = !visible;
              if (visible) visibleCount += 1;
            });
            if (emptyState) emptyState.hidden = visibleCount > 0;
            results.hidden = false;
            searchInput.setAttribute("aria-expanded", "true");
          };

          const setSelectedText = (selector, value, prefix) => {
            const target = selection ? selection.querySelector(selector) : null;
            if (!target) return;
            const normalized = String(value || "").trim();
            target.textContent = normalized ? String(prefix || "") + normalized : "";
            target.hidden = !normalized;
          };

          const selectClientResult = (button) => {
            if (!button || !entryInput || !searchInput || !selection) return;
            const name = button.getAttribute("data-client-name") || "Клиент";
            const phone = button.getAttribute("data-client-phone") || "";
            const email = button.getAttribute("data-client-email") || "";
            const address = button.getAttribute("data-client-address") || "";
            const managerId = button.getAttribute("data-manager-id") || "";

            entryInput.value = button.getAttribute("data-entry-id") || "";
            searchInput.value = name;
            searchInput.setCustomValidity("");
            searchInput.setAttribute("aria-invalid", "false");
            if (clientError) clientError.hidden = true;
            if (searchShell) searchShell.hidden = true;
            selection.hidden = false;
            setSelectedText('[data-quote-task-selected-name="true"]', name, "");
            setSelectedText(
              '[data-quote-task-selected-contacts="true"]',
              [phone, email].filter(Boolean).join(" · "),
              ""
            );
            setSelectedText('[data-quote-task-selected-address="true"]', address, "");
            setSelectedText(
              '[data-quote-task-selected-stage="true"]',
              button.getAttribute("data-client-stage"),
              "Этап: "
            );
            setSelectedText(
              '[data-quote-task-selected-schedule="true"]',
              button.getAttribute("data-client-schedule") || "Дата не назначена",
              "Уборка: "
            );
            setSelectedText(
              '[data-quote-task-selected-summary="true"]',
              button.getAttribute("data-client-request-summary"),
              ""
            );
            resultButtons.forEach((resultButton) => {
              resultButton.setAttribute("aria-selected", resultButton === button ? "true" : "false");
            });
            if (
              managerId &&
              assigneeSelect &&
              Array.from(assigneeSelect.options).some((option) => option.value === managerId)
            ) {
              assigneeSelect.value = managerId;
            }
            closeClientResults();
          };

          if (searchInput) {
            searchInput.addEventListener("focus", renderClientResults);
            searchInput.addEventListener("input", () => {
              if (entryInput) entryInput.value = "";
              searchInput.setCustomValidity("");
              searchInput.setAttribute("aria-invalid", "false");
              if (clientError) clientError.hidden = true;
              renderClientResults();
            });
            searchInput.addEventListener("keydown", (event) => {
              if (event.key === "Escape") {
                closeClientResults();
                return;
              }
              const visibleButtons = resultButtons.filter((button) => !button.hidden);
              if (event.key === "ArrowDown" && visibleButtons[0]) {
                event.preventDefault();
                visibleButtons[0].focus();
              } else if (event.key === "Enter" && visibleButtons.length === 1) {
                event.preventDefault();
                selectClientResult(visibleButtons[0]);
              }
            });
          }

          resultButtons.forEach((button) => {
            button.addEventListener("click", () => selectClientResult(button));
            button.addEventListener("keydown", (event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              const visibleButtons = resultButtons.filter((resultButton) => !resultButton.hidden);
              const currentIndex = visibleButtons.indexOf(button);
              const nextIndex = event.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
              if (visibleButtons[nextIndex]) {
                event.preventDefault();
                visibleButtons[nextIndex].focus();
              } else if (event.key === "ArrowUp" && searchInput) {
                event.preventDefault();
                searchInput.focus();
              }
            });
          });

          if (changeButton) {
            changeButton.addEventListener("click", () => {
              if (entryInput) entryInput.value = "";
              if (selection) selection.hidden = true;
              if (searchShell) searchShell.hidden = false;
              if (searchInput) {
                searchInput.value = "";
                searchInput.focus();
              }
              renderClientResults();
            });
          }

          document.addEventListener("click", (event) => {
            if (clientPicker && !clientPicker.contains(event.target)) closeClientResults();
          });

          manualTaskForm.querySelectorAll("[data-quote-task-title-preset]").forEach((button) => {
            button.addEventListener("click", () => {
              if (!titleInput) return;
              titleInput.value = button.getAttribute("data-quote-task-title-preset") || "";
              titleInput.focus();
              manualTaskForm.querySelectorAll("[data-quote-task-title-preset]").forEach((preset) => {
                preset.setAttribute("data-active", preset === button ? "true" : "false");
              });
            });
          });
          if (titleInput) {
            titleInput.addEventListener("input", () => {
              manualTaskForm.querySelectorAll("[data-quote-task-title-preset]").forEach((preset) => {
                preset.setAttribute(
                  "data-active",
                  preset.getAttribute("data-quote-task-title-preset") === titleInput.value ? "true" : "false"
                );
              });
            });
          }

          const padDatePart = (value) => String(value).padStart(2, "0");
          const toLocalDateTimeValue = (date) => [
            date.getFullYear(),
            padDatePart(date.getMonth() + 1),
            padDatePart(date.getDate()),
          ].join("-") + "T" + [
            padDatePart(date.getHours()),
            padDatePart(date.getMinutes()),
          ].join(":");
          const buildPresetDate = (preset) => {
            const date = new Date();
            date.setSeconds(0, 0);
            date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15);
            if (preset === "today") date.setHours(date.getHours() + 1);
            if (preset === "tomorrow") date.setDate(date.getDate() + 1);
            if (preset === "three-hours") date.setHours(date.getHours() + 3);
            if (preset === "week") date.setDate(date.getDate() + 7);
            return date;
          };
          manualTaskForm.querySelectorAll("[data-quote-task-due-preset]").forEach((button) => {
            button.addEventListener("click", () => {
              if (!dueInput) return;
              const preset = button.getAttribute("data-quote-task-due-preset") || "";
              dueInput.value = toLocalDateTimeValue(buildPresetDate(preset));
              dueInput.focus();
              manualTaskForm.querySelectorAll("[data-quote-task-due-preset]").forEach((duePreset) => {
                duePreset.setAttribute("data-active", duePreset === button ? "true" : "false");
              });
            });
          });
          if (dueInput) {
            dueInput.addEventListener("input", () => {
              manualTaskForm.querySelectorAll("[data-quote-task-due-preset]").forEach((preset) => {
                preset.setAttribute("data-active", "false");
              });
            });
          }

          manualTaskForm.addEventListener("submit", (event) => {
            if (entryInput && entryInput.value) return;
            event.preventDefault();
            if (clientError) clientError.hidden = false;
            if (searchShell) searchShell.hidden = false;
            if (selection) selection.hidden = true;
            if (searchInput) {
              searchInput.setCustomValidity("Выберите клиента из результатов поиска.");
              searchInput.setAttribute("aria-invalid", "true");
              searchInput.focus();
              searchInput.reportValidity();
            }
            renderClientResults();
          });

          document.querySelectorAll('[data-admin-dialog-open="admin-quote-create-task-dialog"]').forEach((button) => {
            button.addEventListener("click", () => {
              window.setTimeout(() => {
                if (searchInput && !entryInput.value) searchInput.focus();
              }, 0);
            });
          });
        }

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

        document.querySelectorAll('[data-quote-task-contacted-autosave="true"]').forEach((form) => {
          const statusSelect = form.querySelector('[name="nextStatus"]');
          const contactInput = form.querySelector('[name="discussionNextContactAt"]');
          const submitButton = form.querySelector('[data-quote-task-autosave-submit="true"]');
          const statusText = form.querySelector('[data-quote-task-autosave-status="true"]');
          let submitting = false;

          if (!statusSelect || !contactInput) return;

          contactInput.addEventListener("change", () => {
            if (
              submitting ||
              String(statusSelect.value || "") !== "discussion" ||
              !contactInput.value ||
              !contactInput.checkValidity()
            ) {
              return;
            }

            submitting = true;
            if (submitButton) {
              submitButton.disabled = true;
              submitButton.textContent = "Сохраняем…";
            }
            if (statusText) statusText.textContent = "Дата и время сохраняются автоматически.";
            form.requestSubmit();
          });
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

        document.querySelectorAll("[data-quote-task-agreed-toggle]").forEach((button) => {
          const targetId = button.getAttribute("data-quote-task-agreed-toggle");
          if (!targetId) return;
          const panel = document.querySelector('[data-quote-task-agreed-panel="' + targetId + '"]');
          const dialog = document.getElementById(targetId);
          if (!panel) return;
          button.addEventListener("click", () => {
            const nextHidden = !panel.hidden;
            panel.hidden = nextHidden;
            button.setAttribute("aria-expanded", nextHidden ? "false" : "true");
            if (!nextHidden) {
              const firstField = panel.querySelector("input, select");
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
          else if (tone === "warning") className += " admin-badge-warning";
          else if (tone === "outline") className += " admin-badge-outline";
          badge.className = className;
          badge.textContent = label;
          return badge;
        }

        function getLeadBadgeMeta(status) {
          const normalized = String(status || "new");
          if (normalized === "confirmed") return { label: "Подтверждено", tone: "warning" };
          if (normalized === "completed") return { label: "Выполнено", tone: "success" };
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

        function bindQuoteOpsEntryNotesForms(root) {
          const scope = root && typeof root.querySelectorAll === "function" ? root : document;
          scope.querySelectorAll('[data-quote-entry-notes-form="true"]').forEach((form) => {
            if (!(form instanceof HTMLFormElement)) return;
            if (form.getAttribute("data-quote-entry-notes-bound") === "true") return;
            form.setAttribute("data-quote-entry-notes-bound", "true");
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
        }

        window.__adminBindQuoteOpsDialogContent = bindQuoteOpsEntryNotesForms;
        bindQuoteOpsEntryNotesForms(document);

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
