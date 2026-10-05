export const playerProfileClubs=['Revello','Saluzzo','Manta','Costigliole','Centallo'] as const;
export const playerProfileLevels=['principiante','intermedio','avanzato'] as const;
export const playerProfileMatchTypes=['male','female','mixed','any'] as const;
export const playerProfileWindows=['morning','lunch','afternoon','evening'] as const;
export const moviLevels=[2,2.5,3,3.5,4,4.5,5] as const;

import {isPlayingSide,type PlayingSide} from './playingSide';

export type AvailabilitySlot={weekday:number;time_window:typeof playerProfileWindows[number]};
export type SharedPlayerProfile={
 descriptive_level:typeof playerProfileLevels[number]|null;
 preferred_side:PlayingSide|null;
 preferred_clubs:string[];
 available_other_clubs:boolean|null;
 preferred_match_types:string[];
 available_last_minute:boolean|null;
 availability:AvailabilitySlot[];
};

const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const unique=(values:string[])=>new Set(values).size===values.length;
export function parseSharedPlayerProfile(value:unknown):SharedPlayerProfile{
 if(!object(value)||Object.keys(value).some(key=>!['descriptive_level','preferred_side','preferred_clubs','available_other_clubs','preferred_match_types','available_last_minute','availability'].includes(key)))throw Error('Campi profilo non validi');
 const level=value.descriptive_level;
 const side=value.preferred_side;
 const clubs=value.preferred_clubs;
 const matches=value.preferred_match_types;
 const availability=value.availability;
 if(level!==null&&!playerProfileLevels.includes(level as never))throw Error('Livello dichiarato non valido');
 if(side!==null&&!isPlayingSide(side))throw Error('Lato di gioco non valido');
 if(!Array.isArray(clubs)||!clubs.every(item=>typeof item==='string'&&playerProfileClubs.includes(item as never))||!unique(clubs))throw Error('Club preferiti non validi');
 if(!Array.isArray(matches)||!matches.every(item=>typeof item==='string'&&playerProfileMatchTypes.includes(item as never))||!unique(matches)||matches.includes('any')&&matches.length!==1)throw Error('Tipi di partita non validi');
 if(![true,false,null].includes(value.available_other_clubs as never)||![true,false,null].includes(value.available_last_minute as never))throw Error('Disponibilità non valida');
 if(!Array.isArray(availability)||availability.length>28)throw Error('Disponibilità settimanale non valida');
 const slots=availability.map(item=>{
  if(!object(item)||Object.keys(item).length!==2||!Number.isInteger(item.weekday)||(item.weekday as number)<1||(item.weekday as number)>7||!playerProfileWindows.includes(item.time_window as never))throw Error('Disponibilità settimanale non valida');
  return {weekday:item.weekday as number,time_window:item.time_window as AvailabilitySlot['time_window']};
 });
 if(new Set(slots.map(slot=>`${slot.weekday}:${slot.time_window}`)).size!==slots.length)throw Error('Disponibilità settimanale duplicata');
 return {descriptive_level:level as SharedPlayerProfile['descriptive_level'],preferred_side:side as PlayingSide|null,preferred_clubs:clubs,available_other_clubs:value.available_other_clubs as boolean|null,preferred_match_types:matches,available_last_minute:value.available_last_minute as boolean|null,availability:slots};
}
export function parseExpectedVersion(value:unknown){if(value===null)return null;if(!Number.isInteger(value)||(value as number)<1)throw Error('Versione profilo non valida');return value as number;}
export function parseMoviLevel(value:unknown){if(value===null)return null;if(typeof value!=='number'||!moviLevels.includes(value as never))throw Error('Livello MOVI non valido');return value;}
export function moviLevelLabel(value:number|null){if(value===null)return null;if(value<=2.5)return 'Avanzato';if(value<=4)return 'Intermedio';return 'Principiante';}
export function emptySharedProfile():SharedPlayerProfile{return {descriptive_level:null,preferred_side:null,preferred_clubs:[],available_other_clubs:null,preferred_match_types:[],available_last_minute:null,availability:[]};}
