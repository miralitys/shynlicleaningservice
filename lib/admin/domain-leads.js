"use strict";

const crypto = require("crypto");

function createAdminLeadDomain(deps = {}) {
  const {
    applyOrderEntryUpdates,
    getEntryAdminLeadData,
    getEntryAdminSmsData,
    getEntryPayload,
    getEntrySmsHistory,
    getRequestUrl,
    isOrderCreatedEntry,
    normalizeAdminSmsHistoryEntries,
    normalizeString,
  } = deps;
  const ADMIN_TIME_ZONE = "America/Chicago";

  function normalizeLeadStatus(value, fallback = "new") {
    const normalized = normalizeString(value, 40).toLowerCase();
    const compact = normalized.replace(/[\s_]+/g, "-");
    if (!compact) return fallback;
    if (compact === "new" || compact === "новая") return "new";
    if (
      compact === "no-response" ||
      compact === "noanswer" ||
      compact === "no-answer" ||
      compact === "без-ответа" ||
      compact === "безответа"
    ) {
      return "no-response";
    }
    if (compact === "discussion" || compact === "обсуждение") return "discussion";
    if (compact === "confirmed" || compact === "подтверждено" || compact === "confirm") return "confirmed";
    if (compact === "declined" || compact === "refused" || compact === "отказ") return "declined";
    return fallback;
  }

  function formatLeadStatusLabel(value) {
    const normalized = normalizeLeadStatus(value, "new");
    if (normalized === "no-response") return "Без ответа";
    if (normalized === "discussion") return "Обсуждение";
    if (normalized === "confirmed") return "Подтверждено";
    if (normalized === "declined") return "Отказ";
    return "New";
  }

  function getLeadStatus(entry = {}) {
    const adminLead = getEntryAdminLeadData(entry);
    const explicitStatus = normalizeLeadStatus(adminLead.status, "");
    if (explicitStatus) return explicitStatus;
    if (isOrderCreatedEntry(entry)) return "confirmed";
    return "new";
  }

  function normalizeLeadTaskStatus(value, fallback = "open") {
    const normalized = normalizeString(value, 32).toLowerCase();
    if (normalized === "completed" || normalized === "done") return "completed";
    if (normalized === "canceled" || normalized === "cancelled") return "canceled";
    return fallback;
  }

  function normalizeLeadTaskKind(value, fallback = "contact-client") {
    const normalized = normalizeString(value, 64).toLowerCase();
    if (!normalized) return fallback;
    if (normalized === "contact-client" || normalized === "initial-contact") return "contact-client";
    if (normalized === "retry-3h" || normalized === "call-back-3h") return "retry-3h";
    if (normalized === "retry-next-morning" || normalized === "call-next-morning") return "retry-next-morning";
    if (normalized === "discussion-followup" || normalized === "follow-up") return "discussion-followup";
    if (normalized === "manual" || normalized === "manual-task") return "manual";
    return fallback;
  }

  function formatLeadTaskTitle(kind) {
    const normalized = normalizeLeadTaskKind(kind);
    if (normalized === "retry-3h") return "Связаться с клиентом";
    if (normalized === "retry-next-morning") return "Перезвонить клиенту на следующий день утром";
    if (normalized === "discussion-followup") return "Связаться с клиентом в назначенное время";
    if (normalized === "manual") return "Ручной таск";
    return "Связаться с клиентом";
  }

  function getChicagoLocalParts(dateLike) {
    const date = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ADMIN_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = {};
    for (const part of formatter.formatToParts(date)) {
      if (part.type === "literal") continue;
      parts[part.type] = part.value;
    }
    return {
      year: Number(parts.year || 0),
      month: Number(parts.month || 0),
      day: Number(parts.day || 0),
      hour: Number(parts.hour || 0),
      minute: Number(parts.minute || 0),
      second: Number(parts.second || 0),
    };
  }

  function buildChicagoIsoDateTime(year, month, day, hour, minute = 0) {
    let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const local = getChicagoLocalParts(new Date(utcMs));
      const desiredUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
      const actualUtcMs = Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
        local.second || 0
      );
      const diffMinutes = Math.round((actualUtcMs - desiredUtcMs) / (60 * 1000));
      if (diffMinutes === 0) {
        return new Date(utcMs).toISOString();
      }
      utcMs -= diffMinutes * 60 * 1000;
    }
    return new Date(utcMs).toISOString();
  }

  function addHoursToIso(value, hoursToAdd) {
    const baseDate = new Date(value || Date.now());
    const baseMs = Number.isFinite(baseDate.getTime()) ? baseDate.getTime() : Date.now();
    return new Date(baseMs + Math.max(0, Number(hoursToAdd) || 0) * 60 * 60 * 1000).toISOString();
  }

  function buildNextChicagoMorningIso(value, targetHour = 9) {
    const local = getChicagoLocalParts(value || Date.now());
    const anchorUtcMs = Date.UTC(local.year, local.month - 1, local.day, 12, 0, 0) + 24 * 60 * 60 * 1000;
    const nextLocal = getChicagoLocalParts(new Date(anchorUtcMs));
    return buildChicagoIsoDateTime(nextLocal.year, nextLocal.month, nextLocal.day, targetHour, 0);
  }

  function normalizeLeadTaskDueAt(value, fallback = "") {
    const normalized = normalizeString(value, 80);
    if (!normalized) return fallback;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toISOString();
  }

  function createLeadTaskRecord(input = {}, defaults = {}) {
    const createdAt = normalizeLeadTaskDueAt(
      input.createdAt,
      normalizeLeadTaskDueAt(defaults.createdAt, new Date().toISOString())
    );
    return {
      id: normalizeString(input.id, 120) || crypto.randomUUID(),
      kind: normalizeLeadTaskKind(input.kind, defaults.kind || "contact-client"),
      title:
        normalizeString(input.title, 240) ||
        formatLeadTaskTitle(input.kind || defaults.kind || "contact-client"),
      stage: normalizeLeadStatus(input.stage, defaults.stage || "new"),
      dueAt: normalizeLeadTaskDueAt(input.dueAt, normalizeLeadTaskDueAt(defaults.dueAt, createdAt)),
      status: normalizeLeadTaskStatus(input.status, defaults.status || "open"),
      createdAt,
      updatedAt: normalizeLeadTaskDueAt(input.updatedAt, normalizeLeadTaskDueAt(defaults.updatedAt, createdAt)),
      completedAt: normalizeLeadTaskDueAt(
        input.completedAt,
        normalizeLeadTaskDueAt(defaults.completedAt, "")
      ),
      resolution: normalizeString(input.resolution, 80),
      attempt: Math.max(0, Number(input.attempt ?? defaults.attempt ?? 0) || 0),
      assigneeId: normalizeString(input.assigneeId ?? defaults.assigneeId, 120),
      assigneeName: normalizeString(input.assigneeName ?? defaults.assigneeName, 200),
      assigneeEmail: normalizeString(input.assigneeEmail ?? defaults.assigneeEmail, 250).toLowerCase(),
      assigneeRole: normalizeString(input.assigneeRole ?? defaults.assigneeRole, 40).toLowerCase(),
    };
  }

  function normalizeLeadTasks(value = [], defaults = {}) {
    const items = Array.isArray(value) ? value : [];
    return items
      .map((task) => createLeadTaskRecord(task, defaults))
      .sort((left, right) => {
        const leftDue = Date.parse(left.dueAt) || 0;
        const rightDue = Date.parse(right.dueAt) || 0;
        if (left.status !== right.status) {
          if (left.status === "open") return -1;
          if (right.status === "open") return 1;
        }
        return leftDue - rightDue;
      });
  }

  function buildDefaultNewLeadTask(entry = {}) {
    const createdAt = normalizeLeadTaskDueAt(entry.createdAt, new Date().toISOString());
    return createLeadTaskRecord(
      {
        kind: "contact-client",
        title: formatLeadTaskTitle("contact-client"),
        stage: "new",
        dueAt: createdAt,
        status: "open",
        createdAt,
        updatedAt: createdAt,
        attempt: 0,
      },
      {
        createdAt,
        dueAt: createdAt,
        stage: "new",
      }
    );
  }

  function getEntryLeadTasks(entry = {}) {
    const adminLead = getEntryAdminLeadData(entry);
    const tasks = normalizeLeadTasks(adminLead.tasks, {
      createdAt: normalizeLeadTaskDueAt(
        adminLead.updatedAt,
        normalizeLeadTaskDueAt(entry.createdAt, new Date().toISOString())
      ),
      stage: getLeadStatus(entry),
    });
    if (tasks.length > 0) return tasks;
    if (getLeadStatus(entry) === "new") {
      return [buildDefaultNewLeadTask(entry)];
    }
    return [];
  }

  function getEntryOpenLeadTask(entry = {}) {
    return getEntryLeadTasks(entry).find((task) => task.status === "open") || null;
  }

  function applyLeadEntryUpdates(entry, updates = {}) {
    if (!entry || typeof entry !== "object") return null;

    const payload = {
      ...getEntryPayload(entry),
    };
    const adminLead = {
      ...getEntryAdminLeadData(entry),
    };
    const timestamp = normalizeLeadTaskDueAt(updates.now, new Date().toISOString());
    const currentStatus = getLeadStatus(entry);
    const hasStatusUpdate = Object.prototype.hasOwnProperty.call(updates, "status");
    const hasTaskAction = Object.prototype.hasOwnProperty.call(updates, "taskAction");
    const hasManagerId = Object.prototype.hasOwnProperty.call(updates, "managerId");
    const hasManagerName = Object.prototype.hasOwnProperty.call(updates, "managerName");
    const hasManagerEmail = Object.prototype.hasOwnProperty.call(updates, "managerEmail");
    const hasNotesUpdate = Object.prototype.hasOwnProperty.call(updates, "notes");
    const hasContactId = Object.prototype.hasOwnProperty.call(updates, "contactId");
    const hasSmsHistory = Object.prototype.hasOwnProperty.call(updates, "smsHistory");
    const hasManualTask = Object.prototype.hasOwnProperty.call(updates, "manualTaskTitle");
    const managerId = hasManagerId
      ? normalizeString(updates.managerId, 120)
      : normalizeString(adminLead.managerId, 120);
    const managerName = hasManagerName
      ? normalizeString(updates.managerName, 200)
      : normalizeString(adminLead.managerName, 200);
    const managerEmail = hasManagerEmail
      ? normalizeString(updates.managerEmail, 250).toLowerCase()
      : normalizeString(adminLead.managerEmail, 250).toLowerCase();
    const notes = hasNotesUpdate
      ? normalizeString(updates.notes, 2000)
      : normalizeString(adminLead.notes, 2000);
    const nextContactAt = normalizeLeadTaskDueAt(
      updates.discussionNextContactAt || updates.nextContactAt,
      normalizeLeadTaskDueAt(adminLead.discussionNextContactAt, "")
    );
    let nextStatus = hasStatusUpdate ? normalizeLeadStatus(updates.status, currentStatus) : currentStatus;
    let noResponseAttempts = Math.max(0, Number(updates.noResponseAttempts ?? adminLead.noResponseAttempts ?? 0) || 0);
    let tasks = getEntryLeadTasks(entry).map((task) => ({ ...task }));
    const taskId = normalizeString(updates.taskId, 120);
    const taskAction = normalizeString(updates.taskAction, 40).toLowerCase();

    function touchTask(task, status, resolution) {
      if (!task) return;
      task.status = normalizeLeadTaskStatus(status, task.status || "open");
      task.resolution = normalizeString(resolution, 80);
      task.updatedAt = timestamp;
      task.completedAt = task.status === "open" ? "" : timestamp;
    }

    function closeOpenTasks(resolution = "stage-changed", status = "canceled") {
      tasks = tasks.map((task) => {
        if (task.status === "open") {
          return {
            ...task,
            status: normalizeLeadTaskStatus(status, "canceled"),
            resolution: normalizeString(resolution, 80),
            updatedAt: timestamp,
            completedAt: timestamp,
          };
        }
        return task;
      });
    }

    function pushTask(kind, stage, dueAt, attempt = 0) {
      const normalizedDueAt =
        normalizeLeadTaskDueAt(dueAt, "") ||
        (kind === "retry-next-morning" ? buildNextChicagoMorningIso(timestamp) : timestamp);
      tasks.push(
        createLeadTaskRecord({
          kind,
          title: formatLeadTaskTitle(kind),
          stage,
          dueAt: normalizedDueAt,
          status: "open",
          createdAt: timestamp,
          updatedAt: timestamp,
          attempt,
        })
      );
    }

    if (hasManualTask) {
      const manualTaskTitle = normalizeString(updates.manualTaskTitle, 240);
      if (manualTaskTitle) {
        tasks.push(
          createLeadTaskRecord({
            kind: "manual",
            title: manualTaskTitle,
            stage: nextStatus,
            dueAt: normalizeLeadTaskDueAt(updates.manualTaskDueAt, timestamp),
            status: "open",
            createdAt: timestamp,
            updatedAt: timestamp,
            attempt: 0,
            assigneeId: updates.manualTaskAssigneeId,
            assigneeName: updates.manualTaskAssigneeName,
            assigneeEmail: updates.manualTaskAssigneeEmail,
            assigneeRole: updates.manualTaskAssigneeRole,
          })
        );
      }
    } else if (hasTaskAction) {
      const activeTask =
        tasks.find((task) => task.status === "open" && task.id === taskId) ||
        tasks.find((task) => task.status === "open") ||
        null;

      if (taskAction === "contacted") {
        touchTask(activeTask, "completed", "contacted");
        const targetStatus = normalizeLeadStatus(updates.nextStatus, "discussion");
        closeOpenTasks("contacted-follow-up", "canceled");
        nextStatus = targetStatus;
        noResponseAttempts = 0;
        if (targetStatus === "discussion") {
          pushTask("discussion-followup", "discussion", nextContactAt || addHoursToIso(timestamp, 24));
        } else if (targetStatus === "new") {
          pushTask("contact-client", "new", timestamp, 0);
        } else if (targetStatus === "declined") {
          closeOpenTasks("declined", "canceled");
        }
      } else if (taskAction === "no-answer") {
        touchTask(activeTask, "completed", "no-answer");
        const activeKind = activeTask ? normalizeLeadTaskKind(activeTask.kind, "contact-client") : "contact-client";
        closeOpenTasks("no-answer-follow-up", "canceled");
        if (activeKind === "retry-next-morning" || noResponseAttempts >= 2) {
          nextStatus = "declined";
          noResponseAttempts = 2;
        } else if (activeKind === "retry-3h" || noResponseAttempts >= 1) {
          nextStatus = "no-response";
          noResponseAttempts = 2;
          pushTask("retry-next-morning", "no-response", buildNextChicagoMorningIso(timestamp), 2);
        } else {
          nextStatus = "no-response";
          noResponseAttempts = 1;
          pushTask("retry-3h", "no-response", addHoursToIso(timestamp, 3), 1);
        }
      } else if (taskAction === "complete") {
        touchTask(activeTask, "completed", "completed");
      }
    } else if (hasStatusUpdate) {
      closeOpenTasks("stage-changed", "canceled");
      if (nextStatus === "new") {
        noResponseAttempts = 0;
        pushTask("contact-client", "new", timestamp, 0);
      } else if (nextStatus === "no-response") {
        noResponseAttempts = Math.max(1, noResponseAttempts || 1);
        pushTask("retry-3h", "no-response", addHoursToIso(timestamp, 3), 1);
      } else if (nextStatus === "discussion") {
        noResponseAttempts = 0;
        pushTask("discussion-followup", "discussion", nextContactAt || addHoursToIso(timestamp, 24));
      } else if (nextStatus === "declined") {
        noResponseAttempts = Math.max(noResponseAttempts, 0);
      } else if (nextStatus === "confirmed") {
        noResponseAttempts = 0;
      }
    }

    if (!tasks.some((task) => task.status === "open") && nextStatus === "new") {
      pushTask("contact-client", "new", timestamp, 0);
    }

    const normalizedTasks = normalizeLeadTasks(tasks, {
      createdAt: timestamp,
      stage: nextStatus,
    }).slice(0, 30);

    adminLead.status = nextStatus;
    adminLead.noResponseAttempts = noResponseAttempts;
    adminLead.updatedAt = timestamp;
    if (hasContactId) {
      entry.contactId = normalizeString(updates.contactId, 120);
    }
    if (managerId) {
      adminLead.managerId = managerId;
    } else {
      delete adminLead.managerId;
    }
    if (managerName) {
      adminLead.managerName = managerName;
    } else {
      delete adminLead.managerName;
    }
    if (managerEmail) {
      adminLead.managerEmail = managerEmail;
    } else {
      delete adminLead.managerEmail;
    }
    if (notes) {
      adminLead.notes = notes;
    } else if (hasNotesUpdate) {
      delete adminLead.notes;
    }
    if (nextStatus === "discussion") {
      adminLead.discussionNextContactAt =
        nextContactAt || (normalizedTasks.find((task) => task.status === "open") || {}).dueAt || "";
    } else {
      delete adminLead.discussionNextContactAt;
    }
    if (nextStatus === "confirmed") {
      adminLead.confirmedAt = normalizeLeadTaskDueAt(adminLead.confirmedAt, timestamp);
    } else {
      delete adminLead.confirmedAt;
    }
    if (nextStatus === "declined") {
      adminLead.declinedAt = normalizeLeadTaskDueAt(adminLead.declinedAt, timestamp);
    } else {
      delete adminLead.declinedAt;
    }
    if (normalizedTasks.length > 0) {
      adminLead.tasks = normalizedTasks;
    } else {
      delete adminLead.tasks;
    }

    const smsHistory = hasSmsHistory
      ? normalizeAdminSmsHistoryEntries(updates.smsHistory, timestamp)
      : getEntrySmsHistory(entry);
    if (smsHistory.length > 0) {
      payload.adminSms = {
        ...getEntryAdminSmsData(entry),
        history: smsHistory,
        updatedAt: timestamp,
      };
    } else {
      delete payload.adminSms;
    }

    payload.adminLead = adminLead;
    entry.updatedAt = timestamp;
    entry.payloadForRetry = payload;

    if (nextStatus === "confirmed") {
      applyOrderEntryUpdates(entry, {
        createOrder: true,
        orderStatus: "new",
      });
    }

    return entry;
  }

  function getQuoteOpsFilters(req) {
    const reqUrl = getRequestUrl(req);
    const section = normalizeString(reqUrl.searchParams.get("section"), 32).toLowerCase();
    const status = normalizeString(reqUrl.searchParams.get("status"), 32).toLowerCase();
    const serviceType = normalizeString(reqUrl.searchParams.get("serviceType"), 32).toLowerCase();
    const leadStatus = normalizeString(reqUrl.searchParams.get("leadStatus"), 40).toLowerCase();
    const managerId = normalizeString(reqUrl.searchParams.get("managerId"), 120);
    const q = normalizeString(reqUrl.searchParams.get("q"), 200);
    return {
      reqUrl,
      filters: {
        section: ["funnel", "tasks", "list"].includes(section) ? section : "list",
        status: status || "all",
        serviceType: serviceType || "all",
        leadStatus: leadStatus || "all",
        managerId,
        q,
      },
    };
  }

  return {
    normalizeLeadStatus,
    formatLeadStatusLabel,
    normalizeLeadTaskDueAt,
    getLeadStatus,
    getEntryLeadTasks,
    getEntryOpenLeadTask,
    applyLeadEntryUpdates,
    getQuoteOpsFilters,
  };
}

module.exports = {
  createAdminLeadDomain,
};
