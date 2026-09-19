import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  aggregateSupplierExportItems,
  createSupplierExcelXml,
  type SupplierExportItem,
} from "@/lib/supplierExport";

export const runtime = "nodejs";

type ClaimResult = {
  replayed?: boolean;
  empty?: boolean;
  message?: string;
  batch_id?: string;
  filename?: string;
};

export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { data, error } = await supabaseAdmin().rpc(
    "supplier_export_eligible_unit_count"
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: { eligible_units: Number(data || 0) } });
}

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const idempotencyKey = String(body?.idempotency_key ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return NextResponse.json(
      { error: "Chiave operazione non valida", code: "SUPPLIER_EXPORT_INVALID_KEY" },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();
  const { data: claimData, error: claimError } = await sb.rpc(
    "claim_supplier_export_batch",
    {
      p_idempotency_key: idempotencyKey,
      p_created_by: "admin-store-orders",
    }
  );
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const claim = (claimData ?? {}) as ClaimResult;
  if (claim.empty || !claim.batch_id) {
    return NextResponse.json(
      {
        error: claim.message || "Nessun articolo da ordinare al fornitore.",
        code: "SUPPLIER_EXPORT_EMPTY",
      },
      { status: 409 }
    );
  }

  const { data: items, error: itemsError } = await sb
    .from("store_order_items")
    .select(
      "id,order_id,product_id,color_id,size_id,product_name,custom_product_name,color_name,size_label,custom_variant,quantity"
    )
    .eq("supplier_export_batch_id", claim.batch_id)
    .order("created_at", { ascending: true });
  if (itemsError) {
    return NextResponse.json(
      {
        error: "Lotto creato; ripetere Genera Excel per rigenerare lo stesso file.",
        code: "SUPPLIER_EXPORT_FILE_RETRY",
        batch_id: claim.batch_id,
      },
      { status: 500 }
    );
  }

  const rows = aggregateSupplierExportItems((items ?? []) as SupplierExportItem[]);
  const workbook = createSupplierExcelXml(rows);
  const filename = claim.filename || `riepilogo-fornitore-${claim.batch_id}.xls`;

  return new NextResponse(workbook, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Supplier-Export-Batch-Id": claim.batch_id,
      "X-Supplier-Export-Replayed": claim.replayed ? "true" : "false",
    },
  });
}
