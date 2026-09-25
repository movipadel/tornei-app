import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { validSlug } from '@/lib/partners';
import { editorialJson } from '@/lib/padelleriaServer';
import { partnerDTO } from '@/lib/partnersServer';
export const dynamic='force-dynamic';
export async function GET(_req:Request,ctx:{params:Promise<{slug:string}>}){const {slug}=await ctx.params;if(!validSlug(slug))return editorialJson({error:'Partner non trovato'},404);const {data,error}=await supabaseAdmin().rpc('movi_partners_public_list',{p_limit:1,p_offset:0,p_slug:slug});if(error)return editorialJson({error:'Partner non disponibili'},500);return data?.length?editorialJson({data:(await partnerDTO(data))[0]}):editorialJson({error:'Partner non trovato'},404);}
