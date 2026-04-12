"use strict";

const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { hashPassword } = require("../lib/admin-auth");
const { createAdminUsersStore } = require("../lib/admin-users-store");

function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function createSupabaseAdminUsersClientStub() {
  const state = {
    users: [],
  };

  return {
    isConfigured() {
      return true;
    },
    async fetchSnapshot() {
      return cloneSnapshot(state);
    },
    async upsertUser(record) {
      const index = state.users.findIndex((candidate) => candidate.id === record.id);
      if (index === -1) {
        state.users.push(cloneSnapshot(record));
      } else {
        state.users[index] = cloneSnapshot(record);
      }
      return cloneSnapshot(record);
    },
    async deleteUser(userId) {
      state.users = state.users.filter((record) => record.id !== userId);
      return true;
    },
  };
}

test("stores user accounts for employee portals", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shynli-users-store-"));
  const storePath = path.join(tempDir, "admin-users-store.json");
  const store = createAdminUsersStore({ filePath: storePath });

  try {
    const initial = await store.getSnapshot();
    assert.deepEqual(initial, { users: [] });

    const user = await store.createUser({
      staffId: "staff-anna",
      email: "anna@example.com",
      phone: "+1(312)555-0199",
      passwordHash: hashPassword("StrongPassword123!"),
      status: "active",
      role: "manager",
    });

    assert.equal(user.staffId, "staff-anna");
    assert.equal(user.email, "anna@example.com");
    assert.equal(user.phone, "+1(312)555-0199");
    assert.equal(user.status, "active");
    assert.equal(user.role, "manager");
    assert.equal(user.emailVerificationRequired, false);
    assert.equal(user.emailVerifiedAt, "");
    assert.ok(user.id);
    assert.equal("passwordHash" in user, false);

    const storedUser = await store.findUserByEmail("anna@example.com", { includeSecret: true });
    assert.ok(storedUser);
    assert.match(storedUser.passwordHash, /^scrypt\$/);

    await assert.rejects(
      store.createUser({
        staffId: "staff-anna",
        email: "duplicate@example.com",
        passwordHash: hashPassword("StrongPassword123!"),
      }),
      /USER_STAFF_EXISTS/
    );

    await assert.rejects(
      store.createUser({
        staffId: "staff-olga",
        email: "anna@example.com",
        passwordHash: hashPassword("StrongPassword123!"),
      }),
      /USER_EMAIL_EXISTS/
    );

    const updated = await store.updateUser(user.id, {
      email: "anna.peterson@example.com",
      phone: "+1(331)555-0110",
      status: "inactive",
      role: "cleaner",
      emailVerificationRequired: true,
      emailVerifiedAt: "",
      inviteEmailSentAt: "2026-04-11T12:00:00.000Z",
      role: "cleaner",
      passwordHash: hashPassword("ChangedPassword456!"),
    });
    assert.equal(updated.email, "anna.peterson@example.com");
    assert.equal(updated.phone, "+1(331)555-0110");
    assert.equal(updated.status, "inactive");
    assert.equal(updated.role, "cleaner");
    assert.equal(updated.emailVerificationRequired, true);
    assert.equal(updated.emailVerifiedAt, "");
    assert.equal(updated.inviteEmailSentAt, "2026-04-11T12:00:00.000Z");
    assert.equal(updated.role, "cleaner");

    const byId = await store.getUserById(user.id, { includeSecret: true });
    assert.equal(byId.email, "anna.peterson@example.com");
    assert.equal(byId.status, "inactive");
    assert.equal(byId.role, "cleaner");

    const afterLogin = await store.recordLogin(user.id);
    assert.ok(afterLogin.lastLoginAt);

    const deleted = await store.deleteUser(user.id);
    assert.equal(deleted.id, user.id);

    const finalSnapshot = await store.getSnapshot();
    assert.deepEqual(finalSnapshot, { users: [] });
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});

test("uses the Supabase-backed users store when the client is configured", async () => {
  const supabaseClient = createSupabaseAdminUsersClientStub();
  const store = createAdminUsersStore({
    createSupabaseAdminUsersClient() {
      return supabaseClient;
    },
  });

  assert.equal(store.mode, "supabase");

  const user = await store.createUser({
    staffId: "staff-anna",
    email: "anna@example.com",
    phone: "+1(312)555-0199",
    passwordHash: hashPassword("StrongPassword123!"),
    status: "active",
    role: "manager",
    emailVerificationRequired: true,
    inviteEmailSentAt: "2026-04-11T12:00:00.000Z",
  });

  assert.equal(user.email, "anna@example.com");
  assert.equal(user.role, "manager");
  assert.equal("passwordHash" in user, false);

  const found = await store.findUserByEmail("anna@example.com", { includeSecret: true });
  assert.ok(found);
  assert.match(found.passwordHash, /^scrypt\$/);
  assert.equal(found.emailVerificationRequired, true);

  const updated = await store.updateUser(user.id, {
    email: "anna.peterson@example.com",
    role: "admin",
    inviteEmailLastError: "SMTP rejected the relay credentials.",
  });

  assert.equal(updated.email, "anna.peterson@example.com");
  assert.equal(updated.role, "admin");
  assert.equal(updated.inviteEmailLastError, "SMTP rejected the relay credentials.");

  const afterLogin = await store.recordLogin(user.id);
  assert.ok(afterLogin.lastLoginAt);

  const snapshot = await store.getSnapshot();
  assert.equal(snapshot.users.length, 1);
  assert.equal(snapshot.users[0].email, "anna.peterson@example.com");

  const deleted = await store.deleteUser(user.id);
  assert.equal(deleted.id, user.id);

  const finalSnapshot = await store.getSnapshot();
  assert.deepEqual(finalSnapshot, { users: [] });
});
