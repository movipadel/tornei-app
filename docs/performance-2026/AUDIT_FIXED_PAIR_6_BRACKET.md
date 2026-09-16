# Fixed-Pair Six-Qualifier Bracket Audit

## Scope and status

Audit only. This document traces the current fixed-pair `groups_and_bracket` flow for exactly six qualifying pairs from two groups of three. No source, database, configuration, tournament rule, or migration was changed.

## 1. Current six-pair flow

1. An admin configures a fixed-pair run in `src/app/admin/tournaments/FixedPairsGenerateWizard.tsx` and starts it through `POST /api/admin/tournaments/[id]/fixed/run/start` in `src/app/api/admin/tournaments/[id]/fixed/run/start/route.ts`.
2. The start route persists the run, groups, group membership, and round-robin group matches. It does **not** create the final bracket for `groups_and_bracket`.
3. The admin run screen, `src/app/admin/tournaments/[id]/run/FixedPairsRunClient.tsx`, shows **Genera tabellone finale** only when the run format is `groups_and_bracket`, the run status is `running`, every group match has `completed_at`, and no bracket row exists.
4. The button calls `POST /api/admin/tournaments/[id]/run/bracket`, implemented by `src/app/api/admin/tournaments/[id]/run/bracket/route.ts`.
5. That route re-reads all group matches and recalculates standings in memory. It rejects a group match without a valid winner.
6. It selects qualifiers, assigns global seeds, inserts `stage = 'bracket'` rows, and stores a `bracketDraw` seed snapshot in `tournament_runs.rules`.
7. Admin data is read by `GET /api/admin/tournaments/[id]/run` in `src/app/api/admin/tournaments/[id]/run/route.ts`; public data is read by `GET /api/tournaments/[id]/live` in `src/app/api/tournaments/[id]/live/route.ts` and displayed by `src/components/tournaments/TournamentLiveDialog.tsx`.
8. Result entry is handled by `PATCH /api/admin/tournaments/[id]/fixed/run/match/[matchId]` in `src/app/api/admin/tournaments/[id]/fixed/run/match/[matchId]/route.ts`. Its `autoAdvanceBracket()` function fills later-round empty slots by inferred round/match order.

Bracket generation is therefore **manual**, not automatic at group completion. Standings are recalculated at generation time; they are not read from a persisted fixed-pair standings snapshot.

## 2. Current seeding algorithm

The bracket route uses `sortSeeds()` in `src/app/api/admin/tournaments/[id]/run/bracket/route.ts`:

1. `pt` descending (one point per group-match win);
2. `dg` descending (games won minus games lost);
3. `gw` descending (games won);
4. `drawKey` ascending, where `drawKey` comes from a fresh random shuffle of all group pairs at generation time.

This differs from the admin/public standings presentation helpers, which sort by points, games won, games lost ascending, differential, then name. The final-bracket route is authoritative for qualification and seed assignment, so its `Pt → DG → GW → random draw` order is the relevant order here.

Qualifiers are not merged into one unrestricted six-pair table. They are admitted by **group-rank bands** first:

1. every group first place;
2. every group second place;
3. every group third place;
4. later ranks if required.

Within each band, pairs are globally ordered by `sortSeeds()`. With two groups of three and six qualifiers, all bands enter. Define:

| Symbol | Current meaning |
|---|---|
| `L1`, `L2` | The two group winners globally ordered by `Pt → DG → GW → draw`. |
| `R1`, `R2` | The two group second places globally ordered by the same criteria. |
| `T1`, `T2` | The two group third places globally ordered by the same criteria. |

The persisted logical seeds are then:

```text
seed 1 = L1
seed 2 = L2
seed 3 = R1
seed 4 = R2
seed 5 = T1
seed 6 = T2
```

`bracketDraw.seeds` in `tournament_runs.rules` records this resulting seed list, including `groupId`, `groupPosition`, `groupRank`, statistics, and draw key. The match rows themselves do not have seed columns.

## 3. Current six-pair bracket example

For six qualifiers, the generic route calculates:

```text
size = 8
mainSize = 4
playInMatches = 2
directCount = 2
```

The first two seeds receive byes into the semifinals. The route inserts the two quarterfinal rows as:

```text
QF row 1: seed 3 (R1) vs seed 6 (T2)
QF row 2: seed 4 (R2) vs seed 5 (T1)
```

It then inserts two semifinal rows containing seed 1 and seed 2. Although the generator initially creates placeholder objects, those placeholders are not persisted as source links. Actual winner placement is inferred by `autoAdvanceBracket()` and public/admin read-side autofill from the ordered quarterfinal rows:

```text
SF row 1: seed 1 (L1) vs winner(QF row 1)
SF row 2: seed 2 (L2) vs winner(QF row 2)
```

The effective current mapping is therefore:

```text
QF 1: R1 vs T2  ->  SF 1 with L1
QF 2: R2 vs T1  ->  SF 2 with L2
```

This is not position-based on Group A/Group B. Substitute the group labels only after the global within-band ranking is known. For example, if the current global ordering happens to be:

```text
L1=A1, L2=B1, R1=A2, R2=B2, T1=A3, T2=B3
```

then current rows are:

```text
QF 1: A2 vs B3  ->  SF 1: A1 vs winner(QF 1)
QF 2: B2 vs A3  ->  SF 2: B1 vs winner(QF 2)
```

If any within-band global comparison reverses, the group identity in the corresponding seed changes. For example, `R1=B2` and `T2=A3` produces `B2 vs A3` in QF row 1; a more adverse combination can put same-group pairs together because the play-in pairing has no same-group avoidance rule.

### Ordering caveat

Bracket propagation has no stored source-match relationship. `autoAdvanceBracket()` sorts a round by `starts_at`, then `created_at`, then UUID. The group-bracket generator does not explicitly write distinct `created_at` or `starts_at` values for its rows. Consequently, logical QF/SF row numbering is an implicit ordering contract, not an explicit persisted bracket graph. This is a material constraint on any future mapping change.

## 4. Desired six-pair bracket example

For exactly two groups of three with all six qualifying, the requested rule is:

```text
QF 1: A2 vs B3
QF 2: B2 vs A3

SF 1: A1 vs winner(QF 2)
SF 2: B1 vs winner(QF 1)
```

The fully mirrored equivalent is acceptable if both halves are mirrored together. The essential semantics are group-position based, not global cross-group-statistic based:

- each first place has a semifinal bye;
- each second place plays the other group’s third place;
- A1 shares a half with B2, not A2;
- B1 shares a half with A2, not B2;
- same-group first and second cannot meet before the final.

## 5. Exact behavioral difference

| Question | Current behavior | Desired behavior |
|---|---|---|
| Qualifier admission | Rank bands: all firsts, then seconds, then thirds. | Same; all six qualify. |
| Cross-group ordering | Globally ranks firsts, seconds, and thirds independently. | Only ranks inside each group; cross-group score comparison does not choose placement. |
| Quarterfinals | `R1 vs T2`, `R2 vs T1`. Group identity depends on global within-band order. | `A2 vs B3`, `B2 vs A3` deterministically. |
| Semifinal pairing | `L1` receives QF row 1 winner; `L2` receives QF row 2 winner. | A1 receives B2/A3 winner; B1 receives A2/B3 winner. |
| Same-group protection | Not guaranteed in six-pair play-ins. | Guaranteed for first vs second until the final. |

### Current guarantees versus non-guarantees

| Property | Current result |
|---|---|
| `A2 vs B3` | **Not guaranteed.** It occurs only if A2 is `R1` and B3 is `T2` in the global within-band orders. |
| `B2 vs A3` | **Not guaranteed.** It occurs only if B2 is `R2` and A3 is `T1`. |
| A1 opposite A2 | **Not guaranteed.** It depends on whether A1 is `L1` or `L2` and A2 is `R1` or `R2`. |
| B1 opposite B2 | **Not guaranteed.** Same dependency. |
| A1 potentially meeting B2 in a semifinal | **Depends on global seeding.** It is possible in the example ordering, but not protected. |
| B1 potentially meeting A2 in a semifinal | **Depends on global seeding.** It is possible in the example ordering, but not protected. |

