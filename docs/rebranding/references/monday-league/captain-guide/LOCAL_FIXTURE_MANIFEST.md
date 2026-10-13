# Monday League Captain Guide — fixture locali

Tutti gli oggetti elencati sono sintetici e risiedono nel Supabase locale `127.0.0.1:55422`. Nessuna password, chiave o credenziale è riportata.

## Ambiente

- App: `http://127.0.0.1:3101`
- Supabase API: `http://127.0.0.1:55421`
- Database: `127.0.0.1:55422`
- Studio: `http://127.0.0.1:55423`
- Mailpit: `http://127.0.0.1:55424`
- Branch: `main`
- HEAD: `93310bad42600f065b7317c12879f8f52ee5a972`

## Utenti pubblici sintetici

| ID `users` | Email | Nome | Uso |
|---|---|---|---|
| `c1000000-0000-4000-8000-000000000001` | `captain.guide.a@example.test` | Alessandro Capitano | Capitano Team A |
| `c1000000-0000-4000-8000-000000000002` | `captain.guide.b@example.test` | Beatrice Capitano | Capitano Team B |
| `c1000000-0000-4000-8000-000000000003` | `player.guide@example.test` | Paolo Giocatore | Giocatore normale |
| `c1000000-0000-4000-8000-000000000011` | `captain.guide.c@example.test` | Carlo Vela | Capitano squadra di supporto |
| `c1000000-0000-4000-8000-000000000012` | `captain.guide.d@example.test` | Diana Riva | Capitano squadra di supporto |
| `c1000000-0000-4000-8000-000000000013` | `captain.guide.e@example.test` | Enrico Blu | Capitano squadra di supporto |
| `c1000000-0000-4000-8000-000000000014` | `captain.guide.f@example.test` | Franca Ace | Capitano squadra di supporto |

I primi tre account hanno un corrispondente utente Auth locale. Gli altri quattro servono al modello sportivo e non sono stati usati per il login.

## Stagione e fase

- Stagione: `c1300000-0000-4000-8000-000000000001`
  - nome: `Monday League — Guida Capitani`
  - slug: `captain-guide-local`
  - stato finale: `phase1`
  - visibilità: `public`
- Fase 1: `c1400000-0000-4000-8000-000000000001`
  - codice: `phase1`
  - stato finale: `in_progress`
- Sede: `c1700000-0000-4000-8000-000000000001`
  - `MOVI Padelleria · Campo Centrale`

## Squadre

| ID | Nome | Slug | Capitano player ID |
|---|---|---|---|
| `c1200000-0000-4000-8000-000000000001` | Royal Padel Crew | `royal-padel-crew` | `c1100000-0000-4000-8000-000000000001` |
| `c1200000-0000-4000-8000-000000000002` | Cyan Smash Club | `cyan-smash-club` | `c1100000-0000-4000-8000-000000000011` |
| `c1200000-0000-4000-8000-000000000003` | Vela Padel | `vela-padel` | `c1100000-0000-4000-8000-000000000021` |
| `c1200000-0000-4000-8000-000000000004` | Riva Team | `riva-team` | `c1100000-0000-4000-8000-000000000031` |
| `c1200000-0000-4000-8000-000000000005` | Blue Lob | `blue-lob` | `c1100000-0000-4000-8000-000000000041` |
| `c1200000-0000-4000-8000-000000000006` | Ace Ladies | `ace-ladies` | `c1100000-0000-4000-8000-000000000051` |

Royal Padel Crew è stata modificata attraverso la UI reale:

- slogan finale: `Royal Crew · Uniti in campo.`;
- logo Storage locale: `monday-league/c1300000-0000-4000-8000-000000000001/c1200000-0000-4000-8000-000000000001/logo/72e3860c-ff66-4b07-8d00-ae909cda123e.png`;
- hero Storage locale: `monday-league/c1300000-0000-4000-8000-000000000001/c1200000-0000-4000-8000-000000000001/hero/e231f473-4430-43f5-b027-d9efc0d65a96.jpg`.

