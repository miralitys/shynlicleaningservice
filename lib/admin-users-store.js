"use strict";

const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");

const STORE_VERSION = 1;
const USER_STATUS_VALUES = ["active", "inactive"];
const USER_STATUS_SET = new Set(USER_STATUS_VALUES);

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 200).toLowerCase();
}

function normalizePhone(value) {
  return normalizeString(value, 80);
}

function getSafeUserStatus(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return USER_STATUS_SET.has(normalized) ? normalized : "active";
}

function sanitizeUserRecord(input = {}) {
  const createdAt = normalizeString(input.createdAt, 80) || new Date().toISOString();
  return {
    id: normalizeString(input.id, 120) || crypto.randomUUID(),
    staffId: normalizeString(input.staffId, 120),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    passwordHash: normalizeString(input.passwordHash, 4096),
    status: getSafeUserStatus(input.status),
    createdAt,
    updatedAt: normalizeString(input.updatedAt, 80) || createdAt,
    lastLoginAt: normalizeString(input.lastLoginAt, 80),
  };
}

function sanitizeState(raw = {}) {
  const nextState = {
    version: STORE_VERSION,
    users: Array.isArray(raw.users)
      ? raw.users
          .map((record) => sanitizeUserRecord(record))
          .filter((record) => Boolean(record.staffId && record.email && record.passwordHash))
      : [],
  };

  nextState.users.sort((left, right) => {
    if (left.status !== right.status) {
      if (left.status === "active") return -1;
      if (right.status === "active") return 1;
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

function ensureUniqueUserConstraints(users, record, currentUserId = "") {
  const emailMatch = users.find((candidate) => candidate.email === record.email && candidate.id !== currentUserId);
  if (emailMatch) {
    throw new Error("USER_EMAIL_EXISTS");
  }

  const staffMatch = users.find((candidate) => candidate.staffId === record.staffId && candidate.id !== currentUserId);
  if (staffMatch) {
    throw new Error("USER_STAFF_EXISTS");
  }
}

function applyCreateUserState(state, input = {}) {
  const nextState = cloneState(state);
  const record = sanitizeUserRecord(input);

  if (!record.staffId) throw new Error("USER_STAFF_REQUIRED");
  if (!record.email) throw new Error("USER_EMAIL_REQUIRED");
  if (!record.passwordHash) throw new Error("USER_PASSWORD_HASH_REQUIRED");

  ensureUniqueUserConstraints(nextState.users, record);
  nextState.users.push(record);
  const sanitized = sanitizeState(nextState);
  return {
    state: sanitized,
    record: cloneUserRecord(sanitized.users.find((candidate) => candidate.id === record.id) || record),
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
  if (!record.passwordHash) throw new Error("USER_PASSWORD_HASH_REQUIRED");

  ensureUniqueUserConstraints(nextState.users, record, normalizedId);
  Object.assign(existing, record);
  const sanitized = sanitizeState(nextState);
  return {
    state: sanitized,
    record: cloneUserRecord(sanitized.users.find((candidate) => candidate.id === normalizedId) || existing),
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

function createAdminUsersStore(options = {}) {
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
    const record = state.users.find((candidate) => candidate.email === normalizeEmail(email)) || null;
    return record ? cloneUserRecord(record, options) : null;
  }

  async function getUserById(userId, options = {}) {
    const state = await ensureState();
    const record = state.users.find((candidate) => candidate.id === normalizeString(userId, 120)) || null;
    return record ? cloneUserRecord(record, options) : null;
  }

  return {
    filePath,
    async getSnapshot() {
      const state = await ensureState();
      return {
        users: Array.isArray(state.users) ? state.users.map((record) => cloneUserRecord(record)) : [],
      };
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
        const current = state.users.find((candidate) => candidate.id === normalizeString(userId, 120));
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

module.exports = {
  USER_STATUS_VALUES,
  createAdminUsersStore,
};
