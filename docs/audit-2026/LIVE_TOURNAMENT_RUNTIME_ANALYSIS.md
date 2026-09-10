# MOVIPadel Live Tournament Runtime Analysis — Phase 2C

## Measurement status

No active live tournament was exposed by the seven upcoming tournaments returned during the audit. A representative live response could therefore not be measured without querying private data or mutating production. Payload size, server transformation time, unchanged-response rate, and browser render cost are **NOT YET MEASURED**.

The polling implementation, database operation count, full-state reconstruction, and amplification are **STATICALLY CONFIRMED/ESTIMATED**.

## Exact polling implementation

`src/components/tournaments/TournamentLiveDialog.tsx:637` performs:

`GET /api/tournaments/{tournamentId}/live` with `cache: "no-store"`.

`src/components/tournaments/TournamentLiveDialog.tsx:660-664` invokes it immediately when the dialog effect starts and schedules `setInterval(load, 5000)`. The interval is cleared on effect cleanup. There is no ETag/version, `If-None-Match`, last-update cursor, or delta parameter in the client request.

One open dialog therefore produces one API request per refresh, 12 steady-state refreshes/minute, plus the initial immediate request.

## Server work per refresh

Common first operation in `src/app/api/tournaments/[id]/live/route.ts:109-116`:

1. Read newest running/finished `tournament_runs` row by tournament, status and creation time.

Optional mixed-category work reads registrations for gender metadata.

### Baraonda branch

2. Read run participants.
3. Read turns with nested matches, ordered by turn number.
4. Rebuild player maps, turn data, resting state, games/matches/standings and sorting in Next.js.

Typical database operations: **3**, or **4** with the mixed registration read.

### Fixed-pair branch

2. Read pairs.
3. Read groups.
4. Read group-pair assignments when groups exist.
5. Read all fixed-pair matches and sort by stage/start/creation.
6. Reconstruct groups, rounds, bracket, standings and presentation rows in Next.js.

Typical database operations: **5**, with conditional variation. `select("*")` transfers every fixed-pair match column.

The handler returns the complete visible state each time; there is no unchanged short circuit. Even if only one score changes, run metadata, static participants/pairs/groups, all turns/matches, and derived standings/bracket are re-read/rebuilt.

## Current live-table scale and index context

Across all runs, production metadata estimates:

- 32 runs;
- 140 Baraonda participants;
- 202 turns;
- 232 Baraonda matches;
- 109 fixed pairs;
- 31 groups;
- 109 group-pair assignments;
- 219 fixed-pair matches.

Run/turn/group predicates have plausible supporting indexes. Per-run distribution and active-run size are unknown. Current total data volume makes a large-table scan an unlikely general cause; repeated remote round trips and full recomputation are stronger mechanisms.

## Architectural amplification

| Concurrent viewers | API requests/minute | Estimated DB operations/minute |
|---:|---:|---:|
| 1 | 12 | 36–60 |
| 10 | 120 | 360–600 |
| 30 | 360 | 1,080–1,800 |
| 100 | 1,200 | 3,600–6,000 |

The immediate opening load adds one API request and about 3–5 database operations per viewer to the first minute. These are workload calculations, not Supabase capacity limits.

## Frequently changing versus stable data

| Data | Change frequency while live | Current treatment |
|---|---|---|
| Match scores/completion | Frequent during scoring | Full reread every 5s |
| Derived standings/bracket advancement | Changes after score completion | Fully recomputed every 5s |
| Run status | Infrequent | Reread every 5s |
| Participant/pair names | Normally static after run snapshot | Reread every 5s |
| Groups/group assignments | Static after generation | Reread every 5s |
| Turn/match schedule structure | Mostly static | Reread every 5s |
| Rules | Static for run | Reread every 5s |
| Mixed registration gender lookup | Static after registration closes | Reread conditionally every 5s |

The high-value future measurement is the proportion of responses whose score/version is unchanged. That determines whether a version check/304, brief shared cache, separated static/dynamic payload, or event/delta architecture is justified.

## Required runtime capture

For one active Baraonda and fixed-pair event, capture 65 seconds of:

- response bytes and content fingerprint per refresh;
- per-query Supabase waits;
- server aggregation/serialization time;
- browser JSON parse, React render/commit and long tasks;
- score-change timestamps;
- read-only concurrent-viewer p50/p95/error and database utilization in an authorized environment.

## Dominant causes

| Cause | Contribution |
|---|---|
| Frontend polling | VERY HIGH |
| HTTP/API round trips | VERY HIGH |
| Server logic | HIGH |
| Database round trips | VERY HIGH |
| Query design/indexes | MEDIUM, unproven |
| Database data volume | LOW currently |
| Application-side aggregation | HIGH |
| External services | LOW/none |
| Cache strategy | HIGH |