## Rose principali

### Royal Padel Crew

- `c1100000-0000-4000-8000-000000000001` — Alessandro Capitano — attivo, capitano, collegato all'utente A
- `c1100000-0000-4000-8000-000000000002` — Paolo Giocatore — attivo, collegato all'utente normale
- `c1100000-0000-4000-8000-000000000003` — Marco Rossi — attivo
- `96ca4294-e066-45b2-8f4e-7a1e2c555036` — Davide Leone — attivo, aggiunto dalla UI
- `c1100000-0000-4000-8000-000000000004` — Luca Ferrero — inattivo dopo la sostituzione via UI

### Cyan Smash Club

- `c1100000-0000-4000-8000-000000000011` — Beatrice Capitano — capitano
- `c1100000-0000-4000-8000-000000000012` — Giulia Bianchi
- `c1100000-0000-4000-8000-000000000013` — Sara Gallo
- `c1100000-0000-4000-8000-000000000014` — Elena Costa

## Partite finali conservate

| Match ID | Stato | Scenario |
|---|---|---|
| `c1600000-0000-4000-8000-000000000001` | `confirmed` | Blue Lob–Royal Padel Crew 2–0, storico definitivo |
| `c1600000-0000-4000-8000-000000000002` | `confirmed` | Royal Padel Crew–Cyan Smash Club 2–0; formazione, invio, contestazione e risoluzione reali |
| `c1600000-0000-4000-8000-000000000004` | `scheduled` | Vela Padel–Ace Ladies, partita futura |

La partita `c160...0002` ha `lineups_locked_at` valorizzato e una formazione corrente per Royal Padel Crew.

## Formazione

- Lineup: `6e194ece-6998-478e-9043-c622fad3ca42`
- Match: `c1600000-0000-4000-8000-000000000002`
- Team: Royal Padel Crew
- Revisione: 1
- Stato: `current`
- Giocatori: Alessandro Capitano e Paolo Giocatore

## Risultati

- Risultato storico: `c1800000-0000-4000-8000-000000000001`
  - match `c160...0001`, 2–0, confermato
- Risultato creato dalla UI: `c9b011e7-5ff9-45fe-b6be-51946fc03102`
  - match `c160...0002`
  - revisione 1
  - submitter `captain`
  - set 6–4, 6–3
  - riepilogo 2–0, 12–7 game
  - stato finale `confirmed`

## Contestazione

- ID: `aa386ee8-6ffa-49d3-a253-c94fdf3597a3`
- Match: `c1600000-0000-4000-8000-000000000002`
- Aperta da: `c1000000-0000-4000-8000-000000000002` (Beatrice Capitano)
- Stato finale: `resolved_rejected`
- Motivazione capitano: sintetica, inserita dalla UI
- Risoluzione: Admin locale, contestazione respinta e risultato confermato

## Notifica consegnata

- Evento: `3de85a21-0855-4625-a954-287ea3613af2`
- Tipo: `contest_resolved`
- Destinatario: Capitano B
- Stato: `delivered`
- Comunicazione: `1334e4c8-cd5b-441b-b9a0-114347ee9baa`
- Titolo: `Contestazione risolta`
- CTA: `/monday-league/squadre/cyan-smash-club`

Gli altri eventi locali restano disponibili nel relativo outbox per ispezione. Nessun invio esterno è stato eseguito.

## Operatore locale usato

È stato usato l'Admin locale preesistente `padelleria-admin@example.invalid` per la sola risoluzione della contestazione. La sua password locale è stata reimpostata per il test ma non è riportata in questo documento.

## Conservazione

Le fixture, i file Storage locali e gli stati finali descritti sopra sono stati lasciati nel database locale per una successiva review visuale. Non sono state create migrazioni e non è stato modificato lo schema.
