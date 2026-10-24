/* Sliding nav pill for the professor pages (no dropdown here, just 3 links). */
(() => {
  const nav = document.querySelector(".dash-nav");
  const current = nav.querySelector(".is-active");

  function movePill() {
    const navBox = nav.getBoundingClientRect();
    const box = current.getBoundingClientRect();

    nav.style.setProperty("--pill-x", `${box.left - navBox.left - nav.clientLeft}px`);
    nav.style.setProperty("--pill-w", `${box.width}px`);
  }

  document.fonts.ready.then(() => {
    movePill();
    requestAnimationFrame(() => nav.classList.add("is-ready"));
  });
  window.addEventListener("resize", movePill);
})();
