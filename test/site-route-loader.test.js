const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { loadSiteRoutes } = require("../lib/site/request-handler");

function normalizeRoute(rawPath) {
  let value = rawPath || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

test("loadSiteRoutes merges managed html routes for generated blog pages", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-routes-"));
  const routesPath = path.join(tempDir, "routes.json");

  try {
    await fs.writeFile(
      routesPath,
      JSON.stringify({
        "/": "page108488156.html",
        "/blog": "page108872586.html",
      }),
      "utf8"
    );

    const routes = await loadSiteRoutes({
      ROUTES_PATH: routesPath,
      fsp: fs,
      managedHtmlRoutes: [
        ["/blog/checklists", "page108872586.html"],
        ["/blog/checklists/weekly-cleaning-checklist-for-a-3-bedroom-house", "page108872586.html"],
      ],
      normalizeRoute,
    });

    assert.equal(routes["/"], "page108488156.html");
    assert.equal(routes["/blog"], "page108872586.html");
    assert.equal(routes["/blog/checklists"], "page108872586.html");
    assert.equal(
      routes["/blog/checklists/weekly-cleaning-checklist-for-a-3-bedroom-house"],
      "page108872586.html"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
