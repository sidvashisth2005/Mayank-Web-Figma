// Record page: switch the main screenshot from the thumbnails.
(() => {
  const main = document.getElementById("shotMain");
  const thumbs = Array.from(document.querySelectorAll(".thumb"));
  thumbs.forEach((t) => t.addEventListener("click", () => {
    main.src = t.dataset.shot;
    thumbs.forEach((x) => x.classList.toggle("is-on", x === t));
  }));
})();

// Mobile buy bar: shown once the visitor scrolls past the title, hidden at the form.
(() => {
  const bar = document.getElementById("buybar");
  const form = document.getElementById("enquire");
  if (!bar || bar.hidden) return;
  const update = () => {
    const formTop = form ? form.getBoundingClientRect().top : Infinity;
    bar.classList.toggle("is-on", scrollY > 260 && formTop > innerHeight * 0.9);
  };
  addEventListener("scroll", update, { passive: true });
  update();
})();
