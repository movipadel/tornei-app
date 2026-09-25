import { safeCta } from './padelleria';
export const PARTNER_BUCKET='movi-partners-media';
export const categories=['Ristorazione','Sport','Benessere','Abbigliamento','Servizi','Altro'] as const;
export const membershipCopy='Mostra la tua tessera MOVI';
export type PartnerInput={status:'draft'|'active'|'inactive';name:string;slug:string;category:string;short_description:string;full_description:string;benefit_title:string;benefit_description:string;conditions:string;website_url:string|null;contact_url:string|null;phone:string;address:string;locality:string;valid_from:string|null;valid_until:string|null;sort_order:number;featured:boolean};
export type Partner=PartnerInput&{id:string;created_at:string;updated_at:string;logo_url:string|null;cover_url:string|null;membership_copy:string};
export const validSlug=(s:string)=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)&&s.length<=120;
export function slugify(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120).replace(/-$/,'');}
export function parsePartner(value:unknown):PartnerInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Dati non validi');
 const b=value as Record<string,unknown>;
 const text=(k:string,max:number,required=false)=>{if(typeof b[k]!=='string')throw new Error(`Campo ${k} non valido`);const s=(b[k] as string).trim();if(s.length>max||(required&&!s))throw new Error(`Campo ${k}: lunghezza non valida`);return s;};
 const date=(k:string)=>{const v=b[k];if(v===null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))throw new Error('Data con fuso orario richiesta');return new Date(v).toISOString();};
 const url=(k:string)=>{const s=b[k]===null?'':text(k,2000);if(s&&(!s.startsWith('https://')||!safeCta(s)))throw new Error('Link HTTPS valido richiesto');return s||null;};
 if(typeof b.status!=='string'||!['draft','active','inactive'].includes(b.status))throw new Error('Stato non valido');
 const category=text('category',40,true);if(!categories.includes(category as typeof categories[number]))throw new Error('Categoria non valida');
 const slug=text('slug',120,true);if(!validSlug(slug))throw new Error('Slug: usa lettere minuscole, numeri e trattini');
 const from=date('valid_from'),until=date('valid_until');if(from&&until&&from>until)throw new Error('La fine validità precede l’inizio');
 if(typeof b.featured!=='boolean'||!Number.isInteger(b.sort_order)||Math.abs(Number(b.sort_order))>100000)throw new Error('Ordine o evidenza non validi');
 const phone=text('phone',50);if(phone&&!/^[+0-9() .-]+$/.test(phone))throw new Error('Telefono non valido');
 return {status:b.status as PartnerInput['status'],name:text('name',180,true),slug,category,short_description:text('short_description',500),full_description:text('full_description',15000),benefit_title:text('benefit_title',180,true),benefit_description:text('benefit_description',5000),conditions:text('conditions',5000),website_url:url('website_url'),contact_url:url('contact_url'),phone,address:text('address',300),locality:text('locality',120),valid_from:from,valid_until:until,sort_order:Number(b.sort_order),featured:b.featured};
}
export function partnerVisible(p:Pick<PartnerInput,'status'|'valid_from'|'valid_until'>&{deleted_at?:string|null},now=Date.now()){return p.status==='active'&&!p.deleted_at&&(!p.valid_from||Date.parse(p.valid_from)<=now)&&(!p.valid_until||now<=Date.parse(p.valid_until));}
