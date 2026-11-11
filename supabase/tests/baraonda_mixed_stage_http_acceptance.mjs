import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// Explicit loopback targets and synthetic, self-cleaning local fixtures only.
const app = "http://127.0.0.1:3102";
const local = await fetch("http://127.0.0.1:55421/health").catch(() => null);
if (!local || local.status >= 500) throw new Error("Local Supabase unavailable");
const psql = "C:/Program Files/PostgreSQL/17/bin/psql.exe";
const dbArgs = ["-h", "127.0.0.1", "-p", "55422", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At"];
const db = (query) => execFileSync(psql, [...dbArgs, "-c", query], {
  encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres", PGCONNECT_TIMEOUT: "3" }, windowsHide: true,
}).trim();
assert.equal(db("select current_database()"), "postgres");

const form = new FormData();
form.set("email", "padelleria-admin@example.invalid");
form.set("password", "Padelleria-Local-2026!");
const login = await fetch(`${app}/api/admin/login`, { method: "POST", body: form });
assert.equal(login.status, 200, "Synthetic local Admin login required");
const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
const headers = { Cookie: cookie, "Content-Type": "application/json" };
const missingPath = "/api/admin/tournaments/00000000-0000-4000-8000-000000000000/mixed-preparation";
assert.equal((await fetch(app + missingPath)).status, 401);
assert.equal((await fetch(app + missingPath, { headers: { Cookie: cookie } })).status, 404);
assert.equal((await fetch(app + missingPath, { method: "PATCH", headers, body: "{" })).status, 400);
assert.equal((await fetch(app + missingPath, { method: "PATCH", headers, body: JSON.stringify({ action: "delete" }) })).status, 400);

const circuit = randomUUID();
const group = randomUUID();
const tournament = randomUUID();
const account = randomUUID();
const registrations = Array.from({ length: 4 }, () => randomUUID());
const path = `/api/admin/tournaments/${tournament}/mixed-preparation`;
try {
  db(`begin;
    insert into public.circuits(id,name,slug,tournament_type,status)
      values('${circuit}','Mixed HTTP Fixture','mixed-http-${circuit}','Baraonda','active');
    insert into public.circuit_ranking_groups(id,circuit_id,category,level)
      values('${group}','${circuit}','Libero','principiante');
    insert into public.tournaments(id,name,type,category,level,date,time,location,max_participants,registrations_open,circuit_id,circuit_ranking_group_id)
      values('${tournament}','Mixed HTTP Tournament','Baraonda','Libero','principiante',current_date,'20:00','Local',8,false,'${circuit}','${group}');
    insert into public.users(id,full_name,phone,email,gender)
      values('${account}','Synthetic Linked Player','+393470099004','mixed-${account}@example.invalid','F');
    ${registrations.map((id, index) => `insert into public.tournament_registrations(id,tournament_id,position,p1_name,p1_phone,p1_gender)
      values('${id}','${tournament}',${index + 1},'Synthetic Player ${index + 1}','+3934700990${String(index + 1).padStart(2, "0")}',${index === 3 ? "null" : `'${index === 1 ? "F" : "M"}'`});`).join("\n")}
    update public.tournament_registrations set user_id='${account}' where id='${registrations[3]}';
    commit;`);
  const registrationList = await fetch(`${app}/api/admin/tournaments/${tournament}/registrations`, { headers: { Cookie: cookie } });
  assert.equal(registrationList.status, 200);
  const suggested = (await registrationList.json()).main.find((row) => row.id === registrations[3]);
  assert.equal(suggested.p1_gender, null);
  assert.equal(suggested.p1_gender_suggestion, "F");
  const before = await fetch(app + path, { headers: { Cookie: cookie } });
  assert.equal(before.status, 200);
  assert.equal((await before.json()).data.reason, "GENERE_NON_INDICATO");
  const edit = await fetch(app + path, { method: "PATCH", headers,
    body: JSON.stringify({ action: "set_gender", registration_id: registrations[3], slot: "p1", gender: "F", confirm: true }) });
  assert.equal(edit.status, 200);
  const ready = await fetch(app + path, { headers: { Cookie: cookie } });
  assert.equal(ready.status, 200);
  const eligibility = (await ready.json()).data;
  assert.equal(eligibility.eligible, true);
  assert.deepEqual([eligibility.male_count, eligibility.female_count, eligibility.unknown_count], [2, 2, 0]);
  assert.equal(eligibility.ranking_group_id, group);
  const convert = await fetch(app + path, { method: "PATCH", headers, body: JSON.stringify({ action: "convert_misto", confirm: true }) });
  assert.equal(convert.status, 200);
  assert.equal(db(`select category||':'||circuit_ranking_group_id from public.tournaments where id='${tournament}'`), `Misto:${group}`);
  assert.equal(db(`select count(*) from public.circuit_results where source_tournament_id='${tournament}'`), "0");
} finally {
  db(`begin;
    delete from public.tournament_registrations where tournament_id='${tournament}';
    delete from public.tournaments where id='${tournament}';
    delete from public.users where id='${account}';
    delete from public.circuit_ranking_groups where id='${group}';
    delete from public.circuits where id='${circuit}';
    commit;`);
}
console.log("Baraonda mixed stage local HTTP acceptance PASS");
