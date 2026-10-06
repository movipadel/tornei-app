import { createClient } from '@supabase/supabase-js';

if(process.env.GIOCA_SUGGESTIONS_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55421')throw new Error('Verified local Gioca suggestions runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const check=({error})=>{if(error)throw error;};
const owner='eded6000-0000-4000-8000-000000000001';
const resolved=await db.rpc('player_profile_resolve_account',{p_user:owner});check(resolved);
if(resolved.data?.state!=='linked')throw new Error('Synthetic request owner needs a certified Player Identity');
const ownerPlayer=resolved.data.player_id;
const now=new Date().toISOString();
const existingProfile=await db.from('player_profiles').select('version').eq('player_identity_id',ownerPlayer).maybeSingle();check(existingProfile);
await check(await db.from('player_profiles').upsert({player_identity_id:ownerPlayer,descriptive_level:'intermedio',preferred_side:'left',preferred_clubs:['Manta'],available_other_clubs:false,preferred_match_types:['male'],available_last_minute:false,version:existingProfile.data?.version??1,updated_at:now,updated_by_user_id:owner,updated_by_admin_id:null},{onConflict:'player_identity_id'}));
await check(await db.from('player_profile_availability').delete().eq('player_identity_id',ownerPlayer));
await check(await db.from('player_profile_availability').insert({player_identity_id:ownerPlayer,weekday:5,time_window:'evening'}));

const id=n=>`c8603000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base={user_id:owner,request_type:'gioca',playing_side:'left',status:'received',date_mode:'specific',time_window:'evening',preferred_time_text:'20:00',level:'intermedio',match_type:['male'],group_size:1,required_player_side:null,training_type:null,training_goal:null,notes:'Fixture Gioca suggestions LOCAL ONLY.',admin_notes:'',telegram_state:'disabled',telegram_error:'local_disabled'};
const rows=[
  {...base,id:id(1),client_request_id:id(1),clubs:['Manta'],requested_date:'2026-10-02'},
  {...base,id:id(2),client_request_id:id(2),clubs:['Costigliole'],requested_date:'2026-09-30',match_type:['mixed']},
  {...base,id:id(3),client_request_id:id(3),clubs:['Manta','Costigliole'],requested_date:'2026-10-02',match_type:['any']},
  {...base,id:id(4),client_request_id:id(4),clubs:[],date_mode:'flexible',requested_date:null},
  {...base,id:id(5),client_request_id:id(5),clubs:['Manta'],requested_date:'2026-10-02',match_type:['any']},
  {...base,id:id(6),client_request_id:id(6),clubs:['Manta'],requested_date:'2026-10-02',notes:'Owner exclusion fixture LOCAL ONLY.'},
  {...base,id:id(7),client_request_id:id(7),clubs:[],date_mode:'flexible',requested_date:null,time_window:'any',level:'unknown',match_type:['any']},
  {...base,id:id(8),client_request_id:id(8),clubs:['Manta'],requested_date:'2026-10-02',match_type:['male','mixed']},
  {...base,id:id(9),client_request_id:id(9),clubs:['Manta'],requested_date:'2026-10-02',group_size:3,required_player_side:'right',notes:'Group-three direct-side fixture LOCAL ONLY.'},
];
await check(await db.from('movi_requests').delete().in('id',rows.map(row=>row.id)));
await check(await db.from('movi_requests').insert(rows));
await check(await db.from('movi_requests').update({status:'searching'}).eq('id',id(2)));
await check(await db.from('movi_requests').update({status:'searching'}).eq('id',id(6)));
await check(await db.from('movi_requests').update({status:'found'}).eq('id',id(6)));
console.log(`Gioca suggestions LOCAL fixtures A-I ready. Owner player: ${ownerPlayer}. Request A: http://localhost:3100/admin/requests/${id(1)}`);
