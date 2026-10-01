// Mayank: shared behaviour for every page. Each feature checks that its
// elements exist, so pages only pay for what they contain.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // Shared helpers for page scripts (market.js, record.js, sell.js)
  const Mayank = (window.MayankUI = {
    reduce,
    // Posts JSON to the API and shows field errors next to their inputs.
    async submit(form, url, payload) {
      const status = $(".form-status", form);
      const button = $("button[type=submit]", form);
      $$(".field.invalid", form).forEach((f) => f.classList.remove("invalid"));
      $$(".field-error", form).forEach((e) => e.remove());
      status.className = "form-status";
      status.textContent = "Sending…";
      button.disabled = true;
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({ ok: false, error: "Unexpected response from the server." }));
        if (!res.ok || !data.ok) {
          Mayank.fieldErrors(form, data.fields);
          throw new Error(data.error || "That did not go through. Please try again.");
        }
        status.textContent = "";
        return data;
      } catch (err) {
        status.textContent = err.message === "Failed to fetch" ? "No connection. Please try again." : err.message;
        status.classList.add("err");
        return null;
      } finally {
        button.disabled = false;
      }
    },
    fieldErrors(form, fields) {
      if (!fields) return;
      Object.entries(fields).forEach(([name, message]) => {
        let input = form.elements[name];
        if (input && !input.closest && input[0]) input = input[0]; // radio group
        const field = input && input.closest ? input.closest(".field, .check") : null;
        if (!field) return;
        field.classList.add("invalid");
        const note = document.createElement("small");
        note.className = "field-error";
        note.textContent = message;
        field.appendChild(note);
      });
      const first = $(".field.invalid input, .field.invalid textarea, .field.invalid select", form);
      if (first) first.focus();
    },
    // Browser-side check using the input's own constraints.
    validate(scope) {
      let ok = true;
      $$(".field-error", scope).forEach((e) => e.remove());
      $$("input, textarea, select", scope).forEach((el) => {
        if (el.type === "hidden" || el.classList.contains("hp") || el.closest("[hidden]")) return;
        const field = el.closest(".field, .check");
        const valid = el.checkValidity() && (!el.required || el.type === "checkbox" || el.type === "radio" || el.value.trim() !== "");
        if (field) field.classList.toggle("invalid", !valid);
        if (!valid && ok) { ok = false; el.focus(); }
      });
      return ok;
    },
  });

  // ----- Intro loader (once per session) -----
  const loader = $("#loader");
  const ready = () => root.classList.add("is-ready");
  if (root.classList.contains("no-intro") || !loader || !loader.animate) {
    if (loader) loader.remove();
    requestAnimationFrame(ready);
  } else {
    runIntro();
  }

  function runIntro() {
    try { sessionStorage.setItem("mayank-intro", "1"); } catch (e) {}
    root.classList.add("is-loading");
    const byId = (id) => document.getElementById(id);
    const card = byId("ldCard"), stamp = byId("ldStamp"), stage = byId("ldStage"), meter = byId("ldMeter");
    const pct = byId("ldPct"), status = byId("ldStatus"), tagline = byId("ldTagline"), wipe = byId("ldWipe");
    const tiles = Array.from(byId("ldTiles").children);
    const checks = $$("li", card);
    const running = [];
    const timers = [];
    let finished = false;
    const OUT = "cubic-bezier(.16,1,.3,1)";
    const IN_OUT = "cubic-bezier(.76,0,.24,1)";
    const anim = (el, frames, opts) => { const a = el.animate(frames, { fill: "both", ...opts }); running.push(a); return a; };
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const TOTAL = 2950;

    const t0 = performance.now();
    (function tick(now) {
      if (finished) return;
      const t = Math.min(1, (now - t0) / TOTAL);
      pct.textContent = String(Math.round(100 * (1 - Math.pow(1 - t, 2)))).padStart(3, "0");
      if (t < 1) requestAnimationFrame(tick);
    })(t0);

    // 1. The record arrives
    anim(card, [
      { opacity: 0, transform: "translateY(80px) rotateX(35deg) rotate(-6deg) scale(.85)" },
      { opacity: 1, transform: "none" },
    ], { duration: 700, easing: OUT });

    // 2. Four checks tick off while the meter fills
    anim(meter, [{ width: "0%" }, { width: "100%" }], { duration: 900, delay: 300, easing: "cubic-bezier(.5,0,.2,1)" });
    checks.forEach((li, i) => later(380 + i * 190, () => li.classList.add("is-done")));

    // 3. The stamp slams down and the stage shakes
    later(1150, () => { status.textContent = "Record approved"; });
    anim(stamp, [
      { opacity: 0, transform: "rotate(-24deg) scale(3.2)" },
      { opacity: 1, transform: "rotate(-12deg) scale(.9)", offset: .75 },
      { opacity: 1, transform: "rotate(-12deg) scale(1)" },
    ], { duration: 360, delay: 1150, easing: "cubic-bezier(.55,0,.75,.2)" });
    anim(stage, [
      { transform: "translate(0,0)" }, { transform: "translate(-7px,5px) rotate(-.4deg)" },
      { transform: "translate(6px,-4px) rotate(.3deg)" }, { transform: "translate(-3px,2px)" }, { transform: "translate(0,0)" },
    ], { duration: 260, delay: 1420, fill: "none" });

    // 4. The card splits into six category tiles that fly into a row and flip to MAYANK
    const SPLIT = 1850;
    later(SPLIT, () => { status.textContent = "Six kinds of useful work"; });
    const T = tiles[0].offsetWidth || 100;
    const gap = Math.max(6, T * 0.08);
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const cell = cw / 3;
    anim(card, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.04)" }], { duration: 120, delay: SPLIT, easing: "linear" });
    tiles.forEach((tile, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const gx = (col - 1) * cell, gy = (row - 0.5) * (ch / 2);
      const rx = (i - 2.5) * (T + gap);
      const sx0 = (cell * 0.97) / T, sy0 = ((ch / 2) * 0.97) / T;
      const lift = -60 - Math.abs(i - 2.5) * 30;
      // Same transform list in every keyframe so the flip interpolates cleanly.
      // Opacity is never animated here: it would flatten the 3D flip.
      const tf = (x, y, sx, sy, ry, rz) => `translate(${x}px, ${y}px) rotateZ(${rz}deg) rotateY(${ry}deg) scale(${sx}, ${sy})`;
      anim(tile, [
        { transform: tf(gx, gy, sx0, sy0, 0, 0) },
        { transform: tf((gx + rx) / 2, lift, 0.9, 0.9, 90, (i - 2.5) * 9), offset: .5 },
        { transform: tf(rx, 0, 1, 1, 180, 0) },
      ], { duration: 900, delay: SPLIT + i * 50, easing: IN_OUT });
    });
    later(SPLIT, () => tiles.forEach((tile) => { tile.style.opacity = "1"; }));
    later(SPLIT + 700, () => { status.textContent = "Ready for its next owner"; });
    anim(tagline, [{ opacity: 0, transform: "translateY(20px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: SPLIT + 650, easing: OUT });

    // 5. Handover: tiles drop away, green sweeps up, then everything lifts off the page
    later(TOTAL, () => handover(false));

    function handover(fast) {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      pct.textContent = "100";
      const d = fast ? 0.5 : 1;
      if (!fast) {
        tiles.forEach((tile, i) => {
          const now = getComputedStyle(tile).transform;
          tile.animate([
            { transform: now },
            { transform: `${now === "none" ? "" : now} translateY(${innerHeight}px) rotate(${(i % 2 ? 1 : -1) * (20 + i * 6)}deg)` },
          ], { duration: 650, delay: i * 45, easing: "cubic-bezier(.55,0,1,.45)", fill: "forwards" });
        });
        tagline.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" });
      }
      const sweep = wipe.animate([{ transform: "translateY(101%)" }, { transform: "translateY(0)" }], { duration: 520 * d, delay: fast ? 0 : 260, easing: IN_OUT, fill: "forwards" });
      sweep.finished.then(() => {
        running.forEach((a) => a.cancel());
        ready();
        root.classList.remove("is-loading");
        const lift = loader.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 100% 0)" }], { duration: 750 * d, easing: IN_OUT, fill: "forwards" });
        lift.finished.then(() => loader.remove());
      });
    }

    byId("ldSkip").addEventListener("click", () => handover(true));
    addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { handover(true); removeEventListener("keydown", onKey); }
    });
  }

  // ----- Page transitions: a dark panel rises with the destination's name,
  // then lifts off the next page. -----
  const shutter = $("#shutter");
  const shutterLabel = $("#shutterLabel");
  const labels = { "/": "Home", "/market": "Market", "/sell": "List an asset", "/how-it-works": "How it works", "/restricted-assets": "Listing rules", "/terms": "Terms", "/privacy": "Privacy" };
  const labelFor = (url, link) => labels[url.pathname] || (url.pathname.startsWith("/market/") ? (link && link.querySelector("h3") ? link.querySelector("h3").textContent : "Record") : "Mayank");
  if (shutter && !reduce) {
    let incoming = null;
    try { incoming = sessionStorage.getItem("mayank-shutter"); sessionStorage.removeItem("mayank-shutter"); } catch (e) {}
    if (incoming) {
      shutterLabel.textContent = incoming;
      shutter.classList.add("is-covering");
      requestAnimationFrame(() => requestAnimationFrame(() => shutter.classList.replace("is-covering", "is-leaving")));
      shutter.addEventListener("transitionend", () => { shutter.className = "shutter"; }, { once: true });
    }
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/") || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault();
      const label = labelFor(url, a);
      shutterLabel.textContent = label;
      try { sessionStorage.setItem("mayank-shutter", label); } catch (err) {}
      shutter.className = "shutter is-entering";
      setTimeout(() => { location.href = url.href; }, 480);
    });
    addEventListener("pageshow", (e) => { if (e.persisted) shutter.className = "shutter"; });
  }

  // ----- Header, mobile menu, progress -----
  const header = $("#header");
  const progress = $("#progress");
  const toggle = $(".nav-toggle");
  const nav = $("#nav");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    root.classList.toggle("menu-open", open);
  });

  // ----- Scroll-driven effects -----
  const manifesto = $$("#manifesto p");
  const route = $("#route");
  const routeSteps = route ? Array.from(route.children) : [];

  function onScroll() {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    header.classList.toggle("is-stuck", y > 10);
    manifesto.forEach((p) => p.classList.toggle("is-lit", p.getBoundingClientRect().top < innerHeight * 0.72));
    if (route) {
      const r = route.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (innerHeight * 0.6)));
      route.style.setProperty("--route", t.toFixed(3));
      routeSteps.forEach((li, i) => li.classList.toggle("is-on", t >= i / (routeSteps.length - 1) - 0.02));
    }
  }
  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });
  addEventListener("resize", onScroll);

  // ----- Hero stack follows the pointer -----
  const stack = $("#stack");
  if (stack && !reduce && matchMedia("(pointer: fine)").matches) {
    const layers = $$("[data-depth]", stack);
    let frame = null;
    stack.closest("section").addEventListener("pointermove", (e) => {
      const r = stack.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / r.width;
      const y = (e.clientY - (r.top + r.height / 2)) / r.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => layers.forEach((l) => {
        const d = Number(l.dataset.depth);
        l.style.translate = `${(x * d).toFixed(1)}px ${(y * d).toFixed(1)}px`;
      }));
    });
  }

  // ----- Reveal on scroll + counters -----
  function countUp(el) {
    const target = Number(el.dataset.count);
    if (reduce || !target) return;
    const start = performance.now();
    const fmt = new Intl.NumberFormat("en-IN");
    (function frame(now) {
      const t = Math.min(1, (now - start) / 1100);
      el.textContent = fmt.format(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      $$("[data-count]", e.target).forEach(countUp);
      io.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });
  $$("[data-reveal], .declines li, .closing").forEach((el) => io.observe(el));
  $$(".services, .outcomes, .faq, .accordion, .proof ol, .records, .clauses, .conditions ul").forEach((group) => {
    Array.from(group.children).forEach((child, i) => { child.style.transitionDelay = `${(i % 3) * 0.08}s`; });
  });

  // ----- Accordion: one open at a time -----
  const steps = $$("#accordion details");
  steps.forEach((step) => step.addEventListener("toggle", () => {
    if (step.open) steps.forEach((s) => s !== step && (s.open = false));
  }));

  // ----- Buyer / seller tracks -----
  const panel = $("#trackPanel");
  if (panel) {
    const tracks = {
      buyer: { cta: ["/market", "Browse the market"], steps: [
        ["Browse", "Every record shows price, condition and route."],
        ["Inspect", "Read the condition ledger and what transfers."],
        ["Enquire", "Privately, through the review desk."],
        ["Agree", "Review evidence, then agree terms with the seller."],
        ["Take over", "The asset moves by its documented route."],
      ] },
      seller: { cta: ["/sell", "Start a listing"], steps: [
        ["Describe", "Asset, terms, condition and images."],
        ["Review", "The desk checks identity, ownership and route."],
        ["Publish", "Your contact details never appear publicly."],
        ["Meet buyers", "Enquiries are screened before they reach you."],
        ["Hand over", "Transfer by the route, inside the support window."],
      ] },
    };
    const cta = $("#trackCta");
    const tabs = $$("[data-track]");
    const show = (key) => {
      const t = tracks[key];
      panel.innerHTML = t.steps.map(([title, copy], i) => `<li><span>0${i + 1}</span><strong>${title}</strong><p>${copy}</p></li>`).join("");
      cta.setAttribute("href", t.cta[0]);
      cta.firstChild.textContent = `${t.cta[1]} `;
      tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.track === key)));
    };
    tabs.forEach((b) => b.addEventListener("click", () => show(b.dataset.track)));
    show("buyer");
  }

  // ----- Testimonials slider -----
  const track = $("#track");
  if (track) {
    const slides = Array.from(track.children);
    const dotsWrap = $("#dots");
    let index = 0;
    let timer = null;
    slides.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.setAttribute("aria-label", `Go to testimonial ${i + 1}`);
      dot.addEventListener("click", () => { go(i); restart(); });
      dotsWrap.appendChild(dot);
    });
    const dots = Array.from(dotsWrap.children);
    function go(i) {
      index = (i + slides.length) % slides.length;
      const viewport = track.parentElement.clientWidth;
      const slide = slides[index];
      track.style.transform = `translateX(${-(slide.offsetLeft - (viewport - slide.offsetWidth) / 2)}px)`;
      dots.forEach((d, n) => d.classList.toggle("active", n === index));
      slides.forEach((s, n) => (s.style.opacity = n === index ? "1" : ".4"));
    }
    function restart() {
      clearInterval(timer);
      if (!reduce) timer = setInterval(() => go(index + 1), 6500);
    }
    $("#prev").addEventListener("click", () => { go(index - 1); restart(); });
    $("#next").addEventListener("click", () => { go(index + 1); restart(); });
    addEventListener("resize", () => go(index));
    track.parentElement.addEventListener("mouseenter", () => clearInterval(timer));
    track.parentElement.addEventListener("mouseleave", restart);
    let startX = null;
    track.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
    track.addEventListener("touchend", (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) { go(index + (dx < 0 ? 1 : -1)); restart(); }
      startX = null;
    });
    go(0);
    restart();
  }

  // ----- Enquiry forms (record pages and the general desk form) -----
  const startedAt = Date.now();
  const enquiry = $("#enquiryForm");
  if (enquiry) {
    enquiry.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!Mayank.validate(enquiry)) return;
      const f = enquiry.elements;
      const data = await Mayank.submit(enquiry, "/api/enquiries", {
        asset: enquiry.dataset.asset,
        name: f.name.value, email: f.email.value,
        company: f.company ? f.company.value : "", budget: f.budget ? f.budget.value : "",
        intent: f.intent.value, message: f.message.value,
        website: f.website.value, startedAt,
      });
      if (!data) return;
      enquiry.innerHTML = `<div class="sent"><span class="done-mark" aria-hidden="true">✓</span><h3>Sent to the review desk.</h3><p>Reference <b>${data.ref}</b>. You will hear back by email.</p></div>`;
    });
  }

  // ----- Newsletter -----
  const sub = $("#subscribe");
  if (sub) {
    const note = $(".subscribe__status", sub);
    sub.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = sub.elements.email;
      if (!email.checkValidity() || !email.value.trim()) { note.textContent = "Enter a valid email."; return; }
      const button = $("button", sub);
      button.disabled = true;
      note.textContent = "";
      try {
        const res = await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.value, website: sub.elements.website.value, startedAt }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Please try again.");
        note.textContent = "You’re on the list.";
        sub.reset();
      } catch (err) {
        note.textContent = err.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();
  onScroll();
})();
