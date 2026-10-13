import { NextResponse } from "next/server";
import { guardOperatorPermission } from "@/lib/operatorAuthorization";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardOperatorPermission("moviback.manage"); if (denied) return denied;
  const { id } = await params; const url = new URL(request.url); const status = url.searchParams.get("status"); const batch = url.searchParams.get("batch"); const suffix = url.searchParams.get("suffix")?.replace(/[^a-z0-9]/gi, "").slice(-12);
  let query = supabaseAdmin().from("moviback_agreement_codes").select("id,code_suffix,batch_id,status,valid_from,valid_until,claimed_at,claimed_by_membership_id,revoked_at,created_at").eq("agreement_id", id).order("created_at", { ascending: false }).limit(500);
  if (status) query = query.eq("status", status); if (batch) query = query.eq("batch_id", batch); if (suffix) query = query.ilike("code_suffix", `%${suffix}%`);
  const { data, error } = await query; if (error) return NextResponse.json({ error: "Ricerca codici non disponibile" }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
