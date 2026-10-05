"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../lib/admin/render-shared-dialog-toggle-script.js"), "utf8");
const start = source.indexOf('          const completionStatus =');
const end = source.indexOf('          if (form.getAttribute("data-admin-save-confirm")', start);
const checkCompletion = new Function("form", "event", "window", source.slice(start, end));

for (const payment of ["unpaid", "partial", "paid"]) {
  for (const approved of [false, true]) {
    test(`completion with ${payment}, confirmation ${approved}`, () => {
      let prompts = 0;
      let prevented = false;
      const form = {
        getAttribute: (name) => name === "data-admin-completion-status" ? "scheduled" : payment,
        elements: { namedItem: (name) => name === "orderStatus" ? { value: "completed" } : null },
      };
      checkCompletion(form, {
        preventDefault() { prevented = true; },
        stopImmediatePropagation() {},
      }, {
        confirm(message) {
          prompts += 1;
          assert.equal(message, "Оплата не проставлена. Точно завершить?");
          return approved;
        },
      });
      assert.equal(prompts, payment === "paid" ? 0 : 1);
      assert.equal(prevented, payment !== "paid" && !approved);
    });
  }
}

test("saving an already completed order does not ask again", () => {
  checkCompletion({
    getAttribute: () => "completed",
    elements: { namedItem: () => ({ value: "completed" }) },
  }, {}, { confirm() { assert.fail("Unexpected confirmation"); } });
});
