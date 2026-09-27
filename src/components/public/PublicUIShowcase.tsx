"use client";

import { Bell, Check, UserRound } from "lucide-react";
import { useState } from "react";
import { MediaFrame, PublicButton, PublicCard, PublicCarousel, PublicField, PublicState, StatusBadge, publicStyles as styles } from "./PublicPrimitives";
import { PublicModal } from "./PublicModal";

export default function PublicUIShowcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  return <main className={styles.showcase}>
    <header className={styles.showcaseHero}>
      <span className={styles.eyebrow}>Public UI · anteprima locale</span>
      <h1>Il sistema visivo MOVI, prima della nuova Home.</h1>
      <p className={styles.lead}>Una superficie di accettazione per verificare identità, gerarchia, densità e comportamento responsive. Tutti i contenuti di questa pagina sono dimostrativi.</p>
    </header>

    <ShowcaseSection title="Branding e header">
      <div className={styles.grid}>
        <PublicCard><MediaFrame src="/branding/movi-padelleria.png" alt="Logo MOVI Padelleria" ratio="landscape" fit="contain" /><h3>Brand principale</h3><p className={styles.meta}>Usato nello stato espanso.</p></PublicCard>
        <PublicCard><MediaFrame src="/branding/movi-monviso.png" alt="Logo compatto MOVI Monviso" ratio="square" fit="contain" /><h3>Brand compatto</h3><p className={styles.meta}>Usato nell’header sticky.</p></PublicCard>
      </div>
      <div className={`${styles.demoHeader} ${styles.stack}`}>
        <div className={styles.headerRow}><img src="/branding/movi-padelleria.png" alt="MOVI Padelleria" className={styles.brandFull} /><div className={styles.headerActions}><button className={styles.iconButton} aria-label="Notifiche demo"><Bell size={20} /></button><button className={styles.iconButton} aria-label="Profilo demo"><UserRound size={20} /></button></div></div>
        <div><span className={styles.eyebrow}>Slot Home opzionale</span><h2>Ciao Martina.<br />Che facciamo oggi?</h2></div>
      </div>
      <div className={styles.demoHeader}><div className={styles.headerRow}><img src="/branding/movi-monviso.png" alt="MOVI" className={styles.brandCompact} /><span className={styles.meta}>Esempio header compatto attivato dal sentinel</span><div className={styles.headerActions}><button className={styles.iconButton} aria-label="Notifiche demo"><Bell size={20} /></button><button className={styles.iconButton} aria-label="Profilo demo"><UserRound size={20} /></button></div></div></div>
    </ShowcaseSection>

    <ShowcaseSection title="Tipografia">
      <PublicCard><div className={styles.stack}><h1 className={styles.h1}>Titolo H1</h1><h2 className={styles.h2}>Titolo H2</h2><h3 className={styles.h3}>Titolo H3</h3><p className={styles.body}>Testo corpo Inter 16px per contenuti leggibili.</p><span className={styles.meta}>Meta e label · 14px</span><span className={styles.micro}>Microcopy · 12px / 500</span><strong className={styles.numeric}>1.280</strong></div></PublicCard>
    </ShowcaseSection>

    <ShowcaseSection title="Pulsanti e stati">
      <div className={styles.inline}><PublicButton>Primary</PublicButton><PublicButton variant="secondary">Secondary</PublicButton><PublicButton variant="tertiary">Tertiary</PublicButton><PublicButton variant="danger">Danger</PublicButton><PublicButton disabled>Disabled</PublicButton><PublicButton loading>Invia</PublicButton></div>
      <p className={styles.micro}>Usa Tab per verificare il focus ciano visibile.</p>
    </ShowcaseSection>

    <ShowcaseSection title="Card">
      <div className={styles.grid}>
        <PublicCard><StatusBadge tone="info">Standard</StatusBadge><h3>La tua prossima attività</h3><p className={styles.meta}>Contenuto ordinario su surface/1.</p></PublicCard>
        <PublicCard family="highlight"><StatusBadge tone="success">MoviBack</StatusBadge><strong className={styles.numeric}>860</strong><p className={styles.meta}>punti disponibili</p></PublicCard>
        <PublicCard family="compact"><span className={styles.eyebrow}>Sab 3 ottobre · 18:30</span><h3>Torneo serale</h3><p className={styles.meta}>Intermedio · Misto · Padelleria</p></PublicCard>
        <PublicCard family="editorial"><MediaFrame src="/branding/movi-padelleria.png" alt="Brand MOVI Padelleria" fit="contain" overlay /><div className={styles.editorialBody}><span className={styles.eyebrow}>Succede in Padelleria</span><h3>Una serata di community</h3><p className={styles.meta}>Esempio editoriale locale.</p></div></PublicCard>
      </div>
    </ShowcaseSection>

    <ShowcaseSection title="MediaFrame">
      <div className={styles.grid}><MediaFrame src="/branding/movi-padelleria.png" alt="MOVI Padelleria in formato landscape" fit="contain" /><MediaFrame src="/branding/movi-monviso.png" alt="MOVI Monviso in formato quadrato" ratio="square" fit="contain" /><MediaFrame alt="Fallback media" /><MediaFrame alt="Media in caricamento" loading /></div>
    </ShowcaseSection>

    <ShowcaseSection title="Badge">
      <div className={styles.inline}><StatusBadge tone="success">Confermato</StatusBadge><StatusBadge tone="warning">In attesa</StatusBadge><StatusBadge tone="error">Richiede attenzione</StatusBadge><StatusBadge tone="info">In evidenza</StatusBadge><StatusBadge>Non disponibile</StatusBadge></div>
    </ShowcaseSection>

    <ShowcaseSection title="Form">
      <form className={styles.stack} onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }} noValidate>
        <div className={styles.errorSummary} role="alert"><strong>Controlla i campi indicati.</strong><div className={styles.meta}>L’errore resta visibile vicino al campo.</div></div>
        <div className={styles.grid}>
          <PublicField label="Nome e cognome"><input className={styles.control} placeholder="Es. Martina Rossi" autoComplete="name" /></PublicField>
          <PublicField label="Livello"><select className={styles.control} defaultValue=""><option value="" disabled>Seleziona il livello</option><option>Principiante</option><option>Intermedio</option><option>Avanzato</option></select></PublicField>
          <PublicField label="Telefono" error="Inserisci un numero valido."><input className={`${styles.control} ${styles.controlError}`} placeholder="Es. 333 1234567" inputMode="tel" aria-invalid="true" /></PublicField>
          <PublicField label="Preferenza" optional><input className={styles.control} placeholder="Es. fascia serale" /></PublicField>
        </div>
        <PublicField label="Note" optional><textarea className={styles.control} placeholder="Aggiungi solo informazioni utili" /></PublicField>
        <div><PublicButton type="submit">Invia richiesta demo</PublicButton></div>
        {submitted ? <PublicState kind="success" title="Richiesta inviata. Ci pensiamo noi." message="Conferma dimostrativa persistente." /> : null}
      </form>
    </ShowcaseSection>

    <ShowcaseSection title="Carousel">
      <PublicCarousel label="Esempi editoriali">
        {["Succede oggi", "Circuiti MOVI", "Dalla community", "Prossimo evento"].map((title, index) => <PublicCard family="compact" key={title}><span className={styles.eyebrow}>0{index + 1}</span><h3>{title}</h3><p className={styles.meta}>Card completa con anteprima della successiva. Swipe nativo, nessun autoplay.</p></PublicCard>)}
      </PublicCarousel>
    </ShowcaseSection>

    <ShowcaseSection title="Modal">
      <PublicButton onClick={() => setModalOpen(true)}>Apri modal demo</PublicButton>
      <PublicModal open={modalOpen} onOpenChange={setModalOpen} title="Dettaglio rapido" description="Focus intrappolato, Escape e ritorno al controllo di apertura sono gestiti da Radix."><div className={styles.stack}><PublicCard family="highlight"><h3>Spazio sicuro</h3><p className={styles.meta}>Altezza basata su 100dvh, scroll interno e safe area.</p></PublicCard><PublicButton onClick={() => setModalOpen(false)}>Ho capito</PublicButton></div></PublicModal>
    </ShowcaseSection>

    <ShowcaseSection title="Stati condivisi">
      <div className={styles.grid}><PublicState kind="loading" title="Caricamento" message="La struttura resta stabile." /><PublicState kind="empty" title="Nessuna attività" message="Le nuove attività compariranno qui." action={<PublicButton variant="tertiary">Scopri i servizi</PublicButton>} /><PublicState kind="error" title="Impossibile caricare" message="Controlla la connessione e riprova." action={<PublicButton variant="secondary">Riprova</PublicButton>} /><PublicState kind="success" title="Operazione completata" message="La conferma resta disponibile." /><PublicState kind="warning" title="Serve un controllo" message="Lo stato è spiegato anche con testo." /></div>
      <div className={`${styles.card} ${styles.stack}`} aria-label="Skeleton dimostrativo"><div className={styles.skeleton} style={{ height: 160 }} /><div className={styles.skeleton} style={{ height: 22, width: "65%" }} /><div className={styles.skeleton} style={{ height: 16, width: "88%" }} /></div>
    </ShowcaseSection>

    <ShowcaseSection title="Bottom navigation e QR">
      <PublicCard family="highlight"><Check size={22} className={styles.success} aria-hidden /><h3>Persistente e safe-area aware</h3><p className={styles.meta}>La barra reale è visibile in fondo alla viewport. Il pulsante QR centrale apre una demo locale senza chiamare API o usare dati reali.</p></PublicCard>
    </ShowcaseSection>
  </main>;
}

function ShowcaseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={`${styles.section} ${styles.stack}`}><div className={styles.sectionHead}><div className={styles.sectionTitle}><h2>{title}</h2></div></div>{children}</section>;
}
