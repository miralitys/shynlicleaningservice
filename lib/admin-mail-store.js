"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");

const STORE_VERSION = 1;
const MAIL_CONNECTION_STATUS_VALUES = ["connected", "attention"];
const MAIL_CONNECTION_STATUS_SET = new Set(MAIL_CONNECTION_STATUS_VALUES);

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeString(value, 200).toLowerCase();
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeEncryptedTokenPayload(payload) {
  const version = Number(payload && payload.version);
  const salt = normalizeString(payload && payload.salt, 128);
  const iv = normalizeString(payload && payload.iv, 128);
  const tag = normalizeString(payload && payload.tag, 128);
  const data = normalizeString(payload && payload.data, 12000);
  if (version !== 1 || !salt || !iv || !tag || !data) return null;
  return { version: 1, salt, iv, tag, data };
}

function sanitizeMailConnection(input = {}) {
  const source = isObject(input) ? input : {};
  const provider = normalizeString(source.provider, 32).toLowerCase();
  if (provider !== "google-mail") return null;

  const tokenCipher = sanitizeEncryptedTokenPayload(source.tokenCipher);
  if (!tokenCipher) return null;

  const status = normalizeString(source.status, 32).toLowerCase();
  return {
    id: normalizeString(source.id, 120) || "invite-email",
    provider: "google-mail",
    status: MAIL_CONNECTION_STATUS_SET.has(status) ? status : "connected",
    accountEmail: normalizeEmail(source.accountEmail),
    scope: normalizeString(source.scope, 500),
    tokenCipher,
    tokenExpiresAt: normalizeString(source.tokenExpiresAt, 80),
    connectedAt: normalizeString(source.connectedAt, 80),
    updatedAt: normalizeString(source.updatedAt, 80),
    lastError: normalizeString(source.lastError, 400),
  };
}

function sanitizeState(raw = {}) {
  return {
    version: STORE_VERSION,
    connection: sanitizeMailConnection(raw.connection),
  };
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

function cloneConnection(connection) {
  return connection ? JSON.parse(JSON.stringify(connection)) : null;
}

function cloneSnapshot(state) {
  return {
    connection: cloneConnection(state.connection),
  };
}

function createFileBackedAdminMailStore(options = {}) {
  const filePath = path.resolve(
    options.filePath ||
      process.env.ADMIN_MAIL_STORE_PATH ||
      path.join(process.cwd(), "data", "admin-mail-store.json")
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

  return {
    mode: "file",
    filePath,
    async getSnapshot() {
      const state = await ensureState();
      return cloneSnapshot(state);
    },
    async getConnection() {
      const state = await ensureState();
      return cloneConnection(state.connection);
    },
    async setConnection(input = {}) {
      return runSerialized(async (state) => {
        const connection = sanitizeMailConnection(input);
        if (!connection) {
          throw new Error("MAIL_CONNECTION_INVALID");
        }
        state.connection = connection;
        return cloneConnection(connection);
      });
    },
    async clearConnection() {
      return runSerialized(async (state) => {
        const previous = cloneConnection(state.connection);
        state.connection = null;
        return previous;
      });
    },
  };
}

function createSupabaseBackedAdminMailStore(options = {}, supabaseClient) {
  let cacheState = sanitizeState({});

  async function refreshCache() {
    const snapshot = await supabaseClient.fetchSnapshot();
    cacheState = sanitizeState(snapshot);
    return sanitizeState(cacheState);
  }

  async function getFreshStateOrCache() {
    try {
      return await refreshCache();
    } catch (error) {
      if (cacheState.connection) {
        return sanitizeState(cacheState);
      }
      throw error;
    }
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
    async getConnection() {
      const state = await getFreshStateOrCache();
      return cloneConnection(state.connection);
    },
    async setConnection(input = {}) {
      const connection = sanitizeMailConnection(input);
      if (!connection) {
        throw new Error("MAIL_CONNECTION_INVALID");
      }
      await supabaseClient.upsertConnection(connection);
      cacheState = sanitizeState({ connection });
      return cloneConnection(connection);
    },
    async clearConnection() {
      const previous = await this.getConnection();
      await supabaseClient.deleteConnection(previous && previous.id ? previous.id : "invite-email");
      cacheState = sanitizeState({});
      return previous;
    },
  };
}

function createAdminMailStore(options = {}) {
  const fileStore = createFileBackedAdminMailStore(options);
  const supabaseClient =
    typeof options.createSupabaseAdminMailClient === "function"
      ? options.createSupabaseAdminMailClient({
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

  return createSupabaseBackedAdminMailStore(options, supabaseClient);
}

module.exports = {
  MAIL_CONNECTION_STATUS_VALUES,
  createAdminMailStore,
  sanitizeMailConnection,
};
