import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createUserSessionToken, userCookieOptions, USER_COOKIE_NAME } from "@/lib/userAuth";

export const runtime = "nodejs";

const normalizePhone = (s: string) => s.trim().replace(/\s+/g, "");

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const full_name = String(body.full_name ?? "").trim();
  const phone = normalizePhone(String(body.phone ?? ""));
  const email = String(body.email ?? "").trim();
  const gender = String(body.gender ?? "").trim().toUpperCase();

  if (!full_name) return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Telefono obbligatorio" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email obbligatoria" }, { status: 400 });
  if (!["M", "F"].includes(gender)) return NextResponse.json({ error: "Sesso non valido (M/F)" }, { status: 400 });

  const sb = supabaseAdmin();

  // upsert per phone (phone è unique)
  const payload = {
    full_name,
    phone,
    email,
    gender,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("users")
    .upsert(payload, { onConflict: "phone" })
    .select("id,full_name,phone,email,gender")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const token = createUserSessionToken(data.id);

  const res = NextResponse.json({ user: data });
  res.cookies.set(USER_COOKIE_NAME, token, userCookieOptions());
  return res;
}
