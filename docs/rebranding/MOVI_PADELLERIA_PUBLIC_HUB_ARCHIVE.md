# MOVI Padelleria public hub and archive

## Public architecture

`/padelleria` is the public editorial hub. It defaults to **Succede** and accepts the stable archive URL `/padelleria?view=archivio`. Invalid `view` values safely render Succede. Both views use batches of 12 and a “Carica altri” action backed by `limit`, `offset` and `pagination.has_more`.

Succede contains published, non-deleted `succede` records whose visibility window includes the database clock. Future scheduled content is excluded. A missing `visible_until` remains current under the established lifecycle rule.

Archivio combines, newest first:

- published, non-deleted `e_successo` records;
- published, non-deleted, expired `succede` records with `delete_on_expiry=false` and a non-null `visible_until`.

The chronological key is `occurred_at`, then `visible_until`, then `published_at`, with ID as the deterministic tie-breaker. The record kind is never changed and no archive flag or duplicate row is created.

## Visibility and RLS decision

Migration `20261014100000_padelleria_public_archive.sql` keeps `padelleria_is_visible()` unchanged for current feeds. It adds `padelleria_is_public()` for the detail/media contract and replaces only the two public read policies. The new predicate admits current content plus retained expired Succede. It explicitly excludes drafts, deleted rows, future Succede and every expired Succede with `delete_on_expiry=true`, even before the cleanup job runs.

`padelleria_public_archive_list()` implements the same archive predicate and deterministic order. The existing current-feed RPC remains separate so featured ordering continues to apply only to current/Home content. Public endpoints do not use unrestricted service-role table reads as a substitute for visibility checks.

The policy migration must be applied during production rollout before the application build is deployed. No production migration is performed by this work.

## Detail and media

`/padelleria/[id]` continues to establish visibility with the anon/RLS client before signing media. It now admits retained expired Succede because the policy uses `padelleria_is_public()`. Hidden content still returns 404. Its stable back link targets `/padelleria`.

Hub/list responses request cover media only. Details continue to load ordered cover, gallery and video media. CTA data remains available only on the detail presentation; cards are whole-card links without nested actions.

## Home

Home remains a showcase. Both Padelleria requests changed from 12 to 6 items. “Succede in Padelleria” links to `/padelleria`; “È successo in Padelleria” links to `/padelleria?view=archivio`. Empty Home sections remain omitted.

## Local validation

Use only `scripts/padelleria-local.mjs`. The runner verifies the unlinked local Supabase endpoints, constructs a clean environment and bypasses repository `.env` files. Validate current, future, retained-expired, ephemeral-expired, recap, draft and deleted records before rollout.
