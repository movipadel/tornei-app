# PF-08 final GO / NO-GO card

Use this card during the approved manual production window. Every required box must be checked and evidenced. Any unchecked, failed, uncertain, or unexpected item means **NO-GO / SMART OFF**.

Release commit: ____________________  Window: ____________________  Owner: ____________________

## PRE-DB

- [ ] Correct production Supabase project confirmed by two operators.
- [ ] Current production application healthy; baseline recorded.
- [ ] Current deploy, Git commit, and rollback deploy recorded.
- [ ] Backup/recovery point ready and timestamped.
- [ ] Restore procedure known; rollback operator ready.
- [ ] Final `PF-08B2C4_PREFLIGHT.sql` output PASS and archived.
- [ ] Preflight fingerprints saved.
- [ ] Exact pending migration set/order reviewed; no unrelated migration.

Decision: [ ] GO to DB  [ ] NO-GO

## DB

- [ ] PF-08B0 `20260916170000_pf08_idempotency.sql` PASS.
- [ ] PF-08B1 `20260916180000_pf08_transactional_store_checkout.sql` PASS.
- [ ] PF-08B2R2 `20260916190000_pf08_smart_redemption.sql` PASS.
- [ ] PF-08B2L `20260916200000_pf08_redemption_lifecycle.sql` PASS.
- [ ] PF-08B2R3 `20260918120000_pf08_store_variant_inventory_semantics.sql` PASS.
- [ ] Classification transaction PASS.
- [ ] Postflight: 13 SERVICE / 13 STORE_PRODUCT / 0 NULL / 0 mismatch PASS.
- [ ] Asciugamano and Tubo exact links/topologies/flags PASS.
- [ ] Historical/unrelated fingerprints unchanged.
- [ ] Classification rollback safe boundary understood.

Decision: [ ] GO to APP  [ ] NO-GO

## APP — SMART OFF

- [ ] Vercel Production project and reviewed commit confirmed.
- [ ] `MOVIBACK_SMART_REDEMPTION_ENABLED=false` recorded.
- [ ] Application deploy completed with smart OFF; deploy ID recorded.
- [ ] Home/login/MoviBack/Store smoke PASS.
- [ ] Staff/admin queue and authorization smoke PASS.
- [ ] QR/read regression smoke PASS.
- [ ] No widespread or material 5xx increase.
- [ ] False redeploy/application rollback path ready.

Decision: [ ] GO to CONTROLLED SMART  [ ] NO-GO

## CONTROLLED SMART

- [ ] Quiet/restricted test window active; normal traffic not admitted.
- [ ] Global flag limitation acknowledged.
- [ ] `MOVIBACK_SMART_REDEMPTION_ENABLED=true` redeploy completed; deploy ID recorded.
- [ ] Asciugamano Grigio/Lime/UNICA visual PASS.
- [ ] Missing/invalid Asciugamano selection blocked.
- [ ] Tubo Palline no-selector/no-false-stock-warning visual PASS.
- [ ] Staff queue rendered-page/request/lifecycle visual PASS.
- [ ] QR requested/processing/ready/delivered visual PASS.
- [ ] One controlled SERVICE redemption PASS.
- [ ] Same-key replay produces no duplicate PASS.
- [ ] One controlled physical Store redemption PASS.
- [ ] Exactly one redemption/debit/order where applicable PASS.
- [ ] Stock, queue status, lifecycle, and QR readiness PASS.
- [ ] Telegram: one new-success alert attempt, no replay/failure duplicate, post-commit isolation PASS.

Any visual or functional failure: set smart flag false and redeploy immediately.

Decision: [ ] GO to MONITORED ACTIVATION  [ ] NO-GO / SMART OFF

## OPERATIONS

- [ ] Application/API/5xx monitoring active.
- [ ] `PF08_*` error monitoring active.
- [ ] Database locks, points, stock, order, and duplicate monitoring active.
- [ ] QR and Richieste premio queue monitoring active.
- [ ] Telegram failure monitoring active.
- [ ] Monitoring owner assigned for first 15 minutes, first 60 minutes, and first business day.
- [ ] Rollback operator remains available.
- [ ] Second-operator review signed.
- [ ] Explicit owner approval recorded.

## Final decision

- [ ] **GO — MONITORED ACTIVATION**
- [ ] **NO-GO — SMART OFF**

Decision time/timezone: ____________________

Primary operator: ____________________

Second operator: ____________________

Owner approval/evidence reference: ____________________

If GO is not explicitly checked, the authoritative state is **NO-GO / SMART OFF**. This card does not authorize unattended activation.
