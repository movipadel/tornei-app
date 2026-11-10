import assert from "node:assert/strict";

// This acceptance uses only the certified local app and synthetic local Admin.
const app = "http://127.0.0.1:3102";
const local = await fetch("http://127.0.0.1:55421/health").catch(() => null);
if (!local || local.status >= 500) throw new Error("Local Supabase unavailable");
const loginForm = new FormData();
loginForm.set("email", "padelleria-admin@example.invalid");
loginForm.set("password", "Padelleria-Local-2026!");
const login = await fetch(`${app}/api/admin/login`, { method: "POST", body: loginForm });
assert.equal(login.status, 200, "Synthetic local Admin login required");
const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");

async function request(path, options = {}) {
  const response = await fetch(`${app}${path}`, { ...options, headers: { Cookie: cookie, "Content-Type": "application/json", ...options.headers } });
  return { status: response.status, body: await response.json() };
}
const deniedSearch = await fetch(`${app}/api/admin/tournaments/players/search?q=Fixture`);
assert.equal(deniedSearch.status, 401);
const deniedWrite = await fetch(`${app}/api/admin/tournaments/00000000-0000-4000-8000-000000000000/registrations`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p1: { kind: "new" } }),
});
assert.equal(deniedWrite.status, 401);
assert.deepEqual((await request("/api/admin/tournaments/players/search?q=ab")).body.data, []);
assert.deepEqual((await request("/api/admin/tournaments/players/search?q=123")).body.data, []);
const search = await request("/api/admin/tournaments/players/search?q=Fixture");
assert.equal(search.status, 200);
assert.ok(Array.isArray(search.body.data));
assert.ok(search.body.data.length <= 12);
for (const row of search.body.data) {
  assert.deepEqual(Object.keys(row).sort(), ["account_user_id", "alias_match", "display_name", "email", "gender", "phone", "player_identity_id", "source"].sort());
}
const accountOnly = await request("/api/admin/tournaments/players/search?q=PF08");
assert.equal(accountOnly.status, 200);
assert.ok(accountOnly.body.data.some((row) => row.source === "Account da collegare" && row.player_identity_id === null));
const invalid = await request("/api/admin/tournaments/00000000-0000-4000-8000-000000000000/registrations", {
  method: "POST", body: JSON.stringify({ p1: { kind: "new", confirmed: true, full_name: "Fixture Test", phone: "+393470009991" } }),
});
assert.equal(invalid.status, 400);
assert.equal(invalid.body.error, "TOURNAMENT_NOT_FOUND");
console.log("Admin tournament identity HTTP acceptance PASS");
