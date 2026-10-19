"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { renderAuditValue } = require("../lib/admin/pages/audit-value-formatters");
const { renderAuditPage } = require("../lib/admin/pages/audit-page");
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const render = (field, value) => renderAuditValue(field, value, escape);

test("audit translates domain values without changing free-text comments, names, or addresses", () => {
  for (const [field, input, expected] of [
    ["quote.basementCleaning", "no", "Нет"], ["quote.initialCleaning", "yes", "Да"],
    ["policyAccepted", false, "Нет"], ["client.paymentNotificationsEnabled", "false", "Нет"],
    ["quote.cabinetsCondition", "emptied", "Освобождены"], ["quote.cabinetsCondition", "notEmptied", "Не освобождены"],
    ["quote.refrigeratorCondition", "emptied", "Освобождён"], ["quote.refrigeratorCondition", "notEmptied", "Не освобождён"],
    ["quote.hasPets", "none", "Нет"], ["quote.hasPets", "cat", "Кошка"], ["quote.propertyType", "office", "Офис"],
    ["frequency", "bi-weekly", "Каждые 2 недели"], ["frequency", "every3weeks", "Каждые 3 недели"],
    ["serviceType", "move-in/out", "Уборка при въезде / выезде"], ["serviceType", "deep", "Генеральная уборка"],
    ["status", "cleaning-complete", "Уборка завершена"], ["paymentStatus", "unpaid", "Не оплачено"],
    ["paymentMethod", "cash", "Наличные"], ["paymentMethod", "Not set", "Не указано"],
    ["quote.additionalDetails", "no", "no"], ["customerName", "Deep", "Deep"],
    ["fullAddress", "1 Office St", "1 Office St"], ["quote.additionalDetails", '{"no":true}', '{&quot;no&quot;:true}'],
    ["totalPrice", 0, "$0.00"], ["totalPrice", 534, "$534.00"], ["quote.bathrooms", 2.5, "2.5"],
    ["quote.rooms", 0, "0"], ["quote.rooms", null, "Не указано"],
    ["serviceDurationMinutes", 150, "2 ч 30 мин"], ["serviceDurationMinutes", 120, "2 ч"],
    ["quote.squareMeters", "3", "2 501–3 000 кв. футов"], ["quote.squareMeters", 2750, "2 501–3 000 кв. футов"],
    ["selectedDate", "2026-10-19", "19.10.2026"], ["policyAcceptedAt", "2026-10-19T05:49:00Z", "19.10.2026, 00:49"],
  ]) assert.equal(render(field, input), expected, `${field}: ${input}`);
});

test("rooms and add-ons show readable lists, quantities and empty selections instead of JSON", () => {
  const rooms = render("quote.additionalRooms", { office: 1, sunroom: 0, familyRoom: 2, loft: 0 });
  assert.match(rooms, /Кабинет: 1/);
  assert.match(rooms, /Семейная комната: 2/);
  assert.doesNotMatch(rooms, /office|familyRoom|sunroom|[{}]/);
  assert.equal(render("quote.additionalRooms", { office: 0, loft: "0" }), "Нет дополнительных комнат");
  const quantities = render("quote.quantityServices", { interiorWindowsWithTracks: 3, blindsCleaning: 2, bedLinenChange: 0 });
  assert.match(quantities, /Окна внутри с направляющими: 3/);
  assert.match(quantities, /Жалюзи: 2/);
  assert.doesNotMatch(quantities, /bedLinenChange|interiorWindows|[{}]/);
  assert.equal(render("quote.quantityServices", {}), "Не выбраны");
  const services = render("quote.services", ["ovenCleaning", "rangeHood", "insideCabinets", "inside-fridge"]);
  assert.match(services, /Духовка внутри/);
  assert.match(services, /Вытяжка/);
  assert.match(services, /Шкафы внутри/);
  assert.match(services, /Холодильник внутри/);
  assert.equal(render("quote.services", []), "Не выбраны");
  assert.match(render("quote.services", "baseboards,doorsCleaning"), /Плинтусы во всём доме/);
  assert.match(render("quote.quantityServices", '{"blindsCleaning":2}'), /Жалюзи: 2/);
});

