# PF-05 — Live tournament polling foundation

## Status and scope

PF-05 is complete on `performance/foundation-2026`. It conservatively reduces avoidable live-tournament work without caching competitive state, changing the five-second visible refresh cadence, altering tournament rules, changing database structures, or introducing Supabase Realtime.

Changed files:

- `src/components/tournaments/TournamentLiveDialog.tsx`
- `src/app/api/tournaments/[id]/live/route.ts`
- `docs/performance-2026/PF-05_LIVE_TOURNAMENT.md`

No admin scoring handler, staff workflow, schema, migration, index, dependency, or unrelated module was changed.

## Original live architecture

`TournamentLiveDialog` is rendered from the public tournament experiences, including Home and tournament cards. Opening a dialog immediately called:

`GET /api/tournaments/{tournamentId}/live` with `cache: "no-store"`

The component then used `setInterval(load, 5000)`. Cleanup stopped the interval when the dialog closed or the component/tournament changed. The timer did not check `document.visibilityState`, and `load()` had no in-flight guard. Consequently:

- one normally responsive open dialog initiated 12 steady requests per minute plus its initial request;
- the same work continued while the tab was hidden;
- a response taking longer than five seconds could overlap with a later refresh and allow responses to resolve out of order;
- separate open components/browser tabs/viewers independently polled the same tournament;
- every successful response replaced the complete client state, even when nothing changed.

The public endpoint has no authorization gate and that behavior remains unchanged. It first loads the newest `running` or `finished` `tournament_runs` row for the tournament. If none exists, it returns `{ "status": "no-run" }` after one database operation.

### Baraonda endpoint work before PF-05

After the run lookup, the endpoint sequentially loaded:

1. mixed-category registration name/gender data, when applicable;
2. run participants;
3. turns with nested matches.

It rebuilt name/rest maps, normalized every turn and match, found the current turn, accumulated all standings, and sorted standings in Next.js. This was three database operations for a normal event or four for a mixed event, across three or four sequential database latency stages.

### Fixed-pair endpoint work before PF-05

After the run lookup, the endpoint sequentially loaded:

1. mixed-category registrations when the run category was mixed;
2. pair snapshots;
3. groups;
4. group/pair assignments when groups existed;
5. every fixed-pair match using `select("*")`.

It rebuilt effective bracket participants, rounds, normalized matches, group standings, group presentation data, and bracket-round mappings in Next.js. A grouped fixed-pair run used five database operations normally and six when mixed, across five or six sequential latency stages. The mixed registration result populated a sex map used only by the later Baraonda branch, so that query could not affect any fixed-pair response.

No ETag, change cursor, existing row version, reliable `updated_at`, conditional response, server cache, or event subscription was present. Complete unchanged state was resent and recomputed on every poll.

## Freshness classification

Classification is based on the read handler and the directly relevant start, bracket-generation, reset, and score-update paths.

| Dataset/field | Classification | Evidence and treatment |
|---|---|---|
| Run ID and mode | STATIC DURING CURRENT RUN | Selected when a run starts; a reset/restart produces a different newest run. Still reread each poll to detect replacement. |
| Run rules/category | STATIC DURING CURRENT RUN | Created with the run and consumed by scoring/presentation. No cache was introduced. |
| Run status and `no-run` state | SLOW-CHANGING | Changes at start/finish/reopen and must remain observable. Reread every visible poll. |
| Participant IDs/names | STATIC DURING CURRENT RUN | Snapshot created during run setup. Used for names and resting players. |
| Fixed-pair IDs/names | STATIC DURING CURRENT RUN | Snapshot created during fixed-run setup. |
| Groups and group/pair assignments | STATIC AFTER GENERATION | Created by fixed-run setup and used for group display/standings. |
| Baraonda turn/match schedule and player slots | STATIC AFTER GENERATION | Generated before scoring; reset/regeneration can replace the run graph. |
| Court/start-time configuration | STATIC AFTER GENERATION | Score handlers do not edit these fields. |
| Registration gender lookup | STATIC AFTER REGISTRATION CLOSE | Required only for mixed Baraonda standings presentation; not used by fixed-pair output. |
| Baraonda games and completion | LIVE | Score PATCH updates games and `completed_at`. |
| Fixed games, sets, and completion | LIVE | Fixed score PATCH updates set/game totals and completion. |
| Fixed bracket home/away IDs | LIVE | Bracket progression can populate or clear downstream participants. |
| Fixed bracket match collection | SLOW-CHANGING/LIVE AT GENERATION | Bracket generation can insert match rows; the full match query remains on every visible poll. |
| Current turn, standings, progress | LIVE DERIVED | Recomputed from current matches on each visible response. |
| Group standings and bracket projection | LIVE DERIVED | Recomputed from group/bracket matches on each visible response. |

