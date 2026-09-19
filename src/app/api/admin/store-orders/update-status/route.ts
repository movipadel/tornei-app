import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  await req.json().catch(() => ({}));

  return NextResponse.json(
    {
      error: "La modifica diretta dello stato non è più disponibile. Usa un comando operativo.",
      code: "RAW_STATUS_MUTATION_DISABLED",
      allowed_commands: ["ready", "deliver", "cancel"],
    },
    { status: 410 }
  );
}
