"use strict";

const ROOMS = { office: "Кабинет", sunroom: "Солнечная комната", familyRoom: "Семейная комната", loft: "Лофт" };
const SERVICES = {
  ovenCleaning: "Духовка внутри", dishwasherCleaning: "Посудомоечная машина внутри",
  refrigeratorCleaning: "Холодильник внутри", baseboardCleaning: "Плинтусы во всём доме",
  doorsCleaning: "Двери", insideCabinets: "Шкафы внутри", rangeHood: "Вытяжка",
  furniturePolishing: "Полировка деревянной мебели", topKitchenCabinets: "Верх кухонных шкафов",
  interiorWindowsCleaning: "Окна внутри без направляющих", interiorWindowsWithTracks: "Окна внутри с направляющими",
  slidingDoorInterior: "Стеклянные двери изнутри с направляющими",
  slidingDoorBothSides: "Стеклянные двери с двух сторон с направляющими",
  chandelierCleaning: "Люстра", blindsCleaning: "Жалюзи", bedLinenChange: "Смена постельного белья / чехлов дивана",
};
const token = value => String(value).toLowerCase().replace(/[\s_\-/]+/g, "");
const SERVICE_NAMES = Object.fromEntries(Object.entries(SERVICES).map(([key, label]) => [token(key), label]));
for (const [alias, key] of Object.entries({
  insideoven: "ovenCleaning", insideovencleaning: "ovenCleaning", oven: "ovenCleaning",
  fridge: "refrigeratorCleaning", insidefridge: "refrigeratorCleaning", insidefridgecleaning: "refrigeratorCleaning",
  fridgecleaning: "refrigeratorCleaning", insiderefrigeratorcleaning: "refrigeratorCleaning",
  baseboards: "baseboardCleaning", doors: "doorsCleaning",
  cabinets: "insideCabinets", insidecabinetscleaning: "insideCabinets", woodfurniturepolishing: "furniturePolishing",
})) SERVICE_NAMES[alias] = SERVICES[key];

const LABELS = {
  ...ROOMS, ...SERVICES, name: "Имя", email: "Email", phone: "Телефон", address: "Адрес",
  propertyType: "Тип жилья", rooms: "Спальни", bedrooms: "Спальни", roomCount: "Спальни",
  bathrooms: "Санузлы", bathroomCount: "Санузлы", squareFootage: "Площадь, кв. футы",
  squareMeters: "Площадь", pets: "Питомцы", hasPets: "Питомцы", basementCleaning: "Уборка подвала",
  notes: "Комментарий", specialInstructions: "Особые указания", sizeDetails: "Параметры жилья",
  additionalRooms: "Дополнительные комнаты", quantityServices: "Количество дополнительных услуг",
  services: "Дополнительные услуги", refrigeratorCondition: "Холодильник внутри", cabinetsCondition: "Шкафы внутри",
  label: "Название", hint: "Уточнение", completed: "Выполнено", text: "Комментарий", comment: "Комментарий",
  authorName: "Автор", authorEmail: "Email автора", createdAt: "Создано", updatedAt: "Обновлено",
  items: "Выплаты", staffName: "Сотрудник", staffId: "ID сотрудника", id: "ID",
  compensationType: "Способ расчёта", compensationValue: "Ставка", appliedCompensationValue: "Применённая ставка",
  teamSize: "Клинеров в команде", orderTotalCents: "Сумма заказа", amountCents: "К выплате",
  status: "Статус", paidAt: "Дата выплаты", paidByName: "Выплату отметил", paidByEmail: "Email сотрудника",
  automaticNotificationsEnabled: "Автосообщения", paymentNotificationsEnabled: "Уведомления об оплате",
};
const ORDER_STATUSES = {
  new: "Новый", scheduled: "Запланировано", enroute: "В пути", inprogress: "В пути",
  cleaningstarted: "Начать уборку", startcleaning: "Начать уборку", checklist: "Чеклист",
  photo: "Фото", photos: "Фото", cleaningcomplete: "Уборка завершена", cleaningcompleted: "Уборка завершена",
  invoicesent: "Инвойс отправлен", paid: "Оплачено", awaitingreview: "Ждём отзыв", waitingreview: "Ждём отзыв",
  completed: "Завершено", canceled: "Отменено", cancelled: "Отменено", rescheduled: "Перенесено", owed: "К выплате",
};
const ENUMS = {
  status: ORDER_STATUSES,
  paymentStatus: { paid: "Оплачено", unpaid: "Не оплачено", partial: "Частично оплачено" },
  paymentMethod: { cash: "Наличные", card: "Карта", check: "Чек", cheque: "Чек", invoice: "Инвойс", zelle: "Zelle", venmo: "Venmo" },
  frequency: { weekly: "Каждую неделю", biweekly: "Каждые 2 недели", every3weeks: "Каждые 3 недели", monthly: "Каждый месяц", onetime: "Разовая уборка" },
  serviceType: { standard: "Стандартная уборка", regular: "Стандартная уборка", deep: "Генеральная уборка",
    movein: "Уборка перед въездом", moveincleaning: "Уборка перед въездом", moveout: "Уборка после выезда",
    moveoutcleaning: "Уборка после выезда", moving: "Уборка при въезде / выезде", moveinout: "Уборка при въезде / выезде",
    estimate: "Бесплатная оценка на дому", freeestimate: "Бесплатная оценка на дому",
    inhomeestimate: "Бесплатная оценка на дому", freeinhomeestimate: "Бесплатная оценка на дому" },
  propertyType: { house: "Дом", home: "Дом", townhouse: "Таунхаус", townhome: "Таунхаус",
    apartment: "Квартира", apt: "Квартира", flat: "Квартира", office: "Офис", airbnb: "Жильё Airbnb" },
  compensationType: { fixed: "Фиксированная сумма", percent: "Процент" },
};
const BOOLEAN_FIELDS = new Set(["initialCleaning", "consent", "basementCleaning", "policyAccepted", "photosSkipped",
  "automaticNotificationsEnabled", "paymentNotificationsEnabled", "completed"]);
