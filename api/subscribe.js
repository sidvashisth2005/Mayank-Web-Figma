// POST /api/subscribe: "new records" sign-ups, stored as a Newsletter
// enquiry so the review desk sees them alongside everything else.
import { check, db, guard, json, MIN_FILL_MS, referenceId, rules } from "./_lib/server.js";

export async function POST(request) {
  const { body, response } = await guard(request, { name: "subscribe", maxBytes: 2_000, limit: 5 });
  if (response) return response;
  const { values, ok } = check(body, { email: rules.email });
  if (!ok) return json({ ok: false, error: "Enter a valid email." }, 422);
  if (body.website || Date.now() - Number(body.startedAt || 0) < MIN_FILL_MS) return json({ ok: true });

  try {
    const sql = db();
    const [existing] = await sql`SELECT 1 FROM enquiries WHERE intent = 'Newsletter' AND lower(email) = lower(${values.email}) LIMIT 1`;
    if (!existing) {
      await sql`INSERT INTO enquiries (ref, name, email, intent, message)
        VALUES (${referenceId()}, 'Newsletter subscriber', ${values.email}, 'Newsletter', 'Send me new records.')`;
    }
  } catch (error) {
    console.error("Subscription could not be stored", error);
    return json({ ok: false, error: "Please try again shortly." }, 502);
  }
  return json({ ok: true });
}
