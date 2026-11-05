import {NextResponse} from 'next/server';
import {getCurrentOperator} from '@/lib/operatorAuthorization';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {isStaffPushEventKey} from '@/lib/staffPushCatalog';
export const dynamic='force-dynamic';
export async function GET(){
 const actor=await getCurrentOperator();if(actor?.role!=='admin')return NextResponse.json({error:'Accesso riservato agli Admin'},{status:403});
 const sb=supabaseAdmin();
 const [staff,rules,devices]=await Promise.all([sb.from('staff_users').select('id,full_name,role,is_active').in('role',['admin','staff']).order('full_name').order('id'),sb.from('staff_notification_responsibilities').select('staff_user_id,event_key,is_active').order('event_key'),sb.from('push_subscriptions').select('staff_user_id').eq('is_active',true).is('revoked_at',null).not('staff_user_id','is',null)]);
 if(staff.error||rules.error||devices.error)return NextResponse.json({error:'Configurazione non disponibile'},{status:503});
 return NextResponse.json({data:(staff.data??[]).filter(s=>s.is_active||(rules.data??[]).some(r=>r.staff_user_id===s.id&&r.is_active)).map(s=>({...s,push_ready:(devices.data??[]).some(d=>d.staff_user_id===s.id),event_keys:(rules.data??[]).filter(r=>r.staff_user_id===s.id&&r.is_active).map(r=>r.event_key)}))},{headers:{'Cache-Control':'no-store'}});
}
export async function PUT(req:Request){
 const actor=await getCurrentOperator();if(actor?.role!=='admin')return NextResponse.json({error:'Accesso riservato agli Admin'},{status:403});
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Origine non consentita'},{status:403});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body.staff_user_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.staff_user_id)||!Array.isArray(body.event_keys)||body.event_keys.length>9||!body.event_keys.every(isStaffPushEventKey))return NextResponse.json({error:'Configurazione non valida'},{status:400});
 const {error}=await supabaseAdmin().rpc('admin_set_staff_push_rules',{p_actor:actor.sid,p_staff_user_id:body.staff_user_id,p_event_keys:[...new Set(body.event_keys)].sort()});
 if(error)return NextResponse.json({error:'Impossibile salvare: verifica operatore ed eventi'},{status:400});
 return NextResponse.json({ok:true});
}
