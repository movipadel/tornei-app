# MoviBack Admin review: C5 → C6 release order

The Admin membership queue calls the server-side `reviewMovibackMembershipCompatible` adapter. It first calls `review_moviback_membership_c6` with an explicit `certificate_id`. Only a `PGRST202` schema-cache response naming that exact C6 function permits a retry through `review_moviback_membership_c5`. Business failures, expired certificates, state conflicts, permission failures, and unrelated database errors never retry C5.

C5 selects the user's latest certificate rather than accepting a certificate ID. Before the fallback, the adapter checks that the selected ID is the newest upload and that its timestamp is not tied. A mismatch stops the review without invoking C5. A concurrent upload between this check and the C5 call remains a limitation of the pre-migration RPC; the application cannot make C5's selection atomic with an exact ID. If exact certificate targeting is required, wait for C6.

Certificate-only review, including Customer Hub player and account-only views, continues through `/api/admin/moviback/certificates/[id]/review` and `review_moviback_certificate` with an explicit ID. Before migration 100000 this action reports that certificate review is unavailable; it never falls back to C5. The Admin guard, origin check, and server-side service-role client remain on both routes.

The same application release also contains media-consent code for migration 120000. Until that schema is installed, Customer Hub returns an unavailable consent state without failing its account lookup, profile and Admin forms hide consent actions, and signup hides the optional consent choice. A forged consent choice is rejected before Auth user creation. Auth linking ignores only the exact missing `consume_user_media_signup_intent` RPC; other database errors still fail. After 120000, these features become available through the installed RPCs and view. The expiry workflow must remain disabled until 110000 and the subsequent email guard are installed.

Release sequence:

1. Deploy this compatibility application while production still has C5. Verify Admin membership approve and reject on safe cases. Certificate-only review requires migration 100000.
2. Apply **only** `20261102100000_moviback_certificate_review_hardening.sql` manually after its separate database prechecks. It installs C6 and certificate review, then revokes service-role EXECUTE on C5.
3. Verify the already-deployed application uses C6 for membership approve and reject and the exact-ID RPC for certificate review. Check the PostgREST schema cache if the new RPC initially reports `PGRST202`; a stale cache may make the application attempt C5, which is then revoked, so do not treat that as a successful fallback.
4. Apply later migrations only after the 100000 verification passes.
5. Remove the C5 fallback in a future application release after C6 is established in production.

This document defines deployment order only. It does not authorize a deployment or database change.
