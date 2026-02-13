import { NextResponse } from 'next/server';
import { isAdminAuthed } from '@/lib/adminAuth';
import { guardAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;
  const ok = await isAdminAuthed();
  if (!ok) return NextResponse.json({ authed: false }, { status: 401 });
  return NextResponse.json({ authed: true, role: 'admin' });
}
