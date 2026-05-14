import { NextResponse } from "next/server";
import { getStaffSessionFromCookie } from "@/lib/staffSession";

export async function guardStaff() {
  const session = await getStaffSessionFromCookie();

  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.role !== "admin" && session.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

export async function getStaffSessionOrNull() {
  return await getStaffSessionFromCookie();
}