# MOVI Auth 2.0 — onboarding hotfix

## Problema originale e causa

Il codice non inviava normalmente due email. Il percorso di attivazione usava `signInWithOtp` per inviare una email, poi il callback rimandava a `/attiva-account?verified=1`, dove compariva un secondo form per scegliere la password e collegare il profilo. La registrazione inviava una sola email con `signUp`, ma dopo il callback mostrava una pagina tecnica che eseguiva `/api/auth/signup/finalize` dal browser. Questi passaggi separati sembravano una seconda conferma e interrompevano la continuità del flusso.

## Flusso precedente

Attivazione: prompt → avvio migrazione → form email → email OTP → callback → secondo form password → complete → collegamento → accesso.

Registrazione: form completo → email di conferma → callback → pagina `verified=1` → finalize dal browser → profilo disponibile.

## Nuovo flusso

Attivazione: prompt → form con email, password e conferma → una chiamata `signUp` → stato “Controlla la tua email” → callback → `resolve_and_link_verified_auth_user` → sessione Auth già valida → app. L’email del profilo legacy viene precompilata e bloccata nell’interfaccia; l’API impedisce che una sessione legacy conosciuta venga usata con un indirizzo differente.

Registrazione: form completo → una chiamata `signUp` → stato “Controlla la tua email” → callback → risoluzione server-side → sessione Auth già valida → app. La risoluzione crea un profilo soltanto quando non esiste alcun candidato. Se email verificata e telefono normalizzato individuano un solo profilo legacy attivo e scollegato, riusa il resolver certificato e collega quello stesso `public.users.id`. Più profili producono `review_required`; un telefono discordante o un collegamento appartenente a un altro Auth produce `conflict`.

Il reinvio è separato e avviene soltanto dopo un’azione esplicita dell’utente. La route di reinvio non crea, collega o modifica profili applicativi.

## Invarianti di sicurezza

- Il callback collega un profilo esistente soltanto dopo `email_confirmed_at`.
- La sessione legacy non prova il possesso dell’email.
- Una email con più profili attivi produce `review_required`; non viene eseguita alcuna fusione automatica.
- Il collegamento conserva lo stesso `public.users.id`.
- `auth_user_id` resta univoco e Auth resta la sessione autorevole.
- Un profilo collegato non può tornare al login legacy.
- Credenziali legacy sconosciute non creano profili.
- Un disaccordo tra sessione Auth e legacy fallisce in modo chiuso.
- Gli alias non partecipano all’autorizzazione.

## Account già in corso

- I vecchi link di attivazione con `next=/attiva-account?verified=1` restano validi e aprono il solo passaggio password precedente, necessario perché quegli utenti Auth furono creati senza password.
- Se un utente pre-hotfix non ha più il vecchio link, una ricerca Auth amministrativa puntuale e limitata riconosce l’identità già creata. Viene inviato un solo nuovo magic link con `shouldCreateUser: false`, che riprende il vecchio passaggio password. Il test locale GoTrue ha confermato che ripetere `signUp` su un utente OTP non imposta la nuova password; mantenere quel passaggio per questo solo stato è quindi necessario per non lasciare l’account senza credenziali.
- Le attivazioni create dall’hotfix ricevono subito un record `activation/pending_verification` nella tabella onboarding esistente. Questo consente al reinvio di usare il template signup corretto e distingue il flusso nuovo dal recupero pre-hotfix senza nuove tabelle o migrazioni.
- La ricerca Auth e la lettura onboarding falliscono in modo chiuso: se non sono disponibili, la route non tenta `signUp`, OTP o reinvio e mantiene la risposta generica.
- I vecchi link di registrazione con `next=/registrati?verified=1` vengono finalizzati dal callback. Chi si trova già sulla vecchia URL verificata può ancora riprendere tramite l’endpoint finalize compatibile.
- Se un callback nuovo viene riaperto dopo il consumo del codice, una sessione Auth verificata già presente può ripetere la RPC. Le RPC sono idempotenti e protette da vincoli e lock transazionali.
- Una registrazione già verificata rimasta in `signup/pending_verification` con `match_count=0` viene ripresa dalla sessione Auth corrente tramite `/api/auth/onboarding/resume`. Il server ricalcola il candidato senza eliminare l’identità Auth, senza modifiche manuali e senza inviare una seconda email.
- La ripetizione del form non crea una seconda identità applicativa; Supabase oscura gli account già presenti e la preparazione/finalizzazione resta associata allo stesso `auth_user_id`.
- Il reinvio non prepara né finalizza alcun profilo.

