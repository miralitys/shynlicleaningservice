"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const adminAuth = require("./admin-auth");

const DEFAULT_USER_STORE_FILE = "data/admin-users.json";
const DEFAULT_OWNER_FIRST_NAME = "Shynli";
const DEFAULT_OWNER_LAST_NAME = "Admin";
const DEFAULT_NEW_USER_PASSWORD_HINT = "1HKLOR1!";

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 320).toLowerCase();
}

function normalizeName(value) {
  return normalizeString(String(value || "").replace(/\s+/g, " "), 120);
}

function normalizeIsoDate(value, fallbackValue) {
  const normalized = normalizeString(value, 64);
  if (!normalized) return fallbackValue;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallbackValue;
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase() === "owner" ? "owner" : "staff";
}

function normalizeTotpSecret(value) {
  return normalizeString(value, 256)
    .replace(/\s+/g, "")
    .replace(/=+$/g, "")
    .toUpperCase();
}

function resolveAdminUserStoreFile(env = process.env, baseDir = process.cwd()) {
  const configuredPath = normalizeString(env.ADMIN_USER_STORE_FILE, 2048);
  return path.resolve(baseDir, configuredPath || DEFAULT_USER_STORE_FILE);
}

function getDefaultUserPasswordHash(env = process.env, systemConfig = {}) {
  return normalizeString(
    env.ADMIN_DEFAULT_USER_PASSWORD_HASH || systemConfig.passwordHash || adminAuth.DEFAULT_ADMIN_PASSWORD_HASH,
    4096
  );
}

function getDefaultUserPasswordHint(env = process.env) {
  return normalizeString(env.ADMIN_DEFAULT_USER_PASSWORD_HINT || DEFAULT_NEW_USER_PASSWORD_HINT, 200);
}

function createBootstrapOwner(systemConfig, env = process.env, nowIso = new Date().toISOString()) {
  const explicitOwnerPasswordHash = normalizeString(env.ADMIN_PASSWORD_HASH, 4096);
  const explicitOwnerTotpSecret = normalizeTotpSecret(systemConfig.configuredTotpSecret || env.ADMIN_TOTP_SECRET);
  const ownerNeedsSetup = !(explicitOwnerPasswordHash && explicitOwnerTotpSecret);
  return {
    id: "owner",
    email: normalizeEmail(systemConfig.email || env.ADMIN_EMAIL || adminAuth.DEFAULT_ADMIN_EMAIL),
    firstName: normalizeName(env.ADMIN_OWNER_FIRST_NAME || DEFAULT_OWNER_FIRST_NAME),
    lastName: normalizeName(env.ADMIN_OWNER_LAST_NAME || DEFAULT_OWNER_LAST_NAME),
    role: "owner",
    passwordHash: normalizeString(
      systemConfig.passwordHash || env.ADMIN_PASSWORD_HASH || adminAuth.DEFAULT_ADMIN_PASSWORD_HASH,
      4096
    ),
    mustChangePassword: ownerNeedsSetup,
    totpSecret: ownerNeedsSetup ? "" : explicitOwnerTotpSecret,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: "system",
    lastLoginAt: "",
    setupCompletedAt: ownerNeedsSetup ? "" : nowIso,
  };
}

function shouldReopenBootstrapOwnerSetup(existingUser, bootstrapOwner) {
  const samePasswordHash = normalizeString(existingUser && existingUser.passwordHash, 4096) === bootstrapOwner.passwordHash;
  const missingTotpSecret = !normalizeTotpSecret(existingUser && existingUser.totpSecret);
  const createdBySystem = normalizeString(existingUser && existingUser.createdBy, 128) === "system";
  return Boolean(
    existingUser &&
      existingUser.role === "owner" &&
      bootstrapOwner.mustChangePassword &&
      createdBySystem &&
      samePasswordHash &&
      missingTotpSecret
  );
}

function normalizeUserRecord(rawUser, systemConfig, env = process.env, nowIso = new Date().toISOString()) {
  const email = normalizeEmail(rawUser && rawUser.email);
  if (!email) return null;

  return {
    id: normalizeString(rawUser.id, 128) || crypto.randomUUID(),
    email,
    firstName: normalizeName(rawUser.firstName),
    lastName: normalizeName(rawUser.lastName),
    role: normalizeRole(rawUser.role),
    passwordHash: normalizeString(rawUser.passwordHash, 4096) || getDefaultUserPasswordHash(env, systemConfig),
    mustChangePassword: Boolean(rawUser.mustChangePassword),
    totpSecret: normalizeTotpSecret(rawUser.totpSecret),
    createdAt: normalizeIsoDate(rawUser.createdAt, nowIso),
    updatedAt: normalizeIsoDate(rawUser.updatedAt, nowIso),
    createdBy: normalizeString(rawUser.createdBy, 128),
    lastLoginAt: normalizeIsoDate(rawUser.lastLoginAt, ""),
    setupCompletedAt: normalizeIsoDate(rawUser.setupCompletedAt, ""),
  };
}

