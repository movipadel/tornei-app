import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { contentId } from '@/lib/padelleriaServer';
import { ownedPath } from '@/lib/padelleria';
import { PARTNER_BUCKET, membershipCopy, validSlug, type PartnerInput, type Partner, type PartnerLocation } from '@/lib/partners';
import { partnerImageSrcSet, validPartnerVariants, type PartnerManifest } from '@/lib/partnerImageVariants';

const SIGNED_SECONDS=300;
const REUSE_MS=240_000;
const signedCache=new Map<string,{url:string;until:number}>();
async function signedPartnerUrls(paths:string[],tolerateErrors=false):Promise<Map<string,string>>{
 const urls=new Map<string,string>(),now=Date.now(),missing:string[]=[];
 for(const path of new Set(paths)){const cached=signedCache.get(path);if(cached&&cached.until>now)urls.set(path,cached.url);else missing.push(path);}
 if(missing.length){
  const {data,error}=await supabaseAdmin().storage.from(PARTNER_BUCKET).createSignedUrls(missing,SIGNED_SECONDS);
  if(error&&!tolerateErrors)throw new Error('Immagini non disponibili');
  const requested=new Set(missing);
  for(const item of data??[])if(item.path&&item.signedUrl&&requested.has(item.path)){
   urls.set(item.path,item.signedUrl);signedCache.set(item.path,{url:item.signedUrl,until:Date.now()+REUSE_MS});
  }
  if(signedCache.size>500){for(const [key,value] of signedCache)if(value.until<=now)signedCache.delete(key);while(signedCache.size>500)signedCache.delete(signedCache.keys().next().value as string);}
 }
 return urls;
}
type Row=Omit<PartnerInput,'locations'>&{id:string;created_at:string;updated_at:string;logo_path:string|null;cover_path:string|null;deleted_at:string|null};
export async function existingPartner(id:string){contentId(id);const {data,error}=await supabaseAdmin().from('movi_partners').select('*').eq('id',id).is('deleted_at',null).maybeSingle();if(error)throw new Error('Lettura Partner non riuscita');return data as Row|null;}
export async function partnerDTO(rows:Row[]):Promise<Partner[]>{
 const locations=new Map<string,PartnerLocation[]>();
 if(rows.length){const {data,error}=await supabaseAdmin().from('partner_locations').select('partner_id,slot,label,address,locality,landline_phone,mobile_phone,mobile_action').in('partner_id',rows.map(r=>r.id)).order('slot');if(error)throw new Error('Lettura sedi non riuscita');for(const row of data??[]){const list=locations.get(row.partner_id)??[];list.push({slot:row.slot,label:row.label,address:row.address,locality:row.locality,landline_phone:row.landline_phone,mobile_phone:row.mobile_phone,mobile_action:row.mobile_action});locations.set(row.partner_id,list);}}
 const paths=rows.flatMap(r=>[r.logo_path,r.cover_path].filter((p):p is string=>Boolean(p&&ownedPath(r.id,p))));
 const urls=await signedPartnerUrls(paths);
 const manifests=new Map<string,PartnerManifest>();
 if(paths.length){const {data}=await supabaseAdmin().from('movi_image_variants').select('original_path,source_width,variants').eq('bucket_id',PARTNER_BUCKET).in('original_path',[...new Set(paths)]);
  for(const row of data??[])manifests.set(row.original_path,row as PartnerManifest);}
 const variantsByPath=new Map(paths.map(path=>{
  const owner=path.split('/')[0];return [path,validPartnerVariants(owner,path,manifests.get(path))] as const;
 }));
 const variantUrls=await signedPartnerUrls([...variantsByPath.values()].flatMap(variants=>variants.map(v=>v.path)),true);
 return rows.map(r=>{const {logo_path,cover_path,deleted_at,...rest}=r;void deleted_at;
  const logoUrl=logo_path?urls.get(logo_path)??null:null,coverUrl=cover_path?urls.get(cover_path)??null:null;
  return {...rest,locations:locations.get(r.id)??[],logo_url:logoUrl,cover_url:coverUrl,
   logo_srcset:logo_path?partnerImageSrcSet(logoUrl,variantsByPath.get(logo_path)??[],variantUrls,manifests.get(logo_path)?.source_width??null):null,
   cover_srcset:cover_path?partnerImageSrcSet(coverUrl,variantsByPath.get(cover_path)??[],variantUrls,manifests.get(cover_path)?.source_width??null):null,
   membership_copy:membershipCopy};});
}
export async function publicPartnerBySlug(slug:string):Promise<Partner|null>{
 if(!validSlug(slug))return null;
 const {data,error}=await supabaseAdmin().rpc('movi_partners_public_list',{p_limit:1,p_offset:0,p_slug:slug});
 if(error)throw new Error('Partner non disponibile');
 return data?.length?(await partnerDTO(data))[0]:null;
}
