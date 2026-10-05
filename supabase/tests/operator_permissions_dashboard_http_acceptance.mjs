import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

if (process.env.PADELLERIA_LOCAL_VERIFIED !== "1" || process.env.SUPABASE_URL !== "http://127.0.0.1:55421") throw new Error("Safe local runner required");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const base = process.env.OPERATOR_EDITOR_TEST_BASE_URL ?? "http://localhost:3100";
const permissions = ["scanner.manage","tournaments.manage","circuits.manage","players.manage","requests.manage","padelleria.manage","communications.manage","moviback.manage","partners.manage","store.manage","monday_league.manage"];
const labels = ["Scanner / QR","Tornei","Circuiti","Giocatori","Richieste Gioca / Allenati","Padelleria / Social","Comunicazioni","MoviBack","Partner","Store","Monday League"];
const id = (n) => `16300000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const ids = { admin:id(1), none:id(2), scanner:id(3), multi:id(4), all:id(5) };
const rows = [
  {id:ids.admin,full_name:"Phase3 Admin",email:"phase3-admin@example.invalid",password_hash:"local-only",role:"admin",is_active:true},
  {id:ids.none,full_name:"Phase3 Zero",email:"phase3-zero@example.invalid",password_hash:"local-only",role:"staff",is_active:true},
  {id:ids.scanner,full_name:"Phase3 Scanner",email:"phase3-scanner@example.invalid",password_hash:"local-only",role:"staff",is_active:true},
  {id:ids.multi,full_name:"Phase3 Multi",email:"phase3-multi@example.invalid",password_hash:"local-only",role:"staff",is_active:true},
  {id:ids.all,full_name:"Phase3 All",email:"phase3-all@example.invalid",password_hash:"local-only",role:"staff",is_active:true},
];
const multiPermissions = ["scanner.manage","tournaments.manage","padelleria.manage","requests.manage"];
const token = async (sid,role) => new SignJWT({sid,role,name:"JWT hint",email:"hint@example.invalid"}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(process.env.STAFF_COOKIE_SECRET));
const request = (path,jwt,redirect="manual") => fetch(base+path,{redirect,signal:AbortSignal.timeout(30000),headers:{Cookie:`staff_session=${jwt}`}});
const html = async (path,jwt) => { const response=await request(path,jwt); assert.equal(response.status,200,`${path} status`); return response.text(); };
const cardMarker = (label) => `aria-label="Apri ${label}"`;
const assertOnlyLabels = (body, expected) => { for (const label of labels) assert.equal(body.includes(cardMarker(label)),expected.includes(label),`${label} visibility`); };
let checks=0;

try {
  assert.ifError((await db.from("staff_users").upsert(rows)).error);
  const grants = [
    {staff_user_id:ids.scanner,permission_key:"scanner.manage",granted_by_staff_id:ids.admin},
    ...multiPermissions.map(permission_key=>({staff_user_id:ids.multi,permission_key,granted_by_staff_id:ids.admin})),
    ...permissions.map(permission_key=>({staff_user_id:ids.all,permission_key,granted_by_staff_id:ids.admin})),
  ];
  assert.ifError((await db.from("staff_permissions").upsert(grants)).error);
  const jwts = { admin:await token(ids.admin,"admin"), none:await token(ids.none,"staff"), scanner:await token(ids.scanner,"staff"), multi:await token(ids.multi,"staff"), all:await token(ids.all,"staff") };

  let body = await html("/staff",jwts.none);
  assert.match(body,/Nessuna area operativa assegnata/); assertOnlyLabels(body,[]); checks+=12;

  body = await html("/staff",jwts.scanner);
  assertOnlyLabels(body,["Scanner / QR"]); checks+=11;
  assert.equal((await request("/staff/scanner",jwts.scanner)).status,200); checks++;
  assert.ok([307,308].includes((await request("/admin/tournaments",jwts.scanner)).status)); checks++;

  body = await html("/staff",jwts.multi);
  assertOnlyLabels(body,["Scanner / QR","Tornei","Padelleria / Social","Richieste Gioca / Allenati"]); checks+=11;

  body = await html("/staff",jwts.all);
  assertOnlyLabels(body,labels); checks+=11;
  body = await html("/admin/tournaments",jwts.all);
  for (const destination of ["/staff/operations","/admin/tournaments","/admin/circuits","/admin/players","/admin/requests","/admin/padelleria","/admin/comunicazioni","/admin/moviback","/admin/partners","/admin/store/products","/admin/monday-league"]) assert.ok(body.includes(`href="${destination}"`),destination); checks+=11;
  for (const destination of ["/admin/users","/admin/users/duplicates","/admin/users/access-problems"]) assert.ok(!body.includes(`href="${destination}"`),destination); checks+=3;
  assert.ok([307,308].includes((await request("/admin/users",jwts.all)).status)); checks++;

  body = await html("/staff",jwts.admin); assertOnlyLabels(body,labels); checks+=11;
  body = await html("/admin/tournaments",jwts.admin);
  for (const destination of ["/admin/users","/admin/users/duplicates","/admin/users/access-problems"]) assert.ok(body.includes(`href="${destination}"`),destination); checks+=3;

  body = await html("/staff",jwts.none); assert.ok(!body.includes(cardMarker("Tornei"))); checks++;
  assert.ifError((await db.from("staff_permissions").insert({staff_user_id:ids.none,permission_key:"tournaments.manage",granted_by_staff_id:ids.admin})).error);
  body = await html("/staff",jwts.none); assert.ok(body.includes(cardMarker("Tornei"))); checks++;
  assert.equal((await request("/admin/tournaments",jwts.none)).status,200); checks++;
  assert.ifError((await db.from("staff_permissions").delete().eq("staff_user_id",ids.none).eq("permission_key","tournaments.manage")).error);
  body = await html("/staff",jwts.none); assert.ok(!body.includes(cardMarker("Tornei"))); checks++;
  assert.ok([307,308].includes((await request("/admin/tournaments",jwts.none)).status)); checks++;

  body = await html("/staff",jwts.none); assert.ok(!body.includes(cardMarker("Padelleria / Social"))); checks++;
  assert.ifError((await db.from("staff_permissions").insert({staff_user_id:ids.none,permission_key:"padelleria.manage",granted_by_staff_id:ids.admin})).error);
  body = await html("/staff",jwts.none); assert.ok(body.includes(cardMarker("Padelleria / Social"))); checks++;
  assert.equal((await request("/admin/padelleria",jwts.none)).status,200); checks++;

  console.log(`Operator dashboard HTTP PASS: ${checks} navigation, grant/revoke, role and proxy checks.`);
} finally {
  await db.from("staff_permissions").delete().in("staff_user_id",Object.values(ids));
  await db.from("staff_users").delete().in("id",Object.values(ids));
}
