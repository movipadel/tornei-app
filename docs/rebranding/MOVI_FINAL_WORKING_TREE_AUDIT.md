# MOVI final working tree forensics

Audit date: 2026-10-03 (Europe/Rome)

Scope: complete local working-tree classification against `cca6937cb4c520dc8727d41eb15b091a4dc8dff3`. No staging, commit, push, deploy, production access, database mutation, cleanup, deletion, reset, restore, checkout, stash, or application/test-source edit was performed.

## Verdict

```text
WORKING_TREE_CLASSIFIED = YES
READY_FOR_CONTROLLED_STAGING = YES
```

The release changes are functionally certified and every expanded working-tree entry has a row in `.artifacts/final-working-tree-audit/working-tree-inventory.csv`. The audit originally found 924 files from a complete Edge profile and local certification artifacts outside ignore coverage. The repository hygiene pass added narrow ignore rules, and controlled staging then used explicit allow-lists; broad `git add` remains forbidden for this release sequence.

The required narrow ignore rules are now present for `.artifacts/`, the browser profile, verification references and `*.bak`. Each controlled commit still verifies that its index contains none of those paths.

## 1. Baseline

| Item | Result |
| --- | --- |
| Branch | `main` |
| HEAD | `cca6937cb4c520dc8727d41eb15b091a4dc8dff3` |
| HEAD subject | `fix: improve MOVI public modal focus behavior` |
| Commits ahead of `origin/main` | 12 |
| Staged files | 0 |
| Tracked modified | 210 |
| Tracked deleted | 1 |
| Tracked diff | 211 files, 3,101 insertions, 5,956 deletions |

The initial forensic baseline contained 1,524 expanded entries: 211 tracked changes and 1,313 untracked files. Ten of those untracked files were the first authorized audit captures. Subsequent detailed reports created under `.artifacts/final-working-tree-audit/` increase the live untracked count; these report files are all category J and must not be staged.

The 12 local commits ahead of origin are, newest first:

1. `cca6937 fix: improve MOVI public modal focus behavior`
2. `84a08de feat: add MOVI public UI system and shell`
3. `71d2a52 Unify MOVI admin UI and add theme system`
4. `19842d0 Add Gioca player suggestions`
5. `378dc91 Add MOVI player matching`
6. `62b0402 Add MOVI customer hub and MoviBack compliance`
7. `5b922ee Add MOVI player profiles and admin player management`
8. `c10a451 Add MOVI player identity foundation`
9. `ee55833 Add MOVI user activities hub`
10. `581f9c7 Add MOVI Gioca and Allenati requests`
11. `b1dddad Add MOVI partner management`
12. `cc153eb Add Padelleria content management`

## 2. Classification summary

The final inventory snapshot, after this durable report exists, contains 1,544 entries. The count includes 29 audit-output files created during this task, all under the allowed `.artifacts/final-working-tree-audit/` directory.

| Category | Count | Disposition |
| --- | ---: | --- |
| A. KEEP — release code | 229 | staged in application release commit |
| B. KEEP — migration | 8 | staged atomically with compatible application code |
| C. KEEP — test | 96 | staged in certification/test commit |
| D. KEEP — documentation | 22 | stage in documentation commit |
| E. KEEP — visual/reference asset | 23 | 12 runtime assets with application; 11 certified references with docs |
| F. KEEP — local tooling | 6 | stage with the reproducibility/test layer |
| G. REVIEW | 16 | unreferenced verification images/archive; exclude by default |
| H. EXCLUDE — generated build artifact | 0 visible/unignored | `.next/**` exists but is correctly ignored |
| I. EXCLUDE — temporary | 1 | backup file |
| J. EXCLUDE — local evidence | 229 | `.artifacts/**`, including this audit’s detailed reports |
| K. EXCLUDE — accidental/noise | 924 | Edge browser profile/cache |
| L. LEGACY / PRE-EXISTING | 0 working-tree entries | lint debt is recorded separately, not a file category |

Totals after the final player-side/navigation delta: 384 KEEP, 16 REVIEW, 1,154 EXCLUDE.

The CSV records path, Git state, tracked state, type, byte size, tracked line additions/deletions, category, domain, intent, release relevance, disposition, proposed group, and notes for every entry.

## 3. Deleted tracked file

`proxy.ts` is the only deleted tracked file. The deletion is intentional and release-relevant only as a pair with the untracked `src/proxy.ts`.

