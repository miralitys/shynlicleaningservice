"use strict";

const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");

const STORE_VERSION = 2;
const CHECKLIST_SERVICE_TYPES = Object.freeze(["regular", "deep", "moving"]);
const CHECKLIST_SERVICE_TYPE_SET = new Set(CHECKLIST_SERVICE_TYPES);
const CHECKLIST_TEMPLATES = Object.freeze({
  regular: Object.freeze({
    title: "Регулярная уборка",
    description: "Базовый шаблон из Cleaning app для регулярного выезда.",
    items: Object.freeze([
      Object.freeze({ label: "Пылесосить полы", hint: "Все комнаты" }),
      Object.freeze({ label: "Протереть пыль", hint: "Все доступные поверхности, полки" }),
      Object.freeze({ label: "Вымыть ванную", hint: "Ванна/душ, раковина, зеркало, унитаз снаружи" }),
      Object.freeze({ label: "Вымыть кухню", hint: "Столешница, раковина, снаружи плиты" }),
      Object.freeze({ label: "Вынести мусор", hint: "Все корзины, завязать пакеты" }),
      Object.freeze({ label: "Заправить кровати", hint: "Постельное бельё заправлено, подушки на месте" }),
      Object.freeze({ label: "Протереть зеркала", hint: "Во всех комнатах" }),
      Object.freeze({ label: "Вымыть окна", hint: "Внутренняя сторона стёкол" }),
      Object.freeze({ label: "Пропылесосить ковры и коврики", hint: "Включая под мебелью где возможно" }),
      Object.freeze({ label: "Протереть выключатели и дверные ручки", hint: "Все комнаты" }),
      Object.freeze({ label: "Протереть кухонный фартук", hint: "От брызг и жира" }),
      Object.freeze({ label: "Убрать крошки и пыль с обеденного стола", hint: "Стол и стулья сверху" }),
    ]),
  }),
  deep: Object.freeze({
    title: "Генеральная уборка",
    description: "Расширенный шаблон из Cleaning app для глубокой уборки.",
    items: Object.freeze([
      Object.freeze({ label: "Пылесосить полы", hint: "Все комнаты" }),
      Object.freeze({ label: "Протереть пыль", hint: "Все доступные поверхности, полки" }),
      Object.freeze({ label: "Вымыть ванную", hint: "Ванна/душ, раковина, зеркало, унитаз снаружи" }),
      Object.freeze({ label: "Вымыть кухню", hint: "Столешница, раковина, снаружи плиты" }),
      Object.freeze({ label: "Вынести мусор", hint: "Все корзины, завязать пакеты" }),
      Object.freeze({ label: "Заправить кровати", hint: "Постельное бельё заправлено, подушки на месте" }),
      Object.freeze({ label: "Протереть зеркала", hint: "Во всех комнатах" }),
      Object.freeze({ label: "Вымыть окна", hint: "Внутренняя сторона стёкол" }),
      Object.freeze({ label: "Пропылесосить ковры и коврики", hint: "Включая под мебелью где возможно" }),
      Object.freeze({ label: "Протереть выключатели и дверные ручки", hint: "Все комнаты" }),
      Object.freeze({ label: "Протереть кухонный фартук", hint: "От брызг и жира" }),
      Object.freeze({ label: "Убрать крошки и пыль с обеденного стола", hint: "Стол и стулья сверху" }),
      Object.freeze({ label: "Мытьё внутри холодильника", hint: "Полки, ящики, стенки, дверца" }),
      Object.freeze({ label: "Мытьё внутри духовки", hint: "Дно, стенки, решётка" }),
      Object.freeze({ label: "Мытьё шкафов снаружи", hint: "Фасады кухни и прихожей" }),
      Object.freeze({ label: "Мытьё плинтусов", hint: "По периметру комнат" }),
      Object.freeze({ label: "Мытьё дверей", hint: "С обеих сторон, ручки" }),
      Object.freeze({ label: "Чистка микроволновки внутри", hint: "Поддон, стенки, решётка" }),
      Object.freeze({ label: "Мытьё светильников и плафонов", hint: "Снятие плафонов при необходимости" }),
      Object.freeze({ label: "Пылесосить/выбить мягкую мебель", hint: "Диваны, кресла, изголовья" }),
      Object.freeze({ label: "Протереть батареи отопления", hint: "Сверху и между секциями" }),
      Object.freeze({ label: "Вымыть подставки и полки в ванной", hint: "Полка над раковиной, угловые полки" }),
    ]),
  }),
  moving: Object.freeze({
    title: "Уборка перед переездом",
    description: "Полный шаблон из Cleaning app для пустого объекта перед въездом или выездом.",
    items: Object.freeze([
      Object.freeze({ label: "Пылесосить полы", hint: "Все комнаты" }),
      Object.freeze({ label: "Протереть пыль", hint: "Все доступные поверхности, полки" }),
      Object.freeze({ label: "Вымыть ванную", hint: "Ванна/душ, раковина, зеркало, унитаз снаружи" }),
      Object.freeze({ label: "Вымыть кухню", hint: "Столешница, раковина, снаружи плиты" }),
      Object.freeze({ label: "Вынести мусор", hint: "Все корзины, завязать пакеты" }),
      Object.freeze({ label: "Заправить кровати", hint: "Постельное бельё заправлено, подушки на месте" }),
      Object.freeze({ label: "Протереть зеркала", hint: "Во всех комнатах" }),
      Object.freeze({ label: "Вымыть окна", hint: "Внутренняя сторона стёкол" }),
      Object.freeze({ label: "Пропылесосить ковры и коврики", hint: "Включая под мебелью где возможно" }),
      Object.freeze({ label: "Протереть выключатели и дверные ручки", hint: "Все комнаты" }),
      Object.freeze({ label: "Протереть кухонный фартук", hint: "От брызг и жира" }),
      Object.freeze({ label: "Убрать крошки и пыль с обеденного стола", hint: "Стол и стулья сверху" }),
      Object.freeze({ label: "Мытьё внутри холодильника", hint: "Полки, ящики, стенки, дверца" }),
      Object.freeze({ label: "Мытьё внутри духовки", hint: "Дно, стенки, решётка" }),
      Object.freeze({ label: "Мытьё шкафов снаружи", hint: "Фасады кухни и прихожей" }),
      Object.freeze({ label: "Мытьё плинтусов", hint: "По периметру комнат" }),
      Object.freeze({ label: "Мытьё дверей", hint: "С обеих сторон, ручки" }),
      Object.freeze({ label: "Чистка микроволновки внутри", hint: "Поддон, стенки, решётка" }),
      Object.freeze({ label: "Мытьё светильников и плафонов", hint: "Снятие плафонов при необходимости" }),
      Object.freeze({ label: "Пылесосить/выбить мягкую мебель", hint: "Диваны, кресла, изголовья" }),
      Object.freeze({ label: "Протереть батареи отопления", hint: "Сверху и между секциями" }),
      Object.freeze({ label: "Вымыть подставки и полки в ванной", hint: "Полка над раковиной, угловые полки" }),
      Object.freeze({ label: "Мытьё внутри шкафов", hint: "Полки, стенки, дно (кухня, гардероб, прихожая)" }),
      Object.freeze({ label: "Мытьё стен", hint: "В местах загрязнений и отпечатков" }),
      Object.freeze({ label: "Мытьё потолка", hint: "Углы, карнизы, вокруг светильников" }),
      Object.freeze({ label: "Мытьё розеток и выключателей", hint: "Лицевые панели без снятия" }),
      Object.freeze({ label: "Мытьё подоконников снаружи и изнутри", hint: "Включая откосы" }),
      Object.freeze({ label: "Мытьё сантехники в ванной полностью", hint: "Ванна, душевая кабина, унитаз внутри и снаружи" }),
      Object.freeze({ label: "Мытьё плитки в ванной и кухне", hint: "Швы и затирка при необходимости" }),
      Object.freeze({ label: "Удаление пыли и паутины с высоких мест", hint: "Углы потолка, верх шкафов" }),
      Object.freeze({ label: "Финальная проверка: нет мусора и личных вещей", hint: "Все комнаты и кладовки" }),
    ]),
  }),
});

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeOptionalString(value, maxLength = 500) {
  const normalized = normalizeString(value, maxLength);
  return normalized || "";
}

