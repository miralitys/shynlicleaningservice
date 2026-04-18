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
      compensationValue: "35",
      compensationType: "percent",
      status: "active",
      calendar: {
        provider: "google",
        status: "connected",
        accountEmail: "anna.cleaner@gmail.com",
        workCalendarId: "work-cal-1",
        unavailableCalendarId: "dayoff-cal-1",
        tokenCipher: {
          version: 1,
          salt: "aa",
          iv: "bb",
          tag: "cc",
          data: "dGVzdA==",
        },
        tokenExpiresAt: "2026-04-11T18:00:00.000Z",
      },
      smsHistory: [
        {
          message: "Welcome to SHYNLI staff onboarding",
          phone: "+16305550101",
          source: "automatic",
          targetType: "staff",
          targetRef: "staff-anna",
          sentAt: "2026-04-12T18:00:00.000Z",
        },
      ],
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
      calendarSync: {
        google: {
          byStaffId: {
            [anna.id]: {
              eventId: "evt-anna-1",
              calendarId: "work-cal-1",
            },
          },
        },
      },
    });

    let snapshot = await store.getSnapshot();
    assert.equal(snapshot.staff.length, 2);
    assert.equal(snapshot.assignments.length, 1);
    assert.equal(snapshot.staff[0].address, "215 North Elm Street, Naperville, IL");
    assert.equal(snapshot.staff[0].compensationValue, "35");
    assert.equal(snapshot.staff[0].compensationType, "percent");
    assert.equal(snapshot.staff[0].calendar.accountEmail, "anna.cleaner@gmail.com");
    assert.equal(snapshot.staff[0].smsHistory.length, 1);
    assert.equal(snapshot.staff[0].smsHistory[0].source, "automatic");
    assert.deepEqual(snapshot.assignments[0].staffIds.sort(), [anna.id, olga.id].sort());
    assert.equal(
      snapshot.assignments[0].calendarSync.google.byStaffId[anna.id].eventId,
      "evt-anna-1"
    );

    await store.updateStaff(olga.id, {
      contract: {
        contractorName: "Olga Martinez",
        contractorAddressLine1: "742 Cedar Avenue",
        contractorCityStateZip: "Aurora, IL 60506",
        contractorEmail: "olga@example.com",
        compensationType: "percent",
        compensationValue: "45",
        generatedAt: "2026-04-12T20:00:00.000Z",
        document: {
          relativePath: `${olga.id}/contract.pdf`,
          fileName: "Olga-Martinez-contract.pdf",
          contentType: "application/pdf",
          sizeBytes: 4096,
          generatedAt: "2026-04-12T20:00:00.000Z",
          templateName: "Independent_Contractor_Agreement_Template.docx",
        },
      },
      w9: {
        legalName: "Olga Martinez",
        federalTaxClassification: "individual",
        addressLine1: "742 Cedar Avenue",
        cityStateZip: "Aurora, IL 60506",
        tinType: "ssn",
        maskedTin: "***-**-0192",
        generatedAt: "2026-04-12T20:00:00.000Z",
        document: {
          relativePath: `${olga.id}/w9.pdf`,
          fileName: "Olga-Martinez.pdf",
          contentType: "application/pdf",
          sizeBytes: 2048,
          generatedAt: "2026-04-12T20:00:00.000Z",
          templateName: "w9-template.pdf",
        },
      },
    });

    snapshot = await store.getSnapshot();
    assert.equal(snapshot.staff[1].contract.contractorName, "Olga Martinez");
    assert.equal(snapshot.staff[1].contract.document.relativePath, `${olga.id}/contract.pdf`);
    assert.equal(snapshot.staff[1].w9.legalName, "Olga Martinez");
    assert.equal(snapshot.staff[1].w9.maskedTin, "***-**-0192");
    assert.equal(snapshot.staff[1].w9.document.relativePath, `${olga.id}/w9.pdf`);

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
    compensationValue: "150",
    compensationType: "fixed",
    status: "active",
    calendar: {
      provider: "google",
      status: "connected",
      accountEmail: "anna.cleaner@gmail.com",
      workCalendarId: "work-cal-1",
      unavailableCalendarId: "dayoff-cal-1",
      tokenCipher: {
        version: 1,
        salt: "aa",
        iv: "bb",
        tag: "cc",
        data: "dGVzdA==",
        },
        tokenExpiresAt: "2026-04-11T18:00:00.000Z",
      },
      smsHistory: [
        {
          message: "Remote onboarding reminder",
          phone: "+16305550101",
          source: "automatic",
          targetType: "staff",
          targetRef: "remote-anna",
          sentAt: "2026-04-12T18:00:00.000Z",
        },
      ],
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
    calendarSync: {
      google: {
        byStaffId: {
          [anna.id]: {
            eventId: "evt-remote-1",
            calendarId: "work-cal-1",
          },
        },
      },
    },
  });

  let snapshot = await store.getSnapshot();
  assert.equal(snapshot.staff.length, 2);
  assert.equal(snapshot.assignments.length, 1);
  assert.equal(snapshot.assignments[0].status, "confirmed");
  assert.equal(snapshot.staff[0].compensationValue, "150");
  assert.equal(snapshot.staff[0].compensationType, "fixed");
  assert.equal(snapshot.staff[0].calendar.accountEmail, "anna.cleaner@gmail.com");
  assert.equal(snapshot.staff[0].smsHistory.length, 1);
  assert.equal(snapshot.staff[0].smsHistory[0].message, "Remote onboarding reminder");
  assert.equal(snapshot.assignments[0].calendarSync.google.byStaffId[anna.id].eventId, "evt-remote-1");

  await store.deleteStaff(anna.id);
  snapshot = await store.getSnapshot();
  assert.equal(snapshot.staff.length, 1);
  assert.equal(snapshot.assignments.length, 1);
  assert.deepEqual(snapshot.assignments[0].staffIds, [diana.id]);

  await store.updateStaff(diana.id, {
    address: "742 Cedar Avenue, Aurora, IL 60506",
    compensationValue: "28.5",
    compensationType: "percent",
    status: "on_leave",
    notes: "Needs a remote sync check",
    w9: {
      legalName: "Diana Brooks",
      federalTaxClassification: "llc",
      llcTaxClassification: "C",
      addressLine1: "742 Cedar Avenue",
      cityStateZip: "Aurora, IL 60506",
      tinType: "ein",
      maskedTin: "**-***2104",
      generatedAt: "2026-04-12T21:10:00.000Z",
      document: {
        relativePath: `${diana.id}/w9.pdf`,
        fileName: "Diana-Brooks.pdf",
        contentType: "application/pdf",
        sizeBytes: 4096,
        generatedAt: "2026-04-12T21:10:00.000Z",
        templateName: "w9-template.pdf",
      },
    },
  });
  snapshot = await store.getSnapshot();
  assert.equal(snapshot.staff[0].compensationValue, "28.5");
  assert.equal(snapshot.staff[0].compensationType, "percent");
  assert.equal(snapshot.staff[0].address, "742 Cedar Avenue, Aurora, IL 60506");
  assert.equal(snapshot.staff[0].status, "on_leave");
  assert.match(snapshot.staff[0].notes, /remote sync/i);
  assert.equal(snapshot.staff[0].w9.llcTaxClassification, "C");
  assert.equal(snapshot.staff[0].w9.document.fileName, "Diana-Brooks.pdf");

  await store.clearAssignment("entry-remote-1");
  snapshot = await store.getSnapshot();
  assert.equal(snapshot.assignments.length, 0);
});

test("preserves inbound client SMS history source in the file-backed staff store", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shynli-staff-source-"));
  const storePath = path.join(tempDir, "admin-staff-store.json");
  const store = createAdminStaffStore({ filePath: storePath });

  try {
    const record = await store.createStaff({
      name: "Inbound SMS Staff",
      phone: "+1 (630) 555-0109",
      smsHistory: [
        {
          message: "Client replied to onboarding SMS",
          phone: "+16305550109",
          source: "client",
          direction: "inbound",
          channel: "ghl",
          targetType: "staff",
          targetRef: "inbound-sms-staff",
          sentAt: "2026-04-18T15:05:00.000Z",
        },
      ],
    });

    const snapshot = await store.getSnapshot();
    const storedRecord = snapshot.staff.find((candidate) => candidate.id === record.id);
    assert.ok(storedRecord);
    assert.equal(storedRecord.smsHistory.length, 1);
    assert.equal(storedRecord.smsHistory[0].source, "client");
    assert.equal(storedRecord.smsHistory[0].direction, "inbound");
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});
