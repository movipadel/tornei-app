# MoviBack Corporate Conventions — C4 self-service

C4 consente a un utente MOVI già associato a una sola membership MoviBack `approved` di attivare una convenzione dalla pagina `/moviback`. Il codice non viene richiesto durante una nuova iscrizione: il flusso per nuovi utenti resta rinviato a C5.

## Flusso e sicurezza

L’endpoint autenticato `POST /api/moviback/agreements/activate` risolve l’utente canonico sul server. Il client invia soltanto il codice; non può indicare utente, membership, convenzione o entitlement. La normalizzazione e l’hash SHA-256 riusano esattamente l’helper C3. Il testo del codice non viene salvato né restituito.

La RPC service-only `claim_moviback_agreement_code` esegue in una transazione:

1. verifica dell’utente canonico attivo e dell’unica membership `approved`;
2. lock della membership e del codice;
3. verifica di stato e intervalli temporali di codice e convenzione usando il tempo DB e intervalli `[inizio, fine)`;
4. verifica dell’assenza di entitlement `scheduled` o `active`;
5. consumo del codice, creazione dell’entitlement `active` ed evento audit `entitlement_activated`.

L’evento audit contiene solo identificativi e stato dell’entitlement. Non contiene codice in chiaro o hash. Un secondo tentativo della stessa membership con lo stesso codice restituisce lo stesso esito come replay; un’altra membership riceve l’errore “già utilizzato”. Se esiste già una convenzione corrente, il nuovo codice resta disponibile.

I codici `reserved` non sono attivabili in C4 perché lo schema C1/C3 non associa la prenotazione a una membership. Questo stato sarà definito insieme al flusso di iscrizione futura.

## Rate limiting ed errori

Ogni tentativo usa il throttling durevole già certificato con chiavi HMAC separate per indirizzo di richiesta e identità canonica. Nessun IP o identificativo grezzo viene memorizzato. I tentativi errati non generano audit permanenti, evitando una crescita incontrollata della tabella audit.

La UI distingue codice non valido, già utilizzato, scaduto, revocato, convenzione inattiva, membership non idonea e convenzione già attiva. Le risposte non espongono hash, suffissi o metadati Admin.

## Effetti sui punti

L’attivazione non crea movimenti punti e non ricalcola il saldo storico. `activated_at` ed `effective_from` usano `transaction_timestamp()`; solo gli earn successivi possono usare il moltiplicatore della convenzione. Restano valide le regole C1/C2: massimo tra promo e convenzione, nessuno stacking, attribuzione strutturata a agreement ed entitlement.

La sospensione successiva della membership non elimina l’entitlement: l’idoneità della membership rimane comunque autorevole e impedisce l’earn finché la membership non è operativa.

## UI pubblica

Per una membership approvata senza convenzione, `/moviback` mostra il modulo compatto “Attiva una convenzione”. Dopo l’attivazione, `/api/moviback/me` espone soltanto nome, moltiplicatore, stato e date effettive; la pagina mostra “Convenzione attiva”. La tessera digitale non viene ridisegnata in C4.
