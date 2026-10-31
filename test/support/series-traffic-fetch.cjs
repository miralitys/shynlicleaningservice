"use strict";

const fs = require("node:fs");
const { gzipSync } = require("node:zlib");
const { createSectionFixture, createSectionFetch } = require("./account-section-fixture.cjs");
const read = createSectionFetch(createSectionFixture(), [], () => ({ calendarBatch: true }));

module.exports = async (url, options) => {
  const response = await read(url, options);
  const body = await response.text(), u = new URL(url);
  fs.appendFileSync(process.env.SERIES_TRAFFIC_CAPTURE, JSON.stringify({
    table: u.pathname.split("/").at(-1), kind: u.searchParams.get("kind"), method: options?.method || "GET",
    bytes: Buffer.byteLength(body), gzipBytes: gzipSync(body).length,
  }) + "\n");
  return response;
};
