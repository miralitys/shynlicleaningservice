(function () {
  "use strict";

  const ZIP_TARGETS = Object.freeze({
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
    "60441": [
      { city: "Homer Glen", url: "/homerglen" },
      { city: "Lockport", url: "/lockport" },
    ],
    "60446": [
      { city: "Lockport", url: "/lockport" },
      { city: "Romeoville", url: "/romeoville" },
    ],
    "60490": [{ city: "Bolingbrook", url: "/bolingbrook" }],
    "60491": [
      { city: "Homer Glen", url: "/homerglen" },
      { city: "Lockport", url: "/lockport" },
    ],
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
    "60517": [
      { city: "Downers Grove", url: "/downersgrove" },
      { city: "Woodridge", url: "/woodridge" },
    ],
    "60521": [
      { city: "Hinsdale", url: "/hinsdale" },
      { city: "Oak Brook", url: "/oakbrook" },
    ],
    "60523": [
      { city: "Hinsdale", url: "/hinsdale" },
      { city: "Oak Brook", url: "/oakbrook" },
    ],
    "60527": [
      { city: "Burr Ridge", url: "/burrridge" },
      { city: "Willowbrook", url: "/willowbrook" },
    ],
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
    "60563": [
      { city: "Naperville", url: "/naperville" },
      { city: "Warrenville", url: "/warrenville" },
    ],
    "60564": [{ city: "Naperville", url: "/naperville" }],
    "60565": [{ city: "Naperville", url: "/naperville" }],
    "60585": [{ city: "Plainfield", url: "/plainfield" }],
    "60586": [{ city: "Plainfield", url: "/plainfield" }],
  });

  function normalizeZip(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 5);
  }

  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
    if (digits.length < 4) return digits;
    if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function initZipLookup() {
    const form = document.querySelector("[data-zip-form]");
    if (!form) return;
    const input = form.querySelector("input[name='zip']");
    const message = form.querySelector("[data-zip-message]");

    input.addEventListener("input", () => {
      input.value = normalizeZip(input.value);
      if (message) message.textContent = "";
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const zip = normalizeZip(input.value);
      if (zip.length !== 5) {
        message.textContent = "Please enter a valid 5-digit ZIP";
        input.focus();
        return;
      }

      const targets = ZIP_TARGETS[zip] || [];
      if (targets.length > 0) {
        message.textContent = `Great, we serve ${targets[0].city}. Redirecting...`;
        window.location.href = targets[0].url;
        return;
      }

      message.textContent = `We don't serve ${zip} yet - call us at (630) 812-7077 to check, we add new areas regularly.`;
    });
  }

  function initQuoteForm() {
    const form = document.querySelector("[data-quote-form]");
    if (!form) return;
    const name = form.querySelector("input[name='name']");
    const phone = form.querySelector("input[name='phone']");
    const zip = form.querySelector("input[name='zip']");
    const message = form.querySelector("[data-quote-message]");

    phone.addEventListener("input", () => {
      phone.value = formatPhone(phone.value);
    });
    zip.addEventListener("input", () => {
      zip.value = normalizeZip(zip.value);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const cleanName = String(name.value || "").trim();
      const cleanPhone = String(phone.value || "").trim();
      const cleanZip = normalizeZip(zip.value);

      if (!cleanName || !cleanPhone || cleanZip.length !== 5) {
        message.textContent = "Please enter your name, phone, and a valid 5-digit ZIP.";
        return;
      }

      const params = new URLSearchParams({
        source: "cleaners-near-me",
        name: cleanName,
        phone: cleanPhone,
        zip: cleanZip,
        zipcode: cleanZip,
      });
      window.location.href = `/quote-no-price?${params.toString()}`;
    });
  }

  function initReveal() {
    const nodes = Array.from(document.querySelectorAll(".near-reveal"));
    if (!("IntersectionObserver" in window) || nodes.length === 0) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.14 }
    );

    nodes.forEach((node) => observer.observe(node));
  }

  document.addEventListener("DOMContentLoaded", () => {
    initZipLookup();
    initQuoteForm();
    initReveal();
  });
})();
