# MOVIPadel MoviBack Runtime Analysis — Phase 2C

## Measurement status

The guest `GET /api/moviback/me` early-return path was **MEASURED** at 96 bytes and 3.2 ms median locally. It does not access member data and is not representative of an authenticated member.

No member cookie, staff action, redemption mutation, or direct SQL access was used. Authenticated timings, transferred member row counts, and query plans are **NOT YET MEASURED**. The access sequence and duplicate reads are **STATICALLY CONFIRMED**.

## Member summary flow

`src/app/api/moviback/me/route.ts` performs, sequentially:

1. `users` by authenticated user ID.
2. `loyalty_memberships` by `user_id` with `.maybeSingle()`.
3. Latest 20 `loyalty_transactions` by membership, ordered newest.
4. All `loyalty_transactions.points_delta` for the same membership.
5. Latest 10 `reward_redemptions` with reward relation.
6. Latest `medical_certificates` by user/upload time.

The route sums step 4 in application memory. Steps 3 and 4 are duplicate access to the same ledger history for different projections. After login, `src/app/moviback/page.tsx:505` explicitly requests the member endpoint again. Home and communications independently repeat user/membership context.

Current live metadata:

| Table | Estimated total rows | Relevant index |
|---|---:|---|
| `loyalty_memberships` | 93 | PK and unique membership code; no user-ID index/unique |
| `loyalty_transactions` | 489 | PK only; no membership/time index |
| `medical_certificates` | 105 | PK only; no user/upload-time index |
| `reward_redemptions` | 51 | PK, status, partial unique QR; no member/request-time index |

The ledger averages about 5.3 rows per membership if evenly distributed, but actual distribution can be highly skewed and was not exported. Total scale is too small for row volume alone to explain major latency. Six serial application-to-Supabase calls can still accumulate remote latency.

## Staff lookup and accreditation

Staff lookup performs four sequential reads:

1. Membership by unique membership code.
2. User by primary key.
3. All member transaction deltas and application-side sum.
4. Latest certificate by user/upload time.

Accreditation performs:

1. Membership by code.
2. Latest eligible individual promotion; if none, global promotion query.
3. Insert loyalty transaction.
4. Read all member transaction deltas again and sum for returned balance.

The membership-code predicate is strongly indexed. Promotion tables have zero estimated rows and cannot currently explain slowness by volume. Ledger/certificate predicates lack close indexes but remain small. Accreditation timing was not measured because it is state-changing.

## Redemption flow

The reward redemption handler statically confirms this dependent sequence:

1. Membership by unindexed `user_id`.
2. Reward by PK.
3. For store-linked rewards: product, color, active sizes, optional selected size, then exact stock.
4. All ledger deltas and application-side balance sum.
5. Redemption insert.
6. Ledger debit insert.
7. Reward stock update and optional store stock update using previously read quantities.
8. Optional user read, store order insert and item insert.
9. Await Telegram, then await admin push/subscription delivery.

The exact product/variant/stock predicates have PK/composite index support. The dominant concern is sequential round trips plus non-atomic read/check/write, not table size or proven lookup slowness.

## Payload and row-transfer status

- Guest member summary: **MEASURED**, 96 bytes.
- Authenticated recent ledger: statically capped at 20 rows, payload **NOT YET MEASURED**.
- Authenticated balance ledger: all rows for one member, count **NOT YET MEASURED**.
- Redemptions: statically capped at 10 rows, payload **NOT YET MEASURED**.
- Certificate: statically capped at 1 row.
- Admin member list: transfers deltas for all returned memberships, currently bounded by 489 total ledger rows but unpaginated.

## Query timing and EXPLAIN status

No `EXPLAIN` was executed because direct live SQL is not authorized. `QUERY_PLAN_TARGETS.md` provides safe SELECT-only templates for:

- membership by user;
- recent ledger rows;
- database-side `SUM(points_delta)`;
- latest certificate.

The current cardinalities predict small absolute scan work, but only plans can establish actual scan/index/sort behavior and remote query time.

## Optimization evidence status

| Candidate | Evidence |
|---|---|
| Parallelize independent post-membership reads | **STATICALLY CONFIRMED** opportunity; no timing required to prove independence |
| Stop transferring all deltas for display balance | **STATICALLY CONFIRMED** duplicate/payload work; runtime benefit not measured |
| Database aggregate or summary RPC | **JUSTIFIED FOR EVALUATION**, not selected yet |
| Member/time and certificate indexes | Predicate mismatch confirmed; current benefit **UNPROVEN** |
| Cached/maintained balance | **NOT JUSTIFIED by current size alone**; requires concurrency architecture |
| Atomic redemption/checkout RPC | Correctness and round-trip rationale confirmed; implementation requires staging tests |

## Dominant causes

| Cause | Contribution |
|---|---|
| Frontend | MEDIUM |
| HTTP/API round trips | HIGH |
| Server logic | MEDIUM |
| Database round trips | VERY HIGH |
| Query design | MEDIUM |
| Database data volume | LOW |
| Application-side aggregation | HIGH |
| External service latency | HIGH for redemption, unmeasured |
| Cache strategy | MEDIUM |

