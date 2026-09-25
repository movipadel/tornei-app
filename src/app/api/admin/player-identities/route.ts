import {guardAdmin} from '@/lib/adminGuard';
import {getStaffSessionFromCookie} from '@/lib/staffSession';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {editorialJson} from '@/lib/padelleriaServer';

export const dynamic='force-dynamic';
const actions=new Set(['create','update','archive','unarchive','link_account','certify_email','merge_preview','prepare_merge','select_account_resolution','merge','scan_league','resolve_case']);
const fields=new Set(['full_name','phone','gender','player_id','updated_at','account_user_id','source_auth_user_id','source_id','canonical_id','selected_account_id','fingerprint','case_id','version','reason','decision','new_identity']);
export async function GET(req:Request){
 const denied=await guardAdmin();if(denied)return denied;
 const session=await getStaffSessionFromCookie();
 const active=await supabaseAdmin().rpc('player_identity_admin',{p_actor:session!.sid});if(active.error)return editorialJson({error:'Admin attivo richiesto'},403);
 const sb=supabaseAdmin(),params=new URL(req.url).searchParams,status=params.get('status')??'active',q=(params.get('q')??'').trim();
 if(!['active','archived','merged','all'].includes(status)||q.length>100)return editorialJson({error:'Filtro non valido'},400);
 let query=sb.from('player_identities').select('*').order('updated_at',{ascending:false}).limit(100);
 if(status!=='all')query=query.eq('status',status);
 if(q){if(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(q))query=query.eq('account_user_id',q);else if(/^[+\d\s()-]+$/.test(q))query=query.ilike('normalized_phone',`%${q.replace(/[^+\d]/g,'')}%`);else query=query.ilike('full_name',`%${q.replace(/[%_]/g,'')}%`);}
 const [players,cases]=await Promise.all([query,sb.from('player_identity_cases').select('*').order('updated_at',{ascending:false}).limit(100)]);
 if(players.error||cases.error)return editorialJson({error:'Lettura identità non disponibile'},503);
 const ids=[...new Set((cases.data??[]).flatMap(c=>c.player_ids as string[]))];
 if(ids.length>500)return editorialJson({error:'Troppi candidati: restringere la revisione'},503);
 const candidates=ids.length?await sb.from('player_identities').select('*').in('id',ids):{data:[],error:null};
 if(candidates.error)return editorialJson({error:'Candidati non disponibili'},503);
 const accountIds=[...new Set([...(players.data??[]),...(candidates.data??[])].map(p=>p.account_user_id).filter(Boolean))];
 const accounts=accountIds.length?await sb.from('users').select('id,full_name').in('id',accountIds):{data:[],error:null};
 if(accounts.error)return editorialJson({error:'Account non disponibili'},503);
 const names=new Map((accounts.data??[]).map(a=>[a.id,a.full_name]));
 const display=(p:Record<string,unknown>)=>({...p,account_label:names.get(p.account_user_id as string)??null});
 const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
 const teamIds=[...new Set(cases.data.filter(c=>c.source_kind==='league').map(c=>String(c.evidence?.team_id??'')).filter(id=>uuid.test(id)))];
 const tournamentIds=[...new Set(cases.data.filter(c=>c.source_kind==='circuit').map(c=>c.source_ref.split(':')[0]).filter(id=>uuid.test(id)))];
 const [teams,tournaments]=await Promise.all([
  teamIds.length?sb.from('league_teams').select('id,name').in('id',teamIds):Promise.resolve({data:[],error:null}),
  tournamentIds.length?sb.from('tournaments').select('id,name,circuit_id,category,level').in('id',tournamentIds):Promise.resolve({data:[],error:null})
 ]);
 if(teams.error||tournaments.error)return editorialJson({error:'Contesto dei casi non disponibile'},503);
 const circuitIds=[...new Set((tournaments.data??[]).map(t=>t.circuit_id).filter(Boolean))];
 const circuits=circuitIds.length?await sb.from('circuits').select('id,name').in('id',circuitIds):{data:[],error:null};
 if(circuits.error)return editorialJson({error:'Circuiti non disponibili'},503);
 const contextCases=cases.data.map(c=>{
  const team=teams.data?.find(t=>t.id===c.evidence?.team_id);
  const tournament=tournaments.data?.find(t=>t.id===c.source_ref.split(':')[0]);
  const circuit=circuits.data?.find(item=>item.id===tournament?.circuit_id);
  return {...c,context_label:team?team.name:[circuit?.name,tournament?.name,tournament?.category,tournament?.level].filter(Boolean).join(' · ')};
 });
 return editorialJson({players:players.data.map(display),cases:contextCases,candidates:candidates.data.map(display),limit:100});
}
export async function POST(req:Request){
 const denied=await guardAdmin();if(denied)return denied;
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return editorialJson({error:'Origine non consentita'},403);
 const body=await req.json().catch(()=>null);
 if(!body||!actions.has(body.action)||!body.data||typeof body.data!=='object'||Array.isArray(body.data)||Object.keys(body.data).some(k=>!fields.has(k)))return editorialJson({error:'Comando non valido'},400);
 if(body.data.new_identity&&Object.keys(body.data.new_identity).some(k=>!['full_name','phone','gender'].includes(k)))return editorialJson({error:'Campi identità non validi'},400);
 const session=await getStaffSessionFromCookie(),sb=supabaseAdmin();
 const signal=()=>AbortSignal.timeout(12000);
 const failure=(code:string,blockers:string[]=[])=>editorialJson({code,blockers,error:
  blockers.includes('different_accounts')?'Queste due identità non possono essere unite perché sono collegate a due account diversi.':
  code.startsWith('STALE')?'Il caso o l’anteprima non sono più aggiornati. Aggiorna la pagina e riprova.':
  code==='MERGE_BLOCKED'?'L’unione è bloccata: verifica account e partecipazioni delle due identità.':
  code==='REASON_REQUIRED'?'Indica il motivo della decisione.':'Operazione non completata. Controlla i dati e aggiorna la pagina prima di riprovare.'},409);
 try {
  const active=await sb.rpc('player_identity_admin',{p_actor:session!.sid}).abortSignal(signal());
  if(active.error)return editorialJson({error:'Admin attivo richiesto',code:'ADMIN_REQUIRED'},403);
  const input=body.data;
  async function commonAccountGroup(accountIds:string[]){
   const members=await sb.from('user_duplicate_review_members').select('group_id,user_id').in('user_id',accountIds).abortSignal(signal());
   if(members.error)throw members.error;
   const counts=new Map<string,Set<string>>();
   for(const member of members.data??[]){const set=counts.get(member.group_id)??new Set<string>();set.add(member.user_id);counts.set(member.group_id,set);}
   const ids=[...counts].filter(([,set])=>accountIds.every(id=>set.has(id))).map(([id])=>id);
   if(!ids.length)return null;
   const groups=await sb.from('user_duplicate_review_groups').select('id,state,is_stale,updated_at').in('id',ids).order('updated_at',{ascending:false}).abortSignal(signal());
   if(groups.error)throw groups.error;
   return groups.data?.find(group=>!group.is_stale&&group.state!=='merged')??groups.data?.[0]??null;
  }
  async function accountSummaries(accountIds:string[]){
   const result=await sb.from('users').select('id,full_name,phone,email,identity_status,auth_user_id').in('id',accountIds).abortSignal(signal());
   if(result.error)throw result.error;
   return (result.data??[]).map(({auth_user_id,...account})=>({...account,access_status:auth_user_id?'Accesso collegato':'Accesso non collegato'}));
  }
  async function reviewedCase(){
   const read=await sb.from('player_identity_cases').select('id,version,status,case_type,player_ids,account_ids,decision').eq('id',input.case_id).abortSignal(signal()).maybeSingle();
   if(read.error)throw read.error;
   const c=read.data;
   if(!c||!['sporting_duplicate','sporting_merge_conflict'].includes(c.case_type)||c.player_ids.length!==2||!['open','in_review'].includes(c.status))return null;
   return c;
  }
  if(body.action==='prepare_merge'){
   const c=await reviewedCase();
   if(!c||c.version!==input.version||!c.player_ids.includes(input.source_id)||!c.player_ids.includes(input.canonical_id))return failure('STALE_CASE');
   const preview=await sb.rpc('player_identity_merge_preview',{p_source:input.source_id,p_canonical:input.canonical_id}).abortSignal(signal());
   if(preview.error)return failure(preview.error.message);
   const value=preview.data as {source:{account_user_id:string|null};canonical:{account_user_id:string|null};blockers:string[];fingerprint:string};
   const accounts=[value.source.account_user_id,value.canonical.account_user_id].filter((id):id is string=>Boolean(id));
   const differentAccounts=accounts.length===2&&accounts[0]!==accounts[1];
   const state=differentAccounts?'requires_account_resolution':value.blockers.length?'sporting_collision':'ready';
   const decision={state,source_id:input.source_id,canonical_id:input.canonical_id,fingerprint:value.fingerprint,source_account_id:value.source.account_user_id,canonical_account_id:value.canonical.account_user_id};
   const nextVersion=c.version+1;
   const saved=await sb.from('player_identity_cases').update({status:'in_review',decision,account_ids:[...new Set(accounts)],version:nextVersion,updated_at:new Date().toISOString()}).eq('id',c.id).eq('version',c.version).select('id').abortSignal(signal());
   if(saved.error||!saved.data?.length)return failure('STALE_CASE');
   const summaries=differentAccounts?await accountSummaries(accounts):[];
   const group=differentAccounts?await commonAccountGroup(accounts):null;
   return editorialJson({data:{...value,state,case_version:nextVersion,accounts:summaries,auth_group_id:group?.id??null,blockers:value.blockers.filter(code=>code!=='different_accounts')}});
  }
  if(body.action==='select_account_resolution'){
   const c=await reviewedCase();
   const decision=c?.decision as Record<string,unknown>|null;
   if(!c||c.version!==input.version||decision?.state!=='requires_account_resolution')return failure('STALE_CASE');
   const accountIds=c.account_ids as string[],selected=String(input.selected_account_id??'');
   if(accountIds.length!==2||!accountIds.includes(selected))return failure('ACCOUNT_SELECTION_INVALID');
   const accounts=await accountSummaries(accountIds);
   if(accounts.some(account=>account.identity_status!=='active'))return failure('STALE_ACCOUNT_STATE');
   let group=await commonAccountGroup(accountIds);
   if(!group){
    const scanned=await sb.rpc('run_user_duplicate_scan',{p_actor_staff_id:session!.sid}).abortSignal(signal());
    if(scanned.error)throw scanned.error;
    group=await commonAccountGroup(accountIds);
   }
   if(!group){
    const groupKey=`player-identity-case:${c.id}`;
    const created=await sb.from('user_duplicate_review_groups').upsert({group_key:groupKey,signal_type:'manual',signal_value:groupKey,confidence:'manual-review',state:'manual_only',recommended_user_id:selected,warning_flags:['manual_identity_review','sporting_identity_confirmation'],review_note:'Verifica account richiesta da un caso di identità sportiva'},{onConflict:'group_key'}).select('id,state,is_stale,updated_at').abortSignal(signal()).single();
    if(created.error)throw created.error;
    group=created.data;
    const inserted=await sb.from('user_duplicate_review_members').upsert(accountIds.map(user_id=>({group_id:group!.id,user_id,included:true})),{onConflict:'group_id,user_id'}).abortSignal(signal());
    if(inserted.error)throw inserted.error;
   }
   const resolvedGroup=group!;
   const nextVersion=c.version+1;
   const saved=await sb.from('player_identity_cases').update({decision:{...decision,selected_account_id:selected,auth_group_id:resolvedGroup.id},version:nextVersion,updated_at:new Date().toISOString()}).eq('id',c.id).eq('version',c.version).select('id').abortSignal(signal());
   if(saved.error||!saved.data?.length)return failure('STALE_CASE');
   return editorialJson({data:{state:'requires_account_resolution',case_version:nextVersion,auth_group_id:resolvedGroup.id,selected_account_id:selected,accounts}});
  }
  // An identical retry of a committed rejection is successful, without another write/audit event.
  async function rejectedReplay(){
   if(body.action!=='resolve_case'||input.decision!=='reject')return false;
   const read=await sb.from('player_identity_cases').select('status,version,decision').eq('id',input.case_id).abortSignal(signal()).maybeSingle();
   if(read.error)throw read.error;
   return read.data?.status==='rejected'&&read.data.version===input.version+1&&read.data.decision?.reason===input.reason;
  }
  if(await rejectedReplay())return editorialJson({data:{state:'saved',already_applied:true}});
  let mergeCase: {id:string;version:number;status:string}|null=null;
  if(body.action==='merge'&&input.case_id){
   const read=await sb.from('player_identity_cases').select('id,version,status,case_type,player_ids').eq('id',input.case_id).abortSignal(signal()).maybeSingle();
   if(read.error)throw read.error;
   const c=read.data;
   if(!c||!['sporting_duplicate','sporting_merge_conflict'].includes(c.case_type)||c.player_ids.length!==2||!c.player_ids.includes(input.source_id)||!c.player_ids.includes(input.canonical_id))return failure('CASE_PAIR_INVALID');
   if(c.version!==input.version||!['open','in_review'].includes(c.status))return failure('STALE_CASE');
   mergeCase=c;
  }
  const {data,error}=await sb.rpc('player_identity_command',{p_actor:session!.sid,p_action:body.action,p_data:input}).abortSignal(signal());
  if(error){if(error.message.includes('STALE_CASE')&&await rejectedReplay())return editorialJson({data:{state:'saved',already_applied:true}});return failure(error.message);}
  if(body.action==='merge'&&data?.state==='review')return failure('MERGE_BLOCKED',data.blockers??[]);
  // The existing RPC resolves its ordered source reference. Also close the exact reviewed
  // pair when the Admin chose the other identity to keep. Never change merge safety or references.
  if(mergeCase&&data?.state==='merged'){
   const updated=await sb.from('player_identity_cases').update({status:'resolved',version:mergeCase.version+1,decision:data,resolved_at:new Date().toISOString(),resolved_by_admin_id:session!.sid,updated_at:new Date().toISOString()}).eq('id',mergeCase.id).eq('version',mergeCase.version).in('status',['open','in_review']).select('id').abortSignal(signal());
   if(updated.error)return editorialJson({code:'CASE_REFRESH_REQUIRED',error:'Le identità sono state unite, ma lo stato del caso richiede una verifica. Aggiorna la pagina prima di continuare.'},409);
  }
  return editorialJson({data});
 }catch{return editorialJson({code:'IDENTITY_REQUEST_FAILED',error:'Risposta non disponibile. Aggiorna la pagina per verificare l’esito prima di riprovare.'},503);}
}
