// Shared helpers for the API functions. Files under api/_lib are not routes.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let client = null;
export function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  client ??= neon(url);
  return client;
}

let catalogue = null;
export function catalogueSlugs() {
  catalogue ??= JSON.parse(readFileSync(join(process.cwd(), "data/catalogue.json"), "utf8"));
  return new Map(catalogue.records.map((r) => [r.slug, r]));
}

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

// Six hex characters, matching the reference format the database already uses.
export const referenceId = () => `MYK-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;

// Submissions faster than this are treated as bots and quietly accepted.
export const MIN_FILL_MS = 3000;

// Best-effort limit per instance; pair with a Vercel Firewall rule in production.
const hits = new Map();
function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

// Checks method, origin, size and rate, then parses the JSON body.
export async function guard(request, { name, maxBytes, limit, windowMs = 10 * 60_000 }) {
  if (request.method !== "POST") return { response: json({ ok: false, error: "Method not allowed." }, 405) };
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return { response: json({ ok: false, error: "Cross-site requests are not accepted." }, 403) };
  if (!(request.headers.get("content-type") || "").includes("application/json")) return { response: json({ ok: false, error: "Send JSON." }, 415) };
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) return { response: json({ ok: false, error: "That submission is too large." }, 413) };
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (rateLimited(`${name}:${ip}`, limit, windowMs)) return { response: json({ ok: false, error: "Too many submissions. Please wait a few minutes." }, 429) };
  try {
    const text = await request.text();
    if (text.length > maxBytes) return { response: json({ ok: false, error: "That submission is too large." }, 413) };
    return { body: JSON.parse(text) };
  } catch {
    return { response: json({ ok: false, error: "The submission could not be read." }, 400) };
  }
}

// Small validator: each rule returns an error message or null.
export function check(body, rules) {
  const values = {};
  const fields = {};
  for (const [key, rule] of Object.entries(rules)) {
    const raw = body?.[key];
    const value = typeof raw === "string" ? raw.trim() : raw;
    const error = rule(value, body);
    if (error) fields[key] ??= error;
    else values[key] = value;
  }
  return { values, fields, ok: Object.keys(fields).length === 0 };
}

export const rules = {
  text: (min, max, message, optional = false) => (v) => {
    if (v === undefined || v === null || v === "") return optional ? null : message;
    if (typeof v !== "string") return message;
    if (v.length < min) return message;
    if (v.length > max) return `Keep this under ${max} characters.`;
    return null;
  },
  email: (v) => (typeof v === "string" && v.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "Enter a valid email address."),
  oneOf: (options, message) => (v) => (options.includes(v) ? null : message),
  link: (v) => (!v ? null : typeof v === "string" && v.length <= 300 && /^https?:\/\/[^\s]+$/i.test(v) ? null : "Use a full link starting with https://"),
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Notifies the review desk through Resend. Without the keys it is skipped and
// the submission is still stored in the database.
export async function notifyDesk({ subject, rows, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  const inbox = process.env.MAYANK_INBOX_EMAIL;
  if (!key || !inbox) return "stored";
  const html = `<table style="font-family:Helvetica,Arial,sans-serif;font-size:14px;border-collapse:collapse;max-width:680px">${rows
    .map(([label, value]) => `<tr><td style="padding:10px 16px 10px 0;border-bottom:1px solid #ddd;color:#666;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #ddd;white-space:pre-wrap">${escapeHtml(value || "Not provided")}</td></tr>`)
    .join("")}</table>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAYANK_FROM_EMAIL || "Mayank <onboarding@resend.dev>",
        to: [inbox],
        reply_to: replyTo,
        subject,
        html,
        text: rows.map(([label, value]) => `${label}: ${value || "Not provided"}`).join("\n"),
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return "sent";
  } catch (error) {
    console.error("Desk notification failed", error);
    return "stored";
  }
}