## 6. Shared-code impact

`POST /api/admin/tournaments/[id]/run/bracket` is the shared generator for every fixed-pair `groups_and_bracket` run with at least two qualifiers. Its generic `nextPow2`, play-in, `buildBalancedPairings`, and rank-band code cover 4, 5, 6, 7, 8, and greater qualifier counts.

- 4 qualifiers: no play-in; generic main-round pairing includes same-group avoidance where possible.
- 5-7 qualifiers: generic 8-slot shape with play-ins and inferred winner placement.
- 8 qualifiers: direct 8-slot quarterfinal bracket.
- More than 8: the same generic next-power-of-two/play-in mechanism applies.
- `bracket_only` is generated separately in `fixed/run/start/route.ts`; it is not the group-qualification path.

Future-change classification: **SHARED BUT GUARDABLE**. A condition restricted to `groups_and_bracket`, exactly two groups, exactly three members in each group, and `qualifiersCount === 6` can leave generic qualification and bracket behavior unchanged for all other sizes. The special path must be guarded by group membership counts and group `position`, not display names such as “A” and “B”.

## 7. Persistence implications

| Object | Role in this flow |
|---|---|
| `tournament_runs` | Stores mode/status and JSON `rules`; `rules.bracketDraw` records the generated seed snapshot. |
| `tournament_run_pairs` | Run-local pair identities mapped from registrations. |
| `tournament_run_groups` | Group name and explicit `position`; the latter is the safe identity for a future two-group special case. |
| `tournament_run_group_pairs` | Pair membership for each group. |
| `tournament_run_matches_fp` | Persists group and bracket matches: `stage`, `group_id`, `round_label`, home/away pair IDs, scores, completion time, `starts_at`, and `created_at`. |
| `tournament_run_bracket_slots` | Exists in live metadata but is not read or written by the inspected `groups_and_bracket` generator. |
| `tournament_run_group_standings` | Exists in live metadata but is not read or written by the inspected bracket generator; standings are recalculated from match rows. |

There is no bracket-match field for seed, slot number, upstream source match, or winner source. Bracket position is implicit in the insertion/order of `tournament_run_matches_fp` rows. The match-update route advances winners by sorting round rows, then filling inferred holes; it does not follow an explicit graph.

The generator is idempotent only in the narrow sense that it returns `alreadyGenerated` when any bracket row already exists. It does not overwrite or recalculate an existing bracket. The only discovered full regeneration path is `POST /api/admin/tournaments/[id]/fixed/run/reset`, which deletes the active locked/running `tournament_runs` row and relies on configured child cleanup. It has no explicit “no played matches” protection in the route. This is unsafe to treat as a harmless bracket redraw after play has started.

## 8. UI and admin implications

The admin control is the `generateBracket()` function in `FixedPairsRunClient.tsx`; it calls the bracket API and reloads the run. The admin client groups bracket matches by `round_label` and displays them in its returned order. The public live route creates `bracketRounds`, and `TournamentLiveDialog.tsx` renders each round/match in that order.

Neither inspected bracket UI displays the numeric global seeds from `rules.bracketDraw.seeds`; it displays pair names and round labels. A correctly persisted special-case arrangement can therefore be **backend-only** for the requested behavior. Frontend code should only need change if the product also wants explicit group-rank/seed labels or a visual source-match graph.

## 9. Edge cases and risks

