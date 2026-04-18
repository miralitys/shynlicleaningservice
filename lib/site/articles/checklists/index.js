"use strict";

const biweeklyCleaningChecklistWhatToClean = require("./biweekly-cleaning-checklist-what-to-clean");
const monthlyCleaningChecklistForFamilies = require("./monthly-cleaning-checklist-for-families");
const deepCleaningChecklistForFirstTimeClients = require("./deep-cleaning-checklist-for-first-time-clients");
const springCleaningChecklistForSuburbanHomes = require("./spring-cleaning-checklist-for-suburban-homes");
const fallCleaningChecklistBeforeWinter = require("./fall-cleaning-checklist-before-winter");

const CHECKLIST_ARTICLES = Object.freeze([
  biweeklyCleaningChecklistWhatToClean,
  monthlyCleaningChecklistForFamilies,
  deepCleaningChecklistForFirstTimeClients,
  springCleaningChecklistForSuburbanHomes,
  fallCleaningChecklistBeforeWinter,
]);

module.exports = {
  CHECKLIST_ARTICLES,
};
