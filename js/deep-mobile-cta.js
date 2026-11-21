(() => {
  if (window.__mobileStickyCtaBound) return;
  const bar = document.getElementById("mobileStickyCta");
  if (!bar) return;
  window.__mobileStickyCtaBound = true;

  const mobile = window.matchMedia("(max-width: 960px)");
  let viewportHeight = 0;
  let measureViewport = true;
  let visible = bar.classList.contains("is-visible");
  let pendingFrame = false;

  function sync() {
    pendingFrame = false;
    if (measureViewport) {
      viewportHeight = window.innerHeight;
      measureViewport = false;
    }
    const next = mobile.matches && window.scrollY > viewportHeight * 0.45;
    if (next === visible) return;
    visible = next;
    bar.classList.toggle("is-visible", visible);
    document.body.classList.toggle("has-mobile-sticky-cta", visible);
  }

  function schedule() {
    if (pendingFrame) return;
    pendingFrame = true;
    window.requestAnimationFrame(sync);
  }

  function resize() {
    measureViewport = true;
    schedule();
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pageshow", resize, { passive: true });
  mobile.addEventListener("change", schedule);
})();
