import test from 'node:test';
import assert from 'node:assert/strict';
import { storeAndRegisterPrivateImage } from '../../src/lib/padelleriaPrivateImageUpload.ts';

const input=(storage,register=async()=> 'new-media')=>({
  storage,register,mediaId:'new-media',originalPath:'original',originalBytes:new Uint8Array([1]),originalMime:'image/png',
  variants:[{path:'w480',bytes:new Uint8Array([2])},{path:'w960',bytes:new Uint8Array([3])}],
});
function fakeStorage(failAt){
  const calls=[];
  const method=name=>async(path)=>{calls.push([name,path]);return {error:name===failAt?new Error('synthetic failure'):null};};
  return {calls,storage:{
    uploadOriginal:method('uploadOriginal'),uploadVariant:method('uploadVariant'),
    removeOriginal:method('removeOriginal'),removeVariants:method('removeVariants'),
  }};
}

test('partial variant failure cleans every attempted private path and never registers',async()=>{
  const fake=fakeStorage('uploadVariant');let registrations=0;
  await assert.rejects(storeAndRegisterPrivateImage(input(fake.storage,async()=>{registrations++;return 'new-media'})));
  assert.equal(registrations,0);
  assert.deepEqual(fake.calls,[
    ['uploadOriginal','original'],['uploadVariant','w480'],
    ['removeVariants',['w480']],['removeOriginal',['original']],
  ]);
});

test('failed registration cleans original and all variants',async()=>{
  const fake=fakeStorage();
  await assert.rejects(storeAndRegisterPrivateImage(input(fake.storage,async()=>{throw new Error('DB rejected')})),/DB rejected/);
  assert.deepEqual(fake.calls.slice(-2),[['removeVariants',['w480','w960']],['removeOriginal',['original']]]);
});

test('idempotent registration race returns winning row and cleans losing upload',async()=>{
  const fake=fakeStorage();
  const result=await storeAndRegisterPrivateImage(input(fake.storage,async()=> 'existing-media'));
  assert.deepEqual(result,{id:'existing-media',created:false,cleanupComplete:true});
  assert.deepEqual(fake.calls.slice(-2),[['removeVariants',['w480','w960']],['removeOriginal',['original']]]);
});

test('cleanup failure is surfaced rather than silently ignored',async()=>{
  const fake=fakeStorage('removeVariants');
  await assert.rejects(storeAndRegisterPrivateImage(input(fake.storage,async()=>{throw new Error('DB rejected')})),/pulizia privata incompleta/);
  assert.ok(fake.calls.some(([name])=>name==='removeOriginal'));
});

test('interruption after first private upload cleans it and the original',async()=>{
  const controller=new AbortController(),fake=fakeStorage();
  const originalUpload=fake.storage.uploadVariant;
  fake.storage.uploadVariant=async(path,bytes)=>{const result=await originalUpload(path,bytes);controller.abort();return result;};
  await assert.rejects(storeAndRegisterPrivateImage({...input(fake.storage),signal:controller.signal}),/interrotto/);
  assert.deepEqual(fake.calls.slice(-2),[['removeVariants',['w480']],['removeOriginal',['original']]]);
});

test('zero-variant upload registers only the original and cleans it on failed registration',async()=>{
  const success=fakeStorage();
  const created=await storeAndRegisterPrivateImage({...input(success.storage),variants:[]});
  assert.deepEqual(created,{id:'new-media',created:true,cleanupComplete:true});
  assert.deepEqual(success.calls,[['uploadOriginal','original']]);
  const failure=fakeStorage();
  await assert.rejects(storeAndRegisterPrivateImage({...input(failure.storage,async()=>{throw new Error('DB rejected')}),variants:[]}),/DB rejected/);
  assert.deepEqual(failure.calls,[['uploadOriginal','original'],['removeOriginal',['original']]]);
});
