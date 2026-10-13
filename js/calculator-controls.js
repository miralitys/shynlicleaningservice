(function () {
  "use strict";
  const roomLabels = {
    office: "Office",
    sunroom: "Sunroom",
    familyRoom: "Family room",
    loft: "Loft",
  };
  const quantityLabels = {
    interiorWindowsWithTracks: "Interior windows with tracks",
    slidingDoorInterior: "Sliding / glass door: inside with tracks",
    slidingDoorBothSides: "Sliding / glass door: both sides with tracks",
    chandelierCleaning: "Chandelier (crystal or glass)*",
  };
  const preparationNote =
    "* Please empty your refrigerator and cabinets before cleaning. There is no need to switch off the refrigerator.";
  const chandelierNote =
    "* Chandelier cleaning: if safely reachable from a small 2-3 step ladder. Work at height requires a manager quote.";
  const frequencyNote =
    "Every 3 weeks is estimated at the biweekly rate. Your manager may adjust it to the monthly rate based on home condition.";
  function suffix(key) {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
  function stepper(key, label, price, quote, room) {
    const id = quote ? "quote2" + suffix(key) : key + "-qty";
    if (quote)
      return `<div class="quote2-quantity-item"><div class="quote2-quantity-copy"><strong>${label}</strong><small>${room ? "" : "$" + price + " each"}</small></div><div class="quote2-stepper"><button type="button" aria-label="Decrease ${label}" class="quote2-stepper-button" data-stepper-target="${id}" data-stepper-direction="-1">-</button><input id="${id}" aria-label="${label}" class="quote2-stepper-input" type="number" min="0" max="${room ? 20 : 200}" step="1" value="0"><button type="button" aria-label="Increase ${label}" class="quote2-stepper-button" data-stepper-target="${id}" data-stepper-direction="1">+</button></div></div>`;
    return `<div class="quantity-item"><label class="quantity-label" for="${id}">${label}${room ? "" : " ($" + price + " each)"}</label><div class="quantity-controls"><button type="button" class="quantity-btn" aria-label="Decrease ${label}" onclick="changeQuantity('${key}', -1)">-</button><input id="${id}" class="quantity-input" type="number" min="0" max="${room ? 20 : 200}" step="1" value="0"><button type="button" class="quantity-btn" aria-label="Increase ${label}" onclick="changeQuantity('${key}', 1)">+</button></div></div>`;
  }
  function conditionSelect(id, label, quote) {
    return `<label class="${quote ? "quote2-field" : "form-group half"}"><span>${label}*</span><select id="${id}" class="${quote ? "quote2-input" : "form-select"}"><option value="emptied">Emptied ($45)</option><option value="notEmptied">Not emptied ($90)</option></select></label>`;
  }
  function mountQuote() {
    const profile = document.querySelector('[data-step-card="profile"]');
    if (!profile) return;
    const grid = document.createElement("div");
    grid.className = "quote2-quantity-grid";
    grid.innerHTML = Object.entries(roomLabels)
      .map(([k, l]) => stepper(k, l, 0, true, true))
      .join("");
    profile.querySelector(".quote2-step-actions").before(grid);
    const frequency = document.getElementById("quote2Frequency");
    frequency.add(
      new Option("Every 3 weeks (biweekly estimate)", "every3weeks"),
    );
    const notice = document.createElement("small");
    notice.id = "quote2FrequencyNotice";
    notice.textContent = frequencyNote;
    notice.hidden = true;
    frequency.after(notice);
    const addons = document.getElementById("quote2FixedServices");
    addons.insertAdjacentHTML(
      "beforeend",
      '<label class="quote2-addon-item" data-deep-only><input type="checkbox" name="services" value="topKitchenCabinets"><span class="quote2-addon-copy"><strong>Top of kitchen cabinets</strong><small data-service-price="topKitchenCabinets">+$45</small></span></label>',
    );
    addons.insertAdjacentHTML(
      "afterend",
      '<div class="quote2-field-grid quote2-field-grid-two">' +
        conditionSelect(
          "quote2RefrigeratorCondition",
          "Inside refrigerator",
          true,
        ) +
        conditionSelect("quote2CabinetsCondition", "Inside cabinets", true) +
        '</div><p class="quote2-section-copy">' +
        preparationNote +
        "</p>",
    );
    const quantities = document.querySelector(
      '[data-step-card="addons"] .quote2-quantity-grid',
    );
    quantities.insertAdjacentHTML(
      "beforeend",
      Object.entries(quantityLabels)
        .map(([k, l]) =>
          stepper(
            k,
            l,
            window.ShynliPricing.PRICING.quantityServices[k],
            true,
            false,
          ),
        )
        .join(""),
    );
    quantities.insertAdjacentHTML(
      "afterend",
      '<p class="quote2-section-copy">' + chandelierNote + "</p>",
    );
    document.querySelector(
      '[data-quantity-service="interiorWindowsCleaning"] strong',
    ).textContent = "Interior windows without tracks";
    document.querySelector(
      '[data-quantity-service="blindsCleaning"] small',
    ).textContent = "$8 per blind. Two blinds on one window: $8 + $8.";
    document
      .querySelector("#quote2HasPets")
      .closest("label")
      .querySelector("span").textContent = "Pets in the home (+$25)";
  }
  function mountPricing() {
    const form = document.getElementById("cleaningCalculator");
    if (!form) return;
    const grid = document.createElement("div");
    grid.className = "quantity-section";
    grid.innerHTML =
      '<h3 class="quantity-title">Additional rooms</h3><div class="quantity-grid">' +
      Object.entries(roomLabels)
        .map(([k, l]) => stepper(k, l, 0, false, true))
        .join("") +
      "</div>";
    form.querySelector(".addons-section").before(grid);
    document
      .getElementById("frequency")
      .add(new Option("Every 3 weeks (biweekly estimate)", "every3weeks"));
    grid.insertAdjacentHTML(
      "beforebegin",
      '<div class="form-group half"><label for="hasPets">Pets in the home (+$25)</label><select class="form-select" id="hasPets"><option value="no">No</option><option value="yes">Yes</option></select></div><p id="pricingFrequencyNotice" class="calculator-note" hidden>' +
        frequencyNote +
        "</p>",
    );
    const originalQuantities = document
      .getElementById("windows-qty")
      .closest(".quantity-grid");
    originalQuantities.insertAdjacentHTML(
      "beforeend",
      Object.entries(quantityLabels)
        .map(([k, l]) =>
          stepper(
            k,
            l,
            window.ShynliPricing.PRICING.quantityServices[k],
            false,
            false,
          ),
        )
        .join(""),
    );
    originalQuantities.insertAdjacentHTML(
      "afterend",
      '<p class="calculator-note">' +
        chandelierNote +
        '</p><p class="calculator-note">Blinds: $8 per blind. Two blinds on one window: $8 + $8.</p>',
    );
    document
      .getElementById("windows-qty")
      .closest(".quantity-item")
      .querySelector(".quantity-label").textContent =
      "Interior windows without tracks ($6/window)";
    document
      .getElementById("blinds-qty")
      .closest(".quantity-item")
      .querySelector(".quantity-label").textContent = "Blinds ($8 per blind)";
    originalQuantities
      .closest(".quantity-section")
      .insertAdjacentHTML(
        "beforebegin",
        conditionSelect("refrigeratorCondition", "Inside refrigerator", false) +
          conditionSelect("cabinetsCondition", "Inside cabinets", false) +
          '<p class="calculator-note">' +
          preparationNote +
          "</p>",
      );
    for (const type of ["deep", "moving"]) {
      form
        .querySelector("#addons-" + type + " .addons-grid")
        .insertAdjacentHTML(
          "beforeend",
          `<div class="addon-item" onclick="toggleAddon('${type}-top-cabinets')"><input type="checkbox" class="addon-checkbox" id="${type}-top-cabinets" data-service="topKitchenCabinets"><span class="addon-label">Top of kitchen cabinets</span><span class="addon-price">$45</span></div>`,
        );
    }
  }
  window.ShynliCalculatorControls = {
    mountQuote,
    mountPricing,
    roomLabels,
    quantityLabels,
  };
})();
