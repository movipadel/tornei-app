import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='./playingSide')return {url:new URL('../../src/lib/playingSide.ts',import.meta.url).href,shortCircuit:true};
  const aliases={
    '@/lib/moviRequests':'../../src/lib/moviRequests.ts',
    '@/lib/playerMatching':'../../src/lib/playerMatching.ts',
    '@/lib/playerProfile':'../../src/lib/playerProfile.ts',
  };
  if(aliases[specifier])return {url:new URL(aliases[specifier],import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}});

const {giocaMatchingContext,giocaRequestToMatchingCriteria,mergeGiocaMatchResults,supportsGiocaMatching,weekdayFromStoredDate}=await import('../../src/lib/giocaMatching.ts');
const {rankPlayerMatches}=await import('../../src/lib/playerMatching.ts');

const request=(overrides={})=>({request_type:'gioca',status:'received',clubs:['Manta'],requested_date:'2026-10-02',time_window:'evening',level:'intermedio',match_type:['male'],playing_side:'left',group_size:1,required_player_side:null,...overrides});
const candidate=(id,name,overrides={})=>({id,fullName:name,normalizedPhone:'+393330000001',gender:'M',accountLinked:true,status:'active',moviLevel:null,identityWarning:false,profile:{descriptive_level:'intermedio',preferred_side:'right',preferred_clubs:['Manta'],available_other_clubs:false,preferred_match_types:['male'],available_last_minute:true,availability:[{weekday:5,time_window:'evening'}]},...overrides});

test('adapter maps stored Gioca fields without inventing numeric level or urgency',()=>{
  const criteria=giocaRequestToMatchingCriteria(request(),'10000000-0000-4000-8000-000000000001');
  assert.deepEqual(criteria,[{clubs:['Manta'],targetLevelNumeric:null,targetLevelDescriptive:'intermedio',weekday:5,timeWindow:'evening',playingSide:'left',requiredPlayerSide:null,matchType:'male',lastMinute:false,excludePlayerId:'10000000-0000-4000-8000-000000000001'}]);
  assert.equal(weekdayFromStoredDate('2026-10-02'),5);
  assert.equal(giocaMatchingContext(criteria,['male'],1).requesterExcluded,true);
});

test('multiple clubs remain a set while flexible fields become neutral',()=>{
  const multiple=giocaRequestToMatchingCriteria(request({clubs:['Manta','Costigliole']}),null);
  assert.deepEqual(multiple[0].clubs,['Manta','Costigliole']);
  const flexible=giocaRequestToMatchingCriteria(request({clubs:[],requested_date:null,time_window:'any',level:'unknown',match_type:['any']}),null);
  assert.deepEqual(flexible,[{clubs:[],targetLevelNumeric:null,targetLevelDescriptive:null,weekday:null,timeWindow:null,playingSide:'left',requiredPlayerSide:null,matchType:null,lastMinute:false,excludePlayerId:null}]);
});

test('multiple match types become OR criteria and duplicate candidates keep their best score',()=>{
  const criteria=giocaRequestToMatchingCriteria(request({match_type:['male','mixed']}),null);
  assert.deepEqual(criteria.map(item=>item.matchType),['male','mixed']);
  const alpha={id:'1',fullName:'Alpha',score:62},alphaBetter={...alpha,score:84},beta={id:'2',fullName:'Beta',score:75};
  assert.deepEqual(mergeGiocaMatchResults([[alpha,beta],[alphaBetter]]).map(item=>[item.id,item.score]),[['1',84],['2',75]]);
  assert.deepEqual(giocaMatchingContext(criteria,['male','mixed'],1).matchTypes,['male','mixed']);
});

test('group three maps required side directly while keeping requester playing side independent',()=>{
  const [criteria]=giocaRequestToMatchingCriteria(request({group_size:3,required_player_side:'right',playing_side:'left'}),null);
  assert.equal(criteria.playingSide,'left');
  assert.equal(criteria.requiredPlayerSide,'right');
  assert.equal(giocaMatchingContext([criteria],['male'],3).requiredPlayerSide,'right');
  assert.throws(()=>giocaRequestToMatchingCriteria(request({group_size:3,required_player_side:null}),null));
  assert.throws(()=>giocaRequestToMatchingCriteria(request({group_size:2,required_player_side:'right'}),null));
});

test('groups one and two retain identical complementary-side criteria',()=>{
  const [alone]=giocaRequestToMatchingCriteria(request({group_size:1}),null);
  const [pair]=giocaRequestToMatchingCriteria(request({group_size:2}),null);
  assert.deepEqual(pair,alone);
  assert.equal(alone.playingSide,'left');
  assert.equal(alone.requiredPlayerSide,null);
});

test('adapter rejects Allenati and invalid dates and state policy is explicit',()=>{
  assert.throws(()=>giocaRequestToMatchingCriteria(request({request_type:'allenati'}),null));
  assert.throws(()=>weekdayFromStoredDate('2026-02-30'));
  for(const status of ['received','searching','found'])assert.equal(supportsGiocaMatching(request({status})),true);
  for(const status of ['completed','cancelled'])assert.equal(supportsGiocaMatching(request({status})),false);
  assert.equal(supportsGiocaMatching(request({request_type:'allenati'})),false);
});

test('manual and request entry points are equivalent for identical canonical criteria except requester exclusion',()=>{
  const players=[candidate('10000000-0000-4000-8000-000000000001','Alpha'),candidate('10000000-0000-4000-8000-000000000002','Beta')];
  const [requestCriteria]=giocaRequestToMatchingCriteria(request(),null);
  const manualEquivalent={...requestCriteria};
  assert.deepEqual(rankPlayerMatches(players,requestCriteria),rankPlayerMatches(players,manualEquivalent));
  assert.deepEqual(rankPlayerMatches(players,{...requestCriteria,excludePlayerId:players[0].id}).map(v=>v.id),[players[1].id]);
});

test('request endpoint is permission-guarded, read-only and calls the certified engine',()=>{
  const route=readFileSync('src/app/api/admin/requests/[id]/player-suggestions/route.ts','utf8');
  const detail=readFileSync('src/app/admin/requests/[id]/RequestDetail.tsx','utf8');
  const panel=readFileSync('src/app/admin/requests/[id]/RequestMatchingPanel.tsx','utf8');
  assert.match(route,/editorialOperator\(req, 'requests\.manage'/);
  assert.match(route,/criteria\.map\(item => findPlayerMatches\(item\)\)/);
  assert.match(route,/account_user_id/);
  assert.doesNotMatch(route,/\.update\(|\.insert\(|\.upsert\(|tax_code|certificate|moviback|reward|redemption/i);
  assert.match(detail,/request_type\s*===\s*'gioca'/);
  assert.match(detail,/received',\s*'searching',\s*'found/);
  assert.match(panel,/Suggerisci giocatori/);
  assert.match(panel,/\/admin\/players\?mode=matching/);
  assert.match(detail,/Quarto cercato/);
  assert.match(panel,/Quarto cercato/);
  assert.doesNotMatch(panel,/scorePlayerMatch|rankPlayerMatches/);
});
