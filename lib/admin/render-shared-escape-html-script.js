"use strict";

const ADMIN_SHARED_ESCAPE_HTML_SCRIPT = `        function escapeAdminHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }`;

module.exports = {
  ADMIN_SHARED_ESCAPE_HTML_SCRIPT,
};
