"use strict";

const fs = require("node:fs/promises");
const { createSupabaseQuoteOpsClient, mapRowToEntry } = require("../lib/supabase-quote-ops");
const { planAutomaticTaskCleanup, chicagoDateTime } = require("../lib/quote-ops/task-policy");

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !arg.startsWith("--snapshot=") && !arg.startsWith("--overrides=") && !arg.startsWith("--now="))) {
    throw new Error("Read-only audit. Supported options: --snapshot=file.json --overrides=file.json --now=ISO-date");
  }
  const option = (name) => (args.find((arg) => arg.startsWith(`--${name}=`)) || "").slice(name.length + 3);
  const now = option("now") || new Date().toISOString();
  const overrides = option("overrides") ? JSON.parse(await fs.readFile(option("overrides"), "utf8")) : [];
  let entries;
  if (option("snapshot")) {
    const input = JSON.parse(await fs.readFile(option("snapshot"), "utf8"));
    const rows = Array.isArray(input) ? input : input.entries;
    if (!Array.isArray(rows)) throw new Error("Snapshot must contain an entries array");
    entries = rows.map((row) => row.payload_for_retry ? mapRowToEntry(row) : row);
  } else {
    const client = createSupabaseQuoteOpsClient();
    if (!client.isConfigured()) throw new Error("Supabase is not configured; no production data read");
    entries = await client.fetchTaskAutomationEntries(chicagoDateTime(now).slice(0, 10));
  }
  const plan = planAutomaticTaskCleanup(entries, { now, overrides });
  process.stdout.write(`${JSON.stringify({ ...plan, dryRun: true, entriesRead: entries.length,
    completed: plan.changes.filter((change) => change.status === "completed").length,
    canceled: plan.changes.filter((change) => change.status === "canceled").length,
    applied: 0 }, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
