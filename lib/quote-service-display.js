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

module.exports = { insideCleaningRequest, withoutServicePrice };
