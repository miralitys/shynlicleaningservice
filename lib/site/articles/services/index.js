"use strict";

const whatAffectsHouseCleaningPrice = require("./what-affects-house-cleaning-price");
const howMuchDoesDeepCleaningCostForAHouse = require("./how-much-does-deep-cleaning-cost-for-a-house");
const howMuchDoesMoveOutCleaningCost = require("./how-much-does-move-out-cleaning-cost");
const houseCleaningCostPerHourVsFlatRate = require("./house-cleaning-cost-per-hour-vs-flat-rate");
const isItCheaperToDoBiweeklyCleaning = require("./is-it-cheaper-to-do-biweekly-cleaning");

const SERVICES_ARTICLES = Object.freeze([
  whatAffectsHouseCleaningPrice,
  howMuchDoesDeepCleaningCostForAHouse,
  howMuchDoesMoveOutCleaningCost,
  houseCleaningCostPerHourVsFlatRate,
  isItCheaperToDoBiweeklyCleaning,
]);

module.exports = {
  SERVICES_ARTICLES,
};
