import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.env.PADELLERIA_LOCAL_VERIFIED !== "1" || process.env.SUPABASE_URL !== "http://127.0.0.1:55421") throw new Error("Verified local runner required");
if (process.env.CRON_SECRET !== "padelleria-local-only-cron-secret-2026") throw new Error("Local cron secret required");

const base = process.env.PADELLERIA_TEST_BASE_URL || "http://127.0.0.1:3101";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const expiredId = randomUUID(), futureId = randomUUID(), unrelatedId = randomUUID();
const coverId = randomUUID(), galleryId = randomUUID(), videoId = randomUUID(), unrelatedMediaId = randomUUID();
const expiredPaths = [`${expiredId}/${coverId}.jpg`, `${expiredId}/${galleryId}.jpg`];
const unrelatedPath = `${unrelatedId}/${unrelatedMediaId}.jpg`;
const allIds = [expiredId, futureId, unrelatedId];
const image = readFileSync("public/home/tournaments.jpg");
const check = ({ error }) => assert.ifError(error);

async function cron(secret = process.env.CRON_SECRET) {
  const response = await fetch(`${base}/api/cron/padelleria-content-cleanup`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
  return { status: response.status, json: await response.json() };
}

try {
  const common = { kind: "succede", status: "published", excerpt: "local", body: "local", featured: false, sort_order: 0, cta_label: null, cta_url: null, occurred_at: null, visible_from: new Date(Date.now() - 86400000).toISOString(), deleted_at: null };
  check(await db.from("padelleria_contents").insert([
    { ...common, id: expiredId, title: "Lifecycle expired local", delete_on_expiry: true, visible_until: new Date(Date.now() - 3600000).toISOString() },
    { ...common, id: futureId, title: "Lifecycle future local", delete_on_expiry: true, visible_until: new Date(Date.now() + 86400000).toISOString() },
    { ...common, id: unrelatedId, title: "Lifecycle unrelated local", delete_on_expiry: false, visible_until: new Date(Date.now() + 86400000).toISOString() },
  ]));

  for (const path of [...expiredPaths, unrelatedPath]) check(await db.storage.from("padelleria-content-media").upload(path, image, { contentType: "image/jpeg", upsert: false }));
  check(await db.from("padelleria_content_media").insert([
    { id: coverId, content_id: expiredId, media_type: "image", role: "cover", storage_path: expiredPaths[0], caption: "cover", sort_order: 0 },
    { id: galleryId, content_id: expiredId, media_type: "image", role: "gallery", storage_path: expiredPaths[1], caption: "gallery", sort_order: 1 },
    { id: videoId, content_id: expiredId, media_type: "video", role: "video", external_url: "https://vimeo.com/123456", caption: "external", sort_order: 2 },
    { id: unrelatedMediaId, content_id: unrelatedId, media_type: "image", role: "cover", storage_path: unrelatedPath, caption: "unrelated", sort_order: 0 },
  ]));

  assert.equal((await cron("wrong-secret")).status, 401);
  const first = await cron();
  assert.equal(first.status, 200);
  assert.equal(first.json.failed, 0);
  assert.ok(first.json.purged >= 1);

  assert.equal((await db.from("padelleria_contents").select("id").eq("id", expiredId)).data.length, 0);
  assert.equal((await db.from("padelleria_content_media").select("id").eq("content_id", expiredId)).data.length, 0);
  for (const path of expiredPaths) assert.ok((await db.storage.from("padelleria-content-media").download(path)).error);
  assert.ifError((await db.storage.from("padelleria-content-media").download(unrelatedPath)).error);
  assert.equal((await db.from("padelleria_contents").select("id").eq("id", futureId)).data.length, 1);
  assert.equal((await db.from("padelleria_contents").select("id").eq("id", unrelatedId)).data.length, 1);

  const second = await cron();
  assert.equal(second.status, 200);
  assert.equal(second.json.failed, 0);
  assert.equal((await db.from("padelleria_contents").select("id").eq("id", expiredId)).data.length, 0);

  const publicResponse = await fetch(`${base}/api/padelleria?kind=succede&limit=50`);
  const publicJson = await publicResponse.json();
  assert.equal(publicResponse.status, 200);
  assert.ok(publicJson.data.every((item) => !("delete_on_expiry" in item)));

  console.log("Padelleria lifecycle HTTP PASS: owned media purged, unrelated/future content preserved, repeat safe.");
} finally {
  await db.storage.from("padelleria-content-media").remove([...expiredPaths, unrelatedPath]);
  await db.from("padelleria_content_media").delete().in("content_id", allIds);
  await db.from("padelleria_contents").delete().in("id", allIds);
}
