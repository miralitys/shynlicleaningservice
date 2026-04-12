"use strict";

const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const {
  sanitizeGoogleCalendarConnection,
  sanitizeGoogleCalendarSync,
} = require("./admin-google-calendar");
const { sanitizeStaffW9Record } = require("./staff-w9");

const STORE_VERSION = 1;
const STAFF_STATUS_VALUES = ["active", "inactive", "on_leave"];
const STAFF_STATUS_SET = new Set(STAFF_STATUS_VALUES);
const ASSIGNMENT_STATUS_VALUES = ["planned", "confirmed", "completed", "issue"];
const ASSIGNMENT_STATUS_SET = new Set(ASSIGNMENT_STATUS_VALUES);

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 200).toLowerCase();
}

function normalizeArray(values, maxItems = 8, maxLength = 120) {
  const items = Array.isArray(values) ? values : values ? [values] : [];
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const normalized = normalizeString(item, maxLength);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }

  return output;
}

function getSafeStaffStatus(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return STAFF_STATUS_SET.has(normalized) ? normalized : "active";
}

function getSafeAssignmentStatus(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return ASSIGNMENT_STATUS_SET.has(normalized) ? normalized : "planned";
}

function sanitizeStaffRecord(input = {}) {
  const createdAt = normalizeString(input.createdAt, 80) || new Date().toISOString();
  return {
    id: normalizeString(input.id, 120) || crypto.randomUUID(),
    name: normalizeString(input.name || input.fullName, 120),
    role: normalizeString(input.role, 80),
    phone: normalizeString(input.phone, 80),
    email: normalizeEmail(input.email),
    address: normalizeString(input.address, 500),
    status: getSafeStaffStatus(input.status),
    notes: normalizeString(input.notes, 800),
    calendar: sanitizeGoogleCalendarConnection(input.calendar),
    w9: sanitizeStaffW9Record(input.w9),
    createdAt,
    updatedAt: normalizeString(input.updatedAt, 80) || createdAt,
  };
}

function sanitizeAssignmentRecord(input = {}) {
  const createdAt = normalizeString(input.createdAt, 80) || new Date().toISOString();
  return {
    entryId: normalizeString(input.entryId, 120),
    staffIds: normalizeArray(input.staffIds, 6, 120),
    scheduleDate: normalizeString(input.scheduleDate, 32),
    scheduleTime: normalizeString(input.scheduleTime, 32),
    status: getSafeAssignmentStatus(input.status),
    notes: normalizeString(input.notes, 800),
    calendarSync: sanitizeGoogleCalendarSync(input.calendarSync),
    createdAt,
    updatedAt: normalizeString(input.updatedAt, 80) || createdAt,
  };
}

function shouldKeepAssignmentRecord(record) {
  return Boolean(
    record.entryId &&
      (
        record.staffIds.length > 0 ||
        record.scheduleDate ||
        record.scheduleTime ||
        record.notes ||
        record.status !== "planned"
      )
  );
}

function sanitizeState(raw = {}) {
  const nextState = {
    version: STORE_VERSION,
    staff: Array.isArray(raw.staff)
      ? raw.staff.map((record) => sanitizeStaffRecord(record)).filter((record) => Boolean(record.name))
      : [],
    assignments: Array.isArray(raw.assignments)
      ? raw.assignments
          .map((record) => sanitizeAssignmentRecord(record))
          .filter((record) => shouldKeepAssignmentRecord(record))
      : [],
  };

  nextState.staff.sort((left, right) => {
    if (left.status !== right.status) {
      if (left.status === "active") return -1;
      if (right.status === "active") return 1;
    }
    return left.name.localeCompare(right.name, "ru");
  });

  nextState.assignments.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return nextState;
}

async function readState(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return sanitizeState({});
    }
    throw error;
  }
}

function cloneStaffRecord(record) {
  return {
    ...record,
    calendar: record.calendar ? JSON.parse(JSON.stringify(record.calendar)) : null,
    w9: record.w9 ? JSON.parse(JSON.stringify(record.w9)) : null,
  };
}

function cloneAssignmentRecord(record) {
  return {
    ...record,
    staffIds: [...record.staffIds],
    calendarSync: record.calendarSync ? JSON.parse(JSON.stringify(record.calendarSync)) : null,
  };
}

function cloneState(state) {
  return {
    version: STORE_VERSION,
    staff: Array.isArray(state.staff) ? state.staff.map(cloneStaffRecord) : [],
    assignments: Array.isArray(state.assignments)
      ? state.assignments.map(cloneAssignmentRecord)
      : [],
  };
}

function cloneSnapshot(state) {
  return {
    staff: Array.isArray(state.staff) ? state.staff.map(cloneStaffRecord) : [],
    assignments: Array.isArray(state.assignments)
      ? state.assignments.map(cloneAssignmentRecord)
      : [],
  };
}

