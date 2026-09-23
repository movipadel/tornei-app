import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { previewDuplicateGroup } from "@/lib/adminDuplicateWorkflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const session = await getStaffSessionFromCookie();
  const body = await request.json().catch(() => ({}));
  const group = String(body.group_id ?? "");
  const keep = String(body.keep_user_id ?? body.canonical_user_id ?? "");
  const choices = body.field_choices && typeof body.field_choices === "object" ? body.field_choices : {};
  if (!keep || !group) return NextResponse.json({ error: "Scegli il profilo da mantenere" }, { status: 400 });
  try {
    const data = await previewDuplicateGroup(group, keep, session!.sid, choices);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Non è stato possibile verificare il gruppo" }, { status: 409 });
  }
}