## Stati utente

`review_required` viene mostrato come: “Abbiamo trovato più profili associati ai tuoi dati. Li sistemiamo noi senza perdere punti, tornei o storico.”

Un conflitto viene mostrato come: “Non siamo riusciti a completare automaticamente il nuovo accesso. Il tuo profilo e i tuoi dati restano invariati. Contatta MOVI e lo sistemiamo.”

I codici interni restano disponibili alle API e non compaiono nel testo mostrato all’utente.

## Template email Supabase

Il codice non modifica la configurazione hosted. Prima del rilascio aggiornare manualmente i template **Confirm signup** e **Magic Link** in Supabase Dashboard. Il secondo serve soltanto al recupero delle attivazioni pre-hotfix:

- Oggetto: `Conferma il tuo accesso MOVI`
- Testo: `Conferma la tua email per completare l’accesso MOVI.`
- Unico pulsante: `Conferma email`
- Destinazione del pulsante: `{{ .ConfirmationURL }}`

Non aggiungere OTP, link alternativi, riferimenti a migrazione, token, Supabase o finalizzazione.

## Verifica locale

I contratti `movi_auth2_onboarding_hotfix_contract.test.mjs` e `movi_auth2_unified_onboarding_contract.test.mjs` provano che attivazione e registrazione normali contengono esattamente una operazione Auth che può inviare la conferma, e che callback/finalizer/resume non ne contengono. Coprono inoltre il reinvio isolato, la compatibilità dei vecchi link, la ripresa idempotente, il matching email+telefono e il divieto di fusione automatica.

L’accettazione `movi_auth2_unified_onboarding_http_acceptance.mjs` copre creazione singola, collegamento al profilo legacy esatto, recupero dello stato verificato bloccato, replay, mismatch, duplicati e conflitto con un altro Auth. Verifica anche che `/api/user/me` esponga lo stesso profilo e che MoviBack, Store, tornei, Monday League e comunicazioni continuino a riferirsi allo stesso identificativo.

L’accettazione HTTP locale ha completato entrambi i percorsi reali con cookie PKCE e Mailpit: attivazione e registrazione hanno inviato una email ciascuna, il callback ha collegato o creato il profilo una sola volta, il replay è rimasto idempotente e la sessione Auth finale risultava attiva. Un controllo separato su GoTrue locale ha provato il comportamento delle identità OTP pre-hotfix e ha motivato il percorso di compatibilità descritto sopra.

La matrice di regressione comprende i test Auth Stage 1–5B, remediation finale, rate limiter legacy, duplicate review, MoviBack, Store, tornei, Monday League, comunicazioni e PWA H-01, seguiti da TypeScript, ESLint mirato, build di produzione e `git diff --check`.

## Checklist di rilascio

1. Applicare il codice dell’hotfix senza migrazioni SQL.
2. Aggiornare manualmente il template **Confirm signup** con il testo sopra.
3. Verificare che Site URL e redirect consentano `/auth/callback` con i parametri `flow=activation` e `flow=signup`.
4. Eseguire uno smoke test con un nuovo utente di prova e un profilo legacy univoco: una email, callback, sessione attiva.
5. Eseguire uno smoke test duplicato: stato assistito, nessuna fusione.
6. Verificare accesso Auth, password reset e accesso precedente.
7. Controllare gli errori callback e la coda duplicati dopo il rilascio.
