"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const HOST = "127.0.0.1";
const BOOTSTRAP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "shynli-test-bootstrap-"));
const BOOTSTRAP_PATH = path.join(BOOTSTRAP_ROOT, "register-runtime-shims.js");
const childTempDataRoots = new WeakMap();

fs.writeFileSync(
  BOOTSTRAP_PATH,
  `"use strict";
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const serverEntry = process.env.SHYNLI_SERVER_ENTRY ? path.resolve(process.env.SHYNLI_SERVER_ENTRY) : "";
const fetchStubEntry = process.env.SHYNLI_FETCH_STUB_ENTRY
  ? path.resolve(process.env.SHYNLI_FETCH_STUB_ENTRY)
  : "";
const originalResolveFilename = Module._resolveFilename;
const originalJsLoader = Module._extensions[".js"];

if (fetchStubEntry) {
  global.fetch = require(fetchStubEntry);
}

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === "stripe" && process.env.STRIPE_STUB_ENTRY) {
    return process.env.STRIPE_STUB_ENTRY;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

Module._extensions[".js"] = function loadJavaScript(module, filename) {
  if (serverEntry && path.resolve(filename) === serverEntry) {
    const sourceText = fs.readFileSync(filename, "utf8");
    const source = sourceText.startsWith("#!")
      ? sourceText.slice(sourceText.indexOf("\\n") + 1)
      : sourceText;
    const shim = \`
function normalizeConfiguredOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "https://shynlicleaningservice.com";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\\\\/+$/, "");
  }
}
\`;
    return module._compile(\`\${shim}\\n\${source}\`, filename);
  }
  return originalJsLoader(module, filename);
};
`
);

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for startup_ready log line"));
    }, 10000);

    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    }

    function onStdout(chunk) {
      const text = chunk.toString("utf8");
      if (text.includes('"type":"startup_ready"')) {
        cleanup();
        resolve();
      }
    }

    function onStderr(chunk) {
      const text = chunk.toString("utf8");
      if (text.trim()) {
        cleanup();
        reject(new Error(`Server wrote to stderr before ready: ${text.trim()}`));
      }
    }

    function onExit(code, signal) {
      cleanup();
      reject(new Error(`Server exited before ready (code=${code}, signal=${signal})`));
    }

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("exit", onExit);
  });
}

function buildNodePath(entries) {
  const current = process.env.NODE_PATH ? [process.env.NODE_PATH] : [];
  return [...current, ...entries.filter(Boolean)].join(path.delimiter);
}

function applyDefaultEnvValue(target, key, value) {
  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    target[key] = value;
  }
}

function buildIsolatedServerEnv(env = {}) {
  const tempDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shynli-test-data-"));
  const nextEnv = { ...env };
  const staffDocumentsDir = path.join(tempDataRoot, "staff-documents");

  applyDefaultEnvValue(nextEnv, "ADMIN_USERS_STORE_PATH", path.join(tempDataRoot, "admin-users-store.json"));
  applyDefaultEnvValue(nextEnv, "ADMIN_STAFF_STORE_PATH", path.join(tempDataRoot, "admin-staff-store.json"));
  applyDefaultEnvValue(nextEnv, "ADMIN_MAIL_STORE_PATH", path.join(tempDataRoot, "admin-mail-store.json"));
  applyDefaultEnvValue(nextEnv, "ADMIN_SETTINGS_STORE_PATH", path.join(tempDataRoot, "admin-settings-store.json"));
  applyDefaultEnvValue(nextEnv, "ADMIN_ORDER_MEDIA_STORAGE_DIR", path.join(tempDataRoot, "order-media"));
  applyDefaultEnvValue(nextEnv, "STAFF_W9_DOCUMENTS_DIR", staffDocumentsDir);
  applyDefaultEnvValue(nextEnv, "STAFF_CONTRACT_DOCUMENTS_DIR", staffDocumentsDir);
  applyDefaultEnvValue(
    nextEnv,
    "POLICY_ACCEPTANCE_DOCUMENTS_DIR",
    path.join(tempDataRoot, "policy-acceptance")
  );

  return {
    env: nextEnv,
    tempDataRoot,
  };
}

async function cleanupTempDataRoot(child) {
  if (!child || typeof child !== "object") return;
  const tempDataRoot = childTempDataRoots.get(child);
  if (!tempDataRoot) return;
  childTempDataRoots.delete(child);
  await fsp.rm(tempDataRoot, { recursive: true, force: true });
}

async function startServer({ env = {}, nodePathEntries = [], nodeArgs = [] } = {}) {
  const port = await getFreePort();
  const isolated = buildIsolatedServerEnv(env);
  const child = spawn("node", ["--require", BOOTSTRAP_PATH, ...nodeArgs, "server.js"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOST,
      PORT: String(port),
      SHYNLI_SERVER_ENTRY: path.join(PROJECT_ROOT, "server.js"),
      REQUEST_LOG_FLUSH_INTERVAL_MS: "50",
      PERF_SUMMARY_INTERVAL_MS: "600000",
      GHL_AUTO_DISCOVER_OPPORTUNITY_PIPELINE: "0",
      GHL_AUTO_DISCOVER_CUSTOM_FIELDS: "0",
      ...(nodePathEntries.length > 0 ? { NODE_PATH: buildNodePath(nodePathEntries) } : {}),
      ...isolated.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  childTempDataRoots.set(child, isolated.tempDataRoot);
  child.once("exit", () => {
    void cleanupTempDataRoot(child);
  });

  try {
    await waitForServer(child);
  } catch (error) {
    child.kill("SIGTERM");
    await cleanupTempDataRoot(child);
    throw error;
  }

  return {
    child,
    baseUrl: `http://${HOST}:${port}`,
  };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(resolve, 3000);
  });
  await cleanupTempDataRoot(child);
}

