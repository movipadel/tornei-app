# PF-08B2C7 — Local acceptance results

## Safety and execution context

- Revision: `44f7347 Add MoviBack staff reward queue` on `performance/foundation-2026`.
- Initial working tree: clean.
- Supabase client target: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Direct identity: database/user `postgres`; server-side container address `172.18.0.8:5432`.
- `supabase/.temp/project-ref`: absent; no project link was created.
- Application URL: `http://127.0.0.1:3100`.
- Application used process-only local Supabase credentials discovered from `supabase status`. The committed/local environment file was not changed and its Supabase target was not used.
- Telegram variables were explicitly absent from the local application process.
- All identities and data used `.invalid` or unmistakable PF08 local fixtures.

Next 16 requires an explicit bundler when a webpack configuration is present. The first normal `npm run dev` attempt reached that existing configuration diagnostic; the accepted local runs used the same development command with `--webpack`, started cleanly in 3–4 seconds, and exposed customer, staff, and admin routes.

## Evidence method

The repository has no browser runner. Acceptance used the real Next.js development application, normal user/staff/admin login endpoints, signed cookies returned by those endpoints, public and guarded application APIs, and direct local SQL assertions. No cookie was forged and no authorization bypass was introduced. Browser-control initialization was attempted twice (including a runtime reset) and failed before opening a browser because the local automation runtime could not write its kernel assets. Visual-only assertions are therefore marked **NOT EXECUTED**, while their API/database counterparts are reported independently.

## Acceptance matrix

