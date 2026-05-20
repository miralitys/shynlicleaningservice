(() => {
  const menuButton = document.querySelector(".mobile-menu-button");
  const mobileMenu = document.querySelector(".mobile-menu");

  const closeMobileMenu = () => {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute("aria-expanded", "false");
    mobileMenu.classList.remove("is-open");
    document.body.classList.remove("menu-open");
  };

  if (menuButton && mobileMenu) {
    menuButton.addEventListener("click", () => {
      const isOpen = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!isOpen));
      mobileMenu.classList.toggle("is-open", !isOpen);
      document.body.classList.toggle("menu-open", !isOpen);
    });

    mobileMenu.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLAnchorElement || target instanceof HTMLButtonElement) {
        closeMobileMenu();
      }
    });
  }

  const faqItems = Array.from(document.querySelectorAll(".faq-item"));
  faqItems.forEach((item) => {
    const button = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");
    if (!button || !answer) return;

    button.addEventListener("click", () => {
      const category = item.closest(".faq-category");
      const isOpen = item.classList.contains("is-open");
      if (category) {
        category.querySelectorAll(".faq-item.is-open").forEach((openItem) => {
          if (openItem !== item) {
            openItem.classList.remove("is-open");
            const openButton = openItem.querySelector(".faq-question");
            const openAnswer = openItem.querySelector(".faq-answer");
            if (openButton) openButton.setAttribute("aria-expanded", "false");
            if (openAnswer) openAnswer.hidden = true;
          }
        });
      }

      item.classList.toggle("is-open", !isOpen);
      button.setAttribute("aria-expanded", String(!isOpen));
      answer.hidden = isOpen;
    });
  });

  const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));
  if ("IntersectionObserver" in window && revealItems.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16 }
    );
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const cleanerModal = document.querySelector("[data-cleaner-modal]");
  const cleanerOpeners = Array.from(document.querySelectorAll("[data-cleaner-open]"));
  const cleanerClosers = Array.from(document.querySelectorAll("[data-cleaner-close]"));
  const cleanerForm = document.querySelector("[data-cleaner-form]");
  const cleanerMessage = document.querySelector("[data-cleaner-message]");
  let lastCleanerTrigger = null;

  const setCleanerMessage = (message, isError = false) => {
    if (!cleanerMessage) return;
    cleanerMessage.textContent = message;
    cleanerMessage.classList.toggle("is-error", isError);
  };

  const openCleanerModal = (trigger) => {
    if (!cleanerModal) return;
    lastCleanerTrigger = trigger || document.activeElement;
    closeMobileMenu();
    cleanerModal.classList.add("is-open");
    cleanerModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("cleaner-modal-open");
    const firstField = cleanerModal.querySelector("input, select, textarea, button");
    if (firstField && typeof firstField.focus === "function") {
      firstField.focus({ preventScroll: true });
    }
  };

  const closeCleanerModal = () => {
    if (!cleanerModal) return;
    cleanerModal.classList.remove("is-open");
    cleanerModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cleaner-modal-open");
    if (lastCleanerTrigger && typeof lastCleanerTrigger.focus === "function") {
      lastCleanerTrigger.focus({ preventScroll: true });
    }
  };

  cleanerOpeners.forEach((opener) => {
    opener.addEventListener("click", (event) => {
      event.preventDefault();
      openCleanerModal(opener);
    });
  });

  cleanerClosers.forEach((closer) => {
    closer.addEventListener("click", closeCleanerModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCleanerModal();
  });

  if (cleanerForm) {
    cleanerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setCleanerMessage("");

      const formData = new FormData(cleanerForm);
      const application = {
        fullName: String(formData.get("fullName") || "").trim(),
        phone: String(formData.get("phone") || "").replace(/\D/g, "").slice(0, 10),
        email: String(formData.get("email") || "").trim().toLowerCase(),
        zipCode: String(formData.get("zipCode") || "").replace(/\D/g, "").slice(0, 5),
        experience: String(formData.get("experience") || "").trim(),
        details: String(formData.get("details") || "").trim(),
      };

      if (!application.fullName || application.phone.length !== 10 || !application.email || application.zipCode.length !== 5 || !application.experience) {
        setCleanerMessage("Please fill in the required fields.", true);
        return;
      }

      const submitButton = cleanerForm.querySelector("button[type='submit']");
      const initialText = submitButton ? submitButton.textContent : "";
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";
      }

      try {
        const response = await fetch("/api/cleaner-application/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            application,
            source: "Website Cleaner Application",
            pageUrl: window.location.href,
            submittedAt: new Date().toISOString(),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok !== true) {
          throw new Error(payload.error || "We could not submit your application right now.");
        }
        cleanerForm.reset();
        setCleanerMessage("Thanks! Your application has been submitted.");
      } catch (error) {
        setCleanerMessage(error.message || "We could not submit your application right now.", true);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = initialText;
        }
      }
    });
  }
})();