test("checklists show task labels and completion, not IDs, timestamps and sort metadata", () => {
  const input = [{ id: "regular-default-1", label: "Пылесосить полы", hint: "Все комнаты", completed: true,
    sortOrder: 0, updatedAt: "2026-08-04T16:23:56Z" },
  { id: "regular-default-2", label: "Вымыть ванную", completed: false, sortOrder: 1 }];
  const before = structuredClone(input);
  const html = render("completion.checklistItems", input);
  assert.match(html, /Пылесосить полы<\/strong> — Выполнено/);
  assert.match(html, /Вымыть ванную<\/strong> — Не выполнено/);
  assert.match(html, /Все комнаты/);
  assert.doesNotMatch(html, /regular-default|sortOrder|updatedAt|2026-08|[{}]/);
  assert.deepEqual(input, before);
  assert.equal(render("completion.checklistItems", []), "Чеклист пуст");
});

test("structured address, payroll and comments remain readable and all untrusted values are escaped", () => {
  assert.match(render("client.addressBook", [{ address: "1 Main St", roomCount: 2, bathroomCount: 1.5, pets: "dog", notes: "no" }]), /Санузлы:<\/strong> 1.5/);
  assert.match(render("client.addressBook", [{ pets: "dog" }]), /Собака/);
  assert.match(render("payroll", { items: [{ staffName: "Test Cleaner", compensationType: "fixed", amountCents: 14000 }] }), /\$140.00/);
  assert.match(render("completion.cleanerComments", [{ text: "Готово", authorName: "Клинер" }]), /Клинер<\/strong>: Готово/);
  const html = render("completion.checklistItems", [{ label: '<img src=x onerror="alert(1)">', hint: "<script>test</script>", completed: true }]);
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img/);
  assert.match(render("quote.services", ["<script>unknown</script>"]), /&lt;script/);
  assert.match(render("quote.quantityServices", { futureService: 4 }), /futureService: 4/);
  assert.match(render("quote.services", ["constructor"]), /constructor/);
  assert.equal(render("quote.quantityServices", "{broken"), "{broken");
});

test("both old and new audit columns use readable values in normal pages and appended fragments", async () => {
  const changes = [
    { field: "quote.basementCleaning", old: "yes", new: "no" },
    { field: "quote.cabinetsCondition", old: "emptied", new: "notEmptied" },
    { field: "quote.quantityServices", old: { blindsCleaning: 1 }, new: { interiorWindowsWithTracks: 3 } },
    { field: "completion.checklistItems", old: [{ label: "Вымыть пол", completed: false }], new: [{ label: "Вымыть пол", completed: true }] },
  ];
  const original = structuredClone(changes);
  for (const query of ["", "?fragment=entries&offset=50"]) {
    const html = await renderAuditPage({ list: async () => [{ id: "readable", occurred_at: "2026-10-19T05:49:00Z", actor: {},
      action: "update", entity_type: "order", entity_label: "Test", entity_id: "test", changes }] },
    new URL(`https://example.com/admin/audit${query}`),
    { renderAdminLayout: (title, content) => content, renderAdminAppSidebar: () => "" }, escape, { role: "admin" });
    assert.match(html, /<td>Да<\/td><td>Нет<\/td>/);
    assert.match(html, /Освобождены<\/td><td>Не освобождены/);
    assert.match(html, /Жалюзи: 1/);
    assert.match(html, /Окна внутри с направляющими: 3/);
    assert.match(html, /Не выполнено/);
    assert.doesNotMatch(html, /blindsCleaning|interiorWindowsWithTracks|notEmptied|&quot;completed&quot;/);
  }
  assert.deepEqual(changes, original);
});
