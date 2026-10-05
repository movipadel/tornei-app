import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pageBounds, parseContent } from '@/lib/padelleria';
import { editorialOperator, editorialJson, withMedia } from '@/lib/padelleriaServer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){return editorialOperator(req,'padelleria.manage',async()=>{
  const params=new URL(req.url).searchParams;
  const {limit,offset}=pageBounds(params);
  let query=supabaseAdmin().from('padelleria_contents').select('*').is('deleted_at',null);
  const kind=params.get('kind'),status=params.get('status');
  if(kind){if(!['succede','e_successo'].includes(kind))throw new Error('Tipo non valido');query=query.eq('kind',kind);}
  if(status){if(!['draft','published'].includes(status))throw new Error('Stato non valido');query=query.eq('status',status);}
  const {data,error}=await query.order('featured',{ascending:false}).order('sort_order').order('created_at',{ascending:false}).order('id').range(offset,offset+limit-1);
  if(error)return editorialJson({error:'Lista non disponibile'},500);
  return editorialJson({data:await withMedia(data??[]),limit,offset});
});}
export async function POST(req:Request){return editorialOperator(req,'padelleria.manage',async()=>{
  const input=parseContent(await req.json());
  const {data,error}=await supabaseAdmin().from('padelleria_contents').insert(input).select('*').single();
  if(error)return editorialJson({error:'Creazione non riuscita'},500);
  return editorialJson({data:{...data,media:[]}},201);
});}
