"use strict";

const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminStaffStore } = require("../lib/admin-staff-store");

function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function createSupabaseAdminStaffClientStub() {
  const state = {
    staff: [],
    assignments: [],
  };

  return {
    isConfigured() {
      return true;
    },
    async fetchSnapshot() {
      return cloneSnapshot(state);
    },
    async upsertStaff(record) {
      const index = state.staff.findIndex((candidate) => candidate.id === record.id);
      if (index === -1) {
        state.staff.push(cloneSnapshot(record));
      } else {
        state.staff[index] = cloneSnapshot(record);
      }
      return cloneSnapshot(record);
    },
    async deleteStaff(staffId) {
      state.staff = state.staff.filter((record) => record.id !== staffId);
      return true;
    },
    async upsertAssignment(record) {
      const index = state.assignments.findIndex((candidate) => candidate.entryId === record.entryId);
      if (index === -1) {
        state.assignments.push(cloneSnapshot(record));
      } else {
        state.assignments[index] = cloneSnapshot(record);
      }
      return cloneSnapshot(record);
    },
    async deleteAssignment(entryId) {
      state.assignments = state.assignments.filter((record) => record.entryId !== entryId);
      return true;
    },
  };
}

test("stores staff cards and assignment planning in the file-backed store", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shynli-staff-store-"));
  const storePath = path.join(tempDir, "admin-staff-store.json");
  const store = createAdminStaffStore({ filePath: storePath });

  try {
    const initial = await store.getSnapshot();
    assert.deepEqual(initial, { staff: [], assignments: [] });

    const anna = await store.createStaff({
      name: "Anna Petrova",
      role: "Team Lead",
      email: "anna@example.com",
      address: "215 North Elm Street, Naperville, IL",
      status: "active",
    });
    const olga = await store.createStaff({
      name: "Olga Martinez",
      role: "Cleaner",
      email: "olga@example.com",
      status: "active",
    });

    await store.setAssignment("entry-1", {
      staffIds: [anna.id, olga.id],
      scheduleDate: "2026-04-16",
      scheduleTime: "09:30",
      status: "confirmed",
      notes: "Bring deep-clean kit",
    });

    let snapshot = await store.getSnapshot();
    assert.equal(snapshot.staff.length, 2);
    assert.equal(snapshot.assignments.length, 1);
    assert.equal(snapshot.staff[0].address, "215 North Elm Street, Naperville, IL");
    assert.deepEqual(snapshot.assignments[0].staffIds.sort(), [anna.id, olga.id].sort());

    await store.deleteStaff(anna.id);

    snapshot = await store.getSnapshot();
    assert.equal(snapshot.staff.length, 1);
    assert.equal(snapshot.staff[0].name, "Olga Martinez");
    assert.deepEqual(snapshot.assignments[0].staffIds, [olga.id]);

    await store.clearAssignment("entry-1");
    snapshot = await store.getSnapshot();
    assert.equal(snapshot.assignments.length, 0);

    const persisted = JSON.parse(await fsp.readFile(storePath, "utf8"));
    assert.equal(persisted.staff.length, 1);
    assert.equal(persisted.assignments.length, 0);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});

test("uses the Supabase-backed store implementation when the client is configured", async () => {
  const supabaseClient = createSupabaseAdminStaffClientStub();
  const store = createAdminStaffStore({
    createSupabaseAdminStaffClient() {
      return supabaseClient;
    },
  });

  assert.equal(store.mode, "supabase");

  const anna = await store.createStaff({
    name: "Anna Petrova",
    role: "Team Lead",
    email: "anna@example.com",
    address: "215 North Elm Street, Naperville, IL",
    status: "active",
  });
  const diana = await store.createStaff({
    name: "Diana Brooks",
    role: "Cleaner",
    email: "diana@example.com",
    status: "active",
  });

  await store.setAssignment("entry-remote-1", {
    staffIds: [anna.id, diana.id],
    scheduleDate: "2026-04-17",
    scheduleTime: "11:00",
    status: "confirmed",
    notes: "Remote assignment",
  });

  let snapshot = await store.getSnapshot();
  assert.equal(snapshot.staff.length, 2);
  assert.equal(snapshot.assignments.length, 1);
  assert.equal(snapshot.assignments[0].status, "confirmed");

  await store.deleteStaff(anna.id);
  snapshot = await store.getSnapshot();
  assert.equal(snapshot.staff.length, 1);
  assert.equal(snapshot.assignments.length, 1);
  assert.deepEqual(snapshot.assignments[0].staffIds, [diana.id]);

  await store.updateStaff(diana.id, {
    address: "742 Cedar Avenue, Aurora, IL 60506",
    status: "on_leave",
    notes: "Needs a remote sync check",
  });
  snapshot = await store.getSnapshot();
  assert.equal(snapshot.staff[0].address, "742 Cedar Avenue, Aurora, IL 60506");
  assert.equal(snapshot.staff[0].status, "on_leave");
  assert.match(snapshot.staff[0].notes, /remote sync/i);

  await store.clearAssignment("entry-remote-1");
  snapshot = await store.getSnapshot();
  assert.equal(snapshot.assignments.length, 0);
});
