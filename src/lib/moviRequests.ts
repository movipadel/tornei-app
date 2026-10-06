import {isPlayingSide,playingSideLabel,type PlayingSide} from './playingSide';

export const requestClubs=['Revello','Saluzzo','Manta','Costigliole','Centallo'] as const;
export const statusLabels={received:'Richiesta ricevuta',searching:'MOVI sta cercando',found:'Trovato',completed:'Conclusa',cancelled:'Annullata'};
export type RequestStatus=keyof typeof statusLabels;
export const transitions:Record<RequestStatus,RequestStatus[]>={received:['searching','cancelled'],searching:['found','cancelled'],found:['completed','cancelled'],completed:[],cancelled:[]};
export const windows={morning:'Mattina',lunch:'Pausa pranzo',afternoon:'Pomeriggio',evening:'Sera 18:30–23:00',any:'Indifferente'};
export const levels={principiante:'Principiante',intermedio:'Intermedio',avanzato:'Avanzato',unknown:'Non saprei'};
export const matchTypes={male:'Maschile',female:'Femminile',mixed:'Misto',any:'Indifferente'};
export const trainingTypes={individual:'Lezione individuale',pair:'Lezione di coppia',group:'Gruppo di allenamento',advice:'Non so, consigliatemi voi'};
export const goals={learn:'Imparare',technique:'Migliorare tecnica',match:'Preparazione partita/torneo',regular:'Fare attività con continuità',other:'Altro'};
export const groupSizeLabels={1:'Sono da solo',2:'Siamo in 2',3:'Siamo in 3'} as const;
export type GroupSize=keyof typeof groupSizeLabels;
export type RequestInput={request_type:'gioca'|'allenati';clubs:string[];date_mode:'today'|'tomorrow'|'specific'|'flexible';requested_date:string|null;time_window:keyof typeof windows;preferred_time_text:string;level:keyof typeof levels;playing_side:PlayingSide|null;match_type:(keyof typeof matchTypes)[]|null;group_size:GroupSize|null;required_player_side:PlayingSide|null;training_type:(keyof typeof trainingTypes)[]|null;training_goal:(keyof typeof goals)[]|null;notes:string;client_request_id:string};
export type RequestRow=RequestInput&{id:string;user_id:string;status:RequestStatus;created_at:string;updated_at:string;cancelled_at:string|null;found_at:string|null;completed_at:string|null;admin_notes?:string;telegram_state?:string;telegram_notified_at?:string|null;telegram_attempted_at?:string|null;telegram_error?:string|null;user?:{full_name:string;phone:string}|null};
export const romeDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function parseRequest(value:unknown,now=new Date()):RequestInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Dati non validi');const b=value as Record<string,unknown>;
 if('user_id' in b||'status' in b||'admin_notes' in b)throw new Error('Campi riservati non consentiti');
 const pick=(k:string,allowed:string[])=>{if(typeof b[k]!=='string'||!allowed.includes(b[k] as string))throw new Error(`Campo ${k} non valido`);return b[k] as string;};
 const pickMany=(k:string,allowed:string[],exclusive?:string)=>{if(!Array.isArray(b[k])||b[k].length===0||b[k].length>allowed.length||b[k].some(v=>typeof v!=='string'||!allowed.includes(v)))throw new Error(`Campo ${k} non valido`);const values=[...new Set(b[k] as string[])];if(exclusive&&values.includes(exclusive)&&values.length>1)throw new Error(`Campo ${k} non valido`);return values;};
 const text=(k:string,max:number)=>{if(typeof b[k]!=='string'||(b[k] as string).length>max)throw new Error(`Campo ${k} non valido`);return (b[k] as string).trim();};
 const request_type=pick('request_type',['gioca','allenati']) as RequestInput['request_type'];
 if(!isPlayingSide(b.playing_side))throw new Error('Indica il lato di gioco');
 if(!Array.isArray(b.clubs)||b.clubs.length>5||b.clubs.some(c=>!requestClubs.includes(c))||new Set(b.clubs).size!==b.clubs.length)throw new Error('Selezione club non valida');
 const date_mode=pick('date_mode',['today','tomorrow','specific','flexible']) as RequestInput['date_mode'];let requested_date:string|null=null;
 const today=romeDay(now);
 if(date_mode==='today')requested_date=today;
 if(date_mode==='tomorrow'){const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);requested_date=d.toISOString().slice(0,10);}
 if(date_mode==='specific'){const d=b.requested_date;if(typeof d!=='string'||!/^\d{4}-\d\d-\d\d$/.test(d)||!Number.isFinite(Date.parse(`${d}T12:00:00Z`))||new Date(`${d}T12:00:00Z`).toISOString().slice(0,10)!==d||d<today)throw new Error('Scegli una data valida, da oggi in poi');requested_date=d;}
 if(typeof b.client_request_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.client_request_id))throw new Error('Identificativo invio richiesto');
 let group_size:GroupSize|null=null,required_player_side:PlayingSide|null=null;
 if(request_type==='gioca'){
  if(!Number.isInteger(b.group_size)||![1,2,3].includes(b.group_size as number))throw new Error('Indica con chi cerchi la partita');
  group_size=b.group_size as GroupSize;
  if(group_size===3){if(!isPlayingSide(b.required_player_side))throw new Error('Indica il lato del quarto giocatore');required_player_side=b.required_player_side;}
  else if(b.required_player_side!==null&&b.required_player_side!==undefined)throw new Error('Il lato del quarto giocatore non è previsto per questo gruppo');
 }else if((b.group_size!==null&&b.group_size!==undefined)||(b.required_player_side!==null&&b.required_player_side!==undefined))throw new Error('I dati del gruppo sono disponibili solo per Gioca');
 return {request_type,clubs:b.clubs,date_mode,requested_date,time_window:pick('time_window',Object.keys(windows)) as RequestInput['time_window'],preferred_time_text:text('preferred_time_text',100),level:pick('level',Object.keys(levels)) as RequestInput['level'],playing_side:b.playing_side,match_type:request_type==='gioca'?pickMany('match_type',Object.keys(matchTypes),'any') as RequestInput['match_type']:null,group_size,required_player_side,training_type:request_type==='allenati'?pickMany('training_type',Object.keys(trainingTypes),'advice') as RequestInput['training_type']:null,training_goal:request_type==='allenati'?pickMany('training_goal',Object.keys(goals)) as RequestInput['training_goal']:null,notes:text('notes',1000),client_request_id:b.client_request_id};
}
export function formatRequestValues<T extends string>(values:readonly T[]|null,labels:Record<T,string>,separator=', '){return values?.map(value=>labels[value]).join(separator)||'—';}
export function requestSummary(r:RequestInput){return `${r.request_type==='gioca'?'Gioca':'Allenati'} · ${r.clubs.join(', ')||'Club indifferente'} · ${r.requested_date??'Sono flessibile'} · ${windows[r.time_window]}`;}
export function userRequestDTO(r:RequestRow){return {id:r.id,activity_type:r.request_type,status:r.status,status_label:statusLabels[r.status],created_at:r.created_at,updated_at:r.updated_at,summary:requestSummary(r),can_cancel:['received','searching'].includes(r.status),section:['completed','cancelled'].includes(r.status)?'history':r.status==='found'?'upcoming':'pending',clubs:r.clubs,date_mode:r.date_mode,requested_date:r.requested_date,time_window:r.time_window,preferred_time_text:r.preferred_time_text,level:r.level,playing_side:r.playing_side??null,match_type:r.match_type,group_size:r.group_size,required_player_side:r.required_player_side,training_type:r.training_type,training_goal:r.training_goal,notes:r.notes};}
export function requestTelegramText(r:RequestRow,name:string,phone:string){return [`MOVI — ${r.request_type==='gioca'?'Gioca':'Allenati'}`,`Utente: ${name}`,`Telefono: ${phone||'—'}`,`Club: ${r.clubs.join(', ')||'Indifferente'}`,`Data: ${r.requested_date??'Sono flessibile'} (${r.date_mode})`,`Fascia: ${windows[r.time_window]}`,`Orario preferito: ${r.preferred_time_text||'—'}`,`Livello: ${levels[r.level]}`,...(r.playing_side?[`Lato del richiedente: ${playingSideLabel(r.playing_side)}`]:[]),...(r.request_type==='gioca'?[`Gruppo: ${r.group_size?groupSizeLabels[r.group_size]:'Non indicato'}`,...(r.group_size===3?[`Quarto cercato: ${playingSideLabel(r.required_player_side)}`]:[]),`Tipo partita: ${formatRequestValues(r.match_type,matchTypes)}`]:[`Tipo allenamento: ${formatRequestValues(r.training_type,trainingTypes)} · Obiettivi: ${formatRequestValues(r.training_goal,goals)}`]),`Note: ${r.notes||'—'}`,`ID: ${r.id}`,'Coda autorevole: Richieste Gioca / Allenati'].join('\n').slice(0,3800);}
