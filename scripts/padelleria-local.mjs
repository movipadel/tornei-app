import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const mode=process.argv[2];
if(!['requests-migrate','requests-sql-test','requests-fixtures','requests-api-test','partners-migrate','partners-sql-test','partners-fixtures','partners-api-test','check','migrate','sql-test','fixtures','api-test','dev','build','start'].includes(mode))throw new Error('Mode: requests-migrate|requests-sql-test|requests-fixtures|requests-api-test|check|migrate|sql-test|fixtures|api-test|partners-migrate|partners-sql-test|partners-fixtures|partners-api-test|dev|build|start');
if(existsSync('supabase/.temp/project-ref'))throw new Error('STOP: linked project');
const status=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','-o','json'],{encoding:'utf8'}));
if(status.API_URL!=='http://127.0.0.1:55021'||status.DB_URL!=='postgresql://postgres:postgres@127.0.0.1:55022/postgres'||status.STUDIO_URL!=='http://127.0.0.1:55023'||status.MAILPIT_URL!=='http://127.0.0.1:55024'||status.linked_project)throw new Error('STOP: unexpected Supabase targets');
if(!status.ANON_KEY||!status.SERVICE_ROLE_KEY)throw new Error('Local keys unavailable');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|PROGRAMFILES|PROGRAMDATA|HOMEDRIVE|HOMEPATH|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(k)));
Object.assign(env,{
  SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL:'http://localhost:3100',STAFF_COOKIE_SECRET:'padelleria-local-only-session-secret-2026',ADMIN_COOKIE_SECRET:'padelleria-local-only-session-secret-2026',USER_COOKIE_SECRET:'padelleria-local-only-user-secret-2026',
  RESEND_API_KEY:'re_local_disabled',NEXT_TELEMETRY_DISABLED:'1',__NEXT_PROCESSED_ENV:'true',PGPASSWORD:'postgres',
  NODE_ENV:mode==='dev'?'development':'production',PADELLERIA_LOCAL_VERIFIED:'1',MOVI_REQUEST_TELEGRAM_MODE:'disabled',
});
console.log('Verified LOCAL ONLY: API 55021 / DB 55022 / Studio 55023 / Mailpit 55024; unlinked; repository .env files bypassed.');
const psql='C:/Program Files/PostgreSQL/17/bin/psql.exe';
const dbArgs=['-h','127.0.0.1','-p','55022','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
if(mode==='check')process.exit(0);
if(mode==='requests-migrate'){
 const found=execFileSync(psql,[...dbArgs,'-At','-c',"select to_regclass('public.movi_requests') is not null"],{env,encoding:'utf8'}).trim();if(found==='t')throw new Error('Requests schema already exists');
 execFileSync(psql,[...dbArgs,'-f','supabase/migrations/20261007100000_movi_requests.sql'],{env,stdio:'inherit'});process.exit(0);
}
if(mode==='requests-sql-test'){execFileSync(psql,[...dbArgs,'-f','supabase/tests/movi_requests.sql'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='requests-fixtures'||mode==='requests-api-test'){execFileSync(process.execPath,[mode==='requests-fixtures'?'supabase/tests/fixtures/requests.local.mjs':'supabase/tests/requests_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='migrate'||mode==='partners-migrate'){
  const partners=mode==='partners-migrate';
  const found=execFileSync(psql,[...dbArgs,'-At','-c',`select to_regclass('public.${partners?"movi_partners":"padelleria_contents"}') is not null`],{env,encoding:'utf8'}).trim();
  if(found==='t')throw new Error('Editorial schema already exists; do not replay migration');
  execFileSync(psql,[...dbArgs,'-f',partners?'supabase/migrations/20261006100000_movi_partners.sql':'supabase/migrations/20261005100000_padelleria_contents.sql'],{env,stdio:'inherit'});
  console.log('Applied only editorial migration locally; no unrelated migrations replayed.');process.exit(0);
}
if(mode==='sql-test'||mode==='partners-sql-test'){execFileSync(psql,[...dbArgs,'-f',mode==='partners-sql-test'?'supabase/tests/partners.sql':'supabase/tests/padelleria_contents.sql'],{env,stdio:'inherit'});process.exit(0);}
if(['fixtures','api-test','partners-fixtures','partners-api-test'].includes(mode)){
  const child=spawn(process.execPath,[mode==='partners-fixtures'?'supabase/tests/fixtures/partners.local.mjs':mode==='partners-api-test'?'supabase/tests/partners_http_acceptance.mjs':mode==='fixtures'?'supabase/tests/fixtures/padelleria.local.mjs':'supabase/tests/padelleria_http_acceptance.mjs'],{env,stdio:'inherit'});child.on('exit',code=>process.exit(code??1));
}else{
  // Build-generated PWA files are restored to their exact pre-build bytes, not to git HEAD.
  const generated=name=>/^(sw\.js|workbox-.*\.js(?:\.map)?|worker-.*\.js(?:\.map)?)$/.test(name);
  const before=new Map(mode==='build'?readdirSync('public').filter(generated).map(n=>[n,readFileSync(resolve('public',n))]):[]);
  const args=mode==='build'?['build','--webpack']:mode==='dev'?['dev','--webpack','--port','3100','--hostname','127.0.0.1']:['start','--port','3100','--hostname','127.0.0.1'];
  const child=spawn(process.execPath,['scripts/padelleria-next-local.cjs',...args],{env,stdio:'inherit'});
  child.on('exit',code=>{
    if(mode==='build'){
      for(const name of readdirSync('public').filter(generated))if(!before.has(name))unlinkSync(resolve('public',name));
      for(const [name,bytes]of before)writeFileSync(resolve('public',name),bytes);
      console.log('Generated PWA artifacts restored to pre-build bytes.');
    }
    process.exit(code??1);
  });
}
