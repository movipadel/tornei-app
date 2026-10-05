import { createClient } from '@supabase/supabase-js';

if(process.env.PLAYER_MATCHING_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55421')throw new Error('Verified local player matching runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const check=({error})=>{if(error)throw error;};
const id=(n)=>`c8601000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const phone=(n)=>`+39388000${String(n).padStart(4,'0')}`;
const now=new Date().toISOString();
const active=(n,name)=>({id:id(n),full_name:`Matching Demo ${name}`,normalized_phone:phone(n),gender:n%2?'M':'F',account_user_id:null,status:'active',merged_into_player_id:null,archived_at:null,merged_at:null,updated_at:now});

const identities=[
  active(1,'A Exact 3.5'),active(2,'B Exact 3.0'),active(3,'C Any 4.0'),active(4,'D Other club 2.5'),
  active(5,'E No club 4.5'),active(6,'F Outside 5.0'),active(7,'G Club incompatible'),active(8,'H Unknown availability'),
  active(9,'I Availability mismatch'),active(10,'J Match type incompatible'),active(11,'K No account'),active(14,'N Partial profile'),active(15,'O Full profile'),
  {...active(12,'L Archived'),status:'archived',archived_at:now},
];
await check(await db.from('player_identities').upsert(identities,{onConflict:'id'}));
const merged=await db.from('player_identities').select('id').eq('id',id(13)).maybeSingle();
await check(merged);
if(!merged.data)await check(await db.from('player_identities').insert({...active(13,'M Merged'),status:'merged',merged_into_player_id:id(1),merged_at:now}));

const profile=(n,descriptive_level,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute)=>({
  player_identity_id:id(n),descriptive_level,preferred_clubs,available_other_clubs,preferred_match_types,available_last_minute,version:1,updated_at:now,updated_by_user_id:null,updated_by_admin_id:null,
});
const profiles=[
  profile(1,'intermedio',['Manta'],false,['male'],true),
  profile(2,'intermedio',['Costigliole'],false,['mixed'],true),
  profile(3,'intermedio',['Manta'],false,['any'],null),
  profile(4,'avanzato',['Saluzzo'],true,[],false),
  profile(5,'principiante',[],null,['male'],false),
  profile(6,'principiante',['Manta'],false,['male'],true),
  profile(7,'intermedio',['Saluzzo'],false,['male'],true),
  profile(8,'intermedio',['Manta'],false,['male'],null),
  profile(9,'intermedio',['Manta'],false,['male'],true),
  profile(10,'intermedio',['Manta'],false,['female'],true),
  profile(11,'intermedio',[],null,['any'],null),
  profile(12,'intermedio',['Manta'],false,['male'],true),
  profile(13,'intermedio',['Manta'],false,['male'],true),
  profile(14,'intermedio',[],null,[],null),
  profile(15,'intermedio',['Manta','Costigliole'],true,['mixed'],true),
];
await check(await db.from('player_profiles').upsert(profiles,{onConflict:'player_identity_id'}));
const ids=profiles.map(item=>item.player_identity_id);
await check(await db.from('player_profile_availability').delete().in('player_identity_id',ids));
await check(await db.from('player_profile_availability').insert([
  {player_identity_id:id(1),weekday:5,time_window:'evening'},
  {player_identity_id:id(2),weekday:3,time_window:'evening'},
  {player_identity_id:id(3),weekday:5,time_window:'evening'},
  {player_identity_id:id(5),weekday:5,time_window:'evening'},
  {player_identity_id:id(6),weekday:5,time_window:'evening'},
  {player_identity_id:id(7),weekday:5,time_window:'evening'},
  {player_identity_id:id(9),weekday:2,time_window:'morning'},
  {player_identity_id:id(10),weekday:5,time_window:'evening'},
  {player_identity_id:id(12),weekday:5,time_window:'evening'},
  {player_identity_id:id(13),weekday:5,time_window:'evening'},
  {player_identity_id:id(15),weekday:3,time_window:'evening'},
]));

const staff=await db.from('staff_users').select('id').eq('email','padelleria-admin@example.invalid').eq('role','admin').eq('is_active',true).single();
await check(staff);
const levels=new Map([[1,3.5],[2,3],[3,4],[4,2.5],[5,4.5],[6,5],[7,3.5],[8,3.5],[9,3.5],[10,3.5],[11,3],[12,3.5],[13,3.5],[15,3.5]]);
await check(await db.from('player_admin_profiles').upsert([...levels].map(([n,movi_level])=>({
  player_identity_id:id(n),movi_level,movi_level_updated_at:now,movi_level_updated_by_admin_id:staff.data.id,internal_notes:'',updated_at:now,updated_by_admin_id:staff.data.id,
})),{onConflict:'player_identity_id'}));
await check(await db.from('player_admin_profiles').delete().eq('player_identity_id',id(14)));
await check(await db.from('player_identity_cases').upsert({
  id:'c8602000-0000-4000-8000-000000000001',dedupe_key:'local:player-matching:identity-warning',case_type:'identity_data_conflict',status:'open',player_ids:[id(3)],account_ids:[],source_kind:'local_fixture',source_ref:'player-matching',evidence:{synthetic:true},updated_at:now,
},{onConflict:'id'}));
console.log('Player matching LOCAL fixtures ready: exact, adjacent, fallback, club, availability, match type, last-minute, no-account, archived, merged, partial and full profiles.');
