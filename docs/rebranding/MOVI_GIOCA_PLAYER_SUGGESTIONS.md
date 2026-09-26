# MOVI Gioca: suggerimenti giocatori

## Architettura

Stage 6B usa un solo motore con due punti di ingresso. La ricerca libera del Customer Hub invia criteri validati a `POST /api/admin/players/match`; il dettaglio di una richiesta Gioca usa `POST /api/admin/requests/[id]/player-suggestions`. Entrambi terminano in `findPlayerMatches` e quindi in `rankPlayerMatches` di `src/lib/playerMatching.ts`. Soglia 50/100, limite 20, ordinamento, esclusioni e spiegazioni restano centralizzati.

Il percorso contestuale è:

`movi_requests` → `giocaRequestToMatchingCriteria` → `findPlayerMatches` → DTO sportivo condiviso → pannello Admin.

Non esiste una seconda tabella di punteggi e non viene salvata alcuna lista candidati.

## Mappatura della richiesta

- **Club:** un club diventa un insieme di un elemento. Con più club, ogni candidato riceve la migliore compatibilità valida e il risultato indica il club determinante; un’incompatibilità esplicita esclude solo quando nessun club richiesto è valido. Array vuoto significa club indifferente, con peso `0/0` e senza esclusioni.
- **Livello:** `principiante`, `intermedio` e `avanzato` restano descrittivi. `unknown` diventa criterio assente `0/0`; non viene prodotto un livello MOVI numerico.
- **Data:** si usa soltanto `requested_date`, già risolta e persistita come `YYYY-MM-DD`. Il giorno ISO (lunedì `1`, domenica `7`) è calcolato a mezzogiorno UTC per conservare il giorno di calendario. Data nulla/flexible significa giorno non definito `0/0`.
- **Fascia:** `morning`, `lunch`, `afternoon`, `evening` sono criteri espliciti. `any` significa nessun requisito di fascia `0/0`. Il testo libero dell’orario non entra nel punteggio.
- **Tipo partita:** `male`, `female`, `mixed` restano criteri espliciti. `any` significa nessun requisito `0/0` e non esclude alcuna preferenza del candidato.
- **Last minute:** il modello Gioca non contiene un campo urgenza. Stage 6B passa sempre `false`; una richiesta per oggi non viene interpretata come urgente.
- **Compagno:** `has_partner` resta contesto operativo e non modifica il punteggio. Stage 6B non deduce automaticamente un numero di persone da trovare.

La normalizzazione divide il punteggio per la somma dei soli massimi dei criteri disponibili. Per la ricerca manuale, che fornisce tutti i criteri, il denominatore e i risultati restano quelli certificati in Stage 6.

## Identità e privacy

Il richiedente viene escluso solo quando esiste una `player_identities` attiva collegata tramite `account_user_id`. Se questo collegamento certificato manca, il sistema non tenta corrispondenze per nome o telefono e lo dichiara nel riepilogo.

L’endpoint è Admin-only, verifica same-origin e restituisce il DTO sportivo di Stage 6. Non espone codice fiscale, certificati, MoviBack, premi, note interne o dettagli Auth. I casi identità aperti producono l’avviso “Identità da verificare” senza esclusione automatica.

## Stati e azioni

Il comando “Suggerisci giocatori” è visibile solo per richieste Gioca in stato `received`, `searching` o `found`. Non è disponibile per Allenati, `completed` o `cancelled`. La ricerca non cambia lo stato, non aggiorna la richiesta, non contatta nessuno e non associa candidati. L’unica azione su un risultato è “Apri giocatore”.

Il pannello collega `/admin/players?mode=matching`; il parametro `mode` usa una allow-list e apre la modalità manuale senza persistere dati. I criteri non sono trasferiti perché la UI manuale certificata richiede un solo club e un livello numerico, mentre una richiesta può avere club multipli e criteri assenti.

## Verifica locale

Il runner `scripts/padelleria-local.mjs` blocca progetti collegati, accetta solo Supabase API `http://127.0.0.1:55021`, DB `127.0.0.1:55022`, Studio `http://127.0.0.1:55023` e ignora `.env.local`.

```powershell
node scripts/padelleria-local.mjs gioca-suggestions-fixtures
node scripts/padelleria-local.mjs dev
node scripts/padelleria-local.mjs gioca-suggestions-api-test
```

- Login Admin: `http://localhost:3100/admin/login`
- Coda richieste: `http://localhost:3100/admin/requests`
- Fixture A: `http://localhost:3100/admin/requests/c8603000-0000-4000-8000-000000000001`
- Customer Hub manuale: `http://localhost:3100/admin/players?mode=matching`

Le fixture A–G coprono ricerca Manta, Costigliole, più club accettabili, club/data flessibili, tipo partita indifferente, esclusione del richiedente e un risultato vuoto. L’accettazione confronta A e B con lo stesso endpoint manuale e richiede identici candidati, punteggi, ordine e spiegazioni dopo la sola rimozione del richiedente; usa inoltre la fixture Gioca annullata di Stage 3 per il blocco dello stato terminale.
