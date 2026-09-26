import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { computeGameProfileCompleteness } from '../../src/lib/playerProfileCompleteness.ts';

const base={
  hasProfile:true,
  descriptiveLevel:null,
  moviLevel:null,
  preferredClubs:[],
  availableOtherClubs:null,
  availabilityCount:0,
  preferredMatchTypes:[],
  availableLastMinute:null,
};

test('a full profile is complete at 5/5',()=>{
  const result=computeGameProfileCompleteness({...base,moviLevel:3.5,availabilityCount:1,preferredMatchTypes:['mixed'],availableLastMinute:false});
  assert.deepEqual({score:result.score,status:result.status,missing:result.missing},{score:5,status:'complete',missing:[]});
});

test('descriptive level is a valid fallback and explicit yes/no both complete last minute',()=>{
  for(const availableLastMinute of [true,false]){
    const result=computeGameProfileCompleteness({...base,descriptiveLevel:'intermedio',availabilityCount:1,preferredMatchTypes:['any'],availableLastMinute});
    assert.equal(result.score,5);
  }
});

test('partial profile reports human missing labels',()=>{
  const result=computeGameProfileCompleteness({...base,descriptiveLevel:'principiante',preferredMatchTypes:['female']});
  assert.equal(result.status,'partial');
  assert.equal(result.score,3);
  assert.deepEqual(result.missing,['disponibilità settimanale','disponibilità last minute']);
});

test('empty absent profile stays a data-quality warning',()=>{
  const result=computeGameProfileCompleteness({...base,hasProfile:false});
  assert.equal(result.status,'incomplete');
  assert.equal(result.score,0);
  assert.ok(result.missing.includes('preferenza club'));
});

test('weekly availability and match type independently affect score',()=>{
  const neither=computeGameProfileCompleteness({...base,descriptiveLevel:'avanzato',availableLastMinute:true});
  const weekly=computeGameProfileCompleteness({...base,descriptiveLevel:'avanzato',availableLastMinute:true,availabilityCount:1});
  const match=computeGameProfileCompleteness({...base,descriptiveLevel:'avanzato',availableLastMinute:true,preferredMatchTypes:['male']});
  assert.equal(weekly.score,neither.score+1);
  assert.equal(match.score,neither.score+1);
});

test('list contract filters all completeness bands and remains bounded',()=>{
  const api=readFileSync('src/app/api/admin/players/route.ts','utf8');
  const page=readFileSync('src/app/admin/players/page.tsx','utf8');
  assert.match(api,/profileFilters.*complete.*partial.*incomplete/);
  assert.match(api,/Math\.min\(50/);
  assert.match(page,/Profilo di gioco incompleto/);
  assert.match(page,/Cerca nome o telefono/);
  assert.doesNotMatch(page,/tax_code|file_path|internal_notes/);
});

test('patch creates no matching API and keeps the promo endpoint',()=>{
  const detail=readFileSync('src/app/admin/players/[id]/PlayerDetail.tsx','utf8');
  assert.match(detail,/\/api\/admin\/moviback\/users\/\$\{membership\.id\}\/promo/);
  assert.match(detail,/Moltiplicatore punti/);
  assert.doesNotMatch(detail,/matching|compatib/i);
});
