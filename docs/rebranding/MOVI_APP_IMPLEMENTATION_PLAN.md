# MOVI App — Piano di implementazione successivo allo Stage 0

24 settembre 2026. **Nessuna fase implementata. Attendere approvazione utente.**

## Esito Stage 0 e decisioni

Audit statico, freeze funzionale, inventario frontend, DS v2, Home, modello dati, manifest media e regressione documentati. Verificato target locale tramite `npx supabase status`: API55021, DB55022, Studio55023, Mailpit55024 su127.0.0.1; linked_project null. Nessuna introspezione DB necessaria per questa proposta. Nessun accesso produzione, `.env.local`, Vercel env o Supabase hosted. Il primo status era fallito per permessi sul file telemetry della CLI; riesecuzione del solo status autorizzata dal sistema e riuscita. Nessun servizio avviato/fermato.

Artefatti:

- [Invarianti](MOVI_APP_FUNCTIONAL_INVARIANTS.md)
- [Audit frontend](MOVI_APP_FRONTEND_AUDIT.md)
- [Design system e UX](MOVI_APP_DESIGN_SYSTEM_V2.md)
- [Modello dati](MOVI_APP_NEW_FEATURES_DATA_MODEL.md)
- [Asset/media](MOVI_APP_ASSET_MANIFEST.md)
- [Regressione](MOVI_APP_REGRESSION_PLAN.md)

Decisioni del brief congelate: Home e servizi rapidi in ordine, bottom nav a5 voci QR centrale, due aree editoriali, Partner semplice, tessera modale, nessun cambio di motori/auth. Raccomandazioni tecniche Stage0: due rapporti media, video ibrido, shell pubblica isolata, richiesta unificata con admin e outbox. Non confondere specifica con schema già disponibile.

## Fasi e gate

| Fase | Lavoro proposto | Dipendenze / uscita verificabile |
|---|---|---|
| 1 — DS e shell pubblica | Token scoped, tipografia, card/button/status, MediaFrame, header, nav, modal, carousel | Approvazione Stage0; asset brand; snapshot baseline; nessuna variazione admin/staff o API; target44px, contrasto e no overflow verificati |
| 2 — Home v2 | Ordine approvato, saldo e link attuali, azioni primarie, tornei, circuiti, League, footer | Shell stabile; conservare dati/refresh. Le sezioni nuove si compongono con fixture UI locali, senza pubblicare CTA verso route inesistenti; abilitazione reale solo dopo fasi3/4 |
| 3 — Sezioni leggere | `/attivita`, `/gioca`, `/allenati`, `/partner`, Prenota riallineata, tessera modale; admin Partner e richieste | Approvazione schema additivo/RLS/outbox, vocaboli e accesso staff; ownership e retry provati. Attività aggregata senza duplicare ledger/ordini; Wansport invariato |
| 4 — Editoriale | Admin Contenuti, Succede/È successo, dettaglio, gallery/video/finestre e derivate immagini | Storage bozza/pubblico e policy media approvati; niente sostituzione comunicazioni; pubblicazione/date Europe/Rome testate |
| 5 — Pagine esistenti | Tornei, Circuiti, MoviBack, Store, Contatti, Profilo; route elenco `/circuiti` come proiezione dell'elenco già Home | Regole torneo e ranking chiarite; Profilo riusa API esistenti; nessun nuovo editing implicito; valori business prima/dopo identici |
| 6 — Regressione completa | Functional + visual, responsive, accessibilità, PWA install/update, performance mobile | Tutti i contratti passano, confronti baseline, nessun dato auth cache; test dispositivi reali; report esiti e limiti |
| 7 — SOLO FUTURO | UX login operatore unico e flag device visibilità | Autorizzazione separata; ruolo server e privilegi invariati; mai accorpare questa fase al restyling |

Dipendenza nav: Profilo/elenco Circuiti sono previsti nella fase5. Nelle fasi1/2 prototipare localmente con composizione/storie; non rilasciare nav con link rotti. Se si desidera un rilascio intermedio, anticipare solo i contenitori di lettura per questi due accessi dopo approvazione, senza ampliare scope funzionale. Gioca/Allenati e sezioni editoriali visibili agli utenti soltanto quando i rispettivi percorsi sono funzionanti.

## Confini tecnici

Nuovi componenti pubblici possono comporre i componenti esistenti; mantenere controller/adapter API e logica dominio. Evitare sostituzioni globali di `globals.css`, primitive ui condivise, asset logo condivisi, guard o configurazione SW. Non aggiornare Next/Tailwind o librerie per opportunità durante il rebranding. Ogni refactor deve dimostrare equivalenza osservabile, con patch separata dal cambiamento business eventualmente richiesto.

