# PF-08B2C10 — future production rollout

## Current state and decision

Preparation only. Production already contains PF-08 B0/B1/B2R2/B2L/B2R3, reward classification, and the earlier PF-08 application, while `MOVIBACK_SMART_REDEMPTION_ENABLED` is currently unset and therefore OFF by production default.

PF-08B2C10 is **not deployed**. This sequence requires a new manual GO/NO-GO decision and does not replace the PF-08 final production runbook.

## 0. Freeze, identity, backup, and operators

1. Freeze unrelated application/catalog/database changes.
2. Confirm the exact production Supabase and Vercel projects with two operators.
3. Record current Git commit, Vercel deploy, smart flag state, and rollback deploy.
4. Confirm a fresh production backup/recovery point and named restore operator.
5. Record the monitoring, database, application, smoke-test, and rollback owners.
6. Keep smart redemption OFF. Prefer setting the flag explicitly to `false` before the application deployment rather than relying on absence.

STOP if identity, health, backup, rollback, or ownership is uncertain.

## 1. Pre-migration SELECT checks

Run read-only checks in the confirmed production project and save output:

```sql
select
  count(*) filter (where qr_token is not null) as rows_with_qr,
  count(*) filter (where qr_token is null) as rows_without_qr,
  count(*) filter (where status = 'ready' and fulfillment_type = 'service') as ready_services,
  count(*) filter (where fulfillment_type is null) as legacy_rows
from public.reward_redemptions;

select status, fulfillment_type, count(*)
from public.reward_redemptions
group by status, fulfillment_type
order by status, fulfillment_type;

select count(*) as duplicate_qr_tokens
from (
  select qr_token
  from public.reward_redemptions
  where qr_token is not null
  group by qr_token
  having count(*) > 1
) duplicates;
```

Record aggregate fingerprints/counts for loyalty transactions, reward/Store stock, Store orders/items, redemption status groups, and repaired legacy SERVICE IDs so post-migration validation can prove that backfill changed only `manual_code`.

STOP on unexpected lifecycle/classification drift or unresolved duplicate QR data.

## 2. Apply the additive migration

Apply exactly:

```text
supabase/migrations/20260918160000_pf08_reward_manual_code.sql
```

The migration must run after `20260918120000_pf08_store_variant_inventory_semantics.sql`. It:

1. adds the nullable column and unique index;
2. installs the bounded cryptographic generator;
3. backfills existing QR-bearing rows;
4. installs the default, validates format/completeness checks, and adds immutability;
5. installs the additive smart-RPC wrapper.

Expected lock/risk profile: `ALTER TABLE` takes schema locks; unique-index construction and CHECK validation scan `reward_redemptions`; the backfill updates each QR-bearing redemption. Schedule a controlled window, monitor locks, and abort rather than wait through sustained contention.

STOP on timeout, collision/generation error, constraint failure, uncertain commit, unexpected lock pressure, or application instability. Do not deploy code until migration outcome is certain.

## 3. Backfill and schema validation

Run read-only validation immediately:

```sql
select
  count(*) filter (where qr_token is not null and manual_code is null) as qr_without_manual_code,
  count(*) filter (where manual_code is not null and manual_code !~ '^[2-9A-HJKMNP-Z]{8}$') as invalid_format,
  count(*) filter (where manual_code is not null) as populated_codes,
  count(distinct manual_code) filter (where manual_code is not null) as distinct_codes
from public.reward_redemptions;

select manual_code, count(*)
from public.reward_redemptions
where manual_code is not null
group by manual_code
having count(*) > 1;

select
  to_regprocedure('public.generate_pf08_reward_manual_code()') as generator,
  to_regprocedure('public.redeem_moviback_reward(uuid,uuid,uuid,uuid,uuid)') as public_rpc,
  to_regprocedure('public.redeem_moviback_reward_pf08b2r3(uuid,uuid,uuid,uuid,uuid)') as reviewed_inner_rpc;

select indexname
from pg_indexes
where schemaname='public'
  and indexname='reward_redemptions_manual_code_unique';
```

Required PASS:

- zero QR-bearing rows without code;
- zero invalid formats;
- populated count equals distinct count;
- unique index, generator, public wrapper, and reviewed inner RPC all exist;
- pre/post status groups are identical;
- point ledger counts/sums, reward stock, Store stock, orders/items, and repaired legacy lifecycle state are unchanged.