| Edge case | Current relevant behavior / risk |
|---|---|
| Incomplete group standings | Generator rejects if any group match is incomplete or has no valid winner. UI additionally requires all group `completed_at` values. |
| Tied group standings | Generator resolves with `Pt → DG → GW → random draw`, whereas displayed standings use a different tie-break order. Future group-position mapping must use the generator’s group ranking or deliberately reconcile this discrepancy. |
| Withdrawn pair | No withdrawal-specific qualification path was found. Group membership and group matches remain the source of truth; missing/unfinished results block generation. |
| Missing pair slot | Group membership/matches can lead to insufficient qualifiers or invalid results; no special six-pair recovery path was found. |
| Manual group-result correction after bracket generation | Bracket generation does not recalculate an existing bracket. A corrected group result can leave the old bracket pairing in place. |
| Bracket result correction | Match reset clears downstream inferred entries/scores through `clearDownstreamFromMatch()`. This is separate from regenerating group qualification. |
| Bracket regeneration | Existing bracket rows block the generator. Full run reset, not safe in-place redraw, is the discovered route. |
| Tournament already started | The bracket API accepts `running`/`locked`; UI exposes generate only while running. Reset route has no explicit played-match guard. |
| Group names/order reversed | Current generic route is name-agnostic. A future special case must map by stored group `position` and accept a mirrored bracket, rather than assume literal labels A/B. |
| Database ordering | Source/winner links are absent. Equal `starts_at`/`created_at` can fall through to UUID ordering, making implicit bracket row ordering fragile. |

## 10. Safest implementation scope

The smallest safe future change is a narrowly guarded branch in `src/app/api/admin/tournaments/[id]/run/bracket/route.ts`, placed after group rankings are calculated and before generic play-in/main-round rows are built:

- require `groups_and_bracket`;
- require exactly two groups, each with exactly three group pairs;
- require `qualifiersCount === 6` and six ranked qualifiers;
- use each group’s stored `position`, not name, to identify the two logical groups;
- select ranks 1/2/3 inside each group using the existing authoritative generator tie-break;
- persist the desired/mirrored QF and SF structure in a deterministic order;
- record the special-case mapping in `rules.bracketDraw.structure` for auditability.

Because advancement and display are order-driven, the change should also make its bracket row ordering deterministic across:

- the row construction/insertion in `run/bracket/route.ts`;
- `autoAdvanceBracket()` and `clearDownstreamFromMatch()` in `fixed/run/match/[matchId]/route.ts`;
- admin/public read-side ordering in `run/route.ts`, `live/route.ts`, and `FixedPairsRunClient.tsx` if their ordering is not already made unambiguous by persisted values.

The safest long-term design would store explicit bracket slot and source-match relationships. That is broader than the requested narrow rule. For this exact change, a backend-only special path is feasible **without a database change** only if the existing match-order contract is deliberately made deterministic and covered by tests. Do not change the generic global seeding logic for other sizes.

## 11. Required tests

No automated test for the fixed-pair bracket route was found; the repository contains only `scripts/test-baraonda.ts`, which is unrelated.

Add focused tests before any implementation:

1. Exact six-pair, two-by-three mapping: A2/B3 and B2/A3 quarterfinals; correct winner-to-semifinal destinations.
2. Mirrored group-position ordering: stored group positions reversed while semantic cross-group pairing remains valid.
3. Every relevant within-group tie-break, including the random-draw boundary under a controlled deterministic draw fixture.
4. Cross-group score reversals: prove global statistics cannot move A2/B2 or A3/B3 in the special case.
5. Same-group protection: A1/A2 and B1/B2 cannot meet before final.
6. Six-pair special branch does not change 4, 5, 7, 8, or greater generic `groups_and_bracket` outputs.
7. `bracket_only` output remains unchanged.
8. Incomplete group, missing pair, insufficient qualifier, and invalid-result rejection.
9. Existing bracket idempotence and refusal to overwrite.
10. Winner propagation and correction/reset: each QF winner reaches its intended SF after persisted reload, not merely an in-memory display.
11. Public and admin bracket ordering agree after reload.
12. Attempted regeneration after play has started follows an explicit approved safety policy.

## 12. Regression risk

Overall regression risk is **MEDIUM-HIGH** if implemented as a seed-array-only change, because bracket advancement has no explicit source-match links and relies on implicit ordering. Risk becomes **MEDIUM** with a strict six-pair/two-group guard, deterministic persisted ordering, and the persistence/propagation regression tests above. It is not necessary to change database schema or UI for the narrow requested behavior, but neither should be treated as proof that the existing implicit bracket graph is robust for broader formats.

