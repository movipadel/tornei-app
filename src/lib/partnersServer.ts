import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { contentId } from '@/lib/padelleriaServer';
import { ownedPath } from '@/lib/padelleria';
import { PARTNER_BUCKET, membershipCopy, validSlug, type PartnerInput, type Partner, type PartnerLocation } from '@/lib/partners';
type Row=Omit<PartnerInput,'locations'>&{id:string;created_at:string;updated_at:string;logo_path:string|null;cover_path:string|null;deleted_at:string|null};
export async function existingPartner(id:string){contentId(id);const {data,error}=await supabaseAdmin().from('movi_partners').select('*').eq('id',id).is('deleted_at',null).maybeSingle();if(error)throw new Error('Lettura Partner non riuscita');return data as Row|null;}
export async function partnerDTO(rows:Row[]):Promise<Partner[]>{
 const locations=new Map<string,PartnerLocation[]>();
 if(rows.length){const {data,error}=await supabaseAdmin().from('partner_locations').select('partner_id,slot,label,address,locality,landline_phone,mobile_phone,mobile_action').in('partner_id',rows.map(r=>r.id)).order('slot');if(error)throw new Error('Lettura sedi non riuscita');for(const row of data??[]){const list=locations.get(row.partner_id)??[];list.push({slot:row.slot,label:row.label,address:row.address,locality:row.locality,landline_phone:row.landline_phone,mobile_phone:row.mobile_phone,mobile_action:row.mobile_action});locations.set(row.partner_id,list);}}
 const paths=rows.flatMap(r=>[r.logo_path,r.cover_path].filter((p):p is string=>Boolean(p&&ownedPath(r.id,p))));
 const urls=new Map<string,string>();if(paths.length){const {data,error}=await supabaseAdmin().storage.from(PARTNER_BUCKET).createSignedUrls([...new Set(paths)],300);if(error)throw new Error('Immagini non disponibili');for(const x of data??[])if(x.path&&x.signedUrl)urls.set(x.path,x.signedUrl);}
 return rows.map(r=>{const {logo_path,cover_path,deleted_at,...rest}=r;void deleted_at;return {...rest,locations:locations.get(r.id)??[],logo_url:logo_path?urls.get(logo_path)??null:null,cover_url:cover_path?urls.get(cover_path)??null:null,membership_copy:membershipCopy};});
}
export async function publicPartnerBySlug(slug:string):Promise<Partner|null>{
 if(!validSlug(slug))return null;
 const {data,error}=await supabaseAdmin().rpc('movi_partners_public_list',{p_limit:1,p_offset:0,p_slug:slug});
 if(error)throw new Error('Partner non disponibile');
 return data?.length?(await partnerDTO(data))[0]:null;
}
