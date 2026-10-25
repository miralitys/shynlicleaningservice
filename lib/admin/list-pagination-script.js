"use strict";

function installAdminListPagination() {
  document.addEventListener("click", async event => {
    const link = event.target.closest("[data-admin-list-next]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const root = link.closest("[data-admin-list-id]");
    if (!root) return;
    event.preventDefault();
    if (root.getAttribute("aria-busy") === "true") return;
    const target = root.querySelector("[data-admin-list-rows]");
    const pager = root.querySelector("[data-admin-list-pager]");
    const message = pager.querySelector("[data-admin-list-message]");
    const reload = pager.querySelector("[data-admin-list-reload]");
    root.setAttribute("aria-busy", "true");
    link.setAttribute("aria-disabled", "true");
    message.textContent = "Загрузка...";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const url = new URL(link.href, window.location.href);
      url.searchParams.set("fragment", "list");
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok || response.redirected) throw new Error("List unavailable");
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const result = doc.querySelector("[data-admin-list-response]");
      if (!result || result.getAttribute("data-admin-list-response") !== root.getAttribute("data-admin-list-id")) throw new Error("Invalid list");
      if (result.hasAttribute("data-admin-list-error")) {
        reload.hidden = false;
        message.textContent = "Список изменился. Обновите его, чтобы не пропустить записи.";
        return;
      }
      const chunk = result.querySelector("[data-admin-list-rows]");
      const nextPager = result.querySelector("[data-admin-list-pager]");
      if (!chunk || !nextPager) throw new Error("Incomplete list response");
      const existing = Array.from(target.children).filter(row => row.hasAttribute("data-admin-list-key"));
      const seen = new Set(existing.map(row => row.getAttribute("data-admin-list-key")));
      const rows = Array.from(chunk.children);
      const complete = result.getAttribute("data-admin-list-complete") === "true";
      const nextLink = nextPager.querySelector("[data-admin-list-next]");
      const end = Number(result.getAttribute("data-admin-list-start")) + rows.length;
      const total = Number(result.getAttribute("data-admin-list-total"));
      if (!rows.length || rows.length > 50 || Number(result.getAttribute("data-admin-list-start")) !== Number(root.getAttribute("data-admin-list-start") || 0) + existing.length ||
        result.getAttribute("data-admin-list-total") !== root.getAttribute("data-admin-list-total") || complete === Boolean(nextLink) ||
        end > total || complete !== (end === total)) throw new Error("Invalid continuation");
      for (const row of rows) {
        const key = row.getAttribute("data-admin-list-key");
        if (!key || seen.has(key)) throw new Error("Duplicate list row");
        seen.add(key);
      }
      const left = window.scrollX;
      const top = window.scrollY;
      target.append(...rows);
      pager.replaceChildren(...Array.from(nextPager.childNodes));
      pager.querySelector("[data-admin-list-message]").textContent = complete ? "Все записи загружены." : "Добавлено записей: " + rows.length + ".";
      document.dispatchEvent(new CustomEvent("admin:list-appended", { detail: { root } }));
      window.scrollTo(left, top);
    } catch {
      message.textContent = "Не удалось загрузить записи. Нажмите «Показать ещё», чтобы повторить.";
    } finally {
      clearTimeout(timeout);
      root.removeAttribute("aria-busy");
      link.removeAttribute("aria-disabled");
    }
  });
}

const ADMIN_LIST_PAGINATION_SCRIPT = `<script data-admin-list-pagination>(${installAdminListPagination.toString()})();</script>`;
module.exports = { ADMIN_LIST_PAGINATION_SCRIPT, installAdminListPagination };
