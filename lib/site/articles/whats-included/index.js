"use strict";

const whatIsIncludedInRegularHouseCleaning = require("./what-is-included-in-regular-house-cleaning");
const whatIsIncludedInADeepCleaningService = require("./what-is-included-in-a-deep-cleaning-service");
const deepCleaningVsRegularCleaningDifference = require("./deep-cleaning-vs-regular-cleaning-difference");
const moveOutCleaningVsDeepCleaning = require("./move-out-cleaning-vs-deep-cleaning");
const howLongDoesADeepCleaningTake = require("./how-long-does-a-deep-cleaning-take");

const WHATS_INCLUDED_ARTICLES = Object.freeze([
  whatIsIncludedInRegularHouseCleaning,
  whatIsIncludedInADeepCleaningService,
  deepCleaningVsRegularCleaningDifference,
  moveOutCleaningVsDeepCleaning,
  howLongDoesADeepCleaningTake,
]);

module.exports = {
  WHATS_INCLUDED_ARTICLES,
};
