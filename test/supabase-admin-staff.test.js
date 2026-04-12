"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  QUOTE_OPS_ASSIGNMENT_KIND,
  QUOTE_OPS_STAFF_KIND,
  buildQuoteOpsAssignmentRowId,
  createSupabaseAdminStaffClient,
  isOpaqueSupabaseApiKey,
} = require("../lib/supabase-admin-staff");

test("detects new opaque Supabase API keys for admin staff persistence", () => {
  assert.equal(isOpaqueSupabaseApiKey("sb_secret_example123"), true);
  assert.equal(isOpaqueSupabaseApiKey("sb_publishable_example123"), true);
  assert.equal(
    isOpaqueSupabaseApiKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example"),
    false
  );
});

test("uses apikey-only auth for opaque Supabase secret keys in the admin staff client", async () => {
  const calls = [];
  const client = createSupabaseAdminStaffClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return "[]";
        },
      };
    },
  });

  await client.fetchSnapshot();

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.apikey, "sb_secret_example123");
  assert.equal("Authorization" in calls[0].options.headers, false);
});

test("keeps bearer auth for legacy service_role JWT keys in the admin staff client", async () => {
  const calls = [];
  const client = createSupabaseAdminStaffClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "legacy.jwt.token",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return "[]";
        },
      };
    },
  });

  await client.fetchSnapshot();

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.apikey, "legacy.jwt.token");
  assert.equal(calls[0].options.headers.Authorization, "Bearer legacy.jwt.token");
});

test("falls back to quote_ops_entries rows when dedicated staff tables are missing", async () => {
  const staffId = "11e6cef8-fb56-4d4f-90c5-db8b5cff2fd0";
  const entryId = "bb1f32db-cfb0-4344-93ab-280b0813917a";
  const calls = [];
  const client = createSupabaseAdminStaffClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
      SUPABASE_QUOTE_OPS_TABLE: "quote_ops_entries",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("/rest/v1/admin_staff")) {
        return {
          ok: false,
          status: 404,
          async text() {
            return JSON.stringify({
              code: "PGRST205",
              message: "Could not find the table 'public.admin_staff' in the schema cache",
            });
          },
        };
      }
      if (url.includes("/rest/v1/admin_staff_assignments")) {
        return {
          ok: false,
          status: 404,
          async text() {
            return JSON.stringify({
              code: "PGRST205",
              message:
                "Could not find the table 'public.admin_staff_assignments' in the schema cache",
            });
          },
        };
      }
      if (url.includes(`kind=eq.${QUOTE_OPS_STAFF_KIND}`)) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify([
              {
                id: staffId,
                kind: QUOTE_OPS_STAFF_KIND,
                status: "success",
                customer_name: "Anna Petrova",
                customer_email: "anna@example.com",
                customer_phone: "+1 (630) 555-0101",
                full_address: "215 North Elm Street, Naperville, IL",
                service_name: "Team Lead",
                code: "active",
                error_message: "Quote-ops fallback row",
                created_at: "2026-04-11T16:36:16.391Z",
                updated_at: "2026-04-11T16:36:16.391Z",
                payload_for_retry: {
                  staff: {
                    id: staffId,
                    name: "Anna Petrova",
                    role: "Team Lead",
                    phone: "+1 (630) 555-0101",
                    email: "anna@example.com",
                    address: "215 North Elm Street, Naperville, IL",
                    compensationValue: "32",
                    compensationType: "percent",
                    status: "active",
                    notes: "Quote-ops fallback row",
                    w9: {
                      legalName: "Anna Petrova",
                      federalTaxClassification: "individual",
                      addressLine1: "215 North Elm Street",
                      cityStateZip: "Naperville, IL 60540",
                      tinType: "ssn",
                      maskedTin: "***-**-0101",
                      generatedAt: "2026-04-12T20:00:00.000Z",
                      document: {
                        relativePath: `${staffId}/w9.pdf`,
                        fileName: "Anna-Petrova.pdf",
                        contentType: "application/pdf",
                        sizeBytes: 2048,
                        generatedAt: "2026-04-12T20:00:00.000Z",
                        templateName: "w9-template.pdf",
                      },
                    },
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
                    },
                    createdAt: "2026-04-11T16:36:16.391Z",
                    updatedAt: "2026-04-11T16:36:16.391Z",
                  },
                },
              },
            ]);
          },
        };
      }
      if (url.includes(`kind=eq.${QUOTE_OPS_ASSIGNMENT_KIND}`)) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify([
              {
                id: buildQuoteOpsAssignmentRowId(entryId),
                kind: QUOTE_OPS_ASSIGNMENT_KIND,
                status: "success",
                request_id: entryId,
                selected_date: "2026-04-14",
                selected_time: "09:00",
                code: "confirmed",
                warnings: [staffId],
                error_message: "Fallback assignment",
                created_at: "2026-04-11T16:55:37.517Z",
                updated_at: "2026-04-11T16:55:37.517Z",
                payload_for_retry: {
                  assignment: {
                    entryId,
                    staffIds: [staffId],
                    scheduleDate: "2026-04-14",
                    scheduleTime: "09:00",
                    status: "confirmed",
                    notes: "Fallback assignment",
                    calendarSync: {
                      google: {
                        byStaffId: {
                          [staffId]: {
                            eventId: "evt-fallback-1",
                            calendarId: "work-cal-1",
                          },
                        },
                      },
                    },
                    createdAt: "2026-04-11T16:55:37.517Z",
                    updatedAt: "2026-04-11T16:55:37.517Z",
                  },
                },
              },
            ]);
          },
        };
      }
      throw new Error(`Unexpected request URL: ${url}`);
    },
  });

  const snapshot = await client.fetchSnapshot();

  assert.equal(snapshot.staff.length, 1);
  assert.equal(snapshot.staff[0].name, "Anna Petrova");
  assert.equal(snapshot.staff[0].address, "215 North Elm Street, Naperville, IL");
  assert.equal(snapshot.staff[0].compensationValue, "32");
  assert.equal(snapshot.staff[0].compensationType, "percent");
  assert.equal(snapshot.staff[0].calendar.accountEmail, "anna.cleaner@gmail.com");
  assert.equal(snapshot.staff[0].w9.maskedTin, "***-**-0101");
  assert.equal(snapshot.staff[0].w9.document.relativePath, `${staffId}/w9.pdf`);
  assert.equal(snapshot.assignments.length, 1);
  assert.deepEqual(snapshot.assignments[0].staffIds, [staffId]);
  assert.equal(snapshot.assignments[0].calendarSync.google.byStaffId[staffId].eventId, "evt-fallback-1");
  assert.ok(calls.some((call) => call.url.includes("/rest/v1/quote_ops_entries")));
});

