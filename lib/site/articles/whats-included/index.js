"use strict";

const whatIsIncludedInRegularHouseCleaning = require("./what-is-included-in-regular-house-cleaning");
const whatIsIncludedInADeepCleaningService = require("./what-is-included-in-a-deep-cleaning-service");
const deepCleaningVsRegularCleaningDifference = require("./deep-cleaning-vs-regular-cleaning-difference");
const moveOutCleaningVsDeepCleaning = require("./move-out-cleaning-vs-deep-cleaning");
const howLongDoesADeepCleaningTake = require("./how-long-does-a-deep-cleaning-take");
const howLongDoesARegularCleaningTakeFor2000SqFt = require("./how-long-does-a-regular-cleaning-take-for-2000-sq-ft");
const whatCleanersDoIn2Hours = require("./what-cleaners-do-in-2-hours");
const whatCleanersDoIn3Hours = require("./what-cleaners-do-in-3-hours");
const whatIsNotIncludedInHouseCleaningServices = require("./what-is-not-included-in-house-cleaning-services");
const doCleaningServicesWashDishes = require("./do-cleaning-services-wash-dishes");
const doCleanersDoLaundry = require("./do-cleaners-do-laundry");
const doCleanersCleanInsideOven = require("./do-cleaners-clean-inside-oven");
const doCleanersCleanInsideFridge = require("./do-cleaners-clean-inside-fridge");
const doCleanersCleanWindowsInside = require("./do-cleaners-clean-windows-inside");
const doCleanersChangeBedSheets = require("./do-cleaners-change-bed-sheets");

const WHATS_INCLUDED_ARTICLES = Object.freeze([
  whatIsIncludedInRegularHouseCleaning,
  whatIsIncludedInADeepCleaningService,
  deepCleaningVsRegularCleaningDifference,
  moveOutCleaningVsDeepCleaning,
  howLongDoesADeepCleaningTake,
  howLongDoesARegularCleaningTakeFor2000SqFt,
  whatCleanersDoIn2Hours,
  whatCleanersDoIn3Hours,
  whatIsNotIncludedInHouseCleaningServices,
  doCleaningServicesWashDishes,
  doCleanersDoLaundry,
  doCleanersCleanInsideOven,
  doCleanersCleanInsideFridge,
  doCleanersCleanWindowsInside,
  doCleanersChangeBedSheets,
]);

module.exports = {
  WHATS_INCLUDED_ARTICLES,
};
