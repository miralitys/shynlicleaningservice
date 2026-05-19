(() => {
  if (window.__shynliCommercialCityModalInit) return;
  window.__shynliCommercialCityModalInit = true;

  const menuButton = document.querySelector(".mobile-menu-button");
  const mobileMenu = document.querySelector(".mobile-menu");
  const cityModal = document.querySelector("[data-city-modal]");
  const cityOpenButtons = Array.from(document.querySelectorAll("[data-city-open]"));
  const cityCloseButtons = Array.from(document.querySelectorAll("[data-city-close]"));
  let lastCityTrigger = null;

  if (!cityModal || cityOpenButtons.length === 0) return;

  const setCityTriggerState = (isOpen) => {
    cityOpenButtons.forEach((button) => {
      button.setAttribute("aria-expanded", String(isOpen));
    });
  };

  const closeMobileMenu = () => {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute("aria-expanded", "false");
    mobileMenu.classList.remove("is-open");
    document.body.classList.remove("menu-open");
  };

  const openCityModal = (trigger) => {
    lastCityTrigger = trigger || document.activeElement;
    closeMobileMenu();
    cityModal.classList.add("is-open");
    cityModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("city-modal-open");
    setCityTriggerState(true);
    const closeButton = cityModal.querySelector("[data-city-close]");
    if (closeButton) closeButton.focus({ preventScroll: true });
  };

  const closeCityModal = () => {
    cityModal.classList.remove("is-open");
    cityModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("city-modal-open");
    setCityTriggerState(false);
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
    if (event.key === "Escape") closeCityModal();
  });
})();