Nuove tabelle e policy solo in fase esplicitamente approvata. Riutilizzare identità `users.id`, storage corrente, Telegram server. Prima di qualunque DB inspection futura ripetere status e confronto esatto dei quattro target, progetto unlinked; non fidarsi di `.env.local`. Se compare target hosted fermarsi.

## Registro rischi e decisioni da risolvere

| ID | Rischio / evidenza | Mitigazione e gate |
|---|---|---|
| R1 | “Non giocato” vs API date>=oggi; run finished ancora live | Preservare baseline; owner decide eventuale cambio business separato prima fase5 |
| R2 | Riserva non citata nella card semplificata del brief | Conservare In riserva/Lista riserva, quote e promozioni; test dedicati |
| R3 | Ranking pubblico per nome, nessun user link nel DTO | Non attribuire posizione per omonimia; personalizzazione bloccata finché associazione server certa |
| R4 | “Tutti” potrebbe essere interpretato come ranking combinato | Nessuna somma; rimozione filtro con un gruppo selezionato |
| R5 | Storico attività incompleto dopo delete torneo/iscrizione | Esplicitare limite read model; nessun soft-delete introdotto di nascosto |
| R6 | CSS globale/admin e portali ad alto z-index | Scoped public theme, snapshot admin invariati, test modal/nav/keyboard |
| R7 | Modali legacy, carrello e install prompt sovrapposti | Contratto livelli/safe-area; test iPhone/Android e landscape |
| R8 | Video/media pesanti; imgproxy fermo, nessuna pipeline verificata | Derivate progettate, video esterno click-to-load, budget e profiling nella fase6 |
| R9 | Asset brand/foto e dati partner non disponibili come nuovi file | Checklist owner nel manifest, fallback leggeri senza bloccare CTA esistenti |
| R10 | Nuove note private o bozze esposte | RLS/guard e storage draft privato, test accesso anonimo e URL diretti |
| R11 | Ritenti Telegram duplicano richieste o messaggi | Idempotenza richiesta, outbox, request ID, consegna almeno una volta con ambiguità dichiarata |
| R12 | Build/SW e harness possono scrivere file o usare env remoto | Nessuna build/harness eseguita in Stage0; ambiente test locale esplicito e provider mock in futuro |
| R13 | Profilo esteso oltre capacità attuali | Sezioni lettura/link; ogni nuovo endpoint anagrafica richiede scope separato |
| R14 | “Open” UI vs valori categoria/livello legacy | Mappatura display reversibile verificata su fixture; nessuna riscrittura DB |

## Tracciabilità del brief

| Sezioni richiesta | Documento di copertura |
|---|---|
| 1, core freeze, 9–14 comportamenti | Invarianti; DS per presentazione |
| 2 audit frontend | Frontend audit |
| 3–5 DS/Home/carousel | Design system v2 |
| 6–7 nuove sezioni e admin | New features data model; DS Home |
| 8 circuiti | Invarianti + DS + rischi R3/R4 |
| 15 schema | New features data model |
| 16–18 media/video/performance immagini | Asset manifest |
| 19–21 mobile/sticky/accessibilità | Design system v2 + regression plan |
| 22 fasi | Questo documento |
| 23 test | Regression plan |
| 24–25 consegna/limiti | Sette documenti e report finale |

## Stato repository e protezioni

Preesistenti: ` M supabase/config.toml`; `?? docs/auth/MOVI_AUTH_2_PRODUCTION_ROLLOUT_RUNBOOK.md`; `?? supabase/tests/fixtures/home_sections_visual.local.sql`. Nessuno staged/revert/delete da questa attività. SHA256 rilevati durante audit per verifica finale:

- config: `45305D89FF510A12E967C52E2BFE27B9453648AAB1EE12B5166BE1BEF1E78171`
- fixture: `60EAFA253BBAE7C78D2EDE7C65FDBE5C91E2FEC85809931D451953C3E85579B2`
- runbook preesistente: `CC4CDC9C763F462707DF1C5CA2F60D530F3AE18938FCE7AA7A69910F60925CAA`

Uniche scritture di progetto Stage0: i sette Markdown in `docs/rebranding/`. Nessun codice applicativo modificato, nessuna migration, commit, push o deploy. Stop dopo specifica; approvazione dell'utente richiesta prima di qualunque implementazione.
