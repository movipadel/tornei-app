# MOVI App — Player Profile Stage 5B.2

## Scopo e superfici

Stage 5B.2 aggiunge `/profilo` all’area personale. La gestione operativa Admin vive in `/admin/players`, con ricerca intenzionale e dettaglio `/admin/players/[id]`. `/admin/users/duplicates` resta riservata a duplicati, conflitti, conferme e collegamenti incerti. “Le mie attività” resta una superficie distinta. I dati personali esistenti sono mostrati in sola lettura; questa fase non aggiunge modifica utente di email o telefono.

## Modello dati

`player_profiles` è una relazione opzionale 1:1 con la Player Identity e contiene livello dichiarato, club preferiti, disponibilità verso altri club, tipi di partita, ultimo minuto e versione ottimistica. `player_profile_availability` normalizza giorno della settimana e fascia oraria. `player_admin_profiles` separa livello MOVI, data/autore della sua effettiva variazione e note interne.

Il livello dichiarato e quello MOVI sono indipendenti. La vista utente traduce il valore MOVI così: 2.0–2.5 Avanzato, 3.0–4.0 Intermedio, 4.5–5.0 Principiante. Le etichette “Easy” e “Competitivo” non fanno parte del contratto.

## Risoluzione identità e scritture

L’API utente deriva sempre `users.id` dalla sessione. Non accetta un Player Identity ID. Alla prima scrittura, `player_profile_resolve_account` riusa un collegamento attivo oppure crea/collega la Player Identity solo quando telefono normalizzato, nome e genere producono un esito unico. In caso ambiguo apre o aggiorna un caso `ambiguous_account_link` e sospende il salvataggio.

`player_profile_write_user` e `player_profile_write_admin` serializzano la mutazione con i lock del dominio Player Identity. Un profilo esistente richiede `expected_version`; una versione superata restituisce HTTP 409 e richiede il ricaricamento. Le disponibilità vengono sostituite nella stessa transazione del profilo. Il timestamp del livello MOVI cambia solo quando cambia il suo valore.

## Privacy e sicurezza

Le tre tabelle hanno RLS attiva e nessun privilegio per `anon` o `authenticated`; l’accesso passa da API server con service role. Le API Admin richiedono `guardAdmin`; ogni mutazione verifica anche la stessa origine. L’API utente non seleziona né serializza `internal_notes`. L’email Admin è visibile in sola lettura e non è accettata dai payload di modifica.

## Query future

Gli array controllati hanno indici GIN per club e tipo partita. La disponibilità ha un indice `(weekday, time_window, player_identity_id)` e il livello MOVI un indice parziale. Questi indici preparano filtri futuri; questa fase non introduce matching, scoring o ordinamento automatico.

## Fixture locali

Eseguire esclusivamente tramite il runner verificato:

```text
node scripts/padelleria-local.mjs profile-migrate
node scripts/padelleria-local.mjs profile-fixtures
node scripts/padelleria-local.mjs profile-sql-test
node scripts/padelleria-local.mjs profile-api-test
```

- User A, profilo esistente: `requests-demo-1@example.invalid` / `Requests-Local-2026!`
- User B, profilo inizialmente assente: `requests-demo-2@example.invalid` / `Requests-Local-2026!`
- Admin: `padelleria-admin@example.invalid` / `Padelleria-Local-2026!`
- Player C senza account: “Identità Demo P2 senza account”
- Player D archiviato: “Identità Demo Archiviata”

URL: `http://localhost:3100/profilo`, `http://localhost:3100/admin/players`, `http://localhost:3100/admin/players/efee2000-0000-4000-8000-000000000002` e `http://localhost:3100/admin/users/duplicates` per il solo lavoro correttivo.

Fixture, credenziali e dati sono sintetici e solo locali. Migrazione, test e fixture non autorizzano operazioni di produzione.
