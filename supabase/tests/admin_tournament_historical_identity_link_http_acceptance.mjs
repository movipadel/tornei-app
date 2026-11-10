import assert from "node:assert/strict";

// Local-only HTTP acceptance. All requests are denied or rejected before a write.
const app = "http://127.0.0.1:3102";
const local = await fetch("http://127.0.0.1:55421/health").catch(() => null);
if (!local || local.status >= 500) throw new Error("Local Supabase unavailable");
const path = "/api/admin/tournaments/00000000-0000-4000-8000-000000000000/registrations/00000000-0000-4000-8000-000000000001/player-identity";
const unauthorized = await fetch(app + path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
assert.equal(unauthorized.status, 401);

const form = new FormData();
form.set("email", "padelleria-admin@example.invalid");
form.set("password", "Padelleria-Local-2026!");
const login = await fetch(`${app}/api/admin/login`, { method: "POST", body: form });
assert.equal(login.status, 200, "Synthetic local Admin login required");
const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
async function patch(url, body) {
  const response = await fetch(app + url, {
    method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const malformed = await patch(path.replace("00000000-0000-4000-8000-000000000001", "bad-id"), {});
assert.equal(malformed.status, 400);
const missing = await patch(path, { slot: "p1", kind: "identity", confirmed: true,
  player_identity_id: "00000000-0000-4000-8000-000000000002",
  expected_name: "Synthetic Missing", expected_phone: "+393470008899",
  expected_is_reserve: false, expected_current_identity_id: null,
  expected_candidate_name: "Synthetic Missing", expected_candidate_phone: "+393470008899",
});
assert.equal(missing.status, 404);
assert.equal(missing.body.code, "TOURNAMENT_NOT_FOUND");
console.log("Historical tournament identity link local HTTP acceptance PASS");
