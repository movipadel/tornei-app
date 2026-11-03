import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/adminGuard';
// Retired endpoint: never create another ownerless subscription.
export async function POST() {
  const denied=await guardAdmin();if(denied)return denied;
  return NextResponse.json({ error: 'Aggiorna la pagina e usa la nuova iscrizione push', code: 'PUSH_REENROLL_REQUIRED' }, { status: 410 });
}
