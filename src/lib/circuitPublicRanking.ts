// Existing public circuit ranking rule, shared without changing its semantics.
export type PublicRankingRow={position:number;player_name:string;total_points:number;events_played:number};
export function buildPublicCircuitRanking(results:ReadonlyArray<{player_name:string|null;points:number|null}>):PublicRankingRow[]{
 const byPlayer=new Map<string,{player_name:string;total_points:number;events_played:number}>();
 for(const row of results){const playerName=String(row.player_name??'').trim();if(!playerName)continue;const current=byPlayer.get(playerName)??{player_name:playerName,total_points:0,events_played:0};current.total_points+=Number(row.points??0);current.events_played+=1;byPlayer.set(playerName,current);}
 return Array.from(byPlayer.values()).sort((a,b)=>b.total_points!==a.total_points?b.total_points-a.total_points:a.player_name.localeCompare(b.player_name,'it')).map((row,index)=>({position:index+1,...row}));
}
