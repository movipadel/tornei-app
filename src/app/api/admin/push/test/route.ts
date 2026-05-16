import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";
import { sendAdminPushNotification } from "@/lib/adminPush";

export const runtime = "nodejs";

export async function POST() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const result = await sendAdminPushNotification({
    title: "🔔 Test push MOVI",
    body: "Se leggi questa notifica, le push admin funzionano.",
    url: "/admin",
  });

  return NextResponse.json({ ok: true, result });
}