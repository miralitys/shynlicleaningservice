"use strict";

const path = require("node:path");
const fsp = require("node:fs/promises");
const { createSupabaseAdminStaffClient } = require("../lib/supabase-admin-staff");
const { createSupabaseQuoteOpsClient } = require("../lib/supabase-quote-ops");

const STAFF_STORE_PATH = path.join(__dirname, "..", "data", "admin-staff-store.json");
const DEMO_ORDERS = [
  {
    id: "bb1f32db-cfb0-4344-93ab-280b0813917a",
    requestId: "demo-order-emily-johnson",
    customerName: "Emily Johnson",
    customerEmail: "demo.emily.johnson@shynli.test",
    customerPhone: "312-555-1101",
    serviceType: "deep",
    serviceName: "Deep Cleaning",
    selectedDate: "2026-04-14",
    selectedTime: "09:00",
    frequency: "weekly",
    fullAddress: "215 North Elm Street, Naperville, IL",
    totalPrice: 245,
  },
  {
    id: "f5c2baa3-0fdc-4838-9d53-6171b2822cb6",
    requestId: "demo-order-michael-carter",
    customerName: "Michael Carter",
    customerEmail: "demo.michael.carter@shynli.test",
    customerPhone: "312-555-1102",
    serviceType: "standard",
    serviceName: "Standard Cleaning",
    selectedDate: "2026-04-14",
    selectedTime: "13:30",
    frequency: "biweekly",
    fullAddress: "804 River Park Lane, Aurora, IL",
    totalPrice: 165,
  },
  {
    id: "5aeb1ab8-5abe-4ac6-92e9-da572c88c295",
    requestId: "demo-order-sophia-lee",
    customerName: "Sophia Lee",
    customerEmail: "demo.sophia.lee@shynli.test",
    customerPhone: "312-555-1103",
    serviceType: "move-in/out",
    serviceName: "Move-in/Out Cleaning",
    selectedDate: "2026-04-15",
    selectedTime: "11:00",
    frequency: "",
    fullAddress: "129 West Addison Street, Chicago, IL",
    totalPrice: 320,
  },
  {
    id: "ff7d529e-9be6-47f5-a612-657e7dde35cd",
    requestId: "demo-order-david-miller",
    customerName: "David Miller",
    customerEmail: "demo.david.miller@shynli.test",
    customerPhone: "312-555-1104",
    serviceType: "standard",
    serviceName: "Standard Cleaning",
    selectedDate: "2026-04-16",
    selectedTime: "10:30",
    frequency: "monthly",
    fullAddress: "58 South Grove Avenue, Elgin, IL",
    totalPrice: 180,
  },
];

function buildDemoOrderEntry(order) {
  const timestamp = new Date().toISOString();
  return {
    id: order.id,
    kind: "quote_submission",
    status: "success",
    createdAt: timestamp,
    updatedAt: timestamp,
    requestId: order.requestId,
    sourceRoute: "/admin/orders",
    source: "admin-demo-seed",
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    serviceType: order.serviceType,
    serviceName: order.serviceName,
    totalPrice: Number(order.totalPrice || 0),
    totalPriceCents: Math.round(Number(order.totalPrice || 0) * 100),
    selectedDate: order.selectedDate,
    selectedTime: order.selectedTime,
    fullAddress: order.fullAddress,
    httpStatus: 200,
    code: "SEEDED",
    retryable: false,
    warnings: [],
    errorMessage: "",
    payloadForRetry: {
      calculatorData: {
        serviceType: order.serviceType,
        selectedDate: order.selectedDate,
        selectedTime: order.selectedTime,
        frequency: order.frequency,
      },
      adminOrder: {
        status: "scheduled",
        frequency: order.frequency,
        assignedStaff: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
  };
}

async function main() {
  const quoteOpsClient = createSupabaseQuoteOpsClient({
    env: process.env,
    fetch: global.fetch,
  });
  const staffClient = createSupabaseAdminStaffClient({
    env: process.env,
    fetch: global.fetch,
  });

  if (!quoteOpsClient.isConfigured() || !staffClient.isConfigured()) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const rawStaff = await fsp.readFile(STAFF_STORE_PATH, "utf8");
  const staffState = JSON.parse(rawStaff);
  const staffRecords = Array.isArray(staffState.staff) ? staffState.staff : [];
  const assignmentRecords = Array.isArray(staffState.assignments) ? staffState.assignments : [];

  for (const order of DEMO_ORDERS) {
    await quoteOpsClient.upsertEntry(buildDemoOrderEntry(order));
  }

  for (const staffRecord of staffRecords) {
    await staffClient.upsertStaff(staffRecord);
  }

  for (const assignmentRecord of assignmentRecords) {
    await staffClient.upsertAssignment(assignmentRecord);
  }

  const snapshot = await staffClient.fetchSnapshot();
  process.stdout.write(
    `Seeded ${DEMO_ORDERS.length} demo orders, ${snapshot.staff.length} staff, ${snapshot.assignments.length} assignments.\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
  process.exit(1);
});
