"use strict";

const { createAdminClientAddressDomain } = require("./domain-client-addresses");
const { createAdminClientRecordDomain } = require("./domain-client-records");

function createAdminClientDomain(deps = {}) {
  const addressDomain = createAdminClientAddressDomain(deps);
  const recordDomain = createAdminClientRecordDomain({
    ...deps,
    ...addressDomain,
  });

  return {
    applyClientEntryUpdates: recordDomain.applyClientEntryUpdates,
    collectAdminClientRecords: recordDomain.collectAdminClientRecords,
    filterAdminClientRecords: recordDomain.filterAdminClientRecords,
    getAdminClientsFilters: recordDomain.getAdminClientsFilters,
  };
}

module.exports = {
  createAdminClientDomain,
};
