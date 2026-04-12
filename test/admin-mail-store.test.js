"use strict";

const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminMailStore } = require("../lib/admin-mail-store");

function createConnection() {
  return {
    provider: "google-mail",
    status: "connected",
    accountEmail: "relay@shynli.com",
    scope: "openid email https://www.googleapis.com/auth/gmail.send",
    tokenCipher: {
      version: 1,
      salt: "aa",
      iv: "bb",
      tag: "cc",
      data: "dGVzdA==",
    },
    tokenExpiresAt: "2026-04-12T00:00:00.000Z",
    connectedAt: "2026-04-11T20:00:00.000Z",
    updatedAt: "2026-04-11T20:00:00.000Z",
    lastError: "",
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSupabaseAdminMailClientStub() {
  const state = {
    connection: null,
  };

  return {
    isConfigured() {
      return true;
    },
    async fetchSnapshot() {
      return clone(state);
    },
    async upsertConnection(record) {
      state.connection = clone(record);
      return clone(record);
    },
    async deleteConnection() {
      state.connection = null;
      return true;
    },
  };
}

test("stores Google Mail connection records in the local mail store", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shynli-mail-store-"));
  const storePath = path.join(tempDir, "admin-mail-store.json");
  const store = createAdminMailStore({ filePath: storePath });

  try {
    const initial = await store.getSnapshot();
    assert.deepEqual(initial, { connection: null });

    const connection = await store.setConnection(createConnection());
    assert.equal(connection.provider, "google-mail");
    assert.equal(connection.accountEmail, "relay@shynli.com");

    const fromStore = await store.getConnection();
    assert.equal(fromStore.scope, "openid email https://www.googleapis.com/auth/gmail.send");

    const cleared = await store.clearConnection();
    assert.equal(cleared.accountEmail, "relay@shynli.com");

    const finalSnapshot = await store.getSnapshot();
    assert.deepEqual(finalSnapshot, { connection: null });
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});

test("uses the Supabase-backed mail store when the client is configured", async () => {
  const supabaseClient = createSupabaseAdminMailClientStub();
  const store = createAdminMailStore({
    createSupabaseAdminMailClient() {
      return supabaseClient;
    },
  });

  assert.equal(store.mode, "supabase");

  const connection = await store.setConnection(createConnection());
  assert.equal(connection.accountEmail, "relay@shynli.com");

  const snapshot = await store.getSnapshot();
  assert.equal(snapshot.connection.accountEmail, "relay@shynli.com");

  await store.clearConnection();
  const finalSnapshot = await store.getSnapshot();
  assert.deepEqual(finalSnapshot, { connection: null });
});
