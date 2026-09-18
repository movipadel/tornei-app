# PF-08B2C6 — Local acceptance test plan

## Safety preflight

1. Check out `performance/foundation-2026` with no unrelated changes.
2. Run `npx --no-install supabase status -o json` and require DB URL `127.0.0.1:54322/postgres`.
3. Require `supabase/.temp/project-ref` to be absent. Stop if the target is linked or ambiguous.
4. Reset only local Supabase and run the PF-08B2L and PF-08B2R3 SQL regressions.
5. Never use `supabase link`, `db pull`, `db push`, a remote connection string, production Telegram settings, or deployment commands.

## Repeatable browser setup

Use the existing synthetic/local classification fixtures. Start the application against local Supabase with explicit local-only environment configuration and sign in separately as customer, staff, and admin. Run the following twice: first with `MOVIBACK_SMART_REDEMPTION_ENABLED=false`, then restart locally with it set to `true`. Do not change any committed environment file.

## Deterministic checklist

| # | Case | Procedure | Expected result |
|---|---|---|---|
| 1 | SERVICE | Redeem a classified service with enough points. | One redemption; initial status ready; no Store order; queue says no Store handling; action is Erogato. |
| 2 | Asciugamano Grigio | Choose Grigio/UNICA and redeem. | Queue shows customer, reward, Grigio, UNICA, points, requested, linked Store order. |
| 3 | Asciugamano Lime | Repeat with a distinct customer/intent and Lime/UNICA. | Same result with Lime snapshot; no snapshot mutation after catalog changes. |
| 4 | Tubo Palline | Redeem without selecting a variant. | Store fulfillment exists; queue says Nessuna variante cliente; no stock-missing warning. |
| 5 | Insufficient points | Redeem above the member balance. | Safe points error; no redemption, debit, Store order, or Telegram scheduling. |
| 6 | Invalid/missing variant | Omit or forge Asciugamano IDs. | Safe variant error; no partial state. |
| 7 | Same redemption retry | Resubmit the same intent/idempotency UUID. | Same result; no second debit, reservation, order, redemption, or Telegram notification. |
| 8 | Requested → processing | Click Prendi in carico once, then attempt a fast double-click. | Button disables; one command; refreshed row is In lavorazione. |
| 9 | Processing → ready | Click Segna come pronto. | Redemption and Store fulfillment are ready; refreshed row is Pronto. |
| 10 | Customer QR readiness | Observe customer before and after ready. | No usable token while requested/processing; usable QR only at ready. |
| 11 | QR delivery | Scan the ready physical reward as staff. | Lifecycle RPC atomically marks redemption/order delivered; queue shows Consegnato. |
| 12 | Repeat delivery | Scan the same QR again. | Safe idempotent/same-target response; no points or stock mutation. |
| 13 | Cancellation | Cancel before supplier commitment and provide a reason. | Terminal Annullato; exact-once refund/release; no action buttons. |
| 14 | Rejection/refund | Reject a valid pre-commit request with reason. | Terminal Rifiutato; exact-once refund/release. |
| 15 | Legacy row | Open an unclassified historical row. | Visible warning; no unsafe action; no automatic mutation. |
| 16 | Unauthorized access | Call both queue endpoints with customer/no staff cookie. | `403`; no data and no transition. |

Also confirm delivered/terminal filters, manual refresh, load-more behavior, timestamps, friendly PF08 error copy, and both admin/staff navigation links.

## Feature-flag acceptance

- **OFF**: the retained legacy redeem branch still executes. Queue reads remain safe, while unclassified legacy rows are manual-only. No silent smart fallback occurs.
- **ON**: classified requests use the smart RPC, appear with lifecycle actions, and follow the full queue/QR path.
- Unit coverage verifies explicit true/false and the safe default: absent in production means legacy; absent in development means smart.

Full browser execution must record the local app revision, flag value, fixture identifiers, staff/customer roles, screenshots or observed outcomes, and pass/fail per row. The plan is deterministic, but its browser run is not claimed until that evidence exists.

## Telegram-safe acceptance

Do not use the production bot or chat. The default acceptance in this phase is structural: route tests prove only a new committed result schedules the post-commit task; replay does not; message copy directs staff to Richieste premio. The post-commit wrapper isolates delivery failure from the committed redemption.

Before cutover review, repeat against an approved non-production bot/channel or a stubbed `sendTelegramMessage` boundary and record: one call for a new request, zero additional calls for replay, and unchanged committed redemption on simulated notification failure.

## Automated commands

Run the Node contract tests, TypeScript check, production build, and targeted ESLint for changed TypeScript/TSX. Execute `pf08b2l_lifecycle.sql` and `pf08b2r3_store_variant_inventory.sql` only against the verified local database. The repository has no browser-test runner, so browser work remains the manual checklist above.