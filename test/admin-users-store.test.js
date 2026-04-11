"use strict";

const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { hashPassword } = require("../lib/admin-auth");
const { createAdminUsersStore } = require("../lib/admin-users-store");

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
    });

    assert.equal(user.staffId, "staff-anna");
    assert.equal(user.email, "anna@example.com");
    assert.equal(user.phone, "+1(312)555-0199");
    assert.equal(user.status, "active");
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
      passwordHash: hashPassword("ChangedPassword456!"),
    });
    assert.equal(updated.email, "anna.peterson@example.com");
    assert.equal(updated.phone, "+1(331)555-0110");
    assert.equal(updated.status, "inactive");

    const byId = await store.getUserById(user.id, { includeSecret: true });
    assert.equal(byId.email, "anna.peterson@example.com");
    assert.equal(byId.status, "inactive");

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
