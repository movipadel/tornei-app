import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type SortItem = {
  id: string;
  sort_order: number;
};

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const category_id = String(body?.category_id ?? "").trim();
    const items = Array.isArray(body?.items) ? (body.items as SortItem[]) : [];

    if (!category_id) {
      return NextResponse.json({ error: "Categoria mancante" }, { status: 400 });
    }

    if (!items.length) {
      return NextResponse.json({ error: "Nessun prodotto da ordinare" }, { status: 400 });
    }

    const cleanItems = items
      .map((item, index) => ({
        id: String(item.id ?? "").trim(),
        sort_order: Number.isFinite(Number(item.sort_order))
          ? Math.trunc(Number(item.sort_order))
          : index + 1,
      }))
      .filter((item) => item.id);

    if (!cleanItems.length) {
      return NextResponse.json({ error: "Prodotti non validi" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    for (const item of cleanItems) {
      const { error } = await sb
        .from("store_products")
        .update({
          sort_order: item.sort_order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("category_id", category_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore ordinamento prodotti" },
      { status: 500 }
    );
  }
}