"use strict";

const biweeklyCleaningChecklistWhatToClean = require("./biweekly-cleaning-checklist-what-to-clean");
const monthlyCleaningChecklistForFamilies = require("./monthly-cleaning-checklist-for-families");
const deepCleaningChecklistForFirstTimeClients = require("./deep-cleaning-checklist-for-first-time-clients");
const springCleaningChecklistForSuburbanHomes = require("./spring-cleaning-checklist-for-suburban-homes");
const fallCleaningChecklistBeforeWinter = require("./fall-cleaning-checklist-before-winter");
const moveInCleaningChecklistApartment = require("./move-in-cleaning-checklist-apartment");
const moveOutCleaningChecklistForGettingDepositBack = require("./move-out-cleaning-checklist-for-getting-deposit-back");
const airbnbTurnoverCleaningChecklist = require("./airbnb-turnover-cleaning-checklist");
const kitchenDeepCleanChecklistStepByStep = require("./kitchen-deep-clean-checklist-step-by-step");
const bathroomDeepCleanChecklistForHardWater = require("./bathroom-deep-clean-checklist-for-hard-water");
const bedroomCleaningChecklistForAllergies = require("./bedroom-cleaning-checklist-for-allergies");
const livingRoomCleaningChecklistWithPets = require("./living-room-cleaning-checklist-with-pets");
const cleaningChecklistForHomeOfficeSetup = require("./cleaning-checklist-for-home-office-setup");
const cleaningChecklistBeforeHostingGuests = require("./cleaning-checklist-before-hosting-guests");
const cleaningChecklistAfterAPartyAtHome = require("./cleaning-checklist-after-a-party-at-home");
const cleaningChecklistForNewConstructionDust = require("./cleaning-checklist-for-new-construction-dust");
const cleaningChecklistForPetOdorControl = require("./cleaning-checklist-for-pet-odor-control");
const cleaningChecklistForElderlyParentsHome = require("./cleaning-checklist-for-elderly-parents-home");

const CHECKLIST_ARTICLES = Object.freeze([
  biweeklyCleaningChecklistWhatToClean,
  monthlyCleaningChecklistForFamilies,
  deepCleaningChecklistForFirstTimeClients,
  springCleaningChecklistForSuburbanHomes,
  fallCleaningChecklistBeforeWinter,
  moveInCleaningChecklistApartment,
  moveOutCleaningChecklistForGettingDepositBack,
  airbnbTurnoverCleaningChecklist,
  kitchenDeepCleanChecklistStepByStep,
  bathroomDeepCleanChecklistForHardWater,
  bedroomCleaningChecklistForAllergies,
  livingRoomCleaningChecklistWithPets,
  cleaningChecklistForHomeOfficeSetup,
  cleaningChecklistBeforeHostingGuests,
  cleaningChecklistAfterAPartyAtHome,
  cleaningChecklistForNewConstructionDust,
  cleaningChecklistForPetOdorControl,
  cleaningChecklistForElderlyParentsHome,
]);

module.exports = {
  CHECKLIST_ARTICLES,
};
