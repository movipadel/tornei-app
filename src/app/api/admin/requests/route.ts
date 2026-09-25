import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pageBounds } from '@/lib/padelleria';
import { statusLabels } from '@/lib/moviRequests';
import { editorialAdmin,editorialJson } from '@/lib/padelleriaServer';
import { adminRequests } from '@/lib/moviRequestsServer';
export const dynamic='force-dynamic';
export async function GET(req:Request){return editorialAdmin(req,async()=>{const p=new URL(req.url).searchParams,{limit,offset}=pageBounds(p);let q=supabaseAdmin().from('movi_requests').select('*');const type=p.get('type'),status=p.get('status');if(type){if(!['gioca','allenati'].includes(type))throw new Error('Tipo non valido');q=q.eq('request_type',type);}if(status){if(!Object.hasOwn(statusLabels,status))throw new Error('Stato non valido');q=q.eq('status',status);}const {data,error}=await q.order('created_at',{ascending:false}).order('id').range(offset,offset+limit-1);if(error)return editorialJson({error:'Coda non disponibile'},500);return editorialJson({data:await adminRequests(data??[]),limit,offset});});}
