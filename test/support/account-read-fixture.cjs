"use strict";

const fs = require("node:fs");

function createFixture(count = 1107, completedCount = 107) {
  const stamp = "2026-10-01T12:00:00.000Z";
  const staff = ["a", "b"].map(id => ({ id, name: `Cleaner ${id.toUpperCase()}`, role: "cleaner", status: "active",
    phone: "2025550142", email: `${id}@example.test`, address: "1 Test Street",
    compensation_amount: "50", compensation_type: "percent", created_at: stamp, updated_at: stamp }));
  const users = staff.map(person => ({ id: `user-${person.id}`, staff_id: person.id, name: person.name,
    email: person.email, role: "cleaner", status: "active", email_verification_required: false,
    password_hash: require("../../lib/admin-auth").hashPassword("LocalAudit123!"), created_at: stamp, updated_at: stamp }));
  const rows = Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2099, 0, 1 + i)).toISOString().slice(0, 10);
    const order = { isCreated: true, status: i < completedCount ? "completed" : "scheduled", selectedDate: date,
      selectedTime: "09:00", assignedStaff: "Cleaner A, Cleaner B", serviceDurationMinutes: 180,
      updatedAt: stamp, payrollOverrides: i % 3 === 0 ? { a: "125.50", b: "60" } : {},
      completion: { cleanerComment: `Visit note ${i}`, checklistItems: [{ id: "clean", label: "Clean room", completed: true }] },
      policyAcceptance: { signatureDataUrl: "signature".repeat(300) } };
    if (i < completedCount) order.payroll = { items: [{ staffId: "a", staffName: "Cleaner A", amountCents: 9000 + i,
      status: i % 2 ? "paid" : "owed", compensationType: "fixed", compensationValue: "90", orderTotalCents: 25025 + i }] };
    return { id: `order-${String(i).padStart(5, "0")}`, kind: "quote_submission", status: "success", created_at: stamp,
      updated_at: stamp, request_id: `manual-${i}`, source_route: "/admin/orders", customer_name: `Test Client ${i}`,
      customer_phone: "2025550142", service_type: "deep", service_name: "Deep", total_price: 250.25 + i,
      total_price_cents: 25025 + i * 100, selected_date: date, selected_time: "09:00", full_address: `${i + 1} Test Street`,
      payload_for_retry: { orderState: order, adminOrder: order, calculatorData: { rooms: 3, bathrooms: 2.5, squareFeet: 1600,
        services: ["insideCabinets"], fullAddress: `${i + 1} Test Street` },
        adminClient: { photos: ["photo".repeat(300)] }, adminSms: { history: ["message".repeat(1200)] } } };
  });
  const foreign = structuredClone(rows[0]);
  foreign.id = "other-order";
  foreign.customer_name = "Other cleaner only";
  const assignments = rows.map(row => ({ entry_id: row.id, staff_ids: ["a", "b"], schedule_date: row.selected_date,
    schedule_time: "09:00", status: "confirmed", notes: "Keep assignment notes", created_at: stamp, updated_at: stamp }));
  assignments.push({ entry_id: foreign.id, staff_ids: ["b"], schedule_date: foreign.selected_date, schedule_time: "09:00" });
  return { rows: rows.concat(foreign), staff, users, assignments, count };
}

