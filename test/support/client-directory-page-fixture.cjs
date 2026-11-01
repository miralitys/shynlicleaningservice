"use strict";

const { createListFixture } = require("./admin-list-fixture.cjs");
const { createSectionFetch } = require("./account-section-fixture.cjs");
let read;

module.exports = (url, options) => {
  if (!read) read = createSectionFetch(createListFixture(154), [], () => ({ cap: 123 }));
  const p = new URL(url);
  if (process.env.CLIENT_DIRECTORY_BASELINE === "1" && p.pathname.endsWith("/admin_client_directory_entries")) {
    return Promise.resolve({ ok: false, status: 404, text: async () => JSON.stringify({
      code: "PGRST205", message: "Missing client directory view" }) });
  }
  return read(url, options);
};