Static data remains fetched on visible polls because safely separating it would require a versioned contract or cache invalidation design. PF-05 does not risk stale names, schedules, groups, rules, or bracket structures.

## Exact changes

### Visibility-aware polling

The five-second interval now calls the endpoint only while `document.visibilityState === "visible"`. A `visibilitychange` listener triggers an immediate refresh when the tab becomes visible again. Opening the dialog still refreshes immediately, and closing it still clears all timer/listener work.

This preserves visible freshness while eliminating all steady live requests, database operations, payloads, and recomputations from a hidden tab.

### Single-flight refreshes

One dialog instance now permits only one request at a time. If the interval or visibility return fires during an active request, one follow-up refresh is queued and starts immediately after the active request completes, provided the dialog is still open and visible.

This prevents overlapping requests and out-of-order state replacement. It does not globally deduplicate separate dialogs, browser tabs, processes, or viewers.

### Parallel independent reads

- Baraonda registration metadata (when mixed), participants, and turns/matches now start together after the required run lookup.
- Fixed pairs, groups, and matches now start together after the required run lookup. Group/pair assignments remain dependent on the returned group IDs and are queried afterward.

Database operation counts are unchanged for these branches, but sequential remote-wait stages fall from three/four to two for Baraonda and from five/six to three for grouped fixed-pair runs.

### Removed an unused fixed-pair read

The mixed registration gender lookup now exists only in the Baraonda branch where its `sexByName` result is consumed. A mixed fixed-pair poll therefore falls from six to five database operations. Fixed-pair output never included or consulted that map.

### Narrowed fixed-match projection

The fixed-pair match query now selects only the fields read by bracket propagation, standings calculation, ordering, and response construction. It omits `run_id`, already known from the filter, rather than transferring all table columns. All user-visible fixed-match fields remain present.

## Before/after requests and database operations

The following steady-state figures exclude the one immediate dialog-open request. "Stages" are sequential awaited database batches; parallel Supabase requests remain separate database operations.

| One open dialog | Before | After |
|---|---:|---:|
| Visible HTTP requests/minute, normal latency | 12 | 12 |
| Hidden HTTP requests/minute | 12 | 0 |
| Maximum simultaneous requests per dialog | Unbounded by the component | 1 |
| Server recomputations/minute while visible | 12 | 12 |
| Server recomputations/minute while hidden | 12 | 0 |
| Baraonda DB operations/poll | 3 normal / 4 mixed | 3 normal / 4 mixed |
| Baraonda DB latency stages/poll | 3 normal / 4 mixed | 2 |
| Grouped fixed DB operations/poll | 5 normal / 6 mixed | 5 |
| Grouped fixed DB latency stages/poll | 5 normal / 6 mixed | 3 |

For fixed runs without groups/group assignments, both operation counts are one lower. The five-second interval was not increased.

## Workload illustration

These are deterministic cadence calculations for continuously visible, normally responsive dialogs—not capacity claims. The initial opening request and abnormal slow-response single-flight behavior are excluded.

| Visible viewers | Requests/min before | Requests/min after | Baraonda DB ops/min before/after | Fixed DB ops/min before | Fixed DB ops/min after |
|---:|---:|---:|---:|---:|---:|
| 1 | 12 | 12 | 36 normal / 48 mixed | 60 normal / 72 mixed | 60 |
| 10 | 120 | 120 | 360 normal / 480 mixed | 600 normal / 720 mixed | 600 |
| 30 | 360 | 360 | 1,080 normal / 1,440 mixed | 1,800 normal / 2,160 mixed | 1,800 |
| 100 | 1,200 | 1,200 | 3,600 normal / 4,800 mixed | 6,000 normal / 7,200 mixed | 6,000 |

If all those dialogs are hidden, the before figures continue unchanged while every after figure becomes zero until visibility returns. Server recomputations follow the HTTP request counts: 12/120/360/1,200 per minute when visible both before and after, and zero when hidden after PF-05.

