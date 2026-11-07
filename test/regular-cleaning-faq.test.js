"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectHtml, visibleText } = require("../lib/site/structured-data");
const { startServer, stopServer } = require("./server-test-helpers");

let app;
test.before(async () => { app = await startServer({ env: { HTML_CACHE_WARM_MODE: "off" } }); });
test.after(async () => { await stopServer(app?.child); });

test("regular cleaning has six accessible, service-specific questions matching one FAQPage", async () => {
  const response = await fetch(`${app.baseUrl}/services/regular-cleaning`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const facts = inspectHtml(html);
  const section = facts.nodes.find(node => node.attrs?.some(a => a.name === "id" && a.value === "regular-cleaning-faq"));
  assert.ok(section);
  assert.equal(section.tagName, "section");
  assert.match(visibleText(section), /Regular Cleaning FAQ/);
  const questions = facts.nodes.filter(node => node.tagName === "summary" && node.parentNode?.attrs?.some(a => a.value === "regular-faq__item"));
  assert.equal(questions.length, 6);
  assert.equal(facts.faq.length, 6);
  for (const question of questions) {
    assert.ok(question.childNodes.some(node => node.tagName === "h3"));
    assert.ok(question.parentNode.childNodes.some(node => node.tagName === "p"));
  }
  const schemas = facts.scripts.map(script => JSON.parse(script.childNodes.map(node => node.value || "").join("")));
  const faq = schemas.filter(schema => schema["@type"] === "FAQPage");
  assert.equal(faq.length, 1);
  assert.deepEqual(faq[0].mainEntity, facts.faq);
  assert.equal(schemas.filter(schema => schema["@type"] === "Service").length, 1);
  assert.equal(schemas.filter(schema => schema["@type"] === "BreadcrumbList").length, 1);
  assert.ok(html.indexOf('id="regular-cleaning-reviews"') < html.indexOf('id="regular-cleaning-faq"'));
  assert.ok(html.indexOf('id="regular-cleaning-faq"') < html.indexOf("Need More Than Regular Cleaning?"));
  assert.doesNotMatch(visibleText(section), /\$|guaranteed|same cleaner/i);
});

test("regular-cleaning FAQ is not added to other services or advertising variants", async () => {
  for (const route of ["/", "/services/deep-cleaning", "/services/move-in-move-out-cleaning", "/services/regular-cleaning/ads", "/services/regular-cleaning/ads-v2", "/services/regular-cleaning/ads-lp"]) {
    const response = await fetch(app.baseUrl + route);
    assert.equal(response.status, 200, route);
    assert.doesNotMatch(await response.text(), /id="regular-cleaning-faq"/, route);
  }
});
