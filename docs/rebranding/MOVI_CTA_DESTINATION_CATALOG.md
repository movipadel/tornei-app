# MOVI CTA destination catalog

## Scopo

L'editor Padelleria presenta destinazioni comprensibili e continua a salvare esclusivamente `cta_label` e `cta_url`. Il catalogo è un livello di interfaccia: non introduce chiavi nel database e non richiede migrazioni.

La sorgente centrale è `src/lib/publicCtaDestinations.ts`. È un modulo puro, utilizzabile dal client, senza accesso al database e senza dipendenze `server-only`.

## Destinazioni statiche V1

- Pagine MOVI: Home, Tornei, Circuiti, Monday League, MoviBack, Regolamento MoviBack, Store MOVI, Prenota, Gioca, Allenati e Contattaci.
- Area personale: Premi MoviBack, Le mie richieste, Le mie attività e Profilo.
- Informazioni: Privacy, Termini e Cookie.

Le destinazioni personali dichiarano il requisito di autenticazione nel catalogo. L'etichetta è mostrata nell'editor; il comportamento pubblico resta quello della pagina di destinazione.

## Destinazioni dinamiche V1

- Torneo specifico: `/tornei?tournament=<uuid>`.
- Circuito specifico: `/circuiti/<slug>`.
- Contenuto Padelleria: `/padelleria/<uuid>`.

I tornei provengono dall'API Admin esistente e sono limitati a UUID validi con data odierna o futura. I circuiti provengono dall'API Admin e includono soltanto `active` e `closed`. I contenuti Padelleria provengono dall'API Admin, devono essere pubblicati e attualmente visibili e non possono coincidere con il contenuto in modifica.

I dataset vengono caricati soltanto quando l'operatore seleziona il relativo tipo di destinazione.

## Reverse matching e round trip

La classificazione segue questo ordine:

1. valore assente;
2. href statico esatto;
3. matcher dinamico ancorato;
4. URL HTTPS senza credenziali;
5. percorso interno pubblico consentito;
6. valore legacy.

I matcher dinamici accettano soltanto la forma canonica prevista. Query aggiuntive non vengono eliminate: il valore passa al percorso personalizzato o legacy e resta invariato. Se una destinazione dinamica salvata non compare più nel dataset corrente, l'editor aggiunge una voce di conservazione e non cancella l'URL.

## Etichetta CTA

`cta_label` resta indipendente. Alcune destinazioni hanno un suggerimento facoltativo, applicato soltanto quando l'etichetta è vuota e non è mai stata personalizzata. Una label esistente non viene sovrascritta.

## Sicurezza

Gli URL esterni accettano soltanto HTTPS, senza credenziali, spazi, caratteri di controllo o backslash, e vengono serializzati con `URL.toString()` dopo una modifica esplicita.

Il percorso interno avanzato richiede una singola `/` iniziale e blocca route Admin, Staff, API, auth, debug, token premio e i flussi tecnici di login/attivazione/reset. I segmenti dinamici sono validati come UUID o slug e generati da funzioni centralizzate.

I valori legacy non vengono riscritti durante il caricamento. L'operatore può mantenerli oppure sostituirli esplicitamente.

## Partner e fase successiva

Partner è selezionabile sia come landing statica `/partner` sia come destinazione specifica `/partner/[slug]`; il selettore dinamico usa i Partner pubblicamente validi senza alterare i valori legacy già salvati.

Restano differiti:

- tappa specifica;
- squadra Monday League specifica;
- stagione Monday League specifica;
- Partner specifico;
- premio MoviBack specifico.
