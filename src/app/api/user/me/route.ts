import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function GET() {
  const uid = await getUserIdFromCookie();
  if (!uid) return NextResponse.json({ user: null });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("id,full_name,phone,email,gender")
    .eq("id", uid)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}
