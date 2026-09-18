# PF-08B2C8 — Human visual smoke results

## Local setup

- Branch/revision: `performance/foundation-2026` / `2675be1`.
- Local application: `http://127.0.0.1:3100`, started with `npm run dev -- --webpack --hostname 127.0.0.1 --port 3100`.
- Local database only: `127.0.0.1:54322/postgres`; unlinked project reference absent.
- Data: committed PF-08B2C7 synthetic fixture plus the reviewed local classification candidate.
- Application process: explicit local Supabase values and `MOVIBACK_SMART_REDEMPTION_ENABLED=true`; no Telegram credentials.

## Visual evidence and deferral

The dedicated computer-use runtime failed before a browser surface was created with `failed to write kernel assets: Impossibile trovare il percorso specificato. (os error 3)`. The runtime was reset and retried once, with the same result.

A subsequent manual local browser attempt reached the application but could not complete customer onboarding: local Supabase Storage does not contain the medical-certificate bucket required by that registration flow. The owner decided not to create Storage infrastructure solely for this visual check.

Consequently, a visual assertion is not inferred from API data. Purely rendered checks below are **DEFERRED — controlled production smoke**, not PASS. The corresponding real application/API/session evidence from PF-08B2C7 remains PASS and is referenced only as supporting context.

| Visual case | Expected | Actual | Result | Notes |
|---|---|---|---|---|
| Customer rewards page | `/moviback/premi` renders normally after customer login | Local onboarding blocked by missing medical-certificate Storage bucket | DEFERRED — controlled production smoke | C7 authenticated route/API startup passed |
| Asciugamano selector | Grigio, Lime, and UNICA are understandable; missing selection is blocked; valid choice gives clear feedback | Not rendered through a completed local customer onboarding flow | DEFERRED — controlled production smoke | Underlying API/RPC behavior PASS in C7: Grigio/Lime/UNICA, required-variant validation, stock, idempotency |
| Tubo Palline | No unnecessary selector, no misleading stock warning | Not rendered through a completed local customer onboarding flow | DEFERRED — controlled production smoke | Underlying variantless/zero-stock application flow PASS in C7 |
| Staff queue | Active default, filters, Italian labels, lifecycle buttons, variant snapshot, legacy warning, no dominant UUIDs | Rendered-page confirmation deferred with the controlled smoke | DEFERRED — controlled production smoke | Underlying queue/lifecycle/auth behavior PASS in C7 |
| QR visual states | Requested/processing hidden; ready clear; delivered unusable; service immediate ready | Rendered customer state deferred with the controlled smoke | DEFERRED — controlled production smoke | Underlying QR lifecycle PASS in C7 |
| Desktop viewport | No obvious desktop overflow or inaccessible controls | Visual verification deferred | DEFERRED — controlled production smoke | Verify only the relevant MoviBack pages |
| Narrow viewport | No major overflow; controls remain reachable | Visual verification deferred | DEFERRED — controlled production smoke | Verify only the relevant MoviBack pages |
| Flag OFF visual sanity | Customer pages render; legacy queue row manual-only | Visual confirmation deferred | DEFERRED — controlled production smoke | C7 OFF application/session evidence PASS |
| Flag ON visual sanity | Smart customer flow and staff lifecycle render | Visual confirmation deferred | DEFERRED — controlled production smoke | C7 ON application/session evidence PASS |

## Controlled-smoke activation condition

Smart redemption must not remain enabled for normal customer traffic until the deferred visual smoke passes. Immediately after a controlled smart-flag activation with a designated test account, verify:

1. Asciugamano Grigio/Lime selector and UNICA presentation.
2. Tubo Palline has no selector or misleading stock warning.
3. Staff queue rendered-page state, including variant snapshot and legacy warning.
4. Customer QR presentation at requested, processing, ready, and delivered.

If any item fails, set the smart flag OFF immediately. If all pass, proceed to monitored activation.

## Result

No application change was made. **Local technical acceptance is complete; one controlled-production visual gate is deferred.**
