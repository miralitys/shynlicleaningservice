"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { startServer, stopServer } = require("./server-test-helpers");
const { createAdminSession, loadAdminConfig } = require("./admin-route-helpers");

test("a failed menu counter does not hide settings or report zero, and recovers on the next request", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"shynli-menu-outage-"));
  const control = path.join(root,"control.json");
  const env = { ADMIN_MASTER_SECRET: "isolated-menu-failure-test", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", ACCOUNT_SECTION_CONTROL: control,
    SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname,"support/account-section-fixture.cjs"),
    GHL_API_KEY: "", GHL_LOCATION_ID: "", CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999" };
  await fs.writeFile(control,JSON.stringify({ adminMenuError:true }));
  const app = await startServer({ env });
  try {
    const cookie = await createAdminSession(app.baseUrl,loadAdminConfig(env));
    const read = () => fetch(app.baseUrl+"/admin/settings?section=checklists",{
      headers:{ cookie:`shynli_admin_session=${cookie}` }, redirect:"manual" });
    const failed = await read();
    assert.equal(failed.status,200);
    const html = await failed.text();
    assert.match(html,/Шаблоны чек-листов/);
    assert.match(html,/data-admin-nav-task-count-unavailable="true"/);
    assert.doesNotMatch(html,/Menu denied|42501|sb_secret_fake/);
    await fs.writeFile(control,JSON.stringify({}));
    const recovered = await read();
    assert.equal(recovered.status,200);
    assert.doesNotMatch(await recovered.text(),/data-admin-nav-task-count-unavailable/);
  } finally { await stopServer(app.child);await fs.rm(root,{ recursive:true,force:true }); }
});
