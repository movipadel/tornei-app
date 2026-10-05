# MOVI Padelleria — canonical content detail

## Canonical route

Every public Padelleria item uses its existing UUID at `/padelleria/[id]`. This phase does not introduce slugs, redirects, a `/padelleria` archive page or new database fields.

Home editorial cards always link to this internal route, including cards without an editorial CTA. The entire card is the semantic link and contains no nested action. `cta_url` is no longer a Home-card destination.

## Public read model and visibility

`GET /api/padelleria/[id]` returns only the public fields required by the detail page: identity, kind, title, excerpt, plain-text body, editorial date fields, CTA and ordered media.

The read model uses the anonymous database role and the existing `padelleria_public_read` RLS policy, whose `padelleria_is_visible` predicate evaluates time on the database. It returns `404` for malformed UUIDs and for content that is draft, deleted, missing or not currently visible. A `succede` item must be inside its publication window; an expired `succede` is not directly readable in this phase. A published, non-deleted `e_successo` item remains readable. The endpoint does not reveal whether a hidden UUID exists.

Lifecycle and `delete_on_expiry` behavior are unchanged.

## Editorial rendering

The existing Public UI shell supplies the public header and bottom navigation. The detail page adds a stable “Torna alla Home” link, optional 16:9 cover, human-readable kind and date, title, optional excerpt, and body.

Body content is rendered as escaped plain text with paragraphs and newlines preserved. HTML and Markdown are not interpreted.

The cover is rendered only when a cover medium exists. Gallery images retain their stored order and caption. YouTube and Vimeo references are converted through the existing allowlisted embed helper and rendered in responsive 16:9 frames. Invalid providers are omitted without injecting raw HTML.

## CTA

The detail renders a CTA only when both a valid label and safe URL exist. Internal paths stay in the same tab. External HTTPS destinations open in a new tab with `noopener noreferrer`. No placeholder CTA is invented.

## Signed media

The detail API and server-rendered page use the same uncached server read model. Visibility is checked before Storage is queried. Each request creates fresh private-bucket signed URLs with the existing approximately 300-second lifetime, so a direct load or refresh does not reuse stale media URLs.

If media metadata or Storage signing is temporarily unavailable, the detail remains readable without media instead of rendering broken placeholders or exposing an internal error.

## Deferred archive phase

Normal expired `succede` content remains unavailable publicly. A later phase may introduce the archive route, pagination and navigation from archived listings. This phase intentionally adds none of them.
