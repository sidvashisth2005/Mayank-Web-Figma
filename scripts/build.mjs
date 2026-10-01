// Builds the static site into dist/: wraps every page in the shared layout,
// renders catalogue blocks at build time and generates one page per record.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist");
const read = (path) => readFileSync(join(root, path), "utf8");
const { categories, records, testimonials, reviews } = JSON.parse(read("data/catalogue.json"));

const siteUrl = (process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || "https://mayank-website-new.vercel.app").replace(/\/$/, "");

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const price = (r) => inr.format(r.price) + (r.priceUnit ? ` / ${r.priceUnit}` : "");
const category = (key) => categories.find((c) => c.key === key);
const live = records.filter((r) => r.status === "live");
const age = (m) => (m < 24 ? `${m} months` : `${Number.isInteger(m / 12) ? m / 12 : (m / 12).toFixed(1)} years`);
const statusLabel = { live: "Available", sold: "Sold", rented: "Rented" };

// ----- Shared blocks -----
function card(r, { lazy = true } = {}) {
  const closed = r.status !== "live";
  return `<a class="rec${closed ? " is-closed" : ""}" href="/market/${r.slug}" data-deal="${r.deal}" data-status="${r.status}" data-category="${r.category}" data-price="${r.price}" data-listed="${r.listed}" data-search="${esc(`${r.id} ${r.name} ${r.type} ${r.summary} ${category(r.category).label}`.toLowerCase())}">
  ${closed ? `<b class="stamp-closed">${r.status === "sold" ? "Sold" : "Rented"}</b>` : ""}
  <div class="rec__shot"><img src="/assets/records/${r.slug}/1.jpg" alt="" ${lazy ? 'loading="lazy"' : ""} width="1600" height="1000" /></div>
  <div class="rec__body">
    <span class="rec__id">${esc(r.id)} · ${esc(category(r.category).label)}</span>
    <h3>${esc(r.name)}</h3>
    <p class="rec__summary">${esc(r.summary)}</p>
    <div class="rec__facts"><span class="rec__price">${esc(inr.format(r.price))}${r.priceUnit ? `<small> / ${esc(r.priceUnit)}</small>` : ""}</span><span class="pill ${r.deal === "rent" ? "pill--dark" : "pill--green"}">${r.deal === "rent" ? "Rent" : "Buy"}</span></div>
  </div>
</a>`;
}

const voices = () => testimonials.map((t) => `<figure class="quote"><blockquote>“${esc(t.quote)}”</blockquote><figcaption><strong>${esc(t.name)} <span class="pill">${t.track === "seller" ? "Seller" : "Buyer"}</span></strong>${esc(t.role)} · ${esc(t.city)}</figcaption></figure>`).join("\n");

function stats() {
  const asks = live.filter((r) => !r.priceUnit).map((r) => r.price).sort((a, b) => a - b);
  const mid = Math.floor(asks.length / 2);
  const median = asks.length % 2 ? asks[mid] : Math.round((asks[mid - 1] + asks[mid]) / 2);
  const days = live.map((r) => Number(r.transferWindow.match(/\d+/)?.[0] ?? 0));
  const avg = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
  return `<dl class="stats">
  <div><dt>Records</dt><dd data-count="${records.length}">${records.length}</dd></div>
  <div><dt>Available now</dt><dd data-count="${live.length}">${live.length}</dd></div>
  <div><dt>Median ask</dt><dd>${esc(inr.format(median))}</dd></div>
  <div><dt>Avg. transfer</dt><dd><span data-count="${avg}">${avg}</span> days</dd></div>
</dl>`;
}

const categoryChips = () => categories.map((c) => `<button type="button" class="chip chip--cat" data-category="${c.key}">${esc(c.plural)}</button>`).join("");

const blocks = {
  "records:latest": () => [...live].sort((a, b) => b.listed.localeCompare(a.listed)).slice(0, 6).map((r) => card(r)).join("\n"),
  "records:all": () => [...records].sort((a, b) => (a.status === "live") === (b.status === "live") ? b.listed.localeCompare(a.listed) : a.status === "live" ? -1 : 1).map((r) => card(r)).join("\n"),
  "category:chips": categoryChips,
  voices,
  stats,
  "count:live": () => String(live.length),
  "count:all": () => String(records.length),
};

// ----- Layout -----
const layout = read("src/layout.html");
const nav = [["/market", "Market"], ["/how-it-works", "How it works"], ["/restricted-assets", "Listing rules"]];

