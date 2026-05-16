const WEB_LEADS_SECRET = "PASTE_RANDOM_SECRET_HERE";
const DEFAULT_TAB_NAME = "Web Leads";

const WEB_LEADS_HEADERS = [
  "Date/Time",
  "Lead Source",
  "Name",
  "Phone",
  "Email",
  "Zip Code",
  "Service",
  "Details",
  "Message",
  "GCLID",
  "Source / Medium",
  "Campaign",
  "Keyword",
  "Landing Page",
  "Status",
  "Price",
  "Order #",
  "Notes",
  "Upload Status",
  "Upload Date",
];

function doPost(event) {
  try {
    const payload = JSON.parse((event.postData && event.postData.contents) || "{}");

    if (WEB_LEADS_SECRET && payload.secret !== WEB_LEADS_SECRET) {
      return jsonResponse({
        ok: false,
        error: "unauthorized",
      });
    }

    const spreadsheet = payload.sheetId
      ? SpreadsheetApp.openById(payload.sheetId)
      : SpreadsheetApp.getActiveSpreadsheet();
    const tabName = payload.tabName || DEFAULT_TAB_NAME;
    const sheet = spreadsheet.getSheetByName(tabName) || spreadsheet.insertSheet(tabName);
    ensureHeaders(sheet);

    const rows = Array.isArray(payload.values) ? payload.values : [];
    rows.forEach(function appendRow(row) {
      if (!Array.isArray(row)) return;
      const normalized = WEB_LEADS_HEADERS.map(function normalizeCell(_, index) {
        return row[index] == null ? "" : row[index];
      });
      sheet.appendRow(normalized);
    });

    return jsonResponse({
      ok: true,
      appended: rows.length,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: String((error && error.message) || error),
    });
  }
}

function ensureHeaders(sheet) {
  const current = sheet.getRange(1, 1, 1, WEB_LEADS_HEADERS.length).getValues()[0];
  if (current.join("|") === WEB_LEADS_HEADERS.join("|")) return;

  sheet.getRange(1, 1, 1, WEB_LEADS_HEADERS.length).setValues([WEB_LEADS_HEADERS]);
  sheet.setFrozenRows(1);
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
