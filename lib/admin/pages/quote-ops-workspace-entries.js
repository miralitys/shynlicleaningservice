"use strict";

async function loadQuoteOpsWorkspaceEntries(ledger) {
  if (!ledger) return [];
  // Read the full ledger before applying visibility, search or stage filters.
  const entries = typeof ledger.listWorkspaceListEntries === "function" ? await ledger.listWorkspaceListEntries()
    : typeof ledger.listAllEntries === "function" ? await ledger.listAllEntries({ completeCursor: true })
    : await ledger.listEntries({ includeHidden: true, limit: Number.MAX_SAFE_INTEGER });
  return entries.slice().sort((left, right) =>
    String(right.createdAt || "").localeCompare(String(left.createdAt || "")) ||
    String(right.id || "").localeCompare(String(left.id || ""))
  );
}

module.exports = { loadQuoteOpsWorkspaceEntries };
