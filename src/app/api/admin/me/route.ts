import { NextResponse } from "next/server";
import { getCurrentOperator } from "@/lib/operatorAuthorization";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentOperator();

  if (!session || session.role !== "admin") {
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
