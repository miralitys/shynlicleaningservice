(() => {
  const pictures = Array.from(document.querySelectorAll(".dc-room-media"));
  const reveal = picture => picture.querySelector("[data-deep-room-placeholder]")?.remove();

  if (!("IntersectionObserver" in window)) {
    pictures.forEach(reveal);
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      reveal(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "600px 0px" });
  pictures.forEach(picture => observer.observe(picture));
})();
