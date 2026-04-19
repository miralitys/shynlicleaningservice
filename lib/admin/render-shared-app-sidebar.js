"use strict";

function getActiveAppSidebarSections(activePath, options = {}) {
  const activeQuoteOpsSection =
    activePath === "/admin/quote-ops"
      ? options.quoteOpsSection === "funnel"
        ? "funnel"
        : options.quoteOpsSection === "tasks"
          ? "tasks"
          : "list"
      : null;
  const activeStaffSection =
    activePath === "/admin/staff"
      ? options.staffSection === "calendar"
        ? "calendar"
        : options.staffSection === "assignments"
          ? "assignments"
          : "team"
      : null;

  return {
    activeQuoteOpsSection,
    activeStaffSection,
  };
}

function renderAdminAppSidebarGroup({
  activePath,
  group,
  navItemByPath,
  activeQuoteOpsSection,
  activeStaffSection,
  escapeHtml,
}) {
  const items = group
    .map((path) => navItemByPath.get(path))
    .filter(Boolean);
  if (items.length === 0) return "";

  const isActiveGroup = items.some((item) => item.path === activePath);
  return `<div class="admin-nav-group${isActiveGroup ? " admin-nav-group-active" : ""}">
          ${items
            .map((item) => renderAdminAppSidebarItem({
              activePath,
              activeQuoteOpsSection,
              activeStaffSection,
              escapeHtml,
              item,
            }))
            .join("")}
        </div>`;
}

function renderAdminAppSidebarItem({
  activePath,
  activeQuoteOpsSection,
  activeStaffSection,
  escapeHtml,
  item,
}) {
  const isStaffItem = item.path === "/admin/staff";
  const isQuoteOpsItem = item.path === "/admin/quote-ops";
  const isActiveItem =
    item.path === activePath &&
    (!isStaffItem || activeStaffSection === "team") &&
    (!isQuoteOpsItem || activeQuoteOpsSection === "list");
  const staffSubnav = isStaffItem
    ? `<div class="admin-nav-sublinks">
                    <a class="admin-nav-sublink${activeStaffSection === "calendar" ? " admin-nav-sublink-active" : ""}" href="/admin/staff?section=calendar">Календарь</a>
                    <a class="admin-nav-sublink${activeStaffSection === "assignments" ? " admin-nav-sublink-active" : ""}" href="/admin/staff?section=assignments">График</a>
                  </div>`
    : "";
  const quoteOpsSubnav = isQuoteOpsItem
    ? `<div class="admin-nav-sublinks">
                    <a class="admin-nav-sublink${activeQuoteOpsSection === "funnel" ? " admin-nav-sublink-active" : ""}" href="/admin/quote-ops?section=funnel">Воронка</a>
                    <a class="admin-nav-sublink${activeQuoteOpsSection === "tasks" ? " admin-nav-sublink-active" : ""}" href="/admin/quote-ops?section=tasks">Таски</a>
                  </div>`
    : "";

  return `<div class="admin-nav-item-shell${isStaffItem ? " admin-nav-item-shell-staff" : ""}${isQuoteOpsItem ? " admin-nav-item-shell-staff" : ""}">
                <a class="admin-nav-link${isActiveItem ? " admin-nav-link-active" : ""}${(isStaffItem && activeStaffSection) || (isQuoteOpsItem && activeQuoteOpsSection) ? " admin-nav-link-parent-active" : ""}" href="${item.path}">${escapeHtml(item.label)}</a>
                ${staffSubnav}
                ${quoteOpsSubnav}
              </div>`;
}

function renderAdminAppSidebar({
  activePath,
  options = {},
  ADMIN_APP_NAV_ITEMS,
  ADMIN_LOGOUT_PATH,
  escapeHtml,
  renderAdminBadge,
  renderAdminSidebarBrand,
}) {
  const navItemByPath = new Map(ADMIN_APP_NAV_ITEMS.map((item) => [item.path, item]));
  const logoutPath = options.logoutPath || ADMIN_LOGOUT_PATH;
  const { activeQuoteOpsSection, activeStaffSection } = getActiveAppSidebarSections(activePath, options);
  const roleBadge = options.roleLabel
    ? `<div class="admin-badge-row admin-sidebar-role-badge">${renderAdminBadge(options.roleLabel, options.roleTone || "outline")}</div>`
    : "";
  const navGroups = [
    ["/admin"],
    ["/admin/quote-ops"],
    ["/admin/orders"],
    ["/admin/clients"],
    ["/admin/staff"],
    ["/admin/settings"],
  ];

  const navMarkup = navGroups
    .map((group) =>
      renderAdminAppSidebarGroup({
        activePath,
        group,
        navItemByPath,
        activeQuoteOpsSection,
        activeStaffSection,
        escapeHtml,
      })
    )
    .filter(Boolean)
    .join("");

  return `
      <div class="admin-sidebar-card admin-sidebar-workspace-card">
        <div class="admin-sidebar-top">
          ${renderAdminSidebarBrand({
            brandClassName: "admin-sidebar-brand",
            copyClassName: "admin-sidebar-brand-copy",
          })}
        <p class="admin-sidebar-copy">Основные рабочие разделы.</p>
        </div>
      ${roleBadge}
      <nav class="admin-nav admin-sidebar-nav">
          ${navMarkup}
        </nav>
        <div class="admin-inline-actions admin-sidebar-actions">
          <form class="admin-logout-form" method="post" action="${logoutPath}" data-admin-logout-form="true">
            <button class="admin-sidebar-logout-button" type="submit" data-admin-logout-trigger="true">
              <span class="admin-sidebar-logout-copy">
                <span class="admin-sidebar-logout-title">Выйти</span>
                <span class="admin-sidebar-logout-hint">Завершить сессию и вернуться ко входу</span>
              </span>
              <span class="admin-sidebar-logout-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M10.75 4.75a.75.75 0 0 1 0 1.5H6.5a.75.75 0 0 0-.75.75v10a.75.75 0 0 0 .75.75h4.25a.75.75 0 0 1 0 1.5H6.5a2.25 2.25 0 0 1-2.25-2.25V7A2.25 2.25 0 0 1 6.5 4.75h4.25Zm4.72 2.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H9.75a.75.75 0 0 1 0-1.5h8.69l-2.97-2.97a.75.75 0 0 1 0-1.06Z" fill="currentColor"/>
                </svg>
              </span>
            </button>
          </form>
        </div>
      </div>`;
}

module.exports = {
  renderAdminAppSidebar,
};
