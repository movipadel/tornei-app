import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function money(value: any) {
  return Number(value || 0).toFixed(2);
}

export async function sendStoreOrderEmail({
  order,
  items,
}: {
  order: any;
  items: any[];
}) {
  const to = process.env.STORE_ORDERS_EMAIL;

  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY mancante");
  }

  if (!to) {
    throw new Error("STORE_ORDERS_EMAIL mancante");
  }

  const itemsHtml = items
    .map(
      (i) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">
            <strong>${i.product_name}</strong>
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">
            ${i.color_name || "-"}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">
            ${i.size_label || "-"}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">
            ${i.quantity}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">
            €${money(i.total_euro)}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">
            ${Number(i.total_points || 0)} pt
          </td>
        </tr>
      `
    )
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px;color:#0f172a;">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#020617;color:#ffffff;padding:22px;">
          <h1 style="margin:0;font-size:24px;">Nuovo ordine Store MOVI</h1>
          <p style="margin:8px 0 0;color:#cbd5e1;">
            Ordine ricevuto e in attesa di gestione.
          </p>
        </div>

        <div style="padding:22px;">
          <h2 style="font-size:18px;margin:0 0 12px;">Cliente</h2>

          <div style="background:#f1f5f9;border-radius:14px;padding:14px;margin-bottom:18px;">
            <p style="margin:0 0 6px;"><strong>Nome:</strong> ${order.customer_name || "-"}</p>
            <p style="margin:0 0 6px;"><strong>Telefono:</strong> ${order.customer_phone || "-"}</p>
            <p style="margin:0;"><strong>Email:</strong> ${order.customer_email || "-"}</p>
          </div>

          <h2 style="font-size:18px;margin:0 0 12px;">Dettagli ordine</h2>

          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin-bottom:18px;">
            <p style="margin:0 0 6px;"><strong>ID ordine:</strong> ${order.id}</p>
            <p style="margin:0 0 6px;"><strong>Club ritiro:</strong> ${order.pickup_club}</p>
            <p style="margin:0 0 6px;"><strong>Pagamento:</strong> ${order.payment_mode}</p>
            <p style="margin:0 0 6px;"><strong>Totale euro:</strong> €${money(order.total_euro)}</p>
            <p style="margin:0;"><strong>Punti usati:</strong> ${Number(order.total_points || 0)} pt</p>
          </div>

          ${
            order.notes
              ? `
                <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:14px;margin-bottom:18px;">
                  <strong>Note cliente:</strong><br/>
                  ${order.notes}
                </div>
              `
              : ""
          }

          <h2 style="font-size:18px;margin:0 0 12px;">Prodotti</h2>

          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="padding:9px 8px;text-align:left;">Prodotto</th>
                <th style="padding:9px 8px;text-align:left;">Colore</th>
                <th style="padding:9px 8px;text-align:left;">Taglia</th>
                <th style="padding:9px 8px;text-align:center;">Qtà</th>
                <th style="padding:9px 8px;text-align:right;">€</th>
                <th style="padding:9px 8px;text-align:right;">Punti</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <p style="margin:22px 0 0;color:#64748b;font-size:12px;">
            Ordine generato automaticamente da Store MOVI.
          </p>
        </div>
      </div>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from: "MOVI Store <onboarding@resend.dev>",
    to,
    subject: `Nuovo ordine Store MOVI - ${order.customer_name || "Cliente"}`,
    html,
  });

  if (error) {
    console.error("RESEND ERROR:", error);
    throw new Error(error.message || "Errore invio Resend");
  }

  return data;
}