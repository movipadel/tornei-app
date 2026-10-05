"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { PublicModal } from "./PublicModal";
import { publicStyles } from "./PublicPrimitives";
import styles from "./MembershipCardModal.module.css";

export type MembershipCardUser = {
  full_name?: string | null;
};

export type MembershipCardMembership = {
  status: "pending_review" | "approved" | "rejected" | "suspended";
  membership_code?: string | null;
};

export type MembershipCardEligibility = {
  can_use_card: boolean;
  human_message?: string | null;
};

type MembershipCardModalProps = {
  user: MembershipCardUser | null;
  membership: MembershipCardMembership | null;
  eligibility: MembershipCardEligibility | null;
  trigger: React.ReactNode;
};

function unavailableCopy(
  user: MembershipCardUser | null,
  membership: MembershipCardMembership | null,
  eligibility: MembershipCardEligibility | null,
) {
  if (!user) return { title: "Accesso richiesto", message: "Accedi per visualizzare la tua tessera MOVI." };
  if (!membership) return { title: "Tessera non disponibile", message: eligibility?.human_message || "Membership MoviBack non presente." };
  if (membership.status === "pending_review") return { title: "Tessera in revisione", message: eligibility?.human_message || "La richiesta MoviBack è in revisione." };
  if (membership.status === "rejected") return { title: "Tessera non approvata", message: eligibility?.human_message || "La membership MoviBack non è attiva." };
  if (membership.status === "suspended") return { title: "Tessera sospesa", message: eligibility?.human_message || "La membership MoviBack è sospesa." };
  return { title: "Tessera non utilizzabile", message: eligibility?.human_message || "La tessera MOVI non è al momento utilizzabile." };
}

export function MembershipCardModal({ user, membership, eligibility, trigger }: MembershipCardModalProps) {
  const fullName = user?.full_name?.trim() || "";
  const membershipCode = membership?.membership_code?.trim() || "";
  const isActive = membership?.status === "approved" && eligibility?.can_use_card === true;
  const unavailable = unavailableCopy(user, membership, eligibility);

  return (
    <PublicModal
      trigger={trigger}
      title="La mia tessera"
      description="Mostrala nei club MOVI e presso i partner aderenti"
      contentClassName={styles.modal}
    >
      {isActive ? (
        <section className={styles.card} aria-label="Tessera MOVI attiva">
          <div className={styles.glow} aria-hidden />
          <Image
            className={styles.brandMark}
            src="/branding/movi-monviso.png"
            alt=""
            aria-hidden="true"
            width={1200}
            height={1200}
            sizes="(max-width: 520px) 240px, 340px"
          />
          <div className={styles.brandRow}>
            <Image
              className={styles.logo}
              src="/branding/movi-padelleria.png"
              alt="Padelleria MOVI"
              width={260}
              height={48}
            />
            <span className={styles.membershipLabel}>Tessera MOVI</span>
          </div>

          <div className={styles.identity}>
            {fullName ? <strong className={styles.name}>{fullName}</strong> : <span className={styles.missingName}>Nome non disponibile</span>}
            {membershipCode ? (
              <div className={styles.codeBlock}>
                <span>Identificativo tessera</span>
                <b>{membershipCode}</b>
              </div>
            ) : null}
          </div>

          <div className={styles.cardFooter}>
            <span className={styles.activeStatus}><span aria-hidden />Attiva</span>
            <span className={styles.payoff}>Qualcosa trovi.<i aria-hidden /></span>
          </div>
        </section>
      ) : (
        <section className={styles.unavailable} role="status">
          <span className={styles.unavailableMark} aria-hidden />
          <h3>{unavailable.title}</h3>
          <p>{unavailable.message}</p>
        </section>
      )}

      <div className={styles.actions}>
        <Dialog.Close asChild>
          <button type="button" className={`${publicStyles.button} ${publicStyles.secondary}`}>Chiudi</button>
        </Dialog.Close>
      </div>
    </PublicModal>
  );
}
