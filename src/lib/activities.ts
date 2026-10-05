export type ActivityTab='upcoming'|'history';
export type ActivityType='gioca'|'allenati'|'tournament'|'monday_league'|'circuit';
export type Activity={id:string;type:ActivityType;source_id:string;tab:ActivityTab;title:string;subtitle:string;status:string;status_label:string;date:string|null;club:string|null;category:string|null;level:string|null;primary_meta:string;secondary_meta:string;cta_label:string|null;cta_href:string|null;can_cancel:boolean;sort_at:string;position?:number|null;points?:number|null;events_played?:number|null;classification_id?:string};
export const activityTabs={upcoming:'In programma',history:'Storico'};
export const activityTypes={gioca:'Gioca',allenati:'Allenati',tournament:'Torneo',monday_league:'Monday League',circuit:'Circuito'};
export function activityPagination(p:URLSearchParams){
 if(p.has('user_id'))throw new Error('Identità non consentita');
 const tab=p.get('tab')??'upcoming';if(!Object.hasOwn(activityTabs,tab))throw new Error('Vista non valida');
 const integer=(k:string,d:number,max:number,min:number)=>{const s=p.get(k);if(s===null)return d;if(!/^\d+$/.test(s)||Number(s)<min||Number(s)>max)throw new Error('Paginazione non valida');return Number(s);};
 return {tab:tab as ActivityTab,limit:integer('limit',12,50,1),offset:integer('offset',0,10000,0)};
}
export function activityPage(items:Activity[],tab:ActivityTab,limit:number,offset:number){
 const unique=[...new Map(items.map(a=>[a.id,a])).values()].filter(a=>a.tab===tab);
 unique.sort((a,b)=>(tab==='history'?b.sort_at.localeCompare(a.sort_at):a.sort_at.localeCompare(b.sort_at))||a.id.localeCompare(b.id));
 return {data:unique.slice(offset,offset+limit),has_more:unique.length>offset+limit,limit,offset,tab};
}
