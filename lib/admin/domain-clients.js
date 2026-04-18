"use strict";

function createAdminClientDomain(deps = {}) {
  const {
    getEntryAdminSmsData,
    getEntryCalculatorData,
    getEntryPayload,
    getEntrySmsHistory,
    getRequestUrl,
    normalizeAdminSmsHistoryEntries,
    normalizeString,
  } = deps;

  const ADMIN_CLIENT_PROPERTY_TYPE_ALIASES = Object.freeze({
    house: "house",
    home: "house",
    дом: "house",
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
      notes: normalizeString(source.notes || source.instructions || source.specialInstructions, 800),
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
      target.notes = normalizeString(source.notes, 800);
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

  function applyClientEntryUpdates(entry, updates = {}) {
    if (!entry || typeof entry !== "object") return null;

    const payload = {
      ...getEntryPayload(entry),
    };
    const calculatorData = {
      ...getEntryCalculatorData(entry),
    };
    const contactData =
      payload.contactData && typeof payload.contactData === "object" ? { ...payload.contactData } : {};
    const legacyContact =
      payload.contact && typeof payload.contact === "object" ? { ...payload.contact } : null;
    const adminClient = {
      ...getEntryAdminClientData(entry),
    };
    const timestamp = new Date().toISOString();
    const hasName = Object.prototype.hasOwnProperty.call(updates, "name");
    const hasPhone = Object.prototype.hasOwnProperty.call(updates, "phone");
    const hasEmail = Object.prototype.hasOwnProperty.call(updates, "email");
    const hasContactId = Object.prototype.hasOwnProperty.call(updates, "contactId");
    const hasSmsHistory = Object.prototype.hasOwnProperty.call(updates, "smsHistory");

    const customerName = hasName ? normalizeString(updates.name, 250) : normalizeString(entry.customerName, 250);
    const customerPhone = hasPhone
      ? normalizeAdminClientPhoneInput(updates.phone)
      : normalizeAdminClientPhoneInput(entry.customerPhone);
    const customerEmail = hasEmail
      ? normalizeString(updates.email, 250).toLowerCase()
      : normalizeString(entry.customerEmail, 250).toLowerCase();
    const addressBook = normalizeAdminClientAddressBookInput(
      updates.addressBook || updates.addresses || updates.address || adminClient.addressBook || []
    );
    const nextAddressKeys = new Set(addressBook.map((item) => buildAdminClientAddressKey(item.address)));
    const removedAddressKeys = new Set([
      ...getEntryAdminClientRemovedAddressKeys(entry),
      ...(Array.isArray(updates.removedAddressKeys)
        ? updates.removedAddressKeys.map((item) => buildAdminClientAddressKey(item))
        : []),
    ]);

    entry.customerName = customerName;
    entry.customerPhone = customerPhone;
    entry.customerEmail = customerEmail;
    entry.updatedAt = timestamp;
    if (hasContactId) {
      entry.contactId = normalizeString(updates.contactId, 120);
    }

    if (customerName) {
      contactData.fullName = customerName;
    } else if (hasName) {
      delete contactData.fullName;
    }

    if (customerPhone) {
      contactData.phone = customerPhone;
    } else if (hasPhone) {
      delete contactData.phone;
    }

    if (customerEmail) {
      contactData.email = customerEmail;
    } else if (hasEmail) {
      delete contactData.email;
    }

    if (Object.keys(contactData).length > 0) {
      payload.contactData = contactData;
    } else {
      delete payload.contactData;
    }

    if (legacyContact) {
      if (customerName) {
        legacyContact.fullName = customerName;
      } else if (hasName) {
        delete legacyContact.fullName;
      }
      if (customerPhone) {
        legacyContact.phone = customerPhone;
      } else if (hasPhone) {
        delete legacyContact.phone;
      }
      if (customerEmail) {
        legacyContact.email = customerEmail;
      } else if (hasEmail) {
        delete legacyContact.email;
      }
      payload.contact = legacyContact;
    }

    for (const key of nextAddressKeys) {
      removedAddressKeys.delete(key);
    }

    if (addressBook.length > 0) {
      adminClient.addressBook = addressBook;
    } else {
      delete adminClient.addressBook;
    }

    if (removedAddressKeys.size > 0) {
      adminClient.removedAddressKeys = Array.from(removedAddressKeys);
    } else {
      delete adminClient.removedAddressKeys;
    }

    if (
      (Array.isArray(adminClient.addressBook) && adminClient.addressBook.length > 0) ||
      (Array.isArray(adminClient.removedAddressKeys) && adminClient.removedAddressKeys.length > 0)
    ) {
      adminClient.updatedAt = timestamp;
      payload.adminClient = adminClient;
    } else {
      delete adminClient.updatedAt;
      delete payload.adminClient;
    }

    payload.calculatorData = calculatorData;
    const smsHistory = hasSmsHistory
      ? normalizeAdminSmsHistoryEntries(updates.smsHistory, timestamp)
      : getEntrySmsHistory(entry);
    if (smsHistory.length > 0) {
      payload.adminSms = {
        ...getEntryAdminSmsData(entry),
        history: smsHistory,
        updatedAt: timestamp,
      };
    } else {
      delete payload.adminSms;
    }
    entry.payloadForRetry = payload;

    return entry;
  }

  function normalizePhoneFilterValue(value) {
    return normalizeString(value, 80).replace(/\D+/g, "");
  }

  function getAdminClientsFilters(req) {
    const reqUrl = getRequestUrl(req);
    const q = normalizeString(reqUrl.searchParams.get("q"), 250);
    const name = normalizeString(reqUrl.searchParams.get("name"), 200);
    const email = normalizeString(reqUrl.searchParams.get("email"), 250).toLowerCase();
    const phone = normalizeString(reqUrl.searchParams.get("phone"), 80);
    const client = normalizeString(reqUrl.searchParams.get("client"), 250).toLowerCase();
    const addressKey = normalizeString(reqUrl.searchParams.get("addressKey"), 500).toLowerCase();
    return {
      reqUrl,
      filters: {
        q,
        name,
        email,
        phone,
        client,
        addressKey,
      },
    };
  }

  function collectAdminClientRecords(entries = []) {
    const clients = [];

    function createAddressRecord(address) {
      const normalizedInput =
        normalizeAdminClientAddressRecordInput(address) || { address: normalizeString(address, 500) };
      const normalizedAddress = normalizeString(normalizedInput.address, 500);
      return {
        key: buildAdminClientAddressKey(normalizedAddress),
        address: normalizedAddress,
        propertyType: normalizeAdminClientPropertyType(normalizedInput.propertyType),
        squareFootage: normalizeString(normalizedInput.squareFootage, 120),
        roomCount: normalizeString(normalizedInput.roomCount, 120),
        sizeDetails: normalizeString(normalizedInput.sizeDetails, 250),
        pets: normalizeAdminClientPetsValue(normalizedInput.pets),
        notes: normalizeString(normalizedInput.notes, 800),
        latestCreatedAt: "",
        latestCreatedAtMs: 0,
        latestRequestId: "",
        latestService: "",
        latestStatus: "",
        requestCount: 0,
        totalRevenue: 0,
        statuses: [],
        entries: [],
      };
    }

    function ensureAddressRecord(client, address) {
      const normalizedInput =
        normalizeAdminClientAddressRecordInput(address) || { address: normalizeString(address, 500) };
      const normalizedAddress = normalizeString(normalizedInput.address, 500);
      const addressKey = buildAdminClientAddressKey(normalizedAddress);
      let addressRecord = client.addressesByKey.get(addressKey);
      if (!addressRecord) {
        addressRecord = createAddressRecord(normalizedInput);
        client.addressesByKey.set(addressKey, addressRecord);
      } else {
        mergeAdminClientAddressRecord(addressRecord, normalizedInput);
      }
      return addressRecord;
    }

    function createClientRecord(key, input = {}) {
      return {
        key,
        phoneKey: normalizeString(input.phoneKey, 80),
        emailKey: normalizeString(input.emailKey, 250).toLowerCase(),
        fallbackKey: normalizeString(input.fallbackKey, 500),
        name: normalizeString(input.name, 250),
        email: normalizeString(input.email, 250).toLowerCase(),
        phone: normalizeString(input.phone, 80),
        address: normalizeString(input.address, 500),
        latestCreatedAt: normalizeString(input.createdAt, 80),
        latestCreatedAtMs: Number.isFinite(input.createdAtMs) ? input.createdAtMs : 0,
        latestRequestId: normalizeString(input.requestId, 120),
        latestService: normalizeString(input.serviceName, 120),
        latestStatus: normalizeString(input.status, 32).toLowerCase(),
        requestCount: 0,
        totalRevenue: 0,
        statuses: [],
        entries: [],
        addressesByKey: new Map(),
        removedAddressKeys: new Set(),
      };
    }

    for (const entry of entries) {
      const name = normalizeString(entry.customerName || "Клиент", 250);
      const normalizedName = name.toLowerCase();
      const email = normalizeString(entry.customerEmail, 250).toLowerCase();
      const phone = normalizeString(entry.customerPhone, 80);
      const phoneKey = normalizePhoneFilterValue(phone);
      const address = normalizeString(entry.fullAddress, 500);
      const normalizedAddress = address.toLowerCase();
      const requestId = normalizeString(entry.requestId, 120);
      const serviceName = normalizeString(entry.serviceName || entry.serviceType, 120);
      const status = normalizeString(entry.status, 32).toLowerCase();
      const createdAt = normalizeString(entry.createdAt, 80);
      const createdAtMs = Date.parse(createdAt);
      const addressBook = getEntryAdminClientAddressBook(entry);
      const removedAddressKeys = getEntryAdminClientRemovedAddressKeys(entry);
      const nameAddressKey = normalizeString([normalizedName, normalizedAddress].filter(Boolean).join("|"), 500);
      let client = null;

      if (phoneKey) {
        client = clients.find((candidate) => candidate.phoneKey === phoneKey) || null;
        if (!client && email) {
          client = clients.find((candidate) => !candidate.phoneKey && candidate.emailKey === email) || null;
        }
        if (!client && nameAddressKey) {
          client =
            clients.find(
              (candidate) => !candidate.phoneKey && !candidate.emailKey && candidate.fallbackKey === nameAddressKey
            ) || null;
        }
      } else if (email) {
        client = clients.find((candidate) => candidate.emailKey === email) || null;
        if (!client && nameAddressKey) {
          client = clients.find((candidate) => !candidate.phoneKey && candidate.fallbackKey === nameAddressKey) || null;
        }
      } else if (nameAddressKey) {
        client =
          clients.find((candidate) => !candidate.phoneKey && !candidate.emailKey && candidate.fallbackKey === nameAddressKey) ||
          null;
      }

      if (!client) {
        client = createClientRecord(phoneKey || email || nameAddressKey || normalizeString(entry.id, 120), {
          phoneKey,
          emailKey: email,
          fallbackKey: nameAddressKey,
          name,
          email,
          phone,
          address,
          createdAt,
          createdAtMs,
          requestId,
          serviceName,
          status,
        });
        clients.push(client);
      } else {
        if (phoneKey) {
          client.phoneKey = phoneKey;
          client.key = phoneKey;
        }
        if (!client.emailKey && email) client.emailKey = email;
        if (!client.fallbackKey && nameAddressKey) client.fallbackKey = nameAddressKey;
      }

      client.requestCount += 1;
      client.totalRevenue += Number(entry.totalPrice || 0);
      if (!client.email && email) client.email = email;
      if (!client.phone && phone) client.phone = phone;
      if (!client.name && name) client.name = name;
      if (!client.address && address) client.address = address;
      if (status && !client.statuses.includes(status)) client.statuses.push(status);

      client.entries.push({
        ...entry,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        fullAddress: address,
        requestId,
        serviceName,
        status,
        createdAt,
      });

      for (const removedAddressKey of removedAddressKeys) {
        client.removedAddressKeys.add(removedAddressKey);
        client.addressesByKey.delete(removedAddressKey);
      }

      const currentAddressKey = buildAdminClientAddressKey(address);
      if (!client.removedAddressKeys.has(currentAddressKey)) {
        const addressRecord = ensureAddressRecord(client, address);
        addressRecord.requestCount += 1;
        addressRecord.totalRevenue += Number(entry.totalPrice || 0);
        if (status && !addressRecord.statuses.includes(status)) addressRecord.statuses.push(status);
        addressRecord.entries.push({
          ...entry,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          fullAddress: address,
          requestId,
          serviceName,
          status,
          createdAt,
        });

        const isAddressNewer = Number.isFinite(createdAtMs) && createdAtMs >= addressRecord.latestCreatedAtMs;
        if (isAddressNewer || (!addressRecord.latestCreatedAt && createdAt)) {
          addressRecord.latestCreatedAt = createdAt;
          addressRecord.latestCreatedAtMs = Number.isFinite(createdAtMs)
            ? createdAtMs
            : addressRecord.latestCreatedAtMs;
          addressRecord.latestRequestId = requestId;
          addressRecord.latestService = serviceName;
          addressRecord.latestStatus = status;
          if (address) addressRecord.address = address;
        }
      }

      for (const manualAddress of addressBook) {
        if (client.removedAddressKeys.has(buildAdminClientAddressKey(manualAddress.address))) continue;
        ensureAddressRecord(client, manualAddress);
      }

      const isNewer = Number.isFinite(createdAtMs) && createdAtMs >= client.latestCreatedAtMs;
      if (isNewer || (!client.latestCreatedAt && createdAt)) {
        client.latestCreatedAt = createdAt;
        client.latestCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : client.latestCreatedAtMs;
        client.latestRequestId = requestId;
        client.latestService = serviceName;
        client.latestStatus = status;
        if (address) client.address = address;
        if (name) client.name = name;
        if (email) client.email = email;
        if (phone) client.phone = phone;
      }
    }

    return clients
      .map((client) => ({
        ...client,
        address:
          Array.from(client.addressesByKey.values())
            .sort((left, right) => {
              if (right.latestCreatedAtMs !== left.latestCreatedAtMs) {
                return right.latestCreatedAtMs - left.latestCreatedAtMs;
              }
              return normalizeString(left.address, 500).localeCompare(normalizeString(right.address, 500), "ru");
            })[0]?.address || "",
        addressCount: client.addressesByKey.size,
        addresses: Array.from(client.addressesByKey.values())
          .map((addressRecord) => ({
            ...addressRecord,
            entries: addressRecord.entries
              .slice()
              .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || "")),
          }))
          .sort((left, right) => {
            if (right.latestCreatedAtMs !== left.latestCreatedAtMs) {
              return right.latestCreatedAtMs - left.latestCreatedAtMs;
            }
            return normalizeString(left.address, 500).localeCompare(normalizeString(right.address, 500), "ru");
          }),
        removedAddressKeys: Array.from(client.removedAddressKeys.values()),
        entries: client.entries
          .slice()
          .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || "")),
      }))
      .sort((left, right) => {
        if (right.latestCreatedAtMs !== left.latestCreatedAtMs) {
          return right.latestCreatedAtMs - left.latestCreatedAtMs;
        }
        return normalizeString(left.name, 250).localeCompare(normalizeString(right.name, 250), "ru");
      });
  }

  function filterAdminClientRecords(clientRecords = [], filters = {}) {
    const q = normalizeString(filters.q, 250).toLowerCase();
    const qPhone = normalizePhoneFilterValue(filters.q);
    const name = normalizeString(filters.name, 200).toLowerCase();
    const email = normalizeString(filters.email, 250).toLowerCase();
    const phone = normalizePhoneFilterValue(filters.phone);

    return clientRecords.filter((client) => {
      if (q) {
        const haystack = [
          normalizeString(client.name, 250).toLowerCase(),
          normalizeString(client.email, 250).toLowerCase(),
          normalizeString(client.phone, 80).toLowerCase(),
          normalizeString(client.address, 500).toLowerCase(),
          ...(Array.isArray(client.addresses)
            ? client.addresses.map((addressRecord) => normalizeString(addressRecord.address, 500).toLowerCase())
            : []),
          normalizeString(client.latestRequestId, 120).toLowerCase(),
          normalizeString(client.latestService, 120).toLowerCase(),
          ...client.entries.flatMap((entry) => [
            normalizeString(entry.requestId, 120).toLowerCase(),
            normalizeString(entry.fullAddress, 500).toLowerCase(),
            normalizeString(entry.serviceName || entry.serviceType, 120).toLowerCase(),
          ]),
        ].join("\n");
        const matchesPhone = qPhone ? normalizePhoneFilterValue(client.phone).includes(qPhone) : false;
        if (!haystack.includes(q) && !matchesPhone) return false;
      }
      if (name && !normalizeString(client.name, 250).toLowerCase().includes(name)) return false;
      if (email && !normalizeString(client.email, 250).toLowerCase().includes(email)) return false;
      if (phone && !normalizePhoneFilterValue(client.phone).includes(phone)) return false;
      return true;
    });
  }

  return {
    applyClientEntryUpdates,
    getAdminClientsFilters,
    collectAdminClientRecords,
    filterAdminClientRecords,
  };
}

module.exports = {
  createAdminClientDomain,
};
