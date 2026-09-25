import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pageBounds } from '@/lib/padelleria';
import { parsePartner } from '@/lib/partners';
import { editorialAdmin, editorialJson } from '@/lib/padelleriaServer';
import { partnerDTO } from '@/lib/partnersServer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){return editorialAdmin(req,async()=>{
 const params=new URL(req.url).searchParams,{limit,offset}=pageBounds(params),status=params.get('status');
 let q=supabaseAdmin().from('movi_partners').select('*').is('deleted_at',null);
 if(status){if(!['draft','active','inactive'].includes(status))throw new Error('Stato non valido');q=q.eq('status',status);}
 const {data,error}=await q.order('featured',{ascending:false}).order('sort_order').order('name').order('id').range(offset,offset+limit-1);
 if(error)return editorialJson({error:'Lista non disponibile'},500);return editorialJson({data:await partnerDTO(data??[]),limit,offset});
});}
export async function POST(req:Request){return editorialAdmin(req,async()=>{
 const input=parsePartner(await req.json());const {data,error}=await supabaseAdmin().from('movi_partners').insert(input).select('*').single();
 if(error)return editorialJson({error:error.code==='23505'?'Slug già utilizzato':'Creazione non riuscita'},error.code==='23505'?409:500);
 return editorialJson({data:(await partnerDTO([data]))[0]},201);
});}