The two repaired legacy SERVICE redemptions should have codes after backfill but remain exactly in their repaired SERVICE/ready state. Do not infer or modify other legacy fulfillment types.

STOP on any business-state drift. Keep smart OFF and decide recovery/forward correction before application deployment.

## 4. Deploy application with smart flow OFF

1. Set `MOVIBACK_SMART_REDEMPTION_ENABLED=false` explicitly in Vercel Production.
2. Deploy the reviewed B2C10 application commit only after Phase 3 PASS.
3. Record deploy ID and logs.
4. Smoke-test with smart OFF:
   - home/login and MoviBack reads;
   - existing point accreditation by membership code and point QR;
   - staff scanner `mode=points`;
   - Consegna Premio section visibility and staff authorization;
   - a backfilled ready reward lookup by QR and manual code;
   - requested/terminal code produces correct non-deliverable result;
   - customer cannot call the staff reward-delivery endpoint;
   - no widespread 5xx or database errors.

This order is mandatory because the new application selects `manual_code`. Deploying it before the migration would break those reads.

If application smoke fails, roll back the app deploy and keep smart OFF. The additive schema/default may remain while the earlier application operates, subject to operator review.

## 5. Controlled smart-flow activation gate

Do not open smart flow to normal traffic yet. Reuse the PF-08 global-flag controlled window and immediate false-redeploy procedure.

After deliberately enabling `MOVIBACK_SMART_REDEMPTION_ENABLED=true` and redeploying the exact reviewed commit, immediately test with designated accounts:

### SERVICE

1. Redeem a representative classified SERVICE reward such as Quota slot Estiva or a lesson/quota.
2. Confirm `status=ready` and `ready_at` immediately.
3. Confirm QR and formatted manual code display immediately.
4. Scan the QR through Consegna Premio and confirm “Servizio erogato”.
5. With a separate SERVICE redemption, enter the manual code and confirm the same result.
6. Repeat delivery and confirm safe already-delivered behavior and no second points mutation.

### Asciugamano Sport

1. Confirm Grigio/Lime and UNICA selection remains required.
2. Redeem a controlled variant and confirm initial requested status.
3. Confirm both QR and manual code are hidden while requested/processing.
4. Move processing → ready through Richieste premio.
5. Confirm both credentials now work and exact stock/order snapshot remains correct.

### Tubo Palline

1. Confirm no customer variant selector.
2. Confirm zero stock rows remain zero and fulfillment order is created.
3. Confirm requested initial status and hidden credentials.
4. Move to ready and verify QR/manual delivery equivalence.

### Separation and security

1. Confirm a reward code cannot enter the point accreditation parser.
2. Confirm a membership/point code is rejected by reward delivery.
3. Confirm anonymous/customer requests to `/api/staff/reward-delivery` are denied.
4. Confirm staff/admin access succeeds without exposing raw database errors.

## 6. Activation decision and monitoring

Normal monitored smart traffic is allowed only if:

- migration/backfill validation is PASS;
- application-with-smart-OFF smoke is PASS;
- SERVICE QR and manual delivery are PASS;
- Asciugamano and Tubo regressions are PASS;
- point accreditation regression is PASS;
- authorization and replay are PASS;
- the deferred PF-08 controlled visual gate is PASS;
- monitoring and rollback operators are present;
- owner approval is recorded.

Monitor new redemptions, manual-code lookup failures, duplicate/invalid credential events, `PF08_*` errors, points, stock, orders, QR/manual delivery, staff queue, and notification failures during the first 15 minutes, first 60 minutes, and first business day.

Any duplicate, partial state, second debit/stock mutation, premature physical credential exposure, unauthorized lookup, code collision/format issue, or unsafe delivery result requires immediate smart flag OFF and reviewed investigation.

## 7. Rollback boundary

Preferred response to application/UX problems: set smart flow OFF and redeploy/promote the reviewed false configuration. Application rollback is next if the regression is broader.

Do not drop the column/index or reverse backfill after codes have been shown or used. Manual codes become operational credentials as soon as the application exposes them. After that point, database removal is unsafe; use a forward correction. Existing committed redemptions and lifecycle operations remain authoritative when the smart flag is disabled.

## Final status

The package is ready for a future manual production GO/NO-GO review after code review and commit. It is not deployed, production-approved, or ready for unattended activation.