test("writes staff rows into quote_ops_entries when dedicated tables are missing", async () => {
  const calls = [];
  const client = createSupabaseAdminStaffClient({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example123",
      SUPABASE_QUOTE_OPS_TABLE: "quote_ops_entries",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes("/rest/v1/admin_staff")) {
        return {
          ok: false,
          status: 404,
          async text() {
            return JSON.stringify({
              code: "PGRST205",
              message: "Could not find the table 'public.admin_staff' in the schema cache",
            });
          },
        };
      }
      if (url.includes("/rest/v1/quote_ops_entries")) {
        return {
          ok: true,
          status: 201,
          async text() {
            return "";
          },
        };
      }
      throw new Error(`Unexpected request URL: ${url}`);
    },
  });

  await client.upsertStaff({
    id: "19f0af14-3f5a-4626-894b-6b61a80d9b20",
    name: "Olga Martinez",
    role: "Cleaner",
    email: "olga@example.com",
    phone: "+1 (630) 555-0102",
    address: "742 Cedar Avenue, Aurora, IL 60506",
    compensationValue: "165",
    compensationType: "fixed",
    status: "active",
    notes: "Remote fallback upsert",
    w9: {
      legalName: "Olga Martinez",
      federalTaxClassification: "llc",
      llcTaxClassification: "C",
      addressLine1: "742 Cedar Avenue",
      cityStateZip: "Aurora, IL 60506",
      tinType: "ein",
      maskedTin: "**-***0102",
      generatedAt: "2026-04-12T21:15:00.000Z",
      document: {
        relativePath: "19f0af14-3f5a-4626-894b-6b61a80d9b20/w9.pdf",
        fileName: "Olga-Martinez.pdf",
        contentType: "application/pdf",
        sizeBytes: 4096,
        generatedAt: "2026-04-12T21:15:00.000Z",
        templateName: "w9-template.pdf",
      },
    },
    calendar: {
      provider: "google",
      status: "connected",
      accountEmail: "olga.cleaner@gmail.com",
      workCalendarId: "work-cal-2",
      unavailableCalendarId: "dayoff-cal-2",
      tokenCipher: {
        version: 1,
        salt: "aa",
        iv: "bb",
        tag: "cc",
        data: "dGVzdA==",
      },
    },
    createdAt: "2026-04-11T16:36:16.393Z",
    updatedAt: "2026-04-11T16:36:16.393Z",
  });

  const fallbackWrite = calls.find((call) => call.url.includes("/rest/v1/quote_ops_entries"));
  assert.ok(fallbackWrite);
  const payload = JSON.parse(fallbackWrite.options.body);
  assert.equal(payload.kind, QUOTE_OPS_STAFF_KIND);
  assert.equal(payload.customer_name, "Olga Martinez");
  assert.equal(payload.full_address, "742 Cedar Avenue, Aurora, IL 60506");
  assert.equal(payload.code, "active");
  assert.equal(payload.payload_for_retry.staff.compensationValue, "165");
  assert.equal(payload.payload_for_retry.staff.compensationType, "fixed");
  assert.equal(payload.payload_for_retry.staff.address, "742 Cedar Avenue, Aurora, IL 60506");
  assert.equal(payload.payload_for_retry.staff.w9.document.fileName, "Olga-Martinez.pdf");
  assert.equal(payload.payload_for_retry.staff.calendar.accountEmail, "olga.cleaner@gmail.com");
});