function sortUsers(users) {
  return [...users].sort((left, right) => {
    if (left.role === "owner" && right.role !== "owner") return -1;
    if (right.role === "owner" && left.role !== "owner") return 1;

    const nameCompare = `${left.lastName} ${left.firstName}`.localeCompare(
      `${right.lastName} ${right.firstName}`,
      "en",
      { sensitivity: "base" }
    );
    if (nameCompare !== 0) return nameCompare;
    return left.email.localeCompare(right.email, "en", { sensitivity: "base" });
  });
}

function ensureBootstrapOwner(store, systemConfig, env = process.env) {
  const nowIso = new Date().toISOString();
  const bootstrapOwner = createBootstrapOwner(systemConfig, env, nowIso);
  const byId = store.users.findIndex((user) => user.id === "owner");
  if (byId >= 0) {
    const reopenSetup = shouldReopenBootstrapOwnerSetup(store.users[byId], bootstrapOwner);
    store.users[byId] = {
      ...store.users[byId],
      role: "owner",
      firstName: store.users[byId].firstName || bootstrapOwner.firstName,
      lastName: store.users[byId].lastName || bootstrapOwner.lastName,
      email: store.users[byId].email || bootstrapOwner.email,
      passwordHash: store.users[byId].passwordHash || bootstrapOwner.passwordHash,
      mustChangePassword: reopenSetup ? true : Boolean(store.users[byId].mustChangePassword),
      setupCompletedAt: reopenSetup ? "" : store.users[byId].setupCompletedAt,
      updatedAt: store.users[byId].updatedAt || nowIso,
    };
    return store;
  }

  const byEmail = store.users.findIndex((user) => user.email === bootstrapOwner.email);
  if (byEmail >= 0) {
    const reopenSetup = shouldReopenBootstrapOwnerSetup(store.users[byEmail], bootstrapOwner);
    store.users[byEmail] = {
      ...store.users[byEmail],
      id: "owner",
      role: "owner",
      firstName: store.users[byEmail].firstName || bootstrapOwner.firstName,
      lastName: store.users[byEmail].lastName || bootstrapOwner.lastName,
      passwordHash: store.users[byEmail].passwordHash || bootstrapOwner.passwordHash,
      mustChangePassword: reopenSetup ? true : Boolean(store.users[byEmail].mustChangePassword),
      setupCompletedAt: reopenSetup ? "" : store.users[byEmail].setupCompletedAt,
      updatedAt: nowIso,
    };
    return store;
  }

  store.users.unshift(bootstrapOwner);
  return store;
}

function normalizeStore(rawStore, systemConfig, env = process.env) {
  const nowIso = new Date().toISOString();
  const rawUsers = Array.isArray(rawStore && rawStore.users) ? rawStore.users : [];
  const users = rawUsers
    .map((rawUser) => normalizeUserRecord(rawUser, systemConfig, env, nowIso))
    .filter(Boolean);

  const dedupedUsers = [];
  const seenIds = new Set();
  const seenEmails = new Set();
  for (const user of users) {
    if (seenIds.has(user.id) || seenEmails.has(user.email)) continue;
    seenIds.add(user.id);
    seenEmails.add(user.email);
    dedupedUsers.push(user);
  }

  const store = {
    version: 1,
    users: dedupedUsers,
    updatedAt: normalizeIsoDate(rawStore && rawStore.updatedAt, nowIso),
  };

  ensureBootstrapOwner(store, systemConfig, env);
  store.users = sortUsers(store.users);
  return store;
}

function loadAdminUserStore(options = {}) {
  const env = options.env || process.env;
  const baseDir = options.baseDir || process.cwd();
  const systemConfig = options.systemConfig || {};
  const storeFile = resolveAdminUserStoreFile(env, baseDir);

  if (!fs.existsSync(storeFile)) {
    return normalizeStore({ users: [] }, systemConfig, env);
  }

  const rawText = fs.readFileSync(storeFile, "utf8");
  const rawStore = rawText ? JSON.parse(rawText) : { users: [] };
  return normalizeStore(rawStore, systemConfig, env);
}

