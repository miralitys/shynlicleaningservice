"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildInviteEmailCopy,
  buildW9ReminderEmailCopy,
  loadAccountInviteEmailConfig,
  sendAccountInviteEmail,
  sendStaffW9ReminderEmail,
} = require("../lib/account-invite-email");

test("loads SMTP invite-email config from env", () => {
  const config = loadAccountInviteEmailConfig({
    ACCOUNT_INVITE_SMTP_HOST: "smtp-relay.gmail.com",
    ACCOUNT_INVITE_SMTP_PORT: "587",
    ACCOUNT_INVITE_SMTP_USER: "relay@shynlicleaningservice.com",
    ACCOUNT_INVITE_SMTP_PASSWORD: "secret",
    ACCOUNT_INVITE_EMAIL_FROM: "hello@shynlicleaningservice.com",
    ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynlicleaningservice.com",
  });

  assert.equal(config.configured, true);
  assert.equal(config.provider, "smtp");
  assert.equal(config.fromEmail, "hello@shynlicleaningservice.com");
  assert.equal(config.replyToEmail, "info@shynlicleaningservice.com");
  assert.equal(config.smtpHost, "smtp-relay.gmail.com");
  assert.equal(config.smtpPort, 587);
  assert.equal(config.smtpName, "shynlicleaningservice.com");
  assert.equal(config.smtpRequireTls, true);
  assert.deepEqual(
    { user: config.smtpUser, pass: config.smtpPassword },
    { user: "relay@shynlicleaningservice.com", pass: "secret" }
  );
});

test("derives SMTP EHLO name from the public site origin when it is not explicitly configured", () => {
  const config = loadAccountInviteEmailConfig({
    ACCOUNT_INVITE_SMTP_HOST: "smtp-relay.gmail.com",
    ACCOUNT_INVITE_SMTP_PORT: "587",
    ACCOUNT_INVITE_SMTP_USER: "relay@shynli.com",
    ACCOUNT_INVITE_SMTP_PASSWORD: "secret",
    ACCOUNT_INVITE_EMAIL_FROM: "SHYNLI Cleaning <relay@shynli.com>",
    PUBLIC_SITE_ORIGIN: "https://shynlicleaningservice.com",
  });

  assert.equal(config.smtpName, "shynlicleaningservice.com");
});

test("falls back to legacy resend invite-email config when SMTP is not set", () => {
  const config = loadAccountInviteEmailConfig({
    RESEND_API_KEY: "re_test_123",
    ACCOUNT_INVITE_EMAIL_FROM: "hello@shynli.com",
    ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynli.com",
  });

  assert.equal(config.configured, true);
  assert.equal(config.provider, "resend");
  assert.equal(config.fromEmail, "hello@shynli.com");
});

test("builds invite email copy with verify and login links", () => {
  const copy = buildInviteEmailCopy({
    staffName: "Anna Petrova",
    verifyUrl: "https://example.com/account/verify-email?token=abc",
    loginUrl: "https://example.com/account/login",
  });

  assert.match(copy.text, /Anna Petrova/);
  assert.match(copy.text, /verify-email\?token=abc/);
  assert.match(copy.text, /set your password/i);
  assert.doesNotMatch(copy.text, /temporary password/i);
  assert.match(copy.html, /Confirm email/);
  assert.match(copy.html, /https:\/\/example\.com\/account\/login/);
});

test("builds W-9 reminder copy with optional account setup step", () => {
  const copy = buildW9ReminderEmailCopy({
    staffName: "Anna Petrova",
    verifyUrl: "https://example.com/account/verify-email?token=abc",
    loginUrl: "https://example.com/account/login",
    requiresAccountSetup: true,
  });

  assert.match(copy.text, /complete your SHYNLI W-9/i);
  assert.match(copy.text, /verify-email\?token=abc/);
  assert.match(copy.text, /account\/login/);
  assert.match(copy.html, /Complete your W-9/);
  assert.match(copy.html, /Open W-9 form/);
  assert.doesNotMatch(copy.html, /Open employee account/);
});