function render(page, body) {
  const navHtml = nav.map(([href, label]) => `<a href="${href}"${page.nav === href ? ' class="is-active" aria-current="page"' : ""}>${label}</a>`).join("\n        ");
  const scripts = ["/js/main.js", ...(page.scripts || [])].map((src) => `<script src="${src}" defer></script>`).join("\n  ");
  const canonical = siteUrl + (page.path === "/" ? "/" : page.path);
  let html = layout
    .replaceAll("{{title}}", esc(page.title))
    .replaceAll("{{description}}", esc(page.description))
    .replaceAll("{{canonical}}", canonical)
    .replaceAll("{{siteUrl}}", siteUrl)
    .replace("{{nav}}", navHtml)
    .replace("{{bodyClass}}", esc(page.bodyClass || ""))
    .replace("{{scripts}}", scripts)
    .replace("{{content}}", body);
  html = html.replace(/<!--\s*@([\w:]+)\s*-->/g, (match, key) => (blocks[key] ? blocks[key]() : match));
  return html;
}

function write(path, html) {
  const file = join(out, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

// ----- Build -----
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "public"), out, { recursive: true });

const sitemap = [];
for (const file of readdirSync(join(root, "src/pages"))) {
  const raw = read(`src/pages/${file}`);
  const match = raw.match(/^<!--page\s+([\s\S]*?)-->\s*/);
  if (!match) throw new Error(`${file} is missing its <!--page {...} --> header`);
  const page = JSON.parse(match[1]);
  const name = file.replace(/\.html$/, "");
  page.path = name === "index" ? "/" : `/${name}`;
  write(`${name}.html`, render(page, raw.slice(match[0].length)));
  if (name !== "404") sitemap.push(page.path);
}

// One page per record
const recordTemplate = read("src/record.html");
records.forEach((r, i) => {
  const cat = category(r.category);
  const prev = records[(i - 1 + records.length) % records.length];
  const next = records[(i + 1) % records.length];
  const similar = [...records.filter((o) => o !== r && o.category === r.category), ...records.filter((o) => o !== r && o.category !== r.category && o.status === "live")].slice(0, 3);
  const list = (items) => `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
  const recReviews = reviews[r.slug] || [];
  const values = {
    id: esc(r.id), slug: r.slug, name: esc(r.name), type: esc(r.type), summary: esc(r.summary), description: esc(r.description),
    category: esc(cat.label), categoryKey: cat.key, ink: cat.ink, price: esc(price(r)), priceLabel: r.deal === "rent" ? "Licence" : "Asking",
    deal: r.deal === "rent" ? "Rent or licence" : "Buy outright", status: statusLabel[r.status], statusKey: r.status,
    review: esc(r.review), access: esc(r.access), route: esc(r.route), window: esc(r.transferWindow), age: age(r.ageMonths),
    metricValue: esc(r.metric.value), metricLabel: esc(r.metric.label),
    includes: list(r.includes), works: list(r.works), depends: list(r.depends), excluded: list(r.excluded),
    shots: [1, 2, 3].map((n) => `<button type="button" class="thumb${n === 1 ? " is-on" : ""}" data-shot="/assets/records/${r.slug}/${n}.jpg" aria-label="Show screen ${n}"><img src="/assets/records/${r.slug}/${n}.jpg" alt="" loading="lazy" width="1600" height="1000" /></button>`).join(""),
    similar: similar.map((o) => card(o)).join("\n"),
    prevSlug: prev.slug, prevName: esc(prev.name), nextSlug: next.slug, nextName: esc(next.name),
    reviews: recReviews.length ? `<section class="record-section" aria-labelledby="reviewsTitle"><h2 id="reviewsTitle" class="record-section__title">Reviews <span class="pill">Sample</span></h2><div class="reviews">${recReviews.map((rv) => `<article class="review"><div class="review__stars" aria-label="${rv.rating} out of 5">${"★".repeat(rv.rating)}${"☆".repeat(5 - rv.rating)}</div><h3>${esc(rv.title)}</h3><p>${esc(rv.body)}</p><span>${esc(rv.name)} · ${esc(rv.role)}</span></article>`).join("")}</div></section>` : "",
    enquiry: r.status === "live" ? "" : "hidden",
    closedNote: r.status === "live" ? "hidden" : "",
  };
  const body = recordTemplate.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in values ? values[key] : m));
  const page = { title: `${r.name} · ${r.type}`, description: r.summary, nav: "/market", path: `/market/${r.slug}`, bodyClass: "page-record", scripts: ["/js/record.js"] };
  write(`market/${r.slug}.html`, render(page, body));
  sitemap.push(page.path);
});

// Client data for the market and forms
write("js/catalogue.js", `window.MAYANK = ${JSON.stringify({ categories: categories.map(({ key, label, plural }) => ({ key, label, plural })), records: records.map(({ slug, id, name, status }) => ({ slug, id, name, status })) })};\n`);

write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((p) => `  <url><loc>${siteUrl}${p === "/" ? "/" : p}</loc></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${siteUrl}/sitemap.xml\n`);

if (!existsSync(join(out, "index.html"))) throw new Error("index.html was not built");
console.log(`Built ${sitemap.length} pages into dist/ for ${siteUrl}`);
