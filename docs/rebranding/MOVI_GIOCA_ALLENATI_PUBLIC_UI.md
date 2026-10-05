# MOVI Gioca + Allenati — Public UI

## Reference

The certified visual reference is `docs/rebranding/references/requests/MOVI_GIOCA_ALLENATI_MODAL_REFERENCE.png`. It defines the shared dark dialog, selectable tile, primary action, and confirmation-state language. The reference supplies visual direction; the repository request contract remains authoritative for fields and values.

## Architecture

Home links to `/richieste/gioca` and `/richieste/allenati`. Both routes render the same `RequestForm` component with a contextual request type. The routed page opens the shared Radix-based `PublicModal`, so focus trapping, Escape handling, close semantics, viewport-safe height, and internal scrolling continue to use the certified public modal implementation.

No inline Home form or second business implementation was introduced.

## Preserved fields

Both flows retain club selection, date mode and optional specific date, time window, preferred-time text, level, notes, and idempotent `client_request_id` submission.

Gioca additionally retains match type and companion state. Allenati retains training type and training goal. The certified option codes remain unchanged; the three preference fields now submit arrays so users can select multiple compatible values.

## Multi-select behavior

- Gioca `match_type` accepts one or more of `male`, `female`, and `mixed`. `any` (“Indifferente”) is exclusive and clears specific selections.
- Allenati `training_type` accepts one or more of `individual`, `pair`, and `group`. `advice` (“Non so, consigliatemi voi”) is exclusive and clears specific selections.
- Allenati `training_goal` accepts one or more goals; `other` may be combined with a specific goal because it can add context rather than replace it.
- Every group requires at least one value. Native checkbox tiles expose selected state and keyboard/focus behavior; the API and database repeat the validation.

## Shared visual grammar

- MOVI deep navy dialog surface with thin visible borders and restrained cyan, royal, and magenta accents.
- Native radio and checkbox inputs presented as minimum-48px option tiles.
- Selected options use both a stronger surface/border and a check indicator.
- Gioca retains a royal-to-magenta primary accent; Allenati uses cyan-to-royal.
- Inputs and notes use dark high-contrast controls, visible focus, and the existing real length limits.

## Success state

The form and confirmation share the same dialog. Success announces “Richiesta inviata!”, preserves a polite live region, explains the next three steps with Gioca/Allenati-specific wording, returns safely to Home, and links to `/le-mie-attivita`.

## Responsive and accessibility behavior

The shared modal stays centered on desktop and uses its existing viewport-bounded internal scrolling for long forms. Tiles use two columns on narrow phones and three where space permits. At 320, 390, and 440 px the close action remains reachable, controls reflow without horizontal overflow, and the submit control remains in the natural scroll order.

Radix dialog semantics, focus trap, Escape behavior, and the existing close-focus implementation remain in `PublicModal`. Native form inputs keep keyboard selection and screen-reader behavior; focus rings and error/status announcements are explicit.

## Business invariants

Authentication, request status, club/date values, routes, and notification transport remain unchanged. The request contract and database columns change only from a single option to an array of the same certified option codes.

## Lato di gioco

Gioca e Allenati condividono tre radio tile a scelta singola: Destra, Sinistra e Indifferente. Sono obbligatorie per una nuova richiesta, hanno target minimo 44 px, stato selezionato con icona e superficie oltre al colore, focus visibile e nessun overflow a 320, 390, 440 e 1280 px.

Il prefill usa la preferenza del profilo solo finché il controllo non è stato toccato. Una risposta profilo tardiva non sostituisce mai la scelta manuale dell’utente.