test("sends invite email through SMTP relay", async () => {
  const calls = [];
  const response = await sendAccountInviteEmail({
    env: {
      ACCOUNT_INVITE_SMTP_HOST: "smtp-relay.gmail.com",
      ACCOUNT_INVITE_SMTP_PORT: "587",
      ACCOUNT_INVITE_SMTP_USER: "relay@shynlicleaningservice.com",
      ACCOUNT_INVITE_SMTP_PASSWORD: "secret",
      ACCOUNT_INVITE_EMAIL_FROM: "hello@shynlicleaningservice.com",
      ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynlicleaningservice.com",
    },
    createTransport: (transportConfig) => ({
      async sendMail(message) {
        calls.push({ transportConfig, message });
        return { messageId: "<smtp-message-123@example.com>" };
      },
      close() {},
    }),
    toEmail: "cleaner@example.com",
    staffName: "Anna Petrova",
    verifyUrl: "https://example.com/account/verify-email?token=abc",
    loginUrl: "https://example.com/account/login",
  });

  assert.equal(response.id, "<smtp-message-123@example.com>");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].transportConfig.host, "smtp-relay.gmail.com");
  assert.equal(calls[0].transportConfig.port, 587);
  assert.equal(calls[0].transportConfig.requireTLS, true);
  assert.equal(calls[0].transportConfig.name, "shynlicleaningservice.com");
  assert.deepEqual(calls[0].transportConfig.auth, {
    user: "relay@shynlicleaningservice.com",
    pass: "secret",
  });
  assert.equal(calls[0].message.to, "cleaner@example.com");
  assert.equal(calls[0].message.from, "hello@shynlicleaningservice.com");
  assert.equal(calls[0].message.replyTo, "info@shynlicleaningservice.com");
  assert.equal(calls[0].message.subject, "Confirm your SHYNLI employee email");
  assert.match(calls[0].message.text, /verify-email\?token=abc/);
});

test("falls back to smtp.gmail.com when Google relay drops the EHLO handshake", async () => {
  const calls = [];
  const response = await sendAccountInviteEmail({
    env: {
      ACCOUNT_INVITE_SMTP_HOST: "smtp-relay.gmail.com",
      ACCOUNT_INVITE_SMTP_PORT: "587",
      ACCOUNT_INVITE_SMTP_USER: "relay@shynlicleaningservice.com",
      ACCOUNT_INVITE_SMTP_PASSWORD: "secret",
      ACCOUNT_INVITE_EMAIL_FROM: "hello@shynlicleaningservice.com",
      ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynlicleaningservice.com",
      PUBLIC_SITE_ORIGIN: "https://shynlicleaningservice.com",
    },
    createTransport: (transportConfig) => ({
      async sendMail(message) {
        calls.push({ transportConfig, message });
        if (transportConfig.host === "smtp-relay.gmail.com") {
          throw new Error(
            "Server terminates connection. response=421-4.7.0 Try again later, closing connection. (EHLO)"
          );
        }
        return { messageId: "<smtp-message-fallback@example.com>" };
      },
      close() {},
    }),
    toEmail: "cleaner@example.com",
    staffName: "Anna Petrova",
    verifyUrl: "https://example.com/account/verify-email?token=abc",
    loginUrl: "https://example.com/account/login",
  });

  assert.equal(response.id, "<smtp-message-fallback@example.com>");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].transportConfig.host, "smtp-relay.gmail.com");
  assert.equal(calls[1].transportConfig.host, "smtp.gmail.com");
});

test("sends W-9 reminder email through SMTP relay", async () => {
  const calls = [];
  const response = await sendStaffW9ReminderEmail({
    env: {
      ACCOUNT_INVITE_SMTP_HOST: "smtp-relay.gmail.com",
      ACCOUNT_INVITE_SMTP_PORT: "587",
      ACCOUNT_INVITE_SMTP_USER: "relay@shynlicleaningservice.com",
      ACCOUNT_INVITE_SMTP_PASSWORD: "secret",
      ACCOUNT_INVITE_EMAIL_FROM: "hello@shynlicleaningservice.com",
      ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynlicleaningservice.com",
    },
    createTransport: (transportConfig) => ({
      async sendMail(message) {
        calls.push({ transportConfig, message });
        return { messageId: "<smtp-message-w9@example.com>" };
      },
      close() {},
    }),
    toEmail: "cleaner@example.com",
    staffName: "Anna Petrova",
    verifyUrl: "https://example.com/account/verify-email?token=abc",
    loginUrl: "https://example.com/account/login",
    requiresAccountSetup: true,
  });

  assert.equal(response.id, "<smtp-message-w9@example.com>");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message.subject, "Complete your SHYNLI W-9");
  assert.match(calls[0].message.text, /complete your SHYNLI W-9/i);
  assert.match(calls[0].message.text, /verify-email\?token=abc/);
  assert.match(calls[0].message.text, /account\/login/);
});
