"use strict";
const assert = require("node:assert/strict");

async function loadTaskDialogs(baseUrl, html, cookie) {
  const urls = [...html.matchAll(/data-admin-dialog-url="([^"]*taskDialog=1[^"]*)"/g)]
    .map(match => match[1].replace(/&amp;/g, "&"));
  assert.doesNotMatch(html, /<dialog\b[^>]*id="admin-quote-task-result-dialog-/);
  for (const url of urls) {
    const response = await fetch(baseUrl + url, { headers: { cookie }, redirect: "manual" });
    assert.equal(response.status, 200);
    const dialog = await response.text();
    assert.match(dialog, /<dialog\b[^>]*id="admin-quote-task-result-dialog-/);
    html += dialog;
  }
  return html;
}

function taskDialogs(html) {
  return [...html.matchAll(/<dialog\b[^>]*id="admin-quote-task-result-dialog-[^"]+"[^>]*>[\s\S]*?<\/dialog>/g)]
    .map(match => [match[0], (match[0].match(/name="taskId" value="([^"]+)"/) || [])[1]]);
}

module.exports = { loadTaskDialogs, taskDialogs };
