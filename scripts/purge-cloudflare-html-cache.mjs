#!/usr/bin/env node
"use strict";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ZONE_ID = process.env.CF_ZONE_ID;
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://shynlicleaningservice.com").replace(
  /\/+$/,
  ""
);
const CF_PURGE_EVERYTHING = process.env.CF_PURGE_EVERYTHING === "1";
const PURGE_BATCH_SIZE = 30;

function normalizeRoute(rawPath) {
  let p = rawPath || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function toAbsoluteUrl(routePath) {
  return `${SITE_BASE_URL}${routePath === "/" ? "/" : routePath}`;
}

async function readRouteUrls() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const routesPath = path.resolve(scriptDir, "..", "routes.json");
  const raw = await fs.readFile(routesPath, "utf8");
  const routes = JSON.parse(raw);

  const routePaths = new Set(["/"]);
  for (const routePath of Object.keys(routes)) {
    routePaths.add(normalizeRoute(routePath));
  }

  return [...routePaths].sort().map(toAbsoluteUrl);
}

function splitIntoBatches(items, batchSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += batchSize) {
    chunks.push(items.slice(i, i + batchSize));
  }
  return chunks;
}

async function callCloudflarePurge(payload) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(`Cloudflare purge failed: ${JSON.stringify(body)}`);
  }
}

async function main() {
  if (!CF_API_TOKEN || !CF_ZONE_ID) {
    console.error("Missing env vars: CF_API_TOKEN and CF_ZONE_ID are required.");
    process.exit(1);
  }

  if (CF_PURGE_EVERYTHING) {
    await callCloudflarePurge({ purge_everything: true });
    console.log("Cloudflare cache purged: EVERYTHING");
    return;
  }

  const urls = await readRouteUrls();
  const batches = splitIntoBatches(urls, PURGE_BATCH_SIZE);

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    await callCloudflarePurge({ files: batch });
    console.log(`Purged batch ${i + 1}/${batches.length} (${batch.length} urls)`);
  }

  console.log(`Cloudflare HTML purge complete: ${urls.length} urls`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
