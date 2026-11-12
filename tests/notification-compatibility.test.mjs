import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url);
function load(path,mocks={}) {
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const result={exports:{}};
 new Function('require','module','exports',code)(name=>name==='server-only'?{}:mocks[name]??nativeRequire(name),result,result.exports);
 return result.exports;
}
const urls=load('src/lib/pushUrl.ts');
const producers=[
 ['src/app/api/tournaments/[id]/registrations/route.ts',1],
 ['src/app/api/registrations/[id]/route.ts',2],
 ['src/app/api/moviback/request-membership/route.ts',1],
 ['src/app/api/moviback/rewards/redeem/route.ts',2],
 ['src/app/api/store/orders/route.ts',1],
];
function fixture() {
 const legacy=[{id:'old',endpoint:'https://fcm.googleapis.com/test',p256dh:'synthetic',auth:'synthetic',is_active:true}];
 const sent=[];let owned=null,staff={is_active:true,role:'admin'};let transportError=null;const updated=[];
 const db={from(table){return {
  select(){return {eq(key,value){if(table==='admin_push_subscriptions')return Promise.resolve({data:legacy.filter(row=>row[key]===value)});return {maybeSingle:async()=>({data:table==='push_subscriptions'?owned:staff})};}};},
  update(value){return {eq:async(key,id)=>{updated.push({table,key,id,value});return {error:null};}};},
 };}};
 const sender=load('src/lib/adminPush.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:()=>db},'@/lib/pushUrl':urls,'@/lib/pushTransport':{legacyAdminPushEnabled:()=>true,sendLegacyAdminPush:async(sub,payload)=>{if(transportError)throw transportError;sent.push({sub,payload});}}});
 return {send:sender.sendAdminPushNotification,sent,legacy,updated,setOwned:value=>{owned=value;},setStaff:value=>{staff=value;},fail:value=>{transportError=value;}};
}
test('migrated producers enqueue canonical events and never call legacy transport',()=>{
 for(const [file,expected] of producers){const source=readFileSync(file,'utf8');const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);let calls=0;function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='enqueueStaffPushEvent')calls++;ts.forEachChild(n,visit);}visit(ast);assert.equal(calls,expected,file);assert.doesNotMatch(source,/sendAdminPushNotification|web-push/);}
});

