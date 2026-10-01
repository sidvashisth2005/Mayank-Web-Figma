// Market: filters the statically rendered cards. Filters live in the URL so
// a filtered view can be shared or reloaded.
(() => {
  const grid = document.getElementById("records");
  if (!grid) return;
  const cards = Array.from(grid.children);
  const meta = document.getElementById("marketMeta");
  const empty = document.getElementById("empty");
  const search = document.getElementById("search");
  const sort = document.getElementById("sort");
  const dealChips = Array.from(document.querySelectorAll(".chip[data-deal]"));
  const catChips = Array.from(document.querySelectorAll(".chip[data-category]"));
  const params = new URLSearchParams(location.search);
  const state = { deal: params.get("deal") || "all", category: params.get("category") || "", q: params.get("q") || "", sort: params.get("sort") || "new" };

  function apply() {
    const q = state.q.trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
      const d = card.dataset;
      const ok = (state.deal === "all" || (state.deal === "closed" ? d.status !== "live" : d.deal === state.deal && d.status === "live"))
        && (!state.category || d.category === state.category)
        && (!q || d.search.includes(q));
      card.hidden = !ok;
      if (ok) shown++;
    });
    const by = { new: (a, b) => b.dataset.listed.localeCompare(a.dataset.listed), low: (a, b) => a.dataset.price - b.dataset.price, high: (a, b) => b.dataset.price - a.dataset.price }[state.sort] || null;
    if (by) cards.slice().sort((a, b) => (a.dataset.status === "live") === (b.dataset.status === "live") ? by(a, b) : a.dataset.status === "live" ? -1 : 1).forEach((c) => grid.appendChild(c));
    dealChips.forEach((c) => c.classList.toggle("is-on", c.dataset.deal === state.deal));
    catChips.forEach((c) => c.classList.toggle("is-on", c.dataset.category === state.category));
    search.value = state.q;
    sort.value = state.sort;
    empty.hidden = shown > 0;
    meta.textContent = `${shown} of ${cards.length} records`;
    const next = new URLSearchParams();
    if (state.deal !== "all") next.set("deal", state.deal);
    if (state.category) next.set("category", state.category);
    if (state.q) next.set("q", state.q);
    if (state.sort !== "new") next.set("sort", state.sort);
    history.replaceState(null, "", next.toString() ? `?${next}` : location.pathname);
  }

  dealChips.forEach((c) => c.addEventListener("click", () => { state.deal = c.dataset.deal; apply(); }));
  catChips.forEach((c) => c.addEventListener("click", () => { state.category = state.category === c.dataset.category ? "" : c.dataset.category; apply(); }));
  search.addEventListener("input", () => { state.q = search.value; apply(); });
  sort.addEventListener("change", () => { state.sort = sort.value; apply(); });
  document.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => { Object.assign(state, { deal: "all", category: "", q: "", sort: "new" }); apply(); }));
  apply();
})();