function saveAdminUserStore(store, options = {}) {
  const env = options.env || process.env;
  const baseDir = options.baseDir || process.cwd();
  const systemConfig = options.systemConfig || {};
  const storeFile = resolveAdminUserStoreFile(env, baseDir);
  const normalizedStore = normalizeStore(
    {
      ...store,
      updatedAt: new Date().toISOString(),
    },
    systemConfig,
    env
  );

  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  const tempFile = `${storeFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(normalizedStore, null, 2)}\n`, "utf8");
  fs.renameSync(tempFile, storeFile);
  return normalizedStore;
}

function listAdminUsers(store) {
  return sortUsers(Array.isArray(store && store.users) ? store.users : []);
}

function findAdminUserByEmail(store, email) {
  const normalizedEmail = normalizeEmail(email);
  return listAdminUsers(store).find((user) => user.email === normalizedEmail) || null;
}

function findAdminUserById(store, userId) {
  const normalizedId = normalizeString(userId, 128);
  return listAdminUsers(store).find((user) => user.id === normalizedId) || null;
}

function updateAdminUser(store, userId, updater) {
  const normalizedId = normalizeString(userId, 128);
  const index = Array.isArray(store && store.users)
    ? store.users.findIndex((user) => user.id === normalizedId)
    : -1;
  if (index === -1) return { store, user: null };

  const currentUser = store.users[index];
  const nextUser = updater ? updater({ ...currentUser }) : { ...currentUser };
  if (!nextUser) return { store, user: null };
  nextUser.id = currentUser.id;
  nextUser.email = normalizeEmail(nextUser.email || currentUser.email);
  nextUser.firstName = normalizeName(nextUser.firstName);
  nextUser.lastName = normalizeName(nextUser.lastName);
  nextUser.role = currentUser.role === "owner" ? "owner" : normalizeRole(nextUser.role);
  nextUser.passwordHash = normalizeString(nextUser.passwordHash, 4096) || currentUser.passwordHash;
  nextUser.mustChangePassword = Boolean(nextUser.mustChangePassword);
  nextUser.totpSecret = normalizeTotpSecret(nextUser.totpSecret);
  nextUser.createdAt = currentUser.createdAt;
  nextUser.createdBy = currentUser.createdBy;
  nextUser.lastLoginAt = normalizeIsoDate(nextUser.lastLoginAt, "");
  nextUser.setupCompletedAt = normalizeIsoDate(nextUser.setupCompletedAt, "");
  nextUser.updatedAt = new Date().toISOString();

  const nextUsers = [...store.users];
  nextUsers[index] = nextUser;
  return {
    store: {
      ...store,
      users: sortUsers(nextUsers),
      updatedAt: new Date().toISOString(),
    },
    user: nextUser,
  };
}

function createAdminUser(store, input, options = {}) {
  const env = options.env || process.env;
  const systemConfig = options.systemConfig || {};
  const createdBy = normalizeString(options.createdBy, 128) || "owner";
  const nowIso = new Date().toISOString();
  const firstName = normalizeName(input && input.firstName);
  const lastName = normalizeName(input && input.lastName);
  const email = normalizeEmail(input && input.email);

  if (!firstName || !lastName || !email) {
    const error = new Error("First name, last name, and email are required.");
    error.code = "INVALID_ADMIN_USER";
    throw error;
  }

  if (findAdminUserByEmail(store, email)) {
    const error = new Error("A user with this email already exists.");
    error.code = "ADMIN_USER_EXISTS";
    throw error;
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    firstName,
    lastName,
    role: "staff",
    passwordHash: getDefaultUserPasswordHash(env, systemConfig),
    mustChangePassword: true,
    totpSecret: adminAuth.createTotpSecret(),
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy,
    lastLoginAt: "",
    setupCompletedAt: "",
  };

  return {
    store: {
      ...store,
      users: sortUsers([...(Array.isArray(store.users) ? store.users : []), user]),
      updatedAt: nowIso,
    },
    user,
  };
}

function getAdminUserDisplayName(user) {
  const firstName = normalizeName(user && user.firstName);
  const lastName = normalizeName(user && user.lastName);
  return normalizeString(`${firstName} ${lastName}`, 240) || normalizeEmail(user && user.email) || "Admin User";
}

module.exports = {
  createAdminUser,
  createBootstrapOwner,
  findAdminUserByEmail,
  findAdminUserById,
  getAdminUserDisplayName,
  getDefaultUserPasswordHash,
  getDefaultUserPasswordHint,
  listAdminUsers,
  loadAdminUserStore,
  resolveAdminUserStoreFile,
  saveAdminUserStore,
  updateAdminUser,
};
