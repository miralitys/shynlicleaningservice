"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parse } = require("parse5");
const { startServer, stopServer } = require("./server-test-helpers");
const { inspectProfiles } = require("../scripts/audit-footer-profiles");

const normalGoogle = "https://www.google.com/maps?cid=9307087877612204108";
const auroraGoogle = "https://www.google.com/maps?cid=5408416184318024401";
const shared = [
  ["Yelp", "https://www.yelp.com/biz/shynli-cleaning-naperville-2"],
  ["BBB", "https://www.bbb.org/us/il/naperville/profile/cleaning-services/shynli-cleaning-service-0654-1000144666"],
  ["Thumbtack", "https://www.thumbtack.com/il/naperville/house-cleaning/shynli-cleaning-service/service/572036872380112901"],
  ["Nextdoor", "https://nextdoor.com/pages/shynli-cleaning/"],
];
const attr = (node, key) => node.attrs?.find(value => value.name === key)?.value;
function nodes(node, predicate) { return [...(predicate(node) ? [node] : []), ...(node.childNodes || []).flatMap(child => nodes(child, predicate))]; }
const schemas = html => nodes(parse(html), node => node.tagName === "script" && attr(node, "type") === "application/ld+json").map(node => JSON.parse(node.childNodes.map(child => child.value || "").join("")));

test("all public footer variants have exactly five accessible, followed, new-tab profile links", async () => {
  const app = await startServer();
  try {
    for (const route of ["/", "/naperville", "/aurora", "/pricing", "/service-areas", "/blog", "/blog/checklists/house-cleaning-checklist-for-busy-homeowners", "/services/regular-cleaning", "/quote", "/quote-no-price", "/quote-no-calculator", "/privacy-policy", "/ads", "/ads-v2", "/pricing-v2", "/service-areas-v2", "/services/deep-cleaning/ads-v2", "/services/move-in-move-out-cleaning/ads-v2"]) {
      const response = await fetch(app.baseUrl + route);
      assert.equal(response.status, 200, route);
      const html = await response.text();
      const profiles = inspectProfiles(html);
      assert.equal(profiles.footers, 1, route);
      assert.equal(profiles.rows, 1, route);
      const expected = [["Google", route === "/aurora" ? auroraGoogle : normalGoogle], ...shared];
      assert.deepEqual(profiles.links, expected.map(([name, href]) => ({ href, label: `Shynli Cleaning on ${name}`, target: "_blank", rel: "noopener", text: name })), route);
      assert.match(html, /Find us on/);
      assert.match(html, /\.shynli-site-footer__profiles\{display:flex;flex-wrap:wrap;/);
      assert.equal(await (await fetch(app.baseUrl + route)).text(), html, route);
    }
    const missing = await fetch(app.baseUrl + "/__footer_test_missing_page");
    assert.equal(missing.status, 404);
    assert.equal(inspectProfiles(await missing.text()).rows, 1);
    const home = schemas(await (await fetch(app.baseUrl + "/")).text());
    const business = home.flatMap(value => value["@graph"] || [value]).find(value => value["@id"] === "https://shynlicleaningservice.com/#localbusiness");
    assert.deepEqual(new Set(business.sameAs), new Set([normalGoogle, ...shared.map(([, href]) => href)]));
    const aurora = schemas(await (await fetch(app.baseUrl + "/aurora")).text()).find(value => value["@type"] === "Service");
    assert.deepEqual(aurora.sameAs, [auroraGoogle]);
    assert.deepEqual(aurora.provider, { "@id": "https://shynlicleaningservice.com/#localbusiness" });
  } finally { await stopServer(app.child); }
});
