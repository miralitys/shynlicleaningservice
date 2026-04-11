"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { QuoteTokenError, createQuoteToken, verifyQuoteToken } = require("../lib/quote-token");

test("signs and verifies quote tokens", () => {
  const env = { QUOTE_SIGNING_SECRET: "quote-secret", QUOTE_TOKEN_TTL_SECONDS: "900" };
  const token = createQuoteToken(
    {
      totalPrice: 149,
      totalPriceCents: 14900,
      serviceType: "deep",
    },
    { env, nowSeconds: 100 }
  );

  const payload = verifyQuoteToken(token, { env, nowSeconds: 200 });
  assert.equal(payload.totalPriceCents, 14900);
  assert.equal(payload.serviceType, "deep");
});

test("rejects expired or tampered quote tokens", () => {
  const env = { QUOTE_SIGNING_SECRET: "quote-secret", QUOTE_TOKEN_TTL_SECONDS: "10" };
  const token = createQuoteToken({ totalPriceCents: 14900 }, { env, nowSeconds: 100 });

  assert.throws(
    () => verifyQuoteToken(`${token}tamper`, { env, nowSeconds: 101 }),
    QuoteTokenError
  );
  assert.throws(
    () => verifyQuoteToken(token, { env, nowSeconds: 200 }),
    /expired/i
  );
});
