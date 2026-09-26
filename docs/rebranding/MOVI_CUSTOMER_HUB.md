# MOVI Customer Hub and MoviBack compliance

## Ownership boundaries

The Customer Hub is a server-side composition layer. It does not introduce a customer master table.

| Domain | Authority |
|---|---|
| Account, contacts and Auth linkage | `public.users` |
| Sporting identity and merge state | `player_identities` |
| Shared playing preferences | `player_profiles`, `player_profile_availability` |
| MOVI evaluation and internal notes | `player_admin_profiles` |
| MoviBack membership and fiscal code | `loyalty_memberships` |
| Certificate documents and review | `medical_certificates` plus private Storage |
| Points | immutable sum of `loyalty_transactions.points_delta` |
| Rewards | `rewards_catalog`, `reward_redemptions` |
| Promos | MoviBack promo tables |

Fiscal code and medical certificate data are not copied into account or Player Identity records.

## Customer Hub

`/admin/players` loads a bounded alphabetical list immediately, with a maximum of 50 rows per page. Name/phone search and identity/account filters remain available. The list exposes only coarse MoviBack and compliance badges. It does not expose fiscal code, file paths, filenames, review notes, internal notes, document URLs, points history, or redemptions.

`/admin/players/[id]` composes:

1. sporting identity;
2. account and Auth linkage;
3. shared playing profile;
4. MOVI evaluation;
5. restricted fiscal-code and certificate compliance;
6. MoviBack status, operational eligibility, points balance, correction, personal promo, recent transactions and recent redemptions.

Account and sporting fields are displayed independently. Drift generates a warning and is never synchronized automatically. Open Player Identity cases link to the existing duplicate/identity workflow.

## MoviBack boundary

`/admin/moviback` remains the global program control center for KPIs, pending requests, compliance queue, catalog, promos, reward fulfillment, communications, transactions and economics. Its former “Utenti MoviBack” quick action now opens the Customer Hub.

Legacy `/admin/moviback/users` routes remain available for bookmark compatibility during this stage, but are no longer promoted as the primary customer-management path.

## Fiscal code

The only authority remains `loyalty_memberships.tax_code`. Values are trimmed, stripped of whitespace, uppercased and required to contain 11–16 characters. This deliberately preserves the currently supported membership population and does not invent an Italian-person checksum rule without a production data audit.

The Customer Hub masks the value by default. Full reveal and editing are available only in the Admin detail endpoint. The list and player matching endpoints never return it.

## Certificate authority and review

Each upload creates a new `medical_certificates` row with `pending_review`; historic rows remain intact. Upload never means approval.

Admin review:

- verifies that the row has a file path and that Storage can create a short-lived signed URL;
- writes `approved` or `rejected`;
- records `reviewed_at` and `reviewed_by`;
- stores the optional approval note or mandatory rejection reason.

Initial membership approval explicitly approves the latest submitted certificate first and then validates eligibility. Replacement certificates can be reviewed either from the customer detail or the global MoviBack request/compliance queue. Both paths use the same fields and review semantics.

The user DTO no longer exposes raw Storage paths. Document preview remains Admin-only and uses five-minute signed URLs. Local Storage privacy still requires the verified local bucket setup; hosted bucket configuration was not inspected.

## Central eligibility contract

`src/lib/movibackEligibility.ts` is the pure business contract. `src/lib/movibackEligibilityServer.ts` loads the authoritative records. The result includes:

- membership and certificate states;
- `active`, `grace_period`, `standby`, `pending_review`, or `blocked`;
- separate `can_earn_points`, `can_redeem`, and `can_use_card`;
- upload/review needs;
- days expired and days left in grace;
- stable reason code and human message.

The server contract is used by the user view, staff point earning, reward redemption, voluntary reactivation, direct Admin status changes and membership approval.

Membership status and operational eligibility remain independent. Certificate expiry does not destructively rewrite the membership lifecycle state.

## Calendar rule

All expiry calculations use calendar dates in `Europe/Rome`. A date-only value is converted to a UTC day number only after strict calendar validation, avoiding DST-hour differences.