- The repository uses `src/app`; Next 16 discovers the proxy at `src/proxy.ts`.
- The replacement preserves Supabase refresh and the `staff_session` cookie contract.
- It strengthens access handling by validating `sid`, resolving the current operator from the database, and allowing delegated Admin pages only when a real permission maps to the route.
- The old root proxy trusted the token role hint and redirected every non-admin away from `/admin`.
- Stage the deletion and replacement in the same application commit. Staging either one alone is a release blocker.

## 4. Feature map

| Feature block | Principal working-tree areas | Classification |
| --- | --- | --- |
| Public UI / Home V2 | `src/app/page.tsx`, `HomeV2.module.css`, public shell/header/nav/modal primitives and helpers | A |
| Home content order | MoviBack, Gioca/Allenati/Prenota, two-week tournaments, Padelleria, Monday League, circuits, history, services | A/C/D/E |
| Tournaments public UI | `/tornei`, tournament card/CSS, deep links, Home window/background resolvers | A/C/D/E |
| Poster system | poster data/layout/rendering, hook-free QR dependency, two production backgrounds, review generators | A/C/D/E/F |
| Circuits | Home image, public detail/stages/personalization, admin image flow | A/B/C/D/E |
| Padelleria | lifecycle, archive, detail, cleanup cron, media and CTA catalog | A/B/C/D |
| Partner | public directory/detail, Home/CTA integration and compact cards | A/C/D |
| Gioca / Allenati | public forms, multi-select arrays, OR matching, Telegram formatting and Admin handling | A/B/C/D |
| Activities | history/upcoming source rendering, legacy state removal and responsive UI | A/C/D/E |
| MoviBack | Home access, digital card, decorative MOVI mark, QR separation and staff workflows | A/C/D/E |
| Profile / player identity | UTF-8/UI alignment, preferences, optimistic version handling, Admin profile support | A/C/D |
| Operator permissions | DB authority, domain guards, Staff dashboard, Admin editor, audit log and last-admin protection | A/B/C/D |
| Auth / proxy | database-resolved operator session, route protection and role-aware public shortcut | A/C/D |
| Local-safe tooling | certified ports 55421–55424, isolated environment runner and local acceptance modes | F |

## 5. Dependency graph

```text
existing schemas through 20261010100000
  ├─ 20261012100000 circuit Home images
  │    └─ circuit Admin media flow ──> Home/circuit public rendering
  ├─ 20261013100000 Padelleria lifecycle
  │    └─ 20261014100000 public archive ──> hub/detail/Home + cleanup cron
  ├─ 20261015100000 operator foundation
  │    └─ 20261016100000 domain enforcement
  │          └─ 20261017100000 Admin editor + last-admin protection
  │                └─ proxy, Admin/Staff nav, route guards and audit UI
  └─ 20261018100000 request multi-select
       └─ API/types/form/Telegram/matching/Admin/activities/tests

Partner public routes ──> Partner CTA targets ──> shared CTA destination catalog
Padelleria lifecycle ──> archive visibility ──> hub/detail/Home feeds
Public shell ──> Home V2, tournaments, circuits, Padelleria, Partner, profile, activities
Operator resolver/permissions ──> every delegated Admin API/page and Staff dashboard
Poster QR package ──> server route ──> Satori/Resvg production render
```

## 6. Migration inventory

Eight release migrations were committed atomically with compatible application code. Their order is valid and the clean-chain certification covered all of them as part of 46/46 repository migrations.

| Version | File | Feature | Dependency |
| --- | --- | --- | --- |
| 20261012100000 | `circuit_home_images.sql` | Circuit Home image column and bucket | existing circuits/storage |
| 20261013100000 | `padelleria_content_lifecycle.sql` | `delete_on_expiry`, claim/finalize cleanup | `20261005100000_padelleria_contents.sql` |
| 20261014100000 | `padelleria_public_archive.sql` | retained expired archive and public policies | 20261013100000 |
| 20261015100000 | `operator_permissions_foundation.sql` | permission table, access audit and foundation RPCs | existing `staff_users` |
| 20261016100000 | `operator_permissions_domain_enforcement.sql` | permission-aware domain RPC enforcement | 20261015100000 and existing domain RPCs |
| 20261017100000 | `operator_permissions_admin_editor.sql` | atomic editor, active-state audit and last-admin protection | 20261015100000/16100000 |
| 20261018100000 | `movi_request_multi_select.sql` | scalar-to-array request fields and constraints | request migration 20261007100000 and `text_array_is_unique` from 20261010100000 |
| 20261019100000 | `player_side_preferences.sql` | profile preference and per-request playing side | profile migration 20261010100000 and requests migration 20261007100000 |

