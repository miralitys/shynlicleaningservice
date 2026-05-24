(() => {
  const body = document.body;
  const mobileToggle = document.querySelector("[data-mobile-toggle]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");
  const mobileMenuItems = document.querySelectorAll("[data-mobile-menu] a, [data-mobile-menu] button");
  const servicesTrigger = document.querySelector("[data-services-trigger]");
  const servicesMenu = document.querySelector("[data-services-menu]");
  const cityModal = document.querySelector("[data-city-modal]");
  const cityOpeners = document.querySelectorAll("[data-city-open]");
  const cityClosers = document.querySelectorAll("[data-city-close]");
  const faqButtons = document.querySelectorAll("[data-faq-button]");
  const zipForm = document.querySelector("[data-zip-form]");
  const leadForm = document.querySelector("[data-lead-form]");
  let dragTarget = null;

  function setMobileMenu(open) {
    if (!mobileMenu || !mobileToggle) return;
    mobileMenu.classList.toggle("is-open", open);
    mobileToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function setServicesMenu(open) {
    if (!servicesMenu || !servicesTrigger) return;
    servicesMenu.classList.toggle("is-open", open);
    servicesTrigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function setCityModal(open) {
    if (!cityModal) return;
    cityModal.classList.toggle("is-open", open);
    cityModal.setAttribute("aria-hidden", open ? "false" : "true");
    body.classList.toggle("city-modal-open", open);
    cityOpeners.forEach((button) => button.setAttribute("aria-expanded", open ? "true" : "false"));
  }

  if (mobileToggle) {
    mobileToggle.addEventListener("click", () => {
      const isOpen = mobileToggle.getAttribute("aria-expanded") !== "true";
      setMobileMenu(isOpen);
    });
  }

  mobileMenuItems.forEach((item) => {
    item.addEventListener("click", () => setMobileMenu(false));
  });

  if (servicesTrigger && servicesMenu) {
    servicesTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      setServicesMenu(!servicesMenu.classList.contains("is-open"));
    });
  }

  cityOpeners.forEach((button) => {
    button.addEventListener("click", () => setCityModal(true));
  });

  cityClosers.forEach((button) => {
    button.addEventListener("click", () => setCityModal(false));
  });

  if (cityModal) {
    cityModal.addEventListener("click", (event) => {
      if (event.target === cityModal) setCityModal(false);
    });
  }

  document.addEventListener("click", (event) => {
    if (servicesMenu && servicesTrigger && !servicesMenu.contains(event.target) && !servicesTrigger.contains(event.target)) {
      setServicesMenu(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMobileMenu(false);
      setServicesMenu(false);
      setCityModal(false);
    }
  });

  faqButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      if (!item) return;
      const isOpen = item.classList.toggle("active");
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  });

  const serviceZips = {
    "60101": { city: "Addison", url: "/addison" },
    "60502": { city: "Aurora", url: "/aurora" },
    "60503": { city: "Aurora", url: "/aurora" },
    "60504": { city: "Aurora", url: "/aurora" },
    "60505": { city: "Aurora", url: "/aurora" },
    "60506": { city: "Aurora", url: "/aurora" },
    "60507": { city: "Aurora", url: "/aurora" },
    "60568": { city: "Aurora", url: "/aurora" },
    "60572": { city: "Aurora", url: "/aurora" },
    "60440": { city: "Bolingbrook", url: "/bolingbrook" },
    "60490": { city: "Bolingbrook", url: "/bolingbrook" },
    "60515": { city: "Downers Grove", url: "/downersgrove" },
    "60516": { city: "Downers Grove", url: "/downersgrove" },
    "60540": { city: "Naperville", url: "/naperville" },
    "60563": { city: "Naperville", url: "/naperville" },
    "60564": { city: "Naperville", url: "/naperville" },
    "60565": { city: "Naperville", url: "/naperville" },
    "60567": { city: "Naperville", url: "/naperville" },
    "60544": { city: "Plainfield", url: "/plainfield" },
    "60585": { city: "Plainfield", url: "/plainfield" },
    "60586": { city: "Plainfield", url: "/plainfield" },
    "60554": { city: "Sugar Grove", url: "/sugargrove" },
    "60187": { city: "Wheaton", url: "/wheaton" },
    "60189": { city: "Wheaton", url: "/wheaton" },
  };

  if (zipForm) {
    const zipInput = zipForm.querySelector("input");
    const zipMessage = document.querySelector("[data-zip-message]");

    zipForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!zipInput || !zipMessage) return;
      const zip = zipInput.value.replace(/\D/g, "").slice(0, 5);
      zipInput.value = zip;

      if (zip.length !== 5) {
        zipMessage.textContent = "Please enter a valid 5-digit ZIP code.";
        return;
      }

      const match = serviceZips[zip];
      if (!match) {
        zipMessage.textContent = `Sorry, ZIP code ${zip} is currently outside our service area.`;
        return;
      }

      zipMessage.innerHTML = `Great news. We serve <a href="${match.url}">${match.city}</a> for ZIP ${zip}.`;
    });

    if (zipInput) {
      zipInput.addEventListener("input", () => {
        zipInput.value = zipInput.value.replace(/\D/g, "").slice(0, 5);
        if (zipInput.value.length === 5) {
          zipForm.dispatchEvent(new Event("submit", { cancelable: true }));
        }
      });
    }
  }

  function formatPhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.startsWith("1") && digits.length === 11) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (digits.length <= 3) return digits ? `(${digits}` : "";
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (leadForm) {
    const phoneInput = leadForm.querySelector('input[name="phone"]');
    if (phoneInput) {
      phoneInput.addEventListener("input", () => {
        phoneInput.value = formatPhone(phoneInput.value);
      });
    }

    leadForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(leadForm);
      const params = new URLSearchParams();
      const name = String(data.get("name") || "").trim();
      const phone = String(data.get("phone") || "").trim();
      if (name) params.set("name", name);
      if (phone) params.set("phone", `+1 ${phone}`);
      window.location.href = `/quote${params.toString() ? `?${params}` : ""}`;
    });
  }

  function initClientsSayMobileScroll() {
    const rails = Array.from(document.querySelectorAll(".clients-say-home__rail"));
    if (!rails.length || !window.matchMedia) return;

    const mobileQuery = window.matchMedia("(max-width: 639px)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const states = rails.map((rail, index) => ({
      rail,
      direction: index % 2 === 0 ? -1 : 1,
      pausedUntil: 0,
      initialized: false,
    }));
    let rafId = 0;
    let lastTime = 0;

    function pauseRail(state, duration = 1400) {
      state.pausedUntil = performance.now() + duration;
    }

    function setAutoScrollLeft(state, value) {
      state.rail.scrollLeft = value;
    }

    states.forEach((state) => {
      const pause = () => pauseRail(state);
      state.rail.addEventListener("pointerdown", pause, { passive: true });
      state.rail.addEventListener("touchstart", pause, { passive: true });
      state.rail.addEventListener("mousedown", pause, { passive: true });
    });

    function syncInitialPosition(state) {
      if (state.initialized) return;
      const maxScroll = state.rail.scrollWidth - state.rail.clientWidth;
      if (maxScroll <= 0) return;
      if (state.direction < 0) {
        setAutoScrollLeft(state, Math.min(maxScroll, Math.round(maxScroll * 0.18)));
      }
      state.initialized = true;
    }

    function tick(timestamp) {
      const enabled = mobileQuery.matches && !reducedMotionQuery.matches;
      const delta = Math.min(48, timestamp - (lastTime || timestamp));
      lastTime = timestamp;

      if (enabled) {
        states.forEach((state) => {
          syncInitialPosition(state);
          const maxScroll = state.rail.scrollWidth - state.rail.clientWidth;
          if (maxScroll <= 0 || timestamp < state.pausedUntil) return;

          const next = state.rail.scrollLeft + state.direction * 0.075 * delta;
          if (next <= 0) {
            setAutoScrollLeft(state, 0);
            state.direction = 1;
          } else if (next >= maxScroll) {
            setAutoScrollLeft(state, maxScroll);
            state.direction = -1;
          } else {
            setAutoScrollLeft(state, next);
          }
        });
      }

      rafId = window.requestAnimationFrame(tick);
    }

    function start() {
      if (rafId || !window.requestAnimationFrame) return;
      rafId = window.requestAnimationFrame(tick);
    }

    start();
  }

  initClientsSayMobileScroll();

  document.addEventListener("pointerdown", (event) => {
    const interactive = event.target.closest("a, button");
    if (!interactive) {
      dragTarget = null;
      return;
    }
    dragTarget = {
      node: interactive,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  });

  document.addEventListener("pointermove", (event) => {
    if (!dragTarget) return;
    if (Math.abs(event.clientX - dragTarget.x) > 5 || Math.abs(event.clientY - dragTarget.y) > 5) {
      dragTarget.moved = true;
    }
  });

  document.addEventListener("click", (event) => {
    if (!dragTarget) return;
    const target = event.target.closest("a, button");
    const shouldKeepSelection = dragTarget.moved && target && dragTarget.node.contains(target);
    dragTarget = null;
    if (!shouldKeepSelection) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
})();
