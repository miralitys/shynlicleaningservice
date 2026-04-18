const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSitemapXml } = require("../lib/site/request-handler");

test("buildSitemapXml includes public blog routes and excludes internal routes", () => {
  const routeFileByPath = new Map([
    ["/", "/site/page108488156.html"],
    ["/blog", "/site/page108872586.html"],
    ["/blog/seasonal", "/site/page108872586.html"],
    ["/blog/seasonal/cleaning-checklist-before-thanksgiving-hosting", "/site/page108872586.html"],
    ["/quote", "/site/quote2.html"],
    ["/home-simple", "/site/page108488156.html"],
    ["/admin", "/site/page-admin.html"],
    ["/api/example", "/site/page-api.html"],
  ]);
  const fileMetaByPath = new Map([
    ["/site/page108488156.html", { mtimeMs: Date.parse("2026-01-27T15:35:20Z") }],
    ["/site/page108872586.html", { mtimeMs: Date.parse("2026-01-27T18:26:27Z") }],
  ]);

  const xml = buildSitemapXml({
    siteOrigin: "https://shynlicleaningservice.com/",
    routeFileByPath,
    fileMetaByPath,
    excludedRoutes: new Set(["/quote", "/home-simple"]),
    lastmodOverrides: new Map([
      ["/blog", "2026-04-18"],
      ["/blog/seasonal", "2026-04-18"],
      ["/blog/seasonal/cleaning-checklist-before-thanksgiving-hosting", "2026-04-18"],
    ]),
  });

  assert.match(xml, /<loc>https:\/\/shynlicleaningservice\.com<\/loc>/);
  assert.match(xml, /<loc>https:\/\/shynlicleaningservice\.com\/blog<\/loc>/);
  assert.match(xml, /<loc>https:\/\/shynlicleaningservice\.com\/blog\/seasonal<\/loc>/);
  assert.match(
    xml,
    /<loc>https:\/\/shynlicleaningservice\.com\/blog\/seasonal\/cleaning-checklist-before-thanksgiving-hosting<\/loc>/
  );
  assert.match(xml, /<lastmod>2026-04-18T00:00:00\.000Z<\/lastmod>/);
  assert.doesNotMatch(xml, /https:\/\/shynlicleaningservice\.com\/quote/);
  assert.doesNotMatch(xml, /https:\/\/shynlicleaningservice\.com\/home-simple/);
  assert.doesNotMatch(xml, /https:\/\/shynlicleaningservice\.com\/admin/);
  assert.doesNotMatch(xml, /https:\/\/shynlicleaningservice\.com\/api\/example/);
});