function applyCreateStaffState(state, input = {}) {
  const nextState = cloneState(state);
  const record = sanitizeStaffRecord(input);
  if (!record.name) {
    throw new Error("STAFF_NAME_REQUIRED");
  }
  nextState.staff.push(record);
  const sanitized = sanitizeState(nextState);
  return {
    state: sanitized,
    record: cloneStaffRecord(sanitized.staff.find((candidate) => candidate.id === record.id) || record),
  };
}

function applyUpdateStaffState(state, staffId, input = {}) {
  const nextState = cloneState(state);
  const normalizedId = normalizeString(staffId, 120);
  const existing = nextState.staff.find((record) => record.id === normalizedId);
  if (!existing) {
    throw new Error("STAFF_NOT_FOUND");
  }

  const record = sanitizeStaffRecord({
    ...existing,
    ...input,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });
  if (!record.name) {
    throw new Error("STAFF_NAME_REQUIRED");
  }

  Object.assign(existing, record);
  const sanitized = sanitizeState(nextState);
  return {
    state: sanitized,
    record: cloneStaffRecord(sanitized.staff.find((candidate) => candidate.id === normalizedId) || existing),
  };
}

function applyDeleteStaffState(state, staffId) {
  const nextState = cloneState(state);
  const normalizedId = normalizeString(staffId, 120);
  const existing = nextState.staff.find((record) => record.id === normalizedId);
  if (!existing) {
    throw new Error("STAFF_NOT_FOUND");
  }

  const baseAssignmentsByEntryId = new Map(
    nextState.assignments.map((record) => [record.entryId, cloneAssignmentRecord(record)])
  );

  nextState.staff = nextState.staff.filter((record) => record.id !== normalizedId);
  nextState.assignments = nextState.assignments
    .map((record) =>
      sanitizeAssignmentRecord({
        ...record,
        staffIds: record.staffIds.filter((candidateId) => candidateId !== normalizedId),
        updatedAt: new Date().toISOString(),
      })
    )
    .filter((record) => shouldKeepAssignmentRecord(record));

  const sanitized = sanitizeState(nextState);
  const nextAssignmentsByEntryId = new Map(
    sanitized.assignments.map((record) => [record.entryId, cloneAssignmentRecord(record)])
  );
  const updatedAssignments = [];
  const removedAssignmentIds = [];

  for (const [entryId, record] of nextAssignmentsByEntryId.entries()) {
    const previous = baseAssignmentsByEntryId.get(entryId);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(record)) {
      updatedAssignments.push(cloneAssignmentRecord(record));
    }
  }

  for (const entryId of baseAssignmentsByEntryId.keys()) {
    if (!nextAssignmentsByEntryId.has(entryId)) {
      removedAssignmentIds.push(entryId);
    }
  }

  return {
    state: sanitized,
    record: cloneStaffRecord(existing),
    updatedAssignments,
    removedAssignmentIds,
  };
}

