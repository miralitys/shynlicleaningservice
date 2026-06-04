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
    return trimValue(nameInput && nameInput.value);
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

  function enhancePhoneInput(input) {
    if (!input) return;
    input.type = "tel";
    input.setAttribute("autocomplete", "tel");
    input.setAttribute("inputmode", "tel");
    input.setAttribute("enterkeyhint", "done");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("spellcheck", "false");
  }

  function enhancePhoneFields(root) {
    Array.prototype.slice.call((root || document).querySelectorAll('input[name="phone"]')).forEach(enhancePhoneInput);
  }

  function buildLeadCapturePayload(form, name, phoneDigits, service) {
    var formattedPhone = "+1 " + formatPhoneForDisplay(phoneDigits);
    var submittedName = name || "Website Lead " + phoneDigits.slice(-4);
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
      fullName: submittedName,
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

  function createLeadSuccessModal() {
    if (document.querySelector("[data-adlp-success-modal]")) return document.querySelector("[data-adlp-success-modal]");

    var modal = document.createElement("div");
    modal.className = "adlp-modal adlp-success-modal";
    modal.setAttribute("data-adlp-success-modal", "");
    modal.setAttribute("aria-hidden", "true");
    modal.setAttribute("aria-live", "polite");
    modal.innerHTML =
      '<div class="adlp-modal__backdrop" data-adlp-success-close></div>' +
      '<div class="adlp-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="adlp-success-title" aria-describedby="adlp-success-copy">' +
      '<button class="adlp-modal__close" type="button" data-adlp-success-close aria-label="Close thank you message"><span aria-hidden="true">&times;</span></button>' +
      '<p class="adlp-success-modal__eyebrow">Request received</p>' +
      '<h2 id="adlp-success-title">Thank you, we received your request.</h2>' +
      '<p id="adlp-success-copy" class="adlp-modal__copy">Our manager will contact you shortly.</p>' +
      '<button class="adlp-button adlp-success-modal__button" type="button" data-adlp-success-close>Close</button>' +
      "</div>";

    document.body.appendChild(modal);
    return modal;
  }

  function closeModalElement(modal) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  function openLeadSuccessModal() {
    var quoteModal = document.querySelector("[data-adlp-quote-modal]");
    var successModal = createLeadSuccessModal();
    closeModalElement(quoteModal);
    successModal.classList.add("is-open");
    successModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("adlp-modal-open");

    var closeButton = successModal.querySelector("[data-adlp-success-close]");
    window.setTimeout(function () {
      if (closeButton) closeButton.focus();
    }, 80);
  }

  function bindLeadSuccessModal(modal) {
    if (!modal || modal.getAttribute("data-adlp-success-bound") === "true") return;
    modal.setAttribute("data-adlp-success-bound", "true");

    function closeSuccessModal() {
      closeModalElement(modal);
      var quoteModalOpen = document.querySelector("[data-adlp-quote-modal].is-open");
      if (!quoteModalOpen) document.body.classList.remove("adlp-modal-open");
    }

    Array.prototype.slice.call(modal.querySelectorAll("[data-adlp-success-close]")).forEach(function (button) {
      button.addEventListener("click", closeSuccessModal);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal.classList.contains("is-open")) {
        closeSuccessModal();
      }
    });
  }

  function bindForm(form) {
    if (form.getAttribute("data-adlp-bound") === "true") return;
    form.setAttribute("data-adlp-bound", "true");

    var phoneInput = form.querySelector('input[name="phone"]');
    if (phoneInput) {
      enhancePhoneInput(phoneInput);
      phoneInput.addEventListener("input", function () {
        phoneInput.value = formatPhoneForDisplay(phoneInput.value);
      });
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      var phoneField = form.querySelector('input[name="phone"]');
      var name = getSubmittedName(form);
      var phoneDigits = normalizePhoneDigits(phoneField && phoneField.value);
      var service = getServiceValue(form);
      var submitButton = form.querySelector('button[type="submit"]');

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
        openLeadSuccessModal();
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
      '<label class="adlp-field"><span>Full Name</span><input type="text" name="name" autocomplete="name" placeholder="Full Name"></label>' +
      '<label class="adlp-field"><span>Phone</span><input type="tel" name="phone" autocomplete="tel" inputmode="tel" enterkeyhint="done" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="(630) 555-1234" required></label>' +
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

    Array.prototype.slice.call(document.querySelectorAll('a[href="#get-quote"], [data-adlp-modal-trigger]')).forEach(function (trigger) {
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
    var successModal = createLeadSuccessModal();
    enhancePhoneFields(document);
    Array.prototype.slice.call(document.querySelectorAll("[data-adlp-quote-form]")).forEach(bindForm);
    bindQuoteModal(modal);
    bindLeadSuccessModal(successModal);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