Certification evidence states: ordered application 46/46, rebuilt ledger 46/46, zero missing/extra/duplicate versions, structural equivalence, 40/40 SQL suites and 14/14 isolated HTTP suites. The latest migration is `20261019100000_player_side_preferences.sql`. The current ordinary development ledger remains at 29 versions by design; it was not mutated during certification or this audit.

## 7. Runtime assets

Twelve new files under `public/**` are required runtime assets:

- `public/branding/home-sections/monday-league-home-banner.png`
- nine files in `public/branding/tournament-backgrounds/`: Baraonda and Coppie variants for Maschile/Femminile/Misto/Open plus `tournament-default.png`
- `public/posters/backgrounds/poster-baraonda-maschile.png`
- `public/posters/backgrounds/poster-coppie-maschile.png`

Every asset has a source/test/doc reference. SHA-256 comparison found no duplicate files. No temporary/export filename was found. The Home variants remain category-sensitive; the production poster resolver intentionally maps all categories to one approved background per tournament type.

## 8. Certified reference assets

Eleven documentation references are intentional and should be kept:

- `MOVI_HOME_V2_CERTIFIED.png`
- `MOVI_POSTER_MASTER_ANNOTATED.png`
- `MOVI_POSTER_MASTER_REFERENCE.png`
- `activities/MOVI_MY_ACTIVITIES_CERTIFIED_REFERENCE.png`
- three Circuit Detail references under `circuits/`
- `moviback/MOVI_MOVIBACK_TESSERA_MODAL_REFERENCE.png`
- `partners/MOVI_PARTNERS_CERTIFIED_REFERENCE.png`
- `requests/MOVI_GIOCA_ALLENATI_MODAL_REFERENCE.png`
- `tournaments/MOVI_TOURNAMENTS_LEGACY_MOCKUP_REFERENCE.png`

Sixteen files under `docs/rebranding/references/verification/**` are not referenced by durable documentation. They contain date-badge screenshots, Home tournament viewport screenshots, poster endpoint/pilot renders, four poster-matrix renders, and `poster-matrix.zip`. Recommendation: exclude them as replaceable certification evidence. Keep only after a human decision to make visual snapshots a maintained repository artifact; if kept, drop the redundant ZIP or document its purpose.

## 9. Local tooling

Required and recommended to commit:

- `supabase/config.toml`: certified Supabase ports 55421–55424, shadow/pooler/analytics ports, correct HTTP redirect URLs, and local auth test behavior.
- `scripts/padelleria-local.mjs`: verified unlinked-project guard, isolated environment, local-only synthetic secrets, Telegram-disable behavior, multi-port Next modes, and feature acceptance modes.
- `scripts/padelleria-next-local.cjs`: local Supabase guard updated from 55021 to 55421.
- `scripts/player-identity-analyze.local.mjs`: the same certified API port update.
- `scripts/render-poster-matrix-review.mjs` and `scripts/render-poster-production-pilot.mjs`: deterministic local poster review tooling.

`scripts/padelleria-next-local.cjs.bak` is a one-file temporary backup and must not be staged.

The reported trailing blank-line concern in `scripts/padelleria-next-local.cjs` is not present in the current bytes: the file ends with one CRLF. Its tracked diff is the single intended port change. No normalization was performed.

## 10. Artifacts and generated outputs

`.artifacts/**` is local certification evidence. It was not ignored at the initial audit snapshot; the repository hygiene pass now excludes it through `.gitignore`. At audit time it included these groups:

- `migration-certification`: 150 files
- `final-certification`: 19 files
- `moviback-access`: 12 files
- `request-multiselect`: 9 files
- `partners-public`: 5 files
- `partners-card-compaction`: 5 files
- `final-working-tree-audit`: the detailed outputs from this task

These include screenshots, TAP/JSON reports, logs, isolated schema dumps, environment/status records, and migration evidence. `isolated-status.json` can carry local Supabase keys. All are category J and must remain out of Git.

`artifacts/profile-ui/**` contains 924 files, about 76.1 MB, from a complete Microsoft Edge profile. Filename-only inspection found 35 entries named like Cookies, Login Data, History, Local State, Sessions, Preferences, or Certificates. Contents were not printed or copied. This directory is category K, potentially sensitive, and must never be staged.

