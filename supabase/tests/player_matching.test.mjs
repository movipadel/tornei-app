import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='@/lib/playerProfile')return {url:new URL('../../src/lib/playerProfile.ts',import.meta.url).href,shortCircuit:true};
  if(specifier==='./playingSide')return {url:new URL('../../src/lib/playingSide.ts',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}});
const {
  parsePlayerMatchCriteria,
  rankPlayerMatches,
  scorePlayerMatch,
}=await import('../../src/lib/playerMatching.ts');

const criteria=(overrides={})=>({
  clubs:['Manta'],targetLevelNumeric:3.5,targetLevelDescriptive:null,weekday:5,timeWindow:'evening',matchType:'male',playingSide:null,lastMinute:false,excludePlayerId:null,...overrides,
});
const candidate=(overrides={})=>({
  id:'10000000-0000-4000-8000-000000000001',fullName:'Mario Rossi',normalizedPhone:'+393330000001',gender:'M',accountLinked:false,status:'active',moviLevel:3.5,identityWarning:false,
  profile:{descriptive_level:'intermedio',preferred_side:null,preferred_clubs:['Manta'],available_other_clubs:false,preferred_match_types:['male'],available_last_minute:true,availability:[{weekday:5,time_window:'evening'}]},
  ...overrides,
});

test('numeric level scoring follows exact, half-step, full-step and hard exclusion',()=>{
  assert.equal(scorePlayerMatch(candidate(),criteria()).scoreParts.level.score,30);
  assert.equal(scorePlayerMatch(candidate({moviLevel:3}),criteria()).scoreParts.level.score,24);
  assert.equal(scorePlayerMatch(candidate({moviLevel:4.5}),criteria()).scoreParts.level.score,16);
  assert.equal(scorePlayerMatch(candidate({moviLevel:5}),criteria()),null);
});

test('descriptive fallback is lower confidence and never fabricates candidate numeric level',()=>{
  const result=scorePlayerMatch(candidate({moviLevel:null,profile:{...candidate().profile,descriptive_level:'intermedio'}}),criteria());
  assert.equal(result.scoreParts.level.score,20);
  assert.equal(result.moviLevel,null);
  const future=scorePlayerMatch(candidate({moviLevel:null}),criteria({targetLevelNumeric:null,targetLevelDescriptive:'intermedio'}));
  assert.equal(future.scoreParts.level.score,20);
});

test('club scoring covers preferred, other allowed, unrestricted and explicit incompatibility',()=>{
  assert.equal(scorePlayerMatch(candidate(),criteria()).scoreParts.club.score,20);
  assert.equal(scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_clubs:['Saluzzo'],available_other_clubs:true}}),criteria()).scoreParts.club.score,12);
  assert.equal(scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_clubs:[],available_other_clubs:null}}),criteria()).scoreParts.club.score,10);
  assert.equal(scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_clubs:['Saluzzo'],available_other_clubs:false}}),criteria()),null);
});

test('availability awards day and time separately while unknown remains neutral',()=>{
  const exact=scorePlayerMatch(candidate(),criteria());
  const day=scorePlayerMatch(candidate({profile:{...candidate().profile,availability:[{weekday:5,time_window:'morning'}]}}),criteria());
  const time=scorePlayerMatch(candidate({profile:{...candidate().profile,availability:[{weekday:2,time_window:'evening'}]}}),criteria());
  const unknown=scorePlayerMatch(candidate({profile:{...candidate().profile,availability:[]}}),criteria());
  const incompatible=scorePlayerMatch(candidate({profile:{...candidate().profile,availability:[{weekday:2,time_window:'morning'}]}}),criteria());
  assert.equal(exact.scoreParts.availability.score,25);
  assert.equal(day.scoreParts.availability.score,10);
  assert.equal(time.scoreParts.availability.score,15);
  assert.equal(unknown.scoreParts.availability.score,12);
  assert.equal(incompatible.scoreParts.availability.score,0);
  assert.ok(unknown.score<exact.score);
});

