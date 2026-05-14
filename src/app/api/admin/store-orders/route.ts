import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const club = searchParams.get("club");

  const sb = supabaseAdmin();

  let query = sb
    .from("store_orders")
    .select(`
      *,
      store_order_items (*)
    `)
    .order("created_at", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);
  if (club && club !== "all") query = query.eq("pickup_club", club);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}