# Partner MOVI — UI pubblica

## Riferimento e route

Il riferimento certificato è `docs/rebranding/references/partners/MOVI_PARTNERS_CERTIFIED_REFERENCE.png`. Definisce gerarchia, densità mobile, prominenza del vantaggio e direzione MOVI Dark; non autorizza il QR, i preferiti, una mappa incorporata o dati assenti dal modello.

Le route pubbliche sono:

- `/partner`, directory dei Partner pubblicamente validi;
- `/partner/[slug]`, dettaglio basato sullo slug autorevole esistente.

Entrambe riusano la shell pubblica corrente con `PublicHeader` e `PublicBottomNav`.

## Modello reale e visibilità

La UI usa esclusivamente `name`, `slug`, `category`, `short_description`, `full_description`, `benefit_title`, `benefit_description`, `conditions`, `logo_url`, `cover_url`, `website_url`, `contact_url`, `phone`, `address`, `locality`, `valid_from`, `valid_until`, `featured`, `sort_order` e `status`. Non esistono campi pubblici distinti per email, social o orari di apertura.

La RPC esistente `movi_partners_public_list` rimane l’unica sorgente pubblica. Espone soltanto righe `active`, non eliminate e comprese nella finestra inclusiva `valid_from`/`valid_until`. Bozze, inattivi, futuri, scaduti ed eliminati restituiscono 404 nel dettaglio e non compaiono nella directory.

## Directory e categorie

I filtri sono abilitati perché `category` è un campo reale con valori controllati. La directory mostra **Tutti** e soltanto le categorie effettivamente presenti nei risultati pubblici caricati. Ogni card è un unico link verso `/partner/[slug]` e presenta media reale o fallback, categoria, nome, descrizione breve e testi del vantaggio memorizzati.

## Dettaglio e vantaggio

Il dettaglio presenta copertina o logo reale, categoria, identità, descrizioni e un pannello prominente con `benefit_title`, `benefit_description` e `conditions` senza estrarre o inventare percentuali. L’istruzione è: “Mostra la tua tessera MOVI per usufruire del vantaggio.” Il personale verifica visivamente nome e validità della tessera.

Il dettaglio non contiene QR, barcode, NFC, membership code o azioni scanner. La semantica della tessera digitale e il flusso QR esistente restano separati e invariati.

## Contatti, mappa e funzioni omesse

Indirizzo, telefono, sito e link contatto compaiono solo quando presenti. L’indirizzo genera un collegamento HTTPS esterno a Google Maps Directions; non viene incorporata una mappa e non viene aggiunta alcuna dipendenza. Non esiste un modello preferiti, quindi il cuore è omesso. Non esiste una destinazione autorevole per candidarsi come Partner: il blocco “Diventa Partner” è omesso.

## Integrazioni

Il servizio Partner della Home collega ora `/partner`. Il catalogo CTA espone sia la destinazione statica **Partner** → `/partner`, sia **Partner specifico** → `/partner/[slug]`. Il selettore dinamico usa l’endpoint Admin esistente e filtra localmente con le stesse regole di visibilità pubblica; valori legacy o target successivamente non disponibili restano preservati finché l’operatore non li cambia.

## Responsive e accessibilità

La directory usa una colonna su mobile e due colonne da tablet/desktop. I filtri sono pulsanti con `aria-pressed`, scorribili senza overflow sui viewport stretti. Card, azioni contatto e ritorno hanno focus visibile e target di almeno 44 px. Il dettaglio limita larghezza e altezza dell’hero, conserva reflow e testo spezzabile, e non usa il colore come unica informazione.

Questa fase non cambia lifecycle Partner, proprietà media, vantaggi, autenticazione pubblica, membership, QR, API di scrittura, database o schema.
