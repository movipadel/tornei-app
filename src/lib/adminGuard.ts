import { NextResponse } from "next/server";
import { getCurrentOperator } from "@/lib/operatorAuthorization";

export async function guardAdmin(_req?: Request) {
  void _req;
  const operator = await getCurrentOperator();
  if (!operator || operator.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
