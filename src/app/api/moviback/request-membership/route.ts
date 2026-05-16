import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromCookie } from "@/lib/userAuth";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendAdminPushNotification } from "@/lib/adminPush";

export const runtime = "nodejs";

const BUCKET = "medical-certificates";

function normalizeTaxCode(value: string) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function isValidMembershipType(value: string): value is "ASC" | "FITP" {
  return value === "ASC" || value === "FITP";
}

function isValidISODate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function safeFileName(name: string) {
  return String(name || "certificato")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 120);
}

function generateMembershipCode() {
  return `MOVI-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function POST(req: Request) {
  const uid = await getUserIdFromCookie();

  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const taxCode = normalizeTaxCode(String(form.get("tax_code") ?? ""));
  const membershipType = String(form.get("membership_type") ?? "");
  const expiryDate = String(form.get("expiry_date") ?? "");
  const file = form.get("certificate");

  const hasExistingMembership =
    String(form.get("has_existing_membership") ?? "false") === "true";

  const existingMembershipType = String(
    form.get("existing_membership_type") ?? ""
  );

  const existingMembershipNumber = String(
    form.get("existing_membership_number") ?? ""
  )
    .trim()
    .toUpperCase();

  if (!taxCode) {
    return NextResponse.json({ error: "Codice fiscale obbligatorio" }, { status: 400 });
  }

  if (taxCode.length < 11 || taxCode.length > 16) {
    return NextResponse.json({ error: "Codice fiscale non valido" }, { status: 400 });
  }

  if (!isValidMembershipType(membershipType)) {
    return NextResponse.json({ error: "Tipo tessera non valido" }, { status: 400 });
  }

  if (hasExistingMembership) {
    if (!isValidMembershipType(existingMembershipType)) {
      return NextResponse.json(
        { error: "Tipo tessera già posseduta non valido" },
        { status: 400 }
      );
    }

    if (existingMembershipType !== membershipType) {
      return NextResponse.json(
        { error: "Il tipo tessera dichiarato deve coincidere con la tessera selezionata" },
        { status: 400 }
      );
    }

    if (existingMembershipType === "FITP" && !existingMembershipNumber) {
      return NextResponse.json(
        { error: "Numero tessera FITP obbligatorio" },
        { status: 400 }
      );
    }
  }

  if (!isValidISODate(expiryDate)) {
    return NextResponse.json({ error: "Data scadenza certificato obbligatoria" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Certificato medico obbligatorio" }, { status: 400 });
  }

  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Formato certificato non valido. Usa PDF, JPG, PNG o WEBP." },
      { status: 400 }
    );
  }

  const maxSize = 8 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: "File troppo grande. Dimensione massima 8MB." },
      { status: 400 }
    );
  }

  const { data: existingMembership, error: existingErr } = await sb
    .from("loyalty_memberships")
    .select("id,status,membership_code,membership_type")
    .eq("user_id", uid)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (existingMembership && existingMembership.status !== "rejected") {
  return NextResponse.json(
    {
      error: "Richiesta MoviBack già presente",
      membership: existingMembership,
    },
    { status: 409 }
  );
}

  const { data: user, error: userErr } = await sb
    .from("users")
    .select("id")
    .eq("id", uid)
    .single();

  if (userErr || !user) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  const now = Date.now();
  const cleanName = safeFileName(file.name);
  const filePath = `${uid}/${now}-${cleanName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  if (existingMembership?.status === "rejected") {
  const feePoints = hasExistingMembership ? 0 : membershipType === "FITP" ? 15 : 0;
  const feePaid = hasExistingMembership || feePoints === 0;
  const nowIso = new Date().toISOString();

  const { data: membership, error: membershipErr } = await sb
    .from("loyalty_memberships")
    .update({
      status: "pending_review",
      tax_code: taxCode,
      membership_type: membershipType,
      fee_points: feePoints,
      fee_paid: feePaid,
      has_existing_membership: hasExistingMembership,
      existing_membership_type: hasExistingMembership
        ? existingMembershipType
        : null,
      existing_membership_number:
        hasExistingMembership && existingMembershipType === "FITP"
          ? existingMembershipNumber
          : null,
      rejection_reason: null,
      rejected_at: null,
      updated_at: nowIso,
    })
    .eq("id", existingMembership.id)
    .select(
      "id,user_id,status,membership_code,tax_code,membership_type,fee_points,fee_paid,has_existing_membership,existing_membership_type,existing_membership_number,created_at"
    )
    .single();

  if (membershipErr || !membership) {
    await sb.storage.from(BUCKET).remove([filePath]);

    return NextResponse.json(
      { error: membershipErr?.message ?? "Errore reinvio richiesta" },
      { status: 500 }
    );
  }

  const { data: certificate, error: certErr } = await sb
    .from("medical_certificates")
    .insert({
      user_id: uid,
      file_path: filePath,
      status: "pending_review",
      expiry_date: expiryDate,
    })
    .select("id,user_id,file_path,status,uploaded_at,expiry_date")
    .single();

  if (certErr) {
    await sb.storage.from(BUCKET).remove([filePath]);

    return NextResponse.json({ error: certErr.message }, { status: 500 });
  }

  try {
  await sendTelegramMessage(
    `🔁 REINVIO RICHIESTA MOVIBACK\n\n` +
      `👤 Utente ID: ${uid}\n` +
      `🎫 Tessera: ${membership.membership_type}\n` +
      `📄 Nuovo certificato caricato`
  );

  await sendAdminPushNotification({
    title: "🔁 Reinvio MoviBack",
    body: `Nuovo certificato caricato · ${membership.membership_type}`,
    url: "/admin/moviback/requests",
  });
} catch (e) {
  console.warn("MoviBack resubmit notify error (ignored):", e);
}


  return NextResponse.json({
    ok: true,
    membership,
    certificate,
  });
}

  const feePoints = hasExistingMembership ? 0 : membershipType === "FITP" ? 15 : 0;
  const feePaid = hasExistingMembership || feePoints === 0;

  let membershipCode = generateMembershipCode();
  let membership: any = null;
  let membershipErr: any = null;

  for (let i = 0; i < 3; i++) {
    membershipCode = generateMembershipCode();

    const res = await sb
      .from("loyalty_memberships")
      .insert({
        user_id: uid,
        status: "pending_review",
        membership_code: membershipCode,
        tax_code: taxCode,
        membership_type: membershipType,
        fee_points: feePoints,
        fee_paid: feePaid,
        has_existing_membership: hasExistingMembership,
        existing_membership_type: hasExistingMembership
          ? existingMembershipType
          : null,
        existing_membership_number:
          hasExistingMembership && existingMembershipType === "FITP"
            ? existingMembershipNumber
            : null,
      })
      .select(
        "id,user_id,status,membership_code,tax_code,membership_type,fee_points,fee_paid,has_existing_membership,existing_membership_type,existing_membership_number,created_at"
      )
      .single();

    membership = res.data;
    membershipErr = res.error;

    if (!membershipErr) break;

    const msg = String(membershipErr.message ?? "").toLowerCase();
    if (!msg.includes("duplicate") && !msg.includes("unique")) break;
  }

  if (membershipErr || !membership) {
    await sb.storage.from(BUCKET).remove([filePath]);

    return NextResponse.json(
      { error: membershipErr?.message ?? "Errore creazione tessera" },
      { status: 500 }
    );
  }

  const { data: certificate, error: certErr } = await sb
    .from("medical_certificates")
    .insert({
      user_id: uid,
      file_path: filePath,
      status: "pending_review",
      expiry_date: expiryDate,
    })
    .select("id,user_id,file_path,status,uploaded_at,expiry_date")
    .single();

  if (certErr) {
    await sb.storage.from(BUCKET).remove([filePath]);
    await sb.from("loyalty_memberships").delete().eq("id", membership.id);

    return NextResponse.json({ error: certErr.message }, { status: 500 });
  }

  try {
  await sendTelegramMessage(
    `🎁 NUOVA RICHIESTA MOVIBACK\n\n` +
      `👤 Utente ID: ${uid}\n` +
      `🎫 Tessera: ${membership.membership_type}\n` +
      `📄 Certificato caricato\n` +
      `📅 Scadenza: ${expiryDate}`
  );

  await sendAdminPushNotification({
    title: "🎁 Nuova richiesta MoviBack",
    body: `Tessera ${membership.membership_type} · certificato caricato`,
    url: "/admin/moviback/requests",
  });
} catch (e) {
  console.warn("MoviBack request notify error (ignored):", e);
}

  return NextResponse.json({
    ok: true,
    membership,
    certificate,
  });
}