"use strict";

function createOrdersPageRenderer(deps = {}) {
  const {
    ADMIN_MANUAL_ORDER_DIALOG_ID,
    ADMIN_ORDERS_PATH,
    QUOTE_OPS_LEDGER_LIMIT,
    buildAdminRedirectPath,
    buildStaffPlanningContext,
    collectNonAssignableStaffIds,
    countOrdersByStatus,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
    filterAdminOrderRecords,
    filterOrderAssignedStaffNames,
    filterStaffSnapshotByHiddenStaffIds,
    formatCurrencyAmount,
    getOrderAssignedLabel,
    getOrderDialogId,
    getOrdersFilters,
    getProjectedOrderRecords,
    getRequestUrl,
    getWorkspaceAccessContext,
    normalizeOrderStatus,
    normalizeString,
    renderAdminAppSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminHiddenInput,
    renderAdminLayout,
    renderCreateManualOrderDialog,
    renderOrderManagementDialog,
    renderOrderPaymentStatusBadge,
    renderOrderStatusBadge,
    renderOrderTableRow,
    renderQuoteOpsStatusBadge,
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
        description: "Подтверждённые заказы с назначенным окном визита.",
      };
    }
    if (normalized === "in-progress") {
      return {
        title: "В работе",
        description: "Заказы, которые уже выполняются и требуют оперативного контроля.",
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

  function renderOrdersNotice(req) {
    const reqUrl = getRequestUrl(req);
    const notice = normalizeString(reqUrl.searchParams.get("notice"), 80).toLowerCase();
    if (notice === "order-created") {
      return `<div class="admin-alert admin-alert-info">Заказ создан из подтверждённой заявки.</div>`;
    }
    if (notice === "manual-order-created") {
      return `<div class="admin-alert admin-alert-info">Заказ добавлен вручную.</div>`;
    }
    if (notice === "order-saved") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён.</div>`;
    }
    if (notice === "order-saved-policy-email-sent") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён, письмо с подтверждением политик отправлено клиенту.</div>`;
    }
    if (notice === "order-saved-calendar-policy-email-sent") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён, письмо с подтверждением политик отправлено клиенту, но синхронизация Google Calendar не обновилась.</div>`;
    }
    if (notice === "order-saved-policy-email-unavailable") {
      return `<div class="admin-alert admin-alert-error">Заказ обновлён, но автоматическая отправка письма с подтверждением политик сейчас не настроена.</div>`;
    }
    if (notice === "order-saved-policy-sms-sent") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён, ссылка на подтверждение политик отправлена клиенту по SMS. Email для этого заказа не указан.</div>`;
    }
    if (notice === "order-saved-policy-email-missing-recipient") {
      return `<div class="admin-alert admin-alert-error">Заказ обновлён, но у клиента не указан email для письма с подтверждением политик.</div>`;
    }
    if (notice === "order-saved-policy-email-failed") {
      return `<div class="admin-alert admin-alert-error">Заказ обновлён, но письмо с подтверждением политик не удалось отправить.</div>`;
    }
    if (notice === "order-saved-calendar-policy-sms-sent") {
      return `<div class="admin-alert admin-alert-info">Заказ обновлён, ссылка на подтверждение политик отправлена клиенту по SMS, но синхронизация Google Calendar не обновилась.</div>`;
    }
    if (notice === "order-saved-calendar-policy-email-error") {
      return `<div class="admin-alert admin-alert-error">Заказ обновлён, но письмо с подтверждением политик не удалось отправить, и синхронизация Google Calendar тоже не обновилась.</div>`;
    }
    if (notice === "order-policy-resent") {
      return `<div class="admin-alert admin-alert-info">Ссылка на подтверждение политик отправлена повторно по email и SMS. Новый срок действия ссылки — 48 часов.</div>`;
    }
    if (notice === "order-policy-resent-email-only") {
      return `<div class="admin-alert admin-alert-info">Ссылка на подтверждение политик отправлена повторно по email. SMS не удалось отправить, но ссылка уже продлена ещё на 48 часов.</div>`;
    }
    if (notice === "order-policy-resent-sms-only") {
      return `<div class="admin-alert admin-alert-info">Ссылка на подтверждение политик отправлена повторно по SMS. Email у клиента не указан, ссылка уже продлена ещё на 48 часов.</div>`;
    }
    if (notice === "order-policy-resend-unavailable") {
      return `<div class="admin-alert admin-alert-error">Повторная отправка не сработала: email для policy acceptance сейчас не настроен.</div>`;
    }
    if (notice === "order-policy-resend-missing-recipient") {
      return `<div class="admin-alert admin-alert-error">Повторная отправка не сработала: у клиента не указан email.</div>`;
    }
    if (notice === "order-policy-resend-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось отправить ссылку на подтверждение политик повторно.</div>`;
    }
    if (notice === "order-policy-already-signed") {
      return `<div class="admin-alert admin-alert-info">Политика уже подписана. Повторная отправка ссылки не требуется.</div>`;
    }
    if (notice === "order-policy-reset") {
      return `<div class="admin-alert admin-alert-info">Подтверждение политик сброшено. Заказ можно отправить на подтверждение заново.</div>`;
    }
    if (notice === "order-deleted") {
      return `<div class="admin-alert admin-alert-info">Заказ удалён.</div>`;
    }
    if (notice === "order-missing") {
      return `<div class="admin-alert admin-alert-error">Заказ не найден.</div>`;
    }
    if (notice === "manual-order-invalid") {
      return `<div class="admin-alert admin-alert-error">Чтобы добавить заказ вручную, заполните имя клиента, телефон и адрес.</div>`;
    }
    if (notice === "order-save-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить заказ. Попробуйте ещё раз.</div>`;
    }
    if (notice === "order-saved-calendar-error") {
      return `<div class="admin-alert admin-alert-error">Заказ сохранён, но синхронизация Google Calendar не обновилась. Проверьте подключение сотрудника.</div>`;
    }
    if (notice === "order-delete-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось удалить заказ. Попробуйте ещё раз.</div>`;
    }
    if (notice === "completion-saved") {
      return `<div class="admin-alert admin-alert-info">Отчёт клинера сохранён.</div>`;
    }
    if (notice === "completion-save-failed") {
      return `<div class="admin-alert admin-alert-error">Не удалось сохранить фото или комментарий клинера. Попробуйте ещё раз.</div>`;
    }
    if (notice === "order-sms-sent") {
      return `<div class="admin-alert admin-alert-info">SMS по заказу отправлена через Go High Level.</div>`;
    }
    if (notice === "order-sms-empty") {
      return `<div class="admin-alert admin-alert-error">Введите текст сообщения перед отправкой SMS.</div>`;
    }
    if (notice === "order-sms-unavailable") {
      return `<div class="admin-alert admin-alert-error">Go High Level сейчас не настроен для отправки SMS.</div>`;
    }
    if (notice === "order-sms-contact-missing" || notice === "order-sms-failed") {
      const smsError = normalizeString(reqUrl.searchParams.get("smsError"), 240);
      return `<div class="admin-alert admin-alert-error">${escapeHtml(smsError || "Не удалось отправить SMS по заказу.")}</div>`;
    }
    return "";
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
      <div class="admin-order-funnel-card-stage" data-order-card-stage="true">${renderOrderFunnelStatusBadge(funnelStatus)}</div>
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
        const statusClasses = ["new", "policy", "scheduled", "in-progress", "rescheduled", "invoice-sent", "paid", "awaiting-review", "completed", "canceled"];

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
          if (normalized === "rescheduled") return { label: "Перенесено", tone: "outline" };
          if (normalized === "in-progress") return { label: "В работе", tone: "default" };
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
          card.setAttribute("data-order-funnel-status", status);
          statusClasses.forEach((value) => card.classList.remove("admin-order-funnel-card-" + value));
          card.classList.add("admin-order-funnel-card-" + status);
          if (stageTarget) {
            stageTarget.replaceChildren(createBadge(badgeMeta.label, badgeMeta.tone));
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

  function renderOrdersOverviewStrip(metrics = []) {
    return `<div class="admin-compact-summary-strip">
      ${metrics
        .map(
          (item) => `<article class="admin-compact-summary-item admin-compact-summary-item-${escapeHtmlAttribute(item.tone || "default")}">
            <div class="admin-compact-summary-head">
              <span class="admin-compact-summary-label">${escapeHtml(item.label)}</span>
              <p class="admin-compact-summary-value">${escapeHtml(String(item.value))}</p>
            </div>
            <p class="admin-compact-summary-copy">${escapeHtml(item.copy)}</p>
          </article>`
        )
        .join("")}
    </div>`;
  }

  function renderOrdersUpcomingTable(upcomingOrders) {
    if (!upcomingOrders.length) {
      return `<div class="admin-empty-state">Пока нет ближайших выездов с датой и временем. Как только в заказах появится график, он подтянется сюда автоматически.</div>`;
    }

    return `<div class="admin-table-wrap admin-orders-table-wrap">
      <table class="admin-table admin-orders-table">
        <thead>
          <tr>
            <th>Заказ</th>
            <th>Дата и время</th>
            <th>Команда</th>
            <th>Адрес</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${upcomingOrders
            .map(({ order, planningItem }) => {
              const dialogId = getOrderDialogId(order.id);
              const assignedLabel = getOrderAssignedLabel(order, planningItem);

              return `<tr
                class="admin-table-row-clickable"
                tabindex="0"
                data-admin-dialog-row="true"
                data-admin-dialog-open="${escapeHtmlAttribute(dialogId)}"
                aria-label="${escapeHtmlAttribute(`Открыть карточку заказа ${order.customerName || "Клиент"}`)}"
              >
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-link">${escapeHtml(order.customerName || "Клиент")}</span>
                    <span class="admin-table-muted">${escapeHtml(order.requestId || "Номер не указан")} • ${escapeHtml(order.serviceLabel)}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-strong">${escapeHtml(planningItem.scheduleLabel || order.scheduleLabel)}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-table-cell-stack">
                    <span class="admin-table-strong">${escapeHtml(assignedLabel)}</span>
                    ${!order.isAssigned ? `<span>${renderAdminBadge("Команда не назначена", "danger")}</span>` : ""}
                  </div>
                </td>
                <td>
                  ${order.fullAddress
                    ? `<div class="admin-table-cell-stack">
                        <span class="admin-line-clamp-two">${escapeHtml(order.fullAddress)}</span>
                      </div>`
                    : `<span class="admin-table-muted">Не указан</span>`}
                </td>
                <td>
                  <div class="admin-inline-badge-row">
                    ${renderOrderStatusBadge(order.orderStatus)}
                    ${renderOrderPaymentStatusBadge(order.paymentStatus)}
                    ${order.needsAttention ? renderQuoteOpsStatusBadge(order.crmStatus) : ""}
                  </div>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
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
      .admin-order-funnel-kicker {
        margin: 0;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .admin-order-funnel-title {
        margin: 4px 0 0;
        font-size: 18px;
      }
      .admin-order-funnel-copy {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }
      .admin-order-funnel-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        flex: 1 1 auto;
        min-height: 140px;
      }
      .admin-order-funnel-column[data-drop-active="true"] {
        border-color: rgba(59, 130, 246, 0.42);
        background: rgba(239, 246, 255, 0.82);
      }
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
      .admin-order-funnel-card.is-dragging {
        opacity: 0.72;
        box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
      }
      .admin-order-funnel-card.is-saving {
        pointer-events: none;
        opacity: 0.82;
      }
      .admin-order-funnel-card:hover,
      .admin-order-funnel-card:focus-visible,
      .admin-order-funnel-card:focus-within {
        border-color: rgba(158, 67, 90, 0.24);
        background: rgba(255,255,255,0.98);
        box-shadow: 0 10px 26px rgba(158, 67, 90, 0.08);
      }
      .admin-order-funnel-card-policy {
        background: linear-gradient(180deg, rgba(255, 246, 239, 0.96), rgba(255, 252, 249, 0.99));
      }
      .admin-order-funnel-card-paid,
      .admin-order-funnel-card-completed {
        background: linear-gradient(180deg, rgba(240, 253, 250, 0.96), rgba(247, 254, 252, 0.98));
      }
      .admin-order-funnel-card-awaiting-review {
        background: linear-gradient(180deg, rgba(239, 246, 255, 0.92), rgba(248, 250, 252, 0.98));
      }
      .admin-order-funnel-card-invoice-sent {
        background: linear-gradient(180deg, rgba(255, 251, 235, 0.94), rgba(255, 255, 255, 0.98));
      }
      .admin-order-funnel-card-canceled {
        border-color: rgba(161, 161, 170, 0.24);
        background: linear-gradient(180deg, rgba(250, 250, 250, 0.98), rgba(244, 244, 245, 0.98));
      }
      .admin-order-funnel-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      .admin-order-funnel-card-title-block {
        min-width: 0;
        display: grid;
        gap: 4px;
      }
      .admin-order-funnel-card-title {
        margin: 0;
        font-size: 17px;
        line-height: 1.12;
      }
      .admin-order-funnel-card-copy {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-order-funnel-card-badge {
        flex: 0 0 auto;
      }
      .admin-order-funnel-card-details {
        display: grid;
        gap: 8px;
        padding-top: 10px;
        border-top: 1px solid rgba(228, 228, 231, 0.88);
      }
      .admin-order-funnel-card-detail {
        display: grid;
        grid-template-columns: minmax(0, 58px) minmax(0, 1fr);
        align-items: start;
        gap: 8px;
      }
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
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .admin-order-funnel-card-detail-value-danger {
        color: var(--danger);
      }
      .admin-order-funnel-card-stage .admin-badge {
        display: flex;
        width: 100%;
        justify-content: center;
        text-align: center;
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
      .admin-orders-table-wrap-capped {
        max-height: 34rem;
        overflow-y: auto;
      }
      .admin-orders-table-wrap-capped thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: rgba(250, 250, 251, 0.98);
        backdrop-filter: blur(8px);
      }
    </style>`;
  }

  async function renderOrdersPage(req, config, quoteOpsLedger, staffStore, adminRuntime = {}) {
    const { reqUrl, filters } = getOrdersFilters(req);
    const allEntries = quoteOpsLedger ? await quoteOpsLedger.listEntries({ limit: QUOTE_OPS_LEDGER_LIMIT }) : [];
    const usersStore = adminRuntime && adminRuntime.usersStore ? adminRuntime.usersStore : null;
    const [staffSnapshot, usersSnapshot] = await Promise.all([
      staffStore ? staffStore.getSnapshot() : Promise.resolve({ staff: [], assignments: [] }),
      usersStore ? usersStore.getSnapshot() : Promise.resolve({ users: [] }),
    ]);
    const hiddenStaffIds = collectNonAssignableStaffIds(usersSnapshot && usersSnapshot.users);
    const hiddenStaffNames = new Set(
      (Array.isArray(staffSnapshot && staffSnapshot.staff) ? staffSnapshot.staff : [])
        .filter((record) => hiddenStaffIds.has(normalizeString(record && record.id, 120)))
        .map((record) => normalizeString(record && record.name, 120).toLowerCase())
        .filter(Boolean)
    );
    const filteredStaffSnapshot = filterStaffSnapshotByHiddenStaffIds(staffSnapshot, hiddenStaffIds);
    const staffRecords = Array.isArray(filteredStaffSnapshot.staff) ? filteredStaffSnapshot.staff : [];
    const planning = buildStaffPlanningContext(allEntries, filteredStaffSnapshot);
    const planningByEntryId = planning.orderItemsByEntryId;
    const projectedOrders = await getProjectedOrderRecords(adminRuntime, allEntries);
    const allOrders = projectedOrders.map((order) => {
      const planningItem = planningByEntryId.get(order.id) || null;
      const visibleAssignedStaff = filterOrderAssignedStaffNames(order.assignedStaff, hiddenStaffNames);
      if (!planningItem) {
        return {
          ...order,
          assignedStaff: visibleAssignedStaff.join(", "),
          isAssigned: visibleAssignedStaff.length > 0,
        };
      }

      const assignedTeamLabel =
        planningItem.assignedStaff.length > 0
          ? planningItem.assignedStaff.map((staffRecord) => staffRecord.name).join(", ")
          : "";

      return {
        ...order,
        assignedStaff: assignedTeamLabel || visibleAssignedStaff.join(", "),
        isAssigned: Boolean(assignedTeamLabel || visibleAssignedStaff.length > 0),
        scheduleLabel: planningItem.scheduleLabel || order.scheduleLabel,
        hasSchedule: planningItem.hasSchedule || order.hasSchedule,
        planningItem,
      };
    });
    const orders = filterAdminOrderRecords(allOrders, filters);
    const totalOrders = allOrders.length;
    const scheduledCount = allOrders.filter((order) => order.hasSchedule).length;
    const noScheduleOpenCount = allOrders.filter(
      (order) => !order.hasSchedule && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
    ).length;
    const unassignedOpenCount = allOrders.filter(
      (order) => !order.isAssigned && order.orderStatus !== "completed" && order.orderStatus !== "canceled"
    ).length;
    const statusCounts = countOrdersByStatus(allOrders);
    const activeCount = Math.max(0, totalOrders - statusCounts.completed - statusCounts.canceled);
    const orderById = new Map(allOrders.map((order) => [order.id, order]));
    const upcomingOrders = planning.scheduledOrders.slice(0, 8)
      .map((planningItem) => {
        const order = orderById.get(planningItem.entry.id);
        if (!order) return null;
        return { order, planningItem };
      })
      .filter(Boolean);
    const currentReturnTo = `${reqUrl.pathname}${reqUrl.search}`;
    const selectedOrderId = normalizeString(reqUrl.searchParams.get("order"), 120);
    const autoOpenAmountEditor = normalizeString(reqUrl.searchParams.get("amountEditor"), 16) === "1";
    const autoOpenCreateOrderDialog = normalizeString(reqUrl.searchParams.get("createOrder"), 16) === "1";
    const filteredCount = orders.length;
    const hasSearchQuery = Boolean(filters.q);
    const hasActiveFilters = Boolean(
      filters.q ||
      filters.status !== "all" ||
      filters.serviceType !== "all" ||
      filters.frequency !== "all" ||
      filters.assignment !== "all"
    );
    const advancedFilterCount = [
      filters.status !== "all",
      filters.serviceType !== "all",
      filters.frequency !== "all",
      filters.assignment !== "all",
    ].filter(Boolean).length;
    const advancedResetHref = buildAdminRedirectPath(ADMIN_ORDERS_PATH, {
      q: filters.q,
      status: "",
      serviceType: "",
      frequency: "",
      assignment: "",
    });
    const resetHref = buildAdminRedirectPath(ADMIN_ORDERS_PATH, {
      q: "",
      status: "",
      serviceType: "",
      frequency: "",
      assignment: "",
    });
    const closeOrderHref = buildAdminRedirectPath(ADMIN_ORDERS_PATH, {
      q: filters.q,
      status: filters.status !== "all" ? filters.status : "",
      serviceType: filters.serviceType !== "all" ? filters.serviceType : "",
      frequency: filters.frequency !== "all" ? filters.frequency : "",
      assignment: filters.assignment !== "all" ? filters.assignment : "",
      order: "",
    });
    const funnelStatuses = ["new", "policy", "scheduled", "in-progress", "rescheduled", "invoice-sent", "paid", "awaiting-review", "completed", "canceled"];
    const emptyStateMessage = hasActiveFilters
      ? "По текущему фильтру заказов нет. Попробуйте очистить поиск или снять часть фильтров."
      : "Пока заказов нет. Подтверждённые заявки будут появляться здесь после создания заказа.";
    const overviewItems = [
      {
        label: "В работе",
        value: activeCount,
        copy: "Открытые заказы без completed и canceled.",
        tone: "accent",
      },
      {
        label: "В графике",
        value: scheduledCount,
        copy: "Есть дата или время визита.",
        tone: "success",
      },
      {
        label: "Без даты",
        value: noScheduleOpenCount,
        copy: "Нужно назначить окно уборки.",
        tone: noScheduleOpenCount > 0 ? "danger" : "default",
      },
      {
        label: "Без команды",
        value: unassignedOpenCount,
        copy: "Требуется назначение сотрудников.",
        tone: unassignedOpenCount > 0 ? "danger" : "default",
      },
    ];
    const filterBadges = [
      hasSearchQuery ? renderAdminBadge(`Поиск: ${filters.q}`, "outline") : "",
      filters.status !== "all" ? renderAdminBadge(`Статус: ${filters.status}`, "outline") : "",
      filters.serviceType !== "all" ? renderAdminBadge(`Тип: ${filters.serviceType}`, "outline") : "",
      filters.frequency !== "all" ? renderAdminBadge(`Повтор: ${filters.frequency}`, "outline") : "",
      filters.assignment === "assigned" ? renderAdminBadge("Только назначенные", "outline") : "",
      filters.assignment === "unassigned" ? renderAdminBadge("Только без команды", "outline") : "",
    ]
      .filter(Boolean)
      .join("");
    const accessContext = getWorkspaceAccessContext(adminRuntime);

    return renderAdminLayout(
      "Заказы",
      `<div class="admin-orders-page">
        ${renderOrdersFunnelStyle()}
        ${renderOrdersNotice(req)}
        ${renderOrdersOverviewStrip(overviewItems)}
        ${renderAdminCard(
          "Все заказы",
          "Рабочая таблица заказов с поиском, фильтрами и карточкой по клику.",
          `<div class="admin-orders-workspace" id="admin-orders-workspace">
            <div class="admin-orders-toolbar-shell">
              <details class="admin-filter-disclosure admin-orders-filter-toggle"${advancedFilterCount ? " open" : ""}>
                <summary class="admin-clients-toolbar-button">
                  <span>Фильтры</span>
                  ${advancedFilterCount ? `<span class="admin-clients-toolbar-count">${escapeHtml(String(advancedFilterCount))}</span>` : ""}
                </summary>
              </details>
              <div class="admin-orders-toolbar-actions">
                <form
                  class="admin-clients-search-form"
                  method="get"
                  action="${ADMIN_ORDERS_PATH}"
                  data-admin-auto-submit="true"
                  data-admin-auto-submit-delay="600"
                  data-admin-auto-submit-min-length="2"
                  data-admin-auto-submit-restore-focus="true"
                  data-admin-auto-submit-scroll-target="#admin-orders-workspace"
                  data-admin-auto-submit-scroll-offset="18"
                >
                  ${renderAdminHiddenInput("status", filters.status !== "all" ? filters.status : "")}
                  ${renderAdminHiddenInput("serviceType", filters.serviceType !== "all" ? filters.serviceType : "")}
                  ${renderAdminHiddenInput("frequency", filters.frequency !== "all" ? filters.frequency : "")}
                  ${renderAdminHiddenInput("assignment", filters.assignment !== "all" ? filters.assignment : "")}
                  <label class="admin-clients-search-box">
                    <span class="admin-clients-search-icon" aria-hidden="true">⌕</span>
                    <input
                      class="admin-input admin-clients-search-input"
                      type="search"
                      name="q"
                      value="${escapeHtmlText(filters.q)}"
                      placeholder="Поиск по клиенту, телефону, адресу, сотруднику или номеру"
                    >
                  </label>
                  <button class="admin-sr-only" type="submit">Обновить поиск</button>
                  ${hasActiveFilters ? `<a class="admin-clients-toolbar-link" href="${resetHref}">Очистить</a>` : ""}
                </form>
                ${accessContext.canEdit
                  ? `<div class="admin-dialog-launcher admin-dialog-launcher-inline">
                      <button class="admin-button" type="button" data-admin-dialog-open="${ADMIN_MANUAL_ORDER_DIALOG_ID}">Добавить заказ</button>
                    </div>`
                  : ""}
              </div>
              <div class="admin-filter-disclosure-panel admin-orders-filter-inline-panel">
                <form class="admin-orders-filter-bar" method="get" action="${ADMIN_ORDERS_PATH}">
                  ${renderAdminHiddenInput("q", filters.q)}
                  <label class="admin-label">
                    Статус
                    <select class="admin-input" name="status">
                      <option value="all"${filters.status === "all" ? " selected" : ""}>Все</option>
                      <option value="new"${filters.status === "new" ? " selected" : ""}>Новые</option>
                      <option value="scheduled"${filters.status === "scheduled" ? " selected" : ""}>Запланировано</option>
                      <option value="in-progress"${filters.status === "in-progress" ? " selected" : ""}>В работе</option>
                      <option value="rescheduled"${filters.status === "rescheduled" ? " selected" : ""}>Перенесено</option>
                      <option value="invoice-sent"${filters.status === "invoice-sent" ? " selected" : ""}>Инвойс отправлен</option>
                      <option value="paid"${filters.status === "paid" ? " selected" : ""}>Оплачено</option>
                      <option value="awaiting-review"${filters.status === "awaiting-review" ? " selected" : ""}>Ждем отзыв</option>
                      <option value="completed"${filters.status === "completed" ? " selected" : ""}>Завершено</option>
                      <option value="canceled"${filters.status === "canceled" ? " selected" : ""}>Отменено</option>
                    </select>
                  </label>
                  <label class="admin-label">
                    Тип уборки
                    <select class="admin-input" name="serviceType">
                      <option value="all"${filters.serviceType === "all" ? " selected" : ""}>Все</option>
                      <option value="standard"${filters.serviceType === "standard" ? " selected" : ""}>Standard</option>
                      <option value="deep"${filters.serviceType === "deep" ? " selected" : ""}>Deep</option>
                      <option value="move-in/out"${filters.serviceType === "move-in/out" ? " selected" : ""}>Move-in/out</option>
                    </select>
                  </label>
                  <label class="admin-label">
                    Повторяемость
                    <select class="admin-input" name="frequency">
                      <option value="all"${filters.frequency === "all" ? " selected" : ""}>Все</option>
                      <option value="weekly"${filters.frequency === "weekly" ? " selected" : ""}>Weekly</option>
                      <option value="biweekly"${filters.frequency === "biweekly" ? " selected" : ""}>Bi-weekly</option>
                      <option value="monthly"${filters.frequency === "monthly" ? " selected" : ""}>Monthly</option>
                    </select>
                  </label>
                  <label class="admin-label">
                    Назначение
                    <select class="admin-input" name="assignment">
                      <option value="all"${filters.assignment === "all" ? " selected" : ""}>Все</option>
                      <option value="assigned"${filters.assignment === "assigned" ? " selected" : ""}>Назначен</option>
                      <option value="unassigned"${filters.assignment === "unassigned" ? " selected" : ""}>Не назначен</option>
                    </select>
                  </label>
                  <div class="admin-clients-filter-actions">
                    <button class="admin-button" type="submit">Применить</button>
                    <a class="admin-link-button admin-button-secondary" href="${advancedResetHref}">Сбросить фильтры</a>
                  </div>
                </form>
              </div>
            </div>
            ${hasActiveFilters
              ? `<div class="admin-clients-meta-row">
                  <div class="admin-clients-meta-main">
                    <p class="admin-clients-summary-copy">
                      Найдено ${escapeHtml(String(filteredCount))} из ${escapeHtml(String(totalOrders))} заказов.
                      С учётом поиска и фильтров.
                    </p>
                    ${filterBadges ? `<div class="admin-inline-badge-row">${filterBadges}</div>` : ""}
                  </div>
                </div>`
              : ""}
            ${orders.length > 0
              ? `<div class="admin-table-wrap admin-orders-table-wrap admin-orders-table-wrap-capped">
                  <table class="admin-table admin-orders-table">
                    <colgroup>
                      <col style="width:22%">
                      <col style="width:15%">
                      <col style="width:14%">
                      <col style="width:14%">
                      <col style="width:14%">
                      <col style="width:13%">
                      <col style="width:8%">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Заказ</th>
                        <th>Контакты</th>
                        <th>Дата и время</th>
                        <th>Команда</th>
                        <th>Статус</th>
                        <th>Адрес</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${orders
                        .map((order) =>
                          renderOrderTableRow(order, currentReturnTo, {
                            planningItem: planningByEntryId.get(order.id) || null,
                          })
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
                <section class="admin-orders-funnel-section">
                  <div class="admin-subsection-head">
                    <div>
                      <h3 class="admin-subsection-title">Воронка заказов</h3>
                      <p class="admin-order-detail-copy">Текущая выборка заказов, разложенная по статусам выполнения.</p>
                    </div>
                  </div>
                  <div class="admin-order-funnel-board">
                    <form method="post" action="${ADMIN_ORDERS_PATH}" data-order-funnel-stage-form="true" hidden>
                      <input type="hidden" name="entryId" value="">
                      <input type="hidden" name="orderStatus" value="">
                      <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(currentReturnTo)}">
                    </form>
                    ${funnelStatuses
                      .map((status) =>
                        renderOrdersLane(
                          status,
                          orders.filter((order) => getOrderFunnelStatus(order) === status),
                          currentReturnTo,
                          planningByEntryId,
                          staffRecords,
                          {
                            canDelete: accessContext.canDelete,
                            canEdit: accessContext.canEdit,
                            droppable: true,
                          }
                        )
                      )
                      .join("")}
                  </div>
                </section>
                ${orders
                  .map((order) =>
                    renderOrderManagementDialog(order, currentReturnTo, {
                      req,
                      planningItem: planningByEntryId.get(order.id) || null,
                      staffRecords,
                      canDelete: accessContext.canDelete,
                      canEdit: accessContext.canEdit,
                      leadConnectorConfigured: adminRuntime && adminRuntime.leadConnectorConfigured,
                      autoOpen: selectedOrderId === order.id,
                      autoOpenAmountEditor: selectedOrderId === order.id && autoOpenAmountEditor,
                      closeHref: selectedOrderId === order.id ? closeOrderHref : "",
                    })
                  )
                  .join("")}`
              : `<div class="admin-empty-state">${emptyStateMessage}</div>`}
          </div>`,
          { className: "admin-orders-card" }
        )}
        ${accessContext.canEdit ? renderCreateManualOrderDialog({ autoOpen: autoOpenCreateOrderDialog, returnTo: currentReturnTo }) : ""}
        ${renderOrdersFunnelScript(currentReturnTo, accessContext.canEdit)}
        ${renderAdminCard(
          "Ближайшие выезды",
          "Заказы с назначенной датой и временем, отсортированные по ближайшему визиту.",
          renderOrdersUpcomingTable(upcomingOrders),
          { className: "admin-orders-card" }
        )}
      </div>`,
      {
        kicker: false,
        subtitle: "Рабочая таблица заказов и ближайших выездов.",
        sidebar: renderAdminAppSidebar(ADMIN_ORDERS_PATH, accessContext),
      }
    );
  }

  return renderOrdersPage;
}

module.exports = {
  createOrdersPageRenderer,
};
