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
const cleaningServicePriceForHomesWithPets = require("./cleaning-service-price-for-homes-with-pets");
const cleaningCostFor1BedroomApartment = require("./cleaning-cost-for-1-bedroom-apartment");
const cleaningCostFor4BedroomHouse = require("./cleaning-cost-for-4-bedroom-house");
const cleaningCostFor2BathroomsVs3Bathrooms = require("./cleaning-cost-for-2-bathrooms-vs-3-bathrooms");
const howMuchTimeToClean1500SqFtHouse = require("./how-much-time-to-clean-1500-sq-ft-house");
const howMuchTimeToClean2500SqFtHouse = require("./how-much-time-to-clean-2500-sq-ft-house");
const whatIsAFairPriceForMoveInCleaning = require("./what-is-a-fair-price-for-move-in-cleaning");
const whyPricesVaryBetweenCleaningCompanies = require("./why-prices-vary-between-cleaning-companies");
const isACleaningSubscriptionWorthIt = require("./is-a-cleaning-subscription-worth-it");
const recurringCleaningDiscountHowItWorks = require("./recurring-cleaning-discount-how-it-works");

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
  cleaningServicePriceForHomesWithPets,
  cleaningCostFor1BedroomApartment,
  cleaningCostFor4BedroomHouse,
  cleaningCostFor2BathroomsVs3Bathrooms,
  howMuchTimeToClean1500SqFtHouse,
  howMuchTimeToClean2500SqFtHouse,
  whatIsAFairPriceForMoveInCleaning,
  whyPricesVaryBetweenCleaningCompanies,
  isACleaningSubscriptionWorthIt,
  recurringCleaningDiscountHowItWorks,
]);

module.exports = {
  SERVICES_ARTICLES,
};