| Case ID | Scenario | Setup | Expected | Actual | Result | Evidence/reference | Notes |
|---|---|---|---|---|---|---|---|
| START-01 | Local application startup | Local Supabase overrides; flag OFF then ON | App and primary routes load | `/`, `/moviback`, `/moviback/premi`, `/staff/login`, `/admin/login` returned success in both modes | PASS | `OFF-START`, `ON-START`; dev-server logs | Existing metadata and Browserslist warnings only |
| OFF-01 | Legacy branch selection | Flag explicitly false; classified service reward | Legacy write, no smart RPC/idempotency | Created requested redemption with NULL fulfillment; zero matching idempotency rows | PASS | `OFF-LEGACY`; SQL assertion | No silent smart fallback |
| OFF-02 | Legacy queue safety | Legacy-created row | Visible, manual repair only | `historical=true`, actions exactly `manual_review` | PASS | `OFF-QUEUE` | No automatic classification/backfill |
| OFF-03 | Customer compatibility | Legacy row and new classification columns | Customer history usable | Authenticated history returned the legacy row | PASS | `OFF-CUSTOMER` | No page/API crash |
| ON-01 | Smart catalog | Exact classification fixture | Typed reward contracts | SERVICE, Asciugamano Grigio/Lime + UNICA, and variantless Tubo returned correctly | PASS | `ON-CATALOG` | No keyword inference |
| ON-02 | SERVICE redemption | Approved member with points | Ready immediately; no Store order | Status ready, QR deliverable, Store order null | PASS | `ON-SERVICE`; DB/API | Staff action is service delivery/erogation contract |
| ON-03 | Asciugamano Grigio | Authoritative Grigio + UNICA IDs | Requested redemption and Store snapshot | One committed redemption; queue contained Grigio and UNICA | PASS | `ON-IDEMPOTENCY`, `ON-LIFECYCLE-QR`; queue payload | Full lifecycle executed |
| ON-04 | Asciugamano Lime | Authoritative Lime + UNICA IDs; new key | Distinct valid intent | Distinct committed redemption and Lime snapshot | PASS | `ON-NEW-INTENT`; DB/API | Later rejected for refund test |
| ON-05 | Missing Asciugamano variant | No IDs | Controlled failure, no partial state | HTTP 400 `PF08_MISSING_REQUIRED_VARIANT` | PASS | `ON-VARIANT-ERRORS` | No notification event |
| ON-06 | Invalid Asciugamano variant | Forged color UUID | Controlled failure, no partial state | HTTP 400 `PF08_INVALID_STORE_VARIANT` | PASS | `ON-VARIANT-ERRORS` | No notification event |
| ON-07 | Tubo Palline | Zero stock identities; no variant input | Store fulfillment without fabricated stock | Store order created; stock-row count remained zero | PASS | `ON-TUBO`; SQL assertion | No fake missing-stock state |
| ON-08 | One-identity false flag | One active null-size identity | Server auto-resolves identity | Redemption and Store order committed without customer input | PASS | `ON-ONE-IDENTITY` | Covers false `requires_store_variant` |
| ON-09 | Insufficient points | 10,000-point service | No partial write | HTTP 409 `PF08_INSUFFICIENT_POINTS` | PASS | `ON-POINTS` | No notification event |
| ON-10 | Insufficient Store stock | Finite last-unit identity | First reserves; second fails | First committed, second HTTP 409 `PF08_INSUFFICIENT_STORE_STOCK` | PASS | `ON-STOCK`; SQL assertion | No oversell |
| ON-11 | Same-key replay | Repeat identical Grigio request/key | Same result; no duplicate | `replayed=true`, same redemption ID, row count one | PASS | `ON-IDEMPOTENCY` | No additional notification event |
| ON-12 | New intent/new key | Same user, Lime/new key | New redemption | Distinct ID committed | PASS | `ON-NEW-INTENT` | Intended non-replay |
| QUEUE-01 | Requested → processing | Staff-signed command | Correct buttons/timestamp and authoritative reload | Requested actions matched; processing timestamp and ready/cancel/reject matched | PASS | `ON-LIFECYCLE-QR` | Real guarded API, not direct SQL transition |
| QUEUE-02 | Processing → ready | Staff-signed command | Ready timestamp, deliver-only, QR enabled | All observed in refreshed queue/customer payload | PASS | `ON-LIFECYCLE-QR` | No optimistic state used by harness |
| QUEUE-03 | Ready → delivered | QR validation route | Atomic delivered state/order | Delivery succeeded and database status became delivered | PASS | `ON-LIFECYCLE-QR` | Repeat scan also returned success |
| QR-01 | Requested/processing QR | Customer history | Token hidden | `qr_token=null`, `qr_deliverable=false` at both stages | PASS | `ON-LIFECYCLE-QR` | Database retains internal token |
| QR-02 | Ready QR | Customer history | Token visible/usable | Token present and deliverable at ready | PASS | `ON-LIFECYCLE-QR` | Used by validation route |
| QR-03 | Delivered/repeat scan | Repeat same QR delivery | Safe replay; terminal customer state | Repeat returned 200; customer token hidden and status delivered | PASS | `ON-LIFECYCLE-QR` | No points/stock mutation |
| QR-04 | Cancelled QR | Cancelled finite-stock request | Unusable | QR read returned `valid=false` | PASS | `ON-CANCEL-REJECT` | Rejected state covered by lifecycle regression |
| CANCEL-01 | Cancel before commitment | Finite-stock request, stable command key | One refund/release/order cancellation | One refund; Store stock restored 0→1; repeated action did not repeat mutation | PASS | `ON-CANCEL-REJECT`; SQL assertions | Exact-once behavior |
| REJECT-01 | Reject before delivery | Lime request | One refund and terminal state | One refund row; lifecycle RPC success | PASS | `ON-CANCEL-REJECT`; SQL assertion | Linked fulfillment handled by RPC |
| LEGACY-01 | Historical/manual repair | Seed legacy-shaped row | Visible, no safe command, no backfill | Historical true, manual-review only, fulfillment remained NULL | PASS | `ON-LEGACY`; SQL assertion | No mutation on read |
| AUTH-01 | Anonymous/customer queue access | No cookie / signed customer cookie | Denied | Both queue reads returned 403 | PASS | `OFF-AUTH`, `ON-AUTH` | Normal auth mechanisms |
| AUTH-02 | Customer lifecycle command | Signed customer cookie | Denied | Transition returned 403 | PASS | `OFF-AUTH`, `ON-AUTH` | No direct RPC exposure |
| AUTH-03 | Staff/admin access | Signed staff/admin logins | Correct queue access | Staff page/API and admin page returned 200 | PASS | `OFF-AUTH`, `ON-AUTH` | Password verification RPC used normally |
| UI-01 | Visual catalog and clicks | Local browser control | Observe rendered selectors/buttons | Browser-control runtime failed before target creation | NOT EXECUTED | Kernel-assets initialization error after retry/reset | API contract and pages themselves passed |
| UI-02 | Visual staff queue | Local browser control | Observe cards/buttons/timestamps | Browser-control runtime failed before target creation | NOT EXECUTED | Same environment error | Queue payload/lifecycle passed end-to-end |
| NOTIFY-01 | Safe notification behavior | No Telegram credentials | No production message; scheduling semantics observable | Six new successes produced six local skipped-transport events; replay and failures produced none | PASS | Dev-server log + route contract tests | See notification record |

## Summary

- PASS: 30 cases.
- FAIL: 0 cases.
- NOT EXECUTED: 2 visual-only cases because the browser-control runtime failed before opening a browser.
- The complete business path was nevertheless exercised through the running application with real signed sessions and direct postcondition checks.

No application defect was discovered, so no application code or migration was changed.
