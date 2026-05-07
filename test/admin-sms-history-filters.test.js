"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  filterCustomerSmsHistoryEntries,
} = require("../lib/admin/sms-history-filters");

test("keeps customer SMS history separate from internal admin alerts", () => {
  const owner = {
    id: "entry-1",
    customerPhone: "4244199478",
    contactId: "contact-client-1",
  };
  const entries = [
    {
      message: "Hi client, your booking is confirmed.",
      phone: "+1 (424) 419-9478",
      contactId: "contact-client-1",
      targetType: "quote",
      targetRef: "entry-1",
      source: "automatic",
      direction: "outbound",
    },
    {
      message: "Hi Anastasia, a new Shynli lead was submitted. Admin: https://shynlicleaningservice.com/admin/quote-ops",
      phone: "+1 (424) 419-9478",
      targetType: "admin",
      recipientRole: "admin",
      source: "automatic",
      direction: "outbound",
    },
    {
      message: "Yes, see you then.",
      phone: "+1 (424) 419-9478",
      contactId: "contact-client-1",
      source: "client",
      direction: "inbound",
    },
  ];

  const filteredEntries = filterCustomerSmsHistoryEntries(owner, entries);

  assert.equal(filteredEntries.length, 2);
  assert.deepEqual(
    filteredEntries.map((entry) => entry.message),
    ["Hi client, your booking is confirmed.", "Yes, see you then."]
  );
});
