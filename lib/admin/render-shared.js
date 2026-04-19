"use strict";

const {
  ADMIN_SHARED_PICKER_AND_MULTISELECT_SCRIPT,
} = require("./render-shared-picker-multiselect-script");
const {
  renderAdminSidebarBrand,
} = require("./render-shared-sidebar-brand");
const {
  renderAdminAuthSidebar: renderAdminAuthSidebarMarkup,
} = require("./render-shared-auth-sidebar");
const {
  renderAdminAppSidebar: renderAdminAppSidebarMarkup,
} = require("./render-shared-app-sidebar");
const {
  renderAdminLayoutMarkup,
} = require("./render-shared-layout");
const {
  renderAdminBadge: renderAdminBadgePrimitive,
  renderAdminCard: renderAdminCardPrimitive,
  renderAdminPropertyList: renderAdminPropertyListPrimitive,
} = require("./render-shared-primitives");
const {
  createAdminSharedAuthPageRenderers,
} = require("./render-shared-auth-pages");

function createAdminSharedRenderers(deps = {}) {
  const {
    adminAuth,
    ADMIN_APP_NAV_ITEMS,
    ADMIN_LOGIN_PATH,
    ADMIN_2FA_PATH,
    ADMIN_LOGOUT_PATH,
    QUOTE_PUBLIC_PATH,
    escapeHtml,
    escapeHtmlAttribute,
    escapeHtmlText,
  } = deps;

  function renderAdminBadge(label, tone = "default") {
    return renderAdminBadgePrimitive(escapeHtml, label, tone);
  }

  function renderAdminCard(title, description, body, options = {}) {
    return renderAdminCardPrimitive(escapeHtml, title, description, body, options);
  }

  function renderAdminAuthSidebar(activeStep) {
    return renderAdminAuthSidebarMarkup({
      activeStep,
      escapeHtml,
      renderAdminSidebarBrand,
    });
  }

  function renderAdminAppSidebar(activePath, options = {}) {
    return renderAdminAppSidebarMarkup({
      activePath,
      options,
      ADMIN_APP_NAV_ITEMS,
      ADMIN_LOGOUT_PATH,
      escapeHtml,
      renderAdminBadge,
      renderAdminSidebarBrand,
    });
  }

  function renderAdminLayout(title, content, options = {}) {
    return renderAdminLayoutMarkup(title, content, options, escapeHtml);
  }

  const {
    renderAdminUnavailablePage,
    renderLoginPage,
    renderTwoFactorPage,
  } = createAdminSharedAuthPageRenderers({
    adminAuth,
    ADMIN_2FA_PATH,
    ADMIN_LOGIN_PATH,
    escapeHtml,
    escapeHtmlText,
    renderAdminAuthSidebar,
    renderAdminCard,
    renderAdminLayout,
  });

  function renderAdminPropertyList(rows = []) {
    return renderAdminPropertyListPrimitive(escapeHtml, rows);
  }

  return {
    renderAdminAppSidebar,
    renderAdminAuthSidebar,
    renderAdminBadge,
    renderAdminCard,
    renderAdminLayout,
    renderAdminPropertyList,
    renderAdminUnavailablePage,
    renderLoginPage,
    renderTwoFactorPage,
  };
}

module.exports = {
  createAdminSharedRenderers,
};
