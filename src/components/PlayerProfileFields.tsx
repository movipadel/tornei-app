'use client';
import {playerProfileClubs,playerProfileLevels,playerProfileMatchTypes,playerProfileWindows,type SharedPlayerProfile} from '@/lib/playerProfile';
import styles from './PlayerProfileFields.module.css';
const days=['LunedÃ¬','MartedÃ¬','MercoledÃ¬','GiovedÃ¬','VenerdÃ¬','Sabato','Domenica'];
const windows:Record<string,string>={morning:'Mattina',lunch:'Pausa pranzo',afternoon:'Pomeriggio',evening:'Sera'};
const matchLabels:Record<string,string>={male:'Maschile',female:'Femminile',mixed:'Misto',any:'Indifferente'};
const levelLabels:Record<string,string>={principiante:'Principiante',intermedio:'Intermedio',avanzato:'Avanzato'};
export default function PlayerProfileFields({value,onChange,disabled=false}:{value:SharedPlayerProfile;onChange:(value:SharedPlayerProfile)=>void;disabled?:boolean}){
 const set=<K extends keyof SharedPlayerProfile>(key:K,next:SharedPlayerProfile[K])=>onChange({...value,[key]:next});
 const toggle=(key:'preferred_clubs'|'preferred_match_types',item:string)=>{
  let next=value[key].includes(item)?value[key].filter(x=>x!==item):[...value[key],item];
  if(key==='preferred_match_types'){if(item==='any'&&!value[key].includes(item))next=['any'];else if(item!=='any')next=next.filter(x=>x!=='any');}
  set(key,next);
 };
 const slot=(weekday:number,time_window:string)=>{
  const exists=value.availability.some(item=>item.weekday===weekday&&item.time_window===time_window);
  set('availability',exists?value.availability.filter(item=>item.weekday!==weekday||item.time_window!==time_window):[...value.availability,{weekday,time_window:time_window as SharedPlayerProfile['availability'][number]['time_window']}]);
 };
 return <div className={styles.stack}>
  <fieldset disabled={disabled}><legend>Livello dichiarato</legend><p>Una tua indicazione, separata dal livello MOVI assegnato dallo staff.</p><div className={styles.options}><label><input type="radio" checked={value.descriptive_level===null} onChange={()=>set('descriptive_level',null)}/>Non indicato</label>{playerProfileLevels.map(level=><label key={level}><input type="radio" checked={value.descriptive_level===level} onChange={()=>set('descriptive_level',level)}/>{levelLabels[level]}</label>)}</div></fieldset>
  <fieldset disabled={disabled}><legend>Club preferiti</legend><div className={styles.options}>{playerProfileClubs.map(club=><label key={club}><input type="checkbox" checked={value.preferred_clubs.includes(club)} onChange={()=>toggle('preferred_clubs',club)}/>{club}</label>)}</div><Tri label="Disponibile anche in altri club" value={value.available_other_clubs} onChange={next=>set('available_other_clubs',next)}/></fieldset>
  <fieldset disabled={disabled}><legend>Tipi di partita preferiti</legend><div className={styles.options}>{playerProfileMatchTypes.map(type=><label key={type}><input type="checkbox" checked={value.preferred_match_types.includes(type)} onChange={()=>toggle('preferred_match_types',type)}/>{matchLabels[type]}</label>)}</div></fieldset>
  <fieldset disabled={disabled}><legend>DisponibilitÃ  settimanale</legend><p>Seleziona tutte le fasce in cui giochi di solito.</p><div className={styles.schedule}><div/><>{playerProfileWindows.map(window=><strong key={window}>{windows[window]}</strong>)}</>{days.map((day,index)=><div className={styles.scheduleRow} key={day}><span>{day}</span>{playerProfileWindows.map(window=><label key={window} title={`${day}, ${windows[window]}`}><input aria-label={`${day}, ${windows[window]}`} type="checkbox" checked={value.availability.some(item=>item.weekday===index+1&&item.time_window===window)} onChange={()=>slot(index+1,window)}/></label>)}</div>)}</div></fieldset>
  <fieldset disabled={disabled}><legend>Ultimo minuto</legend><Tri label="Disponibile per proposte con poco preavviso" value={value.available_last_minute} onChange={next=>set('available_last_minute',next)}/></fieldset>
 </div>;
}
function Tri({label,value,onChange}:{label:string;value:boolean|null;onChange:(value:boolean|null)=>void}){return <label className={styles.tri}><span>{label}</span><select value={value===null?'':String(value)} onChange={event=>onChange(event.target.value===''?null:event.target.value==='true')}><option value="">Non indicato</option><option value="true">SÃ¬</option><option value="false">No</option></select></label>}
