"use strict";

const {
  getCleanerConfirmationDisplay,
} = require("../../cleaner-confirmation");

function createOrdersFunnelUi(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    formatCurrencyAmount,
    getOrderAssignedLabel,
    getOrderDialogId,
    normalizeOrderStatus,
    normalizeString,
    renderAdminBadge,
    renderOrderStatusBadge,
  } = deps;

  function getOrderFunnelStatus(order) {
    const orderStatus = normalizeOrderStatus(order && order.orderStatus, "new");
    const policyAcceptance =
      order && order.policyAcceptance && typeof order.policyAcceptance === "object"
        ? order.policyAcceptance
        : {};
    const hasSentPolicyInvite = Boolean(
      normalizeString(policyAcceptance.sentAt, 80) ||
        normalizeString(policyAcceptance.firstViewedAt, 80) ||
        normalizeString(policyAcceptance.lastViewedAt, 80) ||
        normalizeString(policyAcceptance.signedAt, 80)
    );
    if (orderStatus === "scheduled" && hasSentPolicyInvite && !policyAcceptance.policyAccepted) {
      return "policy";
    }
    return orderStatus;
  }

  function renderOrderFunnelStatusBadge(status) {
    if (normalizeString(status, 40).toLowerCase() === "policy") {
      return renderAdminBadge("Политика", "outline");
    }
    return renderOrderStatusBadge(status);
  }

  function renderOrderCleanerConfirmationBadge(meta) {
    if (!meta) return "";
    return renderAdminBadge(meta.label, meta.tone);
  }

  function getOrderLaneMeta(status) {
    if (normalizeString(status, 40).toLowerCase() === "policy") {
      return {
        title: "Политика",
        description: "Клиенту уже отправлена ссылка по SMS или email, и сейчас ждём подписание политики.",
      };
    }
    const normalized = normalizeOrderStatus(status, "new");
    if (normalized === "scheduled") {
      return {
        title: "Запланировано",
        description: "Подтверждённые заказы с назначенным окном визита и отметкой, подтвердил ли клинер этот выезд.",
      };
    }
    if (normalized === "en-route") {
      return {
        title: "В пути",
        description: "Клинер уже выехал на заказ, и команда видит это как отдельный этап перед началом уборки.",
      };
    }
    if (normalized === "cleaning-started") {
      return {
        title: "Начать уборку",
        description: "Клинер уже на месте и отметил старт уборки.",
      };
    }
    if (normalized === "checklist") {
      return {
        title: "Чеклист",
        description: "Идёт этап чеклиста перед финальной фиксацией результата.",
      };
    }
    if (normalized === "photos") {
      return {
        title: "Фото",
        description: "Клинер перешёл к фото-этапу и фиксирует результат уборки.",
      };
    }
    if (normalized === "cleaning-complete") {
      return {
        title: "Уборка завершена",
        description: "Клинер отметил, что уборка завершена, и дальше команда может переходить к финансовым шагам.",
      };
    }
    if (normalized === "invoice-sent") {
      return {
        title: "Инвойс отправлен",
        description: "Работа завершена, клиенту уже отправлен инвойс и ждём оплату.",
      };
    }
    if (normalized === "paid") {
      return {
        title: "Оплачено",
        description: "Инвойс оплачен, осталось дождаться отзыва или финального закрытия.",
      };
    }
    if (normalized === "awaiting-review") {
      return {
        title: "Ждем отзыв",
        description: "Оплата уже получена, теперь команда ждёт отзыв клиента по выполненной работе.",
      };
    }
    if (normalized === "completed") {
      return {
        title: "Завершено",
        description: "Выполненные заказы, которые уже можно не держать в фокусе.",
      };
    }
    if (normalized === "canceled") {
      return {
        title: "Отменено",
        description: "Отменённые заказы, оставленные для истории.",
      };
    }
    if (normalized === "rescheduled") {
      return {
        title: "Перенесено",
        description: "Заказы, где дата или время уже менялись и нужен повторный контроль.",
      };
    }
    return {
      title: "Новые",
      description: "Новые обращения, которые нужно быстро разобрать и назначить.",
    };
  }

  function renderOrdersLane(status, laneOrders, returnTo, planningByEntryId, staffRecords = [], options = {}) {
    const meta = getOrderLaneMeta(status);
    const droppable = options.droppable !== false;
    return `<section class="admin-order-funnel-column admin-order-funnel-column-${escapeHtmlAttribute(status)}" data-order-funnel-lane="${escapeHtmlAttribute(status)}">
      <div class="admin-order-funnel-head">
        <div>
          <h2 class="admin-order-funnel-title">${escapeHtml(meta.title)}</h2>
          <p class="admin-order-funnel-copy">${escapeHtml(meta.description)}</p>
        </div>
        <div class="admin-order-funnel-meta">
          <span data-order-funnel-count="true">${renderAdminBadge(String(laneOrders.length), "outline")}</span>
        </div>
      </div>
      <div class="admin-order-funnel-list"${droppable ? ` data-order-dropzone="${escapeHtmlAttribute(status)}"` : ""} data-order-funnel-list="true">
        ${laneOrders
          .map((order) =>
            renderOrderFunnelCard(order, returnTo, {
              planningItem: planningByEntryId.get(order.id) || null,
              canEdit: options.canEdit,
            })
          )
          .join("") || `<div class="admin-order-funnel-empty">В этой колонке пока нет заказов.</div>`}
      </div>
    </section>`;
  }

  function renderOrderFunnelCard(order, returnTo, options = {}) {
    const planningItem = options.planningItem || null;
    const canEdit = options.canEdit !== false;
    const dialogId = getOrderDialogId(order.id);
    const funnelStatus = getOrderFunnelStatus(order);
    const assignedLabel = getOrderAssignedLabel(order, planningItem);
    const cleanerConfirmationMeta =
      funnelStatus === "scheduled" && planningItem && planningItem.assignment
        ? getCleanerConfirmationDisplay(planningItem.entry || order, planningItem.assignment)
        : null;
    const topBadge = order.needsAttention
      ? renderAdminBadge("CRM", "danger")
      : order.frequency
        ? renderAdminBadge(order.frequencyLabel, "outline")
        : "";

    return `<article
      class="admin-order-funnel-card admin-order-funnel-card-${escapeHtmlAttribute(funnelStatus)}"
      data-order-funnel-card="true"
      data-order-funnel-status="${escapeHtmlAttribute(funnelStatus)}"
      data-order-entry-id="${escapeHtmlAttribute(order.id)}"
      tabindex="0"
      data-admin-dialog-row="true"
      data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
      draggable="${canEdit ? "true" : "false"}"
      aria-label="${escapeHtmlAttribute(`Открыть карточку заказа ${order.customerName || "Клиент"}`)}"
    >
      <div class="admin-order-funnel-card-top">
        <div class="admin-order-funnel-card-title-block">
          <h3 class="admin-order-funnel-card-title">${escapeHtml(order.customerName || "Клиент")}</h3>
          <p class="admin-order-funnel-card-copy">${escapeHtml(order.serviceLabel)} • ${escapeHtml(order.requestId || "Номер не указан")}</p>
        </div>
        ${topBadge ? `<div class="admin-order-funnel-card-badge">${topBadge}</div>` : ""}
      </div>
      <div class="admin-order-funnel-card-details">
        <div class="admin-order-funnel-card-detail">
          <p class="admin-order-funnel-card-detail-label">Дата</p>
          <p class="admin-order-funnel-card-detail-value">${escapeHtml(order.scheduleLabel)}</p>
        </div>
        <div class="admin-order-funnel-card-detail">
          <p class="admin-order-funnel-card-detail-label">Команда</p>
          <p class="admin-order-funnel-card-detail-value${!order.isAssigned ? " admin-order-funnel-card-detail-value-danger" : ""}">${escapeHtml(assignedLabel)}</p>
        </div>
        <div class="admin-order-funnel-card-detail">
          <p class="admin-order-funnel-card-detail-label">Сумма</p>
          <p class="admin-order-funnel-card-detail-value">${escapeHtml(formatCurrencyAmount(order.totalPrice))}</p>
        </div>
        <div class="admin-order-funnel-card-detail">
          <p class="admin-order-funnel-card-detail-label">Оплата</p>
          <p class="admin-order-funnel-card-detail-value">${escapeHtml(order.paymentStatusLabel)}</p>
        </div>
      </div>
      <div class="admin-order-funnel-card-stage">
        <div data-order-card-stage="true">${renderOrderFunnelStatusBadge(funnelStatus)}</div>
        ${planningItem && planningItem.assignment
          ? `<div data-order-cleaner-confirmation="true"${cleanerConfirmationMeta ? "" : " hidden"}>
              ${renderOrderCleanerConfirmationBadge(cleanerConfirmationMeta)}
            </div>`
          : ""}
      </div>
      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
    </article>`;
  }

  function renderOrdersFunnelScript(currentReturnTo, canEdit) {
    if (!canEdit) return "";

    return `<script>
      (() => {
        const stageForm = document.querySelector('[data-order-funnel-stage-form="true"]');
        const stageEntryInput = stageForm ? stageForm.querySelector('input[name="entryId"]') : null;
        const stageStatusInput = stageForm ? stageForm.querySelector('input[name="orderStatus"]') : null;
        const stageReturnInput = stageForm ? stageForm.querySelector('input[name="returnTo"]') : null;
        if (!stageForm || !stageEntryInput || !stageStatusInput || !stageReturnInput) return;

        let draggedCard = null;
        const statusClasses = [
          "new",
          "policy",
          "scheduled",
          "en-route",
          "rescheduled",
          "cleaning-started",
          "checklist",
          "photos",
          "cleaning-complete",
          "invoice-sent",
          "paid",
          "awaiting-review",
          "completed",
          "canceled",
        ];

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

        function getOrderBadgeMeta(status) {
          const normalized = String(status || "new");
          if (normalized === "policy") return { label: "Политика", tone: "outline" };
          if (normalized === "completed") return { label: "Завершено", tone: "success" };
          if (normalized === "canceled") return { label: "Отменено", tone: "danger" };
          if (normalized === "paid") return { label: "Оплачено", tone: "success" };
          if (normalized === "awaiting-review") return { label: "Ждем отзыв", tone: "default" };
          if (normalized === "invoice-sent") return { label: "Инвойс отправлен", tone: "outline" };
          if (normalized === "cleaning-complete") return { label: "Уборка завершена", tone: "success" };
          if (normalized === "photos") return { label: "Фото", tone: "outline" };
          if (normalized === "checklist") return { label: "Чеклист", tone: "outline" };
          if (normalized === "cleaning-started") return { label: "Начать уборку", tone: "default" };
          if (normalized === "rescheduled") return { label: "Перенесено", tone: "outline" };
          if (normalized === "en-route") return { label: "В пути", tone: "default" };
          if (normalized === "scheduled") return { label: "Запланировано", tone: "outline" };
          return { label: "Новые", tone: "muted" };
        }

        function findLane(status) {
          return Array.from(document.querySelectorAll("[data-order-funnel-lane]")).find(
            (lane) => lane.getAttribute("data-order-funnel-lane") === status
          ) || null;
        }

        function refreshLaneUi(lane) {
          if (!lane) return;
          const list = lane.querySelector('[data-order-funnel-list="true"]');
          const countTarget = lane.querySelector('[data-order-funnel-count="true"]');
          if (countTarget && list) {
            const count = list.querySelectorAll('[data-order-funnel-card="true"]').length;
            countTarget.replaceChildren(createBadge(String(count), "outline"));
          }
          if (!list) return;
          const hasCards = list.querySelector('[data-order-funnel-card="true"]');
          const emptyState = list.querySelector(".admin-order-funnel-empty");
          if (hasCards && emptyState) {
            emptyState.remove();
          } else if (!hasCards && !emptyState) {
            const placeholder = document.createElement("div");
            placeholder.className = "admin-order-funnel-empty";
            placeholder.textContent = "В этой колонке пока нет заказов.";
            list.appendChild(placeholder);
          }
        }

        function moveCardToLane(card, lane) {
          const list = lane ? lane.querySelector('[data-order-funnel-list="true"]') : null;
          if (!card || !list) return;
          const emptyState = list.querySelector(".admin-order-funnel-empty");
          if (emptyState) emptyState.remove();
          list.prepend(card);
        }

        function applyOrderPayloadToCard(card, payload) {
          if (!card || !payload || !payload.order) return;
          const status = String(payload.order.funnelStatus || payload.order.orderStatus || "new");
          const badgeMeta = getOrderBadgeMeta(status);
          const stageTarget = card.querySelector('[data-order-card-stage="true"]');
          const cleanerTarget = card.querySelector('[data-order-cleaner-confirmation="true"]');
          card.setAttribute("data-order-funnel-status", status);
          statusClasses.forEach((value) => card.classList.remove("admin-order-funnel-card-" + value));
          card.classList.add("admin-order-funnel-card-" + status);
          if (stageTarget) {
            stageTarget.replaceChildren(createBadge(badgeMeta.label, badgeMeta.tone));
          }
          if (cleanerTarget) {
            const cleanerLabel = String(payload.order.cleanerConfirmationLabel || "");
            const cleanerTone = String(payload.order.cleanerConfirmationTone || "outline");
            const showCleanerConfirmation =
              Boolean(payload.order.showCleanerConfirmation) && cleanerLabel;
            cleanerTarget.hidden = !showCleanerConfirmation;
            if (showCleanerConfirmation) {
              cleanerTarget.replaceChildren(createBadge(cleanerLabel, cleanerTone));
            } else {
              cleanerTarget.replaceChildren();
            }
          }
        }

        async function submitOrderStageChange(formData) {
          const response = await fetch(${JSON.stringify(ADMIN_ORDERS_PATH)}, {
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
            throw new Error(payload && payload.message ? payload.message : "Не удалось сохранить новый статус заказа.");
          }
          return payload;
        }

        document.querySelectorAll('[data-order-funnel-card="true"]').forEach((card) => {
          if (card.getAttribute("draggable") !== "true") return;
          card.addEventListener("dragstart", () => {
            draggedCard = card;
            card.classList.add("is-dragging");
          });
          card.addEventListener("dragend", () => {
            card.classList.remove("is-dragging");
          });
        });

        document.querySelectorAll("[data-order-dropzone]").forEach((list) => {
          const lane = list.closest(".admin-order-funnel-column");
          list.addEventListener("dragover", (event) => {
            if (!draggedCard) return;
            event.preventDefault();
            if (lane) lane.setAttribute("data-drop-active", "true");
          });
          list.addEventListener("dragleave", () => {
            if (lane) lane.removeAttribute("data-drop-active");
          });
          list.addEventListener("drop", async (event) => {
            if (!draggedCard || !lane) return;
            event.preventDefault();
            lane.removeAttribute("data-drop-active");
            const nextStatus = list.getAttribute("data-order-dropzone");
            const entryId = draggedCard.getAttribute("data-order-entry-id") || "";
            const previousStatus = draggedCard.getAttribute("data-order-funnel-status") || "";
            const returnTo = draggedCard.querySelector('input[name="returnTo"]')?.value || ${JSON.stringify(currentReturnTo)};
            if (!nextStatus || !entryId || nextStatus === previousStatus) {
              draggedCard = null;
              return;
            }

            const card = draggedCard;
            const sourceLane = card.closest(".admin-order-funnel-column");
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
              const payload = await submitOrderStageChange(new FormData(stageForm));
              applyOrderPayloadToCard(card, payload);
              const resolvedLane = findLane(String(payload && payload.order && (payload.order.funnelStatus || payload.order.orderStatus) || nextStatus));
              if (resolvedLane && resolvedLane !== lane) {
                moveCardToLane(card, resolvedLane);
                refreshLaneUi(lane);
                refreshLaneUi(resolvedLane);
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
              window.alert(error && error.message ? error.message : "Не удалось сохранить новый статус заказа.");
            } finally {
              card.classList.remove("is-saving");
              card.classList.remove("is-dragging");
              draggedCard = null;
            }
          });
        });
      })();
    </script>`;
  }

  function renderOrdersFunnelStyle() {
    return `<style>
      .admin-orders-funnel-section {
        display: grid;
        gap: 14px;
        padding-top: 10px;
        border-top: 1px solid rgba(228, 228, 231, 0.88);
      }
      .admin-order-funnel-board {
        display: flex;
        flex-wrap: nowrap;
        gap: 16px;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 6px;
        align-items: stretch;
      }
      .admin-order-funnel-column {
        flex: 0 0 248px;
        min-width: 248px;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: rgba(255,255,255,0.88);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: clamp(340px, 50vh, 640px);
      }
      .admin-order-funnel-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: 12px;
        min-height: 96px;
      }
      .admin-order-funnel-title { margin: 4px 0 0; font-size: 18px; }
      .admin-order-funnel-copy { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
      .admin-order-funnel-list { display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; min-height: 140px; }
      .admin-order-funnel-column[data-drop-active="true"] { border-color: rgba(59, 130, 246, 0.42); background: rgba(239, 246, 255, 0.82); }
      .admin-order-funnel-card {
        border: 1px solid rgba(158, 67, 90, 0.14);
        border-radius: 16px;
        padding: 12px;
        background: rgba(255,250,251,0.96);
        display: grid;
        gap: 10px;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
        outline: none;
        min-width: 0;
        overflow: hidden;
        cursor: pointer;
        transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
      }
      .admin-order-funnel-card.is-dragging { opacity: 0.72; box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12); }
      .admin-order-funnel-card.is-saving { pointer-events: none; opacity: 0.82; }
      .admin-order-funnel-card:hover,
      .admin-order-funnel-card:focus-visible,
      .admin-order-funnel-card:focus-within {
        border-color: rgba(158, 67, 90, 0.24);
        background: rgba(255,255,255,0.98);
        box-shadow: 0 10px 26px rgba(158, 67, 90, 0.08);
      }
      .admin-order-funnel-card-policy { background: linear-gradient(180deg, rgba(255, 246, 239, 0.96), rgba(255, 252, 249, 0.99)); }
      .admin-order-funnel-card-en-route { background: linear-gradient(180deg, rgba(239, 246, 255, 0.94), rgba(248, 250, 252, 0.98)); }
      .admin-order-funnel-card-cleaning-started { background: linear-gradient(180deg, rgba(238, 242, 255, 0.94), rgba(248, 250, 252, 0.98)); }
      .admin-order-funnel-card-checklist { background: linear-gradient(180deg, rgba(245, 243, 255, 0.94), rgba(250, 245, 255, 0.98)); }
      .admin-order-funnel-card-photos { background: linear-gradient(180deg, rgba(250, 245, 255, 0.94), rgba(253, 250, 255, 0.98)); }
      .admin-order-funnel-card-cleaning-complete { background: linear-gradient(180deg, rgba(236, 253, 245, 0.94), rgba(247, 254, 249, 0.98)); }
      .admin-order-funnel-card-paid,
      .admin-order-funnel-card-completed { background: linear-gradient(180deg, rgba(240, 253, 250, 0.96), rgba(247, 254, 252, 0.98)); }
      .admin-order-funnel-card-awaiting-review { background: linear-gradient(180deg, rgba(239, 246, 255, 0.92), rgba(248, 250, 252, 0.98)); }
      .admin-order-funnel-card-invoice-sent { background: linear-gradient(180deg, rgba(255, 251, 235, 0.94), rgba(255, 255, 255, 0.98)); }
      .admin-order-funnel-card-canceled {
        border-color: rgba(161, 161, 170, 0.24);
        background: linear-gradient(180deg, rgba(250, 250, 250, 0.98), rgba(244, 244, 245, 0.98));
      }
      .admin-order-funnel-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .admin-order-funnel-card-title-block { min-width: 0; display: grid; gap: 4px; }
      .admin-order-funnel-card-title { margin: 0; font-size: 17px; line-height: 1.12; }
      .admin-order-funnel-card-copy {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-order-funnel-card-badge { flex: 0 0 auto; }
      .admin-order-funnel-card-details { display: grid; gap: 8px; padding-top: 10px; border-top: 1px solid rgba(228, 228, 231, 0.88); }
      .admin-order-funnel-card-detail { display: grid; grid-template-columns: minmax(0, 76px) minmax(0, 1fr); align-items: start; gap: 8px; }
      .admin-order-funnel-card-detail-label {
        margin: 0;
        color: var(--muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .admin-order-funnel-card-detail-value {
        margin: 0;
        color: var(--foreground);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.35;
        min-width: 0;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .admin-order-funnel-card-detail-value-danger { color: var(--danger); }
      .admin-order-funnel-card-stage { display: grid; gap: 8px; min-width: 0; }
      .admin-order-funnel-card-stage > div { min-width: 0; }
      .admin-order-funnel-card-stage .admin-badge {
        display: flex;
        width: 100%;
        min-width: 0;
        justify-content: center;
        text-align: center;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
        line-height: 1.3;
        padding-top: 10px;
        padding-bottom: 10px;
      }
      .admin-order-funnel-empty {
        min-height: 120px;
        border: 1px dashed rgba(212, 212, 216, 0.92);
        border-radius: 16px;
        background: rgba(250, 250, 250, 0.74);
        display: grid;
        place-items: center;
        padding: 16px;
        text-align: center;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .admin-orders-table-wrap-capped { max-height: 34rem; overflow-y: auto; }
      .admin-orders-table-wrap-capped thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: rgba(250, 250, 251, 0.98);
        backdrop-filter: blur(8px);
      }
    </style>`;
  }

  return {
    getOrderFunnelStatus,
    renderOrderFunnelStatusBadge,
    renderOrderFunnelCard,
    renderOrdersFunnelScript,
    renderOrdersFunnelStyle,
    renderOrdersLane,
  };
}

module.exports = {
  createOrdersFunnelUi,
};
