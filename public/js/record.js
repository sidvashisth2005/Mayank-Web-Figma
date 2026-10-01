// Record page: switch the main screenshot from the thumbnails.
(() => {
  const main = document.getElementById("shotMain");
  const thumbs = Array.from(document.querySelectorAll(".thumb"));
  thumbs.forEach((t) => t.addEventListener("click", () => {
    main.src = t.dataset.shot;
    thumbs.forEach((x) => x.classList.toggle("is-on", x === t));
  }));
})();