- Expiry date itself: valid.
- 1–60 calendar days after expiry: grace period.
- More than 60 calendar days: standby.

## Grace period

During grace:

- earning points remains enabled;
- reward redemption remains enabled;
- card and QR remain enabled;
- the user sees a confirmation modal on every fresh MoviBack page open;
- dismissal lasts only for the current component mount;
- the modal is never persisted in localStorage.

A pending replacement does not cancel the previously approved certificate’s grace period.

## Standby

After 60 expired days:

- only point earning is blocked;
- balance, history, card, QR and reward redemption remain available;
- the user sees an explicit standby warning and certificate-upload action;
- a pending replacement leaves the membership in standby;
- approval of the new valid certificate restores active eligibility.

Staff receives:

> MoviBack in stand-by: certificato medico scaduto da oltre 60 giorni. Aggiorna il certificato per riattivare l’accumulo punti.

Admin point corrections remain ledger corrections and are not treated as staff earning.

## Activation and reactivation

Activation and reactivation require:

- exactly one membership;
- active account state;
- normalized fiscal code;
- an approved certificate with a valid date;
- eligibility in active or grace state;
- an otherwise valid membership lifecycle.

A pending, rejected, missing or more-than-60-days-expired certificate cannot activate or reactivate a membership. The consent field remains part of the server model; this stage does not retroactively block existing memberships because the prior user flow did not collect an explicit health-data consent action.

## Cardinality

No uniqueness constraint was added. The application now detects more than one membership, returns `MEMBERSHIP_CARDINALITY`, and refuses enrollment/eligibility-sensitive actions. A hosted preflight and remediation are required before a future `UNIQUE (user_id)` migration.

## Matching isolation

Player Search and future matching continue to use only Player Identity, Player Profile and Player Admin Profile. They do not use or expose fiscal code, certificate data, membership state, points or rewards.

## Local fixtures and acceptance

The fixture `supabase/tests/fixtures/customer_hub.local.mjs` is guarded by both:

- `CUSTOMER_HUB_LOCAL_VERIFIED=1`
- exact loopback URL `http://127.0.0.1:55021`

It creates synthetic Customers A–G, private synthetic PDF objects, certificate history, transactions, a personal promo, a redemption and a staff account.

User URL: `http://localhost:3100/moviback`

| Scenario | Login | Password |
|---|---|---|
| Valid | `customer-hub-a@example.invalid` | `CustomerHub-Local-2026!` |
| Grace, expired 20 days | `customer-hub-b@example.invalid` | same |
| Standby, expired 70 days | `customer-hub-c@example.invalid` | same |
| Standby with pending replacement | `customer-hub-d@example.invalid` | same |
| Newly approved/active | `customer-hub-e@example.invalid` | same |
| No membership | `customer-hub-f@example.invalid` | same |
| Pending initial activation | `customer-hub-g@example.invalid` | same |

Admin:

- `http://localhost:3100/admin/players`
- `http://localhost:3100/admin/moviback`
- login `padelleria-admin@example.invalid`
- password `Padelleria-Local-2026!`

Staff:

- use the existing local staff login/point-award surface;
- login `customer-hub-staff@example.invalid`;
- password `CustomerHub-Staff-2026!`;
- membership codes `MOVI-HUB-A`, `MOVI-HUB-B`, and `MOVI-HUB-C` cover active, grace and standby.

The fixture must never run with hosted credentials.

## Future production rollout considerations

Before rollout:

1. run a read-only membership-cardinality preflight;
2. reconcile any duplicate memberships;
3. audit approved memberships without approved certificates;
4. confirm the product/legal requirement and versioned evidence for health-data consent;
5. configure and verify the private certificate bucket and Storage policies;
6. reconcile the local migration ledger drift before adding migrations;
7. test Rome date boundaries around midnight and daylight-saving changes;
8. validate review permissions and audit retention;
9. stage the Hub with a controlled Admin group;
10. monitor eligibility reason-code rates, failed reviews and staff standby blocks.

No production system was accessed while implementing this stage.
