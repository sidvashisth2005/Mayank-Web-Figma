// POST /api/enquiries: an enquiry about a catalogue record, or a general
// question for the review desk. Stored in the existing enquiries table.
import { catalogueSlugs, check, db, guard, json, MIN_FILL_MS, notifyDesk, referenceId, rules } from "./_lib/server.js";

const intents = ["Buy outright", "Rent or licence", "Ask about similar assets", "Ask a question"];

export async function POST(request) {
  const { body, response } = await guard(request, { name: "enquiry", maxBytes: 20_000, limit: 10 });
  if (response) return response;

  const records = catalogueSlugs();
  const { values: v, fields, ok } = check(body, {
    asset: (a) => (a === "general" || records.has(a) ? null : "This record is not open for enquiries."),
    name: rules.text(1, 80, "Enter your name."),
    email: rules.email,
    company: rules.text(0, 120, "", true),
    budget: rules.text(0, 40, "", true),
    intent: rules.oneOf(intents, "Choose what you want to do."),
    message: rules.text(20, 2000, "Tell the desk a little more (at least 20 characters)."),
  });
  if (!ok) return json({ ok: false, error: fields.asset || "Some answers need attention.", fields }, 422);

  const ref = referenceId();
  // Honeypot or an inhumanly fast submission: accept quietly, store nothing.
  if (body.website || Date.now() - Number(body.startedAt || 0) < MIN_FILL_MS) return json({ ok: true, ref });

  const record = v.asset === "general" ? null : records.get(v.asset);
  if (record && record.status !== "live") return json({ ok: false, error: "This record is closed." }, 409);

  try {
    await db()`INSERT INTO enquiries (ref, sample_slug, name, email, company, intent, budget, message)
      VALUES (${ref}, ${record ? record.slug : null}, ${v.name}, ${v.email}, ${v.company || ""}, ${v.intent}, ${v.budget || ""}, ${v.message})`;
  } catch (error) {
    console.error("Enquiry could not be stored", error);
    return json({ ok: false, error: "The enquiry could not be sent. Please try again shortly." }, 502);
  }

  const label = record ? `${record.id} / ${record.name} (sample listing)` : "General question";
  const mode = await notifyDesk({
    subject: `Enquiry · ${label} · ${ref}`,
    replyTo: v.email,
    rows: [["Reference", ref], ["Record", label], ["Intent", v.intent], ["Name", v.name], ["Email", v.email], ["Company", v.company], ["Budget", v.budget], ["Message", v.message]],
  });
  return json({ ok: true, ref, mode });
}
