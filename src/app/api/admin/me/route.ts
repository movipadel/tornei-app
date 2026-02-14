import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  return NextResponse.json({ authed: true, role: "admin" });
}
