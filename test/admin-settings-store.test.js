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
    assert.equal(regularTemplate.items.length, 12);
    assert.equal(regularTemplate.items[0].label, "Пылесосить полы");
    assert.equal(regularTemplate.items[0].hint, "Все комнаты");

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
        hint: "Прихожая и санузлы",
      },
      {
        id: "",
        label: "Осмотреть входную дверь",
        hint: "Ручка, наличник, стекло",
      },
    ]);

    updated = await store.getSnapshot();
    const editedRegular = updated.templates.find((template) => template.serviceType === "regular");
    assert.ok(editedRegular);
    assert.deepEqual(
      editedRegular.items.map((item) => ({ label: item.label, hint: item.hint })),
      [
        { label: "Проверить выключатели и зеркала", hint: "Прихожая и санузлы" },
        { label: "Осмотреть входную дверь", hint: "Ручка, наличник, стекло" },
      ]
    );

    const persisted = JSON.parse(await fsp.readFile(storePath, "utf8"));
    assert.equal(persisted.version, 2);
    assert.equal(persisted.templates.regular.items.length, 2);
    assert.equal(persisted.templates.regular.items[0].hint, "Прихожая и санузлы");
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});

test("replaces legacy checklist templates with Cleaning app defaults", async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "shynli-settings-migrate-"));
  const storePath = path.join(tempDir, "admin-settings-store.json");
  await fsp.writeFile(
    storePath,
    JSON.stringify(
      {
        version: 1,
        templates: {
          regular: {
            serviceType: "regular",
            title: "Регулярная уборка",
            description: "Старый шаблон",
            items: [
              {
                id: "legacy-1",
                label: "Старый пункт",
                completed: true,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                sortOrder: 0,
              },
            ],
          },
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const store = createAdminSettingsStore({ filePath: storePath });

  try {
    const snapshot = await store.getSnapshot();
    const regularTemplate = snapshot.templates.find((template) => template.serviceType === "regular");
    const deepTemplate = snapshot.templates.find((template) => template.serviceType === "deep");
    const movingTemplate = snapshot.templates.find((template) => template.serviceType === "moving");

    assert.ok(regularTemplate);
    assert.ok(deepTemplate);
    assert.ok(movingTemplate);
    assert.equal(regularTemplate.items.length, 12);
    assert.equal(deepTemplate.items.length, 22);
    assert.equal(movingTemplate.items.length, 32);
    assert.equal(regularTemplate.items[0].label, "Пылесосить полы");
    assert.equal(regularTemplate.items[0].hint, "Все комнаты");
    assert.notEqual(regularTemplate.items[0].label, "Старый пункт");
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});
