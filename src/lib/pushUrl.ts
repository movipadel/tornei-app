export function safePushUrl(value: unknown, origin: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/';
  try { const url = new URL(value, origin); return url.origin === origin ? url.pathname + url.search + url.hash : '/'; } catch { return '/'; }
}