function createReadFetch(fixture, calls = [], control = () => ({}), { allowLogin = false } = {}) {
  return async (url, options = {}) => {
    const u = new URL(url);
    if (u.origin !== "https://account-benchmark.invalid") throw new Error("External network forbidden in account fixture");
    const method = options.method || "GET";
    const table = u.pathname.split("/").pop();
    const state = control();
    if (allowLogin && method === "POST" && table === "admin_users") {
      const row = JSON.parse(options.body);
      const index = fixture.users.findIndex(user => user.id === row.id);
      if (index < 0) throw new Error("Preview only permits login for existing synthetic users");
      fixture.users[index] = row;
      return { ok: true, status: 200, text: async () => JSON.stringify([row]) };
    }
    if (method !== "GET") throw new Error(`Account benchmark forbids writes: ${method} ${table}`);
    const accountView = table === "account_order_list_entries";
    const calendarView = table === "account_calendar_entries";
    if (accountView && state.missingAccountView) {
      return { ok: false, status: 404, text: async () => JSON.stringify({ code: "PGRST205", message: "Missing account list view" }) };
    }
    if (accountView && state.accountViewError) {
      return { ok: false, status: 403, text: async () => JSON.stringify({ code: "42501", message: "View access denied" }) };
    }
    if (calendarView && state.missingCalendarView) {
      return { ok: false, status: 404, text: async () => JSON.stringify({ code: "PGRST205", message: "Missing calendar view" }) };
    }
    if (calendarView && state.calendarViewError) {
      return { ok: false, status: 403, text: async () => JSON.stringify({ code: "42501", message: "Calendar view access denied" }) };
    }
    if ((state.failOrders && (table === "quote_ops_entries" || accountView || calendarView)) || (state.failDetail && u.searchParams.get("id")?.startsWith("eq."))) {
      return { ok: false, status: 503, text: async () => JSON.stringify({ message: "Simulated read failure" }) };
    }
    let rows = table === "quote_ops_entries" || accountView || calendarView ? fixture.rows : table === "admin_staff" ? fixture.staff
      : table === "admin_users" ? fixture.users : table === "admin_staff_assignments" ? fixture.assignments : [];
    if ((accountView || calendarView) && fixture.accountRows) rows = fixture.accountRows;
    if (calendarView && fixture.calendarRows) rows = fixture.calendarRows;
    if (state.reassigned && table === "admin_staff_assignments") rows = rows.filter(row => row.entry_id !== state.reassigned);
    for (const [key, value] of u.searchParams) {
      if (key === "or") {
        const field = "payload_for_retry->assignment->>staffIds";
        const match = value.match(/^\(payload_for_retry->assignment->>staffIds\.like\.\*([A-Za-z0-9-]+)\*,/);
        if (!match || value !== `(${field}.like.*${match[1]}*,${field}.is.null,${field}.in.("",false,0))`) {
          throw new Error("Unsupported fixture OR filter");
        }
        rows = rows.filter(row => {
          const ids = row.payload_for_retry?.assignment?.staffIds;
          const text = ids == null ? null : typeof ids === "string" ? ids : JSON.stringify(ids);
          return text === null || ["", "false", "0"].includes(text) || text.includes(match[1]);
        });
      }
      if (value.startsWith("eq.")) rows = rows.filter(row => String(row[key]) === value.slice(3));
      if (value.startsWith("gt.")) rows = rows.filter(row => row[key] > value.slice(3));
      if (value.startsWith("cs.")) rows = rows.filter(row => JSON.parse(value.slice(3)).every(id => row[key]?.includes(id)));
      if (value.startsWith("in.(")) { const ids = value.slice(4, -1).split(","); rows = rows.filter(row => ids.includes(row[key])); }
      if (key === "and") { const cursor = value.match(/id\.gt\.([^)]*)/); if (cursor) rows = rows.filter(row => row.id > cursor[1]); }
    }
    const key = u.searchParams.get("order")?.split(".")[0] || "id";
    rows = rows.slice().sort((a, b) => String(a[key]).localeCompare(String(b[key])));
    const total = rows.length;
    const limit = Math.min(Number(u.searchParams.get("limit") || 1000), state.cap || 1000);
    rows = rows.slice(Number(u.searchParams.get("offset") || 0), Number(u.searchParams.get("offset") || 0) + limit);
    if ((accountView || calendarView) && !fixture.accountRows && !(calendarView && fixture.calendarRows)) rows = rows.map(row => ({ ...row, payload_for_retry: require("../../lib/account/order-list")
      .projectAccountListEntry({ payloadForRetry: row.payload_for_retry }).payloadForRetry }));
    if (calendarView && !fixture.calendarRows) {
      // Independently model the SQL view, including the completion-comment field
      // needed by the shared legacy order recognizer. Do not use its JS DTO mapper.
      const pick = (value, fields) => value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : value;
      const state = value => {
        const result = pick(value, ["isCreated", "createdAt", "status", "assignedStaff", "assignee", "selectedDate", "selectedTime", "frequency", "paymentMethod", "listHasOrderState"]);
        if (value && typeof value === "object" && !Array.isArray(value) && value.completion &&
          typeof value.completion === "object" && !Array.isArray(value.completion)) result.completion = pick(value.completion, ["cleanerComment"]);
        if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length && !Object.keys(result).length) result.listHasOrderState = true;
        return result;
      };
      rows = rows.map(row => ({ id: row.id, selected_date: row.selected_date, payload_for_retry: {
        orderState: state(row.payload_for_retry?.orderState ?? null), adminOrder: state(row.payload_for_retry?.adminOrder ?? null),
        calculatorData: pick(row.payload_for_retry?.calculatorData ?? null, ["selectedDate"]),
      } }));
    }
    const select = u.searchParams.get("select");
    if (select && select !== "*") rows = rows.map(row => Object.fromEntries(select.split(",").map(field => {
      const [alias, expression] = field.includes(":") ? field.split(":") : [field, field];
      return [alias, expression.split("->").reduce((value, part) => value?.[part], row) ?? null];
    })));
    const text = JSON.stringify(rows);
    const call = { table, query: u.search, method, bytes: Buffer.byteLength(text), rows: rows.length };
    calls.push(call);
    if (process.env.ACCOUNT_BENCH_CAPTURE) fs.appendFileSync(process.env.ACCOUNT_BENCH_CAPTURE, JSON.stringify(call) + "\n");
    return { ok: true, status: 200, text: async () => text, headers: { get: name =>
      name === "content-range" && !state.noCount ? `0-${Math.max(0, rows.length - 1)}/${total}` : null } };
  };
}

let serverFixture;
let serverFetch;
module.exports = async (url, options) => {
  if (!serverFetch) {
    serverFixture = createFixture(Number(process.env.ACCOUNT_BENCH_COUNT) || 1107, Number(process.env.ACCOUNT_BENCH_COMPLETED) || 107);
    serverFetch = createReadFetch(serverFixture, [], () => process.env.ACCOUNT_BENCH_CONTROL
      ? JSON.parse(fs.readFileSync(process.env.ACCOUNT_BENCH_CONTROL, "utf8")) : {}, { allowLogin: process.env.ACCOUNT_BENCH_ALLOW_LOGIN === "1" });
  }
  return serverFetch(url, options);
};
module.exports.createFixture = createFixture;
module.exports.createReadFetch = createReadFetch;
