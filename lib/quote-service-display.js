"use strict";

function selectedServiceTokens(data = {}) {
  return [data.services, data.addOns, data.addons, data.extras, data.selectedServices, data.additionalServices]
    .flatMap(value => Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
    .map(value => typeof value === "object" && value ? value.key || value.id || value.value || value.label || value.name : value)
    .map(value => withoutServicePrice(value).toLowerCase().replace(/[^a-z0-9]/g, ""));
}

function insideCleaningRequest(data, service) {
  const aliases = service === "insideCabinets"
    ? ["insidecabinets", "cabinets", "insidecabinetscleaning"]
    : ["refrigeratorcleaning", "insidefridge", "insidefridgecleaning", "fridge", "fridgecleaning", "refrigerator", "insiderefrigeratorcleaning"];
  if (!selectedServiceTokens(data).some(token => aliases.includes(token))) return "Не заказано";
  const condition = service === "insideCabinets" ? data.cabinetsCondition : data.refrigeratorCondition;
  if (condition === "notEmptied") return "Убрать внутри; вещи/продукты не убраны";
  if (condition === "emptied") return "Убрать внутри; освобождены";
  return "Убрать внутри; состояние не указано";
}

function withoutServicePrice(label) {
  return String(label || "").replace(/\s*\([^)]*\$[^)]*\)/g, "").replace(/\$\s*\d+(?:[.,]\d+)?/g, "").trim();
}

function buildAddonSummary(data = {}, selectedLabels = [], quantityLabels = {}) {
  const translations = {
    "Inside Cabinets Cleaning": "Шкафы внутри", "Inside Refrigerator Cleaning": "Холодильник внутри",
    "Oven Cleaning": "Духовка внутри", "Dishwasher Cleaning": "Посудомоечная машина",
    "Baseboard Cleaning": "Плинтусы", "Doors Cleaning": "Двери", "Range Hood": "Вытяжка",
    "Wood Furniture Polishing": "Полировка деревянной мебели", "Basement Cleaning": "Подвал",
    "Blinds Cleaning": "Жалюзи", "Bed Linen / Sofa Cover Change": "Смена постельного белья / чехла дивана",
    "Chandelier safely reachable": "Люстра в безопасной доступности",
  };
  const items = selectedLabels.map(label => {
    const clean = withoutServicePrice(label);
    return translations[clean] || clean;
  }).filter(Boolean);
  for (const [key, label] of Object.entries(quantityLabels)) {
    const quantity = Number((data.quantityServices || {})[key] ?? data[key]);
    if (!Number.isFinite(quantity) || Math.round(quantity) <= 0) continue;
    const clean = withoutServicePrice(label);
    items.push(`${translations[clean] || clean} — ${Math.round(quantity)}`);
  }
  if (["yes", "true", "1", "on"].includes(String(data.basementCleaning || "").toLowerCase())) items.push("Подвал");
  return [...new Set(items)];
}

module.exports = { insideCleaningRequest, withoutServicePrice, buildAddonSummary };
