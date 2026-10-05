# MOVI operator permissions — Admin editor

Phase 4 adds Admin-only operator creation and editing at `/admin/users` and `/admin/users/[id]`. The list shows identity, role, active state, last login and human-readable Staff grants. The editor changes the existing `staff_users` identity; it never replaces or deletes it.

## Roles and grants

Admin has implicit full operational access and no `staff_permissions` rows. Staff has only the explicit grants selected from the central eleven-key catalogue. Creation starts with no implicit Staff grant. Every Staff save is a complete replacement set, including the valid empty set.

Promotion from Staff to Admin removes all explicit grants and full access applies on the next request. Demotion from Admin to Staff atomically installs the selected replacement grants; the same session immediately loses Admin access and the editor redirects a self-demoted operator to `/staff`.

Deactivation preserves role and grants but DB-authoritative session resolution rejects the operator on the next protected request. Reactivation makes the same still-valid signed session usable again. Self-deactivation is disabled in V1. Self-demotion is allowed only while another active Admin exists. Physical deletion is not exposed.

## Atomic mutation and concurrency

`admin_create_operator` and `admin_update_operator` are `SECURITY DEFINER` RPCs executable only by `service_role`. Each RPC rechecks that the actor is currently an active Admin, then changes role/status, replaces grants and appends one audit event in one transaction. Creation reuses `set_staff_password`; Phase 4 adds no credential-reset flow.

`staff_users.updated_at` is the optimistic concurrency token. A stale editor receives `409` rather than overwriting a newer change. A database trigger serializes every active-Admin removal with `pg_advisory_xact_lock` and recounts other active Admins after the lock. It protects demotion, deactivation and deletion even if code bypasses the application RPC.

## Audit model

One `operator.created` or `operator.updated` event represents each coherent save. The event includes actor, target, old/new role, old/new active state, grant additions/removals, request ID, timestamp and JSON before/after snapshots. Existing append-only enforcement rejects update and delete.

## Authorization and rollout

Pages and APIs use DB-authoritative Admin guards. A Staff operator with all eleven domain grants still receives `403` for operator management. Phase 2 domain guards remain unchanged.

Production rollout is deferred. Review the migration and local acceptance evidence, back up production, apply migrations in timestamp order, then smoke-test last-Admin protection and same-session transitions. Never run the local test fixtures against production.
