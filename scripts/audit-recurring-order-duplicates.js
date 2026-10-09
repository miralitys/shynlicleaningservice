"use strict";

const fs = require("node:fs/promises");
const { getEntryOrderState } = require("../lib/admin-order-state");
const { createSupabaseQuoteOpsClient, mapRowToEntry } = require("../lib/supabase-quote-ops");

function phoneKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function dateKey(value) {
  const text = String(value || "");
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const us = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  return us ? `${us[3]}-${us[1]}-${us[2]}` : "";
}

function timeKey(value) {
  const match = String(value || "").match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i);
  if (!match) return "";
  let hour = Number(match[1]);
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return hour <= 23 && Number(match[2]) <= 59 ? `${String(hour).padStart(2, "0")}:${match[2]}` : "";
}

function statusKey(value) {
  const status = String(value || "").trim().toLowerCase();
  if (/^(new|новы[йе])(?:\s|$)/u.test(status)) return "new";
  if (/^(scheduled|запланировано)(?:\s|$)/u.test(status)) return "scheduled";
  if (/^(completed|завершено|уборка завершена)(?:\s|$)/u.test(status)) return "completed";
  if (/^(canceled|cancelled|отменено)(?:\s|$)/u.test(status)) return "canceled";
  return status;
}

function normalizeAuditOrder(input) {
  const row = input.payload_for_retry ? mapRowToEntry(input) : input;
  const state = getEntryOrderState(row);
  const field = (name) => (row.fields || []).find((item) => item.name === name)?.value;
  const requestId = row.requestId || String(row.order || "").match(/\b(manual-\S+|[a-f\d-]{36})\b/i)?.[1] ||
    row.cells?.[3]?.split(" • ")[1] || "";
  const name = row.customerName || row.name || String(row.order || "").split(requestId)[0].replace(/^[A-Z]{1,3}\s+/, "").trim();
  const phone = row.customerPhone || String(row.contacts || row.cells?.[0] || "").match(/\+?1?\(?\d{3}\)?[\d ()-]{7,}/)?.[0] || "";
  const identities = [row.contactId, row.clientId, state.clientId].filter(Boolean).map((id) => `id:${id}`);
  if (phoneKey(phone)) identities.push(`phone:${phoneKey(phone)}`);
  return {
    id: row.id,
    requestId,
    customerName: name,
    customerPhone: phoneKey(phone),
    identities,
    date: dateKey(field("selectedDate") || state.selectedDate || row.selectedDate || row.when),
    time: timeKey(field("selectedTime") || state.selectedTime || row.selectedTime || row.when),
    status: statusKey(field("orderStatus") || state.status || row.status),
    team: row.fields
      ? row.fields.filter((item) => item.name === "assignedStaff" && item.checked).map((item) => item.value).join(", ")
      : row.team || state.assignedStaff || row.assignedStaff || "",
    address: field("quoteFullAddress") || row.fullAddress || row.address || "",
    amount: field("totalPrice") || row.totalPrice || row.amount || "",
    service: field("quoteServiceType") || row.serviceType || row.type || "",
    source: row.fields ? "live-order-dialog" : row.order ? "csv-snapshot" : "ledger",
  };
}

function auditDuplicates(rows) {
  const orders = [...new Map(rows.map((row) => [row.id, normalizeAuditOrder(row)])).values()];
  const bySchedule = new Map();
  for (const order of orders) {
    if (!order.id || !order.date || !order.time || order.identities.length === 0) continue;
    const key = `${order.date}T${order.time}`;
    if (!bySchedule.has(key)) bySchedule.set(key, []);
    bySchedule.get(key).push(order);
  }
  const groups = [];
  for (const scheduledOrders of bySchedule.values()) {
    const connected = [];
    for (const order of scheduledOrders) {
      const matches = connected.filter((group) => group.some((candidate) =>
        candidate.identities.some((identity) => order.identities.includes(identity))
      ));
      if (matches.length === 0) connected.push([order]);
      else {
        matches[0].push(order);
        for (const group of matches.slice(1)) {
          matches[0].push(...group);
          connected.splice(connected.indexOf(group), 1);
        }
      }
    }
    for (const members of connected.filter((group) => group.length > 1)) {
      const addresses = new Set(members.map((order) => order.address.trim().toLowerCase()));
      const active = members.filter((order) => !["canceled", "completed"].includes(order.status));
      groups.push({
        customerName: members[0].customerName,
        date: members[0].date,
        time: members[0].time,
        hasNew: members.some((order) => order.status === "new"),
        activeCount: active.length,
        sameAddress: addresses.size === 1 && !addresses.has(""),
        sameRequestId: Boolean(members[0].requestId) && new Set(members.map((order) => order.requestId)).size === 1,
        reviewOnly: active.length < 2 || addresses.size !== 1 || addresses.has(""),
        orders: members.map(({ identities, ...order }) => order),
      });
    }
  }
  groups.sort((a, b) => a.customerName.localeCompare(b.customerName) || a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return {
    dryRun: true,
    ordersRead: orders.length,
    groupsWithNew: groups.filter((group) => group.hasNew).length,
    activeDuplicateGroups: groups.filter((group) => group.activeCount > 1).length,
    groups,
    deleted: 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !/^--(snapshot|recent|output)=/.test(arg))) {
    throw new Error("Read-only audit: --snapshot=orders.json --recent=live-orders.json --output=report.json. No delete/apply option.");
  }
  const option = (name) => (args.find((arg) => arg.startsWith(`--${name}=`)) || "").slice(name.length + 3);
  const readRows = async (file) => {
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    const rows = Array.isArray(data) ? data : data.entries;
    if (!Array.isArray(rows)) throw new Error("Expected an orders array");
    return rows;
  };
  let rows;
  if (option("snapshot")) rows = await readRows(option("snapshot"));
  else {
    const client = createSupabaseQuoteOpsClient();
    if (!client.isConfigured()) throw new Error("Supabase is not configured; no production data read");
    rows = (await client.fetchAllEntries()).filter((entry) => getEntryOrderState(entry).isCreated);
  }
  if (option("recent")) rows.push(...await readRows(option("recent")));
  const report = JSON.stringify(auditDuplicates(rows), null, 2);
  if (option("output")) await fs.writeFile(option("output"), `${report}\n`, { mode: 0o600 });
  else process.stdout.write(`${report}\n`);
}

module.exports = { auditDuplicates, normalizeAuditOrder };
if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
