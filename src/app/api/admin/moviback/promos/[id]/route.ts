import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (!id) {
    return NextResponse.json({ error: "ID promo mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const update: any = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.is_active === "boolean") {
    update.is_active = body.is_active;
  }

  const { data, error } = await sb
    .from("loyalty_global_promos")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "ID promo mancante" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { error } = await sb
    .from("loyalty_global_promos")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}