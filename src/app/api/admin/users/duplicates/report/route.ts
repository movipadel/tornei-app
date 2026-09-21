import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const groupId = params.get("group_id");
  const format = params.get("format") === "csv" ? "csv" : "json";
  const { data, error } = await supabaseAdmin().rpc("duplicate_migration_dry_run", {
    p_group_id: groupId || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (format === "json") {
    return NextResponse.json({ generated_at: new Date().toISOString(), read_only: true, data: rows });
  }
  const headers = ["group_id", "source_user_id", "canonical_user_id", "confidence", "recommendation", "blockers", "domain_moves", "fields_to_keep", "consent_outcome", "auth_outcome", "expected_alias", "expected_soft_merge"];
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(headers.map((header) => csvCell(typeof row[header] === "object" ? JSON.stringify(row[header]) : row[header])).join(","));
  return new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="movi-auth-stage4-dry-run.csv"',
      "Cache-Control": "no-store",
    },
  });
}
