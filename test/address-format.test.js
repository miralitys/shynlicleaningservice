"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeEnglishAddressLabel } = require("../lib/address-format");

test("normalizes localized US country suffixes in address labels", () => {
  assert.equal(
    normalizeEnglishAddressLabel("1289 Rhodes Ln, Naperville, IL 60540, США"),
    "1289 Rhodes Ln, Naperville, IL 60540, USA"
  );
  assert.equal(
    normalizeEnglishAddressLabel("1289 Rhodes Ln, Naperville, IL 60540, Соединенные Штаты"),
    "1289 Rhodes Ln, Naperville, IL 60540, USA"
  );
  assert.equal(normalizeEnglishAddressLabel("США"), "USA");
});
