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
  const view=params.get('view');
  if(view && view!=='archivio')return editorialJson({error:'Vista non valida'},400);
  if(view==='archivio'&&kind)return editorialJson({error:'Parametri non compatibili'},400);
  try{
    const requestedLimit=bounds.limit+1;
    const {data,error}=view==='archivio'
      ?await supabaseAdmin().rpc('padelleria_public_archive_list',{p_limit:requestedLimit,p_offset:bounds.offset})
      :await supabaseAdmin().rpc('padelleria_public_list',{p_kind:kind,p_limit:requestedLimit,p_offset:bounds.offset});
    if(error)throw error;
    const hasMore=(data??[]).length>bounds.limit;
    const items=await withMedia((data??[]).slice(0,bounds.limit),{coverOnly:true});
    const publicItems=items.map(item=>Object.fromEntries(Object.entries(item).filter(([key])=>key!=='delete_on_expiry')));
    return editorialJson({data:publicItems,...bounds,pagination:{...bounds,has_more:hasMore}});
  }catch{return editorialJson({error:'Contenuti temporaneamente non disponibili'},500);}
}
