# Changelog

Tutti i cambiamenti rilevanti di questo progetto vengono documentati in questo file.

Il formato segue (in modo informale) le linee guida di **Keep a Changelog** e versionamento semantico.

---

## [Unreleased]
### Added
- (spazio per prossime feature)

### Changed
- (spazio per modifiche)

### Fixed
- (spazio per bugfix)

---

## [1.2.0] - 2026-02
### Added
- Notifiche Telegram in tempo reale (iscrizione, cancellazione, pieno, promozione riserva -> main).
- Promozione automatica RISERVA -> MAIN anche lato utente, con rinumero posizioni robusto.
- Opzione torneo `show_participants` (mostra iscritti lato utente).
- Standardizzazione globale visualizzazione nomi: `N. COGNOME` e UPPERCASE.

### Changed
- UX cancellazione lato utente: azione rapida se loggato; verifica telefono se non loggato.
- Rinumero posizioni MAIN/RISERVA tramite funzione deterministica `renumberPositions()`.

### Fixed
- Allineamento comportamento promozione riserva tra lato admin e lato utente.
- Eliminazione inconsistenze su `position` dopo cancellazioni e promozioni multiple.

---

## [1.1.0] - 2026-02
### Added
- Baraonda estesa fino a 20 iscritti (server + generator).
- Baraonda Misto: preset deterministico (N=10, 5+5) e supporto generico 6..20 con equità hard.
- Comandi DEV/BUILD forzati su Webpack anche in locale.

### Changed
- UI Admin: abilitazione pulsante “Genera torneo” fino a 20 per Baraonda.

### Fixed
- Fix TypeScript nel generator (“Cannot find name 'category'” e ref scope/braces).
- Fix equità per Baraonda Misto N=12 (6+6).

---

## [1.0.0] - 2026-02
### Added
- Deploy production-ready (GitHub -> Vercel) con dominio definitivo e redirect.
- Auth admin stabile con cookie `admin_session` (httpOnly) e guard server-side.
- Modulo pubblico (lista tornei, iscrizioni, riserve, live match, area iscrizioni).
- Run Engine Baraonda e FixedPairs con wizard e bracket spurio.
- Export CSV iscrizioni endpoint unico.
- PWA installabile (Android + iOS).
- Dialog system e UI mobile stabilizzati (Stepper base44).

### Fixed
- Fix visibilità tornei con timezone Europe/Rome.
- Delete torneo con ordine di cancellazione coerente (matches/turns/participants/runs/registrations/tournament).
