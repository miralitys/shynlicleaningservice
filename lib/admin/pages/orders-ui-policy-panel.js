"use strict";

function createOrdersUiPolicyPanel(deps = {}) {
  const {
    ADMIN_ORDERS_PATH,
    ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    formatAdminDateTime,
    normalizeString,
    renderAdminBadge,
    renderOrderBriefFact,
  } = deps;

  function renderOrderPolicyAcceptancePanel(order, options = {}) {
    const policy = order && order.policyAcceptance ? order.policyAcceptance : null;
    const hasPolicyRecord = Boolean(
      policy && (policy.acceptanceId || policy.envelopeId || policy.sentAt || policy.signedAt)
    );
    const accepted = Boolean(policy && policy.policyAccepted);
    const policyActionAllowed =
      order &&
      order.orderStatus !== "new" &&
      order.orderStatus !== "canceled";
    const canResend = options.canEdit !== false && !accepted && policyActionAllowed;
    const canReset = options.canEdit !== false && hasPolicyRecord;
    const resendLabel = hasPolicyRecord ? "Отправить ещё раз" : "Отправить ссылку";
    const returnTo = normalizeString(options.returnTo, 500) || ADMIN_ORDERS_PATH;
    const certificateUrl =
      accepted && policy && policy.certificateFile
        ? `${ADMIN_POLICY_ACCEPTANCE_API_BASE_PATH}/${encodeURIComponent(order.id)}/certificate`
        : "";

    if (!hasPolicyRecord) {
      return `<section class="admin-order-section-card">
        <div class="admin-subsection-head">
          <div>
            <h3 class="admin-subsection-title">Подтверждение политик</h3>
            <p class="admin-order-detail-copy">После перехода заказа в статус Scheduled клиенту автоматически уйдёт ссылка на подтверждение Terms of Service и Payment & Cancellation Policy.</p>
          </div>
        </div>
        <p class="admin-order-summary-ok">Письмо ещё не отправлялось.</p>
        ${canResend
          ? `<div class="admin-inline-actions admin-form-actions">
              <form method="post" action="${ADMIN_ORDERS_PATH}">
                <input type="hidden" name="action" value="resend-order-policy">
                <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                <button class="admin-button admin-button-secondary" type="submit">${resendLabel}</button>
              </form>
              <span class="admin-action-hint">Отправим ссылку по доступным каналам связи, а ссылка будет активна ещё 48 часов.</span>
            </div>`
          : ""}
      </section>`;
    }

    const statusBadge = accepted
      ? renderAdminBadge("Подписано", "success")
      : policy.lastError
        ? renderAdminBadge("Ошибка отправки", "danger")
        : renderAdminBadge("Политика не подписана", "danger");
    const sentLabel = policy.sentAt ? formatAdminDateTime(policy.sentAt) : "Не отправлено";
    const viewedLabel = policy.firstViewedAt
      ? formatAdminDateTime(policy.firstViewedAt)
      : policy.lastViewedAt
        ? formatAdminDateTime(policy.lastViewedAt)
        : "Ещё не открыто";
    const signedLabel = policy.signedAt ? formatAdminDateTime(policy.signedAt) : "Ещё не подписано";
    const expiresLabel = policy.expiresAt ? formatAdminDateTime(policy.expiresAt) : "Не указано";

    return `<section class="admin-order-section-card">
      <div class="admin-subsection-head">
        <div>
          <h3 class="admin-subsection-title">Подтверждение политик</h3>
          <p class="admin-order-detail-copy">Живой статус ссылки на policy acceptance и итоговый сертификат клиента.</p>
        </div>
        ${statusBadge}
      </div>
      <div class="admin-order-brief-fact-grid">
        ${renderOrderBriefFact("Отправлено", sentLabel)}
        ${renderOrderBriefFact("Открыто", viewedLabel)}
        ${renderOrderBriefFact("Подписано", signedLabel)}
        ${renderOrderBriefFact("Срок ссылки", expiresLabel)}
      </div>
      ${policy.lastError
        ? `<div class="admin-alert admin-alert-error">${escapeHtml(policy.lastError)}</div>`
        : ""}
      ${certificateUrl || canResend || canReset
        ? `<div class="admin-inline-actions admin-form-actions">
            ${certificateUrl
              ? `<a class="admin-button admin-button-secondary" href="${escapeHtmlAttribute(certificateUrl)}" target="_blank" rel="noreferrer">Открыть сертификат PDF</a>`
              : ""}
            ${canResend
              ? `<form method="post" action="${ADMIN_ORDERS_PATH}">
                  <input type="hidden" name="action" value="resend-order-policy">
                  <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                  <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                  <button class="admin-button admin-button-secondary" type="submit">${resendLabel}</button>
                </form>`
              : ""}
            ${canReset
              ? `<form method="post" action="${ADMIN_ORDERS_PATH}">
                  <input type="hidden" name="action" value="reset-order-policy">
                  <input type="hidden" name="entryId" value="${escapeHtmlAttribute(order.id)}">
                  <input type="hidden" name="returnTo" value="${escapeHtmlAttribute(returnTo)}">
                  <button
                    class="admin-button admin-button-secondary"
                    type="submit"
                    onclick="return window.confirm('Сбросить подтверждение политик для этого заказа?');"
                  >Сбросить подтверждение</button>
                </form>`
              : ""}
            ${canResend ? `<span class="admin-action-hint">Повторная отправка продлит ссылку ещё на 48 часов и заново отправит ссылку по доступным каналам связи.</span>` : ""}
            ${canReset ? `<span class="admin-action-hint">Сброс удалит текущую ссылку, подпись и статус сертификата, после чего подтверждение можно пройти заново.</span>` : ""}
          </div>`
        : ""}
    </section>`;
  }

  return {
    renderOrderPolicyAcceptancePanel,
  };
}

module.exports = {
  createOrdersUiPolicyPanel,
};
