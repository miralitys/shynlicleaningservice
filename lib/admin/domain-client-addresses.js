"use strict";

function createAdminClientAddressDomain(deps = {}) {
  const {
    getEntryPayload,
    normalizeString,
  } = deps;

  const ADMIN_CLIENT_PROPERTY_TYPE_ALIASES = Object.freeze({
    house: "house",
    home: "house",
    дом: "house",
    townhouse: "townhouse",
    townhome: "townhouse",
    "town house": "townhouse",
    таунхаус: "townhouse",
    apartment: "apartment",
    apt: "apartment",
    flat: "apartment",
    квартира: "apartment",
    office: "office",
    офис: "office",
    airbnb: "airbnb",
  });

  const ADMIN_CLIENT_PETS_ALIASES = Object.freeze({
    none: "none",
    no: "none",
    нет: "none",
    cat: "cat",
    кошка: "cat",
    dog: "dog",
    собака: "dog",
  });

  function getEntryAdminClientData(entry = {}) {
    const payload = getEntryPayload(entry);
    return payload.adminClient && typeof payload.adminClient === "object" ? payload.adminClient : {};
  }

  function buildAdminClientAddressKey(value) {
    const normalized = normalizeString(value, 500).toLowerCase();
    return normalized || "no-address";
  }

  function normalizeAdminClientPropertyType(value) {
    const normalized = normalizeString(value, 40).toLowerCase();
    if (!normalized) return "";
    if (ADMIN_CLIENT_PROPERTY_TYPE_ALIASES[normalized]) {
      return ADMIN_CLIENT_PROPERTY_TYPE_ALIASES[normalized];
    }
    if (normalized.includes("air")) return "airbnb";
    if (normalized.includes("town") || normalized.includes("таун")) return "townhouse";
    if (normalized.includes("кварт")) return "apartment";
    if (normalized.includes("оф")) return "office";
    if (normalized.includes("дом") || normalized.includes("house") || normalized.includes("home")) return "house";
    return "";
  }

  function normalizeAdminClientPetsValue(value) {
    const normalized = normalizeString(value, 40).toLowerCase();
    if (!normalized) return "";
    if (ADMIN_CLIENT_PETS_ALIASES[normalized]) {
      return ADMIN_CLIENT_PETS_ALIASES[normalized];
    }
    if (normalized.includes("кош")) return "cat";
    if (normalized.includes("cat")) return "cat";
    if (normalized.includes("соб")) return "dog";
    if (normalized.includes("dog")) return "dog";
    if (normalized.includes("нет") || normalized.includes("none") || normalized === "no") return "none";
    return "";
  }

  function splitAdminClientAddressSizeDetails(value) {
    const normalized = normalizeString(value, 250);
    if (!normalized) {
      return {
        squareFootage: "",
        roomCount: "",
      };
    }

    const parts = normalized
      .split(/\s*\/\s*/)
      .map((part) => normalizeString(part, 160))
      .filter(Boolean);
    let squareFootage = "";
    let roomCount = "";

    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      if (!squareFootage && /(sq|ft|м2|m2|метр|кв\.?\s*ф|кв\.?\s*м)/i.test(lowerPart)) {
        squareFootage = part;
        continue;
      }
      if (!roomCount && /(room|rooms|bed|beds|комнат|комнаты|спальн)/i.test(lowerPart)) {
        roomCount = part;
        continue;
      }
      if (!squareFootage) {
        squareFootage = part;
        continue;
      }
      if (!roomCount) {
        roomCount = part;
      }
    }

    return {
      squareFootage,
      roomCount,
    };
  }

  function buildAdminClientAddressSizeDetails(squareFootage, roomCount) {
    const normalizedSquareFootage = normalizeString(squareFootage, 120);
    const normalizedRoomCount = normalizeString(roomCount, 120);
    return [normalizedSquareFootage, normalizedRoomCount].filter(Boolean).join(" / ");
  }

  function normalizeAdminClientAddressRecordInput(value) {
    const source =
      value && typeof value === "object" && !Array.isArray(value)
        ? value
        : { address: value };
    const address = normalizeString(source.address || source.value, 500);
    if (!address) return null;
    const legacySizeDetails = normalizeString(
      source.sizeDetails || source.homeProfile || source.homeSize || source.homeMetrics,
      250
    );
    const legacySizeParts = splitAdminClientAddressSizeDetails(legacySizeDetails);
    const squareFootage = normalizeString(
      source.squareFootage ||
        source.footage ||
        source.size ||
        source.squareMeters ||
        legacySizeParts.squareFootage,
      120
    );
    const roomCount = normalizeString(
      source.roomCount || source.rooms || source.roomLabel || legacySizeParts.roomCount,
      120
    );

    return {
      address,
      propertyType: normalizeAdminClientPropertyType(source.propertyType || source.type || source.objectType),
      squareFootage,
      roomCount,
      sizeDetails: buildAdminClientAddressSizeDetails(squareFootage, roomCount) || legacySizeDetails,
      pets: normalizeAdminClientPetsValue(source.pets || source.petType || source.animals),
      notes: normalizeString(source.notes || source.instructions || source.specialInstructions, 4000),
    };
  }

  function mergeAdminClientAddressRecord(target, source = {}) {
    if (!target || !source) return target;
    if (Object.prototype.hasOwnProperty.call(source, "address")) {
      target.address = normalizeString(source.address, 500);
    }
    if (Object.prototype.hasOwnProperty.call(source, "propertyType")) {
      target.propertyType = normalizeAdminClientPropertyType(source.propertyType);
    }
    if (Object.prototype.hasOwnProperty.call(source, "squareFootage")) {
      target.squareFootage = normalizeString(source.squareFootage, 120);
    }
    if (Object.prototype.hasOwnProperty.call(source, "roomCount")) {
      target.roomCount = normalizeString(source.roomCount, 120);
    }
    if (source.sizeDetails && !target.squareFootage && !target.roomCount) {
      const legacySizeParts = splitAdminClientAddressSizeDetails(source.sizeDetails);
      if (legacySizeParts.squareFootage) target.squareFootage = legacySizeParts.squareFootage;
      if (legacySizeParts.roomCount) target.roomCount = legacySizeParts.roomCount;
    }
    target.sizeDetails = buildAdminClientAddressSizeDetails(target.squareFootage, target.roomCount);
    if (Object.prototype.hasOwnProperty.call(source, "pets")) {
      target.pets = normalizeAdminClientPetsValue(source.pets);
    }
    if (Object.prototype.hasOwnProperty.call(source, "notes")) {
      const sourceNotes = normalizeString(source.notes, 4000);
      if (sourceNotes || !target.notes) {
        target.notes = sourceNotes;
      }
    }
    return target;
  }

  function normalizeAdminClientAddressBookInput(value) {
    const rawValues = [];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          rawValues.push(item);
        } else {
          rawValues.push(...String(item || "").split(/\r?\n+/));
        }
      }
    } else if (value && typeof value === "object") {
      rawValues.push(value);
    } else {
      rawValues.push(...String(value || "").split(/\r?\n+/));
    }

    const itemsByKey = new Map();

    for (const rawValue of rawValues) {
      const addressRecord = normalizeAdminClientAddressRecordInput(rawValue);
      if (!addressRecord) continue;
      const key = buildAdminClientAddressKey(addressRecord.address);
      const existing = itemsByKey.get(key);
      if (existing) {
        mergeAdminClientAddressRecord(existing, addressRecord);
      } else {
        itemsByKey.set(key, addressRecord);
      }
    }

    return Array.from(itemsByKey.values());
  }

  function getEntryAdminClientAddressBook(entry = {}) {
    const adminClient = getEntryAdminClientData(entry);
    return normalizeAdminClientAddressBookInput(adminClient.addressBook);
  }

  function getEntryAdminClientRemovedAddressKeys(entry = {}) {
    const adminClient = getEntryAdminClientData(entry);
    const rawValues = Array.isArray(adminClient.removedAddressKeys) ? adminClient.removedAddressKeys : [];
    const normalizedKeys = [];
    const seen = new Set();

    for (const rawValue of rawValues) {
      const key = buildAdminClientAddressKey(rawValue);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      normalizedKeys.push(key);
    }

    return normalizedKeys;
  }

  function normalizeAdminClientPhoneInput(value) {
    let digits = normalizeString(value, 80).replace(/\D+/g, "");
    if (!digits) return "";
    while (digits.length > 10 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    return digits.slice(0, 10);
  }

  return {
    buildAdminClientAddressKey,
    buildAdminClientAddressSizeDetails,
    getEntryAdminClientAddressBook,
    getEntryAdminClientData,
    getEntryAdminClientRemovedAddressKeys,
    mergeAdminClientAddressRecord,
    normalizeAdminClientAddressBookInput,
    normalizeAdminClientAddressRecordInput,
    normalizeAdminClientPetsValue,
    normalizeAdminClientPhoneInput,
    normalizeAdminClientPropertyType,
  };
}

module.exports = {
  createAdminClientAddressDomain,
};
