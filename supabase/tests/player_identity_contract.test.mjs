import test from 'node:test';
import assert from 'node:assert/strict';
import {ownsCircuitResult} from '../../src/lib/playerIdentity.ts';
import {buildPublicCircuitRanking} from '../../src/lib/circuitPublicRanking.ts';
test('certified circuit identity wins over keys, including negative ownership',()=>{
 assert.equal(ownsCircuitResult({player_identity_id:'mine',player_key:'old'},['mine'],[]),true);
 assert.equal(ownsCircuitResult({player_identity_id:'other',player_key:'myphone'},['mine'],['myphone']),false);
 assert.equal(ownsCircuitResult({player_identity_id:null,player_key:'myphone'},[],['myphone']),true);
});
test('additive UUID linkage leaves public ranking values and name aggregation unchanged',()=>{
 const rows=[{player_name:' Test ',points:100,player_key:'a'},{player_name:'Test',points:90,player_key:'b'},{player_name:'Other',points:80,player_key:'c'}];
 assert.deepEqual(buildPublicCircuitRanking(rows),buildPublicCircuitRanking(rows.map((r,i)=>({...r,player_identity_id:`identity-${i}`}))));
});
