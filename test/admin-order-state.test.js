"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getEntryOrderCompletionData,
  getEntryOrderState,
  getPayloadOrderState,
  hasEntryOrderState,
  isAwaitingOrderManagerConfirmation,
} = require("../lib/admin-order-state");

test("only the new website workflow waits for an explicit manager confirmation", () => {
  assert.equal(isAwaitingOrderManagerConfirmation({}), false);
  assert.equal(isAwaitingOrderManagerConfirmation({ payloadForRetry: { adminOrder: { status: "new" } } }), false);
  const entry = { payloadForRetry: { orderState: { managerConfirmationRequired: true } } };
  assert.equal(isAwaitingOrderManagerConfirmation(entry), true);
  entry.payloadForRetry.orderState.managerConfirmedAt = "2026-10-20T20:00:00.000Z";
  assert.equal(isAwaitingOrderManagerConfirmation(entry), false);
});

test("getPayloadOrderState prefers orderState and falls back to adminOrder", () => {
  assert.deepEqual(getPayloadOrderState({ orderState: { status: "scheduled" } }), {
    status: "scheduled",
  });
  assert.deepEqual(getPayloadOrderState({ adminOrder: { status: "completed" } }), {
    status: "completed",
  });
  assert.deepEqual(getPayloadOrderState({}), {});
});

test("entry helpers read payloadForRetry admin order data", () => {
  const entry = {
    payloadForRetry: {
      adminOrder: {
        status: "scheduled",
        completion: {
          cleanerComment: "Done",
          beforePhotos: [{ path: "/tmp/before.jpg" }],
          afterPhotos: [{ path: "/tmp/after.jpg", kind: "after" }],
          updatedAt: "2026-04-18T18:00:00.000Z",
        },
      },
    },
  };

  assert.equal(hasEntryOrderState(entry), true);
  assert.deepEqual(getEntryOrderState(entry), entry.payloadForRetry.adminOrder);
  assert.deepEqual(getEntryOrderCompletionData(entry), {
    cleanerComment: "Done",
    cleanerComments: [
      {
        id: "legacy-cleaner-comment",
        text: "Done",
        authorName: "",
        authorEmail: "",
        authorId: "",
        source: "legacy",
        createdAt: "",
      },
    ],
    checklistItems: [],
    beforePhotos: [
      {
        id: "before.jpg",
        kind: "before",
        path: "/tmp/before.jpg",
        fileName: "before.jpg",
        contentType: "image/jpeg",
        sizeBytes: 0,
        uploadedAt: "",
      },
    ],
    afterPhotos: [
      {
        id: "after.jpg",
        kind: "after",
        path: "/tmp/after.jpg",
        fileName: "after.jpg",
        contentType: "image/jpeg",
        sizeBytes: 0,
        uploadedAt: "",
      },
    ],
    photosSkipped: false,
    photosSkippedAt: "",
    updatedAt: "2026-04-18T18:00:00.000Z",
  });
});
