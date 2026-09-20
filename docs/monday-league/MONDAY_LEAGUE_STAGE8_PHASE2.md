# Monday League — Stage 8 Phase 2

## 1. Scope
Stage 8 creates the final one-leg Serie A and Serie B phases from the completed Phase 1. It adds no playoffs and no later competition phase.

## 2. Readiness definition
`league_phase2_readiness` requires every generated Phase 1 match to have an authoritative terminal standard result or final administrative outcome.

## 3. Blocking states
Missing, provisional, contested, postponed, suspended, cancelled without a terminal ruling, and incomplete administrative states block generation and are returned with admin-safe labels.

## 4. Final Phase 1 standings source
The split consumes `league_get_standings`; it does not duplicate points, set/game differential, or ranking rules.

## 5. Split rule
The ordered top `ceil(N/2)` teams enter Serie A and the remaining `floor(N/2)` enter Serie B. Manual reshuffling is not supported.

## 6. Odd-team rule
The larger division receives the extra team. Its circle schedule contains one rotating bye per round and persists no fake bye match.

## 7. Immutable split snapshot
The single `phase2_split` generation run stores source phase, ordered ranking evidence, metrics, destination division, algorithm version, fingerprint, actor, and timestamp.

## 8. Stale-preview protection
The preview supplies a fingerprint over season, source phase, ordered standings, authoritative match/result state, and algorithm version. Generation recomputes it inside the locked transaction and rejects mismatches.

## 9. Serie A creation
Serie A is an independent `league_phases` row with its own memberships, rounds, matches, and team slots.

## 10. Serie B creation
Serie B is a separate sibling phase created atomically with Serie A in the same season.

## 11. Points reset
Phase 2 standings derive only from Phase 2 matches; points, wins, losses, sets, games, and differentials all begin at zero.

## 12. Persistent tie-break order
Each membership copies the season/Phase 1 `tie_break_order`; no new draw is performed.

## 13. Round-robin generation
Both divisions use the extracted Stage 2 deterministic circle/home-away generator, preserving pair completeness, bye behavior, and quality checks.

## 14. Dates/scheduling behavior
Generated matches are unscheduled with no date, time, or venue. The Stage 3 scheduler can select Phase 1, Serie A, or Serie B independently.

## 15. Frozen split after generation
Later Phase 1 corrections remain auditable and can change historical standings but never rebuild memberships. The results UI warns admins when Phase 2 is already frozen.

## 16. Public phase navigation
Visible seasons expose historical Phase 1 plus Serie A and Serie B. The Phase 2 hero states “Monday League — Serie A & Serie B”.

## 17. Team-page behavior
Without an explicit phase, a Phase 2 team page selects the division containing that team. Explicit navigation preserves Phase 1 history and either division view.

## 18. Captain workflows in Phase 2
Existing profile, roster, lineup, result, contest, and admin override flows operate on generic match/team/phase identifiers and require no duplicate Phase 2 implementation.

## 19. Phase 2 notification
The transaction enqueues one `phase2_ready` event for every current captain, naming Serie A or Serie B. Existing unique idempotency keys and the Stage 7 scanner prevent duplicate delivery.

## 20. Concurrency/idempotency
An advisory transaction lock plus the season row lock serialize generation. The first valid command creates; an exact replay returns replay; changed source state conflicts. All structures share one transaction.

## 21. Season lifecycle
Successful generation finalizes Phase 1 and transitions the season from `phase1` to `phase2` without publishing, archiving, deleting, or overwriting historical data.

## 22. Completion foundation
`league_phase2_completion_readiness` reports whether every Serie A and Serie B match is terminal. Stage 8 intentionally provides no completion command or subsequent phase.

## 23. Local acceptance
Use only unlinked local Supabase ports 55021–55024 and a Next process with explicit process-only local URLs. Fixtures must be disposable and never production migrations.

## 24. Production rollout requirements
After review, apply the additive migration through the normal controlled release, run all regressions against an authorized non-production target, and verify notification delivery configuration before deployment.

## 25. Remaining future work
A later approved stage may add the guarded season-completion action once both divisions are terminal. Playoffs, finals, promotion, and relegation matches are outside the approved model.
