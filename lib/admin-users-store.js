"use strict";

const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");

const STORE_VERSION = 1;
const USER_STATUS_VALUES = ["active", "inactive"];
const USER_STATUS_SET = new Set(USER_STATUS_VALUES);
const USER_ROLE_VALUES = ["admin", "manager", "cleaner"];
const USER_ROLE_SET = new Set(USER_ROLE_VALUES);

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 200).toLowerCase();
}

function normalizePhone(value) {
  return normalizeString(value, 80);
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  const normalized = normalizeString(value, 20).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getSafeUserStatus(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return USER_STATUS_SET.has(normalized) ? normalized : "active";
}

function getSafeUserRole(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return USER_ROLE_SET.has(normalized) ? normalized : "cleaner";
}

function getDefaultEmployeeFlag(role) {
  return getSafeUserRole(role) !== "admin";
}

function sanitizeUserRecord(input = {}) {
  const createdAt = normalizeString(input.createdAt, 80) || new Date().toISOString();
  const role = getSafeUserRole(input.role);
  return {
    id: normalizeString(input.id, 120) || crypto.randomUUID(),
    staffId: normalizeString(input.staffId, 120),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    passwordHash: normalizeString(input.passwordHash, 4096),
    status: getSafeUserStatus(input.status),
    role,
    isEmployee:
      Object.prototype.hasOwnProperty.call(input, "isEmployee")
        ? normalizeBoolean(input.isEmployee)
        : getDefaultEmployeeFlag(role),
    createdAt,
    updatedAt: normalizeString(input.updatedAt, 80) || createdAt,
    lastLoginAt: normalizeString(input.lastLoginAt, 80),
    emailVerificationRequired: normalizeBoolean(input.emailVerificationRequired),
    emailVerifiedAt: normalizeString(input.emailVerifiedAt, 80),
    inviteEmailSentAt: normalizeString(input.inviteEmailSentAt, 80),
    inviteEmailLastError: normalizeString(input.inviteEmailLastError, 240),
  };
}

function sanitizeState(raw = {}) {
  const nextState = {
    version: STORE_VERSION,
    users: Array.isArray(raw.users)
      ? raw.users
          .map((record) => sanitizeUserRecord(record))
          .filter((record) => Boolean(record.staffId && record.email))
      : [],
  };

  nextState.users.sort((left, right) => {
    if (left.status !== right.status) {
      if (left.status === "active") return -1;
      if (right.status === "active") return 1;
    }
    if (left.role !== right.role) {
      if (left.role === "admin") return -1;
      if (right.role === "admin") return 1;
      if (left.role === "manager" && right.role === "cleaner") return -1;
      if (left.role === "cleaner" && right.role === "manager") return 1;
    }
    return left.email.localeCompare(right.email, "en");
  });

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

function cloneUserRecord(record, options = {}) {
  if (options.includeSecret) return { ...record };
  const { passwordHash, ...safeRecord } = record;
  void passwordHash;
  return { ...safeRecord };
}

function cloneState(state) {
  return {
    version: STORE_VERSION,
    users: Array.isArray(state.users) ? state.users.map((record) => ({ ...record })) : [],
  };
}

function cloneSnapshot(state, options = {}) {
  return {
    users: Array.isArray(state.users)
      ? state.users.map((record) => cloneUserRecord(record, options))
      : [],
  };
}

function ensureUniqueUserConstraints(users, record, currentUserId = "") {
  const emailMatch = users.find(
    (candidate) => candidate.email === record.email && candidate.id !== currentUserId
  );
  if (emailMatch) {
    throw new Error("USER_EMAIL_EXISTS");
  }

  const staffMatch = users.find(
    (candidate) => candidate.staffId === record.staffId && candidate.id !== currentUserId
  );
  if (staffMatch) {
    throw new Error("USER_STAFF_EXISTS");
  }
}

function applyCreateUserState(state, input = {}) {
  const nextState = cloneState(state);
  const record = sanitizeUserRecord(input);

  if (!record.staffId) throw new Error("USER_STAFF_REQUIRED");
  if (!record.email) throw new Error("USER_EMAIL_REQUIRED");

  ensureUniqueUserConstraints(nextState.users, record);
  nextState.users.push(record);
  const sanitized = sanitizeState(nextState);
  return {
    state: sanitized,
    record: cloneUserRecord(
      sanitized.users.find((candidate) => candidate.id === record.id) || record
    ),
  };
}

function applyUpdateUserState(state, userId, input = {}) {
  const nextState = cloneState(state);
  const normalizedId = normalizeString(userId, 120);
  const existing = nextState.users.find((record) => record.id === normalizedId);
  if (!existing) throw new Error("USER_NOT_FOUND");

  const record = sanitizeUserRecord({
    ...existing,
    ...input,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });

  if (!record.staffId) throw new Error("USER_STAFF_REQUIRED");
  if (!record.email) throw new Error("USER_EMAIL_REQUIRED");

  ensureUniqueUserConstraints(nextState.users, record, normalizedId);
  Object.assign(existing, record);
  const sanitized = sanitizeState(nextState);
  return {
    state: sanitized,
    record: cloneUserRecord(
      sanitized.users.find((candidate) => candidate.id === normalizedId) || existing
    ),
  };
}

function applyDeleteUserState(state, userId) {
  const nextState = cloneState(state);
  const normalizedId = normalizeString(userId, 120);
  const existing = nextState.users.find((record) => record.id === normalizedId);
  if (!existing) throw new Error("USER_NOT_FOUND");

  nextState.users = nextState.users.filter((record) => record.id !== normalizedId);
  return {
    state: sanitizeState(nextState),
    record: cloneUserRecord(existing),
  };
}

function findUserRecordByEmail(state, email) {
  return state.users.find((candidate) => candidate.email === normalizeEmail(email)) || null;
}

function findUserRecordById(state, userId) {
  return state.users.find((candidate) => candidate.id === normalizeString(userId, 120)) || null;
}

function createFileBackedAdminUsersStore(options = {}) {
  const filePath = path.resolve(
    options.filePath ||
      process.env.ADMIN_USERS_STORE_PATH ||
      path.join(process.cwd(), "data", "admin-users-store.json")
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

  function runSerialized(work) {
    const nextOperation = writeQueue.then(async () => {
      const state = await ensureState();
      const result = await work(state);
      await persistState(state);
      return result;
    });
    writeQueue = nextOperation.catch(() => {});
    return nextOperation;
  }

  async function findUserByEmail(email, options = {}) {
    const state = await ensureState();
    const record = findUserRecordByEmail(state, email);
    return record ? cloneUserRecord(record, options) : null;
  }

  async function getUserById(userId, options = {}) {
    const state = await ensureState();
    const record = findUserRecordById(state, userId);
    return record ? cloneUserRecord(record, options) : null;
  }

  return {
    mode: "file",
    filePath,
    async getSnapshot() {
      const state = await ensureState();
      return cloneSnapshot(state);
    },
    findUserByEmail,
    getUserById,
    async createUser(input = {}) {
      return runSerialized(async (state) => {
        const { state: nextState, record } = applyCreateUserState(state, input);
        state.users = nextState.users;
        return record;
      });
    },
    async updateUser(userId, input = {}) {
      return runSerialized(async (state) => {
        const { state: nextState, record } = applyUpdateUserState(state, userId, input);
        state.users = nextState.users;
        return record;
      });
    },
    async deleteUser(userId) {
      return runSerialized(async (state) => {
        const { state: nextState, record } = applyDeleteUserState(state, userId);
        state.users = nextState.users;
        return record;
      });
    },
    async recordLogin(userId) {
      return runSerialized(async (state) => {
        const current = findUserRecordById(state, userId);
        if (!current) throw new Error("USER_NOT_FOUND");
        const { state: nextState, record } = applyUpdateUserState(state, userId, {
          lastLoginAt: new Date().toISOString(),
        });
        state.users = nextState.users;
        return record;
      });
    },
  };
}

function createSupabaseBackedAdminUsersStore(options = {}, supabaseClient) {
  let cacheState = sanitizeState({});

  async function refreshCache() {
    const snapshot = await supabaseClient.fetchSnapshot();
    cacheState = sanitizeState(snapshot);
    return cloneState(cacheState);
  }

  async function getFreshStateOrCache() {
    try {
      return await refreshCache();
    } catch (error) {
      if (cacheState.users.length > 0) {
        return cloneState(cacheState);
      }
      throw error;
    }
  }

  async function findUserByEmail(email, options = {}) {
    const state = await getFreshStateOrCache();
    const record = findUserRecordByEmail(state, email);
    return record ? cloneUserRecord(record, options) : null;
  }

  async function getUserById(userId, options = {}) {
    const state = await getFreshStateOrCache();
    const record = findUserRecordById(state, userId);
    return record ? cloneUserRecord(record, options) : null;
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
    findUserByEmail,
    getUserById,
    async createUser(input = {}) {
      const baseState = await refreshCache();
      const { state: nextState, record } = applyCreateUserState(baseState, input);
      const storedRecord = nextState.users.find((candidate) => candidate.id === record.id);
      await supabaseClient.upsertUser(storedRecord);
      cacheState = nextState;
      return cloneUserRecord(storedRecord);
    },
    async updateUser(userId, input = {}) {
      const baseState = await refreshCache();
      const { state: nextState, record } = applyUpdateUserState(baseState, userId, input);
      const storedRecord = nextState.users.find((candidate) => candidate.id === record.id);
      await supabaseClient.upsertUser(storedRecord);
      cacheState = nextState;
      return cloneUserRecord(storedRecord);
    },
    async deleteUser(userId) {
      const baseState = await refreshCache();
      const { state: nextState, record } = applyDeleteUserState(baseState, userId);
      await supabaseClient.deleteUser(record.id);
      cacheState = nextState;
      return record;
    },
    async recordLogin(userId) {
      const baseState = await refreshCache();
      const current = findUserRecordById(baseState, userId);
      if (!current) throw new Error("USER_NOT_FOUND");
      const { state: nextState, record } = applyUpdateUserState(baseState, userId, {
        lastLoginAt: new Date().toISOString(),
      });
      const storedRecord = nextState.users.find((candidate) => candidate.id === record.id);
      await supabaseClient.upsertUser(storedRecord);
      cacheState = nextState;
      return cloneUserRecord(storedRecord);
    },
  };
}

function createAdminUsersStore(options = {}) {
  const fileStore = createFileBackedAdminUsersStore(options);
  const supabaseClient =
    typeof options.createSupabaseAdminUsersClient === "function"
      ? options.createSupabaseAdminUsersClient({
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

  return createSupabaseBackedAdminUsersStore(options, supabaseClient);
}

module.exports = {
  USER_ROLE_VALUES,
  USER_STATUS_VALUES,
  createAdminUsersStore,
};
