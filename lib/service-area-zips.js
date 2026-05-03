"use strict";

function zipTargets(...targets) {
  return Object.freeze(
    targets.map((target) =>
      Object.freeze({
        city: target.city,
        url: target.url,
      })
    )
  );
}

const SERVICE_AREA_ZIP_MAP = Object.freeze({
  "60101": zipTargets({ city: "Addison", url: "/addison" }),
  "60103": zipTargets({ city: "Bartlett", url: "/bartlett" }),
  "60107": zipTargets({ city: "Streamwood", url: "/streamwood" }),
  "60126": zipTargets({ city: "Elmhurst", url: "/elmhurst" }),
  "60134": zipTargets({ city: "Geneva", url: "/geneva" }),
  "60137": zipTargets({ city: "Glen Ellyn", url: "/glenellyn" }),
  "60143": zipTargets({ city: "Itasca", url: "/itasca" }),
  "60148": zipTargets({ city: "Lombard", url: "/lombard" }),
  "60174": zipTargets({ city: "St. Charles", url: "/stcharles" }),
  "60175": zipTargets({ city: "St. Charles", url: "/stcharles" }),
  "60181": zipTargets({ city: "Villa Park", url: "/villapark" }),
  "60184": zipTargets({ city: "Wayne", url: "/wayne" }),
  "60185": zipTargets({ city: "West Chicago", url: "/westchicago" }),
  "60187": zipTargets({ city: "Wheaton", url: "/wheaton" }),
  "60188": zipTargets({ city: "Carol Stream", url: "/carolstream" }),
  "60189": zipTargets({ city: "Wheaton", url: "/wheaton" }),
  "60190": zipTargets({ city: "Winfield", url: "/winfield" }),
  "60191": zipTargets({ city: "Wood Dale", url: "/wooddale" }),
  "60439": zipTargets({ city: "Lemont", url: "/lemont" }),
  "60440": zipTargets({ city: "Bolingbrook", url: "/bolingbrook" }),
  "60441": zipTargets(
    { city: "Homer Glen", url: "/homerglen" },
    { city: "Lockport", url: "/lockport" }
  ),
  "60446": zipTargets(
    { city: "Lockport", url: "/lockport" },
    { city: "Romeoville", url: "/romeoville" }
  ),
  "60490": zipTargets({ city: "Bolingbrook", url: "/bolingbrook" }),
  "60491": zipTargets(
    { city: "Homer Glen", url: "/homerglen" },
    { city: "Lockport", url: "/lockport" }
  ),
  "60502": zipTargets({ city: "Aurora", url: "/aurora" }),
  "60503": zipTargets({ city: "Aurora", url: "/aurora" }),
  "60504": zipTargets({ city: "Aurora", url: "/aurora" }),
  "60505": zipTargets({ city: "Aurora", url: "/aurora" }),
  "60506": zipTargets({ city: "Aurora", url: "/aurora" }),
  "60510": zipTargets({ city: "Batavia", url: "/batavia" }),
  "60512": zipTargets({ city: "Bristol", url: "/bristol" }),
  "60514": zipTargets({ city: "Clarendon Hills", url: "/clarendonhills" }),
  "60515": zipTargets({ city: "Downers Grove", url: "/downersgrove" }),
  "60516": zipTargets({ city: "Downers Grove", url: "/downersgrove" }),
  "60517": zipTargets(
    { city: "Downers Grove", url: "/downersgrove" },
    { city: "Woodridge", url: "/woodridge" }
  ),
  "60521": zipTargets(
    { city: "Hinsdale", url: "/hinsdale" },
    { city: "Oak Brook", url: "/oakbrook" }
  ),
  "60523": zipTargets(
    { city: "Hinsdale", url: "/hinsdale" },
    { city: "Oak Brook", url: "/oakbrook" }
  ),
  "60527": zipTargets(
    { city: "Burr Ridge", url: "/burrridge" },
    { city: "Willowbrook", url: "/willowbrook" }
  ),
  "60532": zipTargets({ city: "Lisle", url: "/lisle" }),
  "60538": zipTargets({ city: "Montgomery", url: "/montgomery" }),
  "60540": zipTargets({ city: "Naperville", url: "/naperville" }),
  "60542": zipTargets({ city: "North Aurora", url: "/northaurora" }),
  "60543": zipTargets({ city: "Oswego", url: "/oswego" }),
  "60544": zipTargets({ city: "Plainfield", url: "/plainfield" }),
  "60554": zipTargets({ city: "Sugar Grove", url: "/sugargrove" }),
  "60555": zipTargets({ city: "Warrenville", url: "/warrenville" }),
  "60559": zipTargets({ city: "Westmont", url: "/westmont" }),
  "60560": zipTargets({ city: "Yorkville", url: "/yorkville" }),
  "60561": zipTargets({ city: "Darien", url: "/darien" }),
  "60563": zipTargets(
    { city: "Naperville", url: "/naperville" },
    { city: "Warrenville", url: "/warrenville" }
  ),
  "60564": zipTargets({ city: "Naperville", url: "/naperville" }),
  "60565": zipTargets({ city: "Naperville", url: "/naperville" }),
  "60585": zipTargets({ city: "Plainfield", url: "/plainfield" }),
  "60586": zipTargets({ city: "Plainfield", url: "/plainfield" }),
});

const SERVICE_AREA_ZIP_CODES = Object.freeze(Object.keys(SERVICE_AREA_ZIP_MAP));

function normalizeServiceAreaZip(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 5);
  return digits.length === 5 ? digits : "";
}

function extractServiceAreaZipFromText(value) {
  const match = String(value ?? "").match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? normalizeServiceAreaZip(match[1]) : "";
}

function getServiceAreaTargets(zipCode) {
  const normalized = normalizeServiceAreaZip(zipCode);
  return normalized ? SERVICE_AREA_ZIP_MAP[normalized] || Object.freeze([]) : Object.freeze([]);
}

function isSupportedServiceAreaZip(zipCode) {
  return getServiceAreaTargets(zipCode).length > 0;
}

module.exports = {
  SERVICE_AREA_ZIP_CODES,
  SERVICE_AREA_ZIP_MAP,
  extractServiceAreaZipFromText,
  getServiceAreaTargets,
  isSupportedServiceAreaZip,
  normalizeServiceAreaZip,
};