### Payload/workload status

- **STATICALLY CONFIRMED:** visible API response shape and complete-state payload are unchanged.
- **STATICALLY CONFIRMED:** hidden response bytes fall from `12 × active-response-bytes` per viewer/minute to zero.
- **STATICALLY CONFIRMED:** fixed match database-to-server rows omit the unused `run_id` projection; exact byte savings depend on row count and wire representation.
- **ESTIMATED:** active-event database workloads in the table above follow the statically counted handler branches.
- **NOT MEASURED:** active Baraonda/fixed response bytes and recomputation time because no public active fixture exists.

## Optional conditional response evaluation

Conditional unchanged responses were not implemented. The audited live tables have `created_at` and score/completion fields but no reliable common `updated_at` or committed change-version column. Run timestamps do not change for every match score, and `completed_at` cannot represent partial-score edits. A process-local cache could add staleness, while hashing the complete match graph would still fetch it and would introduce a new, potentially fragile protocol without the specification's required existing change indicator.

This decision preserves exact freshness and competitive correctness.

## Freshness and correctness guarantees

- A visible open dialog retains the same five-second polling interval and immediate initial load.
- Returning from a hidden tab triggers an immediate load; timers do not accumulate hidden requests.
- A slow request cannot overlap another request from the same dialog. One pending refresh runs immediately after completion when necessary.
- Every visible response still reloads current run status and all live score/bracket inputs.
- Baraonda standings, current turn, resting players, and completion state use the same data and algorithms.
- Fixed group standings, bracket progression, match completion, sets, courts, and start times use the same data and algorithms.
- Empty/no-run responses are unchanged.
- The public endpoint and admin/staff permissions are unchanged.
- Tournament scoring, ranking, bracket, start, close, reset, and reopen handlers are untouched.

No live result was entered during validation because doing so would mutate production data and no supported local tournament fixture exists.

## Validation performed

- `npx tsc --noEmit --pretty false`: passed.
- `npm run build`: passed.
- Production build emitted only the existing outdated Browserslist-data and Next.js `themeColor` metadata warnings.
- Targeted ESLint on the two modified files reported the existing baseline of 48 `no-explicit-any` errors and one unused-helper warning; no PF-05-specific diagnostic was introduced.
- No tournament/live test or spec files are present in the repository.
- Current public tournament list: six tournaments, zero with `hasLive: true`; no safe active response fixture was available.
- Optimized production-server `no-run` smoke: seven requests all returned `200` and the unchanged 19-byte `{ "status": "no-run" }` payload; six-sample warm median was 95.19 ms.
- `git diff --check`: passed apart from Git line-ending conversion notices.

Build-generated `public/sw.js`, `public/workbox-f1770938.js`, and `tsconfig.tsbuildinfo` changes were removed and are not part of PF-05.

## Regression risk

Overall risk is low. No live data is cached or omitted from public responses, and the visible cadence and server derivation algorithms are unchanged. Parallel reads can already be in flight when another independent query fails, but error response shapes/statuses and their validation priority are retained where applicable.

The main behavioral change is intentional: hidden tabs stop updating until the immediate visibility-return request. Browsers may already throttle hidden timers unpredictably; explicit handling makes this deterministic. Single-flight behavior removes overlapping requests; under a response time longer than five seconds, a queued refresh starts immediately after completion instead of competing with the previous request.

## Deferred options

1. Add a reliable run change version maintained atomically with match/bracket mutations, then support lightweight unchanged responses.
2. Split immutable run snapshots from dynamic score state with an explicit invalidation contract.
3. Introduce Supabase Realtime or another event-based score channel with reconnect and missed-event recovery.
4. Deduplicate identical live reads across server instances/viewers using a correctness-safe shared mechanism.
5. Measure active Baraonda and fixed-pair response fingerprints, bytes, server CPU, query waits, React commits, and unchanged-response ratio in staging or an authorized live event.
6. Add characterization fixtures/tests for score entry, reset, standings, bracket advancement, completion, visibility return, and slow-request ordering.

## Rollback

Restore the two source files to their pre-PF-05 versions. This reinstates unconditional hidden five-second polling, permits overlapping loads, returns server queries to sequential execution, restores the unused fixed mixed-registration read, and restores `select("*")`. No database, dependency, environment, or deployment rollback is required.
