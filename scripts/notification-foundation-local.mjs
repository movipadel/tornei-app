import { execFileSync,spawnSync } from 'node:child_process';
import { readdirSync,readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const mode=process.argv[2];
if(!['tests','sql','fresh','fresh-compatibility','build','advisors'].includes(mode))throw Error('Unknown mode');
const bin='C:/Program Files/PostgreSQL/17/bin/';
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|PROGRAMFILES|PROGRAMDATA|HOMEDRIVE|HOMEPATH|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(k)));
Object.assign(env,{PGPASSWORD:'postgres',PGCONNECT_TIMEOUT:'3',PUSH_DELIVERY_ENABLED:'false',PUSH_TRANSPORT:'disabled',USER_EMAIL_TRANSPORT:'local',RESEND_API_KEY:'re_local_disabled',MOVI_REQUEST_TELEGRAM_MODE:'disabled'});
const args=['-h','127.0.0.1','-p','55422','-U','postgres','-X','-v','ON_ERROR_STOP=1'];
function sql(query,db='postgres'){return execFileSync(bin+'psql.exe',[...args,'-d',db,'-At','-c',query],{env,encoding:'utf8',windowsHide:true});}
sql('select 1');
console.log('LOCAL_DB_VERIFIED: explicit TCP 127.0.0.1:55422; no env files loaded; external transports disabled.');
mkdirSync('.artifacts/notification-foundation',{recursive:true});
function run(command,argv,log){const r=spawnSync(command,argv,{env,encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});writeFileSync('.artifacts/notification-foundation/'+log,(r.stdout??'')+(r.stderr??''));if(r.error)throw r.error;console.log(log+': '+r.status);return r.status;}
if(mode==='tests') {
 const files=['tests','supabase/tests'].flatMap(dir=>readdirSync(dir).filter(n=>n.endsWith('.test.mjs')).map(n=>dir+'/'+n));
 process.exit(run(process.execPath,['--test','--test-concurrency=1',...files],'full-tests.log')??1);
}
if(mode==='sql')process.exit(run(bin+'psql.exe',[...args,'-d','postgres','-f','supabase/tests/notification_foundation_v1.sql'],'sql-tests.log')??1);
if(mode==='build'){
 const before=readFileSync('next-env.d.ts');let code;
 try{code=run(process.execPath,['scripts/padelleria-local.mjs','build'],'build.log');}
 finally{writeFileSync('next-env.d.ts',before);}
 process.exit(code??1);
}
if(mode==='advisors')process.exit(run(process.execPath,['node_modules/supabase/dist/supabase.js','db','lint','--local','--schema','public','--level','error'],'db-lint.log')??1);
if(mode==='fresh'||mode==='fresh-compatibility'){
 const db=mode==='fresh-compatibility'?'notification_cutover_clean':'notification_foundation_clean';
 if(sql(`select 1 from pg_database where datname='${db}'`).trim())throw Error('Clean test database already exists; inspect rather than overwrite');
 // Reuse only Supabase-managed schema definitions, never row data or public application objects.
 const dump=execFileSync(bin+'pg_dump.exe',['-h','127.0.0.1','-p','55422','-U','postgres','-d','postgres','--schema-only'],{env,encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});
 const path=resolve('.artifacts/notification-foundation/local-schema.sql');writeFileSync(path,dump);
 sql(`create database ${db}`);
 // Supabase-managed functions have restricted GUCs; bootstrap needs the local platform owner.
 if(run(bin+'psql.exe',[...args,'-U','supabase_admin','-d',db,'-f',path],'fresh-bootstrap.log'))throw Error('Schema bootstrap failed');
 sql('drop schema public cascade; create schema public; grant usage on schema public to public;',db);
 const migrations=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort();
 for(const file of migrations){
  if(mode==='fresh-compatibility'&&file==='20261103201543_notification_foundation_v1.sql'){
   sql("insert into public.admin_push_subscriptions(endpoint,p256dh,auth,is_active) values('https://fcm.googleapis.com/compatibility-local-only',repeat('a',87),repeat('b',22),true)",db);
   if(run(bin+'psql.exe',[...args,'-d',db,'-f','docs/rebranding/PRODUCTION_NOTIFICATION_FOUNDATION_V1_PRECHECK.sql'],'compatibility-precheck-local.log'))throw Error('SELECT-only precheck syntax failed');
  }
  if(run(bin+'psql.exe',[...args,'-d',db,'-f','supabase/migrations/'+file],'fresh-'+file+'.log'))throw Error('Fresh chain failed: '+file);
 }
 if(mode==='fresh-compatibility'){
  if(sql("select count(*) from public.admin_push_subscriptions where endpoint='https://fcm.googleapis.com/compatibility-local-only' and not is_active and staff_id is null",db).trim()!=='1')throw Error('Legacy subscription not deactivated, deleted or attributed');
  if(sql('select count(*) from public.admin_push_subscriptions where is_active',db).trim()!=='0')throw Error('Active legacy recipients remain');
  if(sql('select count(*) from public.push_subscriptions',db).trim()!=='0')throw Error('Legacy subscriptions copied');
 }
 if(run(bin+'psql.exe',[...args,'-d',db,'-f','supabase/tests/notification_foundation_v1.sql'],'fresh-tests.log'))throw Error('Fresh fixture failed');
 console.log('Fresh full migration chain PASS: '+migrations.length+' migrations. Isolated local database retained for inspection.');
}
