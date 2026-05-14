import { NextResponse } from "next/server";
import { getStaffSessionFromCookie } from "@/lib/staffSession";

export async function guardAdmin(_req?: Request) {
  const session = await getStaffSessionFromCookie();

  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}