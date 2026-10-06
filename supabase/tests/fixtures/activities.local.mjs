import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55421'||process.env.MOVI_REQUEST_TELEGRAM_MODE!=='disabled')throw new Error('Local runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),check=({error})=>{if(error)throw error;};
const user='eded6000-0000-4000-8000-000000000001',cid='edee1000-0000-4000-8000-000000000001';
const profile=await db.from('users').select('phone,full_name').eq('id',user).single();check(profile);const key=profile.data.phone.trim().replace(/\s+/g,'').replace(/^(\+39|0039)/,'').replace(/[^\d]/g,'');
const day=d=>new Date(Date.now()+d*86400000).toISOString().slice(0,10);
check(await db.from('circuits').upsert({id:cid,name:'PadelSeries Demo Attività',slug:'padelseries-demo-attivita',tournament_type:'Baraonda',status:'active'}));
for(let i=1;i<=2;i++){
 const gid=`edee2000-0000-4000-8000-00000000000${i}`,category=i===1?'Maschile':'Misto',level=i===1?'intermedio':'avanzato';
 check(await db.from('circuit_ranking_groups').upsert({id:gid,circuit_id:cid,category,level}));
 for(let j=1;j<=2;j++)check(await db.from('circuit_results').upsert({id:`edee3000-0000-4000-8000-0000000000${i}${j}`,circuit_id:cid,ranking_group_id:gid,tournament_name:'Tappa sintetica passata',tournament_type:'Baraonda',tournament_date:day(-7),player_key:j===1?key:`0000000099${i}`,player_name:j===1?profile.data.full_name:`Altro giocatore Demo ${i}`,points:j===1?(i===1?820:430):500}));
 check(await db.from('tournaments').upsert({id:`edee4000-0000-4000-8000-00000000000${i}`,name:`Tappa Demo ${category}`,type:'Baraonda',category,level,date:day(i*7),time:'20:00',location:'Revello',max_participants:16,circuit_id:cid,registrations_open:true}));
}
check(await db.from('tournament_registrations').upsert({id:'edee5000-0000-4000-8000-000000000001',tournament_id:'edee4000-0000-4000-8000-000000000001',user_id:user,p1_name:profile.data.full_name,p1_phone:profile.data.phone,p1_gender:'M',position:1,is_reserve:false}));
const past='edee4000-0000-4000-8000-000000000003',run='edee6000-0000-4000-8000-000000000001';
check(await db.from('tournaments').upsert({id:past,name:'Baraonda Demo conclusa',type:'Baraonda',category:'Maschile',level:'intermedio',date:day(-14),time:'20:00',location:'Manta',max_participants:16,closed_at:new Date(Date.now()-13*86400000).toISOString(),registrations_open:false}));
check(await db.from('tournament_registrations').upsert({id:'edee5000-0000-4000-8000-000000000002',tournament_id:past,user_id:user,p1_name:profile.data.full_name,p1_phone:profile.data.phone,p1_gender:'M',position:1,is_reserve:false}));
check(await db.from('tournament_runs').upsert({id:run,tournament_id:past,mode:'baraonda',category:'maschile',status:'completed'}));
check(await db.from('tournament_run_participants').upsert({id:'edee6000-0000-4000-8000-000000000002',run_id:run,user_id:user,name:profile.data.full_name,phone:profile.data.phone,sex:'m'}));
const rid='edee7000-0000-4000-8000-000000000001';
const existing=await db.from('movi_requests').select('id').eq('id',rid).maybeSingle();check(existing);
if(!existing.data){check(await db.from('movi_requests').insert({id:rid,user_id:user,client_request_id:rid,request_type:'gioca',playing_side:'left',clubs:['Manta'],date_mode:'flexible',time_window:'evening',level:'intermedio',match_type:['male','mixed'],group_size:1,required_player_side:null,notes:'Fixture storico attività locale',telegram_state:'disabled'}));for(const status of ['searching','found','completed'])check(await db.from('movi_requests').update({status}).eq('id',rid));}
execFileSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-h','127.0.0.1','-p','55422','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','supabase/tests/fixtures/activities-league.local.sql'],{env:process.env,stdio:'inherit'});
console.log('Local activities fixtures ready for requests-demo-1@example.invalid / Requests-Local-2026!');
