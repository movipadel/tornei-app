import { NextResponse } from "next/server";
import { getCurrentMoviUser } from "@/lib/currentMoviUser";

export const runtime = "nodejs";

export async function GET() {
  const identity = await getCurrentMoviUser();
  if (identity.conflict_state) {
    return NextResponse.json(
      { user: null, error: "SESSION_IDENTITY_CONFLICT", conflict_state: identity.conflict_state },
      { status: 409 }
    );
  }
  return NextResponse.json({ user: identity.profile });
}
