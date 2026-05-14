import { NextResponse } from "next/server";
import { getStoreEconomicsAccess } from "@/lib/storeEconomicsAccess";

export async function GET() {
  const { allowed } = await getStoreEconomicsAccess();

  return NextResponse.json({ allowed });
}