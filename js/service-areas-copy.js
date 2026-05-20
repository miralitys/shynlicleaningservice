(() => {
  const zipMap = Object.freeze({
    "60101": [{ city: "Addison", url: "/addison" }],
    "60103": [{ city: "Bartlett", url: "/bartlett" }],
    "60107": [{ city: "Streamwood", url: "/streamwood" }],
    "60126": [{ city: "Elmhurst", url: "/elmhurst" }],
    "60134": [{ city: "Geneva", url: "/geneva" }],
    "60137": [{ city: "Glen Ellyn", url: "/glenellyn" }],
    "60143": [{ city: "Itasca", url: "/itasca" }],
    "60148": [{ city: "Lombard", url: "/lombard" }],
    "60174": [{ city: "St. Charles", url: "/stcharles" }],
    "60175": [{ city: "St. Charles", url: "/stcharles" }],
    "60181": [{ city: "Villa Park", url: "/villapark" }],
    "60184": [{ city: "Wayne", url: "/wayne" }],
    "60185": [{ city: "West Chicago", url: "/westchicago" }],
    "60187": [{ city: "Wheaton", url: "/wheaton" }],
    "60188": [{ city: "Carol Stream", url: "/carolstream" }],
    "60189": [{ city: "Wheaton", url: "/wheaton" }],
    "60190": [{ city: "Winfield", url: "/winfield" }],
    "60191": [{ city: "Wood Dale", url: "/wooddale" }],
    "60439": [{ city: "Lemont", url: "/lemont" }],
    "60440": [{ city: "Bolingbrook", url: "/bolingbrook" }],
    "60441": [{ city: "Homer Glen", url: "/homerglen" }, { city: "Lockport", url: "/lockport" }],
    "60446": [{ city: "Lockport", url: "/lockport" }, { city: "Romeoville", url: "/romeoville" }],
    "60490": [{ city: "Bolingbrook", url: "/bolingbrook" }],
    "60491": [{ city: "Homer Glen", url: "/homerglen" }, { city: "Lockport", url: "/lockport" }],
    "60502": [{ city: "Aurora", url: "/aurora" }],
    "60503": [{ city: "Aurora", url: "/aurora" }],
    "60504": [{ city: "Aurora", url: "/aurora" }],
    "60505": [{ city: "Aurora", url: "/aurora" }],
    "60506": [{ city: "Aurora", url: "/aurora" }],
    "60510": [{ city: "Batavia", url: "/batavia" }],
    "60512": [{ city: "Bristol", url: "/bristol" }],
    "60514": [{ city: "Clarendon Hills", url: "/clarendonhills" }],
    "60515": [{ city: "Downers Grove", url: "/downersgrove" }],
    "60516": [{ city: "Downers Grove", url: "/downersgrove" }],
    "60517": [{ city: "Downers Grove", url: "/downersgrove" }, { city: "Woodridge", url: "/woodridge" }],
    "60521": [{ city: "Hinsdale", url: "/hinsdale" }, { city: "Oak Brook", url: "/oakbrook" }],
    "60523": [{ city: "Hinsdale", url: "/hinsdale" }, { city: "Oak Brook", url: "/oakbrook" }],
    "60527": [{ city: "Burr Ridge", url: "/burrridge" }, { city: "Willowbrook", url: "/willowbrook" }],
    "60532": [{ city: "Lisle", url: "/lisle" }],
    "60538": [{ city: "Montgomery", url: "/montgomery" }],
    "60540": [{ city: "Naperville", url: "/naperville" }],
    "60542": [{ city: "North Aurora", url: "/northaurora" }],
    "60543": [{ city: "Oswego", url: "/oswego" }],
    "60544": [{ city: "Plainfield", url: "/plainfield" }],
    "60554": [{ city: "Sugar Grove", url: "/sugargrove" }],
    "60555": [{ city: "Warrenville", url: "/warrenville" }],
    "60559": [{ city: "Westmont", url: "/westmont" }],
    "60560": [{ city: "Yorkville", url: "/yorkville" }],
    "60561": [{ city: "Darien", url: "/darien" }],
    "60563": [{ city: "Naperville", url: "/naperville" }, { city: "Warrenville", url: "/warrenville" }],
    "60564": [{ city: "Naperville", url: "/naperville" }],
    "60565": [{ city: "Naperville", url: "/naperville" }],
    "60585": [{ city: "Plainfield", url: "/plainfield" }],
    "60586": [{ city: "Plainfield", url: "/plainfield" }]
  });

  const menuButton = document.querySelector("[data-menu-open]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");

  const closeMobileMenu = () => {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute("aria-expanded", "false");
    mobileMenu.classList.remove("is-open");
    document.body.classList.remove("sa-menu-open");
  };

  if (menuButton && mobileMenu) {
    menuButton.addEventListener("click", () => {
      const isOpen = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!isOpen));
      mobileMenu.classList.toggle("is-open", !isOpen);
      document.body.classList.toggle("sa-menu-open", !isOpen);
    });

    mobileMenu.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLAnchorElement) closeMobileMenu();
    });
  }

  const cityModal = document.querySelector("[data-city-modal]");
  const cityOpenButtons = Array.from(document.querySelectorAll("[data-city-open]"));
  const cityCloseButtons = Array.from(document.querySelectorAll("[data-city-close]"));
  let lastCityTrigger = null;

  const setCityButtonState = (isOpen) => {
    cityOpenButtons.forEach((button) => button.setAttribute("aria-expanded", String(isOpen)));
  };

  const openCityModal = (trigger) => {
    if (!cityModal) return;
    lastCityTrigger = trigger || document.activeElement;
    closeMobileMenu();
    cityModal.classList.add("is-open");
    cityModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("sa-city-open");
    setCityButtonState(true);
    const closeButton = cityModal.querySelector("[data-city-close]");
    if (closeButton && typeof closeButton.focus === "function") {
      closeButton.focus({ preventScroll: true });
    }
  };

  const closeCityModal = () => {
    if (!cityModal) return;
    cityModal.classList.remove("is-open");
    cityModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sa-city-open");
    setCityButtonState(false);
    if (lastCityTrigger && typeof lastCityTrigger.focus === "function") {
      lastCityTrigger.focus({ preventScroll: true });
    }
  };

  cityOpenButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openCityModal(button);
    });
  });

  cityCloseButtons.forEach((button) => {
    button.addEventListener("click", closeCityModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCityModal();
      closeMobileMenu();
    }
  });

  const zipForm = document.querySelector("[data-zip-form]");
  const zipInput = document.querySelector("[data-zip-input]");
  const zipMessage = document.querySelector("[data-zip-message]");

  const normalizeZip = (value) => String(value || "").replace(/\D/g, "").slice(0, 5);

  const renderZipLinks = (targets) =>
    targets.map((target) => `<a href="${target.url}">${target.city}</a>`).join(" or ");

  if (zipForm && zipInput && zipMessage) {
    zipInput.addEventListener("input", () => {
      zipInput.value = normalizeZip(zipInput.value);
      zipMessage.textContent = "";
    });

    zipForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const zip = normalizeZip(zipInput.value);

      if (zip.length !== 5) {
        zipMessage.textContent = "Please enter a 5-digit ZIP code.";
        zipInput.focus();
        return;
      }

      const targets = zipMap[zip] || [];

      if (!targets.length) {
        zipMessage.innerHTML = `We may still help nearby. <a href="/quote">Request a quote</a> and we will confirm service for ${zip}.`;
        return;
      }

      if (targets.length === 1) {
        zipMessage.textContent = `Taking you to ${targets[0].city}...`;
        window.location.href = targets[0].url;
        return;
      }

      zipMessage.innerHTML = `This ZIP covers ${renderZipLinks(targets)}.`;
    });
  }

  const phoneInput = document.querySelector("[data-phone-input]");

  const formatPhone = (value) => {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits ? `(${digits}` : "";
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  if (phoneInput) {
    phoneInput.addEventListener("input", () => {
      phoneInput.value = formatPhone(phoneInput.value);
    });
  }

  const homeForm = document.querySelector("[data-home-form]");

  if (homeForm) {
    homeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(homeForm);
      const params = new URLSearchParams();
      params.set("source", "service-areas");
      params.set("name", String(formData.get("name") || ""));
      params.set("phone", String(formData.get("phone") || ""));
      window.location.href = `/quote?${params.toString()}`;
    });
  }
})();
