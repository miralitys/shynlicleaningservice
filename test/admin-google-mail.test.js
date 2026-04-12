"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAdminGoogleMailClient,
  createAdminGoogleMailIntegration,
  loadAdminGoogleMailConfig,
} = require("../lib/admin-google-mail");

function createMailStoreStub() {
  let connection = null;
  return {
    async getConnection() {
      return connection ? JSON.parse(JSON.stringify(connection)) : null;
    },
    async setConnection(nextConnection) {
      connection = JSON.parse(JSON.stringify(nextConnection));
      return JSON.parse(JSON.stringify(connection));
    },
    async clearConnection() {
      const previous = connection;
      connection = null;
      return previous ? JSON.parse(JSON.stringify(previous)) : null;
    },
  };
}

test("loads Google Mail config with fallback to calendar OAuth credentials", () => {
  const config = loadAdminGoogleMailConfig(
    {
      GOOGLE_CALENDAR_CLIENT_ID: "calendar-client-id",
      GOOGLE_CALENDAR_CLIENT_SECRET: "calendar-client-secret",
    },
    {
      siteOrigin: "https://shynlicleaningservice.com",
    }
  );

  assert.equal(config.configured, true);
  assert.equal(config.clientId, "calendar-client-id");
  assert.equal(config.clientSecret, "calendar-client-secret");
  assert.equal(config.redirectUri, "https://shynlicleaningservice.com/admin/google-mail/callback");
});

test("connects Google Mail OAuth and sends invite email through Gmail API", async () => {
  const fetchCalls = [];
  const client = createAdminGoogleMailClient({
    env: {
      GOOGLE_MAIL_CLIENT_ID: "gmail-client-id",
      GOOGLE_MAIL_CLIENT_SECRET: "gmail-client-secret",
    },
    siteOrigin: "https://shynlicleaningservice.com",
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });

      if (url === "https://oauth2.googleapis.com/token") {
        const params = new URLSearchParams(options.body);
        if (params.get("grant_type") === "authorization_code") {
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({
                access_token: "access-token-1",
                refresh_token: "refresh-token-1",
                expires_in: 3600,
              });
            },
          };
        }
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              access_token: "access-token-2",
              expires_in: 3600,
            });
          },
        };
      }

      if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              email: "relay@shynli.com",
            });
          },
        };
      }

      if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              id: "gmail-message-1",
            });
          },
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  const mailStore = createMailStoreStub();
  const integration = createAdminGoogleMailIntegration({
    client,
    mailStore,
  });

  const connectUrl = client.buildConnectUrl({
    secret: "admin-secret",
    loginHint: "relay@shynli.com",
  });
  const parsed = new URL(connectUrl);
  const state = parsed.searchParams.get("state");
  assert.ok(state);
  assert.equal(parsed.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/gmail.send");

  const config = { masterSecret: "admin-secret" };
  await integration.handleOAuthCallback({
    code: "oauth-code-1",
    state,
    config,
  });

  const status = await integration.getStatus();
  assert.equal(status.connected, true);
  assert.equal(status.accountEmail, "relay@shynli.com");

  const inviteResult = await integration.sendInviteEmail(
    {
      toEmail: "ramis@example.com",
      staffName: "Ramis Iaparov",
      verifyUrl: "https://shynlicleaningservice.com/account/verify-email?token=abc",
      loginUrl: "https://shynlicleaningservice.com/account/login",
    },
    config,
    {
      fromEmail: "SHYNLI Cleaning <relay@shynli.com>",
      replyToEmail: "info@shynli.com",
    }
  );

  assert.equal(inviteResult.id, "gmail-message-1");
  const sendCall = fetchCalls.find((call) =>
    call.url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
  );
  assert.ok(sendCall);
  const sendBody = JSON.parse(sendCall.options.body);
  const rawMessage = Buffer.from(
    sendBody.raw.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
  assert.match(rawMessage, /To: ramis@example\.com/);
  assert.match(rawMessage, /Reply-To: info@shynli\.com/);
  assert.match(rawMessage, /Subject: Confirm your SHYNLI employee email/);
});

test("keeps Gmail connect available when the mail store status lookup fails", async () => {
  const client = createAdminGoogleMailClient({
    env: {
      GOOGLE_MAIL_CLIENT_ID: "gmail-client-id",
      GOOGLE_MAIL_CLIENT_SECRET: "gmail-client-secret",
    },
    siteOrigin: "https://shynlicleaningservice.com",
    fetch: async () => {
      throw new Error("Unexpected fetch call");
    },
  });
  const integration = createAdminGoogleMailIntegration({
    client,
    mailStore: {
      async getConnection() {
        throw new Error("PGRST205 missing admin_mail_integrations");
      },
    },
  });

  const status = await integration.getStatus();
  assert.equal(status.configured, true);
  assert.equal(status.connected, false);
  assert.equal(status.accountEmail, "");
  assert.match(status.lastError, /PGRST205/i);
});
