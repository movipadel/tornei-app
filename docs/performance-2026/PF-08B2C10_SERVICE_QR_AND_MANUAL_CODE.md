# PF-08B2C10 — SERVICE QR and manual reward code

## Status

Implemented and validated against the verified, unlinked local Supabase project only. Production was not contacted. The change is not deployed and smart redemption remains a separate production gate.

## Business rationale

PF-08 classifies SERVICE rewards as immediately fulfillable: a customer redeeming a court quota, lesson, slot, registration, or other service must not wait for a physical preparation workflow. Separately, staff need a short fallback credential when a phone or scanner cannot read the reward QR. Without that fallback, an otherwise valid delivery can become an unsafe manual database-repair request.

PF-08B2C10 therefore preserves the QR credential and adds a short manual credential. Both identify the same redemption and both converge on the existing `deliver_moviback_redemption` lifecycle RPC.

## SERVICE immediate-ready contract

Behavior is driven exclusively by `fulfillment_type = 'service'`, never by reward name or category.

On a new smart SERVICE redemption:

- the atomic redemption transaction writes `status = 'ready'`;
- `ready_at` is populated in the same transaction;
- `qr_token` and `manual_code` are generated with the redemption;
- the RPC returns `qr_deliverable = true` and `manual_code_deliverable = true`;
- customer APIs expose both credentials immediately;
- staff can deliver/erogate directly without processing/ready transitions;
- repeat delivery is idempotent and does not debit points again.

The reviewed B2R3 transaction already implemented immediate SERVICE readiness. The B2C10 migration wraps that function rather than duplicating or weakening its points, stock, fulfillment, notification, or idempotency logic.

## Manual-code schema and generation

Migration: `supabase/migrations/20260918160000_pf08_reward_manual_code.sql`.

The migration adds `reward_redemptions.manual_code text` with:

- a partial unique index, `reward_redemptions_manual_code_unique`;
- a normalized-format CHECK;
- a QR/code completeness CHECK for rows containing `qr_token`;
- a database default backed by `generate_pf08_reward_manual_code()`;
- an immutability trigger that rejects any later code change;
- an additive replacement wrapper for `redeem_moviback_reward`.

The generator uses `extensions.gen_random_bytes`, rejection sampling, ten bounded candidate attempts, a transaction advisory lock for the candidate, an existence check, and the unique index as the final invariant. Its alphabet is:

```text
23456789ABCDEFGHJKMNPQRSTUVWXYZ
```

This excludes `0`, `O`, `1`, `I`, and `L`. The code space is `31^8` (more than 850 billion values).

### Canonical and display representations

- Database/API canonical form: eight uppercase characters without separators, for example `7K4M2Q8R`.
- Customer/staff display form: `XXXX-XXXX`, for example `7K4M-2Q8R`.
- Staff input normalization removes spaces and dashes and uppercases before validation/lookup.
- Invalid characters and inputs longer than the bounded handler limit are rejected.

The code is random and is not derived from user, reward, points, order, or QR-token data.

## Backfill

During the migration, every existing `reward_redemptions` row with a non-null `qr_token` and null `manual_code` receives a generated code. The backfill does not update any lifecycle column and does not touch:

- loyalty points or ledger rows;
- reward or Store stock;
- Store orders/items;
- fulfillment classification;
- historical/legacy status.

Rows without an existing QR token may remain nullable. All subsequent inserts that omit `manual_code`, including the retained legacy route while smart mode is OFF, receive the database default. The completeness CHECK prevents a new QR-bearing row without a manual code.

The focused local suite simulated delivered, requested, ready SERVICE, requested physical, cancelled, and rejected pre-migration rows and confirmed unique codes with unchanged state, points, stock, and order counts.

## Smart RPC integration and replay

The migration renames the reviewed B2R3 implementation internally to `redeem_moviback_reward_pf08b2r3` and installs a same-signature public wrapper. The internal implementation remains restricted to `postgres` and `service_role`.

The wrapper:

1. executes the complete B2R3 transaction;
2. obtains the authoritative redemption ID from its result;
3. reads the immutable `manual_code` and committed status;
4. adds `manual_code` and `manual_code_deliverable` to the result.

Because the existing idempotency transaction returns the original redemption ID, a same-key replay reads and returns the same committed manual code. Replay still returns `replayed=true`, schedules no duplicate staff notification, and performs no second debit, stock change, order, or redemption.

## Customer API and UI behavior

Customer redemption/history APIs select the code but pass it through the same readiness gate as the QR token:

