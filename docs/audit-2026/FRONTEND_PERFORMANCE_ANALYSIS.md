# MOVIPadel Frontend and Perceived Performance Analysis — Phase 2C

## Rendering strategy

The production build confirms that `/`, `/tornei`, `/moviback`, `/moviback/premi`, and `/store` are statically prerendered. `/circuiti/[slug]` is dynamically rendered by route segment, while its content page remains client-driven. API routes are dynamic.

The public documents are small and locally fast, but they are shells: useful content depends on hydration and client API fetches. Consequently, server-rendered HTML time is not the likely dominant perceived delay on the primary screens.

| Screen | Document bytes / local median | Post-hydration dependency |
|---|---|---|
| Home | 10,446 B / 2.8 ms | Six data APIs + admin probe; images |
| Tournaments | 11,006 B / 2.1 ms | Tournament + user APIs, optional search/live polling |
| Circuit detail | 12,203 B / 10.0 ms | Circuit ranking API, 10.7–30.2 kB measured |
| MoviBack | 12,681 B / 2.5 ms | Authenticated member summary |
| Rewards | 12,769 B / 2.0 ms | Member + rewards APIs |
| Store | 13,553 B / 1.8 ms | 211.2 kB catalog API |

These timings are **MEASURED locally** and cannot substitute for LCP/INP in a real device/browser.

## Client hydration and JavaScript

Static analysis finds 63 of 78 TSX files marked as client components. Several primary screens are large client controllers:

- `src/app/moviback/page.tsx`: approximately 2,040 lines;
- `src/app/page.tsx`: approximately 1,924 lines;
- `src/app/circuiti/[slug]/page.tsx`: approximately 1,388 lines;
- `src/app/store/page.tsx`: approximately 1,363 lines;
- `TournamentLiveDialog.tsx`: approximately 1,347 lines;
- `src/app/moviback/premi/page.tsx`: approximately 1,195 lines.

Production artifact estimates:

| Route | Raw initial JS | Gzip-equivalent | Assessment |
|---|---:|---:|---|
| `/tornei` | 668.5 KiB | 203.5 KiB | Heaviest sampled public route |
| `/` | 570.1 KiB | 169.8 KiB | Large aggregation/client interaction surface |
| `/moviback` | 543.9 KiB | 164.4 KiB | Large client page |
| `/store` | 527.6 KiB | 160.7 KiB | Catalog/cart/checkout client |
| `/moviback/premi` | 451.2 KiB | 135.3 KiB | Moderate |
| `/circuiti/[slug]` | 418.3 KiB | 125.5 KiB | Lightest sampled, despite large source file |

These figures are **ESTIMATED from build manifests and local gzip**, not observed browser transfers. Shared caching, Brotli, code prefetch and navigation order can materially change delivered bytes. Bundle composition and hydration CPU require browser profiling before component-boundary changes.

## Data payload evidence

- Store catalog: **MEASURED 211,150 bytes**, larger than all other sampled APIs combined, with 418 stock rows and variant graph.
- Circuit detail: **MEASURED 10,682–30,240 bytes**, scaling with one versus four ranking groups.
- Guest Home six-request cycle: **MEASURED 5,007 bytes**.
- Tournament list: **MEASURED 4,004 bytes** for seven upcoming tournaments.
- Authenticated Home/MoviBack/rewards payloads: **NOT YET MEASURED**.

The Store payload is currently the clearest measured frontend transfer candidate. Narrowing/breaking stock/catalog data can improve readiness even though the database is tiny.

## Images and layout stability

Static inspection found:

- 21 raw `<img>` tags;
- zero detected `next/image` imports;
- zero explicit `loading=` attributes;
- only one detected width and one height attribute across TSX.

Tournament, circuit, communication, reward and product media are therefore not visibly using framework responsive image transformation, and most lack intrinsic dimensions in JSX. This creates a **plausible** risk of oversized downloads, delayed LCP, decode cost, and layout shift. It is not a measured CLS/LCP finding: CSS aspect-ratio/containers may reserve layout, and remote CDN behavior is unknown.

Required evidence: real image request bytes, encoded/display sizes, cache headers, LCP element, decode time and CLS attribution on mobile.

## Re-fetch and React lifecycle behavior

- Home: six calls on mount, every 15 seconds while visible, and on visibility return.
- Tournaments: two calls on the same lifecycle pattern.
- Live dialog: full state every five seconds.
- MoviBack: summary on mount and another direct summary call after login.
- Tournament/admin mutations: `router.refresh()` or multiple list reloads.
- Store: complete catalog on mount with `no-store`.
- Circuit detail: one no-store ranking fetch on mount.

No shared client cache/query library was found. Effects own requests independently. Abort controllers prevent some overlapping client updates but do not prove cancellation of already-started server/database work.

## PWA/Workbox and cache conflicts

The production build confirms PWA service-worker generation. The tracked Workbox configuration applies NetworkFirst behavior to same-origin GET API requests with a 10-second network timeout, while important application fetches explicitly use `cache: "no-store"`. The optimized direct HTTP measurements observed no Cache-Control header on sampled APIs; static page shells had long shared caching.

The audit HTTP client did not run a service worker. Therefore actual precedence, cache write/read, authenticated response isolation, offline fallback delay, deploy invalidation and login/logout behavior are **NOT YET MEASURED**. Cache changes should not proceed until those security and correctness behaviors are captured in a browser.

## Full-list reloads after mutations

Static evidence confirms full run/page reloads and sequential registration/list refreshes after mutations. These add HTTP/DB work and can reset render state. Because protected mutation flows were not executed, their payload/timing impact is **NOT YET MEASURED**. Optimizing them is justified only after characterizing stale-derived-state requirements.

## Build observations

- Optimized Webpack build completed successfully.
- TypeScript completed successfully.
- Main public routes were prerendered as expected.
- Next emitted repeated warnings that `themeColor` is in metadata rather than the viewport export. This is a correctness/maintenance warning, not a demonstrated performance bottleneck.
- PWA generation rewrites tracked artifacts during build; audit-generated changes were restored.

## Frontend bottleneck classification

| Finding | Classification | Contribution |
|---|---|---|
| Home/tournament/live effects | Static + partial runtime evidence | VERY HIGH |
| Store catalog payload | Measured | HIGH |
| Initial JS/hydration | Artifact-estimated; CPU unmeasured | MEDIUM–HIGH |
| Raw images/intrinsic sizing | Static; user impact unmeasured | MEDIUM potential |
| Full-list reloads | Static; mutation timing unmeasured | MEDIUM–HIGH |
| PWA cache conflict | Static; runtime unmeasured | HIGH risk/uncertainty |
| Static HTML generation | Measured fast locally | LOW contribution |

## Justified frontend optimization subjects

1. Remove stable endpoints from the Home timer.
2. Reduce Store's initial full variant/stock payload.
3. Batch/condition live refreshes based on measured unchanged-response rate.
4. Add measured responsive image/intrinsic-size handling.
5. Reduce coarse mutation reloads after protected-flow traces.

Major client/server component refactoring or PWA cache changes should not begin before browser hydration/Workbox evidence.

