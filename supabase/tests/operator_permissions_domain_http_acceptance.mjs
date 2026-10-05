import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

if (process.env.PADELLERIA_LOCAL_VERIFIED !== "1" || process.env.SUPABASE_URL !== "http://127.0.0.1:55421") throw new Error("Safe local runner required");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const base = process.env.OPERATOR_EDITOR_TEST_BASE_URL ?? "http://localhost:3100";
const permissions = ["scanner.manage","tournaments.manage","circuits.manage","players.manage","requests.manage","padelleria.manage","communications.manage","moviback.manage","partners.manage","store.manage","monday_league.manage"];
const domainCases = [
  { permission:"scanner.manage", page:"/staff/operations", read:["/api/staff/lookup-membership","POST",{membership_code:""}], mutation:["/api/staff/earn-points","POST",{}] },
  { permission:"tournaments.manage", page:"/admin/tournaments", read:["/api/admin/tournaments","GET"], mutation:["/api/admin/tournaments","POST",{}] },
  { permission:"circuits.manage", page:"/admin/circuits", read:["/api/admin/circuits","GET"], mutation:["/api/admin/circuits","POST",{}] },
  { permission:"players.manage", page:"/admin/players", read:["/api/admin/players","GET"], mutation:["/api/admin/players/match","POST",{}] },
  { permission:"requests.manage", page:"/admin/requests", read:["/api/admin/requests","GET"], mutation:["/api/admin/requests/16200000-0000-4000-8000-000000000099","PATCH",{}] },
  { permission:"padelleria.manage", page:"/admin/padelleria", read:["/api/admin/padelleria","GET"], mutation:["/api/admin/padelleria","POST",{}] },
  { permission:"communications.manage", page:"/admin/comunicazioni", read:["/api/admin/comunicazioni","GET"], mutation:["/api/admin/comunicazioni","POST",{}] },
  { permission:"moviback.manage", page:"/admin/moviback", read:["/api/admin/moviback/dashboard","GET"], mutation:["/api/admin/moviback/promos","POST",{}] },
  { permission:"partners.manage", page:"/admin/partners", read:["/api/admin/partners","GET"], mutation:["/api/admin/partners","POST",{}] },
  { permission:"store.manage", page:"/admin/store/products", read:["/api/admin/store/products","GET"], mutation:["/api/admin/store/products","POST",{}] },
  { permission:"monday_league.manage", page:"/admin/monday-league", read:["/api/admin/monday-league/overview","GET"], mutation:["/api/admin/monday-league/seasons","POST",{}] },
];
const id = (n) => `16200000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const ids = { admin:id(1), noPermission:id(2), inactive:id(3), multi:id(4), staleAdmin:id(5), staleStaff:id(6) };
const singles = new Map(domainCases.map((item,index)=>[item.permission,id(100+index)]));
const rows = [
  {id:ids.admin,full_name:"Phase2 Admin",email:"phase2-admin-http@example.invalid",password_hash:"local-only",role:"admin",is_active:true},
  {id:ids.noPermission,full_name:"No Permission",email:"phase2-none@example.invalid",password_hash:"local-only",role:"staff",is_active:true},
  {id:ids.inactive,full_name:"Inactive Staff",email:"phase2-inactive@example.invalid",password_hash:"local-only",role:"staff",is_active:false},
  {id:ids.multi,full_name:"All Permissions",email:"phase2-all@example.invalid",password_hash:"local-only",role:"staff",is_active:true},
  {id:ids.staleAdmin,full_name:"Demoted Session",email:"phase2-demoted@example.invalid",password_hash:"local-only",role:"staff",is_active:true},
  {id:ids.staleStaff,full_name:"Promoted Session",email:"phase2-promoted@example.invalid",password_hash:"local-only",role:"admin",is_active:true},
  ...[...singles].map(([permission,staffId])=>({id:staffId,full_name:`Staff ${permission}`,email:`phase2-${permission.replace(".","-")}@example.invalid`,password_hash:"local-only",role:"staff",is_active:true})),
];
const token = async (sid,role) => new SignJWT({sid,role,name:"JWT hint",email:"hint@example.invalid"}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(process.env.STAFF_COOKIE_SECRET));
const request = async (path,jwt,{method="GET",body,redirect="manual"}={}) => fetch(base+path,{method,redirect,signal:AbortSignal.timeout(30000),headers:{...(jwt?{Cookie:`staff_session=${jwt}`}:{ }),...(body!==undefined?{"Content-Type":"application/json",Origin:base}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const endpoint = (spec,jwt) => request(spec[0],jwt,{method:spec[1],body:spec[2]});
const assertAuthorized = (response,label) => assert.ok(![401,403,307,308].includes(response.status),`${label}: unexpected ${response.status}`);
let checks=0;
const allIds=[...Object.values(ids),...singles.values()];

try {
  assert.ifError((await db.from("staff_users").upsert(rows)).error);
  const grants=[...permissions.map(permission=>({staff_user_id:ids.multi,permission_key:permission,granted_by_staff_id:ids.admin})),...permissions.map(permission=>({staff_user_id:singles.get(permission),permission_key:permission,granted_by_staff_id:ids.admin})),{staff_user_id:ids.staleAdmin,permission_key:"tournaments.manage",granted_by_staff_id:ids.admin}];
  assert.ifError((await db.from("staff_permissions").upsert(grants)).error);
  const jwts={admin:await token(ids.admin,"admin"),none:await token(ids.noPermission,"staff"),inactive:await token(ids.inactive,"staff"),all:await token(ids.multi,"staff")};

  for(const item of domainCases){
    console.log(`Checking ${item.permission}...`);
    const allowed=await token(singles.get(item.permission),"staff");
    for(const [label,jwt,shouldAllow] of [["admin",jwts.admin,true],["granted",allowed,true],["without",jwts.none,false],["inactive",jwts.inactive,false],["anonymous",null,false]]){
      const page=await request(item.page,jwt);
      if(shouldAllow) assert.equal(page.status,200,`${item.permission} ${label} page`); else assert.ok([307,308].includes(page.status),`${item.permission} ${label} page ${page.status}`);
      checks++;
      const read=await endpoint(item.read,jwt);
      if(shouldAllow) assertAuthorized(read,`${item.permission} ${label} read`); else assert.ok([401,403].includes(read.status),`${item.permission} ${label} read ${read.status}`);
      checks++;
      const mutation=await endpoint(item.mutation,jwt);
      if(shouldAllow) assertAuthorized(mutation,`${item.permission} ${label} mutation`); else assert.ok([401,403].includes(mutation.status),`${item.permission} ${label} mutation ${mutation.status}`);
      checks++;
    }
  }

  for(const path of ["/api/admin/users","/api/admin/users/access-problems","/api/admin/player-identities","/api/admin/store-economics","/api/admin/upload","/api/admin/push/subscribe","/api/admin/moviback/certificate-url"]){
    const needsPost=path.endsWith("upload")||path.endsWith("subscribe")||path.endsWith("certificate-url");
    const response=await request(path,jwts.all,{method:needsPost?"POST":"GET",body:needsPost?{}:undefined});
    assert.equal(response.status,403,`all-permissions Staff reached ${path}`);checks++;
  }
  assert.ok([401,403].includes((await request("/api/cron/padelleria-content-cleanup",jwts.all,{method:"POST",body:{}})).status),"all-permissions Staff reached cron cleanup");checks++;
  for(const [path,method] of [["/api/admin/circuits/16200000-0000-4000-8000-000000000099/merge-player-keys","POST"],["/api/admin/moviback/users/16200000-0000-4000-8000-000000000099/adjust-points","POST"],["/api/admin/moviback/certificates/16200000-0000-4000-8000-000000000099/review","POST"],["/api/admin/store-orders/toggle-paid","POST"]]){
    assert.equal((await request(path,jwts.all,{method,body:{}})).status,403,`all-permissions Staff reached ${path}`);checks++;
  }

  const liveId=ids.noPermission,liveJwt=jwts.none;
  for(const item of domainCases.filter(item=>["tournaments.manage","padelleria.manage"].includes(item.permission))){
    assert.ok([307,308].includes((await request(item.page,liveJwt)).status));checks++;
    assert.equal((await endpoint(item.read,liveJwt)).status,403);checks++;
    assert.ifError((await db.from("staff_permissions").insert({staff_user_id:liveId,permission_key:item.permission,granted_by_staff_id:ids.admin})).error);
    assert.equal((await request(item.page,liveJwt)).status,200);checks++;
    assertAuthorized(await endpoint(item.read,liveJwt),`${item.permission} immediate grant`);checks++;
    assert.ifError((await db.from("staff_permissions").delete().eq("staff_user_id",liveId).eq("permission_key",item.permission)).error);
    assert.ok([307,308].includes((await request(item.page,liveJwt)).status));checks++;
    assert.equal((await endpoint(item.read,liveJwt)).status,403);checks++;
  }

  const demotedJwt=await token(ids.staleAdmin,"admin");
  assert.equal((await request("/admin/tournaments",demotedJwt)).status,200);checks++;
  assert.ok([307,308].includes((await request("/admin/padelleria",demotedJwt)).status));checks++;
  assert.ok([307,308].includes((await request("/admin/users",demotedJwt)).status));checks++;
  const promotedJwt=await token(ids.staleStaff,"staff");
  assert.equal((await request("/admin/tournaments",promotedJwt)).status,200);checks++;
  assert.equal((await request("/admin/users",promotedJwt)).status,200);checks++;

  console.log(`Operator domain HTTP PASS: ${checks} page/API/mutation and stale-session checks.`);
} finally {
  await db.from("staff_permissions").delete().in("staff_user_id",allIds);
  await db.from("staff_users").delete().in("id",allIds);
}