`.next/**` exists and is correctly ignored. `public/sw.js` and `public/workbox-f1770938.js` are already tracked but unchanged. No build/PWA output is part of the working diff.

## 11. Secrets and local-data scan

The masked scan covered changed/new text candidates while excluding browser-profile and evidence contents.

- No production Supabase URL was found.
- No JWT-like value was found.
- No private-key marker was found.
- No absolute per-user filesystem path was found.
- Runtime matches for password/secret/token names are environment reads, validation variables, or request fields; no hard-coded real secret was found.
- Test/fixture credentials are synthetic.
- The local runner deliberately contains clearly named local-only cookie/cron secrets and a disabled Resend key; these are safe synthetic values guarded by local project/port checks.
- `.env*` remains ignored and was not inventoried or printed.

The browser profile and `.artifacts` are treated as potentially sensitive regardless of the masked scan because their formats can contain session/local service material.

## 12. Localhost and port scan

Local references occur in documentation, tests/fixtures, and local tooling as expected. One changed runtime file contains a literal local endpoint:

- `src/lib/moviRequestsServer.ts:23` compares the configured Supabase URL to `http://127.0.0.1:55421` so Telegram stays disabled/fail-closed in the certified local environment.

This is intentional conditional safety logic, does not redirect production traffic, and is LOW risk. No other production-runtime localhost/3100/3101/3102/55421–55424 occurrence was found in the changed/new candidate set.

## 13. Lint debt

The stored relevant-source baseline contains legacy findings in 24 files that are also touched by this release: 173 errors and 4 warnings, mainly `no-explicit-any`, plus five pre-existing CommonJS `require()` findings in `padelleria-next-local.cjs`.

A zero-context diff-to-lint comparison found **0 lint findings on added lines**. Newly added source/test/tooling files in the recorded lint output are clean. Therefore:

```text
NEW/CHANGED LINT DEBT = 0
LEGACY LINT DEBT = PRESENT, DEFERRED
```

This reconciles the changed/rebranding-file PASS gate with the repository-wide legacy baseline. No file was changed solely to silence lint.

## 14. Whitespace and line endings

- `git diff --check`: PASS.
- Regular, `--ignore-all-space`, and `--ignore-space-at-eol` name sets all contain the same 211 tracked files.
- No whitespace-only or line-ending-only file exists.
- Git emits “LF will be replaced by CRLF” warnings for 146 tracked working files under the current checkout policy. Those files also have substantive changes.
- No normalization or formatting was performed.

## 15. Documentation

Durable documentation comprises 22 files after adding this audit: three modified rebranding documents, five new auth/operator documents, feature documents for CTA, Home, requests, activities, MoviBack, Padelleria, Partner, poster, profile and tournaments, the migration reproducibility certification, and this audit.

All 22 are release/development documentation worth committing. The 16 unreferenced verification assets are the only documentation-area REVIEW items. No duplicate or clearly obsolete Markdown document was identified.

## 16. Tests and fixtures

There are 96 final category-C files: 57 modified and 39 added. The original 92-file domain breakdown below is extended by four final player-side/navigation contract files.

- Operator/auth: 24
- Monday League guard updates: 15
- Gioca/Allenati/requests: 12
- Padelleria: 11
- Profile/player identity: 6
- cross-domain store/fulfillment and CTA contracts: 5
- activities: 4
- circuits: 4
- Partner: 3
- MoviBack: 2
- Home: 2
- tournaments: 2
- poster: 1
- one cross-domain fixture classification row

All map to changed behavior, safe-local ports, proxy relocation, Staff component extraction, or permission enforcement. None is a stale or one-off scratch test.

Ten fixture files are present: eight modified canonical local fixtures and two new local fixtures (`circuit_detail_phase2.local.mjs` and `home_sections_visual.local.sql`). They use synthetic data and belong in the test commit. No temporary certification identity was identified as an unintended production seed.

The poster render scripts are review generators, not fixtures; they remain useful committed tooling. Screenshots produced by them are excluded unless explicitly promoted to durable references.

## 17. Files outside expected scope

Every source, migration, test, fixture, doc, runtime asset, and required script can be tied to the rebranding, its security/auth work, or local-safe certification. The only out-of-release material is:

