import { NextResponse } from "next/server";
import { getCurrentOperator } from "@/lib/operatorAuthorization";

export async function guardStaff() {
  const operator = await getCurrentOperator();
  if (!operator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function getStaffSessionOrNull() {
  return await getCurrentOperator();
}
