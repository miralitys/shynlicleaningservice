(function () {
  "use strict";

  var QUOTE_SUBMISSION_ENDPOINT = "/api/quote/submit";

  function trimValue(value) {
    return String(value || "").trim();
  }

  function normalizePhoneDigits(value) {
    var digits = String(value || "").replace(/\D/g, "");
    if (digits.indexOf("1") === 0 && digits.length === 11) digits = digits.slice(1);
    return digits.slice(0, 10);
  }

  function formatPhoneForDisplay(value) {
    var digits = normalizePhoneDigits(value);
    if (digits.length < 4) return digits;
    if (digits.length < 7) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  function readSearchParams() {
    try {
      return new URLSearchParams(window.location.search || "");
    } catch (error) {
      return new URLSearchParams();
    }
  }

  function setMessage(form, text) {
    var message = form.querySelector("[data-adlp-message]");
    if (message) message.textContent = text || "";
  }

  function getServiceValue(form) {
    var field = form.querySelector('[name="service"]');
    return trimValue(field && field.value) || trimValue(form.getAttribute("data-default-service")) || "House Cleaning";
  }

  function getSubmittedName(form) {
    var nameInput = form.querySelector('input[name="name"]');
    var name = trimValue(nameInput && nameInput.value);
    if (name) return name;

    var firstName = trimValue(form.querySelector('input[name="firstName"]') && form.querySelector('input[name="firstName"]').value);
    var lastName = trimValue(form.querySelector('input[name="lastName"]') && form.querySelector('input[name="lastName"]').value);
    return [firstName, lastName].filter(Boolean).join(" ");
  }

  function normalizeServiceKey(value) {
    var normalized = trimValue(value).toLowerCase();
    if (normalized.indexOf("deep") !== -1) return "deep";
    if (normalized.indexOf("move") !== -1 || normalized.indexOf("moving") !== -1) return "moving";
    return "regular";
  }

  function collectAttribution() {
    var search = readSearchParams();
    var attribution = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid"].forEach(
      function (key) {
        var value = trimValue(search.get(key));
        if (value) attribution[key] = value;
      }
    );
    return attribution;
  }

  function pushTrackingEvent(form, name, phoneDigits, service) {
    if (!window.shynliTracking || typeof window.shynliTracking.pushEvent !== "function") return;
    try {
      window.shynliTracking.pushEvent(
        {
          event: "ad_landing_quote_start",
          form_id: form.id || "",
          form_name: form.getAttribute("data-form-name") || "Ads LP Quote Form",
          form_type: "lead-capture-widget",
          form_location: window.location.pathname,
          service_type: service,
        },
        {
          fullName: name,
          phone: "+1" + phoneDigits,
          country: "US",
        }
      );
    } catch (error) {}
  }

  function buildLeadCapturePayload(form, name, phoneDigits, service) {
    var formattedPhone = "+1 " + formatPhoneForDisplay(phoneDigits);
    var attribution = collectAttribution();
    var source = trimValue(form.getAttribute("data-source")) || "ads-lp-v3";
    var landingPage = window.location.href;
    var calculatorData = {
      requestType: "call_me",
      serviceType: normalizeServiceKey(service),
      frequency: "",
      rooms: "0",
      bathrooms: "0",
      squareMeters: "0",
      hasPets: "",
      basementCleaning: "no",
      services: [],
      quantityServices: {},
      additionalDetails: "Customer submitted a phone-only quote request on an ads landing page.",
      totalPrice: 0,
      selectedDate: "",
      selectedTime: "",
      formattedDateTime: "",
      address: "",
      fullAddress: "",
      addressLine2: "",
      city: "",
      state: "",
      zipCode: "",
    };
    var contactData = {
      fullName: name,
      phone: formattedPhone,
      email: "",
    };

    return Object.assign(
      {
        source: "Website Callback Request",
        sourcePagePath: window.location.pathname,
        returnPath: window.location.pathname,
        requestType: "call_me",
        consent: true,
        contact: contactData,
        contactData: contactData,
        quote: calculatorData,
        calculatorData: calculatorData,
        fullName: contactData.fullName,
        phone: contactData.phone,
        email: "",
        serviceType: calculatorData.serviceType,
        totalPrice: 0,
        selectedDate: "",
        selectedTime: "",
        fullAddress: "",
        landingPage: landingPage,
        attribution: Object.assign({}, attribution, { landing_page: landingPage, lead_source: source }),
        submittedAt: new Date().toISOString(),
      },
      attribution
    );
  }

  async function submitLeadCapture(form, name, phoneDigits, service) {
    if (typeof window.fetch !== "function") throw new Error("Lead capture unavailable");

    var response = await window.fetch(QUOTE_SUBMISSION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildLeadCapturePayload(form, name, phoneDigits, service)),
    });

    if (!response.ok) {
      throw new Error("Lead capture failed");
    }
  }

  function bindForm(form) {
    if (form.getAttribute("data-adlp-bound") === "true") return;
    form.setAttribute("data-adlp-bound", "true");

    var phoneInput = form.querySelector('input[name="phone"]');
    if (phoneInput) {
      phoneInput.addEventListener("input", function () {
        phoneInput.value = formatPhoneForDisplay(phoneInput.value);
      });
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      var nameInput = form.querySelector('input[name="name"], input[name="firstName"]');
      var phoneField = form.querySelector('input[name="phone"]');
      var name = getSubmittedName(form);
      var phoneDigits = normalizePhoneDigits(phoneField && phoneField.value);
      var service = getServiceValue(form);
      var submitButton = form.querySelector('button[type="submit"]');

      if (!name) {
        setMessage(form, "Please enter your first and last name.");
        if (nameInput) nameInput.focus();
        return;
      }

      if (phoneDigits.length !== 10) {
        setMessage(form, "Please enter a valid 10-digit phone number.");
        if (phoneField) phoneField.focus();
        return;
      }

      if (form.getAttribute("data-adlp-submitting") === "true") return;
      form.setAttribute("data-adlp-submitting", "true");
      if (submitButton) submitButton.disabled = true;

      setMessage(form, "Sending your request...");
      pushTrackingEvent(form, name, phoneDigits, service);

      try {
        await submitLeadCapture(form, name, phoneDigits, service);
        setMessage(form, "Thank you. Our manager will call you shortly.");
        form.setAttribute("data-adlp-submitted", "true");
      } catch (error) {
        form.removeAttribute("data-adlp-submitting");
        if (submitButton) submitButton.disabled = false;
        setMessage(form, "We could not send it right now. Please call (630) 812-7077.");
      }
    });
  }

  function getPageDefaultService() {
    var serviceField = document.querySelector('[data-adlp-quote-form] [name="service"]');
    var service = trimValue(serviceField && serviceField.value);
    if (service) return service;
    if (document.body.classList.contains("adlp-page--deep")) return "Deep Cleaning";
    if (document.body.classList.contains("adlp-page--move")) return "Move In / Move Out Cleaning";
    return "Regular Cleaning";
  }

  function getModalSource() {
    var sourceForm = document.querySelector("[data-adlp-quote-form][data-source]");
    var source = trimValue(sourceForm && sourceForm.getAttribute("data-source"));
    return source ? source + "-modal" : "ads-lp-v3-modal";
  }

  function createQuoteModal() {
    if (document.querySelector("[data-adlp-quote-modal]")) return document.querySelector("[data-adlp-quote-modal]");

    var modal = document.createElement("div");
    modal.className = "adlp-modal";
    modal.setAttribute("data-adlp-quote-modal", "");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="adlp-modal__backdrop" data-adlp-modal-close></div>' +
      '<div class="adlp-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="adlp-modal-title" aria-describedby="adlp-modal-copy">' +
      '<button class="adlp-modal__close" type="button" data-adlp-modal-close aria-label="Close quote form"><span aria-hidden="true">&times;</span></button>' +
      '<p class="adlp-kicker">Free quote</p>' +
      '<h2 id="adlp-modal-title">Get your free quote</h2>' +
      '<p id="adlp-modal-copy" class="adlp-modal__copy">Leave your details and our manager will call you shortly.</p>' +
      '<form class="adlp-form adlp-modal__form" data-adlp-quote-form data-form-name="Ads LP Quote Popup">' +
      '<label class="adlp-field"><span>Last name</span><input type="text" name="lastName" autocomplete="family-name" placeholder="Smith" required></label>' +
      '<label class="adlp-field"><span>First name</span><input type="text" name="firstName" autocomplete="given-name" placeholder="Jane" required></label>' +
      '<label class="adlp-field"><span>Phone</span><input type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="(630) 555-1234" required></label>' +
      '<input type="hidden" name="service">' +
      '<button class="adlp-button" type="submit">Get Free Quote</button>' +
      '<p class="adlp-form__message" data-adlp-message aria-live="polite"></p>' +
      '<p class="adlp-form__disclaimer">By submitting, you agree to our <a href="/terms-of-service">Terms of Service</a>.</p>' +
      "</form>" +
      "</div>";

    var form = modal.querySelector("form");
    var service = modal.querySelector('input[name="service"]');
    if (form) {
      form.setAttribute("data-source", getModalSource());
      form.setAttribute("data-default-service", getPageDefaultService());
    }
    if (service) service.value = getPageDefaultService();

    document.body.appendChild(modal);
    return modal;
  }

  function bindQuoteModal(modal) {
    if (!modal || modal.getAttribute("data-adlp-modal-bound") === "true") return;
    modal.setAttribute("data-adlp-modal-bound", "true");

    function openModal(event) {
      if (event) event.preventDefault();
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("adlp-modal-open");
      var firstInput = modal.querySelector("input");
      window.setTimeout(function () {
        if (firstInput) firstInput.focus();
      }, 80);
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("adlp-modal-open");
    }

    Array.prototype.slice.call(document.querySelectorAll('a[href="#get-quote"]')).forEach(function (trigger) {
      if (trimValue(trigger.textContent).toLowerCase().indexOf("get free quote") === -1) return;
      trigger.addEventListener("click", openModal);
      trigger.setAttribute("aria-haspopup", "dialog");
    });

    Array.prototype.slice.call(modal.querySelectorAll("[data-adlp-modal-close]")).forEach(function (button) {
      button.addEventListener("click", closeModal);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal.classList.contains("is-open")) {
        closeModal();
      }
    });
  }

  function init() {
    var modal = createQuoteModal();
    Array.prototype.slice.call(document.querySelectorAll("[data-adlp-quote-form]")).forEach(bindForm);
    bindQuoteModal(modal);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
