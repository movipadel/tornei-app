# Fixed-Pair Six-Qualifier Bracket Fix

## Status

Implemented as a narrowly guarded backend change. No database schema, migration, tournament UI, standings rule, winner-propagation function, or generic bracket algorithm was changed.

## 1. Previous behavior

For two groups of three with all six pairs qualifying, the generic generator admitted qualifiers by group-rank bands and globally ordered each band by `Pt → DG → GW → random draw`:

```text
seed 1/2 = globally ordered group winners
seed 3/4 = globally ordered group seconds
seed 5/6 = globally ordered group thirds

QF row 1: seed 3 vs seed 6
QF row 2: seed 4 vs seed 5
```

Because group identity could swap independently inside each band, cross-group pairing and protected halves were not guaranteed.

## 2. Exact new guard

`buildFixedPairsSixBracketPlan()` returns a special plan only when all conditions hold:

- the caller is the existing fixed-pair `groups_and_bracket` route;
- `qualifiersCount === 6`;
- exactly six unique qualified pair IDs exist;
- exactly two groups exist;
- group records have distinct positive integer `position` values;
- each group contains exactly three ranked rows;
- each group has exactly one row at `groupRank` 1, 2, and 3;
- every ranked row belongs to its group ID;
- the six ranked pair IDs exactly match the six qualified IDs.

If any condition fails, the helper returns `null` and the original generic generator runs unchanged.

## 3. Exact new mapping

The two groups are called X and Y according to their explicit stored group `position`, never their names or insertion order.

```text
QF row 1: X2 vs Y3
QF row 2: Y2 vs X3

SF row 1: Y1 vs winner(QF row 1)
SF row 2: X1 vs winner(QF row 2)
```

This is the mirrored equivalent of the requested presentation. It guarantees that each group winner receives a bye and shares a half with the other group’s second place. Global cross-group points, differential, games won, or draw order do not influence this special mapping. Existing ranking logic remains authoritative only for positions 1-3 inside each group.

## 4. Files and functions changed

- `src/lib/fixedPairsSixBracket.ts`
  - adds pure `buildFixedPairsSixBracketPlan()` with the complete scope guard and mapping;
- `src/app/api/admin/tournaments/[id]/run/bracket/route.ts`
  - calls the helper after existing group ranking/qualification;
  - persists the special QF/SF/final rows only when the guard matches;
  - stores a distinct `bracketDraw.structure.type` and rule description;
  - assigns distinct ordered `created_at` values to special-case bracket rows;
- `scripts/test-fixed-pair-six-bracket.mts`
  - focused pure tests for mapping, score reversal, propagation order, reload/correction semantics, and fallback guards.

No UI file, winner-propagation route, regeneration route, or database artifact changed.

## 5. Why propagation remains safe

The existing `autoAdvanceBracket()` maps quarterfinal row N to semifinal row N after sorting rows by `starts_at`, `created_at`, then ID. The special generator deliberately persists rows with distinct increasing `created_at` values:

1. QF `X2 vs Y3`;
2. QF `Y2 vs X3`;
3. SF containing Y1;
4. SF containing X1;
5. final.

Therefore QF row 1 advances into Y1’s semifinal and QF row 2 advances into X1’s semifinal. Admin/public reload reconstruction uses the same round order. Existing correction logic can still locate and clear the previously propagated QF participant. `autoAdvanceBracket()` and `clearDownstreamFromMatch()` were left untouched.

## 6. Tests and validation performed

- Focused Node test: 5 tests passed.
  - exact X/Y mapping;
  - global score reversal does not change the mapping;
  - index-aligned winner propagation reaches the protected opposite-group winner;
  - serialized reload and corrected QF winner preserve destination;
  - 4/5/7/8/9 qualifier and invalid group shapes return fallback.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed.
- Focused lint for the new helper/test passed.
- Linting the modified route still reports its existing `@typescript-eslint/no-explicit-any` violations; this fix did not introduce or refactor that unrelated route-wide typing debt.

The production build emitted existing `themeColor` metadata warnings and a browsers-list freshness warning; neither relates to this change.

## 7. Formats confirmed unchanged

- 4 qualifiers: special helper returns `null`; generic path unchanged.
- 5 qualifiers: special helper returns `null`; generic path unchanged.
- 7 qualifiers: special helper returns `null`; generic path unchanged.
- 8 qualifiers: special helper returns `null`; generic path unchanged.
- More than 8 qualifiers: special helper returns `null`; generic path unchanged.
- Any non-two-by-three group shape: fallback unchanged.
- `bracket_only`: generated in the separate fixed-run start route and untouched.
- Group ranking/tie behavior: untouched.
- Existing bracket idempotence/regeneration safeguards: untouched.

## 8. Regression risk

**LOW-MEDIUM.** The scope guard is exact and the generic path is unchanged. Residual risk comes from the application’s broader implicit row-order bracket model; the special path mitigates that risk with explicit distinct persistence timestamps and focused propagation/reload tests.

## 9. Rollback

Revert the special-plan call/branch in the bracket route and remove `src/lib/fixedPairsSixBracket.ts` plus its focused test. Existing brackets already persisted by this change remain valid ordinary `tournament_run_matches_fp` rows and do not require data or schema rollback. Do not delete or regenerate an active played bracket as part of rollback.

