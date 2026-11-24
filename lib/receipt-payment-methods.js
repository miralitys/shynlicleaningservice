"use strict";

const RECEIPT_PAYMENT_METHODS = Object.freeze({cash:"Cash",zelle:"Zelle",venmo:"Venmo",check:"Check"});
const isReceiptPaymentMethod = value => typeof value === "string" && Object.hasOwn(RECEIPT_PAYMENT_METHODS,value);

module.exports = {RECEIPT_PAYMENT_METHODS,isReceiptPaymentMethod};
