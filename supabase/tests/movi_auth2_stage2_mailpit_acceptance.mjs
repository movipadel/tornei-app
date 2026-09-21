import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const status = spawnSync("npx supabase status -o json", [], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: true,
});
if (status.status !== 0) throw new Error(`Local Supabase status unavailable: ${status.error?.message ?? status.stderr}`);
const local = JSON.parse(status.stdout);
assert.equal(local.API_URL, "http://127.0.0.1:55021");
assert.equal(local.MAILPIT_URL, "http://127.0.0.1:55024");

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const signupEmail = `stage2-signup-${suffix}@example.invalid`;
const activationEmail = `stage2-activation-${suffix}@example.invalid`;
const resetEmail = `stage2-reset-${suffix}@example.invalid`;
const created = [];

async function auth(path, body, key = local.ANON_KEY) {
  return fetch(`${local.API_URL}/auth/v1${path}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

try {
  const signup = await auth("/signup", {
    email: signupEmail,
    password: "Stage2-local-only-42!",
    gotrue_meta_security: {},
  });
  assert.equal(signup.ok, true, `signup email request failed: ${signup.status}`);
  const signupBody = await signup.json();
  if (signupBody.id) created.push(signupBody.id);

  const activation = await auth("/otp", {
    email: activationEmail,
    create_user: true,
    gotrue_meta_security: {},
  });
  assert.equal(activation.ok, true, `activation email request failed: ${activation.status}`);

  const resetUser = await auth("/admin/users", {
    email: resetEmail,
    password: "Stage2-local-only-42!",
    email_confirm: true,
  }, local.SERVICE_ROLE_KEY);
  assert.equal(resetUser.ok, true, `local reset fixture failed: ${resetUser.status}`);
  const resetUserBody = await resetUser.json();
  if (resetUserBody.id) created.push(resetUserBody.id);
  const recovery = await auth("/recover", { email: resetEmail, gotrue_meta_security: {} });
  assert.equal(recovery.ok, true, `recovery email request failed: ${recovery.status}`);

  await new Promise((resolve) => setTimeout(resolve, 750));
  const mailbox = await fetch(`${local.MAILPIT_URL}/api/v1/messages`).then((response) => response.json());
  const recipients = JSON.stringify(mailbox.messages ?? mailbox.Messages ?? []);
  assert.match(recipients, new RegExp(signupEmail));
  assert.match(recipients, new RegExp(activationEmail));
  assert.match(recipients, new RegExp(resetEmail));
  console.log("Mailpit accepted signup verification, activation, and password reset emails.");
} finally {
  for (const id of created) {
    await fetch(`${local.API_URL}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: { apikey: local.SERVICE_ROLE_KEY, authorization: `Bearer ${local.SERVICE_ROLE_KEY}` },
    });
  }
}
