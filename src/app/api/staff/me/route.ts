import { NextResponse } from "next/server";
import { getStaffSessionFromCookie } from "@/lib/staffSession";

export const runtime = "nodejs";

export async function GET() {
  const session = await getStaffSessionFromCookie();

  if (!session || (session.role !== "admin" && session.role !== "staff")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    authed: true,
    role: session.role,
    user: {
      id: session.sid,
      name: session.name,
      email: session.email,
    },
  });
}