| Lifecycle state | QR exposed | Manual code exposed |
|---|---:|---:|
| SERVICE initial `ready` | Yes | Yes |
| Physical `requested` | No | No |
| Physical `processing` | No | No |
| `ready` | Yes | Yes |
| `delivered` | No | No |
| `cancelled` / `rejected` | No | No |

The safer physical-reward UX was selected: both credentials remain hidden until ready. The immediate redemption response is also sanitized, so it cannot leak a newly generated physical QR/manual credential while requested.

The existing MoviBack QR modal now shows:

- `Codice premio`;
- formatted `XXXX-XXXX` value;
- “Se il QR non viene letto, comunica questo codice allo staff.”

No customer page can search by arbitrary manual code.

## Staff scanner integration

The existing `/staff` page now contains two separate operational sections:

1. **Accredito Punti** — existing membership QR/code lookup and point-credit behavior.
2. **Consegna Premio** — reward QR scanner, manual-code field, verification, and delivery.

The scanner is explicitly opened in `mode=points` or `mode=reward`:

- point mode rejects a reward URL and directs staff to Consegna Premio;
- reward mode returns the scanned reward credential to the reward section;
- manual reward-code patterns entered in the point lookup are blocked client-side;
- the server reward endpoint accepts only a valid reward QR token/URL or normalized manual reward code.

The new `POST /api/staff/reward-delivery` handler is guarded by the existing staff/admin session model. It performs a bounded exact indexed lookup by either `qr_token` or `manual_code`, returns one operational result panel, and uses at most one additional Store-fulfillment query. It introduces no N+1 loop.

The panel shows customer, reward, fulfillment type, status, points, and Store variant snapshot where applicable. It uses these messages:

- successful physical delivery: “Premio consegnato”;
- successful service: “Servizio erogato”;
- requested/processing: “Premio non ancora pronto”;
- invalid input/not found: “Codice premio non valido”;
- delivered: safe already-delivered state without a second mutation.

## QR/manual equivalence and lifecycle rules

The staff handler resolves either credential server-side to one redemption ID. It never trusts client parsing as authorization and never updates status directly. Delivery always calls:

```text
deliver_moviback_redemption(actor, stable_operation_key, redemption_id)
```

| State | QR/manual delivery result |
|---|---|
| SERVICE `ready` | Accepted immediately |
| Physical `requested` | Rejected: not ready |
| Physical `processing` | Rejected: not ready |
| `ready` | Accepted |
| `delivered` | Repeat-safe; no new mutation |
| `cancelled` / `rejected` | Rejected |
| Legacy `fulfillment_type IS NULL` | Controlled manual-review response; no silent upgrade |

The existing QR validation page also continues to call `deliver_moviback_redemption` and now uses SERVICE-specific confirmation copy.

## Security model

Manual codes are delivery credentials:

- cryptographic database randomness and a large non-ambiguous alphabet are used;
- exact lookup is backed by the unique index—no full-table scan;
- the lookup/delivery endpoint requires an existing staff/admin session;
- unauthenticated/customer callers receive the existing staff guard denial before lookup;
- there is no public manual-code search route;
- raw database errors are not returned;
- request length and accepted credential formats are bounded;
- no general application rate-limiter exists in the current architecture, so no unrelated rate-limit subsystem was introduced in this phase.

## Local validation and regression findings

The local target was confirmed as unlinked Supabase at API `127.0.0.1:54321` and database `127.0.0.1:54322/postgres`; direct identity returned database/user `postgres` and container address/port `172.18.0.8:5432`.

Passed locally:

- clean `supabase db reset` with the new migration;
- B2C10 generator, 1,000-code format/uniqueness sample, backfill invariants, immediate SERVICE readiness, replay, delivery, physical readiness, immutability, point/stock stability;
- PF-08B2L lifecycle regression;
- PF-08B2R3 regression, preserving Asciugamano required variants and Tubo stockless behavior;
- B2C5/B2C6 and new route-contract tests: 16/16 PASS;
- TypeScript check;
- production build;
- clean targeted lint for the new/central B2C10 files.

The broader changed-file lint invocation still reports the repository’s existing `any`, hook-dependency, unused import, and image warnings in legacy files; B2C10 did not expand into unrelated lint cleanup.

## Rollout dependency

PF-08B2C10 depends on production B0, B1, B2R2, B2L, and B2R3. The new migration must be applied before deploying application code that selects `manual_code`. Smart redemption must remain OFF until the migration, backfill validation, application smoke, immediate SERVICE smoke, physical regression smoke, and controlled visual gate all pass.

Production execution is defined in `PF-08B2C10_ROLLOUT.md`. This implementation task did not execute it.
