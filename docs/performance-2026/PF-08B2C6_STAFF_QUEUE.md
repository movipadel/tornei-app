# PF-08B2C6 — Staff reward-request queue

## Scope and safety

PF-08B2C6 adds the minimum operational **Richieste premio** UI. It does not activate smart redemption, deploy code, alter production configuration, or contact production. Database validation is restricted to the unlinked local Supabase endpoint `127.0.0.1:54322/postgres`.

## Current flow versus target flow

Before PF-08B2C6, staff could accredit points and scan QR codes, administrators could edit the reward catalog, and PF-08B2C5 exposed guarded redemption reads/commands. There was no page joining those capabilities into an operational queue.

The implemented flow is:

`Richieste premio` → server-filtered queue → backend-provided valid action → one lifecycle API call/RPC → authoritative queue reload. Physical requests progress `requested → processing → ready → delivered`; services may start ready and use **Erogato**. Cancellation and rejection remain backend-controlled.

## Entry points and authorization

- Admin: `/admin/moviback/redemptions`.
- Staff: `/staff/rewards`.
- Both render the same queue component and call the existing `/api/admin/moviback/redemptions` contract.
- Both reads and lifecycle writes reuse `guardStaff`; only signed `admin` or `staff` sessions pass. A customer session is not a staff session and receives `403`.
- Navigation links were added to the existing admin and staff headers, plus the MoviBack admin quick actions.

## Queue UX

The default filter is **Da gestire**, covering requested, processing, and ready. Additional filters are Richieste, In lavorazione, Pronte, Consegnate, Annullate/rifiutate, and Tutte. Staff see customer and reward names, points, operational fulfillment label, lifecycle timestamps, Store order state and item snapshots, QR readiness, terminal reason, and a controlled legacy warning.

Italian labels are operational rather than database-oriented. Raw identifiers are not displayed. The UI never derives a transition: it intersects the API's `available_actions` with the known action vocabulary and hides all actions on historical rows.

## Fulfillment behavior

- **SERVICE**: clearly states that no Store order handling is required; delivery action reads **Erogato**.
- **STORE_PRODUCT**: displays the linked Store order and each product/variant snapshot. Asciugamano therefore shows Grigio or Lime and UNICA when stored.
- A valid stockless product such as Tubo Palline displays **Nessuna variante cliente**; it never reports missing stock.
- **CUSTOM_PHYSICAL** and **PARTNER**: display their fulfillment labels and available operational context without reward-name heuristics.
- A missing `fulfillment_type` is historical/legacy. The UI shows **Richiesta legacy — verifica manuale necessaria** and provides no lifecycle buttons.

## Commands, errors, and retry safety

Process, ready, deliver, cancel, and reject call the PF-08B2C5 transition endpoint. Cancel/reject require a reason. Every other command requires confirmation. Buttons are disabled while the row is in flight and an in-memory guard rejects a second click before React rerenders.

Each redemption/action intent gets a UUID in `sessionStorage`. A failed/uncertain request keeps the UUID so a retry is idempotent; a successful response removes it. No optimistic state is created. Success causes a full authoritative reload of the active filter.

Known PF-08 errors are already translated server-side, including invalid transition, supplier commitment, legacy/manual repair, idempotency, inactive reward/product, points, and stock cases. Staff see the safe message; the code and HTTP status are logged without a SQL stack trace.

## QR and legacy compatibility

The queue reports QR usable only for `ready`. The customer APIs continue suppressing the token at requested/processing and after terminal states. Delivery through the staff scan route invokes the lifecycle RPC and is repeat-safe. This UI does not change that contract.

With `MOVIBACK_SMART_REDEMPTION_ENABLED=false`, legacy creation remains unchanged. New legacy rows are readable; rows without the new classification are deliberately manual-only. The queue therefore does not create unsafe assumptions while the flag is off. With the flag true, classified smart rows receive normal lifecycle actions.

## Query and refresh behavior

The feed accepts a validated scope, a clamped `1..200` limit, and a non-negative offset. The UI requests 100 rows and offers **Carica altre richieste**. Each page uses at most two database operations: one relational redemption/customer/reward query and one batched Store order/items query for all returned redemption IDs. There are no row-by-row customer or Store reads and no polling. Manual refresh and post-command refresh are the only automatic network triggers after initial/filter load.

## Admin classification protection

The existing PF-08B2C5 create/edit contract remains sufficient for this scope. Active rewards require explicit `fulfillment_type`; STORE_PRODUCT requires a UUID-linked active Store product and coherent stock identity topology; SERVICE forbids Store linkage; `requires_store_variant` is checked against active identities. CUSTOM_PHYSICAL/PARTNER activation stays blocked pending their metadata contracts. The UI uses the typed fields, not free text or keyword inference.