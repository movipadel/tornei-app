import { NextResponse } from "next/server";
import { mediaConsentSchemaAvailable } from "@/lib/mediaConsentCompatibility";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ available: await mediaConsentSchemaAvailable(supabaseAdmin()) });
  } catch {
    return NextResponse.json({ available: false }, { status: 503 });
  }
}
