import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.UNIFIED_AUTH_SUPABASE_URL;
const serviceKey = process.env.UNIFIED_AUTH_SERVICE_ROLE_KEY;
const appUrl = process.env.UNIFIED_AUTH_APP_URL ?? "http://127.0.0.1:3200";
if (supabaseUrl !== "http://127.0.0.1:55021") throw new Error("Refusing Auth operation: target must be exactly http://127.0.0.1:55021");
if (!serviceKey) throw new Error("The explicit local service key is required");

const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const password = "Unified-Local-Password-94!";
const ids = {
  exact: "a7100000-0000-4000-8000-000000000001",
  mismatch: "a7100000-0000-4000-8000-000000000002",
  reviewA: "a7100000-0000-4000-8000-000000000003",
  reviewB: "a7100000-0000-4000-8000-000000000004",
  conflict: "a7100000-0000-4000-8000-000000000005",
  membership: "a7200000-0000-4000-8000-000000000001",
  order: "a7300000-0000-4000-8000-000000000001",
  communication: "a7400000-0000-4000-8000-000000000001",
  staff: "a7410000-0000-4000-8000-000000000001",
  season: "a7500000-0000-4000-8000-000000000001",
  phase: "a7510000-0000-4000-8000-000000000001",
  team: "a7600000-0000-4000-8000-000000000001",
  player: "a7700000-0000-4000-8000-000000000001",
  tournament: "a7800000-0000-4000-8000-000000000001",
  registration: "a7900000-0000-4000-8000-000000000001",
};
const cases = {
  zero: ["unified-zero@example.invalid", "3479700101"],
  exact: ["unified-exact@example.invalid", "3479700102"],
  mismatch: ["unified-mismatch@example.invalid", "3479700199"],
  review: ["unified-review@example.invalid", "3479700104"],
  conflict: ["unified-conflict@example.invalid", "3479700105"],
};
const allEmails = [...Object.values(cases).map(([email]) => email), "unified-owner@example.invalid"];

async function json(response) { return response.json().catch(() => ({})); }
function cookies(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}
async function post(path, body = {}, cookie = "") {
  return fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}
async function createAuth(email) {
  const result = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error) throw result.error;
  return result.data.user;
}
async function prepare(authId, [email, phone]) {
  const result = await service.rpc("prepare_user_auth_signup", {
    p_auth_user_id: authId, p_full_name: `Draft ${email}`, p_phone: phone, p_gender: "F",
    p_privacy_accepted: true, p_terms_accepted: true, p_age_confirmed: true, p_marketing_accepted: false,
  });
  if (result.error) throw result.error;
  const row = await service.from("user_auth_onboarding").select("state,match_count,normalized_email,normalized_phone")
    .eq("auth_user_id", authId).single();
  if (row.error) throw row.error;
  assert.equal(row.data.state, "pending_verification");
  assert.equal(row.data.match_count, 0);
  assert.equal(row.data.normalized_email, email);
}
async function login(email) {
  const response = await post("/api/auth/login", { email, password });
  assert.equal(response.status, 200, JSON.stringify(await json(response.clone())));
  return cookies(response);
}
async function resume(cookie) {
  const response = await post("/api/auth/onboarding/resume", {}, cookie);
  assert.equal(response.status, 200, JSON.stringify(await json(response.clone())));
  return json(response);
}
async function cleanup() {
  await service.from("tournament_registrations").delete().eq("id", ids.registration);
  await service.from("tournaments").delete().eq("id", ids.tournament);
  await service.from("league_team_players").delete().eq("id", ids.player);
  await service.from("league_teams").delete().eq("id", ids.team);
  await service.from("league_seasons").delete().eq("id", ids.season);
  await service.from("staff_users").delete().eq("id", ids.staff);
  await service.from("communications").delete().eq("id", ids.communication);
  await service.from("store_orders").delete().eq("id", ids.order);
  await service.from("loyalty_memberships").delete().eq("id", ids.membership);
  const syntheticUsers = await service.from("users").select("id").in("email", allEmails);
  if (syntheticUsers.error) throw syntheticUsers.error;
  const syntheticUserIds = [...new Set([
    ids.exact, ids.mismatch, ids.reviewA, ids.reviewB, ids.conflict,
    ...(syntheticUsers.data ?? []).map((user) => user.id),
  ])];
  const reviewMemberships = await service.from("user_duplicate_review_members").select("group_id").in("user_id", syntheticUserIds);
  if (reviewMemberships.error) throw reviewMemberships.error;
  const groupIds = [...new Set((reviewMemberships.data ?? []).map((membership) => membership.group_id))];
  if (groupIds.length) {
    const removedGroups = await service.from("user_duplicate_review_groups").delete().in("id", groupIds);
    if (removedGroups.error) throw removedGroups.error;
  }
  const removedUsers = await service.from("users").delete().in("id", syntheticUserIds);
  if (removedUsers.error) throw removedUsers.error;
  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  for (const user of listed.data.users) if (allEmails.includes(user.email ?? "")) await service.auth.admin.deleteUser(user.id);
}

