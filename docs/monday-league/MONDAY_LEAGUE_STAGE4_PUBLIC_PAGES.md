# Monday League — Stage 4 Public Pages

## 1. Scope

Stage 4 adds the read-only public competition, standings, matchdays/results, team directory and team profiles. It does not add captain editing, lineups, captain results, disputes, notifications or Phase 2 generation.

## 2. Publication gate

Public reads select only a season whose `published_at` is present and not in the future and whose status is `phase1`, `phase2` or `completed`. Draft and archived seasons are invisible. When no eligible season or visible phase exists, the public page returns a friendly unavailable state with no league data.

## 3. Main page read model

`GET /api/monday-league` returns one stable aggregate containing the published season, visible phases, selected phase, authoritative standings, grouped rounds and team cards. An optional allow-listed `phase` query selects a historical/current phase belonging to that season. Reads are batched; there is no per-row query loop.

## 4. Standings presentation

The frontend renders the ordered DTO returned by the Stage 3 `league_get_standings` RPC. It does not recalculate or resort totals. Team names link to public profiles and a lightweight notice appears when current results include submitted or contested revisions.

## 5. Calendar and result presentation

Rounds are shown in generated order with their Monday date and every generated match. Rows show local Europe/Rome time, venue, both teams, authoritative result summary, or a human workflow state.

## 6. Inline expansion

Played and special result rows use keyboard-accessible buttons with `aria-expanded`. Played results expose only the current revision's legal set rows and status. Special outcomes explain that no played sets were recorded.

## 7. Team list

The team section includes safe logo URL when usable, name, slogan, current position and points. Cards link to `/monday-league/squadre/[slug]` while preserving the selected phase.

## 8. Team page

The team profile contains optional hero/logo media, name, slogan, active roster, highlighted captain, phase metrics, next match, future schedule and expandable past results. Historical phase navigation uses the same season-scoped team slug.

## 9. Actual-player behavior

Stage 3 has no `league_result_players` table. The Stage 4 result DTO already contains separate home/away actual-player arrays, currently empty. The UI renders no invented players and never substitutes roster names. A later additive stage may populate these fields from authoritative result-player records.

## 10. Special outcomes

Walkovers and no-shows are displayed as administrative labels, not synthetic 6–0 set rows. Suspended, postponed and cancelled states are shown as `Sospesa`, `Rinviata` and `Annullata`. Administrative outcomes remain explicitly labelled special.

## 11. Historical and current phase navigation

Generated, in-progress and finalized phases of the published season are navigable. An in-progress phase is preferred by default; Phase 1 is preferred during the Phase 1 season state; otherwise the latest sequence is selected. This supports future Serie A and Serie B without implementing their generation.

## 12. Public DTO security

Both public APIs execute server-side through `supabaseAdmin()` and return hand-built allow-listed objects. They never select or emit phone numbers, email addresses, staff identifiers, audit events, correction reasons, generation fingerprints, decision reasons, conflict metadata or future protected lineups. Base league tables and the standings RPC remain unavailable directly to `anon` and `authenticated`.

## 13. Caching and freshness

Routes are force-dynamic and return `Cache-Control: no-store`. Browser fetches also use `no-store`, so admin corrections and authoritative revision changes become visible on the next read without a stale public cache.

## 14. Responsive behavior

The layout is mobile-first. Standings retain all requested values inside a horizontal-safe region with a sticky team column; match rows collapse to two columns; profile metrics collapse to two columns; team/profile content becomes single-column on narrow screens.

## 15. Dynamic hero foundation

`derivePublicLeagueHeroState` maps Phase 1, Phase 2 and completed season states to the approved future copy. The public league hero is implemented inside `/monday-league`; no hero is inserted into the MOVI home page in Stage 4. This avoids changing the existing home until publication and rollout are explicitly approved.

## 16. Local visual acceptance

Acceptance uses a disposable published local season and explicit process-only Supabase overrides pointing to API 55021. It covers desktop, tablet and mobile widths for `/monday-league` and `/monday-league/squadre/[slug]`, then removes the fixture.

## 17. Production rollout dependency

This stage adds no migration because Stage 1 already contains the publication field and Stage 3 already contains the authoritative read source. Production remains untouched. Rollout requires explicit approval, migration-history review, controlled publication of a real season and a separate decision about the MOVI home hero.

## 18. Stage 5 prerequisites

Stage 5 can add captain identity and lineup commands behind server authorization. It must preserve the public DTO boundary, add actual players only from authoritative result records, and keep future lineups private until the defined deadline. Stage 4 does not expose or simulate lineup data.
