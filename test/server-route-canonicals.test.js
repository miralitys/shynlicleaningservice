"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { startServer, stopServer } = require("./server-test-helpers");

let serverProcess = null;
let BASE_URL = null;

test.before(async () => {
  const started = await startServer();
  serverProcess = started.child;
  BASE_URL = started.baseUrl;
});

test.after(async () => {
  await stopServer(serverProcess);
});

test("redirects mixed-case city URLs to lowercase canonicals", async () => {
  const response = await fetch(`${BASE_URL}/Naperville?utm_source=test`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/naperville?utm_source=test");
});

test("redirects legacy flat post-construction URLs to the service canonical", async () => {
  const response = await fetch(`${BASE_URL}/post-construction-cleaning?utm_source=test`, {
    redirect: "manual",
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "/services/post-construction-cleaning?utm_source=test");
});

test("serves the 404 page without uppercase city links", async () => {
  const response = await fetch(`${BASE_URL}/definitely-missing-page`);
  const body = await response.text();

  assert.equal(response.status, 404);
  assert.doesNotMatch(body, /href="\/Naperville"/);
  assert.doesNotMatch(body, /href="\/Addison"/);
  assert.match(body, /href="\/naperville"/);
  assert.match(body, /href="\/addison"/);
});
