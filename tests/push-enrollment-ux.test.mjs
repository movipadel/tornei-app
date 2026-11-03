import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const read=path=>readFileSync(path,'utf8');
function load(path,mocks){const code=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const m={exports:{}};new Function('require','module','exports',code)(name=>name.endsWith('.css')?{}:mocks[name]??require(name),m,m.exports);return m.exports.default;}
const nodes=(tree,predicate)=>!tree||typeof tree!=='object'?[]:[...(predicate(tree)?[tree]:[]),...[tree.props?.children].flat().flatMap(child=>nodes(child,predicate))];
const text=tree=>typeof tree==='string'?tree:typeof tree!=='object'||!tree?'':[tree.props?.children].flat().map(text).join(' ');
function hooks(values){let cursor=0;return {reset(){cursor=0;},useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>{values[i]=v;}];},useEffect(){},useCallback:fn=>fn};}
test('profile has a single notification card with embedded device controls; operator controls follow operational content',()=>{
 const profile=read('src/app/profilo/page.tsx');assert.equal((profile.match(/<NotificationPreferencesCard/g)||[]).length,1);assert.doesNotMatch(profile,/PushEnrollmentCard/);
 const prefs=read('src/components/NotificationPreferencesCard.tsx');assert.match(prefs,/<PushEnrollmentCard audience="customer" variant="profile"/);assert.ok(prefs.indexOf('<PushEnrollmentCard')>prefs.indexOf('<strong>Push</strong>'));
 const admin=read('src/app/admin/page.tsx');assert.ok(admin.indexOf('<PushEnrollmentCard')>admin.indexOf('</section>)}</div>'));assert.match(admin,/variant="compact"/);
 const staff=read('src/app/staff/StaffDashboard.tsx');assert.ok(staff.indexOf('<PushEnrollmentCard')>staff.indexOf('Nessuna area operativa'));assert.match(staff,/variant="compact"/);
});
test('device states remain actionable, text-accessible and quiet when healthy',()=>{
 for(const variant of ['profile','compact'])for(const state of ['checking','unsupported','available','denied','active','repair','conflict']){
  const react=hooks([state,false,'',false]);const Card=load('src/components/PushEnrollmentCard.tsx',{react,'@/lib/pushClient':{}});
  const tree=Card({audience:variant==='profile'?'customer':'staff',variant,preferenceEnabled:true});
  const buttons=nodes(tree,n=>n.type==='button').map(text);assert.ok(buttons.includes(variant==='profile'?'Verifica stato':'Verifica'));
  if(['available','repair'].includes(state))assert.ok(buttons.includes(variant==='profile'?'Attiva notifiche push':'Attiva'));
  if(state==='active'){assert.ok(buttons.some(s=>s.startsWith('Disattiva')));assert.doesNotMatch(text(tree),/Telegram|precedenti iscrizioni/);}
  if(state==='denied')assert.match(text(tree),/bloccate nelle impostazioni del browser/);
  assert.ok(nodes(tree,n=>n.props?.['aria-live']==='polite').length);
  assert.equal(nodes(tree,n=>n.type==='h2').length,variant==='profile'?0:1);
 }
});
test('preference changes still persist email and push together; enrollment is separate from saving',async()=>{
 const saved={transactional_email_enabled:true,transactional_push_enabled:false,version:4};const values=[saved,true,true,false,false,'',''];const react=hooks(values);let request;
 const oldFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({data:{...saved,transactional_push_enabled:true,version:5}})};};
 try{
  const child=()=>null;const Card=load('src/components/NotificationPreferencesCard.tsx',{react,'./PushEnrollmentCard':child});const tree=Card();
  const embedded=nodes(tree,n=>n.type===child)[0];assert.equal(embedded.props.preferenceEnabled,false);assert.equal(embedded.props.preferencePending,true);
  await nodes(tree,n=>n.type==='button')[0].props.onClick();
  assert.equal(request.url,'/api/user/notification-preferences');assert.equal(request.method,'PATCH');assert.deepEqual(JSON.parse(request.body),{transactional_email_enabled:true,transactional_push_enabled:true,expected_version:4});assert.equal(values[0].version,5);
 }finally{globalThis.fetch=oldFetch;}
});
test('UX refinement preserves enrollment handlers byte-for-byte and does not change push services',()=>{
 const path='src/components/PushEnrollmentCard.tsx';const baseline=execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'}).replace(/\r\n/g,'\n');const current=read(path).replace(/\r\n/g,'\n');
 const logic=s=>s.slice(s.indexOf('  const [state'),s.indexOf('  const labels:'));assert.equal(logic(current),logic(baseline));
 for(const file of ['src/lib/pushApi.ts','src/lib/pushClient.ts','src/lib/pushDelivery.ts','src/lib/pushTransport.ts','worker/index.ts'])assert.equal(read(file).replace(/\r\n/g,'\n'),execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}).replace(/\r\n/g,'\n'));
});
