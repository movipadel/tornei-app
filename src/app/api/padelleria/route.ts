import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pageBounds } from '@/lib/padelleria';
import { editorialJson, withMedia } from '@/lib/padelleriaServer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
  const params=new URL(req.url).searchParams;
  let bounds;
  try{bounds=pageBounds(params);}catch(e){return editorialJson({error:(e as Error).message},400);}
  const kind=params.get('kind');
  if(kind && !['succede','e_successo'].includes(kind))return editorialJson({error:'Tipo non valido'},400);
  try{
    const {data,error}=await supabaseAdmin().rpc('padelleria_public_list',{p_kind:kind,p_limit:bounds.limit,p_offset:bounds.offset});
    if(error)throw error;
    return editorialJson({data:await withMedia(data??[]),...bounds});
  }catch{return editorialJson({error:'Contenuti temporaneamente non disponibili'},500);}
}
