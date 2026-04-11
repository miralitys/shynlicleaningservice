"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildInviteEmailCopy,
  loadAccountInviteEmailConfig,
  sendAccountInviteEmail,
} = require("../lib/account-invite-email");

test("loads resend invite-email config from env", () => {
  const config = loadAccountInviteEmailConfig({
    RESEND_API_KEY: "re_test_123",
    ACCOUNT_INVITE_EMAIL_FROM: "hello@shynli.com",
    ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynli.com",
  });

  assert.equal(config.configured, true);
  assert.equal(config.provider, "resend");
  assert.equal(config.fromEmail, "hello@shynli.com");
  assert.equal(config.replyToEmail, "info@shynli.com");
});

test("builds invite email copy with verify and login links", () => {
  const copy = buildInviteEmailCopy({
    staffName: "Anna Petrova",
    verifyUrl: "https://example.com/account/verify-email?token=abc",
    loginUrl: "https://example.com/account/login",
  });

  assert.match(copy.text, /Anna Petrova/);
  assert.match(copy.text, /verify-email\?token=abc/);
  assert.match(copy.html, /Confirm email/);
  assert.match(copy.html, /https:\/\/example\.com\/account\/login/);
});

test("sends invite email through resend", async () => {
  const calls = [];
  const response = await sendAccountInviteEmail({
    env: {
      RESEND_API_KEY: "re_test_123",
      ACCOUNT_INVITE_EMAIL_FROM: "hello@shynli.com",
      ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynli.com",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "email_123" }),
      };
    },
    toEmail: "cleaner@example.com",
    staffName: "Anna Petrova",
    verifyUrl: "https://example.com/account/verify-email?token=abc",
    loginUrl: "https://example.com/account/login",
  });

  assert.equal(response.id, "email_123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].options.method, "POST");

  const payload = JSON.parse(calls[0].options.body);
  assert.deepEqual(payload.to, ["cleaner@example.com"]);
  assert.equal(payload.from, "hello@shynli.com");
  assert.equal(payload.reply_to, "info@shynli.com");
  assert.equal(payload.subject, "Confirm your SHYNLI employee email");
  assert.match(payload.text, /verify-email\?token=abc/);
});
