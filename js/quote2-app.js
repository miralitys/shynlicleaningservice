(function () {
  "use strict";

  const QUOTE_PAGE_PATH = "/quote";
  const QUOTE_SUBMISSION_ENDPOINT = "/api/quote/submit";
  const STRIPE_CHECKOUT_ENDPOINT = "/api/stripe/checkout-session";
  const GOOGLE_PLACES_API_KEY =
    (window.__shynliRuntimeConfig && window.__shynliRuntimeConfig.googlePlacesApiKey) || "";

  const PRICING = {
    regular: {
      basePrices: {
        weekly: 101,
        biweekly: 111,
        monthly: 121,
      },
      roomPrice: 12,
      firstBathroomPrice: 22,
      bathroomStepPrice: 12,
      bathroomStepSize: 0.5,
      squareFeetStepPrice: 20,
      basementCleaningFee: 45,
      includedServices: [],
      defaultSelectedServices: [],
    },
    deep: {
      basePrice: 84.5,
      roomPrice: 22.5,
      firstBathroomPrice: 45,
      bathroomStepPrice: 22.5,
      bathroomStepSize: 0.5,
      squareFeetStepPrice: 20,
      basementCleaningFee: 65,
      includedServices: ["baseboardCleaning", "doorsCleaning"],
      defaultSelectedServices: ["baseboardCleaning", "doorsCleaning"],
    },
    moving: {
      basePrice: 129.5,
      roomPrice: 22.5,
      firstBathroomPrice: 45,
      bathroomStepPrice: 22.5,
      bathroomStepSize: 0.5,
      squareFeetStepPrice: 20,
      basementCleaningFee: 65,
      includedServices: ["baseboardCleaning", "doorsCleaning"],
      defaultSelectedServices: [
        "ovenCleaning",
        "refrigeratorCleaning",
        "baseboardCleaning",
        "doorsCleaning",
      ],
    },
    squareFeetIncluded: 1200,
    squareFeetStep: 500,
    squareFeetStepPrice: 20,
    services: {
      ovenCleaning: 45,
      refrigeratorCleaning: 45,
      baseboardCleaning: 22,
      doorsCleaning: 22,
      insideCabinets: 45,
      rangeHood: 22,
      furniturePolishing: 20,
    },
    quantityServices: {
      interiorWindowsCleaning: 6,
      blindsCleaning: 8,
      bedLinenChange: 8,
    },
  };

  const SERVICE_LABELS = {
    regular: "Regular Cleaning",
    deep: "Deep Cleaning",
    moving: "Move In/Move Out Clean",
  };

  const TRACKING_SERVICE_LABELS = {
    regular: "Regular Cleaning",
    deep: "Deep Cleaning",
    moving: "Move In/Out",
  };

  const FREQUENCY_LABELS = {
    weekly: "Weekly",
    biweekly: "Biweekly",
    monthly: "Monthly",
  };

  const TRACKING_ADDON_LABELS = {
    ovenCleaning: "Inside oven",
    refrigeratorCleaning: "Inside fridge",
    baseboardCleaning: "Wet baseboards",
    doorsCleaning: "Doors",
    insideCabinets: "Inside cabinets",
    rangeHood: "Range hood",
    furniturePolishing: "Wood furniture polishing",
    interiorWindowsCleaning: "Interior windows",
    blindsCleaning: "Blinds",
    bedLinenChange: "Bed linen change",
  };

  const state = {
    latestCheckoutData: null,
    profileConfirmed: false,
    addonsConfirmed: false,
    addressConfirmed: false,
    profileAutoOpened: false,
    lastAppleCalendarUrl: "",
    autocompleteRequested: false,
    autocompleteMounted: false,
  };

  const elements = {
    globalNotice: document.getElementById("quote2GlobalNotice"),
    successCard: document.getElementById("quote2SuccessCard"),
    successService: document.getElementById("quote2SuccessService"),
    successSchedule: document.getElementById("quote2SuccessSchedule"),
    successAddress: document.getElementById("quote2SuccessAddress"),
    successTotal: document.getElementById("quote2SuccessTotal"),
    successNote: document.getElementById("quote2SuccessNote"),
    payNowButton: document.getElementById("quote2PayNowButton"),
    googleCalendarButton: document.getElementById("quote2GoogleCalendarButton"),
    appleCalendarButton: document.getElementById("quote2AppleCalendarButton"),
    form: document.getElementById("quote2Form"),
    formError: document.getElementById("quote2FormError"),
    submitButton: document.getElementById("quote2SubmitButton"),
    fullName: document.getElementById("quote2FullName"),
    phone: document.getElementById("quote2Phone"),
    serviceType: document.getElementById("quote2ServiceType"),
    serviceButtons: Array.from(document.querySelectorAll("#quote2ServiceButtons [data-service]")),
    frequencyField: document.getElementById("quote2FrequencyField"),
    frequency: document.getElementById("quote2Frequency"),
    rooms: document.getElementById("quote2Rooms"),
    bathrooms: document.getElementById("quote2Bathrooms"),
    squareFeet: document.getElementById("quote2SquareFeet"),
    basementCleaning: document.getElementById("quote2BasementCleaning"),
    hasPets: document.getElementById("quote2HasPets"),
    services: Array.from(document.querySelectorAll('input[name="services"]')),
    interiorWindowsCleaning: document.getElementById("quote2InteriorWindowsCleaning"),
    blindsCleaning: document.getElementById("quote2BlindsCleaning"),
    bedLinenChange: document.getElementById("quote2BedLinenChange"),
    stepperButtons: Array.from(document.querySelectorAll("[data-stepper-target]")),
    addressInput: document.getElementById("quote2AddressInput"),
    addressLine2: document.getElementById("quote2AddressLine2"),
    city: document.getElementById("quote2City"),
    state: document.getElementById("quote2State"),
    zipCode: document.getElementById("quote2ZipCode"),
    selectedDate: document.getElementById("quote2SelectedDate"),
    selectedDateDisplay: document.getElementById("quote2SelectedDateDisplay"),
    selectedTime: document.getElementById("quote2SelectedTime"),
    timeSlots: Array.from(document.querySelectorAll("#quote2TimeSlots [data-time]")),
    additionalDetails: document.getElementById("quote2AdditionalDetails"),
    consentCheckbox: document.getElementById("quote2ConsentCheckbox"),
    continueToAddons: document.getElementById("quote2ContinueToAddons"),
    continueToAddress: document.getElementById("quote2ContinueToAddress"),
    continueToNotes: document.getElementById("quote2ContinueToNotes"),
    stickyEstimate: document.getElementById("quote2StickyEstimate"),
    estimateTargets: Array.from(document.querySelectorAll('[data-quote2-estimate="true"]')),
    stepCards: {
      contact: document.querySelector('[data-step-card="contact"]'),
      profile: document.querySelector('[data-step-card="profile"]'),
      addons: document.querySelector('[data-step-card="addons"]'),
      address: document.querySelector('[data-step-card="address"]'),
      notes: document.querySelector('[data-step-card="notes"]'),
    },
  };

  function normalizeUsPhoneDigits(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 11 && digits.startsWith("1")) return digits;
    return "";
  }

  function isCompleteUsPhone(value) {
    const normalizedDigits = normalizeUsPhoneDigits(value);
    if (!normalizedDigits) return false;
    return /^\+1 \(\d{3}\) \d{3}-\d{4}$/.test(String(value || "").trim());
  }

  function formatPhoneProgressive(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (!digits.startsWith("1")) digits = `1${digits}`;
    digits = digits.slice(0, 11);

    let formatted = `+${digits.slice(0, 1)}`;
    if (digits.length > 1) formatted += ` (${digits.slice(1, 4)}`;
    if (digits.length >= 4) formatted += `) ${digits.slice(4, 7)}`;
    if (digits.length >= 7) formatted += `-${digits.slice(7, 11)}`;
    return formatted;
  }

  function formatCurrency(value) {
    const amount = Number(value || 0);
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  function getSelectedOptionLabel(selectElement) {
    if (!selectElement || !selectElement.options) return "";
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    return selectedOption ? String(selectedOption.textContent || "").trim() : "";
  }

  function getSelectedTimeLabel() {
    const activeButton = elements.timeSlots.find(function (button) {
      return button.classList.contains("is-active");
    });
    if (activeButton) {
      return String(activeButton.textContent || "").trim();
    }
    return "";
  }

  function parseBathroomCount(value, fallback) {
    const rawValue = String(value == null ? "" : value).trim().replace(",", ".");
    if (!rawValue) return fallback;
    if (rawValue.endsWith("+")) {
      const base = Number.parseFloat(rawValue.slice(0, -1));
      return Number.isFinite(base) ? base + 0.5 : fallback;
    }
    const parsed = Number.parseFloat(rawValue);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getSelectedServiceType() {
    return elements.serviceType.value || "regular";
  }

  function getSelectedFrequency() {
    return elements.frequency.value || "biweekly";
  }

  function getRegularBasePrice(frequency) {
    return PRICING.regular.basePrices[frequency] || PRICING.regular.basePrices.biweekly;
  }

  function calculateBedroomPrice(serviceType, rooms) {
    const typePricing = PRICING[serviceType] || PRICING.regular;
    return rooms * (typePricing.roomPrice || 0);
  }

  function calculateBathroomPrice(typePricing, bathrooms) {
    if (!bathrooms || bathrooms <= 0) return 0;
    if (bathrooms <= 1) return typePricing.firstBathroomPrice || 0;
    return (
      (typePricing.firstBathroomPrice || 0) +
      ((bathrooms - 1) / (typePricing.bathroomStepSize || 0.5)) * (typePricing.bathroomStepPrice || 0)
    );
  }

  function calculateSquareFeetPrice(typePricing, squareFeet) {
    const numericValue = Number(squareFeet || 0);
    const stepPrice =
      typePricing.squareFeetStepPrice !== undefined
        ? typePricing.squareFeetStepPrice
        : PRICING.squareFeetStepPrice;

    if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
    if (numericValue <= PRICING.squareFeetIncluded) return 0;

    const extraSquareFeet = numericValue - PRICING.squareFeetIncluded;
    const extraSteps = Math.ceil(extraSquareFeet / PRICING.squareFeetStep);
    return extraSteps * stepPrice;
  }

  function getBasementCleaningFee(serviceType) {
    const typePricing = PRICING[serviceType] || PRICING.regular;
    return typePricing.basementCleaningFee || 0;
  }

  function calculateCleaningTime(rooms, bathrooms, serviceType) {
    let baseMin = 2.0;
    let baseMax = 2.5;

    if (serviceType === "regular") {
      const extraTime = Math.max(0, rooms - 1) * 0.25 + Math.max(0, bathrooms - 1) * 0.75;
      baseMin += extraTime;
      baseMax += extraTime;
    } else if (serviceType === "deep") {
      const extraTime = Math.max(0, rooms - 1) * 0.25 + Math.max(0, bathrooms - 1) * 0.75;
      baseMin = (2.0 + extraTime) * 2;
      baseMax = (2.5 + extraTime) * 2;
    } else {
      const extraTime = Math.max(0, rooms - 1) * 0.25 + Math.max(0, bathrooms - 1) * 0.75;
      baseMin = (2.0 + extraTime) * 1.5;
      baseMax = (2.5 + extraTime) * 1.5;
    }

    baseMin = Math.ceil(baseMin * 4) / 4;
    baseMax = Math.ceil(baseMax * 4) / 4;

    function formatHour(hours) {
      const wholeHours = Math.floor(hours);
      const minutes = Math.round((hours - wholeHours) * 60);
      if (minutes === 0) return `${wholeHours}h`;
      return `${wholeHours}h ${String(minutes)}m`;
    }

    return baseMax - baseMin <= 0.5
      ? formatHour(baseMax)
      : `${formatHour(baseMin)} - ${formatHour(baseMax)}`;
  }

  function getQuantityServices() {
    return {
      interiorWindowsCleaning: Math.max(0, Number.parseInt(elements.interiorWindowsCleaning.value || "0", 10) || 0),
      blindsCleaning: Math.max(0, Number.parseInt(elements.blindsCleaning.value || "0", 10) || 0),
      bedLinenChange: Math.max(0, Number.parseInt(elements.bedLinenChange.value || "0", 10) || 0),
    };
  }

  function setFieldPriceLabel(serviceKey, label) {
    const target = document.querySelector(`[data-service-price="${serviceKey}"]`);
    if (target) target.textContent = label;
  }

  function syncIncludedServiceStates(serviceType) {
    const typePricing = PRICING[serviceType] || PRICING.regular;
    const includedServices = typePricing.includedServices || [];
    const defaultSelectedServices = typePricing.defaultSelectedServices || [];

    elements.services.forEach(function (checkbox) {
      const serviceKey = checkbox.value;
      const isIncluded = includedServices.indexOf(serviceKey) >= 0;
      const isDefaultSelected = defaultSelectedServices.indexOf(serviceKey) >= 0;
      const price = PRICING.services[serviceKey] || 0;

      checkbox.disabled = isIncluded;
      if (isIncluded || (isDefaultSelected && checkbox.checked)) {
        setFieldPriceLabel(serviceKey, "Included");
      } else if (isDefaultSelected && !checkbox.checked) {
        setFieldPriceLabel(serviceKey, "Excluded");
      } else {
        setFieldPriceLabel(serviceKey, `+${formatCurrency(price)}`);
      }
    });
  }

  function applyIncludedServiceDefaults(serviceType) {
    const typePricing = PRICING[serviceType] || PRICING.regular;
    const includedServices = typePricing.includedServices || [];
    const defaultSelectedServices = typePricing.defaultSelectedServices || [];

    elements.services.forEach(function (checkbox) {
      checkbox.checked = false;
      checkbox.disabled = false;
      if (defaultSelectedServices.indexOf(checkbox.value) >= 0) {
        checkbox.checked = true;
      }
      if (includedServices.indexOf(checkbox.value) >= 0) {
        checkbox.checked = true;
        checkbox.disabled = true;
      }
    });

    syncIncludedServiceStates(serviceType);
  }

  function getSelectedServices() {
    return elements.services.filter(function (checkbox) {
      return checkbox.checked;
    }).map(function (checkbox) {
      return checkbox.value;
    });
  }

  function buildTrackingAddonSummary(serviceType, selectedServices, quantityServices) {
    const typePricing = PRICING[serviceType] || PRICING.regular;
    const includedServices = typePricing.includedServices || [];
    const summary = [];

    selectedServices
      .filter(function (serviceKey) {
        return includedServices.indexOf(serviceKey) === -1;
      })
      .forEach(function (serviceKey) {
        summary.push(TRACKING_ADDON_LABELS[serviceKey] || serviceKey);
      });

    Object.keys(quantityServices || {}).forEach(function (serviceKey) {
      const quantity = Number(quantityServices[serviceKey] || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      summary.push(`${TRACKING_ADDON_LABELS[serviceKey] || serviceKey} x${quantity}`);
    });

    return summary.join(", ");
  }

  function calculateCurrentPricing() {
    const serviceType = getSelectedServiceType();
    const typePricing = PRICING[serviceType] || PRICING.regular;
    const frequency = getSelectedFrequency();
    const rooms = Number.parseInt(elements.rooms.value || "1", 10) || 1;
    const bathrooms = parseBathroomCount(elements.bathrooms.value, 1);
    const squareFeet = Number.parseInt(elements.squareFeet.value || "0", 10) || 0;
    const basementCleaning = elements.basementCleaning.value === "yes";
    const selectedServices = getSelectedServices();
    const quantityServices = getQuantityServices();
    const includedServices = typePricing.includedServices || [];

    let total = serviceType === "regular" ? getRegularBasePrice(frequency) : typePricing.basePrice;
    total += calculateBedroomPrice(serviceType, rooms);
    total += calculateBathroomPrice(typePricing, bathrooms);
    total += calculateSquareFeetPrice(typePricing, squareFeet);

    if (basementCleaning) {
      total += getBasementCleaningFee(serviceType);
    }

    selectedServices
      .filter(function (serviceKey) {
        return includedServices.indexOf(serviceKey) === -1;
      })
      .forEach(function (serviceKey) {
        total += PRICING.services[serviceKey] || 0;
      });

    Object.keys(quantityServices).forEach(function (serviceKey) {
      total += quantityServices[serviceKey] * (PRICING.quantityServices[serviceKey] || 0);
    });

    return {
      serviceType: serviceType,
      frequency: frequency,
      rooms: rooms,
      bathrooms: bathrooms,
      squareFeet: squareFeet,
      basementCleaning: basementCleaning,
      selectedServices: selectedServices,
      quantityServices: quantityServices,
      totalPrice: Number(total.toFixed(2)),
      durationLabel: calculateCleaningTime(rooms, bathrooms, serviceType),
    };
  }

  function getScheduleLabel(dateValue, timeValue) {
    if (!dateValue || !timeValue) return "Not selected yet";
    const dateObject = new Date(`${dateValue}T${timeValue}:00`);
    if (Number.isNaN(dateObject.getTime())) return "Not selected yet";
    return dateObject.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function buildFormattedDateTime(dateValue, timeValue) {
    if (!dateValue || !timeValue) return "";
    const dateObject = new Date(`${dateValue}T${timeValue}:00`);
    if (Number.isNaN(dateObject.getTime())) return "";
    return dateObject.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function formatSelectedDateLabel(value) {
    const normalized = String(value || "").trim();
    if (!normalized) return "Select date";

    const parts = normalized.split("-");
    if (parts.length !== 3) return normalized;

    const year = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10);
    const day = Number.parseInt(parts[2], 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return normalized;
    }

    const dateObject = new Date(year, month - 1, day, 12);
    if (Number.isNaN(dateObject.getTime())) return normalized;

    return dateObject.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function syncSelectedDateDisplay() {
    if (!elements.selectedDateDisplay) return;
    const value = String(elements.selectedDate.value || "").trim();
    elements.selectedDateDisplay.textContent = formatSelectedDateLabel(value);
    elements.selectedDateDisplay.classList.toggle("is-placeholder", !value);
  }

  function getFullAddress() {
    return String(elements.addressInput.value || "").trim();
  }

  function normalizeAddressSearchValue(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function addressHasComponent(address, component) {
    const trimmedComponent = String(component || "").trim();
    if (!trimmedComponent) return false;

    const normalizedAddress = normalizeAddressSearchValue(address);
    if (!normalizedAddress) return false;

    if (/^[A-Za-z]{2}$/.test(trimmedComponent)) {
      const statePattern = new RegExp(`(^|\\W)${trimmedComponent.toLowerCase()}($|\\W)`, "i");
      return statePattern.test(normalizedAddress);
    }

    return normalizedAddress.includes(normalizeAddressSearchValue(trimmedComponent));
  }

  function getCompleteAddress() {
    const fullAddress = getFullAddress();
    const parts = [fullAddress];
    const optionalParts = [
      String(elements.addressLine2.value || "").trim(),
      String(elements.city.value || "").trim(),
      String(elements.state.value || "").trim(),
      String(elements.zipCode.value || "").trim(),
    ];

    optionalParts.forEach(function (part) {
      if (!part) return;
      if (addressHasComponent(fullAddress, part)) return;
      parts.push(part);
    });

    const uniqueParts = [];
    parts.filter(Boolean).forEach(function (part) {
      if (uniqueParts.some(function (existingPart) { return addressHasComponent(existingPart, part) || addressHasComponent(part, existingPart); })) {
        return;
      }
      uniqueParts.push(part);
    });
    return uniqueParts.join(", ");
  }

  function setNotice(message, tone) {
    if (!elements.globalNotice) return;
    elements.globalNotice.innerHTML = "";
    if (!message) return;
    const notice = document.createElement("div");
    notice.className = `quote2-alert quote2-alert-${tone || "info"}`;
    notice.textContent = message;
    elements.globalNotice.appendChild(notice);
  }

  function setFormError(message) {
    if (!elements.formError) return;
    if (!message) {
      elements.formError.hidden = true;
      elements.formError.textContent = "";
      return;
    }
    elements.formError.hidden = false;
    elements.formError.textContent = message;
  }

  function isContactStepComplete() {
    return (
      elements.fullName.value.trim().length > 0 &&
      isCompleteUsPhone(elements.phone.value)
    );
  }

  function isAddressStepComplete() {
    return Boolean(getFullAddress() && elements.selectedDate.value && elements.selectedTime.value);
  }

  function updateEstimateTargets() {
    const pricing = calculateCurrentPricing();
    elements.estimateTargets.forEach(function (target) {
      target.textContent = formatCurrency(pricing.totalPrice);
    });
    elements.submitButton.textContent = `Send request — ${formatCurrency(pricing.totalPrice)}`;
    elements.continueToNotes.disabled = !isAddressStepComplete();
  }

  function scrollToCard(card) {
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function refreshStepVisibility(options) {
    const settings = options || {};
    const contactReady = isContactStepComplete();

    if (!contactReady) {
      state.profileConfirmed = false;
      state.addonsConfirmed = false;
      state.addressConfirmed = false;
      state.profileAutoOpened = false;
    }

    const profileVisible = contactReady;
    const addonsVisible = profileVisible && state.profileConfirmed;
    const addressVisible = addonsVisible && state.addonsConfirmed;
    const notesVisible = addressVisible && state.addressConfirmed;

    const profileWasHidden = elements.stepCards.profile.hidden;
    elements.stepCards.profile.hidden = !profileVisible;
    elements.stepCards.addons.hidden = !addonsVisible;
    elements.stepCards.address.hidden = !addressVisible;
    elements.stepCards.notes.hidden = !notesVisible;
    if (elements.stickyEstimate) {
      elements.stickyEstimate.hidden = !profileVisible;
    }

    if (profileVisible && profileWasHidden && !settings.skipScroll && !state.profileAutoOpened) {
      state.profileAutoOpened = true;
      scrollToCard(elements.stepCards.profile);
    }
  }

  function setSelectedTime(timeValue) {
    elements.selectedTime.value = timeValue || "";
    elements.timeSlots.forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-time") === timeValue);
    });
    updateEstimateTargets();
  }

  function setServiceType(serviceType) {
    const nextValue = serviceType || "regular";
    elements.serviceType.value = nextValue;
    elements.serviceButtons.forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-service") === nextValue);
    });
    elements.frequencyField.style.display = nextValue === "regular" ? "" : "none";
    if (nextValue !== "regular") {
      elements.frequency.value = "biweekly";
    }
    applyIncludedServiceDefaults(nextValue);
    updateEstimateTargets();
  }

  function initServiceButtons() {
    elements.serviceButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setServiceType(button.getAttribute("data-service"));
      });
    });
  }

  function initTimeSlots() {
    elements.timeSlots.forEach(function (button) {
      button.addEventListener("click", function () {
        setSelectedTime(button.getAttribute("data-time"));
      });
    });
  }

  function initSteppers() {
    elements.stepperButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        const targetId = button.getAttribute("data-stepper-target");
        const target = document.getElementById(targetId);
        const direction = Number.parseInt(button.getAttribute("data-stepper-direction") || "0", 10);
        if (!target) return;
        const nextValue = Math.max(0, (Number.parseInt(target.value || "0", 10) || 0) + direction);
        target.value = String(nextValue);
        updateEstimateTargets();
      });
    });

    [elements.interiorWindowsCleaning, elements.blindsCleaning, elements.bedLinenChange].forEach(function (input) {
      input.addEventListener("input", function () {
        const nextValue = Math.max(0, Number.parseInt(input.value || "0", 10) || 0);
        input.value = String(nextValue);
        updateEstimateTargets();
      });
    });
  }

  function applyPrefilledContactData() {
    const params = new URLSearchParams(window.location.search);
    const queryName = String(params.get("name") || "").trim();
    const queryPhone = String(params.get("phone") || "").trim();
    const storedName = String(sessionStorage.getItem("homeWidgetName") || "").trim();
    const storedPhone = String(sessionStorage.getItem("homeWidgetPhone") || "").trim();

    const prefilledName = queryName || storedName;
    const prefilledPhone = queryPhone || storedPhone;

    if (prefilledName && !elements.fullName.value.trim()) {
      elements.fullName.value = prefilledName;
    }

    if (prefilledPhone && !elements.phone.value.trim()) {
      elements.phone.value = formatPhoneProgressive(prefilledPhone);
    }
  }

  function initPhoneInput() {
    elements.phone.addEventListener("input", function () {
      elements.phone.value = formatPhoneProgressive(elements.phone.value);
      refreshStepVisibility();
    });
  }

  function initContactInputs() {
    [elements.fullName].forEach(function (field) {
      field.addEventListener("input", function () {
        refreshStepVisibility();
      });
    });
  }

  function initGeneralFieldListeners() {
    [
      elements.frequency,
      elements.rooms,
      elements.bathrooms,
      elements.squareFeet,
      elements.basementCleaning,
      elements.hasPets,
      elements.addressInput,
      elements.addressLine2,
      elements.city,
      elements.state,
      elements.zipCode,
      elements.selectedDate,
      elements.additionalDetails,
    ].forEach(function (field) {
      field.addEventListener("input", updateEstimateTargets);
      field.addEventListener("change", updateEstimateTargets);
    });

    elements.services.forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        syncIncludedServiceStates(getSelectedServiceType());
        updateEstimateTargets();
      });
    });
  }

  function initDateInput() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    elements.selectedDate.min = now.toISOString().split("T")[0];
    elements.selectedDate.addEventListener("input", syncSelectedDateDisplay);
    elements.selectedDate.addEventListener("change", syncSelectedDateDisplay);

    const dateShell = elements.selectedDate.closest(".quote2-date-shell");
    if (dateShell) {
      dateShell.addEventListener("click", function (event) {
        if (event.target === elements.selectedDate) return;
        if (typeof elements.selectedDate.showPicker === "function") {
          try {
            elements.selectedDate.showPicker();
            return;
          } catch (error) {
            // Fall through to focus/click for browsers that reject showPicker here.
          }
        }
        elements.selectedDate.focus({ preventScroll: true });
        elements.selectedDate.click();
      });
    }

    syncSelectedDateDisplay();
  }

  function handlePlaceSelect(place) {
    if (!place) return;

    if (place.formatted_address) {
      elements.addressInput.value = place.formatted_address;
    }

    let city = "";
    let stateValue = "";
    let zipCode = "";

    if (Array.isArray(place.address_components)) {
      place.address_components.forEach(function (component) {
        if (!Array.isArray(component.types)) return;
        if (component.types.indexOf("locality") >= 0) city = component.long_name || city;
        if (component.types.indexOf("administrative_area_level_1") >= 0) stateValue = component.short_name || stateValue;
        if (component.types.indexOf("postal_code") >= 0) zipCode = component.long_name || zipCode;
      });
    }

    if (city) elements.city.value = city;
    if (stateValue) elements.state.value = stateValue;
    if (zipCode) elements.zipCode.value = zipCode;

    updateEstimateTargets();
  }

  function initAddressFallback() {
    elements.addressInput.addEventListener("input", updateEstimateTargets);
  }

  function mountAutocomplete() {
    if (state.autocompleteMounted) return;

    if (typeof window.google === "undefined" || !window.google.maps || !window.google.maps.places) {
      initAddressFallback();
      return;
    }

    try {
      const autocomplete = new window.google.maps.places.Autocomplete(elements.addressInput, {
        types: ["address"],
        componentRestrictions: { country: "us" },
        fields: ["address_components", "formatted_address", "geometry"],
      });

      autocomplete.addListener("place_changed", function () {
        handlePlaceSelect(autocomplete.getPlace());
      });
      state.autocompleteMounted = true;
    } catch (error) {
      initAddressFallback();
    }
  }

  function ensureAutocompleteReady() {
    if (!GOOGLE_PLACES_API_KEY) {
      initAddressFallback();
      return;
    }

    if (state.autocompleteMounted) return;

    if (typeof window.google !== "undefined" && window.google.maps && window.google.maps.places) {
      mountAutocomplete();
      return;
    }

    if (state.autocompleteRequested) return;

    state.autocompleteRequested = true;

    window.__quote2GooglePlacesReady = function () {
      mountAutocomplete();
    };

    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(GOOGLE_PLACES_API_KEY) +
      "&libraries=places&loading=async&callback=__quote2GooglePlacesReady";
    script.async = true;
    script.defer = true;
    script.onerror = initAddressFallback;
    document.head.appendChild(script);
  }

  function initAutocomplete() {
    if (!GOOGLE_PLACES_API_KEY) {
      initAddressFallback();
      return;
    }

    const requestAutocomplete = function () {
      ensureAutocompleteReady();
    };

    elements.addressInput.addEventListener("focus", requestAutocomplete, { once: true });
    elements.addressInput.addEventListener("pointerdown", requestAutocomplete, { once: true });
    elements.addressInput.addEventListener("touchstart", requestAutocomplete, {
      once: true,
      passive: true,
    });
  }

  function openAddonsStep() {
    state.profileConfirmed = true;
    refreshStepVisibility({ skipScroll: true });
    scrollToCard(elements.stepCards.addons);
  }

  function openAddressStep() {
    state.addonsConfirmed = true;
    refreshStepVisibility({ skipScroll: true });
    ensureAutocompleteReady();
    scrollToCard(elements.stepCards.address);
  }

  function openNotesStep() {
    if (!isAddressStepComplete()) {
      setFormError("Please complete the address, date, and preferred arrival time first.");
      return;
    }
    setFormError("");
    state.addressConfirmed = true;
    refreshStepVisibility({ skipScroll: true });
    scrollToCard(elements.stepCards.notes);
  }

  function validateForm() {
    const fullName = elements.fullName.value.trim();
    const phoneDigits = normalizeUsPhoneDigits(elements.phone.value);
    const phoneComplete = isCompleteUsPhone(elements.phone.value);

    if (!fullName) {
      setFormError("Please enter the customer's name.");
      return false;
    }

    if (!phoneDigits || !phoneComplete) {
      setFormError("Please enter a valid US phone number.");
      return false;
    }

    if (!isAddressStepComplete()) {
      setFormError("Please complete the service address, date, and preferred arrival time.");
      return false;
    }

    if (!elements.consentCheckbox.checked) {
      setFormError("Please confirm consent so we can continue with the request.");
      return false;
    }

    setFormError("");
    return true;
  }

  function buildQuotePayload() {
    const pricing = calculateCurrentPricing();
    const fullName = elements.fullName.value.trim();
    const fullAddress = getFullAddress();
    const completeAddress = getCompleteAddress() || fullAddress;
    const contactData = {
      fullName: fullName,
      phone: normalizeUsPhoneDigits(elements.phone.value),
      email: "",
    };

    const calculatorData = {
      rooms: elements.rooms.value,
      bathrooms: elements.bathrooms.value,
      squareMeters: elements.squareFeet.value,
      hasPets: elements.hasPets.value,
      basementCleaning: elements.basementCleaning.value,
      serviceType: pricing.serviceType,
      frequency: pricing.frequency,
      services: pricing.selectedServices,
      quantityServices: pricing.quantityServices,
      additionalDetails: elements.additionalDetails.value.trim(),
      totalPrice: pricing.totalPrice,
      selectedDate: elements.selectedDate.value,
      selectedTime: elements.selectedTime.value,
      formattedDateTime: buildFormattedDateTime(elements.selectedDate.value, elements.selectedTime.value),
      address: completeAddress,
      fullAddress: fullAddress,
      addressLine2: elements.addressLine2.value.trim(),
      city: elements.city.value.trim(),
      state: elements.state.value.trim(),
      zipCode: elements.zipCode.value.trim(),
    };

    return {
      source: "quote",
      sourcePagePath: QUOTE_PAGE_PATH,
      returnPath: QUOTE_PAGE_PATH,
      consent: true,
      contact: contactData,
      contactData: contactData,
      quote: calculatorData,
      calculatorData: calculatorData,
      fullName: contactData.fullName,
      phone: contactData.phone,
      email: "",
      serviceType: calculatorData.serviceType,
      totalPrice: calculatorData.totalPrice,
      selectedDate: calculatorData.selectedDate,
      selectedTime: calculatorData.selectedTime,
      fullAddress: calculatorData.fullAddress,
      submittedAt: new Date().toISOString(),
    };
  }

  async function trackQuoteLeadSubmission(payload, totalValue) {
    if (!window.shynliTracking || typeof window.shynliTracking.pushEvent !== "function") {
      return null;
    }

    const serviceType = payload && payload.quote && payload.quote.serviceType ? payload.quote.serviceType : "regular";
    const frequency =
      serviceType === "regular"
        ? FREQUENCY_LABELS[payload.quote.frequency] || "Biweekly"
        : "One-time";

    return window.shynliTracking.pushEvent(
      {
        event: "lead_quote_submit",
        value: Number(totalValue) || 50,
        currency: "USD",
        form_id: "quote2-form",
        form_name: "Quote Form (Multi-step)",
        form_type: "multi-step-quote",
        service_type: TRACKING_SERVICE_LABELS[serviceType] || TRACKING_SERVICE_LABELS.regular,
        frequency: frequency,
        bedrooms: Number.parseInt(payload.quote.rooms || "0", 10) || null,
        bathrooms: parseBathroomCount(payload.quote.bathrooms, null),
        square_footage: getSelectedOptionLabel(elements.squareFeet),
        basement: payload.quote.basementCleaning === "yes",
        pets: getSelectedOptionLabel(elements.hasPets),
        addons: buildTrackingAddonSummary(serviceType, payload.quote.services, payload.quote.quantityServices),
        preferred_date: payload.quote.selectedDate || "",
        preferred_time: getSelectedTimeLabel(),
        apartment: payload.quote.addressLine2 || "",
        service_city: payload.quote.city || "",
        service_zip: payload.quote.zipCode || "",
        sms_consent: Boolean(elements.consentCheckbox.checked),
      },
      {
        fullName: payload.contactData.fullName,
        phone: payload.contactData.phone,
        street: payload.quote.fullAddress || "",
        city: payload.quote.city || "",
        region: payload.quote.state || "IL",
        postalCode: payload.quote.zipCode || "",
        country: "US",
      }
    );
  }

  async function submitQuoteToBackend(payload) {
    const response = await fetch(QUOTE_SUBMISSION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseData = {};
    if (responseText) {
      try {
        responseData = JSON.parse(responseText);
      } catch (error) {
        responseData = { message: responseText };
      }
    }

    if (!response.ok || responseData.success === false) {
      throw new Error(responseData.error || responseData.message || "Unable to submit the quote right now.");
    }

    return responseData;
  }

  function buildGoogleCalendarUrl(calculatorData, serviceLabel) {
    if (!calculatorData.selectedDate || !calculatorData.selectedTime) return "#";
    const startDate = new Date(`${calculatorData.selectedDate}T${calculatorData.selectedTime}:00`);
    const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

    function formatDate(date) {
      return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    }

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: serviceLabel,
      dates: `${formatDate(startDate)}/${formatDate(endDate)}`,
      details: `${serviceLabel}\nEstimate: ${formatCurrency(calculatorData.totalPrice || 0)}`,
      location: calculatorData.address || calculatorData.fullAddress || "",
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function buildIcsContent(calculatorData, serviceLabel) {
    if (!calculatorData.selectedDate || !calculatorData.selectedTime) return "";
    const startDate = new Date(`${calculatorData.selectedDate}T${calculatorData.selectedTime}:00`);
    const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

    function formatIcsDate(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${year}${month}${day}T${hours}${minutes}00`;
    }

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Shynli Cleaning//Quote Request//EN",
      "BEGIN:VEVENT",
      `UID:${Date.now()}@shynlicleaningservice.com`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(startDate)}`,
      `DTEND:${formatIcsDate(endDate)}`,
      `SUMMARY:${serviceLabel}`,
      `DESCRIPTION:Estimate ${formatCurrency(calculatorData.totalPrice || 0)}`,
      `LOCATION:${calculatorData.address || calculatorData.fullAddress || ""}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
  }

  function buildAppleCalendarBlobUrl(calculatorData, serviceLabel) {
    if (state.lastAppleCalendarUrl) {
      URL.revokeObjectURL(state.lastAppleCalendarUrl);
      state.lastAppleCalendarUrl = "";
    }
    const icsContent = buildIcsContent(calculatorData, serviceLabel);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    state.lastAppleCalendarUrl = URL.createObjectURL(blob);
    return state.lastAppleCalendarUrl;
  }

  function updateSuccessState() {
    if (!state.latestCheckoutData) return;
    const calculatorData = state.latestCheckoutData.calculatorData || {};
    const serviceLabel = SERVICE_LABELS[calculatorData.serviceType] || "Cleaning Service";
    const scheduleLabel = getScheduleLabel(calculatorData.selectedDate, calculatorData.selectedTime);
    const addressLabel = calculatorData.address || calculatorData.fullAddress || "Pending";

    elements.successService.textContent = serviceLabel;
    elements.successSchedule.textContent = scheduleLabel;
    elements.successAddress.textContent = addressLabel;
    elements.successTotal.textContent = formatCurrency(calculatorData.totalPrice || 0);
    elements.successNote.textContent =
      "You can pay now or after your cleaning is complete.";

    elements.payNowButton.disabled = !state.latestCheckoutData.quoteToken;
    elements.googleCalendarButton.href = buildGoogleCalendarUrl(calculatorData, serviceLabel);
    elements.appleCalendarButton.href = buildAppleCalendarBlobUrl(calculatorData, serviceLabel);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validateForm()) return;

    const originalLabel = elements.submitButton.textContent;
    elements.submitButton.disabled = true;
    elements.submitButton.textContent = "Sending...";

    try {
      const payload = buildQuotePayload();
      const submissionResult = await submitQuoteToBackend(payload);
      const canonicalTotal =
        submissionResult &&
        submissionResult.pricing &&
        typeof submissionResult.pricing.totalPrice === "number"
          ? submissionResult.pricing.totalPrice
          : payload.quote.totalPrice;

      try {
        await trackQuoteLeadSubmission(payload, canonicalTotal);
      } catch (trackingError) {}

      state.latestCheckoutData = {
        contactData: payload.contactData,
        calculatorData: Object.assign({}, payload.quote, {
          totalPrice: canonicalTotal,
        }),
        quoteToken: (submissionResult && submissionResult.quoteToken) || "",
      };

      updateEstimateTargets();
      updateSuccessState();
      elements.successCard.hidden = false;
      elements.form.hidden = true;
      if (elements.stickyEstimate) {
        elements.stickyEstimate.hidden = true;
      }
      setNotice("Quote request submitted successfully.", "success");
      elements.successCard.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setFormError(error && error.message ? error.message : "We could not send the request right now.");
    } finally {
      elements.submitButton.disabled = false;
      elements.submitButton.textContent = originalLabel;
    }
  }

  async function startStripeCheckout() {
    if (!state.latestCheckoutData || !state.latestCheckoutData.quoteToken) {
      setNotice("Submit the quote first so we can start checkout.", "warning");
      return;
    }

    const originalLabel = elements.payNowButton.textContent;
    elements.payNowButton.disabled = true;
    elements.payNowButton.textContent = "Redirecting...";

    try {
      const response = await fetch(STRIPE_CHECKOUT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quoteToken: state.latestCheckoutData.quoteToken,
          customerEmail: "",
          returnPath: QUOTE_PAGE_PATH,
        }),
      });

      const result = await response.json().catch(function () {
        return {};
      });

      if (!response.ok || !result.url) {
        throw new Error(result.error || "Unable to start checkout.");
      }

      window.location.href = result.url;
    } catch (error) {
      setNotice(error && error.message ? error.message : "Could not start checkout.", "error");
      elements.payNowButton.disabled = false;
      elements.payNowButton.textContent = originalLabel;
    }
  }

  function showPaymentStatusFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const paymentState = String(params.get("payment") || "").trim().toLowerCase();
    if (paymentState === "success") {
      setNotice("Payment completed successfully. Thank you.", "success");
    } else if (paymentState === "cancelled") {
      setNotice("Payment was cancelled. Your quote request is still on file.", "warning");
    }
  }

  function initContinueButtons() {
    elements.continueToAddons.addEventListener("click", openAddonsStep);
    elements.continueToAddress.addEventListener("click", openAddressStep);
    elements.continueToNotes.addEventListener("click", openNotesStep);
  }

  function init() {
    if (!elements.form) return;

    initDateInput();
    initServiceButtons();
    initTimeSlots();
    initSteppers();
    initContactInputs();
    initPhoneInput();
    initGeneralFieldListeners();
    initContinueButtons();
    initAutocomplete();
    applyPrefilledContactData();
    setServiceType("regular");
    updateEstimateTargets();
    refreshStepVisibility({ skipScroll: true });
    showPaymentStatusFromQuery();

    elements.form.addEventListener("submit", handleSubmit);
    elements.payNowButton.addEventListener("click", startStripeCheckout);
  }

  init();
})();
