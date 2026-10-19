"use strict";

const AUDIT_PAGINATION_SCRIPT = `<script>
(() => {
  const entries = document.querySelector('[data-audit-entries]');
  const pagination = document.querySelector('[data-audit-pagination]');
  const message = document.querySelector('[data-audit-load-status]');
  if (!entries || !pagination || !message) return;
  let loading = false;
  pagination.addEventListener('click', async event => {
    const link = event.target.closest('[data-audit-load-more]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (loading) return;
    loading = true;
    const label = link.textContent;
    link.setAttribute('aria-disabled', 'true');
    link.textContent = 'Загрузка…';
    pagination.setAttribute('aria-busy', 'true');
    message.textContent = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const url = new URL(link.href, window.location.href);
      url.searchParams.set('fragment', 'entries');
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok || response.redirected) throw new Error('Audit page unavailable');
      const documentPage = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextEntries = documentPage.querySelector('[data-audit-entries]');
      const nextPagination = documentPage.querySelector('[data-audit-pagination]');
      if (!nextEntries || !nextPagination) throw new Error('Invalid audit page');
      const nextLink = nextPagination.querySelector('[data-audit-load-more]');
      const seen = new Set(Array.from(entries.querySelectorAll('[data-audit-event-id]'), row => row.dataset.auditEventId));
      const rows = Array.from(nextEntries.querySelectorAll('[data-audit-event-id]')).filter(row => !seen.has(row.dataset.auditEventId));
      const left = window.scrollX;
      const top = window.scrollY;
      entries.append(...rows);
      if (nextLink) link.href = nextLink.href;
      else link.hidden = true;
      message.textContent = nextLink ? 'Добавлено записей: ' + rows.length + '.' : 'Все записи загружены.';
      window.scrollTo(left, top);
    } catch {
      message.textContent = 'Не удалось загрузить записи. Нажмите «Далее», чтобы повторить.';
    } finally {
      clearTimeout(timeout);
      loading = false;
      link.textContent = label;
      link.removeAttribute('aria-disabled');
      pagination.removeAttribute('aria-busy');
    }
  });
})();
</script>`;

module.exports = { AUDIT_PAGINATION_SCRIPT };
