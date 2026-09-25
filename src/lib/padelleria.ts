// Shared pure contract: safe in browser, server and Node tests.
export const CONTENT_BUCKET = 'padelleria-content-media';
export type ContentKind = 'succede' | 'e_successo';
export type ContentInput = {
  kind: ContentKind; status: 'draft' | 'published'; title: string; excerpt: string; body: string;
  featured: boolean; sort_order: number; cta_label: string | null; cta_url: string | null;
  occurred_at: string | null; visible_from: string | null; visible_until: string | null;
};
export type ContentMedia = { id: string; content_id: string; media_type: 'image' | 'video'; role: 'cover' | 'gallery' | 'video'; caption: string; sort_order: number; url: string | null; external_url: string | null };
export type ContentItem = ContentInput & { id: string; published_at: string | null; created_at: string; updated_at: string; media: ContentMedia[] };
export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function safeCta(value: string) {
  if (/[\u0000-\u0020\\]/.test(value)) return false;
  if (/^\/[^/]/.test(value)) return true;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
export function videoUrl(value: string) {
  let u: URL;
  try { u = new URL(value); } catch { throw new Error('Inserisci un URL YouTube o Vimeo valido'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('Video: usa HTTPS YouTube o Vimeo');
  const host = u.hostname.toLowerCase();
  const id = host === 'youtu.be' ? u.pathname.slice(1) : ['youtube.com','www.youtube.com'].includes(host) && u.pathname === '/watch' ? u.searchParams.get('v') : null;
  if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  if (['vimeo.com','www.vimeo.com'].includes(host) && /^\/\d{1,12}$/.test(u.pathname)) return `https://vimeo.com${u.pathname}`;
  throw new Error('Sono ammessi solo video YouTube (watch o youtu.be) e Vimeo');
}
export function videoEmbed(value: string) {
  const canonical = videoUrl(value);
  return canonical.includes('youtube.com') ? `https://www.youtube-nocookie.com/embed/${new URL(canonical).searchParams.get('v')}` : `https://player.vimeo.com/video/${new URL(canonical).pathname.slice(1)}`;
}
export function parseContent(value: unknown): ContentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dati non validi');
  const b = value as Record<string, unknown>;
  const text = (key: string, max: number, required = false) => {
    if (typeof b[key] !== 'string') throw new Error(`Campo ${key} non valido`);
    const s = (b[key] as string).trim();
    if (s.length > max || (required && !s)) throw new Error(`Campo ${key}: lunghezza non valida`);
    return s;
  };
  const date = (key: string) => {
    const v = b[key]; if (v === null || v === '') return null;
    if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(v) || !Number.isFinite(Date.parse(v))) throw new Error(`Campo ${key}: data con fuso orario richiesta`);
    return new Date(v).toISOString();
  };
  if (!['succede','e_successo'].includes(String(b.kind)) || !['draft','published'].includes(String(b.status))) throw new Error('Tipo o stato non valido');
  if (typeof b.featured !== 'boolean' || !Number.isInteger(b.sort_order) || Math.abs(Number(b.sort_order)) > 100000) throw new Error('Ordine o evidenza non validi');
  const label = b.cta_label === null ? '' : text('cta_label',100);
  const url = b.cta_url === null ? '' : text('cta_url',2000);
  if (Boolean(label) !== Boolean(url) || (url && !safeCta(url))) throw new Error('CTA: testo e URL HTTPS o percorso interno richiesti insieme');
  const from=date('visible_from'), until=date('visible_until');
  if (b.kind === 'e_successo' && (from || until)) throw new Error('È successo non prevede finestre di scadenza');
  if (from && until && from > until) throw new Error('La fine visibilità precede l’inizio');
  return {kind:b.kind as ContentKind,status:b.status as ContentInput['status'],title:text('title',180,true),excerpt:text('excerpt',500),body:text('body',30000),featured:b.featured,sort_order:Number(b.sort_order),cta_label:label||null,cta_url:url||null,occurred_at:date('occurred_at'),visible_from:from,visible_until:until};
}
export function visible(c: Pick<ContentItem,'kind'|'status'|'visible_from'|'visible_until'>, now=Date.now()) {
  return c.status==='published' && (c.kind==='e_successo' || ((!c.visible_from || Date.parse(c.visible_from)<=now) && (!c.visible_until || now<=Date.parse(c.visible_until))));
}
export function pageBounds(params: URLSearchParams) {
  const number = (name:string, fallback:number,max:number,min:number) => {
    const v=params.get(name); if(v===null) return fallback;
    if(!/^\d+$/.test(v) || Number(v)<min || Number(v)>max) throw new Error(`Parametro ${name} fuori limite`);
    return Number(v);
  };
  return {limit:number('limit',12,50,1),offset:number('offset',0,10000,0)};
}
export function ownedPath(contentId:string,path:string) {
  return isUuid(contentId) && new RegExp(`^${contentId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,'i').test(path);
}
export function imageExtension(bytes:Uint8Array,mime:string) {
  if(bytes.length===0 || bytes.length>5*1024*1024) throw new Error('Immagine: massimo 5 MiB');
  const starts=(arr:number[])=>arr.every((v,i)=>bytes[i]===v);
  if(mime==='image/png' && starts([137,80,78,71,13,10,26,10])) return 'png';
  if(mime==='image/jpeg' && starts([255,216,255])) return 'jpg';
  if(mime==='image/webp' && new TextDecoder().decode(bytes.slice(0,4))==='RIFF' && new TextDecoder().decode(bytes.slice(8,12))==='WEBP') return 'webp';
  throw new Error('Formato non valido: usa PNG, JPEG o WebP coerenti con il file');
}
const romeParts = (date:Date) => Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
export function romeInput(iso:string|null) { if(!iso)return ''; const p=romeParts(new Date(iso)); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`; }
export function romeToUtc(local:string) {
  if(!local)return null;
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(local)) throw new Error('Data locale non valida');
  const normalized=local.length===16?`${local}:00`:local;
  const nominal=Date.parse(`${normalized}Z`);
  const candidates=[1,2].map(h=>new Date(nominal-h*3600000)).filter(d=>Number.isFinite(d.getTime()) && romeInput(d.toISOString())===normalized);
  if(candidates.length!==1) throw new Error('Orario Europe/Rome inesistente o ambiguo per cambio ora: scegli un altro orario');
  return candidates[0].toISOString();
}
