# MoviTorneoFacile / Movi Tornei

Piattaforma web (PWA) per gestione e svolgimento tornei di padel con modulo pubblico per iscrizioni e pannello admin per creazione tornei, generazione calendari e gestione match.

**Produzione:** https://tornei.movipadel.it  
**Hosting:** Vercel - **DNS:** Hostinger - **Repo:** GitHub (CI/CD automatico)

---

## Funzionalità principali

### Modulo pubblico (utenti)
- Lista tornei disponibili e dettagli (data, ora, location, categoria).
- Iscrizione ai tornei:
  - ingresso **MAIN** fino a capienza
  - ingresso **RISERVA** se torneo pieno
- Visualizzazione live: turni/match e risultati (se disponibili).
- Area “Le mie iscrizioni”.
- Cancellazione iscrizione:
  - se l’utente è loggato: pulsante rapido
  - se non loggato: verifica tramite numero di telefono
- (Opzionale per torneo) Visualizzazione elenco iscritti lato utente tramite flag `show_participants`.

### Pannello Admin (gestori)
- Autenticazione admin con sessione via cookie `admin_session` (httpOnly).
- CRUD tornei:
  - creazione / modifica / eliminazione (con pulizia entità collegate)
  - esportazione iscrizioni CSV
- Run Engine:
  - **Baraonda** (4..20 partecipanti) con generazione calendario robusta
  - **Baraonda Misto** (6..20, pari e M/F uguali) con equità hard
  - **FixedPairs** (coppie fisse) con wizard 4 step e supporto:
    - groups_and_bracket
    - group_only
    - bracket_only (anche spurio 9/10/11…)
- Generazione bracket da gironi (anche spurio) con seed system e BYE corretti.
- UI mobile stabile (Stepper base44, dialog system sistemato).
- Notifiche Telegram in tempo reale verso gruppo gestori.

---

## Notifiche Telegram

Integrazione bot Telegram (env `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) con notifiche per:
- nuova iscrizione (MAIN o RISERVA)
- torneo pieno (prossime iscrizioni in riserva)
- cancellazione iscrizione
- promozione automatica RISERVA -> MAIN dopo cancellazione di un MAIN

Helper: `src/lib/telegram.ts` -> `sendTelegramMessage(text)`

---

## Standardizzazione nomi (UI)

Regola globale di visualizzazione:
- “Nome Cognome” -> `N. COGNOME`
- “Nome” -> invariato  
Tutti i nomi sono resi in **UPPERCASE** in UI.

---

## Stack & architettura

- **Next.js (App Router)** con route handlers (`route.ts`)
- **Supabase** (DB + Storage)
- **Vercel** (deploy) + **GitHub** (CI/CD)
- **PWA**: `@ducanh2912/next-pwa`
- UI custom “base44 style” (design system interno)

### Sicurezza Supabase (macro)
- DB blindato (RLS ON)
- revoke su anon e authenticated
- accesso al DB solo tramite API server controllate
- `service_role` usata esclusivamente lato server via `supabaseAdmin()`

---

## Dominio, redirect e Next config

Dominio produzione: `https://tornei.movipadel.it`  
Redirect: `tornei-app.vercel.app` -> `tornei.movipadel.it`

Esempio `next.config.ts` (redirect host-based):
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "tornei-app.vercel.app" }],
        destination: "https://tornei.movipadel.it/:path*",
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
```

---

## Setup locale

### Requisiti
- Node.js 18+ (consigliato LTS)
- npm (o pnpm/yarn se adattate gli script)
- Progetto Supabase configurato (DB + RLS + storage se usato)

### Installazione
```bash
npm install
```

### Variabili ambiente (esempio)
Crea `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Auth admin (se presenti segreti JWT/JOSE)
ADMIN_JWT_SECRET=...

# Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Varie
NODE_ENV=development
```

> Nota: i nomi effettivi delle variabili possono differire in base al progetto. Allineare a quanto definito in `src/lib/*` e nei route handlers.

---

## Comandi di sviluppo e build (Webpack)

Questo progetto forza **Webpack** perché Turbopack può introdurre errori.

### DEV locale con Webpack
```bash
npm run dev -- --webpack
# oppure
next dev --webpack
```

### BUILD produzione con Webpack
```bash
npm run build -- --webpack
# oppure
next build --webpack
```

### Start produzione locale (dopo build)
```bash
npm run start
```

---

## Endpoints principali

### Pubblici
- `GET /api/tournaments`
- `GET /api/tournaments/[id]/live`
- `POST /api/tournaments/[id]/registrations`
- `GET /api/registrations/search`
- `GET /api/registrations/[id]`
- `POST /api/user/login`
- `POST /api/user/logout`
- `GET /api/user/me`

### Admin
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `DELETE /api/admin/tournaments/[id]`
- `POST /api/admin/tournaments/[id]/run/start` (Baraonda)
- `POST /api/admin/tournaments/[id]/fixed/run/start` (FixedPairs)
- `POST /api/admin/tournaments/[id]/run/bracket`
- `GET /api/admin/tournaments/[id]/registrations.csv`

---

## CSV iscrizioni

Endpoint ufficiale:
- `GET /api/admin/tournaments/[id]/registrations.csv`

Caratteristiche:
- runtime nodejs
- protetto da `guardAdmin`
- endpoint unico (no duplicazioni)

---

## Test Baraonda

Script:
```bash
npx -y tsx scripts/test-baraonda.ts
```

Casi consigliati:
- Misto: N=12 (6+6), N=14/16/18/20
- Non-misto: N=12/14/16/18/20

---

## Troubleshooting

### “Turbopack errors / build instabile”
Usare sempre Webpack:
```bash
npm run dev -- --webpack
npm run build -- --webpack
```

### “Torneo non visibile lato pubblico per data”
Gestione date in timezone **Europe/Rome** (es. `.gte("date", todayRomeISODate())`).

---

## Contribuire

- Apri una PR con descrizione chiara della modifica.
- Mantieni compatibilità mobile.
- Aggiungi test/fixture per Baraonda se tocchi la logica di generazione.

---

## Licenza

Definire in base alle esigenze del club/prodotto.
