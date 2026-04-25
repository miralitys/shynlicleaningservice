"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { generateTotpCode, loadAdminConfig } = require("../lib/admin-auth");
const { createFetchStub, createSmtpTestServer, startServer, stopServer } = require("./server-test-helpers");

function getSetCookies(response) {
  const header = response.headers.get("set-cookie") || "";
  return header
    .split(/,(?=[A-Za-z0-9_]+=)/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getCookieValue(setCookies, name) {
  const target = setCookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!target) return "";
  return target.split(";")[0].slice(name.length + 1);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getOrderFunnelLaneSlice(html, laneStatus, nextLaneStatus = "") {
  const source = String(html || "");
  const laneMarker = `admin-order-funnel-column-${laneStatus}`;
  const startIndex = source.indexOf(laneMarker);
  if (startIndex === -1) return "";
  const endIndex = nextLaneStatus ? source.indexOf(`admin-order-funnel-column-${nextLaneStatus}`, startIndex) : -1;
  return source.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function normalizeEmailSource(value) {
  return String(value || "").replace(/=\r?\n/g, "");
}

function decodeQuotedPrintable(value) {
  return normalizeEmailSource(value).replace(/=([A-F0-9]{2})/gi, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );
}

async function createAdminSession(baseUrl, config) {
  const loginResponse = await fetch(`${baseUrl}/admin/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      email: config.email,
      password: "1HKLOR1!",
    }),
  });

  assert.equal(loginResponse.status, 303);
  const loginCookies = getSetCookies(loginResponse);
  if ((loginResponse.headers.get("location") || "") === "/admin/2fa") {
    const challengeCookieValue = getCookieValue(loginCookies, "shynli_admin_challenge");
    assert.ok(challengeCookieValue);

    const twoFactorResponse = await fetch(`${baseUrl}/admin/2fa`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_challenge=${challengeCookieValue}`,
      },
      body: new URLSearchParams({
        code: generateTotpCode(config),
      }),
    });

    assert.equal(twoFactorResponse.status, 303);
    assert.equal(twoFactorResponse.headers.get("location"), "/admin");
    const twoFactorCookies = getSetCookies(twoFactorResponse);
    const sessionCookie = twoFactorCookies.find((cookie) => cookie.startsWith("shynli_admin_session=")) || "";
    assert.match(sessionCookie, /Path=\//);
    const sessionCookieValue = getCookieValue(twoFactorCookies, "shynli_admin_session");
    assert.ok(sessionCookieValue);
    return sessionCookieValue;
  }

  assert.equal(loginResponse.headers.get("location"), "/admin");
  const sessionCookie = loginCookies.find((cookie) => cookie.startsWith("shynli_admin_session=")) || "";
  assert.match(sessionCookie, /Path=\//);
  const sessionCookieValue = getCookieValue(loginCookies, "shynli_admin_session");
  assert.ok(sessionCookieValue);
  return sessionCookieValue;
}

async function submitQuote(baseUrl, options) {
  return fetch(`${baseUrl}/api/quote/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": options.requestId,
    },
    body: JSON.stringify({
      contact: {
        fullName: options.fullName,
        phone: options.phone,
        email: options.email,
      },
      quote: {
        serviceType: options.serviceType || "deep",
        rooms: options.rooms || 4,
        bathrooms: options.bathrooms || 2,
        squareMeters: options.squareMeters || 1600,
        frequency: options.frequency || "",
        selectedDate: options.selectedDate || "2026-03-22",
        selectedTime: options.selectedTime || "09:00",
        fullAddress: options.fullAddress,
        consent: true,
      },
    }),
  });
}

async function createOrderFromQuoteRequest(baseUrl, sessionCookieValue, query) {
  const entryId = await getQuoteOpsEntryId(baseUrl, sessionCookieValue, query);

  const createOrderResponse = await fetch(`${baseUrl}/admin/quote-ops`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: `shynli_admin_session=${sessionCookieValue}`,
    },
    body: new URLSearchParams({
      action: "create-order-from-request",
      entryId,
      returnTo: "/admin/quote-ops",
    }),
  });

  assert.equal(createOrderResponse.status, 303);
  assert.match(createOrderResponse.headers.get("location") || "", /notice=order-created/);

  return entryId;
}

async function getQuoteOpsEntryId(baseUrl, sessionCookieValue, query) {
  const quoteOpsResponse = await fetch(`${baseUrl}/admin/quote-ops?q=${encodeURIComponent(query)}`, {
    headers: {
      cookie: `shynli_admin_session=${sessionCookieValue}`,
    },
  });
  const quoteOpsBody = await quoteOpsResponse.text();
  assert.equal(quoteOpsResponse.status, 200);

  const entryIdMatch = quoteOpsBody.match(/name="entryId" value="([^"]+)"/);
  assert.ok(entryIdMatch, `Expected quote ops entry for ${query}`);
  return entryIdMatch[1];
}

test("sends a policy acceptance email on scheduled transition and stores the signed certificate", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-policy-acceptance-"));
  const usersStorePath = path.join(tempDir, "admin-users-store.json");
  const staffStorePath = path.join(tempDir, "admin-staff-store.json");
  const smtpServer = await createSmtpTestServer();
  const fetchStub = await createFetchStub([
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "policy-contact-1",
        },
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 201,
      body: {
        conversationId: "policy-conversation-1",
        messageId: "policy-message-1",
      },
    },
  ]);
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    ACCOUNT_INVITE_EMAIL_FROM: "hello@shynli.com",
    ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynli.com",
    ACCOUNT_INVITE_SMTP_HOST: smtpServer.host,
    ACCOUNT_INVITE_SMTP_PORT: String(smtpServer.port),
    ACCOUNT_INVITE_SMTP_REQUIRE_TLS: "0",
    ADMIN_USERS_STORE_PATH: usersStorePath,
    ADMIN_STAFF_STORE_PATH: staffStorePath,
    POLICY_ACCEPTANCE_DOCUMENTS_DIR: path.join(tempDir, "policy-documents"),
    ORDER_POLICY_TOKEN_SECRET: "policy_secret_test",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const quoteResponse = await submitQuote(started.baseUrl, {
      requestId: "policy-order-1",
      fullName: "Policy Customer",
      phone: "312-555-3311",
      email: "policy.customer@example.com",
      serviceType: "deep",
      selectedDate: "2026-04-18",
      selectedTime: "10:30",
      fullAddress: "742 Cedar Avenue, Aurora, IL 60506",
    });
    assert.equal(quoteResponse.status, 201);

    const sessionCookieValue = await createAdminSession(started.baseUrl, config);
    const entryId = await createOrderFromQuoteRequest(
      started.baseUrl,
      sessionCookieValue,
      "policy-order-1"
    );
    const ordersResponse = await fetch(
      `${started.baseUrl}/admin/orders?q=${encodeURIComponent("Policy Customer")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const ordersBody = await ordersResponse.text();
    assert.equal(ordersResponse.status, 200);
    assert.match(ordersBody, new RegExp(`name="entryId" value="${escapeRegex(entryId)}"`));

    const saveOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: `/admin/orders?q=${encodeURIComponent("Policy Customer")}`,
        orderStatus: "policy",
        assignedStaff: "Anna Petrova",
        paymentStatus: "unpaid",
        paymentMethod: "invoice",
        selectedDate: "2026-04-18",
        selectedTime: "10:30",
        frequency: "",
      }),
    });
    assert.equal(saveOrderResponse.status, 303);
    assert.match(
      saveOrderResponse.headers.get("location") || "",
      /notice=order-saved-policy-email-sent/
    );

    const ordersAwaitingPolicyResponse = await fetch(
      `${started.baseUrl}/admin/orders?q=${encodeURIComponent("Policy Customer")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const ordersAwaitingPolicyBody = await ordersAwaitingPolicyResponse.text();
    assert.equal(ordersAwaitingPolicyResponse.status, 200);
    const policyLaneBeforeAcceptance = getOrderFunnelLaneSlice(
      ordersAwaitingPolicyBody,
      "policy",
      "scheduled"
    );
    const scheduledLaneBeforeAcceptance = getOrderFunnelLaneSlice(
      ordersAwaitingPolicyBody,
      "scheduled",
      "en-route"
    );
    assert.match(policyLaneBeforeAcceptance, /Policy Customer/);
    assert.match(policyLaneBeforeAcceptance, /Политика/);
    assert.match(policyLaneBeforeAcceptance, /data-order-dropzone="policy"/);
    assert.doesNotMatch(scheduledLaneBeforeAcceptance, /Policy Customer/);

    const deliveredEmails = smtpServer.messages.map((message) =>
      decodeQuotedPrintable(message.raw)
    );
    const policyEmails = deliveredEmails.filter((rawEmail) =>
      /Subject: Action Required: Please Review and Accept Before Your Cleaning\s+Appointment/.test(
        rawEmail
      )
    );
    assert.equal(policyEmails.length, 1);
    const rawEmail = policyEmails[0];
    assert.match(
      rawEmail,
      /Subject: Action Required: Please Review and Accept Before Your Cleaning\s+Appointment/
    );
    assert.match(rawEmail, /Terms of Service: https:\/\/shynlicleaningservice\.com\/terms-of-service/);
    assert.match(
      rawEmail,
      /Payment & Cancellation Policy: https:\/\/shynlicleaningservice\.com\/cancellation-policy/
    );
    const confirmationUrlMatch = rawEmail.match(
      /https?:\/\/[^\s]+\/booking\/confirm\?token=[^\s"<]+/
    );
    assert.ok(confirmationUrlMatch);
    const confirmationToken = new URL(confirmationUrlMatch[0]).searchParams.get("token");
    assert.ok(confirmationToken);

    const captureLines = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsRequests = captureLines.filter((record) =>
      String(record.url).includes("/conversations/messages")
    );
    const policySmsRequests = smsRequests.filter((record) => {
      try {
        return /please review and accept our service policies here:/i.test(
          JSON.parse(record.body).message || ""
        );
      } catch {
        return false;
      }
    });
    assert.equal(policySmsRequests.length, 1);
    const smsPayload = JSON.parse(policySmsRequests[0].body);
    assert.equal(smsPayload.type, "SMS");
    assert.equal(smsPayload.contactId, "policy-contact-1");
    assert.equal(smsPayload.toNumber, "+13125553311");
    assert.match(
      smsPayload.message,
      /Hi Policy, this is Shynli Cleaning Service\. To confirm your booking, please review and accept our service policies here:/
    );
    assert.match(
      smsPayload.message,
      new RegExp(escapeRegex(confirmationUrlMatch[0]))
    );

    const pendingAcceptanceResponse = await fetch(
      `${started.baseUrl}/api/admin/policy-acceptance/${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const pendingAcceptanceBody = await pendingAcceptanceResponse.json();
    assert.equal(pendingAcceptanceResponse.status, 200);
    assert.equal(pendingAcceptanceBody.policyAccepted, false);
    assert.ok(pendingAcceptanceBody.sentAt);
    assert.ok(pendingAcceptanceBody.expiresAt);
    const initialSentAtMs = Date.parse(pendingAcceptanceBody.sentAt);
    const initialExpiresAtMs = Date.parse(pendingAcceptanceBody.expiresAt);
    assert.ok(Number.isFinite(initialSentAtMs));
    assert.ok(Number.isFinite(initialExpiresAtMs));
    assert.ok(initialExpiresAtMs - initialSentAtMs >= 47 * 60 * 60 * 1000);
    assert.ok(initialExpiresAtMs - initialSentAtMs <= 49 * 60 * 60 * 1000);

    const resendResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "resend-order-policy",
        entryId,
        returnTo: `/admin/orders?order=${encodeURIComponent(entryId)}`,
      }),
    });
    assert.equal(resendResponse.status, 303);
    assert.match(
      resendResponse.headers.get("location") || "",
      /notice=order-policy-resent/
    );

    const deliveredEmailsAfterResend = smtpServer.messages.map((message) =>
      decodeQuotedPrintable(message.raw)
    );
    const policyEmailsAfterResend = deliveredEmailsAfterResend.filter((rawEmail) =>
      /Subject: Action Required: Please Review and Accept Before Your Cleaning\s+Appointment/.test(
        rawEmail
      )
    );
    assert.equal(policyEmailsAfterResend.length, 2);
    const resentEmail = policyEmailsAfterResend[1];
    const resentConfirmationUrlMatch = resentEmail.match(
      /https?:\/\/[^\s]+\/booking\/confirm\?token=[^\s"<]+/
    );
    assert.ok(resentConfirmationUrlMatch);
    const resentConfirmationToken = new URL(resentConfirmationUrlMatch[0]).searchParams.get("token");
    assert.ok(resentConfirmationToken);
    assert.notEqual(resentConfirmationToken, confirmationToken);

    const captureLinesAfterResend = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsRequestsAfterResend = captureLinesAfterResend.filter((record) =>
      String(record.url).includes("/conversations/messages")
    );
    const policySmsRequestsAfterResend = smsRequestsAfterResend.filter((record) => {
      try {
        return /please review and accept our service policies here:/i.test(
          JSON.parse(record.body).message || ""
        );
      } catch {
        return false;
      }
    });
    assert.equal(policySmsRequestsAfterResend.length, 2);

    const refreshedAcceptanceResponse = await fetch(
      `${started.baseUrl}/api/admin/policy-acceptance/${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const refreshedAcceptanceBody = await refreshedAcceptanceResponse.json();
    assert.equal(refreshedAcceptanceResponse.status, 200);
    assert.ok(Date.parse(refreshedAcceptanceBody.expiresAt) > initialExpiresAtMs);

    const pendingOrderDialogResponse = await fetch(
      `${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const pendingOrderDialogBody = await pendingOrderDialogResponse.text();
    assert.equal(pendingOrderDialogResponse.status, 200);
    assert.match(pendingOrderDialogBody, /Политика не подписана/);
    assert.match(pendingOrderDialogBody, /Отправить ещё раз/);

    const invalidTokenResponse = await fetch(
      `${started.baseUrl}/api/policy-acceptance/not-a-real-token`
    );
    const invalidTokenBody = await invalidTokenResponse.json();
    assert.equal(invalidTokenResponse.status, 404);
    assert.equal(invalidTokenBody.code, "POLICY_TOKEN_INVALID");

    const confirmationPageResponse = await fetch(
      `${started.baseUrl}/booking/confirm?token=${encodeURIComponent(resentConfirmationToken)}`
    );
    const confirmationPageBody = await confirmationPageResponse.text();
    assert.equal(confirmationPageResponse.status, 200);
    assert.match(confirmationPageBody, /Policy Acceptance/);
    assert.match(confirmationPageBody, /Confirm and Sign/);
    assert.match(confirmationPageBody, /Terms of Service/);
    assert.match(confirmationPageBody, /Payment and Cancellation Policy/);
    assert.doesNotMatch(confirmationPageBody, /id="confirm-button"[^>]*disabled/);
    assert.match(
      confirmationPageBody,
      new RegExp(
        `<form class="form-stack" id="policy-acceptance-form" method="post" action="/booking/confirm\\?token=${escapeRegex(
          encodeURIComponent(resentConfirmationToken)
        )}">`
      )
    );
    assert.match(confirmationPageBody, /window\.requestAnimationFrame\(updateButtonState\)/);
    assert.match(confirmationPageBody, /window\.setTimeout\(updateButtonState, 300\)/);

    const uncheckedResponse = await fetch(
      `${started.baseUrl}/api/policy-acceptance/${encodeURIComponent(resentConfirmationToken)}/submit`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          acceptedTerms: false,
          acceptedPaymentCancellation: false,
          typedSignature: "Policy Customer",
        }),
      }
    );
    const uncheckedBody = await uncheckedResponse.json();
    assert.equal(uncheckedResponse.status, 422);
    assert.equal(uncheckedBody.code, "POLICY_CHECKBOX_REQUIRED");

    const missingSignatureResponse = await fetch(
      `${started.baseUrl}/api/policy-acceptance/${encodeURIComponent(resentConfirmationToken)}/submit`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          acceptedTerms: true,
          acceptedPaymentCancellation: true,
          typedSignature: "",
        }),
      }
    );
    const missingSignatureBody = await missingSignatureResponse.json();
    assert.equal(missingSignatureResponse.status, 422);
    assert.equal(missingSignatureBody.code, "POLICY_SIGNATURE_REQUIRED");

    const submitResponse = await fetch(
      `${started.baseUrl}/api/policy-acceptance/${encodeURIComponent(resentConfirmationToken)}/submit`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          acceptedTerms: true,
          acceptedPaymentCancellation: true,
          typedSignature: "Policy Customer",
        }),
      }
    );
    const submitBody = await submitResponse.json();
    assert.equal(submitResponse.status, 200);
    assert.equal(submitBody.ok, true);
    assert.equal(submitBody.acceptance.policyAccepted, true);
    assert.ok(submitBody.acceptance.signedAt);
    assert.ok(submitBody.certificateUrl);
    assert.equal(
      submitBody.redirectUrl,
      `/booking/confirm?token=${encodeURIComponent(resentConfirmationToken)}&confirmed=1`
    );

    const acceptedPageResponse = await fetch(`${started.baseUrl}${submitBody.redirectUrl}`);
    const acceptedPageBody = await acceptedPageResponse.text();
    assert.equal(acceptedPageResponse.status, 200);
    assert.match(acceptedPageBody, /Thank you, everything is signed\./);
    assert.match(acceptedPageBody, /Booking confirmed/);
    assert.match(acceptedPageBody, /Open certificate PDF/);
    assert.ok(
      acceptedPageBody.indexOf("Thank you, everything is signed.") <
        acceptedPageBody.indexOf("Booking Summary")
    );
    assert.doesNotMatch(acceptedPageBody, /Review and Sign/);
    assert.doesNotMatch(acceptedPageBody, /Confirm and Sign/);

    const revisitAcceptedPageResponse = await fetch(
      `${started.baseUrl}/booking/confirm?token=${encodeURIComponent(resentConfirmationToken)}`
    );
    const revisitAcceptedPageBody = await revisitAcceptedPageResponse.text();
    assert.equal(revisitAcceptedPageResponse.status, 200);
    assert.match(revisitAcceptedPageBody, /Your documents are already signed\./);
    assert.match(revisitAcceptedPageBody, /No further action is required from you\./);
    assert.match(revisitAcceptedPageBody, /Open certificate PDF/);
    assert.ok(
      revisitAcceptedPageBody.indexOf("Your documents are already signed.") <
        revisitAcceptedPageBody.indexOf("Booking Summary")
    );
    assert.doesNotMatch(revisitAcceptedPageBody, /Review and Sign/);
    assert.doesNotMatch(revisitAcceptedPageBody, /Confirm and Sign/);

    const certificateResponse = await fetch(`${started.baseUrl}${submitBody.certificateUrl}`);
    const certificateBuffer = Buffer.from(await certificateResponse.arrayBuffer());
    assert.equal(certificateResponse.status, 200);
    assert.match(certificateResponse.headers.get("content-type") || "", /application\/pdf/);
    assert.equal(certificateResponse.headers.get("cache-control"), "no-store, max-age=0");
    assert.ok(certificateBuffer.length > 500);
    assert.equal(certificateBuffer.subarray(0, 4).toString("utf8"), "%PDF");

    const duplicateSubmitResponse = await fetch(
      `${started.baseUrl}/api/policy-acceptance/${encodeURIComponent(resentConfirmationToken)}/submit`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          acceptedTerms: true,
          acceptedPaymentCancellation: true,
          typedSignature: "Policy Customer",
        }),
      }
    );
    const duplicateSubmitBody = await duplicateSubmitResponse.json();
    assert.equal(duplicateSubmitResponse.status, 409);
    assert.equal(duplicateSubmitBody.code, "POLICY_ALREADY_ACCEPTED");

    const adminAcceptanceResponse = await fetch(
      `${started.baseUrl}/api/admin/policy-acceptance/${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const adminAcceptanceBody = await adminAcceptanceResponse.json();
    assert.equal(adminAcceptanceResponse.status, 200);
    assert.equal(adminAcceptanceBody.bookingId, entryId);
    assert.equal(adminAcceptanceBody.policyAccepted, true);
    assert.equal(adminAcceptanceBody.typedSignature, "Policy Customer");
    assert.ok(adminAcceptanceBody.auditTrailJson);
    assert.ok(adminAcceptanceBody.auditTrailJson.documents);
    assert.ok(adminAcceptanceBody.certificateFile);
    assert.match(
      adminAcceptanceBody.certificateFile.downloadUrl || "",
      new RegExp(`/api/admin/policy-acceptance/${escapeRegex(entryId)}/certificate$`)
    );

    const createManagerResponse = await fetch(`${started.baseUrl}/admin/settings`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create_user",
        name: "Policy Manager",
        role: "manager",
        status: "active",
        staffStatus: "active",
        email: "policy.manager@example.com",
        phone: "3125557744",
        address: "500 Executive Dr, Naperville, IL 60563",
        notes: "Can review signed policy certificates",
        password: "",
      }),
    });
    assert.equal(createManagerResponse.status, 303);
    assert.match(createManagerResponse.headers.get("location") || "", /notice=user-created-email-sent/);
    const deliveredEmailsAfterManagerCreate = smtpServer.messages.map((message) =>
      decodeQuotedPrintable(message.raw)
    );
    const managerInviteEmails = deliveredEmailsAfterManagerCreate.filter((rawEmail) =>
      /Subject: Confirm your SHYNLI employee email/.test(rawEmail)
    );
    assert.equal(managerInviteEmails.length, 1);

    const managerInviteEmail = managerInviteEmails[0];
    const managerVerifyUrlMatch = managerInviteEmail.match(
      /https?:\/\/[^\s]+\/account\/verify-email\?token=[^\s=]+/
    );
    assert.ok(managerVerifyUrlMatch);
    const managerVerificationToken = new URL(managerVerifyUrlMatch[0]).searchParams.get("token");
    assert.ok(managerVerificationToken);

    const managerVerifyResponse = await fetch(
      `${started.baseUrl}/account/verify-email?token=${encodeURIComponent(managerVerificationToken)}`,
      {
        redirect: "manual",
      }
    );
    assert.equal(managerVerifyResponse.status, 303);
    assert.equal(
      managerVerifyResponse.headers.get("location"),
      "/account/login?notice=email-verified-password-setup&email=policy.manager%40example.com"
    );
    const managerPasswordSetupCookieValue = getCookieValue(
      getSetCookies(managerVerifyResponse),
      "shynli_user_password_setup"
    );
    assert.ok(managerPasswordSetupCookieValue);

    const managerSetupPasswordResponse = await fetch(`${started.baseUrl}/account/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_user_password_setup=${managerPasswordSetupCookieValue}`,
      },
      body: new URLSearchParams({
        action: "setup-first-password",
        email: "policy.manager@example.com",
        newPassword: "ManagerPass123!",
        confirmPassword: "ManagerPass123!",
      }),
    });
    assert.equal(managerSetupPasswordResponse.status, 303);
    assert.equal(managerSetupPasswordResponse.headers.get("location"), "/account");
    const managerSessionCookieValue = getCookieValue(
      getSetCookies(managerSetupPasswordResponse),
      "shynli_user_session"
    );
    assert.ok(managerSessionCookieValue);

    const certificateAbsolutePath = path.join(
      tempDir,
      "policy-documents",
      adminAcceptanceBody.certificateFile.relativePath
    );
    await fs.rm(certificateAbsolutePath, { force: true });

    const regeneratedAdminCertificateResponse = await fetch(
      `${started.baseUrl}${adminAcceptanceBody.certificateFile.downloadUrl}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const regeneratedAdminCertificateBuffer = Buffer.from(
      await regeneratedAdminCertificateResponse.arrayBuffer()
    );
    assert.equal(regeneratedAdminCertificateResponse.status, 200);
    assert.match(
      regeneratedAdminCertificateResponse.headers.get("content-type") || "",
      /application\/pdf/
    );
    assert.equal(
      regeneratedAdminCertificateResponse.headers.get("cache-control"),
      "no-store, max-age=0"
    );
    assert.ok(regeneratedAdminCertificateBuffer.length > 500);
    assert.equal(regeneratedAdminCertificateBuffer.subarray(0, 4).toString("utf8"), "%PDF");

    const managerAcceptanceResponse = await fetch(
      `${started.baseUrl}/api/admin/policy-acceptance/${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_user_session=${managerSessionCookieValue}`,
        },
      }
    );
    const managerAcceptanceBody = await managerAcceptanceResponse.json();
    assert.equal(managerAcceptanceResponse.status, 200);
    assert.equal(managerAcceptanceBody.bookingId, entryId);
    assert.equal(managerAcceptanceBody.policyAccepted, true);
    assert.match(
      managerAcceptanceBody.certificateFile.downloadUrl || "",
      new RegExp(`/api/admin/policy-acceptance/${escapeRegex(entryId)}/certificate$`)
    );

    const managerCertificateResponse = await fetch(
      `${started.baseUrl}${managerAcceptanceBody.certificateFile.downloadUrl}`,
      {
        headers: {
          cookie: `shynli_user_session=${managerSessionCookieValue}`,
        },
      }
    );
    const managerCertificateBuffer = Buffer.from(await managerCertificateResponse.arrayBuffer());
    assert.equal(managerCertificateResponse.status, 200);
    assert.match(managerCertificateResponse.headers.get("content-type") || "", /application\/pdf/);
    assert.equal(managerCertificateResponse.headers.get("cache-control"), "no-store, max-age=0");
    assert.ok(managerCertificateBuffer.length > 500);
    assert.equal(managerCertificateBuffer.subarray(0, 4).toString("utf8"), "%PDF");

    const updatedOrdersResponse = await fetch(
      `${started.baseUrl}/admin/orders?q=${encodeURIComponent("Policy Customer")}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const updatedOrdersBody = await updatedOrdersResponse.text();
    assert.equal(updatedOrdersResponse.status, 200);
    assert.match(updatedOrdersBody, /Подтверждение политик/);
    assert.match(updatedOrdersBody, /Открыть сертификат PDF/);
    assert.match(updatedOrdersBody, /Подписано/);
    const policyLaneAfterAcceptance = getOrderFunnelLaneSlice(
      updatedOrdersBody,
      "policy",
      "scheduled"
    );
    const scheduledLaneAfterAcceptance = getOrderFunnelLaneSlice(
      updatedOrdersBody,
      "scheduled",
      "en-route"
    );
    assert.doesNotMatch(policyLaneAfterAcceptance, /Policy Customer/);
    assert.match(scheduledLaneAfterAcceptance, /Policy Customer/);

    const orderDialogResponse = await fetch(
      `${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const orderDialogBody = await orderDialogResponse.text();
    assert.equal(orderDialogResponse.status, 200);
    assert.match(orderDialogBody, /История SMS/);
    assert.match(orderDialogBody, /Автоматически/);
    assert.match(orderDialogBody, /Сбросить подтверждение/);
    assert.match(orderDialogBody, /To confirm your booking, please review and accept our service policies here:/);

    const managerOrderDialogResponse = await fetch(
      `${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_user_session=${managerSessionCookieValue}`,
        },
      }
    );
    const managerOrderDialogBody = await managerOrderDialogResponse.text();
    assert.equal(managerOrderDialogResponse.status, 200);
    assert.match(managerOrderDialogBody, /Открыть сертификат PDF/);

    const resetPolicyResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "reset-order-policy",
        entryId,
        returnTo: `/admin/orders?order=${encodeURIComponent(entryId)}`,
      }),
    });
    assert.equal(resetPolicyResponse.status, 303);
    assert.match(
      resetPolicyResponse.headers.get("location") || "",
      /notice=order-policy-reset/
    );

    const resetAcceptanceResponse = await fetch(
      `${started.baseUrl}/api/admin/policy-acceptance/${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const resetAcceptanceBody = await resetAcceptanceResponse.json();
    assert.equal(resetAcceptanceResponse.status, 404);
    assert.equal(resetAcceptanceBody.error, "Policy acceptance not found for this booking.");

    const resetDialogResponse = await fetch(
      `${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}&notice=order-policy-reset`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const resetDialogBody = await resetDialogResponse.text();
    assert.equal(resetDialogResponse.status, 200);
    assert.match(resetDialogBody, /Подтверждение политик сброшено/);
    assert.match(resetDialogBody, /Письмо ещё не отправлялось/);
    assert.match(resetDialogBody, /Отправить ссылку/);
    assert.doesNotMatch(resetDialogBody, /Открыть сертификат PDF/);
  } finally {
    await stopServer(started.child);
    await smtpServer.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("sends policy acceptance by SMS only when the order has no email", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shynli-policy-sms-only-"));
  const fetchStub = await createFetchStub([
    {
      method: "GET",
      match: "/contacts/",
      status: 200,
      body: {
        contacts: [],
      },
    },
    {
      method: "POST",
      match: "/contacts/",
      status: 200,
      body: {
        contact: {
          id: "policy-sms-only-contact-1",
        },
      },
    },
    {
      method: "POST",
      match: "/conversations/messages",
      status: 201,
      body: {
        conversationId: "policy-sms-only-conversation-1",
        messageId: "policy-sms-only-message-1",
      },
    },
  ]);
  const smtpServer = await createSmtpTestServer();
  const env = {
    ADMIN_MASTER_SECRET: "admin_secret_test",
    GHL_API_KEY: "ghl_test_key",
    GHL_LOCATION_ID: "location-123",
    GHL_ENABLE_NOTES: "0",
    GHL_CREATE_OPPORTUNITY: "0",
    SHYNLI_FETCH_STUB_ENTRY: fetchStub.stubEntry,
    ACCOUNT_INVITE_EMAIL_FROM: "hello@shynli.com",
    ACCOUNT_INVITE_EMAIL_REPLY_TO: "info@shynli.com",
    ACCOUNT_INVITE_SMTP_HOST: smtpServer.host,
    ACCOUNT_INVITE_SMTP_PORT: String(smtpServer.port),
    ACCOUNT_INVITE_SMTP_REQUIRE_TLS: "0",
    POLICY_ACCEPTANCE_DOCUMENTS_DIR: path.join(tempDir, "policy-documents"),
    ORDER_POLICY_TOKEN_SECRET: "policy_secret_test",
  };
  const started = await startServer({ env });
  const config = loadAdminConfig(env);

  try {
    const sessionCookieValue = await createAdminSession(started.baseUrl, config);

    const createOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "create-manual-order",
        returnTo: "/admin/orders",
        customerName: "SMS Only Customer",
        customerPhone: "3125554422",
        customerEmail: "",
        serviceType: "deep",
        selectedDate: "",
        selectedTime: "",
        frequency: "",
        totalPrice: "240.00",
        fullAddress: "215 North Elm Street, Naperville, IL 60563",
      }),
    });

    assert.equal(createOrderResponse.status, 303);
    const createRedirectLocation = createOrderResponse.headers.get("location") || "";
    assert.match(createRedirectLocation, /notice=manual-order-created/);
    const entryId = new URL(createRedirectLocation, started.baseUrl).searchParams.get("order");
    assert.ok(entryId);

    const saveOrderResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        entryId,
        returnTo: `/admin/orders?order=${encodeURIComponent(entryId)}`,
        orderStatus: "scheduled",
        assignedStaff: "Anna Petrova",
        paymentStatus: "unpaid",
        paymentMethod: "invoice",
        selectedDate: "2026-05-11",
        selectedTime: "09:00",
        frequency: "",
      }),
    });
    assert.equal(saveOrderResponse.status, 303);
    assert.match(
      saveOrderResponse.headers.get("location") || "",
      /notice=order-saved-policy-sms-sent/
    );

    assert.equal(smtpServer.messages.length, 0);

    const captureLines = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsRequests = captureLines.filter((record) =>
      String(record.url).includes("/conversations/messages")
    );
    assert.equal(smsRequests.length, 1);
    const firstSmsPayload = JSON.parse(smsRequests[0].body);
    assert.equal(firstSmsPayload.type, "SMS");
    assert.equal(firstSmsPayload.contactId, "policy-sms-only-contact-1");
    assert.equal(firstSmsPayload.toNumber, "+13125554422");
    assert.match(
      firstSmsPayload.message,
      /Hi SMS, this is Shynli Cleaning Service\. To confirm your booking, please review and accept our service policies here:/
    );

    const pendingAcceptanceResponse = await fetch(
      `${started.baseUrl}/api/admin/policy-acceptance/${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const pendingAcceptanceBody = await pendingAcceptanceResponse.json();
    assert.equal(pendingAcceptanceResponse.status, 200);
    assert.equal(pendingAcceptanceBody.policyAccepted, false);
    assert.ok(pendingAcceptanceBody.sentAt);
    assert.ok(!pendingAcceptanceBody.lastError);

    const orderDialogResponse = await fetch(
      `${started.baseUrl}/admin/orders?order=${encodeURIComponent(entryId)}`,
      {
        headers: {
          cookie: `shynli_admin_session=${sessionCookieValue}`,
        },
      }
    );
    const orderDialogBody = await orderDialogResponse.text();
    assert.equal(orderDialogResponse.status, 200);
    assert.match(orderDialogBody, /Подтверждение политик/);
    assert.match(orderDialogBody, /Политика не подписана/);
    assert.doesNotMatch(orderDialogBody, /Recipient email is missing/);
    assert.doesNotMatch(orderDialogBody, /Ошибка отправки/);

    const resendResponse = await fetch(`${started.baseUrl}/admin/orders`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `shynli_admin_session=${sessionCookieValue}`,
      },
      body: new URLSearchParams({
        action: "resend-order-policy",
        entryId,
        returnTo: `/admin/orders?order=${encodeURIComponent(entryId)}`,
      }),
    });
    assert.equal(resendResponse.status, 303);
    assert.match(
      resendResponse.headers.get("location") || "",
      /notice=order-policy-resent-sms-only/
    );

    assert.equal(smtpServer.messages.length, 0);

    const captureLinesAfterResend = (await fs.readFile(fetchStub.captureFile, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const smsRequestsAfterResend = captureLinesAfterResend.filter((record) =>
      String(record.url).includes("/conversations/messages")
    );
    assert.equal(smsRequestsAfterResend.length, 2);
  } finally {
    await stopServer(started.child);
    await smtpServer.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
