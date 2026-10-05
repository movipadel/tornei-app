# Tessera digitale MOVI

## Riferimento e scopo

Il riferimento visivo certificato è `docs/rebranding/references/moviback/MOVI_MOVIBACK_TESSERA_MODAL_REFERENCE.png`. Viene usato per direzione premium scura, gerarchia, bilanciamento del brand e accenti royal, cyan e magenta. QR, NFC e azioni presenti nel mockup non definiscono il comportamento del prodotto.

La tessera digitale è una prova visiva di appartenenza MOVI. L’utente la mostra al personale del club o del partner, che verifica visivamente identità e validità. Non è uno strumento di scansione.

## Tessera e QR

La tessera e il QR personale restano funzioni distinte:

- **La mia tessera** apre una modale identificativa senza QR.
- **Mostra QR** e l’azione centrale della bottom navigation continuano a usare il flusso QR esistente e il payload `mb:<membership_code>`.
- La tessera non apre automaticamente il QR e non modifica generazione, token o scanner.

## Accesso dalla Home

Nella card MoviBack della Home, **Accedi a MoviBack** è il solo ingresso esplicito per chi non possiede ancora una membership. Il link porta alla pagina `/moviback`, che conserva il flusso già esistente: autenticazione pubblica per l’utente anonimo e attivazione per l’utente autenticato senza membership.

**Tessera attiva** resta uno stato non interattivo. Per richieste in revisione, rifiutate, sospese o per tessere temporaneamente non utilizzabili, la Home mostra uno stato testuale coerente e non propone una nuova attivazione fittizia.

**Storico** è disponibile soltanto quando la membership è approvata e utilizzabile; negli altri stati è visibilmente indisponibile e non conduce più indirettamente al login o all’iscrizione. **Premi** segue l’autorizzazione `eligibility.can_redeem`. **La mia tessera** continua ad aprire la modale e mostra il suo stato onesto quando la tessera non è valida. **Mostra QR** conserva integralmente il flusso condiviso e il payload esistenti.

Questa distinzione modifica soltanto gerarchia e destinazioni della Home. Non cambia autenticazione, creazione o approvazione della membership, eligibility, punti, premi, QR, scanner, API o database.

## Dati mostrati

La tessera valida usa soltanto campi già autorevoli:

- nome completo da `users.full_name`;
- identificativo pubblico da `loyalty_memberships.membership_code`, già esposto nel prodotto e usato dal flusso QR;
- stato valido solo quando `loyalty_memberships.status` è `approved` e `eligibility.can_use_card` è vero.

Utente anonimo, membership assente, in revisione, rifiutata, sospesa o non utilizzabile producono uno stato testuale onesto. Non viene mostrata una tessera attiva fittizia. Se il nome o l’identificativo non sono disponibili non vengono inventati valori.

## Esclusioni deliberate

La tessera non contiene QR, barcode, NFC/contactless, punti, premi, istruzioni scanner, azioni Wallet, download o esportazione. Non contiene CTA o link Partner. La frase contestuale “Mostrala nei club MOVI e presso i partner aderenti” è sufficiente.

## Responsive e accessibilità

La modale riusa `PublicModal` e quindi mantiene semantica dialog, associazione titolo/descrizione, focus trap, chiusura con Escape, ritorno del focus e controllo X con nome accessibile. È presente anche l’azione testuale **Chiudi**.

La tessera adatta nome e identificativo senza overflow da 320 px; a desktop la modale resta compatta. Lo stato è sempre espresso con testo e non soltanto con colore. Focus visibile, contrasto, zoom e reflow seguono il sistema UI pubblico.

## Invarianti

Questa implementazione non cambia punti MoviBack, premi, redemption, QR personale o premio, scanner, membership ownership, autenticazione, API, database o schema.
