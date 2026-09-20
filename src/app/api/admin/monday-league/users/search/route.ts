import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return NextResponse.json({ data: [] });
  const safe = q.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
  if (safe.length < 2) return NextResponse.json({ data: [] });
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("id,full_name,phone,email")
    .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
    .order("full_name")
    .limit(12);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
