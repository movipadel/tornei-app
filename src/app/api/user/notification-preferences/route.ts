import { getCurrentMoviUser } from "@/lib/currentMoviUser";
import { editorialJson } from "@/lib/padelleriaServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function userId() {
  const identity = await getCurrentMoviUser();
  if (identity.conflict_state) return { response: editorialJson({ error: "Sessione in conflitto: accedi nuovamente" }, 409) };
  if (!identity.public_user_id) return { response: editorialJson({ error: "Accedi per continuare" }, 401) };
  return { id: identity.public_user_id };
}

export async function GET() {
  const auth = await userId(); if (auth.response) return auth.response;
  const sb = supabaseAdmin();
  await sb.from("user_notification_preferences").upsert({ user_id: auth.id }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data, error } = await sb.from("user_notification_preferences").select("transactional_email_enabled,version,updated_at").eq("user_id", auth.id!).single();
  return error ? editorialJson({ error: "Preferenze notifiche non disponibili" }, 503) : editorialJson({ data });
}

export async function PATCH(req: Request) {
  const auth = await userId(); if (auth.response) return auth.response;
  const origin = req.headers.get("origin"); if (origin && origin !== new URL(req.url).origin) return editorialJson({ error: "Origine non consentita" }, 403);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["transactional_email_enabled", "expected_version"].includes(key)) || typeof body.transactional_email_enabled !== "boolean" || !Number.isInteger(body.expected_version) || body.expected_version < 1) return editorialJson({ error: "Preferenze non valide" }, 400);
  const { data, error } = await supabaseAdmin().from("user_notification_preferences").update({ transactional_email_enabled: body.transactional_email_enabled, version: body.expected_version + 1, updated_at: new Date().toISOString() }).eq("user_id", auth.id!).eq("version", body.expected_version).select("transactional_email_enabled,version,updated_at").maybeSingle();
  if (error) return editorialJson({ error: "Preferenze non salvate" }, 503);
  return data ? editorialJson({ data }) : editorialJson({ code: "STALE_PREFERENCES", error: "Le preferenze sono cambiate in un’altra sessione. Ricarica e riprova." }, 409);
}
