# MOVIPadel Performance Optimization Candidates — Phase 2B

## Prioritization basis

These are candidates for later design and implementation. Nothing was implemented in Phase 2B. Priority reflects request frequency, user visibility, architectural amplification, consistency risk, and current live scale.

| Priority | Candidate | Affected area | Confirmed evidence | Current production relevance | User-perceived benefit | Complexity | Regression risk | DB change | Runtime measurement first |
|---|---|---|---|---|---|---|---|---|---|
| P0 | Separate Home data by freshness; stop 15s polling of settings and identity; use mutation/focus-aware refresh | Home | Six no-store calls every 15s; 1 settings row, 2 circuits, 203 users | **High now** due frequency, independent of table size | **VERY HIGH** | MEDIUM | MEDIUM | NO | YES |
| P0 | Reduce full-state 5s live polling through conditional/versioned responses, short active-run cache, or event/delta delivery | Public live tournaments | 12 requests/viewer/min, 3–5 DB calls each; small but repeatedly rebuilt run graph | **High during live events** | **VERY HIGH** | HIGH | HIGH | POSSIBLE | YES |
| P0 | Move checkout and store-linked reward redemption into an atomic transactional database operation | Store/rewards | Per-item reads/writes, balance read/debit, separate order/items/stock, no trigger/RPC | **High for latency and correctness**, despite 15 orders | **HIGH** | VERY HIGH | VERY HIGH | YES | YES |
| P1 | Remove external provider calls from interactive critical path with post-commit dispatch; use durable outbox if delivery matters | Checkout, registrations, membership, rewards | Resend/Telegram/push awaited after writes; no retry/outbox table | **High if providers contribute latency; timing unknown** | **HIGH** | HIGH | HIGH | POSSIBLE/YES for outbox | YES |
| P1 | Replace transferred full-ledger balance scans with DB aggregation; consolidate member summary and add member/time index if plans support it | MoviBack/staff/checkout/rewards | 489 ledger rows; PK-only; duplicate scans and repeated sums | **Medium now**, **high growth risk** | **HIGH** | MEDIUM–HIGH | HIGH | YES for RPC/index; NO for simple aggregate query | YES |
| P1 | Batch circuit ranking retrieval across groups and remove per-circuit browser fan-out | Public/admin circuits | 2 circuits, 5 groups, 300 results; `1+C` browser and per-group DB loop | **Medium now**, request latency is real | **HIGH** | MEDIUM | MEDIUM | NO, RPC optional | YES |
| P1 | Batch latest-certificate enrichment for pending memberships | MoviBack admin requests | `1+N` calls; 105 certificates; no user/date index | **Medium when review queue used** | **MEDIUM–HIGH** | LOW–MEDIUM | LOW | NO; index possible later | NO for batching |
| P1 | Add pagination/period filtering and database aggregation to order economics/history | Store admin | 15 orders now; normal-order month filter absent; full nested history returned | **Low now**, **high future risk** | **MEDIUM now**, **HIGH later** | MEDIUM | MEDIUM | POSSIBLE | YES before DB aggregation |
| P1 | Make run start/close transactional and idempotent, potentially via purpose-built RPCs | Baraonda/fixed-pair admin | 8–12 sequential operations; no trigger/RPC transaction boundary | **Medium current latency; high correctness value** | **HIGH** | VERY HIGH | VERY HIGH | YES | YES |
| P1 | Make registration capacity, cancellation compaction, reserve promotion, and reorder set-based/transactional | Registration/admin | Existing composite lookup index; row-by-row writes; no trigger | **Medium during registration operations** | **HIGH** during busy events | HIGH | HIGH | YES likely | YES |
| P2 | Parallelize independent MoviBack summary reads after membership resolution and avoid the second ledger fetch | MoviBack page | Up to six sequential reads; recent/all ledger duplication | **Medium now** | **MEDIUM–HIGH** | MEDIUM | LOW–MEDIUM | NO | NO for duplicate removal; YES for timing baseline |
| P2 | Share user/membership context within Home bootstrap and avoid repeated identity reads | Home/private APIs | User and membership resolved by independent endpoints; no user index on memberships | **Medium due request cadence** | **MEDIUM** | MEDIUM | MEDIUM | NO; index possible | YES |
| P2 | Add targeted member/history indexes only after plans: ledger, membership user, certificate latest, redemption history | MoviBack | Exact predicates lack close indexes; tables remain small | **Low current scan cost**, high future preparation | **LOW–MEDIUM now**, **HIGH later** | LOW–MEDIUM | LOW–MEDIUM | YES | YES |
| P2 | Narrow broad selects and avoid duplicated category/line/catalog payloads | Store, live, rewards, communications, admin | Multiple wildcard/nested selects and overlapping endpoints | **Low–medium; bytes unmeasured** | **MEDIUM** | LOW–MEDIUM | LOW–MEDIUM | NO | YES for payload prioritization |
| P2 | Replace admin run page's internal same-origin API fetches with shared server data functions | Tournament run admin | Server page calls two guarded HTTP endpoints | **Medium per operator load** | **MEDIUM** | MEDIUM | MEDIUM | NO | YES |
| P2 | Use precise invalidation/local patching after score and registration mutations instead of full list/page reload | Tournament admin/live scoring | `router.refresh()` and two-list reload patterns | **Medium during operations** | **MEDIUM–HIGH** | MEDIUM–HIGH | HIGH | NO | YES |
| P2 | Align public list/cache policy with Workbox behavior and isolate private API caching | PWA/all pages | no-store application fetches plus NetworkFirst API cache with 10s fallback | **Potentially high on weak mobile networks; unknown** | **MEDIUM–HIGH** | HIGH | HIGH | NO | YES |
| P2 | Introduce responsive image sizing/optimization and verify remote CDN headers | Home, tournaments, circuits, rewards, store | At least 21 raw images; no detected Next image component | **Unknown until HAR/LCP; likely mobile relevance** | **MEDIUM** | MEDIUM | LOW–MEDIUM | NO | YES |
| P2 | Cache poster renders by tournament/update/template version and avoid double fetch | Admin tournament poster/share | Satori/Resvg plus `no-store`; possible blob then URL request | **Action-specific** | **MEDIUM** | MEDIUM | LOW–MEDIUM | NO | YES |
| P2 | Make player-key merge set-based and transactional | Circuit maintenance | Nested read/check/update-delete loop; unique result constraint exists | **Low-frequency now** | **MEDIUM** for admins | HIGH | HIGH | YES likely | YES |
| P3 | Remove or defer public navigation admin-session probe where admin controls are irrelevant | Public navigation | One `/api/admin/me` request per public page | **Pervasive but small** | **LOW** | LOW | LOW | NO | NO |
| P3 | Persist product sort order in a batch/set-based operation | Store admin | One update per product; 31 products | **Low** | **LOW** | MEDIUM | MEDIUM | POSSIBLE | NO |
| P3 | Review composite future-growth indexes for runs, circuit result ordering, tournaments, and fixed-pair match ordering | Tournament/circuit | Partial predicate alignment; all tables currently tiny | **Not a current priority** | **LOW now** | LOW–MEDIUM | LOW | YES | YES |
| P3 | Review case-folded staff email uniqueness/index | Staff/admin login | RPC uses `lower(email)`; case-sensitive unique index; 8 users | **Negligible performance relevance** | **LOW** | LOW | MEDIUM correctness | YES | YES |

