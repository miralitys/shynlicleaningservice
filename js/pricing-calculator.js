(function () {
  "use strict";
  const engine = window.ShynliPricing;
  const controls = window.ShynliCalculatorControls;
  controls.mountPricing();
  const form = document.getElementById("cleaningCalculator");
  const serviceKeys = {
    oven: "ovenCleaning",
    fridge: "refrigeratorCleaning",
    baseboards: "baseboardCleaning",
    doors: "doorsCleaning",
    cabinets: "insideCabinets",
    "range-hood": "rangeHood",
    furniture: "furniturePolishing",
    "top-cabinets": "topKitchenCabinets",
  };
  const quantityKeys = {
    windows: "interiorWindowsCleaning",
    blinds: "blindsCleaning",
    linen: "bedLinenChange",
    ...Object.fromEntries(
      Object.keys(controls.quantityLabels).map((key) => [key, key]),
    ),
  };
  function value(id) {
    return document.getElementById(id).value;
  }
  function calculate() {
    const type = value("serviceType");
    const inputs = {
      serviceType: type,
      frequency: value("frequency"),
      rooms: value("bedrooms"),
      bathrooms: value("bathrooms"),
      squareMeters: value("squareFeet"),
      basementCleaning: value("basement"),
      hasPets: value("hasPets"),
      refrigeratorCondition: value("refrigeratorCondition"),
      cabinetsCondition: value("cabinetsCondition"),
      additionalRooms: Object.fromEntries(
        Object.keys(controls.roomLabels).map((k) => [k, value(k + "-qty")]),
      ),
      quantityServices: Object.fromEntries(
        Object.entries(quantityKeys).map(([id, k]) => [k, value(id + "-qty")]),
      ),
      services: Array.from(
        form.querySelectorAll(".addons-section.active .addon-checkbox:checked"),
      ).map((input) => serviceKeys[input.id.slice(type.length + 1)]),
    };
    const windows = Number(value("windows-qty")) || 0;
    const withTracks = value("pricingWindowType") === "with";
    inputs.quantityServices.interiorWindowsCleaning = withTracks ? 0 : windows;
    inputs.quantityServices.interiorWindowsWithTracks = withTracks ? windows : 0;
    const result = engine.calculateQuotePricing(inputs);
    let duration = document.getElementById("pricingDurationEstimate");
    if (!duration) {
      duration = document.createElement("p");
      duration.id = "pricingDurationEstimate";
      duration.className = "calculator-note";
      document.getElementById("totalPrice").after(duration);
    }
    duration.hidden = !type;
    duration.textContent = `Estimated cleaning time: ${result.durationLabel} (2 cleaners)`;
    document.getElementById("totalPrice").textContent = type
      ? "$" +
        result.totalPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : "$0";
    document.getElementById("pricingFrequencyNotice").hidden =
      !result.frequencyNotice;
    document.getElementById("refrigeratorCondition").disabled = !result.services.includes("refrigeratorCleaning");
    document.getElementById("cabinetsCondition").disabled = !result.services.includes("insideCabinets");
    for (const [key, label] of Object.entries(controls.roomLabels)) {
      document
        .getElementById(key + "-qty")
        .closest(".quantity-item")
        .querySelector("label").textContent =
        label +
        " (+$" +
        engine.PRICING[result.serviceType].roomPrice +
        " each)";
    }
    form.querySelectorAll(".addon-checkbox").forEach((input) => {
      const service =
        serviceKeys[input.id.replace(/^(regular|deep|moving)-/, "")];
      const selectedType = input.id.split("-")[0];
      const item = input.closest(".addon-item");
      const locked =
        selectedType !== "regular" && service === "baseboardCleaning";
      input.disabled = locked;
      item.classList.toggle("locked-included", locked);
      if (locked) input.checked = true;
      item.classList.toggle(
        "active-included",
        input.checked &&
          selectedType !== "regular" &&
          engine.PRICING[selectedType].defaultSelectedServices.includes(
            service,
          ),
      );
      item.querySelector(".addon-price").textContent =
        "$" +
        engine.getServicePrice(service, {
          ...inputs,
          serviceType: selectedType,
        });
      item.style.cursor = locked ? "default" : "pointer";
    });
    for (const [id, key] of Object.entries(quantityKeys)) {
      const price = document.getElementById(id + "-price");
      if (price)
        price.textContent =
          "$" +
          (id === "windows" ? windows * (withTracks ? 8 : 6) : result.quantityServices[key] * engine.PRICING.quantityServices[key]);
    }
    window.shynliPricingResult = result;
  }
  window.calculatePrice = calculate;
  window.toggleAddon = function (id) {
    const input = document.getElementById(id);
    if (!input.disabled) input.checked = !input.checked;
    calculate();
  };
  window.changeQuantity = function (key, delta) {
    const input = document.getElementById(key + "-qty");
    input.value = Math.min(
      Number(input.max) || 200,
      Math.max(0, (Number(input.value) || 0) + delta),
    );
    calculate();
  };
  function setType() {
    const type = value("serviceType");
    document.getElementById("frequencyGroup").hidden = type !== "regular";
    form
      .querySelectorAll(".addons-section")
      .forEach((section) =>
        section.classList.toggle("active", section.id === "addons-" + type),
      );
    form.querySelectorAll(".addon-checkbox").forEach((input) => {
      const t = input.id.split("-")[0];
      const key = serviceKeys[input.id.slice(t.length + 1)];
      input.checked = engine.PRICING[t].defaultSelectedServices.includes(key);
    });
    const basement = document.getElementById("basement");
    basement.options[1].textContent =
      "Basement Cleaning: Yes (+$" + engine.getBasementCleaningFee(type) + ")";
    calculate();
  }
  form.addEventListener("input", calculate);
  form.addEventListener("change", (event) => {
    if (event.target.id === "serviceType") setType();
    else calculate();
  });
  form
    .querySelectorAll(".addon-checkbox")
    .forEach((input) =>
      input.addEventListener("click", (event) => event.stopPropagation()),
    );
  setType();
})();
