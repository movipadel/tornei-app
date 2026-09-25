import assert from 'node:assert/strict';
import test from 'node:test';
import {playerIdentityRequest} from '../../src/lib/playerIdentityClient.ts';
test('identity transport reports structured blocked and stale errors',async()=>{
 for(const error of ['Queste due identità non possono essere unite perché sono collegate a due account diversi.','Il caso non è più aggiornato.'])await assert.rejects(playerIdentityRequest('merge',{}, {fetcher:async()=>new Response(JSON.stringify({error}),{status:409})}),{message:error});
});
test('identity transport returns success and rejects malformed responses',async()=>{
 assert.deepEqual(await playerIdentityRequest('resolve_case',{}, {fetcher:async()=>Response.json({data:{state:'saved'}})}),{state:'saved'});
 await assert.rejects(playerIdentityRequest('merge',{}, {fetcher:async()=>new Response('invalid')}),/Risposta non valida/);
});
test('identity transport ends on a stalled request, stalled body and network failure',async()=>{
 await assert.rejects(playerIdentityRequest('merge',{}, {timeoutMs:15,fetcher:()=>new Promise(()=>{})}),/risposta tarda/);
 await assert.rejects(playerIdentityRequest('merge',{}, {timeoutMs:15,fetcher:async()=>({ok:true,json:()=>new Promise(()=>{})})}),/risposta tarda/);
 await assert.rejects(playerIdentityRequest('merge',{}, {fetcher:async()=>{throw new TypeError('offline');}}),/Connessione interrotta/);
});
