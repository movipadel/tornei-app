# MOVI Home v2 — Phase 2

## Confine e architettura

La Home reale riusa il Public UI System Phase 1 e non introduce un secondo tema, una seconda navigazione o nuovi componenti di dominio. Admin, Staff, Auth e le pagine funzionali restano isolate e invariate. La route è `/`; `/dev/public-ui` resta lo showcase locale development-only.

L’ordine finale è congelato: header e saluto, MoviBack, Gioca/Allenati/Prenota, Tornei in evidenza, Succede in Padelleria, Monday League contestuale, I tuoi circuiti, È successo in Padelleria, Servizi rapidi, collegamenti social/esterni, collegamenti legali e bottom navigation persistente. La bottom navigation finale è Home / Tornei / QR / Le mie attività / Profilo; Circuiti resta raggiungibile dagli ingressi pubblici dedicati.

MoviBack, azioni primarie, tornei, Monday League e servizi sono statici. I soli carousel sono Succede, I tuoi circuiti ed È successo, per un massimo totale di tre. Tornei usa una colonna verticale responsive e conserva la finestra temporale e l’ordinamento approvati.

## Dati e visibilità

Il bootstrap avvia in parallelo le letture esistenti per tornei, impostazioni, utente, circuiti, MoviBack, comunicazioni, hero Monday League e i due feed Padelleria. Il refresh periodico conserva la frequenza precedente per i dati dinamici; impostazioni, identità e contenuti editoriali non vengono richiesti ogni 15 secondi. Non esistono dati demo nella Home.

- Il saluto usa il primo token non vuoto di `user.full_name`, altrimenti il neutro `Ciao.`.
- MoviBack mostra i punti solo per membership approvata; dati mancanti o non approvati producono `—`. Senza membership, Accedi a MoviBack porta al flusso esistente in `/moviback`; Premi e Storico sono disponibili solo quando le rispettive eligibility lo consentono, mentre La mia tessera apre la modale identificativa con stati onesti. Mostra QR richiama lo stesso modal della bottom navigation e può riusare il codice membership già letto.
- Gioca, Allenati e Prenota usano `/richieste/gioca`, `/richieste/allenati` e `/prenota`.
- Tornei usa `/api/tournaments`, conserva iscrizione, riserva, live, dialogo d’iscrizione, controllo genere, ricerca esatta per telefono e cancellazione.
- Succede usa `kind=succede`; È successo usa `kind=e_successo`. La separazione è quella del modello editoriale esistente, con pubblicazione e visibilità applicate dall’API.
- Circuiti usa `/api/circuits`. Il read model è generale: non espone partecipazione, posizione o prossima tappa personale. La Home non inventa questi dati e descrive l’elenco come circuiti MOVI disponibili.
- Monday League usa esclusivamente `/api/monday-league/hero`. La sezione appare solo con `visible=true`; risposta invisibile, errore o indisponibilità la nascondono senza bloccare la Home. L’endpoint applica già pubblicazione e visibilità e non espone stagioni nascoste.
- Comunicazioni e relative mutazioni continuano a usare gli endpoint esistenti.

## Stati e comportamento

Il caricamento iniziale mantiene spazio con skeleton. Il fallimento dei tornei, dato strutturale della composizione, mostra un errore Home con retry. MoviBack, circuiti e Padelleria hanno errori di sezione con retry; una lista editoriale vuota non produce heading o carousel vuoto. Monday League resta opzionale secondo il contratto dell’endpoint.

Il sentinel reale `public-sticky-sentinel` è collocato dopo MoviBack e le tre azioni primarie. L’header Phase 1 osserva il sentinel con `IntersectionObserver`; lo slot Home riceve il saluto reale e l’header compatto non lo ripete. Bottom nav e QR restano condivisi. L’apertura QR dalla Home conserva il controllo invocante e vi restituisce il focus alla chiusura.

La composizione usa gutter, max-width, safe area, target minimi, focus ciano, contrasto e riduzione movimento della Phase 1. Le griglie si adattano a 320px, 390px, tablet e desktop senza cambiare l’ordine del prodotto.

## Servizi, link e limiti noti

I servizi sono Le mie attività, Store MOVI, Partner e Contattaci. Tutte le destinazioni esistono; Partner apre la directory pubblica `/partner`.

Facebook e Instagram conservano gli URL della Home precedente; sito e YouTube usano gli URL approvati. La configurazione vive in `src/components/public/publicLinks.ts`. Privacy, Termini e Cookie conservano le route attuali.

Non sono stati aggiunti meteo, località, ranking personale, rapporto utente-circuito o rapporto utente-squadra Monday League. Le pagine pubbliche completate mantengono i propri contratti di dominio e riusano la shell MOVI condivisa.

