import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createStaffSessionToken,
  staffCookieOptions,
  STAFF_COOKIE_NAME,
} from "@/lib/staffSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();

  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email e password obbligatorie" },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();

  const { data, error } = await sb.rpc("verify_staff_login", {
    p_email: email,
    p_password: password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const staff = Array.isArray(data) ? data[0] : null;

  if (!staff) {
    return NextResponse.json({ error: "Credenziali errate" }, { status: 401 });
  }

  if (staff.role !== "admin" && staff.role !== "staff") {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
  }

  await sb
    .from("staff_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", staff.id);

  const token = await createStaffSessionToken({
    sid: staff.id,
    role: staff.role,
    name: staff.full_name,
    email: staff.email,
  });

  const res = NextResponse.json({
    ok: true,
    role: staff.role,
  });

  res.cookies.set(STAFF_COOKIE_NAME, token, staffCookieOptions());

  return res;
}