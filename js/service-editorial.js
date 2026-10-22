(() => {
  document.querySelectorAll("main[data-service-editorial] [data-service-faq-button]").forEach(button => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      const open = item.classList.toggle("active");
      button.setAttribute("aria-expanded", String(open));
    });
  });
})();