test('match type scores explicit, any and missing, and excludes explicit mismatch',()=>{
  assert.equal(scorePlayerMatch(candidate(),criteria()).scoreParts.matchType.score,15);
  assert.equal(scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_match_types:['any']}}),criteria()).scoreParts.matchType.score,12);
  assert.equal(scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_match_types:[]}}),criteria()).scoreParts.matchType.score,10);
  assert.equal(scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_match_types:['female']}}),criteria()),null);
});

test('last-minute scoring is true 10, unknown 5, false 0 and neutral in normal searches',()=>{
  assert.deepEqual(
    [true,null,false].map(value=>scorePlayerMatch(candidate({profile:{...candidate().profile,available_last_minute:value}}),criteria({lastMinute:true})).scoreParts.lastMinute.score),
    [10,5,0],
  );
  const normal=scorePlayerMatch(candidate({profile:{...candidate().profile,available_last_minute:false}}),criteria());
  assert.deepEqual(normal.scoreParts.lastMinute,{score:0,max:0,detail:'Non rilevante per questa ricerca'});
});

test('side is a soft 10/7/5/2 score and any or legacy request disables the dimension',()=>{
  const sideScore=(preferred_side,playingSide='left')=>scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_side}}),criteria({playingSide})).scoreParts.side;
  assert.equal(sideScore('right').score,10);
  assert.equal(sideScore('any').score,7);
  assert.equal(sideScore(null).score,5);
  assert.equal(sideScore('left').score,2);
  assert.deepEqual(sideScore('right','any'),{score:0,max:0,detail:'Lato richiesta indifferente'});
  assert.deepEqual(sideScore('right',null),{score:0,max:0,detail:'Lato richiesta non indicato'});
  assert.notEqual(scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_side:'left'}}),criteria({playingSide:'left'})),null);
});

test('side never restores candidates rejected by existing hard constraints',()=>{
  const profile={...candidate().profile,preferred_side:'right'};
  assert.equal(scorePlayerMatch(candidate({profile,moviLevel:5}),criteria({playingSide:'left'})),null);
  assert.equal(scorePlayerMatch(candidate({profile:{...profile,preferred_clubs:['Saluzzo'],available_other_clubs:false}}),criteria({playingSide:'left'})),null);
  assert.equal(scorePlayerMatch(candidate({profile:{...profile,preferred_match_types:['female']}}),criteria({playingSide:'left'})),null);
});

test('normal searches normalize 90 raw points to 100',()=>{
  assert.equal(scorePlayerMatch(candidate(),criteria()).score,100);
  assert.equal(scorePlayerMatch(candidate(),criteria({lastMinute:true})).score,100);
});

