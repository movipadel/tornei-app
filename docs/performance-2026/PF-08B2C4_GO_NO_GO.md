# PF-08B2C4 — GO / NO-GO checklist

Every item requires an explicit recorded **PASS**. Any blank, FAIL, or uncertain item means **NO-GO**.

- [ ] Production backup/PITR recovery point and restore procedure verified.
- [ ] Final pre-flight output matches the approved evidence exactly.
- [ ] All 26 reward UUIDs/names/activity states match.
- [ ] No unknown active or unclassified reward exists.
- [ ] All 13 Store UUID/name/activity/link mappings match.
- [ ] All production-backed `requires_store_variant` values match.
- [ ] Asciugamano link, true flag, Grigio/Lime, UNICA, and stock identities verified.
- [ ] Palline Nucleon link, false flag, active metadata, UNICA, and zero-stock topology verified.
- [ ] B0 → B1 → B2R2 → B2L → B2R3 dependency order verified in production.
- [ ] Local reset, B2C3 harness, and PF-08B2R3 regression green for the release commit.
- [ ] Classification rollout SQL reviewed by a second operator.
- [ ] Rollback SQL and semantic rollback window reviewed.
- [ ] Current-route compatibility and Asciugamano legacy behavior accepted.
- [ ] Tubo’s pre-route-integration legacy limitation explicitly accepted.
- [ ] Route integration remains disabled or has a separate approved release plan.
- [ ] Server-side admin validation implementation status accepted.
- [ ] Monitoring dashboards/queries and responsible operators ready.
- [ ] Lock/statement timeout and controlled execution window approved.
- [ ] Explicit owner approval recorded.

**Current status: NO-GO** — preparation artifacts are ready, but production evidence, backup, infrastructure presence, monitoring, route/admin decisions, and approval must be confirmed at execution time.
