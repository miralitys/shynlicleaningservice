(function () {
  "use strict";
  window.mountSimpleQuote = function () {
    const profile = document.querySelector('[data-step-card="profile"]');
    for (const [id, label, step, max] of [["quote2Rooms", "Bedrooms", 1, 5], ["quote2Bathrooms", "Bathrooms", 0.5, 5.5]]) {
      const original = document.getElementById(id);
      if (!original) continue;
      const wrapper = document.createElement("div");
      wrapper.className = "quote2-stepper";
      wrapper.innerHTML = `<button type="button" class="quote2-stepper-button" aria-label="Decrease ${label}" data-stepper-target="${id}" data-stepper-direction="-1">-</button><input id="${id}" name="${original.name}" class="quote2-stepper-input" type="number" min="1" max="${max}" step="${step}" value="${original.value}"><button type="button" class="quote2-stepper-button" aria-label="Increase ${label}" data-stepper-target="${id}" data-stepper-direction="1">+</button>`;
      original.replaceWith(wrapper);
    }
    profile.querySelector(".quote2-quantity-grid").hidden = true;
    const frequency = document.getElementById("quote2Frequency");
    frequency.querySelector('[value="every3weeks"]').textContent = "Every 3 weeks";
    frequency.querySelector('[value="biweekly"]').after(frequency.querySelector('[value="every3weeks"]'));
    frequency.closest("label").insertAdjacentHTML("afterend", '<label class="quote2-field"><span>Initial Cleaning Needed</span><select id="quote2InitialCleaning" class="quote2-input"><option value="no">No</option><option value="yes">Yes</option></select><small>If your home has not had professional cleaning in the past 2 months or requires extra attention, please select Yes.</small></label>');
    const addons = document.getElementById("quote2FixedServices");
    const allowed = ["ovenCleaning", "refrigeratorCleaning", "insideCabinets"];
    addons.querySelectorAll('input[name="services"]').forEach(input => {
      if (!allowed.includes(input.value)) input.closest("label").hidden = true;
    });
    addons.insertAdjacentHTML("beforeend", '<label class="quote2-addon-item"><input type="checkbox" name="services" value="dishwasherCleaning"><span class="quote2-addon-copy"><strong>Dishwasher Cleaning</strong><small data-service-price="dishwasherCleaning">+$30</small></span></label>');
    const fridge = document.getElementById("quote2RefrigeratorCondition");
    fridge.closest(".quote2-field-grid").hidden = true;
    fridge.closest(".quote2-field-grid").nextElementSibling.hidden = true;
    for (const key of ["SlidingDoorInterior", "SlidingDoorBothSides", "ChandelierCleaning"]) {
      document.getElementById("quote2" + key).closest(".quote2-quantity-item").hidden = true;
    }
    const windows = document.getElementById("quote2InteriorWindowsCleaning").closest(".quote2-quantity-item");
    document.getElementById("quote2WindowType").hidden = true;
    windows.querySelector("strong").textContent = "Interior windows without tracks*";
    windows.querySelector("small").hidden = false;
    const tracks = document.getElementById("quote2InteriorWindowsWithTracks").closest(".quote2-quantity-item");
    tracks.hidden = false;
    tracks.querySelector("strong").textContent = "Interior windows with tracks*";
    const quantities = windows.closest(".quote2-quantity-grid");
    quantities.nextElementSibling.nextElementSibling.hidden = true;
    const pets = document.getElementById("quote2HasPets");
    pets.innerHTML = '<option value="no">No</option><option value="yes">Yes</option>';
  };
})();
