import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function GET() {
  const uid = await getUserIdFromCookie();

  const sb = supabaseAdmin();

  let membershipStatus: string | null = null;

  if (uid) {
    const { data: membership } = await sb
      .from("loyalty_memberships")
      .select("status")
      .eq("user_id", uid)
      .maybeSingle();

    membershipStatus = membership?.status ?? null;
  }

  const targets = ["all", "moviback"];

  if (membershipStatus === "approved") targets.push("moviback_approved");
  if (membershipStatus === "pending_review") targets.push("moviback_pending");
  if (membershipStatus === "suspended") targets.push("moviback_suspended");

  const now = new Date().toISOString();

  const { data, error } = await sb
    .from("communications")
    .select("id,target,title,body,image_path,cta_label,cta_url,starts_at,ends_at,created_at")
    .eq("is_active", true)
    .in("target", targets)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}