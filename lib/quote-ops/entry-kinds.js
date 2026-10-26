"use strict";

const HIDDEN_ENTRY_KINDS = Object.freeze([
  "admin_standalone_task",
  "admin_staff_member",
  "admin_staff_assignment",
  "admin_user_account",
  "admin_mail_integration",
]);

// Negative filtering preserves null, unknown and legacy kinds for the existing JS recognizer.
const VISIBLE_ENTRY_KIND_FILTER = `(kind.is.null,kind.not.in.(${HIDDEN_ENTRY_KINDS.join(",")}))`;

module.exports = { HIDDEN_ENTRY_KINDS, VISIBLE_ENTRY_KIND_FILTER };
