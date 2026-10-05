# MOVI Profile Public UI

## Ambito

La pagina pubblica `/profilo` usa l'identità autenticata restituita da `getCurrentMoviUser`. Il client legge e aggiorna il profilo tramite `/api/user/profile`; l'API risolve l'identità giocatore canonica, applica la validazione condivisa e mantiene il controllo di versione `expected_version`. I dati personali dell'account restano in sola lettura. Le preferenze modificabili e la valutazione MOVI continuano a usare i read model e le RPC esistenti.

## Correzione UTF-8

Il problema era nei literal TypeScript/JSX già salvati come mojibake, per esempio `identitÃ `, `DisponibilitÃ `, `Ã¨`, `Â·` e `unâ€™altra`. Non risultava causato dal browser, dal font o dallo schema dati. I literal autorevoli della pagina, del componente campi, dell'API e della validazione sono stati riscritti direttamente in UTF-8. Non esistono sostituzioni a runtime.

Il font pubblico resta quello approvato: Inter locale con fallback di sistema. Inter include i caratteri latini italiani standard, quindi non è stato aggiunto alcun font.

## Struttura e stile

La pagina conserva gli stessi campi e li presenta in tre gruppi:

- **Dati personali**: nome, telefono, email e genere in sola lettura.
- **Preferenze di gioco**: livello dichiarato, club, tipi di partita, disponibilità settimanale e ultimo minuto.
- **Valutazione MOVI**: livello verificato dallo staff.

Il profilo eredita `PublicHeader` e `PublicBottomNav` dal `PublicShell`. Le superfici, i bordi, i controlli, gli stati e le azioni usano i token del sistema MOVI Dark. La variante pubblica del componente condiviso è esplicita; l'aspetto predefinito usato in Admin non cambia.

## Responsive e accessibilità

Il contenuto usa una larghezza massima contenuta e passa a una colonna sui telefoni. La matrice delle disponibilità riduce le colonne senza scorrimento orizzontale a 320, 390 e 440 px. I controlli hanno target di almeno 44 px, focus visibile, label reali, fieldset/legend semantici e colori accompagnati da testo. Errori e conferme mantengono rispettivamente `role="alert"` e `role="status"`. Il layout rifluisce anche all'equivalente di zoom 200%.

## Invarianti

Autenticazione pubblica, ownership del profilo, risoluzione dell'identità, validazione, salvataggio, collegamento staff/operator e schema database non sono stati modificati.

## Lato di gioco preferito

Nel gruppo “Preferenze di gioco” il profilo espone `preferred_side` come scelta singola Destra, Sinistra o Indifferente. Il campo resta facoltativo: “Non indicato” salva NULL, distinto dall’esplicito “Indifferente”. Lo stesso componente condiviso rende il campo nell’editor Admin senza modificare il calcolo di completezza /5.

La preferenza può inizializzare una nuova richiesta, ma non modifica richieste già inviate.
