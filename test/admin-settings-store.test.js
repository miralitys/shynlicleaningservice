"use strict";

const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminSettingsStore } = require("../lib/admin-settings-store");

test("stores checklist templates, completion state, custom items, and template edits", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shynli-settings-store-"));
  const storePath = path.join(tempDir, "admin-settings-store.json");
  const store = createAdminSettingsStore({ filePath: storePath });

  try {
    const initial = await store.getSnapshot();
    assert.equal(initial.templates.length, 3);
    assert.equal(initial.templates[0].serviceType, "regular");

    const regularTemplate = initial.templates.find((template) => template.serviceType === "regular");
    assert.ok(regularTemplate);
    assert.ok(regularTemplate.items.length > 0);

    await store.setCompletedItems("regular", [regularTemplate.items[0].id]);
    await store.addChecklistItem("regular", "Проверить зеркала в прихожей");

    let updated = await store.getSnapshot();
    const updatedRegular = updated.templates.find((template) => template.serviceType === "regular");
    assert.ok(updatedRegular);
    assert.equal(updatedRegular.items.some((item) => item.completed), true);
    assert.equal(
      updatedRegular.items.some((item) => item.label === "Проверить зеркала в прихожей"),
      true
    );

    await store.resetChecklist("regular");
    updated = await store.getSnapshot();
    const resetRegular = updated.templates.find((template) => template.serviceType === "regular");
    assert.ok(resetRegular);
    assert.equal(resetRegular.items.some((item) => item.completed), false);

    await store.saveChecklistTemplate("regular", [
      {
        id: resetRegular.items[0].id,
        label: "Проверить выключатели и зеркала",
      },
      {
        id: "",
        label: "Осмотреть входную дверь",
      },
    ]);

    updated = await store.getSnapshot();
    const editedRegular = updated.templates.find((template) => template.serviceType === "regular");
    assert.ok(editedRegular);
    assert.deepEqual(
      editedRegular.items.map((item) => item.label),
      ["Проверить выключатели и зеркала", "Осмотреть входную дверь"]
    );

    const persisted = JSON.parse(await fsp.readFile(storePath, "utf8"));
    assert.equal(persisted.templates.regular.items.length, 2);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});
