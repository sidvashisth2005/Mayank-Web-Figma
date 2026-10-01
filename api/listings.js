// POST /api/listings: a seller's listing. Images go to Vercel Blob first, then
// the listing, its images and its first timeline entry are written in one
// transaction. If the write fails, the uploaded images are deleted again.
import { del, put } from "@vercel/blob";
import { check, db, guard, json, MIN_FILL_MS, notifyDesk, referenceId, rules } from "./_lib/server.js";

const categories = ["Complete product", "Code or technical asset", "Template or design system", "Domain and identity", "Social media page", "Ad account", "Cloud credits or subscription", "Other"];
const readiness = ["I own the asset and can transfer it", "I own it but need transfer guidance", "Transfer depends on provider approval"];
const MAX_IMAGE_BYTES = 1_200_000;

// The first bytes must match the declared type, so a renamed file is refused.
function decodeImage(image) {
  if (!image || typeof image.content !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.content)) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) return null;
  const bytes = Buffer.from(image.content, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  const head = bytes.subarray(0, 12);
  const ok = image.type === "image/jpeg" ? head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
    : image.type === "image/png" ? head[0] === 0x89 && head.toString("latin1", 1, 4) === "PNG"
    : head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP";
  return ok ? bytes : null;
}

export async function POST(request) {
  const { body, response } = await guard(request, { name: "listing", maxBytes: 4_400_000, limit: 5, windowMs: 30 * 60_000 });
  if (response) return response;

  const { values: v, fields, ok } = check(body, {
    name: rules.text(2, 80, "Give the asset a name."),
    category: rules.oneOf(categories, "Choose the closest category."),
    description: rules.text(40, 1200, "Describe it in at least 40 characters."),
    dealType: rules.oneOf(["Sell", "Rent or license"], "Choose sell or rent."),
    price: (p) => (Number.isInteger(p) && p >= 1000 && p <= 1_000_000_000 ? null : "Enter a whole price of at least ₹1,000."),
    rentPeriod: (r, b) => (b?.dealType === "Rent or license" ? (["month", "year"].includes(r) ? null : "Choose a rental period.") : null),
    age: rules.text(1, 40, "How old is the asset?"),
    condition: rules.text(20, 1500, "Say what works today (at least 20 characters)."),
    metrics: rules.text(0, 800, "", true),
    transfer: rules.oneOf(readiness, "Choose the most accurate statement."),
    dependencies: rules.text(0, 800, "", true),
    videoUrl: rules.link,
    seller: rules.text(1, 60, "A first name is enough."),
    contactMethod: rules.oneOf(["Email", "WhatsApp"], "Choose how we should reach you."),
    email: rules.email,
    whatsapp: (w, b) => (b?.contactMethod === "WhatsApp" ? (typeof w === "string" && w.replace(/\D/g, "").length >= 10 && w.length <= 20 ? null : "Enter a WhatsApp number with country code.") : null),
    linkedin: rules.link,
    eligibility: (e) => (e === true ? null : "Confirm that you have the right to offer this asset."),
    images: (list) => (list === undefined || (Array.isArray(list) && list.length <= 4) ? null : "Up to 4 images."),
  });
  if (!ok) return json({ ok: false, error: "Some answers need attention.", fields }, 422);

  const decoded = (v.images || []).map(decodeImage);
  if (decoded.some((b) => !b)) return json({ ok: false, error: "One of the images could not be used. Try JPG, PNG or WebP under 1 MB.", fields: {} }, 422);

  const ref = referenceId();
  if (body.website || Date.now() - Number(body.startedAt || 0) < MIN_FILL_MS) return json({ ok: true, ref });

  // 1. Upload images
  const uploaded = [];
  try {
    for (const [i, bytes] of decoded.entries()) {
      const type = v.images[i].type;
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const blob = await put(`listings/${ref}/${i + 1}.${ext}`, bytes, { access: "public", contentType: type, addRandomSuffix: true });
      uploaded.push(blob);
    }
  } catch (error) {
    console.error("Image upload failed", error);
    await Promise.allSettled(uploaded.map((b) => del(b.url)));
    return json({ ok: false, error: "The images could not be uploaded. Please try again." }, 502);
  }

  // 2. Write everything in one transaction. Sellers without an account get a
  //    profile keyed by their email so the listing has an owner.
  const sql = db();
  const listingId = crypto.randomUUID();
  const ownerId = `guest:${v.email.toLowerCase()}`;
  try {
    await sql.transaction([
      sql`INSERT INTO profiles (id, email, display_name, role) VALUES (${ownerId}, ${v.email}, ${v.seller}, 'seller') ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()`,
      sql`INSERT INTO listings (id, ref, owner_id, status, name, category, description, deal_type, price, rent_period, age, condition, metrics, transfer, dependencies, video_url, seller_name, contact_method, email, whatsapp, linkedin)
        VALUES (${listingId}, ${ref}, ${ownerId}, 'submitted', ${v.name}, ${v.category}, ${v.description}, ${v.dealType}, ${v.price}, ${v.dealType === "Rent or license" ? v.rentPeriod : ""}, ${v.age}, ${v.condition}, ${v.metrics || ""}, ${v.transfer}, ${v.dependencies || ""}, ${v.videoUrl || ""}, ${v.seller}, ${v.contactMethod}, ${v.email}, ${v.contactMethod === "WhatsApp" ? v.whatsapp : ""}, ${v.linkedin || ""})`,
      ...uploaded.map((b, i) => sql`INSERT INTO listing_images (listing_id, url, pathname, alt, position) VALUES (${listingId}, ${b.url}, ${b.pathname}, ${`${v.name}, image ${i + 1}`}, ${i})`),
      sql`INSERT INTO listing_events (listing_id, status, actor, note) VALUES (${listingId}, 'submitted', 'seller', 'Submitted from the website')`,
    ]);
  } catch (error) {
    console.error("Listing could not be stored", error);
    await Promise.allSettled(uploaded.map((b) => del(b.url)));
    return json({ ok: false, error: "The listing could not be submitted. Please try again shortly." }, 502);
  }

  const mode = await notifyDesk({
    subject: `New listing · ${v.name} · ${ref}`,
    replyTo: v.email,
    rows: [
      ["Reference", ref], ["Asset", v.name], ["Category", v.category], ["Deal", v.dealType], ["Price (INR)", String(v.price)],
      ["Age", v.age], ["Condition", v.condition], ["Transfer", v.transfer], ["Seller", v.seller], ["Contact", v.contactMethod],
      ["Email", v.email], ["WhatsApp", v.whatsapp], ["Images", uploaded.map((b) => b.url).join("\n")],
    ],
  });
  return json({ ok: true, ref, mode });
}