function applySetAssignmentState(state, entryId, input = {}) {
  const nextState = cloneState(state);
  const normalizedEntryId = normalizeString(entryId, 120);
  if (!normalizedEntryId) {
    throw new Error("ENTRY_ID_REQUIRED");
  }

  const existing = nextState.assignments.find((record) => record.entryId === normalizedEntryId);
  const record = sanitizeAssignmentRecord({
    ...existing,
    ...input,
    entryId: normalizedEntryId,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  if (!shouldKeepAssignmentRecord(record)) {
    nextState.assignments = nextState.assignments.filter(
      (candidate) => candidate.entryId !== normalizedEntryId
    );
    const sanitized = sanitizeState(nextState);
    return {
      state: sanitized,
      record: null,
      removedEntryId: normalizedEntryId,
    };
  }

  if (existing) {
    Object.assign(existing, record);
  } else {
    nextState.assignments.unshift(record);
  }

  const sanitized = sanitizeState(nextState);
  return {
    state: sanitized,
    record: cloneAssignmentRecord(
      sanitized.assignments.find((candidate) => candidate.entryId === normalizedEntryId) || record
    ),
    removedEntryId: "",
  };
}

function applyClearAssignmentState(state, entryId) {
  const nextState = cloneState(state);
  const normalizedEntryId = normalizeString(entryId, 120);
  const existing = nextState.assignments.find((record) => record.entryId === normalizedEntryId);
  if (!existing) {
    return {
      state: sanitizeState(nextState),
      record: null,
    };
  }

  nextState.assignments = nextState.assignments.filter(
    (record) => record.entryId !== normalizedEntryId
  );
  return {
    state: sanitizeState(nextState),
    record: cloneAssignmentRecord(existing),
  };
}

function createFileBackedAdminStaffStore(options = {}) {
  const filePath = path.resolve(
    options.filePath ||
      process.env.ADMIN_STAFF_STORE_PATH ||
      path.join(process.cwd(), "data", "admin-staff-store.json")
  );
  let statePromise = null;
  let writeQueue = Promise.resolve();

  async function ensureState() {
    if (!statePromise) {
      statePromise = readState(filePath);
    }
    return statePromise;
  }

  async function persistState(state) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  function runSerialized(operation) {
    const nextOperation = writeQueue.then(async () => {
      const state = await ensureState();
      const result = await operation(state);
      await persistState(state);
      return result;
    });
    writeQueue = nextOperation.catch(() => {});
    return nextOperation;
  }

  return {
    mode: "file",
    filePath,
    async getSnapshot() {
      const state = await ensureState();
      return cloneSnapshot(state);
    },
    async createStaff(input = {}) {
      return runSerialized(async (state) => {
        const { state: nextState, record } = applyCreateStaffState(state, input);
        state.staff = nextState.staff;
        state.assignments = nextState.assignments;
        return record;
      });
    },
    async updateStaff(staffId, input = {}) {
      return runSerialized(async (state) => {
        const { state: nextState, record } = applyUpdateStaffState(state, staffId, input);
        state.staff = nextState.staff;
        state.assignments = nextState.assignments;
        return record;
      });
    },
    async deleteStaff(staffId) {
      return runSerialized(async (state) => {
        const { state: nextState, record } = applyDeleteStaffState(state, staffId);
        state.staff = nextState.staff;
        state.assignments = nextState.assignments;
        return record;
      });
    },
    async setAssignment(entryId, input = {}) {
      return runSerialized(async (state) => {
        const { state: nextState, record } = applySetAssignmentState(state, entryId, input);
        state.staff = nextState.staff;
        state.assignments = nextState.assignments;
        return record;
      });
    },
    async clearAssignment(entryId) {
      return runSerialized(async (state) => {
        const { state: nextState, record } = applyClearAssignmentState(state, entryId);
        state.staff = nextState.staff;
        state.assignments = nextState.assignments;
        return record;
      });
    },
  };
}

function createSupabaseBackedAdminStaffStore(options = {}, supabaseClient) {
  let cacheState = sanitizeState({});

  async function refreshCache() {
    const snapshot = await supabaseClient.fetchSnapshot();
    cacheState = sanitizeState(snapshot);
    return cloneState(cacheState);
  }

  return {
    mode: "supabase",
    async getSnapshot() {
      try {
        const state = await refreshCache();
        return cloneSnapshot(state);
      } catch {
        return cloneSnapshot(cacheState);
      }
    },
    async createStaff(input = {}) {
      const { state: nextState, record } = applyCreateStaffState(cacheState, input);
      await supabaseClient.upsertStaff(record);
      cacheState = nextState;
      return cloneStaffRecord(record);
    },
    async updateStaff(staffId, input = {}) {
      const baseState = await refreshCache();
      const { state: nextState, record } = applyUpdateStaffState(baseState, staffId, input);
      await supabaseClient.upsertStaff(record);
      cacheState = nextState;
      return cloneStaffRecord(record);
    },
    async deleteStaff(staffId) {
      const baseState = await refreshCache();
      const { state: nextState, record, updatedAssignments, removedAssignmentIds } =
        applyDeleteStaffState(baseState, staffId);

      await supabaseClient.deleteStaff(record.id);
      for (const assignment of updatedAssignments) {
        await supabaseClient.upsertAssignment(assignment);
      }
      for (const entryId of removedAssignmentIds) {
        await supabaseClient.deleteAssignment(entryId);
      }

      cacheState = nextState;
      return cloneStaffRecord(record);
    },
    async setAssignment(entryId, input = {}) {
      const baseState = await refreshCache();
      const { state: nextState, record, removedEntryId } = applySetAssignmentState(
        baseState,
        entryId,
        input
      );

      if (record) {
        await supabaseClient.upsertAssignment(record);
      } else if (removedEntryId) {
        await supabaseClient.deleteAssignment(removedEntryId);
      }

      cacheState = nextState;
      return record ? cloneAssignmentRecord(record) : null;
    },
    async clearAssignment(entryId) {
      const baseState = await refreshCache();
      const { state: nextState, record } = applyClearAssignmentState(baseState, entryId);
      if (!record) {
        cacheState = nextState;
        return null;
      }

      await supabaseClient.deleteAssignment(record.entryId);
      cacheState = nextState;
      return cloneAssignmentRecord(record);
    },
  };
}

function createAdminStaffStore(options = {}) {
  const fileStore = createFileBackedAdminStaffStore(options);
  const supabaseClient =
    typeof options.createSupabaseAdminStaffClient === "function"
      ? options.createSupabaseAdminStaffClient({
          env: options.env || process.env,
          fetch: options.fetch || global.fetch,
        })
      : null;
  const remoteEnabled = Boolean(
    supabaseClient &&
      typeof supabaseClient.isConfigured === "function" &&
      supabaseClient.isConfigured()
  );

  if (!remoteEnabled) {
    return fileStore;
  }

  return createSupabaseBackedAdminStaffStore(options, supabaseClient);
}

module.exports = {
  ASSIGNMENT_STATUS_VALUES,
  STAFF_STATUS_VALUES,
  createAdminStaffStore,
};
