"use strict";

const whatAffectsHouseCleaningPrice = require("./what-affects-house-cleaning-price");
const howMuchDoesDeepCleaningCostForAHouse = require("./how-much-does-deep-cleaning-cost-for-a-house");
const howMuchDoesMoveOutCleaningCost = require("./how-much-does-move-out-cleaning-cost");
const houseCleaningCostPerHourVsFlatRate = require("./house-cleaning-cost-per-hour-vs-flat-rate");
const isItCheaperToDoBiweeklyCleaning = require("./is-it-cheaper-to-do-biweekly-cleaning");
const whyDeepCleaningCostsMore = require("./why-deep-cleaning-costs-more");
const howToGetAnAccurateCleaningQuote = require("./how-to-get-an-accurate-cleaning-quote");
const cleaningAddOnsCostList = require("./cleaning-add-ons-cost-list");
const tipGuideForHouseCleanersHowMuchToTip = require("./tip-guide-for-house-cleaners-how-much-to-tip");
const doesFrequencyLowerCleaningPrice = require("./does-frequency-lower-cleaning-price");

const SERVICES_ARTICLES = Object.freeze([
  whatAffectsHouseCleaningPrice,
  howMuchDoesDeepCleaningCostForAHouse,
  howMuchDoesMoveOutCleaningCost,
  houseCleaningCostPerHourVsFlatRate,
  isItCheaperToDoBiweeklyCleaning,
  whyDeepCleaningCostsMore,
  howToGetAnAccurateCleaningQuote,
  cleaningAddOnsCostList,
  tipGuideForHouseCleanersHowMuchToTip,
  doesFrequencyLowerCleaningPrice,
]);

module.exports = {
  SERVICES_ARTICLES,
};
