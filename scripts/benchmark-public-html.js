"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { execFileSync } = require("node:child_process");
const { startServer, stopServer } = require("../test/server-test-helpers");
const { createUserSessionToken, loadUserAuthConfig } = require("../lib/account-auth");

const hash = text => createHash("sha256").update(text).digest("hex");
const median = values => {
  const a = [...values].sort((x, y) => x - y);
  return (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2;
};
const round = number => Math.round(number * 100) / 100;
const publicRoutes = require("../routes.json");
const { BLOG_ARTICLES } = require("../lib/site/blog-articles");
const { serviceCityRoutes } = require("../lib/site/service-city");
const coldRoutes = ["/westmont", "/wayne", "/darien", "/plano", "/winfield", "/shorewood",
  "/naperville", "/aurora", "/services/airbnb-cleaning", "/services/deep-cleaning", "/pricing", "/quote"];
const accountRoutes = ["/account?section=calendar&view=month&date=2099-01-01&calendarCompact=1",
  "/account?section=calendar&date=2099-01-01", "/account?section=payroll", "/account?history=all&page=1",
  "/account?history=all&page=2", "/account?fragment=order-detail&order=order-00001"];

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-public-html-bench-"));
  const capture = path.join(root, "reads.ndjson");
  const control = path.join(root, "control.json");
  const statsPath = path.join(root, "prepared-cache.json");
  const baseline = process.env.PUBLIC_HTML_BASELINE_REF || "ff32e7c3";
  const expected = new Map();
  const results = [];
  const env = { ADMIN_MASTER_SECRET: "isolated-public-html-read", SUPABASE_URL: "https://account-benchmark.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake", GHL_API_KEY: "", GHL_LOCATION_ID: "", GOOGLE_PLACES_API_KEY: "",
    CLIENT_REMINDER_BOOTSTRAP_DELAY_MS: "99999999", HTML_CACHE_WARM_MODE: "minimal",
    ENABLE_PERF_ENDPOINT: "1", PERF_ENDPOINT_TOKEN: "isolated-perf", ACCOUNT_SECTION_CAPTURE: capture,
    ACCOUNT_SECTION_CONTROL: control, SHYNLI_FETCH_STUB_ENTRY: path.resolve(__dirname, "../test/support/account-section-fixture.cjs") };
  const token = createUserSessionToken(loadUserAuthConfig(env), { userId: "user-a", staffId: "a", email: "a@example.test" });
  try {
    await fs.writeFile(control, JSON.stringify({ delayMs: 0, calendarBatch: true }));
    for (const label of ["before", "after"]) {
      await fs.writeFile(capture, "");
      const app = await startServer({ env: { ...env, PUBLIC_HTML_BASELINE_REF: label === "before" ? baseline : "",
        PUBLIC_HTML_STATS_PATH: label === "after" ? statsPath : "" },
        nodeArgs: ["--require", path.resolve(__dirname, "../test/support/public-html-baseline-loader.cjs")] });
      try {
        const get = async (route, compare = true, extraHeaders = {}) => {
          const started = performance.now();
          const response = await fetch(app.baseUrl + route, { redirect: "manual", headers: {
            ...(route.startsWith("/account") ? { cookie: `shynli_user_session=${token}` } : {}), ...extraHeaders } });
          const body = await response.text();
          const record = { status: response.status, hash: hash(body), bytes: Buffer.byteLength(body),
            headers: Object.fromEntries(["content-type", "cache-control", "cdn-cache-control", "cloudflare-cdn-cache-control",
              "etag", "last-modified", "link", "x-robots-tag", "location"].map(key => [key, response.headers.get(key)])) };
          if (compare) {
            if (!expected.has(route)) expected.set(route, record);
            else assert.deepEqual(record, expected.get(route), `HTTP output changed for ${route}`);
          }
          return { ...record, ms: round(performance.now() - started),
            appMs: Number(response.headers.get("server-timing")?.match(/app;dur=([\d.]+)/)?.[1] || 0) };
        };
        for (const route of accountRoutes) assert.equal((await get(route)).status, 200, route);
        const concurrent = [];
        for (const route of coldRoutes) {
          const publicRequest = get(route);
          // Let the public request start its CPU work before a separate calendar request arrives.
          await new Promise(resolve => setTimeout(resolve, 5));
          const [page, calendar] = await Promise.all([publicRequest, get(accountRoutes[0])]);
          concurrent.push({ route, publicMs: page.ms, calendarMs: calendar.ms, calendarAppMs: calendar.appMs });
        }
        const paths = process.env.PUBLIC_HTML_PROFILE_ONLY === "1" ? [] : [...new Set([...Object.keys(publicRoutes), ...BLOG_ARTICLES.map(article => article.path),
          ...serviceCityRoutes(publicRoutes).map(([route]) => route), "/sitemap.xml", "/robots.txt", "/unknown-parity-path"])];
        for (const route of paths) await get(route);
        const repeat = [];
        for (const route of coldRoutes) repeat.push({ route, ...(await get(route)) });
        const conditional = await get("/wayne", false, { "if-none-match": expected.get("/wayne").headers.etag });
        assert.equal(conditional.status, 304);
        for (const route of accountRoutes) await get(route);
        const reads = (await fs.readFile(capture, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
        assert.ok(reads.every(x => x.method === "GET" || x.method === "POST" && x.table === "read_account_calendar_entries"));
        const perfResponse = await fetch(app.baseUrl + "/__perf", { headers: { "x-perf-token": "isolated-perf" } });
        assert.equal(perfResponse.status, 200);
        const perf = await perfResponse.json();
        results.push({ label, publicPathsChecked: paths.length, privatePathsChecked: accountRoutes.length,
          concurrent, repeat: repeat.map(({ route, ms, appMs, bytes }) => ({ route, ms, appMs, bytes })),
          concurrentCalendarMedianMs: round(median(concurrent.map(x => x.calendarMs))),
          repeatedPublicMedianMs: round(median(repeat.map(x => x.ms))), eventLoop: perf.event_loop,
          sampledRssKiB: Number(execFileSync("ps", ["-o", "rss=", "-p", String(app.child.pid)], { encoding: "utf8" }).trim()),
          readCount: reads.length, writeCount: reads.filter(x => x.method !== "GET" && x.table !== "read_account_calendar_entries").length });
      } finally { await stopServer(app.child); }
      if (label === "after") results.at(-1).preparedCache = JSON.parse(await fs.readFile(statsPath, "utf8"));
    }
    console.log(JSON.stringify({ baseline, after: "working tree", noProductionAccess: true,
      overlap: "Public request starts 5 ms before the calendar request; no injected database or CPU delay.",
      comparison: "Exact HTTP body hashes and content/cache/SEO/ETag/Last-Modified/Link/Location headers; two passes across public paths and private control paths.",
      fixture: "254 synthetic orders, 163 completed, two staff, fixed overrides and saved payouts; read-only fake database; no browser paint measurement.",
      results }, null, 2));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