## Visual correction pass 1

Il primo pass visivo usa `references/MOVI_HOME_V2_CERTIFIED.png` come riferimento di composizione. MoviBack integra titolo, saldo, stato, QR secondario e i tre shortcut in un’unica card personale ad alto valore. Le azioni primarie restano simultaneamente visibili e usano tre famiglie coerenti ma distinte: royal per Gioca, cyan/teal per Allenati e magenta/plum per Prenota. A 320px mantengono tre colonne con tipografia e spaziatura adattate, senza overflow.

I servizi rapidi non hanno più un titolo visibile e sono controlli compatti; Partner usa la directory pubblica implementata. Il footer non mostra più il titolo esterno: Facebook, Instagram, sito e YouTube sono quattro pulsanti circolari icon-only con nome accessibile, seguiti dai link legali. Il magenta/plum compare nella firma della card MoviBack, nella card Prenota, nei marker di sezione e nei controlli social.

Per i form pubblici, le opzioni dei `select` dichiarano esplicitamente superficie scura e testo chiaro, evitando combinazioni native a basso contrasto. Il pass non modifica read model, API, route, regole o ordine della Home.

## Visual and functional correction pass 2

Le card torneo mostrano `level` solo quando il valore arriva dal read model pubblico di `/api/tournaments`; non esiste un fallback inventato. La classificazione mantiene separati livello e combinazione categoria/tipo.

Le card di Succede e È successo aprono sempre il dettaglio pubblico canonico `/padelleria/[id]`; l’eventuale CTA editoriale viene resa e validata nel dettaglio. La Home non annida azioni CTA nelle card editoriali. Il sottotitolo ridondante della sezione circuiti è stato rimosso.

Gioca e Allenati condividono `PublicSelect`, basato sul componente Radix già installato. Trigger, lista portaled, opzioni, stato selezionato e focus dichiarano esplicitamente i token scuri Phase 1, così il menu non dipende dallo stile nativo del browser o da variabili Admin assenti. Chiavi, valori, callback di stato e payload POST verso `/api/user/requests` restano invariati.

## Regola finale Tornei in evidenza

La Home richiede `/api/tournaments?scope=home`. Lo scope applica, secondo il calendario `Europe/Rome`, l'intervallo inclusivo dal lunedì della settimana corrente alla domenica della settimana immediatamente successiva. La chiamata `/api/tournaments` senza scope, usata dalla pagina Tornei, conserva il catalogo futuro esistente. La Home filtra nuovamente lo stesso intervallo lato presentazione e rende tutti i risultati in ordine di data e ora, senza limite numerico, ranking o riempimenti da date successive.

I tornei Home sono disposti in un'unica colonna a ogni breakpoint. Ogni card è un unico blocco integrato con sfondo decorativo a tutta superficie, data bianca resa come UI, contenuti e CTA sovrapposti. A 320, 390 e 440 px contenuto e azione mantengono la composizione compatta; il solo fallback a una colonna interna è sotto 280 px. Il nome del circuito appare soltanto quando `circuit_id` trova la relazione pubblica esistente; i tornei standalone non ricevono indicatori sostitutivi. In assenza di risultati resta disponibile lo stato vuoto con collegamento alla pagina Tornei.

### Home tournament background system

La Home sceglie automaticamente lo sfondo tramite `getTournamentHomeBackground(type, category)`, senza upload, selettore Admin, chiamate Storage o campo per-torneo. Gli asset 1600×900 si trovano in `public/branding/tournament-backgrounds/`: `tournament-baraonda-maschile.png`, `tournament-baraonda-femminile.png`, `tournament-baraonda-misto.png`, `tournament-baraonda-open.png`, `tournament-coppie-maschile.png`, `tournament-coppie-femminile.png`, `tournament-coppie-misto.png`, `tournament-coppie-open.png` e `tournament-default.png`.

I tipi salvati `Baraonda` e `Coppie fisse` sono normalizzati rispettivamente in `baraonda` e `coppie`. Le categorie Admin `Maschile`, `Femminile`, `Misto` e `Libero` sono normalizzate in `maschile`, `femminile`, `misto` e `open`; anche il valore storico/conceptual `Open` usa la variante open. Ogni altro valore nullo, legacy o non riconosciuto usa `tournament-default.png`. Il circuito non entra nella selezione dello sfondo.

I tre concetti grafici restano indipendenti: `tournaments.image_url` continua a servire il catalogo Tornei; `/api/admin/tournaments/[id]/poster` continua a generare la locandina PNG 1080×1350 dai template in `public/posters`; la Home usa soltanto gli asset statici di sistema. Il pulsante Locandina e le relative azioni Admin restano invariati.
