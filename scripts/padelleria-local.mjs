import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const mode=process.argv[2];
if(!['operator-permissions-editor-migrate','operator-permissions-editor-sql-test','operator-permissions-editor-api-test','operator-permissions-dashboard-api-test','operator-permissions-domain-migrate','operator-permissions-domain-sql-test','operator-permissions-domain-api-test','operator-permissions-migrate','operator-permissions-sql-test','operator-permissions-api-test','padelleria-detail-api-test','padelleria-lifecycle-migrate','padelleria-lifecycle-sql-test','padelleria-lifecycle-api-test','circuit-phase2-fixtures','circuit-phase2-api-test','gioca-suggestions-fixtures','gioca-suggestions-api-test','profile-migrate','profile-fixtures','profile-sql-test','profile-api-test','identity-migrate','identity-fixtures','identity-sql-test','identity-api-test','identity-analyze','activities-migrate','activities-fixtures','activities-api-test','activities-sql-test','requests-migrate','requests-sql-test','requests-fixtures','requests-api-test','partners-migrate','partners-sql-test','partners-fixtures','partners-api-test','check','migrate','sql-test','fixtures','api-test','dev','dev-3101','dev-3102','build','start','start-3101','start-3102'].includes(mode))throw new Error('Unsupported local mode');
if(existsSync('supabase/.temp/project-ref'))throw new Error('STOP: linked project');
const status=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','-o','json'],{encoding:'utf8'}));
if(status.API_URL!=='http://127.0.0.1:55421'||status.DB_URL!=='postgresql://postgres:postgres@127.0.0.1:55422/postgres'||status.STUDIO_URL!=='http://127.0.0.1:55423'||status.MAILPIT_URL!=='http://127.0.0.1:55424'||status.linked_project)throw new Error('STOP: unexpected Supabase targets');
if(!status.ANON_KEY||!status.SERVICE_ROLE_KEY)throw new Error('Local keys unavailable');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|PROGRAMFILES|PROGRAMDATA|HOMEDRIVE|HOMEPATH|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(k)));
Object.assign(env,{
  SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL:mode.endsWith('-3102')?'http://127.0.0.1:3102':mode.endsWith('-3101')?'http://127.0.0.1:3101':'http://localhost:3100',STAFF_COOKIE_SECRET:'padelleria-local-only-session-secret-2026',ADMIN_COOKIE_SECRET:'padelleria-local-only-session-secret-2026',USER_COOKIE_SECRET:'padelleria-local-only-user-secret-2026',
  RESEND_API_KEY:'re_local_disabled',NEXT_TELEMETRY_DISABLED:'1',__NEXT_PROCESSED_ENV:'true',PGPASSWORD:'postgres',CRON_SECRET:'padelleria-local-only-cron-secret-2026',
  PADELLERIA_TEST_BASE_URL:['padelleria-lifecycle-api-test','padelleria-detail-api-test'].includes(mode)?'http://127.0.0.1:3101':'http://127.0.0.1:3100',
  NODE_ENV:mode.startsWith('dev')?'development':'production',PADELLERIA_LOCAL_VERIFIED:'1',MOVI_REQUEST_TELEGRAM_MODE:'disabled',LEGACY_RATE_LIMIT_TRUST_PROXY_HEADERS:'true',
  PLAYER_MATCHING_LOCAL_VERIFIED:'1',GIOCA_SUGGESTIONS_LOCAL_VERIFIED:'1',
  OPERATOR_EDITOR_TEST_BASE_URL:'http://localhost:3102',
});
console.log('Verified LOCAL ONLY: API 55421 / DB 55422 / Studio 55423 / Mailpit 55424; unlinked; repository .env files bypassed.');
const psql='C:/Program Files/PostgreSQL/17/bin/psql.exe';
const dbArgs=['-h','127.0.0.1','-p','55422','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
if(mode==='check')process.exit(0);
if(mode==='operator-permissions-editor-migrate'){
 const found=execFileSync(psql,[...dbArgs,'-At','-c',"select to_regprocedure('public.admin_update_operator(uuid,uuid,timestamp with time zone,text,text,text,boolean,text[],text)') is not null"],{env,encoding:'utf8'}).trim();
 if(found==='t')throw new Error('Operator editor schema already exists; do not replay migration');
 execFileSync(psql,[...dbArgs,'-f','supabase/migrations/20261017100000_operator_permissions_admin_editor.sql'],{env,stdio:'inherit'});process.exit(0);
}
if(mode==='operator-permissions-editor-sql-test'){execFileSync(psql,[...dbArgs,'-f','supabase/tests/operator_permissions_admin_editor.sql'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='operator-permissions-editor-api-test'){execFileSync(process.execPath,['supabase/tests/operator_permissions_admin_editor_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='operator-permissions-dashboard-api-test'){execFileSync(process.execPath,['supabase/tests/operator_permissions_dashboard_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='operator-permissions-domain-migrate'){
 const found=execFileSync(psql,[...dbArgs,'-At','-c',"select to_regprocedure('public.operator_has_permission(uuid,text)') is not null"],{env,encoding:'utf8'}).trim();
 if(found==='t')throw new Error('Operator domain permission schema already exists; do not replay migration');
 execFileSync(psql,[...dbArgs,'-f','supabase/migrations/20261016100000_operator_permissions_domain_enforcement.sql'],{env,stdio:'inherit'});process.exit(0);
}
if(mode==='operator-permissions-domain-sql-test'){execFileSync(psql,[...dbArgs,'-f','supabase/tests/operator_permissions_domain_enforcement.sql'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='operator-permissions-domain-api-test'){execFileSync(process.execPath,['supabase/tests/operator_permissions_domain_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='operator-permissions-migrate'){
 const found=execFileSync(psql,[...dbArgs,'-At','-c',"select to_regclass('public.staff_permissions') is not null"],{env,encoding:'utf8'}).trim();
 if(found==='t')throw new Error('Operator permission schema already exists; do not replay migration');
 execFileSync(psql,[...dbArgs,'-f','supabase/migrations/20261015100000_operator_permissions_foundation.sql'],{env,stdio:'inherit'});process.exit(0);
}
if(mode==='operator-permissions-sql-test'){execFileSync(psql,[...dbArgs,'-f','supabase/tests/operator_permissions_foundation.sql'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='operator-permissions-api-test'){execFileSync(process.execPath,['supabase/tests/operator_permissions_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='padelleria-lifecycle-migrate'){
 const found=execFileSync(psql,[...dbArgs,'-At','-c',"select count(*) from information_schema.columns where table_schema='public' and table_name='padelleria_contents' and column_name='delete_on_expiry'"],{env,encoding:'utf8'}).trim();
 if(found!=='0')throw new Error('Padelleria lifecycle schema already exists; do not replay migration');
 execFileSync(psql,[...dbArgs,'-f','supabase/migrations/20261013100000_padelleria_content_lifecycle.sql'],{env,stdio:'inherit'});process.exit(0);
}
if(mode==='padelleria-lifecycle-sql-test'){execFileSync(psql,[...dbArgs,'-f','supabase/tests/padelleria_content_lifecycle.sql'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='padelleria-lifecycle-api-test'){execFileSync(process.execPath,['supabase/tests/padelleria_content_lifecycle_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='padelleria-detail-api-test'){execFileSync(process.execPath,['supabase/tests/padelleria_detail_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='circuit-phase2-fixtures'||mode==='circuit-phase2-api-test'){
 execFileSync(process.execPath,[mode==='circuit-phase2-fixtures'?'supabase/tests/fixtures/circuit_detail_phase2.local.mjs':'supabase/tests/circuit_detail_phase2_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);
}
if(mode==='gioca-suggestions-fixtures'){
 for(const file of ['supabase/tests/fixtures/requests.local.mjs','supabase/tests/fixtures/player_matching.local.mjs','supabase/tests/fixtures/gioca_player_suggestions.local.mjs'])execFileSync(process.execPath,[file],{env,stdio:'inherit'});
 process.exit(0);
}
if(mode==='gioca-suggestions-api-test'){execFileSync(process.execPath,['supabase/tests/gioca_player_suggestions_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='profile-migrate'){
 const found=execFileSync(psql,[...dbArgs,'-At','-c',"select to_regclass('public.player_profiles') is not null"],{env,encoding:'utf8'}).trim();if(found==='t')throw new Error('Player profile schema already exists');
 execFileSync(psql,[...dbArgs,'-f','supabase/migrations/20261010100000_player_profiles.sql'],{env,stdio:'inherit'});process.exit(0);
}
if(mode==='profile-fixtures'||mode==='profile-sql-test'){execFileSync(psql,[...dbArgs,'-f',mode==='profile-fixtures'?'supabase/tests/fixtures/player_profile.local.sql':'supabase/tests/player_profile.sql'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='profile-api-test'){execFileSync(process.execPath,['supabase/tests/player_profile_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='identity-migrate'){
 const found=execFileSync(psql,[...dbArgs,'-At','-c',"select to_regclass('public.player_identities') is not null"],{env,encoding:'utf8'}).trim();if(found==='t')throw new Error('Player foundation already exists');
 for(const file of ['20261009100000_player_identity_foundation.sql','20261009110000_player_identity_admin_commands.sql','20261009120000_player_identity_key_merge_guard.sql','20261009130000_player_identity_account_resolution_bridge.sql'])execFileSync(psql,[...dbArgs,'-f','supabase/migrations/'+file],{env,stdio:'inherit'});process.exit(0);
}
if(mode==='identity-sql-test'||mode==='identity-fixtures'){execFileSync(psql,[...dbArgs,'-f',mode==='identity-sql-test'?'supabase/tests/player_identity.sql':'supabase/tests/fixtures/player_identity.local.sql'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='identity-api-test'){for(const file of ['supabase/tests/player_identity_http_acceptance.mjs','supabase/tests/player_identity_account_resolution_http.local.mjs'])execFileSync(process.execPath,[file],{env,stdio:'inherit'});process.exit(0);}
if(mode==='identity-analyze'){execFileSync(process.execPath,['scripts/player-identity-analyze.local.mjs'],{env,stdio:'inherit'});process.exit(0);}

if(mode==='activities-migrate'||mode==='activities-sql-test'){execFileSync(psql,[...dbArgs,'-f',mode==='activities-migrate'?'supabase/migrations/20261008100000_movi_activity_read_scope.sql':'supabase/tests/activities.sql'],{env,stdio:'inherit'});process.exit(0);}
if(mode==='activities-fixtures'||mode==='activities-api-test'){execFileSync(process.execPath,[mode==='activities-fixtures'?'supabase/tests/fixtures/activities.local.mjs':'supabase/tests/activities_http_acceptance.mjs'],{env,stdio:'inherit'});process.exit(0);}
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
  const args=mode==='build'?['build','--webpack']:mode.startsWith('dev')?['dev','--webpack','--port',mode==='dev-3102'?'3102':mode==='dev-3101'?'3101':'3100','--hostname','127.0.0.1']:['start','--port',mode==='start-3102'?'3102':mode==='start-3101'?'3101':'3100','--hostname','127.0.0.1'];
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
