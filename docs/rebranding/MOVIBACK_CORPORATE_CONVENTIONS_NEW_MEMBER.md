# MoviBack corporate conventions — C5 new-member enrollment

## Scope

C5 lets a new MoviBack applicant provide an optional corporate agreement code in the existing enrollment form. The membership remains the primary product: convention validity never prevents an otherwise valid membership approval. C4 remains the independent activation flow for already-approved members.

## Transaction boundary

The certificate object is uploaded to storage first because object storage cannot participate in a PostgreSQL transaction. Its deterministic idempotency path is derived from the authenticated user and request token. The database RPC then atomically creates or updates the membership request, certificate row, hash-only code reservation, pending entitlement, append-only audit events, and stable idempotency result.

On a database failure, a newly uploaded object is removed. A lost HTTP response can be replayed with the same token and payload without duplicating any row or reservation.

## Reservation and pending entitlement

Plaintext is normalized and hashed on the server with the same C3/C4 helper. Only the hash reaches the service-only RPC. A successful reservation changes the code from available to reserved, records database claimed_at, and binds claimed_by_membership_id to the membership. The code is immediately unavailable to other applicants.

The pending entitlement uses the new pending status:

- activation_source = code;
- activated_at = NULL;
- effective_from = NULL;
- no multiplier is effective.

The current-entitlement unique index includes pending, scheduled, and active, so one membership cannot reserve two concurrent benefits.

## Approval

review_moviback_membership_c5 owns certificate review, membership fee ledger entry, membership approval and convention resolution in one PostgreSQL transaction using authoritative database time.

When the reservation, code and agreement are valid:

- membership becomes approved;
- certificate becomes approved;
- code becomes used;
- entitlement becomes active;
- activated_at and effective_from equal the approval transaction time;
- effective_until follows the agreement;
- entitlement_activated_on_membership_approval is appended.

No enrollment or approval operation credits points. Only a later earn / club_payment processed by credit_moviback_points can use the active entitlement.

## Invalid convention at approval

Membership approval still succeeds. The entitlement becomes the new terminal state not_activated, with activated_at = NULL, effective_from = NULL, and a machine-readable not_activation_reason.

| Approval condition | Entitlement | Code |
| --- | --- | --- |
| Code validity elapsed | not_activated / code_expired | expired |
| Code explicitly revoked | not_activated / code_revoked | remains revoked |
| Agreement suspended | not_activated / agreement_suspended | closed |
| Agreement revoked | not_activated / agreement_revoked | closed |
| Agreement expired or outside validity | not_activated / corresponding reason | closed |
| Reservation ownership/status mismatch | not_activated / code_reservation_invalid | existing state retained |

not_activated is intentionally distinct from revoked: the benefit was never active. closed is intentionally distinct from available: an unsuccessful approval does not silently release a code.

## Rejection and resubmission

Rejecting a membership preserves the pending entitlement and reserved code and appends membership_rejected_reservation_retained. There is no automatic release.

- Resubmitting the same still-valid code continues the same reservation and entitlement.
- A different code is rejected while the first reservation remains current.
- If an Admin explicitly revoked the prior code, resubmission may close the old pending entitlement as not_activated and reserve one new valid code.
- No cron releases abandoned reservations.

C3 code revocation is the existing explicit Admin-controlled operation. C5 does not add an implicit or automatic release path.

## Public and Admin visibility

/api/moviback/me exposes safe agreement_state data: agreement name, multiplier, entitlement status, dates and terminal reason. It exposes no code hash or suffix. /moviback displays:

- Convenzione in attesa while the membership and entitlement are pending;
- the existing C4 Convenzione attiva card after successful approval;
- Convenzione non attivata if membership approval succeeded but the convention failed revalidation.

Admin review shows the agreement, multiplier, pending state, code lifecycle state and only the safe short suffix.

## Security, rate limiting and concurrency

The public endpoint derives the user from the authenticated cookie and never accepts membership, user, agreement, entitlement or multiplier ownership fields. Code attempts reuse the C4 HMAC-backed durable rate limiter with a separate enrollment namespace.

The enrollment RPC serializes by authenticated user and locks the code. Approval locks membership, pending entitlement, code and agreement in the same transaction used by earning and administration. Covered races include:

- two users reserving one code;
- one user submitting two codes;
- approval versus code revoke;
- approval versus agreement suspension;
- approval versus resubmission;
- approval versus first earn.

## Deferred

Convention email notifications, public company directory, HR imports, bulk employee upload, advanced reporting and production rollout remain deferred to later phases.
