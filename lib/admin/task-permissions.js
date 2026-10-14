"use strict";

const TASK_STATUS_PERMISSION = "tasks.update_status";

function canUpdateTaskStatus(access = {}) {
  return access.authorized === true && access.role === "viewer" &&
    String(access.user && access.user.email || "").trim().toLowerCase() === "eva@shynli.local";
}

module.exports = { TASK_STATUS_PERMISSION, canUpdateTaskStatus };
