"use strict";

function normalizeEnglishAddressLabel(value, maxLength = 500) {
  return String(value || "")
    .trim()
    .slice(0, maxLength)
    .replace(/,\s*США\s*$/giu, ", USA")
    .replace(/(^|[^\p{L}\p{N}_])США(?=$|[^\p{L}\p{N}_])/giu, "$1USA")
    .replace(/,\s*Соедин[её]нные Штаты(?: Америки)?\s*$/giu, ", USA")
    .replace(
      /(^|[^\p{L}\p{N}_])Соедин[её]нные Штаты(?: Америки)?(?=$|[^\p{L}\p{N}_])/giu,
      "$1USA"
    )
    .replace(/\s+/g, " ");
}

module.exports = {
  normalizeEnglishAddressLabel,
};
