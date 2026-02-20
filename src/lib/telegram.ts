// src/lib/telegram.ts
export async function sendTelegramMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Telegram env missing: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID");
    return { ok: false, skipped: true };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.ok) {
    console.warn("Telegram sendMessage failed:", json);
    return { ok: false, error: json };
  }

  return { ok: true };
}