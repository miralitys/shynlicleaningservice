"use strict";

const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");

const STORE_VERSION = 1;
const CHECKLIST_SERVICE_TYPES = Object.freeze(["regular", "deep", "moving"]);
const CHECKLIST_SERVICE_TYPE_SET = new Set(CHECKLIST_SERVICE_TYPES);
const CHECKLIST_TEMPLATES = Object.freeze({
  regular: Object.freeze({
    title: "Регулярная уборка",
    description: "Базовый список задач для регулярного выезда.",
    items: Object.freeze([
      "Протереть пыль на доступных поверхностях",
      "Пропылесосить полы и ковры",
      "Помыть полы",
      "Протереть кухонные поверхности",
      "Очистить и продезинфицировать ванную комнату",
      "Вынести мусор и заменить пакеты",
    ]),
  }),
  deep: Object.freeze({
    title: "Генеральная уборка",
    description: "Расширенный чек-лист для глубокой уборки.",
    items: Object.freeze([
      "Выполнить базовые задачи регулярной уборки",
      "Протереть плинтусы и двери",
      "Тщательно очистить сантехнику и плитку",
      "Протереть фасады шкафов и бытовую технику снаружи",
      "Очистить труднодоступные зоны и углы",
      "Проверить качество перед сдачей объекта",
    ]),
  }),
  moving: Object.freeze({
    title: "Уборка перед переездом",
    description: "Чек-лист для пустого объекта перед въездом или выездом.",
    items: Object.freeze([
      "Очистить шкафы и ящики внутри",
      "Вымыть холодильник и духовку внутри",
      "Протереть плинтусы, двери и выключатели",
      "Тщательно очистить кухню и санузлы",
      "Пропылесосить и вымыть все полы",
      "Сделать финальный осмотр помещений",
    ]),
  }),
});

function normalizeString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function getSafeChecklistServiceType(value) {
  const normalized = normalizeString(value, 32).toLowerCase();
  return CHECKLIST_SERVICE_TYPE_SET.has(normalized) ? normalized : "regular";
}

function createDefaultChecklistItem(serviceType, label, index) {
  const timestamp = new Date().toISOString();
  return {
    id: `${serviceType}-default-${index + 1}`,
    label: normalizeString(label, 240),
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
    items: definition.items.map((label, index) => ({
      ...createDefaultChecklistItem(serviceType, label, index),
      sortOrder: index,
    })),
  };
}

function sanitizeTemplate(serviceType, rawTemplate = {}) {
  const definition = CHECKLIST_TEMPLATES[serviceType];
  const fallbackTemplate = buildDefaultTemplate(serviceType);
  const rawItems = Array.isArray(rawTemplate.items) ? rawTemplate.items : fallbackTemplate.items;
  const items = rawItems
    .map((item, index) => sanitizeChecklistItem(serviceType, item, index))
    .filter((item) => Boolean(item.label))
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
            if (!itemLabel) return null;
            const existingItem = itemId ? existingById.get(itemId) || null : null;
            return sanitizeChecklistItem(
              normalizedServiceType,
              {
                id: existingItem ? existingItem.id : itemId,
                label: itemLabel,
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