- Edge profile/cache under `artifacts/profile-ui/**`;
- `.artifacts/**` evidence;
- `scripts/padelleria-next-local.cjs.bak`;
- 16 unreferenced visual-verification files pending a human retention decision.

No unrelated product feature was found.

## 18. Shared-file and hunk-staging risk

The changeset is highly integrated. The following files combine multiple completed feature blocks:

| File/group | Combined concerns | Risk if split |
| --- | --- | --- |
| `src/app/page.tsx` | whole Home V2, tournaments, Padelleria, Monday League, circuits, MoviBack, services | critical; whole-file rewrite |
| `src/app/HomeV2.module.css` | all Home sections and responsive behavior | critical; new shared stylesheet |
| `src/components/public/PublicUI.module.css` | operator menu, select controls, shared modal/public primitives | high |
| `src/components/public/PublicHeader.tsx` | shell, role-aware Admin/Staff access, sticky behavior | high |
| `src/app/admin/layout.tsx` and `admin-ui.css` | operator navigation plus shared theme/Circuit image treatment | high |
| `src/app/api/admin/circuits/{route,[id]/route}.ts` | Circuit image/data changes, permission guards, typing cleanup | high |
| `src/app/api/admin/tournaments/{route,[id]/route}.ts` | permissions and tournament contract/type cleanup | high |
| `src/lib/padelleriaServer.ts` | Padelleria helpers and shared operator wrapper | high |
| `scripts/padelleria-local.mjs` | ports and acceptance modes for several domains | high |
| historic Monday/Auth/PF08 contract tests | proxy/component relocation and permission assertions | medium |

Fine-grained feature commits would require hunk staging in these files and coordinated partial versions of new imports. That would create untested intermediate states. The recommended plan deliberately avoids hunk staging and keeps the certified integrated application changes atomic.

## 19. Explicit KEEP list

MUST-STAGE after exclusion blockers are resolved:

- A: all changed/new release files under `src/**`, both package manifests, root `proxy.ts` deletion and `src/proxy.ts` addition.
- B: all eight migration files listed above.
- C: all 96 changed/new files under `tests/**` and `supabase/tests/**`, including the ten canonical fixtures.
- D: all 22 new/modified Markdown documents listed by the inventory.
- E runtime: the 12 new `public/**` assets listed above.
- E reference: the 11 certified reference images listed above.
- F: `supabase/config.toml`, three modified local scripts, and two poster review scripts.

Use the inventory CSV as the exact path allow-list.

## 20. Explicit DO-NOT-STAGE list

- `artifacts/profile-ui/**`
- `.artifacts/**`
- `scripts/padelleria-next-local.cjs.bak`
- `.next/**` (already ignored)
- the 16 files under `docs/rebranding/references/verification/**` unless explicitly promoted after review

The generated service worker/workbox files are unchanged and require no staging action.

## 21. REVIEW REQUIRED

1. `docs/rebranding/references/verification/**` — choose whether visual QA snapshots are durable repository history. Recommendation: exclude; the certified source references and textual documentation already preserve design intent.
2. `.gitignore` hygiene — resolved with narrow rules for `.artifacts/`, the browser profile, verification references and `*.bak`.
3. `src/lib/moviRequestsServer.ts:23` — the certified port literal is an intentional local Telegram safety check. Recommendation: keep; consider a named helper later only if local ports become configurable.

## 22. Release blockers and severity

| Severity | Finding | Resolution before staging |
| --- | --- | --- |
| HIGH | 924 Edge-profile files, about 76.1 MB, with potentially sensitive browser/session stores | resolved by a narrow ignore rule; explicit staging still verifies index exclusion |
| HIGH | `.artifacts/**` includes local status, schema dumps and certification output; one status file can contain local service keys | resolved by a narrow ignore rule; none is included in release commits |
| MEDIUM | 16 unreferenced visual-verification files and redundant ZIP have no retention decision | default-exclude or explicitly approve/document |
| MEDIUM | unignored `.bak` file | ignore or explicitly exclude |
| LOW | 146 CRLF-conversion warnings | avoid normalization; inspect staged diff |
| LOW | one intentional runtime local-port comparison | keep with documented fail-closed purpose |

No missing migration, production URL leak, real secret leak, unexplained deletion, or changed-line lint regression was found.

## 23. Recommended commit plan

The safest plan is three commits. It favors the already-certified integrated state over fragile feature-by-feature hunk staging.

### Commit 1

Suggested message: `feat: complete MOVI rebranding and operator platform`

Scope:

