import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { getStaffSessionFromCookie } from "@/lib/staffSession";
import { resolveDuplicateGroup } from "@/lib/adminDuplicateWorkflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const session = await getStaffSessionFromCookie();
  const body = await request.json().catch(() => ({}));
  const groupId = String(body.group_id ?? "");
  const keepUserId = String(body.keep_user_id ?? "");
  const choices = body.field_choices && typeof body.field_choices === "object" ? body.field_choices : {};
  if (!groupId || !keepUserId) return NextResponse.json({ error: "Scegli il profilo da mantenere" }, { status: 400 });
  try {
    const data = await resolveDuplicateGroup(groupId, keepUserId, session!.sid, choices);
    return NextResponse.json({ data }, { status: data.state === "attention" ? 409 : 200 });
  } catch {
    return NextResponse.json({ error: "Il gruppo è cambiato. Riapri il riepilogo aggiornato." }, { status: 409 });
  }
}
