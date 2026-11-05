import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,mocks={}){const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;const m={exports:{}};new Function('require','module','exports',code)(n=>n==='server-only'?{}:mocks[n]??require(n),m,m.exports);return m.exports;}
const catalog=load('src/lib/staffPushCatalog.ts');
test('catalog contains exactly nine known templates and existing same-origin surfaces',()=>{assert.equal(Object.keys(catalog.STAFF_PUSH_EVENTS).length,9);for(const event of Object.values(catalog.STAFF_PUSH_EVENTS)){assert.match(event.url,/^\/admin\//);assert.ok(event.title);assert.ok(event.label);}assert.equal(catalog.isStaffPushEventKey('__proto__'),false);});
test('resolver deduplicates and enqueue never uses a transport or email RPC',async()=>{const calls=[];const api=load('src/lib/staffPush.ts',{'@/lib/staffPushCatalog':catalog,'@/lib/supabaseAdmin':{supabaseAdmin:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='resolve_staff_push_recipients'?[{staff_user_id:'a'},{staff_user_id:'a'}]:1};}})}});assert.deepEqual(await api.resolveStaffPushRecipients('requests.gioca.received'),['a']);for(const key of Object.keys(catalog.STAFF_PUSH_EVENTS)){await api.enqueueStaffPushEvent(key,'aggregate');const c=calls.at(-1);assert.equal(c.name,'enqueue_staff_push_event');assert.equal(c.args.p_display.title,catalog.STAFF_PUSH_EVENTS[key].title);assert.equal(c.args.p_display.url,catalog.STAFF_PUSH_EVENTS[key].url);}await assert.rejects(()=>api.enqueueStaffPushEvent('unknown','id'));});
test('routing API rejects staff, wrong origin and unknown events; admin saves deterministic rules',async()=>{let actor={role:'staff',sid:'actor'},calls=0;const route=load('src/app/api/admin/staff-notifications/route.ts',{'@/lib/operatorAuthorization':{getCurrentOperator:async()=>actor},'@/lib/staffPushCatalog':catalog,'@/lib/supabaseAdmin':{supabaseAdmin:()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'admin_set_staff_push_rules');assert.equal(args.p_actor,'actor');assert.deepEqual(args.p_event_keys,['requests.gioca.received']);return {};}})}});const req=(origin,keys)=>new Request('https://movi.invalid/api/admin/staff-notifications',{method:'PUT',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({staff_user_id:'00000000-0000-4000-8000-000000000001',event_keys:keys})});assert.equal((await route.GET()).status,403);assert.equal((await route.PUT(req('https://movi.invalid',[]))).status,403);actor={role:'admin',sid:'actor'};assert.equal((await route.PUT(req('https://evil.invalid',[]))).status,403);assert.equal((await route.PUT(req('https://movi.invalid',['unknown']))).status,400);assert.equal((await route.PUT(req('https://movi.invalid',['requests.gioca.received','requests.gioca.received']))).status,200);assert.equal(calls,1);});
test('routing UI renders readable groups, readiness and inactive cleanup without device credentials',()=>{const operators=[{id:'a',full_name:'Fixture',is_active:true,push_ready:true,event_keys:[]},{id:'d',full_name:'Inactive',is_active:false,push_ready:false,event_keys:[]}];let i=0;const values=[operators,false,null,''];const Editor=load('src/app/admin/users/notifiche/RoutingEditor.tsx',{'react':{useState:()=>[values[i++],()=>{}],useEffect:()=>{}},'../OperatorsNavigation':{__esModule:true,default:()=>null},'@/lib/staffPushCatalog':catalog}).default;const tree=Editor();const text=n=>Array.isArray(n)?n.map(text).join(' '):typeof n==='string'?n:n&&typeof n==='object'?[n.props?.children].flat().map(text).join(' '):'';const copy=text(tree);assert.match(copy,/Push attive/);assert.match(copy,/avvisi sospesi/);assert.match(copy,/Disattiva tutte le regole/);assert.match(copy,/Promozione da riserva/);assert.doesNotMatch(copy,/endpoint|p256dh|auth/);});

