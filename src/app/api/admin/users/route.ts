import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

function isRole(value: string): value is "admin" | "staff" {
  return value === "admin" || value === "staff";
}

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("staff_users")
    .select("id,full_name,email,role,is_active,last_login_at,created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  const fullName = String(body.full_name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "");

  if (!fullName) {
    return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email non valida" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password minima 8 caratteri" },
      { status: 400 }
    );
  }

  if (!isRole(role)) {
    return NextResponse.json({ error: "Ruolo non valido" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("staff_users")
    .insert({
      full_name: fullName,
      email,
      password_hash: null,
      role,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: updateErr } = await sb.rpc("set_staff_password", {
    p_staff_id: data.id,
    p_password: password,
  });

  if (updateErr) {
    await sb.from("staff_users").delete().eq("id", data.id);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}