## Quick wins

The following meet the requested test: low/medium implementation complexity, low regression risk, and meaningful benefit. They still require normal tests and rollout discipline.

### 1. Remove stable Home resources from the 15-second timer

Keep `/api/app-settings` and `/api/user/me` on initial/session or explicit mutation refresh. Current metadata shows one settings row; identity changes only through known actions. This removes eight API requests per steady-state minute per client across these two endpoints alone. Complexity: **LOW–MEDIUM**. Risk: **LOW** if explicit login/logout/profile refresh is retained. Database change: **NO**.

### 2. Batch pending-membership certificates

Fetch certificate rows for all pending `user_id` values in one request and choose the latest per user in server code, preserving output shape. This changes `1+N` database operations to approximately two without schema changes. Complexity: **LOW–MEDIUM**. Risk: **LOW**. Current benefit depends on pending count but removes a confirmed burst pattern.

### 3. Parallelize independent MoviBack reads

After membership is known, recent activity, redemptions, and certificate reads are independent. Run them concurrently and remove the duplicate full-ledger transfer by using a single aggregation/result strategy. Complexity: **MEDIUM**. Risk: **LOW** for parallel reads; balance-query change needs characterization tests. Database change: **NO** for query restructuring.

### 4. Narrow the clearest broad payloads

Replace wildcard selections where rendered fields are statically known, beginning with live fixed-pair matches, store reference lists, promotions, and order mutation return rows. Complexity: **LOW–MEDIUM**. Risk: **LOW** after consumer-field tests. Expected benefit is meaningful mainly for mobile payload/serialization and future growth.

### 5. Defer the public admin-session navigation probe

Load admin state only when an admin-only affordance is needed or reuse known session context. Complexity: **LOW**. Risk: **LOW**. Benefit per request is small, but it applies to every public navigation.

### 6. Prevent redundant post-mutation list reloads where the mutation response already identifies the change

Start with admin screens that currently reload both registrations and the entire tournament list. Patch local state or refresh only the affected resource while preserving an explicit full-refresh fallback. Complexity: **MEDIUM**. Risk: **LOW** for isolated, well-characterized operations. Database change: **NO**.

## Candidates that should not be treated as quick wins

- Moving notification calls “into the background” without deciding delivery/retry semantics can silently lose operational messages.
- Checkout, rewards, run close, and registration capacity changes require concurrency/idempotency design, not merely fewer awaits.
- Adding several indexes to tiny tables without plans can increase maintenance without measurable benefit.
- Replacing polling with Realtime/WebSockets changes synchronization, authorization, recovery, and infrastructure behavior.
- Caching authenticated API responses without resolving Workbox user separation risks stale or cross-session data.

## Recommended implementation sequence after Phase 2C

1. Establish timings and freshness requirements.
2. Apply Home stable-resource quick wins and remove confirmed duplicate reads.
3. Batch circuit/certificate fan-out and reduce broad payloads.
4. Add measured pagination/report filtering and image/poster improvements.
5. Design and test transactional checkout/redemption.
6. Design transactional registration/run workflows.
7. Add only plan-validated indexes.
8. Consider event-driven live updates after simpler conditional/cache approaches are measured.