function getSafeChecklistServiceType(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return CHECKLIST_SERVICE_TYPE_SET.has(normalized) ? normalized : "regular";
}

function isDeprecatedChecklistItem(item = {}) {
  const label = normalizeString(item && item.label, 240).toLowerCase();
  const hint = normalizeString(item && item.hint, 240).toLowerCase();
  return (
    label === "проветрить помещения" ||
    hint === "окна открыть перед уходом" ||
    (label.includes("проветр") && hint.includes("окна"))
  );
}

function createDefaultChecklistItem(serviceType, itemDefinition, index) {
  const timestamp = new Date().toISOString();
  return {
    id: `${serviceType}-default-${index + 1}`,
    label: normalizeString(itemDefinition.label, 240),
    hint: normalizeOptionalString(itemDefinition.hint, 240),
    completed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sanitizeChecklistItem(serviceType, input = {}, fallbackIndex = 0) {
  const timestamp = new Date().toISOString();
  const label = normalizeString(input.label, 240);
  return {
    id: normalizeString(input.id, 120) || crypto.randomUUID(),
    label,
    hint: normalizeOptionalString(input.hint, 240),
    completed: Boolean(input.completed),
    createdAt: normalizeString(input.createdAt, 80) || timestamp,
    updatedAt: normalizeString(input.updatedAt, 80) || timestamp,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : fallbackIndex,
  };
}

function buildDefaultTemplate(serviceType) {
  const definition = CHECKLIST_TEMPLATES[serviceType];
  return {
    serviceType,
    title: definition.title,
    description: definition.description,
    items: definition.items.map((itemDefinition, index) => ({
      ...createDefaultChecklistItem(serviceType, itemDefinition, index),
      sortOrder: index,
    })),
  };
}

function buildDefaultState() {
  const templates = {};
  for (const serviceType of CHECKLIST_SERVICE_TYPES) {
    templates[serviceType] = buildDefaultTemplate(serviceType);
  }
  return {
    version: STORE_VERSION,
    templates,
  };
}

function sanitizeTemplate(serviceType, rawTemplate = {}) {
  const definition = CHECKLIST_TEMPLATES[serviceType];
  const fallbackTemplate = buildDefaultTemplate(serviceType);
  const rawItems = Array.isArray(rawTemplate.items) ? rawTemplate.items : fallbackTemplate.items;
  const items = rawItems
    .map((item, index) => sanitizeChecklistItem(serviceType, item, index))
    .filter((item) => Boolean(item.label))
    .filter((item) => !isDeprecatedChecklistItem(item))
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.createdAt.localeCompare(right.createdAt);
    });

  return {
    serviceType,
    title: definition.title,
    description: definition.description,
    items,
  };
}

