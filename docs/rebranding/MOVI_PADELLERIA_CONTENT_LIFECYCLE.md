# MOVI Padelleria — Content lifecycle

## Editorial kinds

`succede` represents current, upcoming or active editorial content. It is public only while published and inside its optional `visible_from` / `visible_until` window. The end instant remains inclusive for visibility.

`e_successo` is the retained recap/archive kind. It keeps the existing explicit publish/hide lifecycle and does not accept visibility windows or automatic deletion.

The two kinds never transform automatically. An editor deliberately creates or retags a recap when the past event is worth retaining.

## Featured

`featured` is the existing priority flag shown in Admin as **In evidenza**. It changes ordering only: visible featured content precedes visible non-featured content, then `sort_order`, `published_at DESC` and `id` apply. Featured never bypasses `visible_from`, `visible_until` or cleanup eligibility.

## Delete on expiry

`delete_on_expiry` is an opt-in boolean for short-lived `succede` content. It defaults to `false`, so existing rows preserve their current lifecycle. When enabled, `visible_until` is mandatory. The option is hidden for `e_successo`, and the database constraint rejects both an absent end date and use on `e_successo`.

Normal expired `succede` content remains stored for the future archive. Expired `succede` content with `delete_on_expiry = true` is permanently removed and must never enter that archive.

## Cleanup mechanism

Public reads only filter visibility and never delete data. Cleanup runs through the authenticated server-only endpoint:

`POST /api/cron/padelleria-content-cleanup`

with `Authorization: Bearer $CRON_SECRET`.

The database selects candidates using its own clock:

- `kind = 'succede'`
- `delete_on_expiry = true`
- `visible_until IS NOT NULL`
- `visible_until < statement_timestamp()`
- initially `deleted_at IS NULL`

The cleanup uses two phases:

1. the claim function changes candidates to a soft-deleted draft;
2. the route validates every stored path against the content UUID and removes only owned objects from the private `padelleria-content-media` bucket;
3. after successful Storage cleanup, one database function hard-deletes media rows and the content row atomically.

External video URLs are database references only and never trigger a remote deletion.

If Storage removal fails, the soft-deleted row and media metadata remain available for a later retry. `deleted_at` also acts as a 15-minute processing lease: overlapping jobs cannot immediately claim the same content, while a failed job becomes eligible again when the lease expires. Repeated executions are safe: missing/already-purged rows are skipped, and owned Storage removal is idempotent.

## Future archive contract

- normal expired `succede`: retained and eligible for the future archive read model;
- `delete_on_expiry` expired `succede`: permanently purged;
- `e_successo`: retained under its existing publish/hide semantics.

No `/padelleria` archive or detail route is introduced by this lifecycle phase.

## Production rollout

Deployment requires a separately authorized production change window:

1. back up and review the target database;
2. apply `20261013100000_padelleria_content_lifecycle.sql`;
3. configure `CRON_SECRET` in the application and scheduler secret stores;
4. add a scheduled POST to the cleanup endpoint, following the existing GitHub Actions cron pattern;
5. start with a low frequency such as hourly and inspect `claimed`, `purged`, `skipped` and `failed` counts;
6. alert and retry when `failed > 0`.

This repository change does not configure or invoke the production scheduler.
