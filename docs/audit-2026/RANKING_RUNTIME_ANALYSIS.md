# MOVIPadel Circuit Ranking Runtime Analysis — Phase 2C

## Public browser-to-database trace

Public circuit list:

`Home -> GET /api/circuits -> circuits -> ranking groups -> circuit results -> JS count/distinct-stage aggregation -> 665-byte response`

**MEASURED:** 221.5 ms median locally across seven warm optimized-server requests. **STATICALLY CONFIRMED:** three sequential Supabase operations at current data.

Public detail:

`/circuiti/[slug] client effect -> GET /api/circuits/[slug] -> circuit by slug -> ranking groups -> future circuit tournaments -> for each group sequential circuit_results -> JS player/stage grouping and sorting -> JSON -> React render`

The static HTML/dynamic shell was **MEASURED** at 12,203 bytes and 10.0 ms median, but useful ranking content waits for the client API.

## Measured current circuits

| Current ranking groups | DB operations (`3 + G`) | Payload | Median ms | Average ms | Range ms |
|---:|---:|---:|---:|---:|---:|
| 1 | 4 | 10,682 B | 308.0 | 313.8 | 286.4–376.0 |
| 4 | 7 | 30,240 B | 515.7 | 517.4 | 503.0–535.0 |

Production metadata reports two circuits, five total groups and 300 result rows. The four-group response was about 1.67× the median latency and 2.83× the bytes of the one-group response. This supports, but does not alone quantify, the per-group query and larger-result effect.

## Admin one-request-per-circuit behavior

`src/app/admin/circuits/page.tsx` first loads `/api/admin/circuits`, then creates one ranking request per circuit. The two ranking requests can run in parallel only after the circuit list returns. Each handler reads circuit + groups and loops over group results sequentially.

With the current two circuits and group distribution of one and four:

- browser requests for the admin overview: **3** (`1 + C`);
- estimated database operations: about **10** (`1 + (2+1) + (2+4)`), assuming the list endpoint's normal one-query path;
- browser latency stages: list first, then two ranking responses in parallel;
- protected admin timing/payload: **NOT YET MEASURED** because no admin session was used.

## N+1 and sequential dependencies

Confirmed dependencies:

1. Circuit must be resolved to obtain its ID.
2. Ranking groups must be read to obtain group IDs.
3. The current implementation queries each group's results sequentially.
4. Application aggregation cannot finish until all group queries finish.

Future tournaments do not depend on groups and could run in parallel after circuit resolution. All result groups can be fetched in one `.in(ranking_group_id, ids)` operation without changing ranking rules, then partitioned in memory.

## Application-side aggregation

For every group, the server:

- normalizes/groups result rows by player key;
- sums points and event counts;
- sorts rankings with tie behavior;
- builds played-stage collections and sorts their results;
- on admin routes, derives possible duplicate names/keys/phones.

Database volume is low, so current CPU cost is not assumed large. Server transformation timing is **NOT YET MEASURED**. The response bytes demonstrate that aggregation output is already materially larger than the circuit list.

## Minimum database operations without behavior change

- Current public detail: `3 + G`, currently 4 or 7.
- Batched application approach without a new RPC: 4 calls total — circuit, groups, future tournaments, all group results — with groups/future parallel after circuit, then one result call.
- Theoretical database minimum: 1 call through a purpose-built read-only RPC/query returning circuit, groups, future tournaments, and calculated ranking payload.
- Admin overview without RPC: approximately 3 calls for all circuits, all groups, and all relevant results, followed by current aggregation.
- Theoretical admin minimum: 1 aggregate RPC.

One RPC is not automatically the preferred design; it increases SQL contract complexity. Batching to four/three operations is a lower-risk intermediate target.

## Runtime evidence classification

- Public list/detail timings and payloads: **MEASURED**.
- One-query-per-group and one-request-per-circuit: **STATICALLY CONFIRMED**.
- Admin overview count at current `C/G`: **ESTIMATED**.
- Server aggregation share, admin payload, browser render: **NOT YET MEASURED**.
- Result-query plan: **NOT YET MEASURED**; safe target prepared.

## Dominant causes

| Cause | Contribution |
|---|---|
| Frontend | MEDIUM |
| HTTP/API round trips | HIGH |
| Server logic | HIGH |
| Database round trips | VERY HIGH |
| Query design/index | LOW–MEDIUM; group index exists |
| Database data volume | LOW currently |
| Application-side aggregation | HIGH |
| External services | LOW/none |
| Cache strategy | MEDIUM |

