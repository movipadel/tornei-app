import webPush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AdminPushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
};

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:movipadel@gmail.com";

  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys mancanti");
  }

  return {
    publicKey,
    privateKey,
    subject,
  };
}

export async function sendAdminPushNotification(payload: AdminPushPayload) {
  const sb = supabaseAdmin();

  const { publicKey, privateKey, subject } = getVapidConfig();

  webPush.setVapidDetails(subject, publicKey, privateKey);

  const { data: subscriptions, error } = await sb
    .from("admin_push_subscriptions")
    .select("id,endpoint,p256dh,auth,is_active")
    .eq("is_active", true);

  if (error) {
    console.error("[admin-push] subscriptions error", error.message);
    return {
      ok: false,
      sent: 0,
      failed: 0,
      error: error.message,
    };
  }

  if (!subscriptions?.length) {
    return {
      ok: true,
      sent: 0,
      failed: 0,
    };
  }

  let sent = 0;
  let failed = 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/admin",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
  });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          body
        );

        sent += 1;
      } catch (err: any) {
        failed += 1;

        const statusCode = err?.statusCode;

        if (statusCode === 404 || statusCode === 410) {
          await sb
            .from("admin_push_subscriptions")
            .update({
              is_active: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.id);
        }

        console.error("[admin-push] send error", {
          subscriptionId: sub.id,
          statusCode,
          message: err?.message,
        });
      }
    })
  );

  return {
    ok: true,
    sent,
    failed,
  };
}