# MOVI Auth 2.0 — revisione profili duplicati

## Perché il flusso precedente era difficile

Il flusso precedente esponeva direttamente il modello tecnico della fusione. L’operatore sceglieva un profilo canonico e una sorgente, configurava quattro vincitori di campo, aggiornava il preflight, approvava il piano, digitava `MERGE` e infine eseguiva una sola coppia. Nei gruppi con almeno tre profili, la prima fusione cambiava utenti e fingerprint; una scansione successiva rendeva obsoleto il gruppo originale e ne creava uno per i membri attivi rimasti. Il browser continuava però a usare gruppo e sorgente precedenti, causando errori di membro non incluso e imponendo aggiornamento e nuova selezione.

## Flusso operativo in tre passi

1. L’operatore apre un gruppo e sceglie il profilo da mantenere tra schede che mostrano identità, data di creazione, Auth e storico business.
2. Il server calcola automaticamente i valori finali e mostra “Questo è ciò che resterà”. Solo una vera ambiguità di identità richiede una scelta esplicita.
3. Il pulsante “UNISCI PROFILI”, seguito da una conferma semplice, approva e risolve tutti i duplicati ancora sicuri nel gruppo.

La coda usa solo gli stati `DA CONTROLLARE`, `PRONTO`, `RICHIEDE ATTENZIONE` e `RISOLTO`. I codici interni restano disponibili esclusivamente nel pannello chiuso “Dettagli tecnici”.

## Orchestrazione del gruppo

`POST /api/admin/users/duplicates/preview` riceve il gruppo, il profilo da mantenere e le sole eventuali scelte ambigue. `POST /api/admin/users/duplicates/resolve` ripete il controllo sul server e orchestra in ordine deterministico le RPC certificate di Stage 3 e Stage 4. Per ogni sorgente salva la decisione, genera un nuovo preflight, crea l’operazione, la esegue e verifica il risultato. Dopo ogni coppia rilegge membri e alias e ricostruisce il riepilogo. Se un controllo diventa insicuro, interrompe il ciclo e conserva le operazioni già concluse e i relativi journal.

Questa soluzione non introduce una migrazione: usa le transazioni, i lock, i fingerprint, la verifica e il journal già certificati per ciascuna coppia. Il browser non riceve né orchestra sorgenti, fingerprint o retry.

## Recupero dei gruppi parziali

Quando un gruppo è obsoleto, il server risolve `merged_into_user_id`, elimina dai candidati i profili già uniti, esegue una nuova scansione e individua il gruppo successore con lo stesso segnale. Il profilo scelto resta il principale se è ancora attivo. Se il successore non è recuperabile, il gruppo resta bloccato con un messaggio leggibile e non viene eseguita alcuna fusione.

## Conflitti e dati business

Il riepilogo aggrega MoviBack, tornei, Store, certificati, Monday League e comunicazioni. Sono controllate anche collisioni tra due sorgenti, che potrebbero apparire solo dopo la prima fusione. MoviBack doppio non sicuro, doppia identità Auth, stesso torneo e stessa squadra Monday League producono messaggi in italiano senza codici interni. Restano invariati gli snapshot Store, le chiavi e lo storico tornei, l’evidenza dei consensi, l’assenza di notifiche, gli alias non autorizzanti e il journal immutabile.

## Continuazione del nuovo accesso

Un gruppo nato dall’attivazione mostra “Nuovo accesso in attesa”. Dopo la risoluzione completa il server cerca una sola pratica `review_required` con la stessa email normalizzata e richiama in modo idempotente `resolve_and_link_verified_auth_user`. Se la pratica non è unica o non è sicura, non modifica il collegamento Auth.

## Test

I contratti Node verificano il flusso in tre passi, l’assenza della vecchia UI, l’orchestrazione server, i messaggi umani, il recupero degli alias, la continuazione Auth e la strategia bounded M-02. Il test SQL `movi_auth2_admin_duplicate_group_workflow.sql`, eseguito dentro una transazione con rollback, copre una fusione a tre profili con storico Massimiliano-shaped e la ripresa di un gruppo a tre membri dopo una prima fusione e una nuova scansione. I test Stage 3 e Stage 4 continuano a coprire il caso semplice a due profili, MoviBack, Store, tornei, Monday League, comunicazioni, consensi, stale fingerprint, replay e concorrenza.
