(function () {
  var body = document.body;
  var menu = document.querySelector("[data-mobile-menu]");
  var menuToggle = document.querySelector("[data-menu-toggle]");
  var menuClose = document.querySelector("[data-menu-close]");
  var cityModal = document.querySelector("[data-city-modal]");
  var cleanerModal = document.querySelector("[data-cleaner-modal]");

  function setExpanded(button, expanded) {
    if (button) button.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function openMenu() {
    if (!menu) return;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    body.classList.add("menu-open");
    setExpanded(menuToggle, true);
  }

  function closeMenu() {
    if (!menu) return;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    body.classList.remove("menu-open");
    setExpanded(menuToggle, false);
  }

  function openModal(modal, bodyClass) {
    if (!modal) return;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    body.classList.add(bodyClass);
  }

  function closeModal(modal, bodyClass) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    body.classList.remove(bodyClass);
  }

  if (menuToggle) menuToggle.addEventListener("click", openMenu);
  if (menuClose) menuClose.addEventListener("click", closeMenu);
  if (menu) {
    menu.addEventListener("click", function (event) {
      if (event.target && event.target.tagName === "A") closeMenu();
    });
  }

  document.querySelectorAll("[data-city-open]").forEach(function (button) {
    button.addEventListener("click", function () {
      openModal(cityModal, "city-modal-open");
    });
  });

  document.querySelectorAll("[data-city-close]").forEach(function (button) {
    button.addEventListener("click", function () {
      closeModal(cityModal, "city-modal-open");
    });
  });

  document.querySelectorAll("[data-cleaner-open]").forEach(function (button) {
    button.addEventListener("click", function () {
      openModal(cleanerModal, "cleaner-modal-open");
    });
  });

  document.querySelectorAll("[data-cleaner-close]").forEach(function (button) {
    button.addEventListener("click", function () {
      closeModal(cleanerModal, "cleaner-modal-open");
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    closeMenu();
    closeModal(cityModal, "city-modal-open");
    closeModal(cleanerModal, "cleaner-modal-open");
  });

  var mobileStickyCta = document.querySelector("[data-mobile-sticky-cta]");
  if (mobileStickyCta) {
    function updateMobileStickyCta() {
      mobileStickyCta.classList.toggle("is-visible", window.scrollY >= 840 && window.innerWidth <= 640);
    }

    updateMobileStickyCta();
    window.addEventListener("scroll", updateMobileStickyCta, { passive: true });
    window.addEventListener("resize", updateMobileStickyCta);
  }

  function normalizeDigits(value, limit) {
    return String(value || "").replace(/\D/g, "").slice(0, limit);
  }

  function formatPhone(value) {
    var digits = normalizeDigits(value, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  document.querySelectorAll("[data-phone-input]").forEach(function (input) {
    input.addEventListener("input", function () {
      input.value = formatPhone(input.value);
    });
  });

  var zipTargets = {
    "60502": [{ city: "Aurora", url: "/aurora" }],
    "60504": [{ city: "Aurora", url: "/aurora" }],
    "60517": [{ city: "Woodridge", url: "/woodridge" }],
    "60527": [{ city: "Burr Ridge", url: "/burrridge" }],
    "60532": [{ city: "Lisle", url: "/lisle" }],
    "60540": [{ city: "Naperville", url: "/naperville" }],
    "60563": [{ city: "Naperville", url: "/naperville" }],
    "60564": [{ city: "Naperville", url: "/naperville" }],
    "60565": [{ city: "Naperville", url: "/naperville" }],
    "60585": [{ city: "Plainfield", url: "/plainfield" }],
    "60586": [{ city: "Plainfield", url: "/plainfield" }],
    "60187": [{ city: "Wheaton", url: "/wheaton" }],
    "60189": [{ city: "Wheaton", url: "/wheaton" }]
  };

  var zipForm = document.querySelector("[data-zip-form]");
  if (zipForm) {
    var zipInput = zipForm.querySelector("input[name='zip']");
    var zipMessage = zipForm.querySelector("[data-zip-message]");

    function renderZipMessage(event) {
      if (event) event.preventDefault();
      var zip = normalizeDigits(zipInput && zipInput.value, 5);
      if (zipInput) zipInput.value = zip;
      if (!zipMessage) return;
      if (zip.length !== 5) {
        zipMessage.textContent = "Please enter a valid 5-digit ZIP code.";
        return;
      }
      var matches = zipTargets[zip] || [];
      if (!matches.length) {
        zipMessage.textContent = "Send us a quote request and we will confirm availability near you.";
        return;
      }
      zipMessage.innerHTML = "Great news. We serve <a href=\"" + matches[0].url + "\">" + matches[0].city + "</a> for ZIP " + zip + ".";
    }

    zipForm.addEventListener("submit", renderZipMessage);
    if (zipInput) {
      zipInput.addEventListener("input", function () {
        zipInput.value = normalizeDigits(zipInput.value, 5);
        if (zipInput.value.length === 5) renderZipMessage();
      });
    }
  }

  var cleanerForm = document.querySelector("[data-cleaner-form]");
  if (cleanerForm) {
    cleanerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = cleanerForm.querySelector("[data-cleaner-status]");
      var formData = new FormData(cleanerForm);
      var payload = {
        application: {
          fullName: String(formData.get("fullName") || "").trim(),
          phone: String(formData.get("phone") || "").trim(),
          email: String(formData.get("email") || "").trim(),
          zipCode: normalizeDigits(formData.get("zipCode"), 5),
          experience: String(formData.get("experience") || "").trim(),
          details: String(formData.get("details") || "").trim()
        },
        source: "About Us Copy Cleaner Application",
        pageUrl: window.location.href,
        submittedAt: new Date().toISOString()
      };

      if (!payload.application.fullName || !payload.application.phone || !payload.application.email || payload.application.zipCode.length !== 5 || !payload.application.experience) {
        if (status) status.textContent = "Please complete the required fields.";
        return;
      }

      if (status) status.textContent = "Submitting...";
      fetch("/api/cleaner-application/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          if (!response.ok) throw new Error("submit_failed");
          return response.json();
        })
        .then(function () {
          cleanerForm.reset();
          if (status) status.textContent = "Thanks! Your application has been submitted.";
        })
        .catch(function () {
          if (status) status.textContent = "We could not submit your application right now. Please try again.";
        });
    });
  }
})();