function sanitizeState(raw = {}) {
  if (!raw || Number(raw.version) !== STORE_VERSION || !raw.templates || typeof raw.templates !== "object") {
    return buildDefaultState();
  }

  const templates = {};
  for (const serviceType of CHECKLIST_SERVICE_TYPES) {
    const rawTemplate = raw && raw.templates && typeof raw.templates === "object" ? raw.templates[serviceType] : {};
    templates[serviceType] = sanitizeTemplate(serviceType, rawTemplate);
  }

  return {
    version: STORE_VERSION,
    templates,
  };
}

async function readState(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return sanitizeState(JSON.parse(raw));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return sanitizeState({});
    }
    throw error;
  }
}

function cloneTemplate(template) {
  return {
    ...template,
    items: template.items.map((item) => ({ ...item })),
  };
}

function createAdminSettingsStore(options = {}) {
  const filePath = path.resolve(
    options.filePath ||
      process.env.ADMIN_SETTINGS_STORE_PATH ||
      path.join(process.cwd(), "data", "admin-settings-store.json")
  );
  let statePromise = null;
  let writeQueue = Promise.resolve();

  async function ensureState() {
    if (!statePromise) {
      statePromise = readState(filePath);
    }
    return statePromise;
  }

  async function persistState(state) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  function runSerialized(work) {
    const nextOperation = writeQueue.then(async () => {
      const state = await ensureState();
      const result = await work(state);
      await persistState(state);
      return result;
    });
    writeQueue = nextOperation.catch(() => {});
    return nextOperation;
  }

  return {
    filePath,
    async getSnapshot() {
      const state = await ensureState();
      return {
        templates: CHECKLIST_SERVICE_TYPES.map((serviceType) => cloneTemplate(state.templates[serviceType])),
      };
    },
    async setCompletedItems(serviceType, completedItemIds = []) {
      const normalizedServiceType = getSafeChecklistServiceType(serviceType);
      return runSerialized(async (state) => {
        const template = state.templates[normalizedServiceType];
        const completedSet = new Set(
          (Array.isArray(completedItemIds) ? completedItemIds : [completedItemIds])
            .map((itemId) => normalizeString(itemId, 120))
            .filter(Boolean)
        );
        const timestamp = new Date().toISOString();

        template.items = template.items.map((item) => ({
          ...item,
          completed: completedSet.has(item.id),
          updatedAt: completedSet.has(item.id) !== item.completed ? timestamp : item.updatedAt,
        }));
        return cloneTemplate(template);
      });
    },
    async addChecklistItem(serviceType, label) {
      const normalizedServiceType = getSafeChecklistServiceType(serviceType);
      return runSerialized(async (state) => {
        const normalizedLabel = normalizeString(label, 240);
        if (!normalizedLabel) {
          throw new Error("CHECKLIST_ITEM_LABEL_REQUIRED");
        }
        const template = state.templates[normalizedServiceType];
        const record = sanitizeChecklistItem(
          normalizedServiceType,
          {
            label: normalizedLabel,
            completed: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sortOrder: template.items.length,
          },
          template.items.length
        );
        template.items.push(record);
        template.items = sanitizeTemplate(normalizedServiceType, template).items;
        return { ...record };
      });
    },
    async saveChecklistTemplate(serviceType, items = []) {
      const normalizedServiceType = getSafeChecklistServiceType(serviceType);
      return runSerialized(async (state) => {
        const template = state.templates[normalizedServiceType];
        const existingById = new Map(
          template.items.map((item) => [normalizeString(item.id, 120), { ...item }])
        );
        const timestamp = new Date().toISOString();
        const normalizedItems = (Array.isArray(items) ? items : [])
          .map((item, index) => {
            const itemId = normalizeString(item && item.id, 120);
            const itemLabel = normalizeString(item && item.label, 240);
            const hasHintField = Boolean(item) && Object.prototype.hasOwnProperty.call(item, "hint");
            const itemHint = normalizeOptionalString(item && item.hint, 240);
            if (!itemLabel) return null;
            const existingItem = itemId ? existingById.get(itemId) || null : null;
            return sanitizeChecklistItem(
              normalizedServiceType,
              {
                id: existingItem ? existingItem.id : itemId,
                label: itemLabel,
                hint: hasHintField ? itemHint : existingItem ? existingItem.hint : "",
                completed: existingItem ? existingItem.completed : false,
                createdAt: existingItem ? existingItem.createdAt : timestamp,
                updatedAt: timestamp,
                sortOrder: index,
              },
              index
            );
          })
          .filter(Boolean);

        template.items = normalizedItems;
        return cloneTemplate(template);
      });
    },
    async resetChecklist(serviceType) {
      const normalizedServiceType = getSafeChecklistServiceType(serviceType);
      return runSerialized(async (state) => {
        const template = state.templates[normalizedServiceType];
        const timestamp = new Date().toISOString();
        template.items = template.items.map((item) => ({
          ...item,
          completed: false,
          updatedAt: item.completed ? timestamp : item.updatedAt,
        }));
        return cloneTemplate(template);
      });
    },
  };
}

module.exports = {
  CHECKLIST_SERVICE_TYPES,
  CHECKLIST_TEMPLATES,
  createAdminSettingsStore,
};
