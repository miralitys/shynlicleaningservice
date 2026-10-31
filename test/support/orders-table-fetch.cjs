"use strict";

const fs = require("node:fs");
const { gzipSync } = require("node:zlib");
const { createSectionFixture, createSectionFetch } = require("./account-section-fixture.cjs");
const { readOrderStaffView } = require("./orders-staff-view.cjs");
const fixture = createSectionFixture();
for (const row of fixture.rows.filter(r => r.kind === "quote_submission")) {
  const payload = row.payload_for_retry;
  payload.calculatorData = { ...payload.calculatorData, bedrooms: 3, bathrooms: 2.5, squareFootage: "1201-2000",
    selectedServices: { insideOven: true, insideCabinets: true }, serviceQuantities: { interiorWindows: 6 },
    additionalRooms: { office: 1, sunroom: 0, loft: 0 }, calculatedPrice: row.total_price, calculationVersion: "QA" };
  payload.adminClient = { addressBook: [{ address: row.full_address, rooms: 3, bathrooms: 2.5 },
    { address: `Second QA address ${row.id}`, rooms: 2, bathrooms: 2 }], automaticNotificationsEnabled: true, notes: "Saved customer details" };
  payload.adminLead = { status: "confirmed", managerId: "manager", updatedAt: row.updated_at, tasks: [],
    history: [{ action: "assigned", previousManagerId: "", managerId: "manager", at: row.updated_at }], notes: "Saved lead notes" };
}
const read = createSectionFetch(fixture, [], () => ({ calendarBatch: true, primaryError: { status: 404,
  body: { code: "PGRST205", message: "Could not find the table public.admin_staff_assignments" } } }));
module.exports = async (url, options) => {
  const u = new URL(url);
  const response = u.pathname.endsWith("/admin_order_staff_list_entries") ? readOrderStaffView(fixture.rows, u) : await read(url, options);
  const body = await response.text();
  fs.appendFileSync(process.env.SERIES_TRAFFIC_CAPTURE, JSON.stringify({ table: u.pathname.split("/").at(-1),
    select: u.searchParams.get("select"), method: options?.method || "GET", bytes: Buffer.byteLength(body), gzipBytes: gzipSync(body).length }) + "\n");
  return response;
};
