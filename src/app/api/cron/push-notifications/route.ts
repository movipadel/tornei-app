import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { processPushDeliveries } from '@/lib/pushDelivery';
import { pushTransportEnabled,pushVapidPreflight } from '@/lib/pushTransport';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request) {
  const expected=Buffer.from(process.env.CRON_SECRET??'');
  const actual=Buffer.from(req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')??'');
  if(!expected.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!pushTransportEnabled())return NextResponse.json({enabled:false,claimed:0});
  try{pushVapidPreflight();return NextResponse.json(await processPushDeliveries());}
  catch{return NextResponse.json({error:'Push processing failed'},{status:503});}
}
