import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { operatorDestination, operatorRoleFromResponse } from "../src/lib/operatorAccess.ts";

const header = readFileSync(new URL("../src/components/public/PublicHeader.tsx", import.meta.url), "utf8");
const operatorAccess = readFileSync(new URL("../src/lib/operatorAccess.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/components/public/PublicUI.module.css", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
const adminGuard = readFileSync(new URL("../src/lib/adminGuard.ts", import.meta.url), "utf8");
const staffGuard = readFileSync(new URL("../src/lib/staffGuard.ts", import.meta.url), "utf8");

test("operator session parser accepts only authoritative successful roles", () => {
  assert.equal(operatorRoleFromResponse(true, { authed: true, role: "admin" }), "admin");
  assert.equal(operatorRoleFromResponse(true, { authed: true, role: "staff" }), "staff");
  assert.equal(operatorRoleFromResponse(false, { authed: true, role: "admin" }), null);
  assert.equal(operatorRoleFromResponse(true, { authed: false, role: "admin" }), null);
  assert.equal(operatorRoleFromResponse(true, { authed: true, role: "user" }), null);
  assert.equal(operatorRoleFromResponse(true, null), null);
  assert.equal(operatorDestination("admin"), "/admin");
  assert.equal(operatorDestination("staff"), "/staff");
});

test("Home operator access trusts only the authoritative staff session endpoint", () => {
  assert.match(header, /fetch\("\/api\/staff\/me", \{ cache: "no-store", signal: controller\.signal \}\)/);
  assert.match(header, /operatorRoleFromResponse\(response\.ok, payload\)/);
  assert.doesNotMatch(header, /\/api\/user\/me|public_user|email|user_session|document\.cookie|staff_session/);
});

test("gear destinations and labels are derived from the validated operator role", () => {
  assert.match(operatorAccess, /role === "admin" \? "\/admin" : "\/staff"/);
  assert.match(header, /operatorHref \?/);
  assert.match(header, /Apri area Admin/);
  assert.match(header, /Apri area Staff/);
  assert.match(header, /<Settings size=\{20\} aria-hidden/);
});

test("profile offers operator login only without a valid operator role", () => {
  assert.match(header, /!operatorRole \? <Link href="\/admin\/login"/);
  assert.match(header, />\s*Accesso staff\s*<\/Link>/);
  assert.match(header, /aria-haspopup="menu"/);
  assert.match(header, /event\.key !== "Escape"/);
});

test("operator check failures fail closed and route authorization remains server enforced", () => {
  assert.match(header, /catch \{[\s\S]*setOperatorRole\(null\)/);
  assert.match(proxy, /request\.cookies\.get\(STAFF_COOKIE_NAME\)/);
  assert.match(proxy, /resolveOperatorFromSession\(session\)/);
  assert.match(proxy, /isAdminPath && operator\.role !== "admin"/);
  assert.match(adminGuard, /getCurrentOperator/);
  assert.match(staffGuard, /getCurrentOperator/);
});

test("header controls retain accessible targets and responsive room for three actions", () => {
  assert.match(styles, /\.iconButton\s*\{[\s\S]*width: 44px; height: 44px/);
  assert.match(styles, /\.profileMenuItem\s*\{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.root :where\([\s\S]*:focus-visible[\s\S]*var\(--public-cyan\)/);
  assert.match(styles, /@media \(max-width: 360px\)[\s\S]*headerActionsOperator/);
});
