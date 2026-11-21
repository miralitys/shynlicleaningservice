(() => {
  const sections = Array.from(document.querySelectorAll("[data-deep-background]"));
  const reveal = section => section.setAttribute("data-background-ready", "");

  if (!("IntersectionObserver" in window)) {
    sections.forEach(reveal);
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      reveal(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "600px 0px" });
  sections.forEach(section => observer.observe(section));
})();