- all category-A files: package manifests, root proxy deletion, all changed/new `src/**`;
- all eight category-B migrations;
- all 12 runtime assets under `public/branding/**` and `public/posters/backgrounds/**`.

Dependencies: current HEAD. The eight migrations and application code land together so no intermediate scalar/array request mismatch, player-side gap, permission-import gap, proxy gap, or missing media column exists.

Hunk staging: none. Stage complete allow-listed files only.

Minimum validation after commit: TypeScript, production build, `git diff --check`, clean migration-chain 46/46, operator authorization contracts, public route smoke, poster production render.

### Commit 2

Suggested message: `test: certify MOVI release and local workflows`

Scope:

- all 96 category-C tests/fixtures;
- all six category-F local tooling files;
- explicitly exclude the `.bak` file.

Dependencies: Commit 1.

Hunk staging: none. The local runner is cross-domain and belongs as a whole with the complete test layer.

Minimum validation after commit: 440/440 static tests, all feature contract suites, 40/40 SQL and 14/14 isolated HTTP acceptance suites where reproducibility is required, TypeScript, build, changed-file lint gate, browser smoke 36/36, residue check, `git diff --check`.

### Commit 3

Suggested message: `docs: record MOVI release design and certification`

Scope:

- all 22 category-D documents;
- the 11 category-E certified reference images under `docs/rebranding/references/**` outside `verification/`;
- exclude `.artifacts/**` and the 16 REVIEW files unless separately approved.

Dependencies: Commits 1–2 so documentation describes code and evidence already present.

Hunk staging: none.

Minimum validation after commit: Markdown path/reference audit, image existence checks, `git diff --check`, final index allow-list/exclude-list comparison.

### Why the tempting feature split is rejected

A 10-commit feature sequence would require repeated hunk staging across Home, shared public CSS/header, Admin layout/theme, cross-domain Admin routes, permission helpers and the local runner. Because the certified tests cover the current combined tree, those partial states are not certified. If a later reviewer insists on feature-level commits, construct them in an isolated branch/worktree and run TypeScript plus the relevant migration/API/UI tests at every boundary; do not use ad hoc hunk selection directly in this working tree.

## 24. Final staging gate

Before any future `git add`:

1. resolve the `.gitignore` decision for `artifacts/`, `.artifacts/`, and backup files;
2. decide the 16 verification assets;
3. stage only from the inventory allow-list;
4. inspect `git diff --cached --name-status` and reject any H/I/J/K path;
5. ensure `proxy.ts` deletion and `src/proxy.ts` addition are together;
6. ensure each migration is paired with compatible code at the recommended atomic boundary;
7. rerun the minimum checks shown above.

## 25. Evidence files

Detailed local-only evidence is under `.artifacts/final-working-tree-audit/`, including:

- `working-tree-inventory.csv`
- `classification-counts.csv`
- `domain-counts.csv`
- `do-not-stage.csv`
- `review-required.csv`
- `asset-inventory.csv`
- `runtime-asset-hashes.csv`
- `runtime-asset-references.csv`
- `safe-scan-findings.csv` and `safe-scan-summary.csv`
- `browser-profile-risk.json`
- `lint-findings-vs-added-lines.csv`
- baseline status, branch, log, name-status, stat and numstat captures

These files are evidence only and are not part of the proposed commits.

## 26. Safety confirmation

- Nothing staged.
- Nothing committed.
- Nothing deleted or cleaned.
- No source, test, migration, API or existing documentation file modified by this task.
- No local database mutation.
- No production access.
- No push.
- No deploy.

```text
MOVI FINAL WORKING TREE FORENSICS = READY FOR REVIEW
```

## 27. Final delta KEEP update

The controlled KEEP set now also includes the following release delta:

- `20261019100000_player_side_preferences.sql`;
- player-side profile, Gioca/Allenati request, Admin rendering, Telegram,
  activities, matching, fixture, test, and documentation changes;
- `src/components/public/PublicBottomNav.tsx` and its public UI contract update,
  replacing the Circuiti slot with `/le-mie-attivita`;
- the loopback-host safety correction in `src/lib/moviRequestsServer.ts`, which
  removes runtime dependence on a hard-coded local port.

The prior EXCLUDE and REVIEW sets are unchanged. Generated PWA output from the
final build was limited to the four previously identified paths and was cleaned
under the existing path-specific authorization; every other working-tree entry
remained unchanged. The index remains empty.
