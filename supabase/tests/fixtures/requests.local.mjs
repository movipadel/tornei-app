import {createClient} from '@supabase/supabase-js';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55421'||process.env.MOVI_REQUEST_TELEGRAM_MODE!=='disabled'||process.env.TELEGRAM_BOT_TOKEN||process.env.TELEGRAM_CHAT_ID)throw new Error('Safe local runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),check=({error})=>{if(error)throw error;};
const password='Requests-Local-2026!';
for(let i=1;i<=2;i++){
 const email=`requests-demo-${i}@example.invalid`,id=`eded6000-0000-4000-8000-00000000000${i}`;
 const existing=await db.from('users').select('id,auth_user_id').eq('id',id).maybeSingle();check(existing);
 if(!existing.data){const auth=await db.auth.admin.createUser({email,password,email_confirm:true});check(auth);check(await db.from('users').insert({id,full_name:`Utente Richieste Demo ${i}`,phone:`+39000000600${i}`,email,gender:'M',auth_user_id:auth.data.user.id,auth_migration_state:'linked',identity_status:'active'}));}
}
const statuses=['received','searching','found','received','completed','cancelled'];
for(let i=0;i<6;i++){
 const id=`eded7000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
 const old=await db.from('movi_requests').select('id').eq('id',id).maybeSingle();check(old);if(old.data)continue;
 const gioca=i<3||i===5;check(await db.from('movi_requests').insert({id,user_id:'eded6000-0000-4000-8000-000000000001',client_request_id:id,request_type:gioca?'gioca':'allenati',playing_side:gioca?'left':'any',clubs:i%2?['Revello','Saluzzo']:[],date_mode:'flexible',requested_date:null,time_window:'evening',preferred_time_text:'Verso le 20:00',level:'intermedio',match_type:gioca?['male','mixed']:null,group_size:gioca?1:null,required_player_side:null,training_type:gioca?null:['individual','group'],training_goal:gioca?null:['technique','regular'],notes:'Fixture sintetica LOCAL ONLY.',telegram_state:'disabled',telegram_error:'local_disabled'}));
 const chain=statuses[i]==='completed'?['searching','found','completed']:statuses[i]==='found'?['searching','found']:statuses[i]==='received'?[]:[statuses[i]];
 for(const status of chain)check(await db.from('movi_requests').update({status}).eq('id',id));
}
console.log('LOCAL fixtures: 2 synthetic Auth users, 6 requests. User login requests-demo-1@example.invalid / Requests-Local-2026!');
