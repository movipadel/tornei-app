/* eslint-disable @next/next/no-img-element -- Partner logos are short-lived signed storage URLs. */
import { ArrowLeft, ExternalLink, Globe2, MapPin, Phone, Tags, WalletCards } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MediaFrame } from "@/components/public/PublicPrimitives";
import { publicPartnerBySlug } from "@/lib/partnersServer";
import styles from "./PartnerDetail.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeHttps(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

export default async function PartnerDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const partner = await publicPartnerBySlug(slug);
  if (!partner) notFound();

  const heroImage = partner.cover_url ?? partner.logo_url ?? undefined;
  const address = [partner.address, partner.locality].filter(Boolean).join(", ");
  const directions = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : null;
  const phone = partner.phone.replace(/[^+0-9]/g, "");
  const website = safeHttps(partner.website_url);
  const contact = safeHttps(partner.contact_url);

  return <main className={styles.page}>
    <article className={styles.article} aria-labelledby="partner-detail-title">
      <Link className={styles.back} href="/partner"><ArrowLeft size={18} aria-hidden />Tutti i Partner</Link>

      <div className={`${styles.heroMedia} ${!partner.cover_url ? styles.logoHero : ""}`}>
        <MediaFrame src={heroImage} alt={heroImage ? partner.name : ""} fit={partner.cover_url ? "cover" : "contain"} />
      </div>

      <header className={styles.header}>
        <span className={styles.category}><Tags size={14} aria-hidden />{partner.category}</span>
        <div className={styles.identity}>
          <div><h1 id="partner-detail-title">{partner.name}</h1>{partner.short_description ? <p className={styles.subtitle}>{partner.short_description}</p> : null}</div>
          {partner.logo_url && partner.cover_url ? <img className={styles.logo} src={partner.logo_url} alt={`Logo ${partner.name}`} /> : null}
        </div>
      </header>

      {partner.full_description ? <div className={styles.description}>{partner.full_description}</div> : null}

      <section className={styles.benefitPanel} aria-labelledby="partner-benefit-title">
        <span className={styles.benefitIcon} aria-hidden><WalletCards size={24} /></span>
        <div><p className={styles.benefitEyebrow}>Vantaggio per i membri MOVI</p><h2 id="partner-benefit-title">{partner.benefit_title}</h2>{partner.benefit_description ? <p>{partner.benefit_description}</p> : null}{partner.conditions ? <div className={styles.conditions}><strong>Condizioni</strong><span>{partner.conditions}</span></div> : null}</div>
      </section>

      <div className={styles.membershipInstruction}><WalletCards size={23} aria-hidden /><p>Mostra la tua tessera MOVI per usufruire del vantaggio.</p></div>

      {address || phone || website || contact ? <section className={styles.contacts} aria-labelledby="partner-contacts-title">
        <h2 id="partner-contacts-title">Informazioni e contatti</h2>
        <div className={styles.contactList}>
          {address ? <div className={styles.contactRow}><MapPin size={21} aria-hidden /><span>{address}</span>{directions ? <a href={directions} target="_blank" rel="noopener noreferrer">Indicazioni<ExternalLink size={15} aria-hidden /></a> : null}</div> : null}
          {phone ? <div className={styles.contactRow}><Phone size={21} aria-hidden /><span>{partner.phone}</span><a href={`tel:${phone}`}>Chiama</a></div> : null}
          {website ? <div className={styles.contactRow}><Globe2 size={21} aria-hidden /><span>{new URL(website).hostname.replace(/^www\./, "")}</span><a href={website} target="_blank" rel="noopener noreferrer">Visita il sito<ExternalLink size={15} aria-hidden /></a></div> : null}
          {contact ? <div className={styles.contactRow}><ExternalLink size={21} aria-hidden /><span>Contatto online</span><a href={contact} target="_blank" rel="noopener noreferrer">Contatta<ExternalLink size={15} aria-hidden /></a></div> : null}
        </div>
      </section> : null}
    </article>
  </main>;
}
