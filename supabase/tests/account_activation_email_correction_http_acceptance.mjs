import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// This test can only use the verified, unlinked local Supabase stack.
if (process.env.SUPABASE_URL !== "http://127.0.0.1:55421" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== process.env.SUPABASE_URL ||
    process.env.PADELLERIA_LOCAL_VERIFIED !== "1") {
  throw new Error("Local Supabase verification required");
}
const api = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!key || !anon) throw new Error("Local keys unavailable");
const service = createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } });
const client = createClient(api, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const ids = { staff: randomUUID(), user: randomUUID(), player: randomUUID(), operation: randomUUID(), conflict: randomUUID() };
const suffix = ids.user.slice(0, 8);
const oldEmail = `repair-old-${suffix}@example.invalid`;
const newEmail = `repair-new-${suffix}@example.invalid`;
const finalEmail = `repair-final-${suffix}@example.invalid`;
const conflictEmail = `repair-conflict-${suffix}@example.invalid`;
const password = "Synthetic-Repair-Old-2026!";
let authId = null;
let conflictAuthId = null;

function sql(statement) {
  const result = spawnSync("C:/Program Files/PostgreSQL/17/bin/psql.exe", [
    "-X", "-v", "ON_ERROR_STOP=1", "-At", "-h", "127.0.0.1", "-p", "55422",
    "-U", "postgres", "-d", "postgres", "-c", statement,
  ], { encoding: "utf8", windowsHide: true, env: { ...process.env, PGPASSWORD: "postgres" } });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Local SQL failed");
  return result.stdout.trim();
}
async function rpc(name, args) {
  const result = await service.rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}
async function cleanup() {
  if (authId) {
    const removed = await service.auth.admin.deleteUser(authId);
    if (removed.error && removed.error.status !== 404) throw removed.error;
  }
  if (conflictAuthId) {
    const removed = await service.auth.admin.deleteUser(conflictAuthId);
    if (removed.error && removed.error.status !== 404) throw removed.error;
  }
  sql(`begin; set local session_replication_role=replica;
    delete from public.account_activation_email_repair_events where public_user_id='${ids.user}';
    delete from public.account_activation_email_repair_operations where public_user_id='${ids.user}';
    delete from public.player_identities where id='${ids.player}';
    delete from public.users where id in ('${ids.user}','${ids.conflict}');
    delete from public.staff_users where id='${ids.staff}'; commit;`);
}

try {
  sql(`insert into public.staff_users(id,full_name,email,password_hash,role,is_active)
    values('${ids.staff}','Synthetic Repair Admin','repair-admin-${suffix}@example.invalid',
      extensions.crypt('Synthetic-Repair-Admin-2026!',extensions.gen_salt('bf')),'admin',true);
    insert into public.users(id,full_name,phone,email,gender,identity_status,auth_migration_state)
    values('${ids.user}','Synthetic Repair Customer','3479820261','${oldEmail}','M','active','activation_pending');
    insert into public.player_identities(id,full_name,normalized_phone,account_user_id,status)
    values('${ids.player}','Synthetic Repair Customer',public.normalize_user_mobile_e164('3479820261'),'${ids.user}','active');`);
  const signup = await client.auth.signUp({ email: oldEmail, password });
  if (signup.error) throw signup.error;
  authId = signup.data.user?.id;
  assert.ok(authId, "Synthetic unconfirmed Auth user was not created");
  const mailbox = await fetch("http://127.0.0.1:55424/api/v1/messages").then((response) => response.json());
  const confirmationMessage = (mailbox.messages ?? mailbox.Messages ?? [])
    .find((message) => JSON.stringify(message.To).includes(oldEmail));
  assert.ok(confirmationMessage, "Synthetic confirmation email missing from local Mailpit");
  const mail = await fetch(`http://127.0.0.1:55424/api/v1/message/${confirmationMessage.ID}`)
    .then((response) => response.json());
  const confirmationLink = mail.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\?\S+/)?.[0];
  assert.ok(confirmationLink, "Synthetic confirmation link missing");
  const confirmationUrl = new URL(confirmationLink);
  assert.equal(confirmationUrl.origin, api, "Confirmation must target local Auth");
  sql(`insert into public.user_auth_onboarding(auth_user_id,flow,state,normalized_email,full_name,normalized_phone)
    values('${authId}','activation','pending_verification','${oldEmail}','Synthetic Repair Customer',
      public.normalize_user_mobile_e164('3479820261'));`);
  const businessBefore = sql(`select (select count(*) from public.loyalty_memberships)::text||'|'||
    (select count(*) from public.loyalty_transactions)::text||'|'||
    (select count(*) from public.tournament_registrations)::text||'|'||
    (select count(*) from public.circuit_results)::text`);
  const probe = await rpc("admin_prepare_incomplete_activation_email_repair", {
    p_public_user_id: ids.user, p_actor_staff_id: null, p_new_email: null,
    p_reason: null, p_operation_id: null, p_dry_run: true,
  });
  assert.equal(probe.state, "eligible", JSON.stringify(probe));
  if (process.env.VISUAL_HOLD === "1") {
    console.log(`LOCAL_VISUAL_FIXTURE player=${ids.player} staff_email=repair-admin-${suffix}@example.invalid password=Synthetic-Repair-Admin-2026!`);
    await new Promise((resolve) => process.stdin.once("data", resolve));
  }
  // These mutations are rolled back in the same local SQL session. They prove
  // that a changed Auth/profile state cannot enter the repair workflow.
  sql(`begin; update auth.users set email_confirmed_at=now() where id='${authId}';
    do $$ begin if (select public.admin_prepare_incomplete_activation_email_repair(
      '${ids.user}',null,null,null,null,true)->>'state') <> 'blocked' then
      raise exception 'Confirmed Auth incorrectly eligible'; end if; end $$; rollback;`);
  sql(`begin; update auth.users set last_sign_in_at=now() where id='${authId}';
    do $$ begin if (select public.admin_prepare_incomplete_activation_email_repair(
      '${ids.user}',null,null,null,null,true)->>'state') <> 'blocked' then
      raise exception 'Previously signed-in Auth incorrectly eligible'; end if; end $$; rollback;`);
  sql(`begin; update public.users set auth_user_id='${authId}' where id='${ids.user}';
    do $$ begin if (select public.admin_prepare_incomplete_activation_email_repair(
      '${ids.user}',null,null,null,null,true)->>'state') <> 'blocked' then
      raise exception 'Linked account incorrectly eligible'; end if; end $$; rollback;`);
  sql(`begin; delete from public.user_auth_onboarding where auth_user_id='${authId}';
    do $$ begin if (select public.admin_prepare_incomplete_activation_email_repair(
      '${ids.user}',null,null,null,null,true)->>'state') <> 'blocked' then
      raise exception 'Missing onboarding incorrectly eligible'; end if; end $$; rollback;`);
  const cancelledOperationId = randomUUID();
  let cancelled = await rpc("admin_prepare_incomplete_activation_email_repair", {
    p_public_user_id: ids.user, p_actor_staff_id: ids.staff, p_new_email: newEmail,
    p_reason: "Synthetic cancellation before Auth removal",
    p_operation_id: cancelledOperationId, p_dry_run: false,
  });
  assert.equal(cancelled.state, "prepared");
  cancelled = await rpc("admin_cancel_incomplete_activation_email_repair", {
    p_operation_id: cancelledOperationId, p_actor_staff_id: ids.staff,
  });
  assert.equal(cancelled.state, "cancelled");
  assert.equal(sql(`select auth_migration_state from public.users where id='${ids.user}'`), "activation_pending");
  assert.equal((await service.auth.admin.getUserById(authId)).error, null,
    "Cancelled repair must preserve the old Auth account");

  sql(`insert into public.users(id,full_name,phone,email,gender)
    values('${ids.conflict}','Synthetic Conflict','3479820262','${conflictEmail}','F');`);
  let result = await rpc("admin_prepare_incomplete_activation_email_repair", {
    p_public_user_id: ids.user, p_actor_staff_id: ids.staff, p_new_email: conflictEmail,
    p_reason: "Verified synthetic correction", p_operation_id: randomUUID(), p_dry_run: false,
  });
  assert.equal(result.reason, "target_email_conflict");
  sql(`delete from public.users where id='${ids.conflict}';`);
  const conflictAuth = await service.auth.admin.createUser({ email: conflictEmail, email_confirm: false });
  if (conflictAuth.error) throw conflictAuth.error;
  conflictAuthId = conflictAuth.data.user.id;
  result = await rpc("admin_prepare_incomplete_activation_email_repair", {
    p_public_user_id: ids.user, p_actor_staff_id: ids.staff, p_new_email: conflictEmail,
    p_reason: "Verified synthetic correction", p_operation_id: randomUUID(), p_dry_run: false,
  });
  assert.equal(result.reason, "target_email_conflict");
  await service.auth.admin.deleteUser(conflictAuthId);
  conflictAuthId = null;

  result = await rpc("admin_prepare_incomplete_activation_email_repair", {
    p_public_user_id: ids.user, p_actor_staff_id: ids.staff, p_new_email: newEmail,
    p_reason: "Verified synthetic correction", p_operation_id: ids.operation, p_dry_run: false,
  });
  assert.equal(result.state, "prepared", JSON.stringify(result));
  assert.equal(await rpc("admin_incomplete_activation_repair_deletion_ready", { p_operation_id: ids.operation }), true);
  assert.equal(sql(`select auth_migration_state from public.users where id='${ids.user}'`), "review_required");
  const removed = await service.auth.admin.deleteUser(authId);
  if (removed.error) throw removed.error;
  const staleConfirmation = await fetch(confirmationUrl, { redirect: "manual" });
  const staleLocation = staleConfirmation.headers.get("location");
  const staleHash = staleLocation ? new URL(staleLocation, api).hash : "";
  assert.ok(staleConfirmation.status >= 400 ||
    (staleConfirmation.status >= 300 && staleConfirmation.status < 400 &&
      staleHash.includes("error=access_denied") && !staleHash.includes("access_token=")),
  "Deleted Auth confirmation link unexpectedly worked");
  assert.equal(sql(`select count(*) from public.user_auth_onboarding where auth_user_id='${authId}'`), "0");
  result = await rpc("admin_finish_incomplete_activation_email_repair", {
    p_operation_id: ids.operation, p_actor_staff_id: ids.staff,
  });
  assert.equal(result.state, "completed", JSON.stringify(result));
  result = await rpc("admin_finish_incomplete_activation_email_repair", {
    p_operation_id: ids.operation, p_actor_staff_id: ids.staff,
  });
  assert.equal(result.state, "completed", "Retry must be idempotent");
  assert.equal(sql(`select email||'|'||auth_migration_state||'|'||coalesce(auth_user_id::text,'NULL')
    from public.users where id='${ids.user}'`), `${newEmail}|legacy|NULL`);
  assert.equal(sql(`select account_user_id from public.player_identities where id='${ids.player}'`), ids.user);
  assert.equal(sql(`select count(*) from public.account_activation_email_repair_events where operation_id='${ids.operation}'`), "2");
  const oldLogin = await client.auth.signInWithPassword({ email: oldEmail, password });
  assert.ok(oldLogin.error, "Deleted Auth password must not work");
  const restart = await client.auth.signUp({ email: newEmail, password: "Synthetic-Repair-New-2026!" });
  if (restart.error) throw restart.error;
  assert.ok(restart.data.user?.id, "Canonical activation can restart at corrected email");
  const restartedAuthId = restart.data.user.id;
  authId = restartedAuthId;
  sql(`update public.users set auth_migration_state='activation_pending' where id='${ids.user}';
    insert into public.user_auth_onboarding(auth_user_id,flow,state,normalized_email,full_name,normalized_phone)
    values('${restartedAuthId}','activation','pending_verification','${newEmail}',
      'Synthetic Repair Customer',public.normalize_user_mobile_e164('3479820261'));`);
  const app = "http://127.0.0.1:3101";
  const path = `${app}/api/admin/players/${ids.player}/activation-email-correction`;
  const denied = await fetch(path);
  assert.ok([401, 403].includes(denied.status), "Anonymous Admin lookup was not denied");
  const login = await fetch(`${app}/api/staff/login`, {
    method: "POST", body: new URLSearchParams({
      email: `repair-admin-${suffix}@example.invalid`, password: "Synthetic-Repair-Admin-2026!",
    }),
  });
  assert.equal(login.status, 200, "Synthetic local Admin login failed");
  const cookie = (typeof login.headers.getSetCookie === "function"
    ? login.headers.getSetCookie() : [login.headers.get("set-cookie")].filter(Boolean))
    .map((value) => value.split(";", 1)[0]).join("; ");
  const visible = await fetch(path, { headers: { Cookie: cookie } });
  assert.equal(visible.status, 200, "Customer Hub repair status unavailable");
  assert.equal((await visible.json()).data.repair.state, "eligible");
  const operationId = randomUUID();
  const execute = await fetch(path, {
    method: "POST", headers: { Cookie: cookie, "content-type": "application/json" },
    body: JSON.stringify({ operation_id: operationId, new_email: finalEmail,
      reason: "Verified synthetic correction through Admin route", confirmed: true }),
  });
  assert.equal(execute.status, 200, await execute.clone().text());
  assert.equal((await execute.json()).state, "completed");
  const replay = await fetch(path, {
    method: "POST", headers: { Cookie: cookie, "content-type": "application/json" },
    body: JSON.stringify({ operation_id: operationId, resume: true, confirmed: true }),
  });
  assert.equal(replay.status, 200, "Admin route replay must be idempotent");
  assert.equal(sql(`select email||'|'||auth_migration_state from public.users where id='${ids.user}'`),
    `${finalEmail}|legacy`);
  assert.equal(sql(`select (select count(*) from public.loyalty_memberships)::text||'|'||
    (select count(*) from public.loyalty_transactions)::text||'|'||
    (select count(*) from public.tournament_registrations)::text||'|'||
    (select count(*) from public.circuit_results)::text`), businessBefore,
  "Repair must not alter MoviBack or tournament data");
  console.log("Local incomplete-activation repair HTTP acceptance PASS: eligibility, conflicts, two-phase repair, draft cascade, audit, retry, old link/password invalid, restart, Admin route.");
} finally {
  await cleanup();
}
