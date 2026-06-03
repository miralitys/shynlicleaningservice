(function () {
  "use strict";

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

  function buildRedirectUrl(form, name, phoneDigits, service) {
    var search = readSearchParams();
    var params = new URLSearchParams();
    var formattedPhone = "+1 " + formatPhoneForDisplay(phoneDigits);

    params.set("source", trimValue(form.getAttribute("data-source")) || "ads-lp-v3");
    params.set("landing", window.location.pathname);
    params.set("service", service);
    params.set("name", name);
    params.set("phone", formattedPhone);

    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid"].forEach(
      function (key) {
        var value = trimValue(search.get(key));
        if (value) params.set(key, value);
      }
    );

    try {
      sessionStorage.setItem("homeWidgetName", name);
      sessionStorage.setItem("homeWidgetPhone", formattedPhone);
    } catch (error) {}

    return "/quote-no-price?" + params.toString();
  }

  function bindForm(form) {
    var phoneInput = form.querySelector('input[name="phone"]');
    if (phoneInput) {
      phoneInput.addEventListener("input", function () {
        phoneInput.value = formatPhoneForDisplay(phoneInput.value);
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var nameInput = form.querySelector('input[name="name"]');
      var phoneField = form.querySelector('input[name="phone"]');
      var name = trimValue(nameInput && nameInput.value);
      var phoneDigits = normalizePhoneDigits(phoneField && phoneField.value);
      var service = getServiceValue(form);

      if (!name) {
        setMessage(form, "Please enter your name.");
        if (nameInput) nameInput.focus();
        return;
      }

      if (phoneDigits.length !== 10) {
        setMessage(form, "Please enter a valid 10-digit phone number.");
        if (phoneField) phoneField.focus();
        return;
      }

      setMessage(form, "Opening your quote...");
      pushTrackingEvent(form, name, phoneDigits, service);

      window.setTimeout(function () {
        window.location.href = buildRedirectUrl(form, name, phoneDigits, service);
      }, 160);
    });
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-adlp-quote-form]")).forEach(bindForm);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
