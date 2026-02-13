import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/adminSession";

export function guardAdmin(req: Request) {
  if (!requireAdminFromRequest(req)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }
  return null;
}
