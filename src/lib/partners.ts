import { safeCta } from './padelleria';
import { callablePhone } from './partnerPhones';
export { callablePhone, whatsappPhone } from './partnerPhones';
export const PARTNER_BUCKET='movi-partners-media';
export const categories=['Ristorazione','Sport','Benessere','Abbigliamento','Gioielleria','Tecnologia e Telefonia','Casa e Design','Salute','Automotive','Turismo','Servizi','Professionisti','Altro'] as const;
export const membershipCopy='Mostra la tua tessera MOVI';
export type PartnerLocation={slot:1|2;label:string;address:string;locality:string;landline_phone:string;mobile_phone:string;mobile_action:'call'|'whatsapp'};
export type PartnerInput={status:'draft'|'active'|'inactive';name:string;slug:string;category:string;short_description:string;full_description:string;benefit_title:string;benefit_description:string;conditions:string;website_url:string|null;contact_url:string|null;instagram_url:string|null;facebook_url:string|null;contact_label:string|null;phone:string;address:string;locality:string;locations:PartnerLocation[];valid_from:string|null;valid_until:string|null;sort_order:number;featured:boolean};
export type Partner=PartnerInput&{id:string;created_at:string;updated_at:string;logo_url:string|null;cover_url:string|null;membership_copy:string};
export const validSlug=(s:string)=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)&&s.length<=120;
export const contactCtaLabel=(contactUrl:string|null,contactLabel:string|null)=>contactUrl?(contactLabel?.trim()||'Contatta'):null;
export const emptyLocation=(slot:1|2):PartnerLocation=>({slot,label:'',address:'',locality:'',landline_phone:'',mobile_phone:'',mobile_action:'call'});
export function parseLocations(value:unknown):PartnerLocation[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>2)throw new Error('Massimo due sedi');
 const slots=new Set<number>();
 return value.map((raw)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Sede non valida');
  const b=raw as Record<string,unknown>;
  if(b.slot!==1&&b.slot!==2||slots.has(b.slot as number))throw new Error('Numero sede non valido o duplicato');
  slots.add(b.slot as number);
  const field=(key:string,max:number)=>{if(typeof b[key]!=='string')throw new Error(`Campo ${key} non valido`);const s=(b[key] as string).trim();if(s.length>max)throw new Error(`Campo ${key} troppo lungo`);return s;};
  const location={slot:b.slot as 1|2,label:field('label',120),address:field('address',300),locality:field('locality',120),landline_phone:field('landline_phone',50),mobile_phone:field('mobile_phone',50),mobile_action:b.mobile_action};
  if(!['call','whatsapp'].includes(String(location.mobile_action)))throw new Error('Azione cellulare non valida');
  if(![location.address,location.locality,location.landline_phone,location.mobile_phone].some(Boolean))throw new Error('Completa la sede o rimuovila');
  if(location.landline_phone&&!callablePhone(location.landline_phone,'landline'))throw new Error('Telefono fisso non valido');
  if(location.mobile_phone&&!callablePhone(location.mobile_phone,'mobile'))throw new Error('Cellulare non valido');
  return location as PartnerLocation;
 }).sort((a,b)=>a.slot-b.slot);
}
export function slugify(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120).replace(/-$/,'');}
export function parsePartner(value:unknown):PartnerInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Dati non validi');
 const b=value as Record<string,unknown>;
 const text=(k:string,max:number,required=false)=>{if(typeof b[k]!=='string')throw new Error(`Campo ${k} non valido`);const s=(b[k] as string).trim();if(s.length>max||(required&&!s))throw new Error(`Campo ${k}: lunghezza non valida`);return s;};
 const date=(k:string)=>{const v=b[k];if(v===null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))throw new Error('Data con fuso orario richiesta');return new Date(v).toISOString();};
 const url=(k:string)=>{const s=b[k]===null?'':text(k,2000);if(s&&(!s.startsWith('https://')||!safeCta(s)))throw new Error('Link HTTPS valido richiesto');return s||null;};
 const optionalUrl=(k:string)=>b[k]===undefined?null:url(k);
 const optionalLabel=()=>{if(b.contact_label===undefined||b.contact_label===null)return null;if(typeof b.contact_label!=='string')throw new Error('Testo pulsante contatto non valido');const label=b.contact_label.trim();if(label.length>60||/[<>\x00-\x1f\x7f]/.test(label))throw new Error('Testo pulsante contatto non valido');return label||null;};
 if(typeof b.status!=='string'||!['draft','active','inactive'].includes(b.status))throw new Error('Stato non valido');
 const category=text('category',40,true);if(!categories.includes(category as typeof categories[number]))throw new Error('Categoria non valida');
 const slug=text('slug',120,true);if(!validSlug(slug))throw new Error('Slug: usa lettere minuscole, numeri e trattini');
 const from=date('valid_from'),until=date('valid_until');if(from&&until&&from>until)throw new Error('La fine validità precede l’inizio');
 if(typeof b.featured!=='boolean'||!Number.isInteger(b.sort_order)||Math.abs(Number(b.sort_order))>100000)throw new Error('Ordine o evidenza non validi');
 const phone=text('phone',50);if(phone&&!/^[+0-9() .-]+$/.test(phone))throw new Error('Telefono non valido');
 return {status:b.status as PartnerInput['status'],name:text('name',180,true),slug,category,short_description:text('short_description',500),full_description:text('full_description',15000),benefit_title:text('benefit_title',180,true),benefit_description:text('benefit_description',5000),conditions:text('conditions',5000),website_url:url('website_url'),contact_url:url('contact_url'),instagram_url:optionalUrl('instagram_url'),facebook_url:optionalUrl('facebook_url'),contact_label:optionalLabel(),phone,address:text('address',300),locality:text('locality',120),locations:parseLocations(b.locations),valid_from:from,valid_until:until,sort_order:Number(b.sort_order),featured:b.featured};
}
export function partnerVisible(p:Pick<PartnerInput,'status'|'valid_from'|'valid_until'>&{deleted_at?:string|null},now=Date.now()){return p.status==='active'&&!p.deleted_at&&(!p.valid_from||Date.parse(p.valid_from)<=now)&&(!p.valid_until||now<=Date.parse(p.valid_until));}
