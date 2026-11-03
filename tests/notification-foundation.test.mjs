import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createECDH,randomBytes } from 'node:crypto';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,mocks={}) {
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const compiledModule={exports:{}};
 new Function('require','module','exports',code)(name=>name==='server-only'?{}:mocks[name]??require(name),compiledModule,compiledModule.exports);
 return compiledModule.exports;
}
const validation=load('src/lib/pushValidation.ts');
const urls=load('src/lib/pushUrl.ts');
const ec=createECDH('prime256v1');ec.generateKeys();
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:ec.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
test('provider validation rejects arbitrary HTTPS, local targets, credentials, oversized endpoints and malformed keys',()=>{
 assert.equal(validation.validatePushSubscription(subscription).endpoint,subscription.endpoint);
 for(const endpoint of ['http://fcm.googleapis.com/x','https://localhost/x','https://127.0.0.1/x','https://10.1.2.3/x','https://172.16.0.1/x','https://192.168.1.1/x','https://[::1]/x','https://169.254.169.254/x','https://fcm.googleapis.com.evil.invalid/x','https://user:password@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','https://example.org/x','https://fcm.googleapis.com/'+ 'x'.repeat(2048)]) assert.throws(()=>validation.validatePushEndpoint(endpoint));
 for(const keys of [{},{p256dh:'bad',auth:'bad'},{p256dh:Buffer.alloc(65).toString('base64url'),auth:randomBytes(16).toString('base64url')}]) assert.throws(()=>validation.validatePushSubscription({...subscription,keys}));
});
test('bounded JSON input rejects owner injection, content type and streamed oversize',async()=>{
 for(const owner of ['public_user_id','staff_user_id','role']) await assert.rejects(validation.readPushBody(new Request('https://movi.invalid/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...subscription,[owner]:'injected'})})));
 await assert.rejects(validation.readPushBody(new Request('https://movi.invalid/api',{method:'POST',body:'{}'})),/CONTENT_TYPE/);
 await assert.rejects(validation.readPushBody(new Request('https://movi.invalid/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:'x'.repeat(5000)})})),/BODY_TOO_LARGE/);
});
test('deep links accept only root-relative same-origin paths',()=>{
 for(const bad of ['https://movi.invalid/path','https://evil.invalid','//evil.invalid','/\\evil.invalid','javascript:alert(1)','relative','/\n/evil.invalid']) assert.equal(urls.safePushUrl(bad,'https://movi.invalid'),'/');
 assert.equal(urls.safePushUrl('/richieste?id=1#details','https://movi.invalid'),'/richieste?id=1#details');
});
test('subscription API resolves customer/staff ownership, requires auth and origin, never trusts supplied owner',async()=>{
 let customer=null,operator=null;const calls=[];let state='active';
 const api=load('src/lib/pushApi.ts',{
  '@/lib/pushValidation':validation,
  '@/lib/currentMoviUser':{getCurrentMoviUser:async()=>({public_user_id:customer,conflict_state:null})},
  '@/lib/operatorAuthorization':{getCurrentOperator:async()=>operator},
  'next/headers':{cookies:async()=>({set(){},delete(){},get(){return undefined;}})},
  '@/lib/supabaseAdmin': { supabaseAdmin: () => ({ rpc: async (name,args) => { calls.push(args); return {data:{state,id:"device"}}; }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({data:{id:'device'}}) }) }) }) }) },
 });
 const req=(extra={},origin='https://movi.invalid')=>new Request('https://movi.invalid/api/push',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'subscribe',...subscription,...extra})});
 assert.equal((await api.handlePushRequest(req(),'customer')).status,401);
 assert.equal((await api.handlePushRequest(req(),'staff')).status,401);
 customer='customer-a';operator={sid:'staff-a'};
 assert.equal((await api.handlePushRequest(req({},'https://evil.invalid'),'customer')).status,403);
 assert.equal((await api.handlePushRequest(req({public_user_id:'customer-b'}),'customer')).status,400);
 assert.equal((await api.handlePushRequest(req({staff_user_id:'staff-b'}),'staff')).status,400);
 assert.equal((await api.handlePushRequest(req(),'customer')).status,200);assert.equal(calls.at(-1).p_public_user_id,'customer-a');assert.equal(calls.at(-1).p_staff_user_id,null);
 assert.equal((await api.handlePushRequest(req(),'staff')).status,200);assert.equal(calls.at(-1).p_staff_user_id,'staff-a');
 state='ownership_conflict';assert.equal((await api.handlePushRequest(req(),'customer')).status,409);
});
test('logout revokes only cookie device and original authenticated owner; errors are checked',async()=>{
 const predicates=[];let error=null;let deleted=false;
 const api=load('src/lib/pushApi.ts',{
  '@/lib/pushValidation':validation,
  '@/lib/currentMoviUser':{getCurrentMoviUser:async()=>({public_user_id:'a',conflict_state:null})},
  '@/lib/operatorAuthorization':{getCurrentOperator:async()=>({sid:'s'})},
  'next/headers':{cookies:async()=>({get:()=>({value:'device'}),delete:()=>{deleted=true;}})},
  '@/lib/supabaseAdmin':{supabaseAdmin:()=>({from:()=>({update:()=>({eq:(a,b)=>{predicates.push([a,b]);return {eq:async(c,d)=>{predicates.push([c,d]);return {error};}};}})})})},
 });
 await api.revokePushOnLogout('customer');assert.deepEqual(predicates,[['id','device'],['public_user_id','a']]);assert.ok(deleted);
 error={message:'db'};await assert.rejects(api.revokePushOnLogout('staff'),/REVOKE_FAILED/);
});
test('worker uses injected transport only for eligible targets and persists exact stale outcomes',async()=>{
 const outcomes=[];const sent=[];
 const targets=[{id:'a',subscription_id:'1'},{id:'b',subscription_id:'2'},{id:'c',subscription_id:'3'}];
 const sb={rpc:async(name,args)=>{
  if(name==='claim_push_deliveries')return {data:[{id:'d',event_id:'e'}]};
  if(name==='claim_push_targets')return {data:targets};
  if(name==='push_subscription_eligible')return {data:args.p_subscription_id!=='3'};
  if(name==='finish_push_target'){outcomes.push(args);return {data:null};}
  if(name==='finish_push_delivery')return {data:'failed'};
  throw new Error(name);
 },from:table=>({select:()=>({eq:(_key,id)=>({single:async()=>({data:table==='notification_events'?{payload:{push:{url:'https://evil.invalid'}}}:{...subscription,endpoint:id}})})})})};
 const delivery=load('src/lib/pushDelivery.ts',{'@/lib/supabaseAdmin':{supabaseAdmin:()=>sb},'@/lib/pushTransport':{sendOwnedPush:()=>{throw new Error('NO REAL SEND');}},'@/lib/pushUrl':urls});
 await delivery.processPushDeliveries(sb,async(sub,payload)=>{sent.push(sub.endpoint);assert.equal(payload.url,'/');if(sub.endpoint==='2')throw {statusCode:410};});
 assert.deepEqual(sent,['1','2']);assert.deepEqual(outcomes.map(x=>[x.p_target_id,x.p_status]),[['a','accepted'],['b','failed'],['c','skipped']]);assert.equal(outcomes[1].p_stale,true);
 assert.equal(delivery.pushFailure(404).stale,true);assert.equal(delivery.pushFailure(429).status,'retry');assert.equal(delivery.pushFailure(503).status,'retry');assert.equal(delivery.pushFailure(400).status,'failed');
});
test('VAPID mismatch is detectable; source contracts keep one worker and repair flow',()=>{
 const client=load('src/lib/pushClient.ts');const key=ec.getPublicKey();
 assert.equal(client.subscriptionKeyMatches({options:{applicationServerKey:Uint8Array.from(key).buffer}},key.toString('base64url')),true);
 assert.equal(client.subscriptionKeyMatches({options:{applicationServerKey:new Uint8Array(65).buffer}},key.toString('base64url')),false);
 const ui=readFileSync('src/components/PushEnrollmentCard.tsx','utf8');assert.match(ui,/subscription\.unsubscribe/);assert.match(ui,/ownership|conflict/);assert.match(ui,/Notification.requestPermission/);
 const sw=readFileSync('worker/index.ts','utf8');assert.match(sw,/addEventListener\('push'/);assert.match(sw,/addEventListener\('notificationclick'/);assert.match(sw,/await relevant.navigate/);
 assert.match(readFileSync('src/lib/pushClient.ts','utf8'),/navigator.serviceWorker.ready/);
 assert.doesNotMatch(readFileSync('src/app/admin/page.tsx','utf8'),/serviceWorker.register/);
 for(const p of ['src/app/admin/page.tsx','src/app/staff/page.tsx','src/app/profilo/page.tsx'])assert.match(readFileSync(p,'utf8'),/PushEnrollmentCard/);
 for(const p of ['src/components/PushEnrollmentCard.tsx','src/lib/pushClient.ts','worker/index.ts'])assert.doesNotMatch(readFileSync(p,'utf8'),/VAPID_PRIVATE_KEY/);
});

test('transport preflight validates pair without revealing keys; local transport cannot send',async()=>{
 const names=['NEXT_PUBLIC_VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','SUPABASE_URL','NODE_ENV','PUSH_DELIVERY_ENABLED','PUSH_TRANSPORT'];
 const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 let sent=0;
 const transport=load('src/lib/pushTransport.ts',{'@/lib/pushValidation':validation,'web-push':{setVapidDetails(){},sendNotification(){sent++;throw Error('Unexpected provider');}}});
 try {
  Object.assign(process.env,{NEXT_PUBLIC_VAPID_PUBLIC_KEY:ec.getPublicKey().toString('base64url'),VAPID_PRIVATE_KEY:ec.getPrivateKey().toString('base64url'),VAPID_SUBJECT:'mailto:test@example.invalid',SUPABASE_URL:'http://127.0.0.1:55421',NODE_ENV:'production',PUSH_DELIVERY_ENABLED:'true',PUSH_TRANSPORT:'web-push'});
  assert.ok(transport.pushVapidPreflight());
  assert.equal(transport.pushTransportEnabled(),false);
  await assert.rejects(transport.sendOwnedPush({...subscription,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth},{title:'test',body:'test',url:'/'}),/DISABLED/);assert.equal(sent,0);
  process.env.VAPID_PRIVATE_KEY=randomBytes(32).toString('base64url');assert.throws(()=>transport.pushVapidPreflight(),/^Error: PUSH_CONFIG_INVALID$/);
  for(const address of ['127.0.0.1','10.0.0.1','172.16.1.2','192.168.0.1','169.254.169.254','100.64.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(transport.publicNetworkAddress(address),false,address);
 } finally {for(const name of names)if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];}
});

test('canonical worker executes push, fallback, matching focus and navigation without external navigation',async()=>{
 const listeners={};const shown=[];const opened=[];let windows=[];
 const worker={location:{origin:'https://movi.invalid'},addEventListener:(name,fn)=>{listeners[name]=fn;},registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>windows,openWindow:async url=>opened.push(url)}};
 const source=readFileSync('worker/index.ts','utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports','self','caches',compiled)(()=>urls,{},worker,{delete:async()=>true});
 let task;const waitUntil=value=>{task=value;};
 listeners.push({data:{json:()=>({url:'https://evil.invalid',title:'test'})},waitUntil});await task;assert.equal(shown[0].options.data.url,'/');
 let focused=0,navigated=0;
 windows=[{url:'https://movi.invalid/richieste',focus:async()=>{focused++;}}];
 const click=url=>listeners.notificationclick({notification:{data:{url},close(){}},waitUntil});
 click('/richieste');await task;assert.equal(focused,1);assert.equal(opened.length,0);
 windows=[{url:'https://movi.invalid/',navigate:async url=>{assert.equal(url,'https://movi.invalid/moviback');navigated++;return {focus:async()=>{focused++;}};}}];
 click('/moviback');await task;assert.equal(navigated,1);assert.equal(opened.length,0);
 windows=[];click('//evil.invalid');await task;assert.deepEqual(opened,['https://movi.invalid/']);
});

test('customer and staff enrollment UI reconciles permission, missing persistence, conflict and renewal using browser mocks',async()=>{
 const names=['window','navigator','Notification','PushManager','matchMedia','fetch'];
 const previous=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const keyBefore=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY=ec.getPublicKey().toString('base64url');
  for(const audience of ['customer','staff']) {
   let permission='granted',current=null,serverState='inactive',prompted=0,unsubscribed=0;const requests=[];
   const makeSubscription=()=>({endpoint:'https://fcm.googleapis.com/test/new',options:{applicationServerKey:ec.getPublicKey().buffer},toJSON(){return subscription;},unsubscribe:async()=>{unsubscribed++;current=null;return true;}});
   const registration={active:{scriptURL:'https://movi.invalid/sw.js'},pushManager:{getSubscription:async()=>current,subscribe:async()=>{current=makeSubscription();return current;}}};
   const globals={window:globalThis,navigator:{userAgent:'Test desktop',platform:'Test',maxTouchPoints:0,serviceWorker:{getRegistration:async()=>registration}},Notification:{get permission(){return permission;},requestPermission:async()=>{prompted++;return permission;}},PushManager:function(){},matchMedia:()=>({matches:false}),fetch:async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,...body});return {status:serverState==='ownership_conflict'?409:200,ok:serverState!=='ownership_conflict',json:async()=>({state:body.action==='subscribe'?'active':serverState,error:'ownership conflict'})};}};
   for(const [name,value] of Object.entries(globals))Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
   const values=[];let cursor=0,effects=[];
   const react={useState(initial){const index=cursor++;if(!(index in values))values[index]=initial;return [values[index],value=>{values[index]=typeof value==='function'?value(values[index]):value;}];},useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
   const Card=load('src/components/PushEnrollmentCard.tsx',{'react':react,'@/lib/pushClient':{canonicalPushRegistration:async()=>registration,publicKeyBytes:()=>new Uint8Array(65),subscriptionKeyMatches:()=>true}}).default;
   const render=()=>{cursor=0;effects=[];return Card({audience});};
   const findButtons=node=>{if(!node||typeof node!=='object')return [];const children=node.props?.children;return [...(node.type==='button'?[node]:[]),...(Array.isArray(children)?children:[children]).flatMap(findButtons)];};
   render();effects[0]();await flush();assert.equal(values[0],'repair');assert.equal(prompted,0);
   let button=findButtons(render())[0];assert.equal(button.props.children,'Attiva notifiche push');button.props.onClick();await flush();await flush();assert.equal(values[0],'active');assert.equal(prompted,1);assert.equal(requests.at(-1).url,audience==='staff'?'/api/staff/push':'/api/user/push');
   findButtons(render())[0].props.onClick();await flush();assert.equal(values[0],'available');assert.equal(unsubscribed,1);
   permission='denied';findButtons(render()).at(-1).props.onClick();await flush();assert.equal(values[0],'denied');
   permission='granted';current=makeSubscription();serverState='ownership_conflict';findButtons(render()).at(-1).props.onClick();await flush();assert.equal(values[0],'conflict');
   serverState='inactive';findButtons(render())[0].props.onClick();await flush();await flush();assert.equal(values[0],'active');assert.equal(unsubscribed,2);
   assert.equal(requests.filter(item=>item.action==='revoke').length,1,'conflict re-enrollment must not revoke another owner through the API');
   current=makeSubscription();serverState='inactive';const reusable=current;
   findButtons(render()).at(-1).props.onClick();await flush();assert.equal(values[0],'repair');
   findButtons(render())[0].props.onClick();await flush();await flush();
   assert.equal(values[0],'active');assert.equal(current,reusable);assert.equal(unsubscribed,2,'compatible unowned browser capability is persisted without recreation');
  }
 } finally {for(const name of names){if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name];}if(keyBefore===undefined)delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY=keyBefore;}
});
