import {createClient} from '@supabase/supabase-js';
if(process.env.PADELLERIA_LOCAL_VERIFIED!=='1'||process.env.SUPABASE_URL!=='http://127.0.0.1:55421')throw Error('Verified local runner required');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const [results,players]=await Promise.all([db.from('circuit_results').select('id,player_key,player_name,player_phone,source_tournament_id,player_identity_id').limit(901),db.from('player_identities').select('id,full_name,normalized_phone,status').limit(901)]);
if(results.error||players.error||results.data.length>900||players.data.length>900)throw Error('Read failed or safe analysis bound exceeded');
const report={mode:'DRY RUN ONLY',deterministic:[],review:[],unresolved:[],linked:0};
for(const row of results.data){
 if(row.player_identity_id){report.linked++;continue;}
 const {data:phone,error}=await db.rpc('normalize_user_mobile_e164',{p_phone:row.player_phone});if(error)throw error;
 if(!phone||!row.player_name?.trim()){report.unresolved.push({id:row.id,reason:'missing_reliable_name_phone'});continue;}
 const normalize=s=>s.trim().replace(/\s+/g,' ').toLowerCase();
 const candidates=players.data.filter(p=>p.status!=='merged'&&p.normalized_phone===phone);
 const safe=candidates.length===1&&candidates[0].status==='active'&&normalize(candidates[0].full_name)===normalize(row.player_name);
 (safe?report.deterministic:report.review).push({id:row.id,reason:safe?'unique_name_phone_existing_identity':'source_review_required',candidate_ids:candidates.map(p=>p.id)});
}
console.log(JSON.stringify(report,null,2));
// Intentionally no write/apply option. Future production backfill requires a separately reviewed job.