test('ranking enforces threshold, top 20 and deterministic tie order',()=>{
  const players=Array.from({length:25},(_,index)=>candidate({id:`10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,fullName:`Giocatore ${String.fromCharCode(90-index)}`}));
  const results=rankPlayerMatches(players,criteria());
  assert.equal(results.length,20);
  assert.deepEqual(results.map(item=>item.fullName),[...results.map(item=>item.fullName)].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'})));
  assert.ok(results.every(item=>item.score>=50));
});

test('archived, merged and explicitly excluded identities never appear while no-account does',()=>{
  const active=candidate();
  assert.equal(rankPlayerMatches([active,candidate({id:'10000000-0000-4000-8000-000000000002',status:'archived'}),candidate({id:'10000000-0000-4000-8000-000000000003',status:'merged'})],criteria()).length,1);
  assert.equal(rankPlayerMatches([active],criteria({excludePlayerId:active.id})).length,0);
  assert.equal(rankPlayerMatches([active],criteria())[0].accountState,'unlinked');
});

test('parser supports numeric or descriptive targets and rejects arbitrary fields',()=>{
  const numeric=parsePlayerMatchCriteria({club:'Manta',target_level_numeric:3.5,target_level_descriptive:null,weekday:5,time_window:'evening',match_type:'male',last_minute:false});
  const descriptive=parsePlayerMatchCriteria({club:'Manta',target_level_numeric:null,target_level_descriptive:'intermedio',weekday:5,time_window:'evening',match_type:'male',last_minute:false});
  assert.equal(numeric.targetLevelNumeric,3.5);
  assert.deepEqual(numeric.clubs,['Manta']);
  assert.equal(descriptive.targetLevelDescriptive,'intermedio');
  assert.throws(()=>parsePlayerMatchCriteria({club:'Manta',target_level_numeric:3.5,target_level_descriptive:null,weekday:5,time_window:'evening',match_type:'male',last_minute:false,tax_code:'NO'}));
});

test('canonical criteria support multiple or flexible clubs without changing manual scoring',()=>{
  const multi=scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_clubs:['Costigliole'],available_other_clubs:false}}),criteria({clubs:['Manta','Costigliole']}));
  assert.equal(multi.scoreParts.club.score,20);
  assert.equal(multi.matchedClub,'Costigliole');
  const flexible=scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_clubs:['Saluzzo'],available_other_clubs:false}}),criteria({clubs:[]}));
  assert.deepEqual(flexible.scoreParts.club,{score:0,max:0,detail:'Club indifferente'});
  assert.equal(flexible.matchedClub,null);
});

test('unknown request criteria are neutral and do not create hard exclusions',()=>{
  const result=scorePlayerMatch(candidate({profile:{...candidate().profile,preferred_match_types:['female'],availability:[{weekday:2,time_window:'morning'}]}}),criteria({targetLevelNumeric:null,targetLevelDescriptive:null,weekday:null,timeWindow:null,matchType:null}));
  assert.equal(result.scoreParts.level.max,0);
  assert.equal(result.scoreParts.availability.max,0);
  assert.equal(result.scoreParts.matchType.max,0);
  assert.equal(result.score,100);
});

test('matching route is players.manage guarded, same-origin and DTO excludes sensitive domains',()=>{
  const route=readFileSync('src/app/api/admin/players/match/route.ts','utf8');
  const server=readFileSync('src/lib/playerMatchingServer.ts','utf8');
  const domain=readFileSync('src/lib/playerMatching.ts','utf8');
  assert.match(route,/guardOperatorPermission\("players\.manage"\)/);
  assert.match(route,/Origine non consentita/);
  assert.match(server,/\.eq\("status", "active"\)/);
  assert.doesNotMatch(server,/tax_code|medical_certificates|loyalty_|reward|redemption|internal_notes/);
  assert.doesNotMatch(domain,/tax_code|certificate|moviback|points|reward|redemption/i);
});

test('one reusable domain helper is consumed by the server and UI does not score candidates',()=>{
  const server=readFileSync('src/lib/playerMatchingServer.ts','utf8');
  const ui=readFileSync('src/app/admin/players/PlayerMatchingPanel.tsx','utf8');
  const results=readFileSync('src/app/admin/players/PlayerMatchResults.tsx','utf8');
  const page=readFileSync('src/app/admin/players/page.tsx','utf8');
  const css=readFileSync('src/app/admin/players/players.module.css','utf8');
  const dashboard=readFileSync('src/app/admin/page.tsx','utf8');
  assert.match(server,/rankPlayerMatches/);
  assert.match(server,/COARSE_CANDIDATE_LIMIT = 500/);
  assert.match(ui,/\/api\/admin\/players\/match/);
  assert.match(results,/Apri giocatore/);
  assert.match(page,/Elenco giocatori/);
  assert.match(page,/Trova giocatori compatibili/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.doesNotMatch(dashboard,/Trova giocatori compatibili|Player Matching/);
  assert.doesNotMatch(ui,/scorePlayerMatch|rankPlayerMatches/);
});