function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);return tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];}
const Navigation=load('src/app/admin/users/OperatorsNavigation.tsx',{'next/link':{__esModule:true,default:'a'},'./users.module.css':{__esModule:true,default:{navigation:'navigation',primary:'primary',secondary:'secondary'}}}).default;
test('Operators exposes styled navigation and the routing destination identifies its current page',()=>{
 for(const current of ['operators','notifications']){
  const nav=Navigation({current});assert.equal(nav.type,'nav');assert.equal(nav.props['aria-label'],'Configurazione operatori');
  const links=nodes(nav).filter(n=>n.props?.href);assert.deepEqual(links.map(n=>n.props.href),['/admin/users','/admin/users/notifiche']);
  assert.equal(links[current==='operators'?0:1].props['aria-current'],'page');assert.ok(links.every(n=>n.props.className));
 }
 const Page=load('src/app/admin/users/page.tsx',{'react':{useState:v=>[v,()=>{}],useEffect:()=>{},useCallback:f=>f},'next/link':{__esModule:true,default:'a'},'./OperatorsNavigation':{__esModule:true,default:Navigation},'./users.module.css':{__esModule:true,default:{}},'@/lib/operatorPermissions':{OPERATOR_PERMISSIONS:[]}}).default;
 const tree=nodes(Page());assert.equal(tree.filter(n=>n.type===Navigation&&n.props.current==='operators').length,1);
 assert.equal(tree.filter(n=>n.type==='form'&&typeof n.props.onSubmit==='function').length,1);
 assert.equal(tree.filter(n=>n.type==='input'&&n.props.name==='create-role').length,2);
});
test('routing page admits Admin and redirects Staff or unauthenticated requests before rendering',async()=>{
 let actor={role:'admin'};const Editor=()=>null;
 const Page=load('src/app/admin/users/notifiche/page.tsx',{'next/navigation':{redirect:path=>{throw Error('redirect:'+path);}},'@/lib/operatorAuthorization':{getCurrentOperator:async()=>actor},'./RoutingEditor':{__esModule:true,default:Editor}}).default;
 assert.equal((await Page()).type,Editor);
 for(actor of [{role:'staff'},null])await assert.rejects(Page,/redirect:\/staff/);
});
test('each active recipient has nine initially visible selectable events with independent choices',()=>{
 let state=[[{id:'a',full_name:'Admin fixture',is_active:true,push_ready:true,event_keys:[]},{id:'s',full_name:'Staff fixture',is_active:true,push_ready:false,event_keys:[]}],false,null,''];let i=0;
 const Editor=load('src/app/admin/users/notifiche/RoutingEditor.tsx',{'react':{useState:()=>{const index=i++;return [state[index],v=>{state[index]=typeof v==='function'?v(state[index]):v;}];},useEffect:()=>{}},'../OperatorsNavigation':{__esModule:true,default:Navigation},'@/lib/staffPushCatalog':catalog}).default;
 const render=()=>{i=0;return nodes(Editor());};let tree=render();
 assert.equal(tree.filter(n=>n.type===Navigation&&n.props.current==='notifications').length,1);
 assert.equal(tree.filter(n=>n.type==='section').length,2);
 assert.equal(tree.filter(n=>n.type==='details'&&n.props.open===true).length,10);
 let inputs=tree.filter(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(inputs.length,18);
 inputs[0].props.onChange({target:{checked:true}});inputs[9].props.onChange({target:{checked:true}});
 inputs=render().filter(n=>n.type==='input');assert.equal(inputs[0].props.checked,true);assert.equal(inputs[9].props.checked,true);assert.equal(inputs.filter(n=>n.props.checked).length,2);
 assert.match(JSON.stringify(render()),/Push non attivate/);assert.match(JSON.stringify(render()),/Push attive/);
});
