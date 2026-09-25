import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pageBounds } from '@/lib/padelleria';
import { editorialJson } from '@/lib/padelleriaServer';
import { partnerDTO } from '@/lib/partnersServer';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{const {limit,offset}=pageBounds(new URL(req.url).searchParams);const {data,error}=await supabaseAdmin().rpc('movi_partners_public_list',{p_limit:limit,p_offset:offset});if(error)return editorialJson({error:'Partner non disponibili'},500);return editorialJson({data:await partnerDTO(data??[]),limit,offset});}catch{return editorialJson({error:'Parametri non validi'},400);}}
