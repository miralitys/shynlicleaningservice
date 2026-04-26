"use strict";

const ADMIN_SHARED_ORDER_COMPLETION_AND_EDITOR_SCRIPT = `        function escapeAdminHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function formatOrderMediaCountText(count, emptyLabel) {
          const normalized = Math.max(0, Number(count) || 0);
          if (normalized === 0) return String(emptyLabel || "");
          if (normalized === 1) return "1 файл";
          if (normalized >= 2 && normalized <= 4) return String(normalized) + " файла";
          return String(normalized) + " файлов";
        }

        function buildOrderMediaAssetUrl(source, entryId, assetId) {
          const actionUrl =
            source instanceof HTMLElement
              ? source.getAttribute("data-admin-order-completion-action") ||
                source.getAttribute("action") ||
                window.location.href
              : window.location.href;
          const url = new URL(actionUrl, window.location.href);
          url.search = "";
          url.searchParams.set("media", "1");
          url.searchParams.set("entryId", String(entryId || ""));
          url.searchParams.set("asset", String(assetId || ""));
          return url.pathname + url.search;
        }

        function setOrderCompletionFeedback(panel, tone, message) {
          const feedback = panel.querySelector("[data-admin-order-completion-feedback]");
          if (!(feedback instanceof HTMLElement)) return;
          const isError = tone === "error";
          feedback.className = "admin-alert " + (isError ? "admin-alert-error" : "admin-alert-info") + " admin-order-completion-feedback";
          feedback.textContent = String(message || "");
          feedback.hidden = !message;
        }

        function setOrderCleanerCommentFeedback(panel, tone, message) {
          const feedback = panel.querySelector("[data-admin-order-cleaner-comment-feedback]");
          if (!(feedback instanceof HTMLElement)) return;
          const isError = tone === "error";
          feedback.className = "admin-alert " + (isError ? "admin-alert-error" : "admin-alert-info") + " admin-order-cleaner-comment-feedback";
          feedback.textContent = String(message || "");
          feedback.hidden = !message;
        }

        function setOrderCompletionPending(panel, pending) {
          const submitButton = panel.querySelector("[data-admin-order-completion-submit]");
          if (submitButton instanceof HTMLButtonElement) {
            const defaultLabel = submitButton.getAttribute("data-admin-default-label") || submitButton.textContent || "Сохранить фото";
            submitButton.setAttribute("data-admin-default-label", defaultLabel);
            submitButton.disabled = Boolean(pending);
            submitButton.textContent = pending ? "Сохраняем..." : defaultLabel;
          }
          panel.setAttribute("aria-busy", pending ? "true" : "false");
        }

        function setOrderCleanerCommentPending(panel, pending) {
          const submitButton = panel.querySelector("[data-admin-order-cleaner-comment-submit]");
          if (submitButton instanceof HTMLButtonElement) {
            const defaultLabel = submitButton.getAttribute("data-admin-default-label") || submitButton.textContent || "Сохранить комментарий";
            submitButton.setAttribute("data-admin-default-label", defaultLabel);
            submitButton.disabled = Boolean(pending);
            submitButton.textContent = pending ? "Сохраняем..." : defaultLabel;
          }
          panel.setAttribute("aria-busy", pending ? "true" : "false");
        }

        function buildOrderCompletionRequest(panel) {
          const formData = new FormData();
          let hasSelectedFiles = false;
          const entryId = panel.getAttribute("data-admin-order-completion-entry-id") || "";
          const returnTo = panel.getAttribute("data-admin-order-completion-return-to") || "";

          formData.append("action", "save-order-completion");
          formData.append("entryId", entryId);
          formData.append("returnTo", returnTo);

          panel.querySelectorAll('input[type="file"][name]').forEach((input) => {
            if (!(input instanceof HTMLInputElement) || !input.name) return;
            const files = Array.from(input.files || []).filter((file) => file && (file.size > 0 || String(file.name || "").trim()));
            if (files.length === 0) return;

            hasSelectedFiles = true;
            files.forEach((file) => {
              formData.append(input.name, file, file.name || "upload");
            });
          });

          if (!hasSelectedFiles) return null;

          return {
            actionUrl: panel.getAttribute("data-admin-order-completion-action") || window.location.href,
            body: formData,
            headers: {
              Accept: "application/json",
              "x-shynli-admin-ajax": "1",
            },
          };
        }

        function updateOrderCompletionMedia(section, source, entryId, kind, assets) {
          if (!(section instanceof HTMLElement)) return;
          const mediaBody = section.querySelector('[data-admin-order-media-body][data-admin-order-media-kind="' + kind + '"]');
          if (!(mediaBody instanceof HTMLElement)) return;
          const panel = mediaBody.closest(".admin-order-media-panel");
          const copyNode = panel ? panel.querySelector("[data-admin-order-media-copy]") : null;
          const title = mediaBody.getAttribute("data-admin-order-media-title") || "";
          const emptyLabel = mediaBody.getAttribute("data-admin-order-media-empty-label") || "";
          const items = Array.isArray(assets) ? assets : [];

          if (copyNode instanceof HTMLElement) {
            copyNode.textContent = formatOrderMediaCountText(items.length, emptyLabel);
          }

          if (items.length === 0) {
            mediaBody.innerHTML = '<div class="admin-order-media-empty">' + escapeAdminHtml(emptyLabel) + "</div>";
            return;
          }

          mediaBody.innerHTML =
            '<div class="admin-order-media-file-list">' +
            items
              .map((asset, index) => {
                const assetId = String(asset && asset.id ? asset.id : "").trim();
                const fileName = String(asset && asset.fileName ? asset.fileName : title + " " + String(index + 1));
                const mediaUrl = buildOrderMediaAssetUrl(source, entryId, assetId);
                return (
                  '<article class="admin-order-media-file">' +
                  '<span class="admin-order-media-file-icon" aria-hidden="true">IMG</span>' +
                  '<div class="admin-order-media-file-copy"><strong>' +
                  escapeAdminHtml(fileName) +
                  "</strong><span>" +
                  escapeAdminHtml(title + " " + String(index + 1)) +
                  '</span></div><a class="admin-order-media-view-button" href="' +
                  escapeAdminHtml(mediaUrl) +
                  '" target="_blank" rel="noreferrer">Посмотреть</a></article>'
                );
              })
              .join("") +
            "</div>";
        }

        function applyOrderCompletionPayload(panel, payload) {
          if (!(panel instanceof HTMLElement) || !payload || !payload.completion) return;
          const section = panel.closest(".admin-order-cleaner-section");
          const entryId = panel.getAttribute("data-admin-order-completion-entry-id") || "";
          const completion = payload.completion;

          panel.querySelectorAll('input[type="file"]').forEach((input) => {
            if (input instanceof HTMLInputElement) {
              input.value = "";
            }
          });

          if (section instanceof HTMLElement) {
            updateOrderCompletionMedia(section, panel, entryId, "before", completion.beforePhotos);
            updateOrderCompletionMedia(section, panel, entryId, "after", completion.afterPhotos);
            const commentField = section.querySelector('[data-admin-order-cleaner-comment-panel] textarea[name="cleanerComment"]');
            if (commentField instanceof HTMLTextAreaElement) {
              commentField.value = String(completion.cleanerComment || "");
            }
            const updatedAtNode = section.querySelector("[data-admin-order-completion-updated-at]");
            if (updatedAtNode instanceof HTMLElement) {
              if (completion.updatedAtLabel) {
                updatedAtNode.textContent = "Обновлено " + String(completion.updatedAtLabel);
                updatedAtNode.classList.remove("admin-action-hint-hidden");
              } else {
                updatedAtNode.textContent = "";
                updatedAtNode.classList.add("admin-action-hint-hidden");
              }
            }
          }

          setOrderCompletionFeedback(panel, "info", payload.message || "Фото сохранены.");
        }

        function buildOrderCleanerCommentRequest(panel) {
          const textarea = panel.querySelector('textarea[name="cleanerComment"]');
          const payload = {};
          payload.action = "save-order-cleaner-comment";
          payload.entryId = panel.getAttribute("data-admin-order-cleaner-comment-entry-id") || "";
          payload.returnTo = panel.getAttribute("data-admin-order-cleaner-comment-return-to") || "";
          payload.cleanerComment = textarea instanceof HTMLTextAreaElement ? textarea.value : "";
          return {
            actionUrl: panel.getAttribute("data-admin-order-cleaner-comment-action") || window.location.href,
            body: JSON.stringify(payload),
            headers: {
              Accept: "application/json",
              "x-shynli-admin-ajax": "1",
              "Content-Type": "application/json;charset=UTF-8",
            },
          };
        }

        function applyOrderCleanerCommentPayload(panel, payload) {
          if (!(panel instanceof HTMLElement) || !payload || !payload.completion) return;
          const section = panel.closest(".admin-order-cleaner-section");
          const textarea = panel.querySelector('textarea[name="cleanerComment"]');
          if (textarea instanceof HTMLTextAreaElement) {
            textarea.value = String(payload.completion.cleanerComment || "");
          }
          if (section instanceof HTMLElement) {
            const updatedAtNode = section.querySelector("[data-admin-order-completion-updated-at]");
            if (updatedAtNode instanceof HTMLElement) {
              if (payload.completion.updatedAtLabel) {
                updatedAtNode.textContent = "Обновлено " + String(payload.completion.updatedAtLabel);
                updatedAtNode.classList.remove("admin-action-hint-hidden");
              } else {
                updatedAtNode.textContent = "";
                updatedAtNode.classList.add("admin-action-hint-hidden");
              }
            }
          }
          setOrderCleanerCommentFeedback(panel, "info", payload.message || "Комментарий клинера сохранён.");
        }

        function resetAdminFields(scope) {
          if (!scope || typeof scope.querySelectorAll !== "function") return;
          scope.querySelectorAll("[data-admin-reset-value]").forEach((field) => {
            if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement) && !(field instanceof HTMLSelectElement)) {
              return;
            }
            field.value = field.getAttribute("data-admin-reset-value") || "";
          });
        }

        function setOrderAmountEditorState(panelId, expanded) {
          if (!panelId) return;
          document.querySelectorAll("[data-admin-order-amount-editor]").forEach((panel) => {
            if (panel.getAttribute("data-admin-order-amount-editor") === panelId) {
              panel.hidden = !expanded;
            }
          });
          document.querySelectorAll("[data-admin-order-amount-edit-trigger]").forEach((button) => {
            if (button.getAttribute("data-admin-order-amount-edit-trigger") === panelId) {
              button.hidden = expanded;
            }
          });
          document.querySelectorAll("[data-admin-order-amount-action-for]").forEach((button) => {
            if (button.getAttribute("data-admin-order-amount-action-for") === panelId) {
              button.hidden = !expanded;
            }
          });
        }

        function closeOrderAmountEditor(panelId, options = {}) {
          if (!panelId) return;
          const panel = document.querySelector('[data-admin-order-amount-editor="' + panelId + '"]');
          if (panel && options.reset !== false) {
            resetAdminFields(panel);
          }
          setOrderAmountEditorState(panelId, false);
        }

        function resetOrderAmountEditors(scope, options = {}) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-order-amount-editor]").forEach((panel) => {
            closeOrderAmountEditor(panel.getAttribute("data-admin-order-amount-editor"), options);
          });
        }

        function syncOrderAmountEditors(scope) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-order-amount-editor]").forEach((panel) => {
            const panelId = panel.getAttribute("data-admin-order-amount-editor");
            if (!panelId) return;
            setOrderAmountEditorState(panelId, !panel.hidden);
          });
        }

        function setOrderPaymentEditorState(panelId, expanded) {
          if (!panelId) return;
          document.querySelectorAll("[data-admin-order-payment-editor]").forEach((panel) => {
            if (panel.getAttribute("data-admin-order-payment-editor") === panelId) {
              panel.hidden = !expanded;
            }
          });
          document.querySelectorAll("[data-admin-order-payment-edit-trigger]").forEach((button) => {
            if (button.getAttribute("data-admin-order-payment-edit-trigger") === panelId) {
              button.hidden = expanded;
            }
          });
          document.querySelectorAll("[data-admin-order-payment-action-for]").forEach((button) => {
            if (button.getAttribute("data-admin-order-payment-action-for") === panelId) {
              button.hidden = !expanded;
            }
          });
        }

        function closeOrderPaymentEditor(panelId, options = {}) {
          if (!panelId) return;
          const panel = document.querySelector('[data-admin-order-payment-editor="' + panelId + '"]');
          if (panel && options.reset !== false) {
            const form = panel.closest("form");
            if (form && typeof form.reset === "function") {
              form.reset();
            }
          }
          setOrderPaymentEditorState(panelId, false);
        }

        function resetOrderPaymentEditors(scope, options = {}) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-order-payment-editor]").forEach((panel) => {
            closeOrderPaymentEditor(panel.getAttribute("data-admin-order-payment-editor"), options);
          });
        }

        function syncOrderPaymentEditors(scope) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-order-payment-editor]").forEach((panel) => {
            const panelId = panel.getAttribute("data-admin-order-payment-editor");
            if (!panelId) return;
            setOrderPaymentEditorState(panelId, !panel.hidden);
          });
        }

        function setOrderTeamEditorState(panelId, expanded) {
          if (!panelId) return;
          document.querySelectorAll("[data-admin-order-team-editor]").forEach((panel) => {
            if (panel.getAttribute("data-admin-order-team-editor") === panelId) {
              panel.hidden = !expanded;
            }
          });
          document.querySelectorAll("[data-admin-order-team-edit-trigger]").forEach((button) => {
            if (button.getAttribute("data-admin-order-team-edit-trigger") === panelId) {
              button.hidden = expanded;
            }
          });
          document.querySelectorAll("[data-admin-order-team-action-for]").forEach((button) => {
            if (button.getAttribute("data-admin-order-team-action-for") === panelId) {
              button.hidden = !expanded;
            }
          });
        }

        function closeOrderTeamEditor(panelId, options = {}) {
          if (!panelId) return;
          const panel = document.querySelector('[data-admin-order-team-editor="' + panelId + '"]');
          if (panel && options.reset !== false) {
            const form = panel.closest("form");
            if (form && typeof form.reset === "function") {
              form.reset();
            }
            panel.querySelectorAll("[data-admin-order-multiselect]").forEach((details) => {
              closeOrderMultiselect(details);
              syncOrderMultiselectValue(details);
            });
          }
          setOrderTeamEditorState(panelId, false);
        }

        function resetOrderTeamEditors(scope, options = {}) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-order-team-editor]").forEach((panel) => {
            closeOrderTeamEditor(panel.getAttribute("data-admin-order-team-editor"), options);
          });
        }

        function syncOrderTeamEditors(scope) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          targetScope.querySelectorAll("[data-admin-order-team-editor]").forEach((panel) => {
            const panelId = panel.getAttribute("data-admin-order-team-editor");
            if (!panelId) return;
            setOrderTeamEditorState(panelId, !panel.hidden);
          });
        }`;

module.exports = {
  ADMIN_SHARED_ORDER_COMPLETION_AND_EDITOR_SCRIPT,
};