await cleanup();
try {
  const zeroAuth = await createAuth(cases.zero[0]);
  await prepare(zeroAuth.id, cases.zero);
  const zeroCookie = await login(cases.zero[0]);
  assert.deepEqual(await resume(zeroCookie), { state: "linked" });
  const zeroProfiles = await service.from("users").select("id,auth_user_id").eq("email", cases.zero[0]);
  assert.equal(zeroProfiles.data?.length, 1);
  assert.equal(zeroProfiles.data?.[0].auth_user_id, zeroAuth.id);
  assert.deepEqual(await resume(zeroCookie), { state: "linked" }, "zero-profile replay was not idempotent");

  const exactAuth = await createAuth(cases.exact[0]);
  const exactInsert = await service.from("users").insert({
    id: ids.exact, full_name: "Existing Exact", phone: cases.exact[1], email: cases.exact[0], gender: "F", auth_migration_state: "legacy",
  });
  if (exactInsert.error) throw exactInsert.error;
  const businessInsert = await Promise.all([
    service.from("loyalty_memberships").insert({ id: ids.membership, user_id: ids.exact, status: "approved", membership_code: "UNIFIED-EXACT", tax_code: "UNIFIED-TAX", membership_type: "ASC" }),
    service.from("store_orders").insert({ id: ids.order, user_id: ids.exact, status: "pending", pickup_club: "CENTALLO", payment_mode: "euro", total_euro: 10, total_points: 0, customer_name: "Snapshot", customer_phone: "3470000000", customer_email: "snapshot@example.invalid" }),
    service.from("communications").insert({ id: ids.communication, target: "user", title: "Unified", body: "Synthetic", is_active: true, starts_at: new Date().toISOString(), recipient_user_id: ids.exact, event_type: "unified_test", event_key: "unified:test:notice" }),
    service.from("tournaments").insert({ id: ids.tournament, name: "Unified Tournament", type: "Baraonda", category: "Misto", date: "2030-01-01", time: "20:00", location: "Local", max_participants: 16 }),
  ]);
  for (const result of businessInsert) if (result.error) throw result.error;
  let result = await service.from("staff_users").insert({ id: ids.staff, full_name: "Unified Admin", email: "unified-admin@example.invalid", role: "admin", is_active: true });
  if (result.error) throw result.error;
  result = await service.from("league_seasons").insert({ id: ids.season, name: "Unified League", slug: "unified-league", status: "draft" });
  if (result.error) throw result.error;
  result = await service.from("league_phases").insert({ id: ids.phase, season_id: ids.season, code: "phase1", name: "Fase 1", sequence: 1, status: "draft" });
  if (result.error) throw result.error;
  const savedTeam = await service.rpc("league_save_team", {
    p_actor_id: ids.staff, p_season_id: ids.season, p_team_id: null,
    p_name: "Unified Team", p_slug: "unified-team", p_captain_user_id: ids.exact,
    p_roster: [{ display_name: "Existing Exact", user_id: ids.exact }],
  });
  if (savedTeam.error) throw savedTeam.error;
  const leagueTeamId = savedTeam.data.data.team_id;
  result = await service.from("tournament_registrations").insert({ id: ids.registration, tournament_id: ids.tournament, position: 1, is_reserve: false, p1_name: "Existing Exact", p1_phone: cases.exact[1], p1_gender: "F", user_id: ids.exact });
  if (result.error) throw result.error;
  await prepare(exactAuth.id, cases.exact);
  const exactCookie = await login(cases.exact[0]);
  assert.deepEqual(await resume(exactCookie), { state: "linked" });
  const exact = await service.from("users").select("id,auth_user_id,full_name").eq("id", ids.exact).single();
  assert.equal(exact.data?.auth_user_id, exactAuth.id);
  assert.equal(exact.data?.full_name, "Existing Exact", "existing profile data was overwritten by signup draft");
  for (const [table, id] of [["loyalty_memberships", ids.membership], ["store_orders", ids.order], ["communications", ids.communication], ["tournament_registrations", ids.registration]]) {
    const owner = await service.from(table).select(table === "communications" ? "recipient_user_id" : "user_id").eq("id", id).single();
    assert.equal(owner.data?.[table === "communications" ? "recipient_user_id" : "user_id"], ids.exact, `${table} ownership changed`);
  }
  const leagueOwner = await service.from("league_team_players").select("user_id").eq("team_id", leagueTeamId).single();
  assert.equal(leagueOwner.data?.user_id, ids.exact, "Monday League ownership changed");
  let response = await fetch(`${appUrl}/api/user/me`, { headers: { cookie: exactCookie } });
  assert.equal((await json(response)).user.id, ids.exact);
  response = await fetch(`${appUrl}/auth/callback?flow=signup`, { headers: { cookie: exactCookie }, redirect: "manual" });
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /auth=registered/);
  const exactCount = await service.from("users").select("id", { count: "exact", head: true }).eq("email", cases.exact[0]);
  assert.equal(exactCount.count, 1, "callback replay created a duplicate profile");

  const mismatchAuth = await createAuth(cases.mismatch[0]);
  result = await service.from("users").insert({ id: ids.mismatch, full_name: "Mismatch", phone: "3479700103", email: cases.mismatch[0], gender: "F", auth_migration_state: "legacy" });
  if (result.error) throw result.error;
  await prepare(mismatchAuth.id, cases.mismatch);
  assert.deepEqual(await resume(await login(cases.mismatch[0])), { state: "conflict" });
  assert.equal((await service.from("users").select("auth_user_id").eq("id", ids.mismatch).single()).data?.auth_user_id, null);

  const reviewAuth = await createAuth(cases.review[0]);
  result = await service.from("users").insert([
    { id: ids.reviewA, full_name: "Review A", phone: cases.review[1], email: cases.review[0], gender: "F", auth_migration_state: "legacy" },
    { id: ids.reviewB, full_name: "Review B", phone: "3479700144", email: cases.review[0].toUpperCase(), gender: "F", auth_migration_state: "legacy" },
  ]);
  if (result.error) throw result.error;
  await prepare(reviewAuth.id, cases.review);
  assert.deepEqual(await resume(await login(cases.review[0])), { state: "review_required" });

  const ownerAuth = await createAuth("unified-owner@example.invalid");
  const conflictAuth = await createAuth(cases.conflict[0]);
  result = await service.from("users").insert({ id: ids.conflict, full_name: "Conflict", phone: cases.conflict[1], email: cases.conflict[0], gender: "F", auth_user_id: ownerAuth.id, auth_migration_state: "linked" });
  if (result.error) throw result.error;
  await prepare(conflictAuth.id, cases.conflict);
  assert.deepEqual(await resume(await login(cases.conflict[0])), { state: "conflict" });
  assert.equal((await service.from("users").select("auth_user_id").eq("id", ids.conflict).single()).data?.auth_user_id, ownerAuth.id);

  console.log("Unified onboarding local HTTP acceptance PASS: zero, exact legacy, stranded match_count=0, replay, mismatch, multiple, foreign-Auth conflict, /api/user/me, and business ownership.");
} finally {
  await cleanup();
}