function createStripeStub() {
  const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shynli-stripe-stub-"));
  const moduleDir = path.join(stubRoot, "node_modules", "stripe");
  fs.mkdirSync(moduleDir, { recursive: true });

  const stubSource = `"use strict";
const fs = require("node:fs");

class StripeStub {
  constructor(secretKey) {
    this.secretKey = secretKey;
    this.checkout = {
      sessions: {
        create: async (options) => {
          fs.writeFileSync(
            process.env.STRIPE_CAPTURE_FILE,
            JSON.stringify({ secretKey: this.secretKey, options }, null, 2)
          );
          return {
            id: "cs_test_stub",
            url: "https://stripe.example/session",
          };
        },
      },
    };
  }
}

module.exports = StripeStub;
`;

  fs.writeFileSync(path.join(moduleDir, "index.js"), stubSource);

  return {
    stubRoot,
    stubEntry: path.join(moduleDir, "index.js"),
    captureFile: path.join(stubRoot, "capture.json"),
    cleanup() {
      fs.rmSync(stubRoot, { recursive: true, force: true });
    },
  };
}

function createFetchStub(routes) {
  const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shynli-fetch-stub-"));
  const captureFile = path.join(stubRoot, "capture.ndjson");
  const stubEntry = path.join(stubRoot, "fetch-stub.js");
  const serializedRoutes = JSON.stringify(routes, null, 2);
  const stubSource = `"use strict";
const fs = require("node:fs");

const routes = ${serializedRoutes};
const captureFile = ${JSON.stringify(captureFile)};

function createResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name || "").toLowerCase() === "content-type"
          ? "application/json; charset=utf-8"
          : null;
      },
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

module.exports = async function fetchStub(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const record = {
    url: String(url),
    method,
    body: typeof options.body === "string" ? options.body : "",
  };
  fs.appendFileSync(captureFile, JSON.stringify(record) + "\\n");

  const candidateRoutes = routes.filter((route) => {
    const routeMethod = route.method ? String(route.method).toUpperCase() : "";
    if (routeMethod && routeMethod !== method) return false;
    return String(url).includes(route.match);
  });
  const match =
    candidateRoutes.find((route) => String(url).endsWith(route.match)) ||
    candidateRoutes.find(Boolean);

  if (!match) {
    throw new Error(\`No fetch stub route matched \${method} \${url}\`);
  }

  return createResponse(Number(match.status) || 200, match.body || {});
};
`;

  fs.writeFileSync(stubEntry, stubSource);

  return {
    stubRoot,
    stubEntry,
    captureFile,
    cleanup() {
      fs.rmSync(stubRoot, { recursive: true, force: true });
    },
  };
}

async function createSmtpTestServer() {
  const messages = [];
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 localhost ESMTP shynli-test\r\n");

    let buffer = "";
    let dataMode = false;
    let currentMessage = {
      from: "",
      to: [],
      raw: "",
    };

    function resetMessage() {
      currentMessage = {
        from: "",
        to: [],
        raw: "",
      };
      dataMode = false;
    }

    function handleCommand(line) {
      const upper = line.toUpperCase();

      if (dataMode) {
        if (line === ".") {
          messages.push({
            from: currentMessage.from,
            to: [...currentMessage.to],
            raw: currentMessage.raw,
          });
          resetMessage();
          socket.write("250 2.0.0 queued\r\n");
          return;
        }

        currentMessage.raw += `${line}\r\n`;
        return;
      }

      if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
        socket.write("250-localhost\r\n250 OK\r\n");
        return;
      }

      if (upper.startsWith("MAIL FROM:")) {
        currentMessage.from = line.slice(10).trim();
        socket.write("250 2.1.0 OK\r\n");
        return;
      }

      if (upper.startsWith("RCPT TO:")) {
        currentMessage.to.push(line.slice(8).trim());
        socket.write("250 2.1.5 OK\r\n");
        return;
      }

      if (upper === "DATA") {
        dataMode = true;
        socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        return;
      }

      if (upper === "RSET") {
        resetMessage();
        socket.write("250 2.0.0 OK\r\n");
        return;
      }

      if (upper === "NOOP") {
        socket.write("250 2.0.0 OK\r\n");
        return;
      }

      if (upper === "QUIT") {
        socket.write("221 2.0.0 Bye\r\n");
        socket.end();
        return;
      }

      socket.write("250 OK\r\n");
    }

    socket.on("data", (chunk) => {
      buffer += chunk;

      while (buffer.includes("\r\n")) {
        const boundary = buffer.indexOf("\r\n");
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        handleCommand(line);
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => resolve());
  });

  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;

  return {
    host: HOST,
    port,
    messages,
    async close() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

async function readJsonFile(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

module.exports = {
  PROJECT_ROOT,
  HOST,
  createFetchStub,
  createSmtpTestServer,
  createStripeStub,
  readJsonFile,
  startServer,
  stopServer,
};
