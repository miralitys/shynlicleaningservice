"use strict";

const HOLIDAY_LABELS = {
  "New Year's Day": ["Новый год", true],
  "Martin Luther King Jr. Day": ["День Мартина Лютера Кинга", false],
  "Washington's Birthday": ["День президентов", false],
  "Valentine's Day": ["День святого Валентина", true],
  "St. Patrick's Day": ["День святого Патрика", false],
  "Easter Sunday": ["Пасха", true],
  "Mother's Day": ["День матери", true],
  "Memorial Day": ["День памяти", true],
  "Juneteenth": ["Juneteenth", false],
  "Father's Day": ["День отца", true],
  "Independence Day": ["День независимости", true],
  "Labour Day": ["День труда", true],
  "Columbus Day": ["День Колумба", false],
  "Halloween": ["Хэллоуин", true],
  "Veterans Day": ["День ветеранов", false],
  "Thanksgiving Day": ["День благодарения", true],
  "Day after Thanksgiving Day": ["Black Friday", true],
  "Christmas Eve": ["Канун Рождества", false],
  "Christmas Day": ["Рождество", true],
  "New Year's Eve": ["Канун Нового года", false],
};
const yearCache = new Map();
let holidayCalendar;

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getAdminYearHolidays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2199) return Object.freeze([]);
  if (yearCache.has(year)) return yearCache.get(year);
  if (!holidayCalendar) {
    const Holidays = require("date-holidays");
    holidayCalendar = new Holidays("US", { languages: "en", timezone: "America/Chicago" });
  }
  const seen = new Set();
  const holidays = holidayCalendar.getHolidays(year).flatMap(holiday => {
    const baseName = holiday.name.replace(/ \(substitute day\)$/, "");
    const definition = HOLIDAY_LABELS[baseName];
    if (!definition) return [];
    const date = holiday.date.slice(0, 10);
    const observed = Boolean(holiday.substitute);
    const id = `${baseName}/${date}/${observed ? "observed" : "actual"}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [Object.freeze({ id, date, name: baseName, label: definition[0], observed,
      preholiday: definition[1] && !observed, type: holiday.type })];
  });
  const result = Object.freeze(holidays);
  if (yearCache.size >= 8) yearCache.delete(yearCache.keys().next().value);
  yearCache.set(year, result);
  return result;
}

function buildAdminCalendarHolidayMap(days) {
  const dates = new Set((Array.isArray(days) ? days : []).map(day => typeof day === "string" ? day : day && day.dateValue)
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value));
  const years = new Set([...dates].flatMap(date => [Number(date.slice(0, 4)), Number(shiftDate(date, 7).slice(0, 4))]));
  const result = new Map([...dates].map(date => [date, { holidays: [], upcoming: [] }]));
  for (const year of years) {
    for (const holiday of getAdminYearHolidays(year)) {
      if (result.has(holiday.date)) result.get(holiday.date).holidays.push(holiday);
      if (!holiday.preholiday) continue;
      for (let offset = 1; offset <= 7; offset++) {
        const date = shiftDate(holiday.date, -offset);
        if (result.has(date)) result.get(date).upcoming.push(holiday);
      }
    }
  }
  return result;
}

module.exports = { getAdminYearHolidays, buildAdminCalendarHolidayMap };
