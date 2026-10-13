(function () {
  "use strict";
  const engine = window.ShynliPricing;
  function read(form, name) {
    const input = form.elements.namedItem(name);
    return input ? input.value : "";
  }
  function calculate(form) {
    const result = engine.calculateQuotePricing({
      serviceType: read(form, "quoteServiceType"),
      frequency: read(form, "quoteFrequency"),
      rooms: read(form, "quoteRooms"),
      bathrooms: read(form, "quoteBathrooms"),
      squareMeters: read(form, "quoteSquareMeters"),
      basementCleaning: read(form, "quoteBasementCleaning"),
      hasPets: read(form, "quoteHasPets"),
      additionalRooms: Object.fromEntries(
        ["office", "sunroom", "familyRoom", "loft"].map((key) => [
          key,
          read(form, "quote" + key.charAt(0).toUpperCase() + key.slice(1)),
        ]),
      ),
      services: Array.from(
        form.querySelectorAll('[name="quoteServices"]:checked'),
      ).map((input) => input.value),
      quantityServices: Object.fromEntries(
        Object.keys(engine.PRICING.quantityServices).map((key) => [
          key,
          read(form, "quote" + key.charAt(0).toUpperCase() + key.slice(1)),
        ]),
      ),
      refrigeratorCondition: read(form, "quoteRefrigeratorCondition"),
      cabinetsCondition: read(form, "quoteCabinetsCondition"),
    });
    form.querySelector("[data-quote-price-preview]").textContent =
      "$" +
      result.totalPrice.toLocaleString("en-US", { maximumFractionDigits: 2 }) +
      (result.frequencyNotice
        ? " (Every 3 weeks: тариф biweekly; менеджер может скорректировать)"
        : "");
  }
  for (const name of ["input", "change"])
    document.addEventListener(name, (event) => {
      const form = event.target.closest(".admin-order-quote-edit-form");
      if (form && event.target.name.startsWith("quote")) calculate(form);
    });
})();
