import { ECDH } from 'node:crypto';
export type PushOwner = { publicUserId: string | null; staffUserId: string | null };
export function validatePushEndpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || value !== value.trim()) throw new Error('PUSH_ENDPOINT_INVALID');
  const url = new URL(value);
  const host = url.hostname;
  const allowed = host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host === 'updates.push.services.mozilla.com' || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.pathname === '/') throw new Error('PUSH_ENDPOINT_INVALID');
  return url.href;
}
function key(value: unknown, bytes: number) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value) || value.length > 88) throw new Error('PUSH_KEY_INVALID');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== bytes || decoded.toString('base64url') !== value.replace(/=+$/, '')) throw new Error('PUSH_KEY_INVALID');
  return decoded;
}
export function validatePushSubscription(body: Record<string, unknown>) {
  const endpoint = validatePushEndpoint(body.endpoint);
  const keys = body.keys as Record<string, unknown> | undefined;
  const publicKey = key(keys?.p256dh, 65);
  if (publicKey[0] !== 4) throw new Error('PUSH_KEY_INVALID');
  try { ECDH.convertKey(publicKey, 'prime256v1'); } catch { throw new Error('PUSH_KEY_INVALID'); }
  return { endpoint, p256dh: publicKey.toString('base64url'), auth: key(keys?.auth, 16).toString('base64url') };
}
export async function readPushBody(req: Request): Promise<Record<string, unknown>> {
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Error('PUSH_CONTENT_TYPE');
  if (Number(req.headers.get('content-length') || 0) > 4096) throw new Error('PUSH_BODY_TOO_LARGE');
  const reader = req.body?.getReader();
  if (!reader) throw new Error('PUSH_BODY_INVALID');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    length += chunk.value.length;
    if (length > 4096) { await reader.cancel(); throw new Error('PUSH_BODY_TOO_LARGE'); }
    chunks.push(chunk.value);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['action','endpoint','keys','expirationTime'].includes(k))) throw new Error('PUSH_BODY_INVALID');
  return body;
}
