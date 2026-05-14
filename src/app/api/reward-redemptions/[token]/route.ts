import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Token mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("reward_redemptions")
    .select(`
      id,
      status,
      points_cost,
      requested_at,
      approved_at,
      delivered_at,
      cancelled_at,
      notes,
      reward:rewards_catalog (
        id,
        name,
        description,
        category,
        image_path,
        points_cost,
        reward_type
      ),
      membership:loyalty_memberships (
        id,
        membership_code,
        membership_type,
        user:users (
          id,
          full_name,
          phone
        )
      )
    `)
    .eq("qr_token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "QR non valido" }, { status: 404 });
  }

  return NextResponse.json({
    data,
    valid: data.status === "requested",
  });
}