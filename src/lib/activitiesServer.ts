import 'server-only';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {buildPublicCircuitRanking} from '@/lib/circuitPublicRanking';
import {getPublicLeagueSnapshot} from '@/lib/monday-league/public-read-model';
import {romeDay,userRequestDTO,matchTypes,trainingTypes,goals,type RequestRow} from '@/lib/moviRequests';
import type {Activity} from '@/lib/activities';
import {romeToUtc} from '@/lib/padelleria';
const CAP=500;
function checked<T>(r:{data:T[]|null;error:unknown},max=CAP):T[]{if(r.error||!r.data||r.data.length>max)throw new Error('Activity source unavailable or over safe bound');return r.data;}
const norm=(v:string|null)=>String(v??'').trim().toLowerCase();
function tournamentSort(date:string,time:string){try{return romeToUtc(`${date}T${time}`)??date;}catch{return date;}}
const base=(type:Activity['type'],id:string):Activity=>({id:`${type}:${id}`,type,source_id:id,tab:'upcoming',title:'',subtitle:'',status:'',status_label:'',date:null,club:null,category:null,level:null,primary_meta:'',secondary_meta:'',cta_label:null,cta_href:null,can_cancel:false,sort_at:'9999'});
type Registration={id:string;tournament_id:string;is_reserve:boolean;name:string;category:string;level:string|null;date:string;time:string;location:string;closed_at:string|null};
export async function composeActivities(userId:string):Promise<Activity[]>{
 const sb=supabaseAdmin(),today=romeDay(),now=new Date().toISOString();
 const scope=await sb.rpc('movi_activity_identity_scope',{p_user_id:userId});if(scope.error)throw new Error('Identity unavailable');
 const ids=scope.data.user_ids as string[],keys=scope.data.player_keys as string[];
 const [rq,regs,rosters,ownResults]=await Promise.all([
  sb.from('movi_requests').select('*').in('user_id',ids).order('created_at',{ascending:false}).limit(CAP+1),
  sb.rpc('movi_activity_registrations',{p_user_id:userId}),
  sb.from('league_team_players').select('team_id,is_active,joined_at,left_at').in('user_id',ids).limit(CAP+1),
  keys.length?sb.from('circuit_results').select('ranking_group_id,player_key,player_name').in('player_key',keys).limit(CAP+1):Promise.resolve({data:[],error:null}),
 ]);
 const requests=checked(rq) as RequestRow[],registrations=checked(regs) as Registration[],members=checked(rosters),personalResults=checked(ownResults);
 const items:Activity[]=requests.map(r=>{const dto=userRequestDTO(r);return {...base(r.request_type,r.id),tab:['completed','cancelled'].includes(r.status)?'history':'upcoming',title:r.request_type==='gioca'?'Cerco una partita':trainingTypes[r.training_type!],subtitle:dto.summary,status:r.status,status_label:dto.status_label,date:r.requested_date,club:r.clubs.join(', ')||'Indifferente',level:r.level,primary_meta:r.request_type==='gioca'?`${matchTypes[r.match_type!]} · ${r.has_partner?'Hai già un compagno':'Cerchi anche il compagno'}`:goals[r.training_goal!],secondary_meta:r.preferred_time_text,cta_label:'Vedi richiesta',cta_href:`/le-mie-attivita/richiesta/${r.id}`,can_cancel:r.user_id===userId&&dto.can_cancel,sort_at:['completed','cancelled'].includes(r.status)?r.completed_at??r.cancelled_at??r.updated_at:r.requested_date??'9999'};});
 const tids=[...new Set(registrations.map(r=>r.tournament_id))];
 const runs=tids.length?checked(await sb.from('tournament_runs').select('id,tournament_id,status').in('tournament_id',tids).limit(CAP+1)):[];
 const finished=runs.filter(r=>r.status==='completed'),runids=finished.map(r=>r.id);
 const [participants,pairs]=runids.length?await Promise.all([
  sb.from('tournament_run_participants').select('run_id').in('run_id',runids).in('user_id',ids).limit(CAP+1),
  sb.from('tournament_run_pairs').select('run_id,registration_id').in('run_id',runids).in('registration_id',registrations.map(r=>r.id)).limit(CAP+1),
 ]):[{data:[],error:null},{data:[],error:null}];
 const attended=new Set([...checked(participants),...checked(pairs)].map(r=>r.run_id));
 const historical=new Set(finished.filter(r=>attended.has(r.id)).map(r=>r.tournament_id));
 const ended=new Set(runs.filter(r=>r.status==='completed').map(r=>r.tournament_id));
 const byTournament=new Map<string,Registration>();for(const r of registrations){const old=byTournament.get(r.tournament_id);if(!old||old.is_reserve&&!r.is_reserve)byTournament.set(r.tournament_id,r);}
 for(const r of byTournament.values()){
  const history=r.date<today||Boolean(r.closed_at)||ended.has(r.tournament_id);if(history&&!historical.has(r.tournament_id))continue;
  items.push({...base('tournament',r.tournament_id),tab:history?'history':'upcoming',title:r.name,subtitle:`${r.date} · ${r.time} · ${r.location}`,date:r.date,club:r.location,category:r.category,level:r.level,status:history?'completed':r.is_reserve?'reserve':'registered',status_label:history?'Partecipazione conclusa':r.is_reserve?'In lista riserve':'Iscrizione confermata',primary_meta:`${r.category} · ${r.level??''}`,sort_at:tournamentSort(r.date,r.time),cta_label:history?null:'Vedi torneo',cta_href:history?null:`/tornei?tournament=${r.tournament_id}`});
 }
 // Reuse public season selection, match projection and results; no League calculations.
 if(members.length){
  const initial=await getPublicLeagueSnapshot();
  if(initial.available){
   const teamIds=[...new Set(members.map(m=>m.team_id))];
   const memberships=checked(await sb.from('league_phase_teams').select('phase_id').in('team_id',teamIds).in('phase_id',initial.phases.map(p=>p.id)).limit(CAP+1));
   const phases=[...new Set(memberships.map(p=>p.phase_id))].filter(id=>id!==initial.selectedPhase.id);
   if(phases.length>2)throw new Error('Unexpected phase count');
   const snapshots=[initial,...await Promise.all(phases.map(id=>getPublicLeagueSnapshot(id)))];
   for(const snap of snapshots){if(!snap.available)continue;for(const round of snap.rounds)for(const m of round.matches){
    const connections=members.filter(p=>p.team_id===m.homeTeam.id||p.team_id===m.awayTeam.id);if(!connections.length)continue;
    const history=Boolean(m.result&&['confirmed','special'].includes(m.result.status));
    if(history){if(!m.scheduledAt||!connections.some(p=>p.joined_at<=m.scheduledAt!&&(!p.left_at||p.left_at>=m.scheduledAt!)))continue;}
    else if(!m.scheduledAt||m.scheduledAt<now||['cancelled','confirmed','submitted','contested'].includes(m.workflowStatus)||!connections.some(p=>p.is_active))continue;
    items.push({...base('monday_league',m.id),tab:history?'history':'upcoming',title:'Monday League',subtitle:`${m.homeTeam.name} vs ${m.awayTeam.name}`,status:m.workflowStatus,status_label:m.workflowLabel,date:m.scheduledAt,club:m.venue?.name??null,primary_meta:snap.selectedPhase.name,secondary_meta:history?m.result?.summary??'':'',sort_at:m.scheduledAt?new Date(m.scheduledAt).toISOString():'9999',cta_label:'Vai alla Monday League',cta_href:'/monday-league'});
   }}
  }
 }
 const gids=[...new Set(personalResults.map(r=>r.ranking_group_id))];
 if(gids.length){
  const groups=checked(await sb.from('circuit_ranking_groups').select('id,circuit_id,category,level').in('id',gids).limit(CAP+1));
  const cids=[...new Set(groups.map(g=>g.circuit_id))];
  const [cs,rs,ts]=await Promise.all([
   sb.from('circuits').select('id,name,slug,status').in('id',cids).in('status',['active','closed']).limit(CAP+1),
   sb.from('circuit_results').select('ranking_group_id,player_key,player_name,points').in('ranking_group_id',gids).limit(901),
   sb.from('tournaments').select('id,circuit_id,category,level,date,time,closed_at').in('circuit_id',cids).gte('date',today).is('closed_at',null).order('date').order('time').limit(CAP+1),
  ]);
  const circuits=checked(cs),results=checked(rs,900),stages=checked(ts);
  for(const g of groups){const c=circuits.find(c=>c.id===g.circuit_id);if(!c)continue;
   const rows=results.filter(r=>r.ranking_group_id===g.id),own=rows.filter(r=>keys.includes(r.player_key)),names=[...new Set(own.map(r=>r.player_name.trim()))];
   // A name-only public ranking can conflate homonyms. Never present others' points as personal.
   const unambiguous=names.length===1&&!rows.some(r=>r.player_name.trim()===names[0]&&!keys.includes(r.player_key));
   const rank=unambiguous?buildPublicCircuitRanking(rows).find(r=>r.player_name===names[0]):undefined;
   const stage=c.status==='active'?stages.find(t=>t.circuit_id===c.id&&norm(t.category)===norm(g.category)&&norm(t.level)===norm(g.level)):undefined;
   items.push({...base('circuit',g.id),tab:c.status==='closed'?'history':'upcoming',title:c.name,subtitle:`${g.category} · ${g.level}`,status:c.status,status_label:c.status==='active'?'Circuito in corso':'Circuito concluso',category:g.category,level:g.level,date:stage?.date??null,primary_meta:rank?`${rank.position}° posto · ${rank.total_points} pt`:'Classifica personale da verificare',secondary_meta:[rank?`${rank.events_played} ${rank.events_played===1?'tappa conteggiata':'tappe conteggiate'}`:'',stage?`Prossima tappa: ${stage.date}`:''].filter(Boolean).join(' · '),position:rank?.position??null,points:rank?.total_points??null,events_played:rank?.events_played??null,classification_id:g.id,sort_at:c.status==='closed'?'0000':stage?.date??'9999',cta_label:'Vedi classifica',cta_href:`/circuiti/${encodeURIComponent(c.slug)}?group=${g.id}`});
  }
 }
 return items;
}
