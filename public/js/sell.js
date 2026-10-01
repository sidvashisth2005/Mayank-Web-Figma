// Listing wizard: six steps, a draft saved on this device, images resized in
// the browser before upload, then one submission to /api/listings.
(() => {
  const form = document.getElementById("listingForm");
  if (!form) return;
  const UI = window.MayankUI;
  const panels = Array.from(form.querySelectorAll(".wizard__panel"));
  const markers = Array.from(document.querySelectorAll(".wizard__steps li"));
  const back = document.getElementById("back");
  const next = document.getElementById("nextStep");
  const submit = document.getElementById("submitListing");
  const status = form.querySelector(".form-status");
  const previews = document.getElementById("previews");
  const DRAFT = "mayank-listing-draft";
  const startedAt = Date.now();
  let step = 0;
  let images = []; // { name, type, data (base64), url }

  // ----- Draft -----
  const fields = () => Array.from(form.elements).filter((el) => el.name && el.name !== "website" && el.type !== "file");
  function saveDraft() {
    const data = {};
    fields().forEach((el) => {
      if (el.type === "radio") { if (el.checked) data[el.name] = el.value; }
      else if (el.type === "checkbox") data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    try { localStorage.setItem(DRAFT, JSON.stringify({ data, step })); } catch (e) {}
  }
  function loadDraft() {
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT) || "null"); } catch (e) {}
    if (!draft) return;
    fields().forEach((el) => {
      if (!(el.name in draft.data)) return;
      if (el.type === "radio") el.checked = draft.data[el.name] === el.value;
      else if (el.type === "checkbox") el.checked = Boolean(draft.data[el.name]);
      else el.value = draft.data[el.name];
    });
    step = Math.min(draft.step || 0, panels.length - 2);
  }

  // ----- Conditional fields -----
  function sync() {
    const deal = form.elements.dealType.value;
    const rent = document.getElementById("rentPeriodField");
    rent.hidden = deal !== "Rent or license";
    form.elements.rentPeriod.required = !rent.hidden;
    const wa = document.getElementById("whatsappField");
    wa.hidden = form.elements.contactMethod.value !== "WhatsApp";
    form.elements.whatsapp.required = !wa.hidden;
    const providerish = ["Social media page", "Ad account", "Cloud credits or subscription"].includes(form.elements.category.value);
    document.getElementById("providerNote").hidden = !providerish;
  }

  // ----- Steps -----
  function show(n) {
    step = n;
    panels.forEach((p, i) => { p.hidden = i !== n; });
    markers.forEach((m, i) => { m.classList.toggle("is-on", i === n); m.classList.toggle("is-done", i < n); });
    back.hidden = n === 0;
    next.hidden = n === panels.length - 1;
    submit.hidden = n !== panels.length - 1;
    status.textContent = "";
    if (n === panels.length - 1) summarise();
    const top = document.getElementById("wizard").getBoundingClientRect().top + scrollY - 100;
    if (scrollY > top) scrollTo({ top, behavior: UI.reduce ? "auto" : "smooth" });
    saveDraft();
  }
  next.addEventListener("click", () => { if (UI.validate(panels[step])) show(step + 1); });
  back.addEventListener("click", () => show(step - 1));
  form.addEventListener("input", () => { sync(); saveDraft(); });
  form.addEventListener("change", sync);

  function summarise() {
    const f = form.elements;
    const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
    const rows = [
      ["Asset", f.name.value], ["Category", f.category.value],
      ["Deal", f.dealType.value + (f.dealType.value === "Rent or license" && f.rentPeriod.value ? ` · per ${f.rentPeriod.value}` : "")],
      ["Price", f.price.value ? inr.format(Number(f.price.value)) : ""], ["Age", f.age.value],
      ["Transfer", f.transfer.value], ["Images", `${images.length} attached`],
      ["Contact", `${f.seller.value} · ${f.contactMethod.value === "WhatsApp" ? f.whatsapp.value : f.email.value}`],
    ];
    const summary = document.getElementById("summary");
    summary.innerHTML = "";
    rows.forEach(([k, v]) => {
      const div = document.createElement("div");
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v || "—";
      div.append(dt, dd);
      summary.appendChild(div);
    });
  }

  // ----- Images: resize to 1600px JPEG so four fit in one request -----
  const input = document.getElementById("imageInput");
  const drop = document.getElementById("drop");
  function resize(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ name: file.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg", data: dataUrl.split(",")[1], url: dataUrl });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} could not be read.`)); };
      img.src = url;
    });
  }
  async function addFiles(list) {
    const files = Array.from(list).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (files.length < list.length) status.textContent = "Only JPG, PNG or WebP images can be added.";
    for (const file of files) {
      if (images.length >= 4) { status.textContent = "Up to 4 images."; break; }
      try { images.push(await resize(file)); } catch (err) { status.textContent = err.message; }
    }
    renderPreviews();
    input.value = "";
  }
  function renderPreviews() {
    previews.innerHTML = "";
    images.forEach((img, i) => {
      const li = document.createElement("li");
      const pic = document.createElement("img");
      pic.src = img.url;
      pic.alt = "";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "✕";
      remove.setAttribute("aria-label", `Remove image ${i + 1}`);
      remove.addEventListener("click", () => { images.splice(i, 1); renderPreviews(); });
      li.append(pic, remove);
      previews.appendChild(li);
    });
    drop.classList.toggle("is-full", images.length >= 4);
  }
  input.addEventListener("change", () => addFiles(input.files));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("is-over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });

  // ----- Submit -----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!UI.validate(panels[step])) return;
    const f = form.elements;
    const payload = {
      name: f.name.value, category: f.category.value, description: f.description.value,
      dealType: f.dealType.value, price: Number(f.price.value), rentPeriod: f.dealType.value === "Rent or license" ? f.rentPeriod.value : "", age: f.age.value,
      condition: f.condition.value, metrics: f.metrics.value, transfer: f.transfer.value, dependencies: f.dependencies.value,
      videoUrl: f.videoUrl.value, seller: f.seller.value, contactMethod: f.contactMethod.value, email: f.email.value,
      whatsapp: f.whatsapp.value, linkedin: f.linkedin.value, eligibility: f.eligibility.checked,
      images: images.map(({ name, type, data }) => ({ filename: name, type, content: data })),
      website: f.website.value, startedAt,
    };
    const data = await UI.submit(form, "/api/listings", payload);
    if (!data) {
      // Send the seller back to the first step that has an error
      const bad = form.querySelector(".field.invalid");
      const panel = bad && bad.closest(".wizard__panel");
      if (panel && panels.indexOf(panel) !== step) { show(panels.indexOf(panel)); UI.fieldErrors(form, {}); }
      return;
    }
    try { localStorage.removeItem(DRAFT); } catch (err) {}
    form.hidden = true;
    document.querySelector(".wizard__steps").hidden = true;
    document.getElementById("doneRef").textContent = data.ref;
    document.getElementById("done").hidden = false;
  });

  loadDraft();
  sync();
  show(step);
})();
