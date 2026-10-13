# MOVI Auth — compatibilità OTP legacy `verified=1`

## Problema

Gli account Auth creati dal percorso OTP precedente all’hotfix non hanno una password. Il callback conserva correttamente il redirect a `/attiva-account?verified=1`, ma la pagina era stata sostituita con il solo flusso `LegacyProfileActivation`, che non interpreta quel parametro. Il link verificava l’email senza mostrare il passaggio già esistente per impostare la password e collegare il profilo.

La forma interessata è: account Auth email verificato, profilo pubblico attivo e ancora scollegato in `activation_pending`, nessuna riga `user_auth_onboarding`; possono esistere righe storiche già `merged`, che non partecipano al matching.

## Correzione

`/attiva-account` continua a mostrare `LegacyProfileActivation`. Solo `/attiva-account?verified=1` mostra `MoviAuthForm` in modalità `activate`, riutilizzando `/api/auth/activation/complete`. L’API continua a richiedere una sessione Auth verificata prima di impostare la password e invocare `resolve_and_link_verified_auth_user`.

I test coprono routing normale e compatibile, rifiuto senza sessione verificata, account legacy senza onboarding, candidato canonico con storico unito, ambiguità tra profili attivi e flusso di attivazione corrente invariato. L'acceptance locale `movi_auth2_legacy_otp_compatibility_http_acceptance.mjs` verifica inoltre, attraverso le API reali, aggiornamento password, linking del solo profilo canonico, conservazione dello storico `merged`, creazione di onboarding/eventi e nuovo login. Mailpit verifica separatamente l'invio OTP locale.

Un caso reale pre-hotfix ha richiesto una remediation manuale perché la correzione non era ancora distribuita. Questa modifica è soltanto locale e non autorizza alcun deploy o intervento sui dati di produzione.