const STRUCTURED_FIELDS = new Set(["additionalRooms", "quantityServices", "services", "checklistItems", "cleanerComments",
  "addressBook", "payrollOverrides", "payroll", "assignedStaff", "removedAddressKeys"]);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateTime = new Intl.DateTimeFormat("ru-RU", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" });
const squareFootage = ["700–1 200", "1 201–2 000", "2 001–2 500", "2 501–3 000", "3 001–3 500", "3 501–4 000", "4 001–5 000", "5 001 и более"];
const squareFootageCodes = [950, 1600, 2250, 2750, 3250, 3750, 4500, 5500];

function booleanLabel(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  if ([true, 1, "yes", "true", "1", "on"].includes(normalized)) return "Да";
  if ([false, 0, "no", "false", "0", "off", "none"].includes(normalized)) return "Нет";
  return null;
}

function scalarLabel(field, value) {
  if (value == null || value === "") return "Не указано";
  const key = field.split(".").pop();
  const code = token(value);
  if (typeof value === "boolean" || BOOLEAN_FIELDS.has(key)) return booleanLabel(value) || String(value);
  if (key === "hasPets" || key === "pets") return (code === "cat" ? "Кошка" : code === "dog" ? "Собака" : "") || booleanLabel(value) || String(value);
  if (key === "refrigeratorCondition" || key === "cabinetsCondition") {
    const labels = key === "cabinetsCondition" ? { emptied: "Освобождены", notemptied: "Не освобождены" }
      : { emptied: "Освобождён", notemptied: "Не освобождён" };
    return (Object.hasOwn(labels, code) ? labels[code] : "") || (code === "none" || code === "no" ? "Не заказано" : String(value));
  }
  if (Object.hasOwn(ENUMS, key)) return (Object.hasOwn(ENUMS[key], code) ? ENUMS[key][code] : "") ||
    (["notset", "none"].includes(code) ? "Не указано" : String(value));
  if (["totalPrice", "amountCents", "orderTotalCents"].includes(key) && Number.isFinite(Number(value)))
    return money.format(Number(value) / (key.endsWith("Cents") ? 100 : 1));
  if (key === "serviceDurationMinutes" && Number.isFinite(Number(value))) {
    const minutes = Number(value);
    return [Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} ч` : "", minutes % 60 || !minutes ? `${minutes % 60} мин` : ""].filter(Boolean).join(" ");
  }
  if (key === "squareMeters" && Number.isFinite(Number(value))) {
    const number = Number(value);
    const range = squareFootage[number] || squareFootage[squareFootageCodes.indexOf(number)] || (number === 6500 ? squareFootage[7] : "");
    return `${range || value} кв. футов`;
  }
  if (/At$/.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(String(value)) && Number.isFinite(Date.parse(value)))
    return dateTime.format(new Date(value));
  if ((key === "selectedDate" || key === "recurringSeriesCanceledFromDate") && /^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    return String(value).split("-").reverse().join(".");
  return String(value);
}

function renderAuditValue(field, source, escape) {
  const key = field.split(".").pop();
  let value = source;
  // Some old journal records contain structured values encoded as JSON strings.
  if (STRUCTURED_FIELDS.has(key) && typeof value === "string" && /^[\[{]/.test(value.trim())) {
    try { value = JSON.parse(value); } catch { /* Keep an unreadable legacy value visible rather than losing it. */ }
  }
  const text = item => escape(String(item)).replace(/\r?\n/g, "<br>");
  const list = (items, empty = "Нет записей") => items.length
    ? `<ul class="audit-value-list">${items.map(item => `<li>${item}</li>`).join("")}</ul>` : text(empty);
  const label = name => Object.hasOwn(LABELS, name) ? LABELS[name] : name;
  const service = name => Object.hasOwn(SERVICE_NAMES, token(name)) ? SERVICE_NAMES[token(name)] : String(name);
  if (key === "services" && typeof value === "string" && value.trim()) value = ["none", "notset", "no"].includes(token(value))
    ? [] : value.split(",").map(item => item.trim()).filter(Boolean);
  if (value == null || value === "") return text("Не указано");
  if (key === "recurringSchedule" && typeof value === "object") return text(
    `${scalarLabel("selectedDate", value.date)}, ${value.time}, ${scalarLabel("frequency", value.frequency)}`
  );
  if (key === "services" && Array.isArray(value)) return list(value.map(item => text(service(item))), "Не выбраны");
  if (["additionalRooms", "quantityServices"].includes(key) && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value).filter(([name, count]) => !(Object.hasOwn(ROOMS, name) || Object.hasOwn(SERVICES, name)) || Number(count) !== 0);
    return list(entries.map(([name, count]) => `${text(key === "quantityServices" ? service(name) : label(name))}: ${text(count)}`),
      key === "additionalRooms" ? "Нет дополнительных комнат" : "Не выбраны");
  }
  if (key === "checklistItems" && Array.isArray(value)) return list(value.map(item => {
    if (!item || typeof item !== "object") return text(item);
    const completed = booleanLabel(item.completed);
    const status = completed === "Да" ? "Выполнено" : completed === "Нет" ? "Не выполнено" : "Статус не указан";
    return `<strong>${text(item.label || "Пункт чеклиста")}</strong> — ${status}${item.hint ? `<small>${text(item.hint)}</small>` : ""}`;
  }), "Чеклист пуст");
  if (key === "cleanerComments" && Array.isArray(value)) return list(value.map(item => {
    if (!item || typeof item !== "object") return text(item);
    const author = item.authorName || item.authorEmail || "Автор не указан";
    return `<strong>${text(author)}</strong>: ${text(item.text || item.comment || item.body || "Не указано")}`;
  }));
  if (key === "payrollOverrides" && typeof value === "object" && !Array.isArray(value))
    return list(Object.entries(value).map(([staffId, amount]) => `${text(`Сотрудник (ID: ${staffId})`)}: ${text(Number.isFinite(Number(amount)) ? money.format(Number(amount)) : amount)}`), "Нет фиксированных сумм");
  if (Array.isArray(value)) return list(value.map(item => renderAuditValue(field, item, escape)));
  if (typeof value === "object") return list(Object.entries(value).map(([name, item]) =>
    `<strong>${text(label(name))}:</strong> ${renderAuditValue(name, item, escape)}`));
  return text(scalarLabel(field, value));
}

module.exports = { renderAuditValue };
