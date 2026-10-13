# MoviBack Corporate Conventions C3

## Scope

C3 adds server-controlled administration for agreements, one-time code batches, manual membership assignment, revocation, and read-only Customer Hub visibility. It builds on the certified C1+C2 schema and central earning RPC. Public activation, signup codes, pending-user reservations, public card badges, company reporting, and notifications remain deferred.

## Agreement lifecycle

The C1 states remain authoritative: `draft`, `active`, `suspended`, `expired`, and `revoked`. Only an active agreement inside its `[valid_from, valid_until)` interval can affect a future credit. Editing name, validity, status, or multiplier is prospective. Existing ledger rows retain their recorded agreement, entitlement, multiplier, and credited points.

All writes require the existing `moviback.manage` operator permission at the API boundary. Database functions are executable only by `service_role`; anonymous and authenticated roles receive no direct mutation grants.

## Code batches and security

The server uses Node cryptographic randomness and the alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. A code contains the `MOVI-` prefix followed by four groups of five random symbols. Normalization removes separators and converts input to uppercase. Lookup uses deterministic SHA-256 over the normalized high-entropy value.

The database stores only `code_hash`, a six-character suffix, lifecycle metadata, and the batch reference. Plaintext is returned only by the first successful generation response. It is never written to the database, audit JSON, logs, local storage, Supabase Storage, `public/`, or a temporary server file.

Each batch has a UUID idempotency key and a server-enforced maximum of 500 codes. A concurrent or later replay returns the existing batch reference and explicitly reports that plaintext is no longer recoverable. It never generates a second authoritative batch for the same operation token.

The one-time Admin screen supports copy and CSV download. CSV is built in browser memory from the initial response and revoked immediately after download. Later management shows suffixes, status, batch, validity, claim/revoke timestamps, and safe membership references only.

## Assignment and revocation

Manual assignment accepts an existing approved membership only. It creates no code and records `activation_source=admin`, `code_id=NULL`. Membership locking and the partial unique index permit only one current `scheduled` or `active` entitlement. Future starts are allowed within the agreement validity interval.

Revocation requires a reason, locks the same membership used by the credit path, keeps the historical entitlement, and records authoritative database time and operator identity. It does not alter membership, past credits, or balance. Unused or reserved codes can be revoked separately; claimed or used history cannot be rewritten through code revocation.

## Concurrency and earning

Assignment and entitlement revocation lock `loyalty_memberships` in the same order as `credit_moviback_points`. Agreement updates lock affected memberships before the agreement row. Therefore concurrent assignment, revoke-versus-earn, and update-versus-earn resolve according to database transaction order without mixed ledger snapshots.

The source of truth remains `SUM(loyalty_transactions.points_delta)`. C3 does not recalculate past points and does not change the C2 `max(promo, agreement)` rule, FITP factor, non-stacking policy, or multiplier exclusions.

## Audit

The append-only audit vocabulary is:

- `agreement_created`
- `agreement_updated`
- `code_batch_generated`
- `code_revoked`
- `entitlement_assigned`
- `entitlement_revoked`

Events include actor and target identifiers, before/after state where useful, reason where required, and database timestamp. Code hashes are removed from code-revocation snapshots and plaintext is never present.

## Customer Hub

The Customer Hub exposes the current active or scheduled convention, multiplier, state, validity, and activation source. Management links lead to the permission-protected agreement area. No public convention state or activation endpoint is introduced in C3.
