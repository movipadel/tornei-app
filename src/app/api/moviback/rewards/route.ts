import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";

export const runtime = "nodejs";

export async function GET() {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const { data: rewards, error: rewardsErr } = await sb
    .from("rewards_catalog")
    .select("id,name,description,category,points_cost,image_path,stock_qty,reward_type")
    .eq("is_active", true)
    .order("points_cost", { ascending: true });

  if (rewardsErr) {
    return NextResponse.json({ error: rewardsErr.message }, { status: 500 });
  }

  const { data: categories, error: categoriesErr } = await sb
    .from("reward_categories")
    .select("id,name,sort_order,is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (categoriesErr) {
    return NextResponse.json({ error: categoriesErr.message }, { status: 500 });
  }

  const { data: pointRanges, error: rangesErr } = await sb
    .from("reward_point_ranges")
    .select("id,label,min_points,max_points,sort_order,is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (rangesErr) {
    return NextResponse.json({ error: rangesErr.message }, { status: 500 });
  }

  return NextResponse.json({
    data: rewards ?? [],
    filters: {
      categories: categories ?? [],
      point_ranges: pointRanges ?? [],
    },
  });
}