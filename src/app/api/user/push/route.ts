import { handlePushRequest } from '@/lib/pushApi';
export const runtime = 'nodejs';
export async function POST(req: Request) { return handlePushRequest(req,'customer'); }
