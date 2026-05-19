(function () {
  const body = document.body;

  const servicesToggle = document.querySelector("[data-services-toggle]");
  const servicesMenu = document.querySelector("[data-services-menu]");
  if (servicesToggle && servicesMenu) {
    servicesToggle.addEventListener("click", function () {
      const open = servicesMenu.classList.toggle("is-open");
      servicesToggle.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", function (event) {
      if (!servicesMenu.contains(event.target) && !servicesToggle.contains(event.target)) {
        servicesMenu.classList.remove("is-open");
        servicesToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  const cityModal = document.querySelector("[data-city-modal]");
  const cityOpenButtons = document.querySelectorAll("[data-city-open]");
  const cityCloseButtons = document.querySelectorAll("[data-city-close]");

  function openCityModal() {
    if (!cityModal) return;
    cityModal.classList.add("is-open");
    cityModal.setAttribute("aria-hidden", "false");
    body.classList.add("is-modal-open");
  }

  function closeCityModal() {
    if (!cityModal) return;
    cityModal.classList.remove("is-open");
    cityModal.setAttribute("aria-hidden", "true");
    body.classList.remove("is-modal-open");
  }

  cityOpenButtons.forEach(function (button) {
    button.addEventListener("click", openCityModal);
  });

  cityCloseButtons.forEach(function (button) {
    button.addEventListener("click", closeCityModal);
  });

  const mobileDrawer = document.querySelector("[data-mobile-drawer]");
  const mobileOpen = document.querySelector("[data-mobile-open]");
  const mobileClose = document.querySelector("[data-mobile-close]");

  function openMobileMenu() {
    if (!mobileDrawer || !mobileOpen) return;
    mobileDrawer.classList.add("is-open");
    mobileDrawer.setAttribute("aria-hidden", "false");
    mobileOpen.setAttribute("aria-expanded", "true");
    body.classList.add("is-modal-open");
  }

  function closeMobileMenu() {
    if (!mobileDrawer || !mobileOpen) return;
    mobileDrawer.classList.remove("is-open");
    mobileDrawer.setAttribute("aria-hidden", "true");
    mobileOpen.setAttribute("aria-expanded", "false");
    body.classList.remove("is-modal-open");
  }

  if (mobileOpen) mobileOpen.addEventListener("click", openMobileMenu);
  if (mobileClose) mobileClose.addEventListener("click", closeMobileMenu);
  if (mobileDrawer) {
    mobileDrawer.addEventListener("click", function (event) {
      if (event.target === mobileDrawer) closeMobileMenu();
    });
  }

  document.querySelectorAll(".faq-item button").forEach(function (button) {
    button.addEventListener("click", function () {
      const item = button.closest(".faq-item");
      if (!item) return;
      const open = item.classList.toggle("is-open");
      button.setAttribute("aria-expanded", String(open));
    });
  });

  const zipForm = document.querySelector("[data-zip-form]");
  const zipMessage = document.querySelector("[data-zip-message]");
  const zipCities = {
    "60540": "Naperville",
    "60563": "Naperville",
    "60564": "Naperville",
    "60565": "Naperville",
    "60502": "Aurora",
    "60503": "Aurora",
    "60504": "Aurora",
    "60505": "Aurora",
    "60506": "Aurora",
    "60542": "North Aurora",
    "60554": "Sugar Grove",
    "60538": "Montgomery",
    "60543": "Oswego",
    "60560": "Yorkville",
    "60510": "Batavia",
    "60555": "Warrenville"
  };

  if (zipForm && zipMessage) {
    zipForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const input = zipForm.querySelector("input[name='zip']");
      const zip = input ? input.value.trim() : "";
      const city = zipCities[zip];
      zipMessage.classList.toggle("is-good", Boolean(city));
      zipMessage.textContent = city
        ? "Great news! We serve " + city + " (ZIP " + zip + "). Ready to book your cleaning service?"
        : "Send us a quote request and we will confirm availability near you.";
    });
  }

  const stickyActions = document.querySelector(".mobile-sticky-actions");
  function syncStickyActions() {
    if (!stickyActions) return;
    stickyActions.classList.toggle("is-visible", window.innerWidth <= 960 && window.scrollY > window.innerHeight * 0.65);
  }

  syncStickyActions();
  window.addEventListener("scroll", syncStickyActions, { passive: true });
  window.addEventListener("resize", syncStickyActions);

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    closeCityModal();
    closeMobileMenu();
  });
})();