test('compatibility never creates recipients and respects owned revocation/account changes without fallback',async()=>{
 const f=fixture();f.legacy.push({...f.legacy[0],id:'duplicate'});
 assert.equal((await f.send({title:'Test',body:'Test'})).sent,1);
 for(const owner of [{is_active:false,staff_user_id:'s'},{is_active:true,revoked_at:'now',staff_user_id:'s'},{is_active:true,public_user_id:'u'}]){
  f.setOwned(owner);assert.equal((await f.send({title:'Test',body:'Test'})).sent,0);
 }
 f.setOwned({is_active:true,staff_user_id:'s'});
 for(const staff of [{is_active:false,role:'admin'},{is_active:true,role:'staff'}]){f.setStaff(staff);assert.equal((await f.send({title:'Test',body:'Test'})).sent,0);}
 f.setStaff({is_active:true,role:'admin'});assert.equal((await f.send({title:'Test',body:'Test'})).sent,1);
 f.legacy.length=0;assert.equal((await f.send({title:'Test',body:'Test'})).sent,0,'owned rows are not automatically added to business audience');
});
test('cutover inactive legacy rows never send, even after canonical re-enrollment',async()=>{
 const f=fixture();f.legacy[0].is_active=false;
 assert.equal((await f.send({title:'Test',body:'Test'})).sent,0);
 f.setOwned({is_active:true,staff_user_id:'s'});
 assert.equal((await f.send({title:'Test',body:'Test'})).sent,0);
 assert.equal(f.sent.length,0);assert.equal(f.legacy.length,1);
});
test('legacy 404/410 cleanup checks exact legacy row; no real provider is used',async()=>{
 for(const statusCode of [404,410]){const f=fixture();f.fail({statusCode});assert.equal((await f.send({title:'Test',body:'Test'})).failed,1);assert.equal(f.updated[0].id,'old');assert.equal(f.updated[0].table,'admin_push_subscriptions');assert.equal(f.updated[0].value.is_active,false);}
});
test('legacy and canonical send modes are mutually exclusive, including simultaneous enable flags; local target always disabled',()=>{
 const names=['NODE_ENV','SUPABASE_URL','PUSH_BUSINESS_TRANSPORT','PUSH_TRANSPORT','PUSH_DELIVERY_ENABLED'];const before=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 const transport=load('src/lib/pushTransport.ts',{'@/lib/pushValidation':{validatePushSubscription(){throw Error('No provider use');}}});
 try{
  Object.assign(process.env,{NODE_ENV:'production',SUPABASE_URL:'https://synthetic.invalid',PUSH_TRANSPORT:'web-push',PUSH_DELIVERY_ENABLED:'true'});delete process.env.PUSH_BUSINESS_TRANSPORT;
  assert.equal(transport.legacyAdminPushEnabled(),true);assert.equal(transport.pushTransportEnabled(),false);
  process.env.PUSH_BUSINESS_TRANSPORT='canonical';assert.equal(transport.legacyAdminPushEnabled(),false);assert.equal(transport.pushTransportEnabled(),true);
  for(const mode of ['legacy','canonical']){process.env.PUSH_BUSINESS_TRANSPORT=mode;process.env.SUPABASE_URL='http://127.0.0.1:55421';assert.equal(transport.legacyAdminPushEnabled(),false);assert.equal(transport.pushTransportEnabled(),false);}
 }finally{for(const k of names)if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
});
test('canonical worker preserves legacy display fields and sanitizes destinations/icons',async()=>{
 const listeners={};let shown,task;const opened=[];
 const worker={location:{origin:'https://movi.invalid'},addEventListener:(name,fn)=>{listeners[name]=fn;},registration:{showNotification:async(title,options)=>{shown={title,...options};}},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 const code=ts.transpileModule(readFileSync('worker/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports','self','caches',code)(()=>urls,{},worker,{delete:async()=>true});
 const waitUntil=p=>{task=p;};const payload={title:'Legacy title',body:'Legacy body',url:'/admin/store-orders',icon:'/custom-icon.png',badge:'/custom-badge.png'};
 listeners.push({data:{json:()=>payload},waitUntil});await task;
 assert.equal(shown.title,payload.title);assert.equal(shown.body,payload.body);assert.equal(shown.icon,payload.icon);assert.equal(shown.badge,payload.badge);assert.equal(shown.data.url,payload.url);
 listeners.notificationclick({notification:{data:shown.data,close(){}},waitUntil});await task;assert.equal(opened[0],'https://movi.invalid/admin/store-orders');
 listeners.push({data:{json:()=>({...payload,url:'//evil.invalid',icon:'https://evil.invalid/icon',badge:'//evil.invalid/badge'})},waitUntil});await task;assert.equal(shown.data.url,'/');assert.equal(shown.icon,'/icon-192.png');assert.equal(shown.badge,'/icon-192.png');
});
test('legacy rows are preserved, new enrollment remains canonical, and email/push claims remain separated',()=>{
 const migration=readFileSync('supabase/migrations/20261103201543_notification_foundation_v1.sql','utf8');
 assert.match(migration,/update public\.admin_push_subscriptions\s+set is_active = false, updated_at = now\(\)\s+where is_active = true/i);
 assert.doesNotMatch(migration,/delete from public\.admin_push_subscriptions|insert into public\.admin_push_subscriptions|set staff_id/i);
 assert.match(migration,/d\.channel='email'/);assert.match(migration,/where channel='push'/);
 assert.match(migration,/p_enabled boolean default false/);
 const api=readFileSync('src/lib/pushApi.ts','utf8');assert.match(api,/manage_push_subscription/);assert.doesNotMatch(api,/admin_push_subscriptions/);
 const alias=readFileSync('public/admin-push-sw.js','utf8');assert.match(alias,/importScripts\('\/sw.js'\)/);assert.doesNotMatch(alias,/addEventListener|register\(/);
 const proxy=readFileSync('src/proxy.ts','utf8');assert.match(proxy,/pathname === '\/admin-push-sw.js'/);
 assert.ok(proxy.indexOf("pathname === '/admin-push-sw.js'")<proxy.indexOf('const authResponse = await refreshSupabaseAuth'));
});
test('Telegram producers/transport and customer communications/League source remain baseline-identical',()=>{
 const registration='src/app/api/tournaments/[id]/registrations/route.ts';
 const current=readFileSync(registration,'utf8');
 assert.match(current,/schedulePostCommitNotifications\("\/api\/tournaments\/\[id\]\/registrations"/);
 assert.match(current,/sendTelegramMessage\(registrationText\)/);
 assert.match(current,/enqueueStaffPushEvent\(result\.is_reserve \? "tournament\.reserve\.created" : "tournament\.registration\.created", result\.id\)/);
 // Balance reads changed in these two routes; their push producers are checked above.
 const balanceRoutes=new Set(['src/app/api/moviback/rewards/redeem/route.ts','src/app/api/store/orders/route.ts']);
 const files=[...producers.map(([file])=>file).filter(file=>file!==registration && !balanceRoutes.has(file)),'src/lib/telegram.ts','src/lib/moviRequestsServer.ts','src/lib/requestNotification.ts','src/lib/postCommitNotifications.ts','src/app/api/user/communications/route.ts','src/app/api/user/communications/state/route.ts','src/app/api/cron/monday-league-notifications/route.ts','supabase/migrations/20260921130000_monday_league_stage7_notifications.sql'];
 for(const file of files){const baseline=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8',windowsHide:true});assert.equal(withoutPush(readFileSync(file,'utf8')),withoutPush(baseline),file);}
});

function withoutPush(source){const ast=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true);const edits=[];function visit(n){if(ts.isImportDeclaration(n)&&/\/(adminPush|staffPush)$/.test(n.moduleSpecifier.text))edits.push([n.getStart(ast),n.end,'']);if(ts.isCallExpression(n)&&['sendAdminPushNotification','enqueueStaffPushEvent'].includes(n.expression.getText(ast)))edits.push([n.getStart(ast),n.end,'PUSH_CALL']);ts.forEachChild(n,visit);}visit(ast);for(const [a,b,value]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,a)+value+source.slice(b);return source.replace(/\s+/g,'');}
