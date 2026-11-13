/* eslint-disable @next/next/no-img-element -- Partner logos are short-lived signed storage URLs. */
import { ArrowLeft, ExternalLink, Facebook, Globe2, Instagram, MapPin, Phone, Tags, WalletCards } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MediaFrame } from "@/components/public/PublicPrimitives";
import { publicPartnerBySlug } from "@/lib/partnersServer";
import { callablePhone, contactCtaLabel, whatsappPhone } from "@/lib/partners";
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
  const locations = partner.locations.length ? partner.locations : (partner.address || partner.locality || partner.phone ? [{slot:1 as const,label:'',address:partner.address,locality:partner.locality,landline_phone:'',mobile_phone:'',mobile_action:'call' as const}] : []);
  const website = safeHttps(partner.website_url);
  const contact = safeHttps(partner.contact_url);
  const instagram = safeHttps(partner.instagram_url);
  const facebook = safeHttps(partner.facebook_url);
  const contactLabel = contactCtaLabel(contact, partner.contact_label);

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

      {locations.length ? <section className={styles.contacts} aria-labelledby="partner-locations-title"><h2 id="partner-locations-title">Sedi e contatti</h2>{locations.map((location)=>{
        const address=[location.address,location.locality].filter(Boolean).join(', ');
        const directions=address?`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`:null;
        const landline=callablePhone(location.landline_phone,'landline');
        const mobile=callablePhone(location.mobile_phone,'mobile');
        const whatsapp=location.mobile_action==='whatsapp'?whatsappPhone(location.mobile_phone):null;
        const legacyPhone=location.slot===1&&!location.landline_phone&&!location.mobile_phone?partner.phone:'';
        const legacyCall=callablePhone(legacyPhone,'legacy');
        return <div className={styles.contactList} key={location.slot}>
          <h3 className={styles.locationTitle}>{location.label||location.locality||`Sede ${location.slot}`}</h3>
          {address?<div className={styles.contactRow}><MapPin size={21} aria-hidden/><span>{address}</span>{directions?<a href={directions} target="_blank" rel="noopener noreferrer">Indicazioni<ExternalLink size={15} aria-hidden/></a>:null}</div>:null}
          {location.landline_phone?<div className={styles.contactRow}><Phone size={21} aria-hidden/><span>{location.landline_phone}</span>{landline?<a href={`tel:${landline}`}>Chiama</a>:null}</div>:null}
          {location.mobile_phone?<div className={styles.contactRow}><Phone size={21} aria-hidden/><span>{location.mobile_phone}</span>{whatsapp?<a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>:mobile?<a href={`tel:${mobile}`}>Chiama</a>:null}</div>:null}
          {legacyPhone?<div className={styles.contactRow}><Phone size={21} aria-hidden/><span>{legacyPhone}</span>{legacyCall?<a href={`tel:${legacyCall}`}>Chiama</a>:null}</div>:null}
        </div>;
      })}</section>:null}
      {website || contact || instagram || facebook ? <section className={styles.contacts} aria-labelledby="partner-contacts-title">
        <h2 id="partner-contacts-title">Informazioni e contatti</h2>
        <div className={styles.contactList}>
          {website ? <div className={styles.contactRow}><Globe2 size={21} aria-hidden /><span>{new URL(website).hostname.replace(/^www\./, "")}</span><a href={website} target="_blank" rel="noopener noreferrer">Visita il sito<ExternalLink size={15} aria-hidden /></a></div> : null}
          {contact ? <div className={styles.contactRow}><ExternalLink size={21} aria-hidden /><span>Contatto online</span><a href={contact} target="_blank" rel="noopener noreferrer">{contactLabel}<ExternalLink size={15} aria-hidden /></a></div> : null}
          {instagram ? <div className={styles.contactRow}><Instagram size={21} aria-hidden /><span>Instagram</span><a href={instagram} target="_blank" rel="noopener noreferrer">Apri Instagram<ExternalLink size={15} aria-hidden /></a></div> : null}
          {facebook ? <div className={styles.contactRow}><Facebook size={21} aria-hidden /><span>Facebook</span><a href={facebook} target="_blank" rel="noopener noreferrer">Apri Facebook<ExternalLink size={15} aria-hidden /></a></div> : null}
        </div>
      </section> : null}
    </article>
  </main>;
}
