# MOVI tournaments public UI alignment

## Visual sources

The authoritative source is the current MOVI Public UI used by Home V2, Circuit Detail, Padelleria Detail, the public header and the bottom navigation. The historical reference at `docs/rebranding/references/tournaments/MOVI_TOURNAMENTS_LEGACY_MOCKUP_REFERENCE.png` was reviewed only for information hierarchy, catalogue flow and registration-state prominence. Its neon palette, gradients and phone-frame proportions were not reproduced.

## Preserved behavior

The `/tornei` page keeps the existing tournament read model, visibility rules, registration and cancellation flows, participant counts, live actions, authentication behavior and `/tornei?tournament=<uuid>` lookup. The deep-linked wrapper remains programmatically focusable and now receives a visible cyan focus treatment. Tournament APIs, database schema and Home tournament behavior are unchanged.

## Page and card hierarchy

The page uses the shared public dark tokens, safe-area aware shell and bottom navigation. The header contains the title “I Tornei della Padelleria” and subtitle “Partecipa e gestisci le tue iscrizioni.”, with no eyebrow or secondary information card. It flows directly into “Prossimi tornei” and the future-tournament count. Cards prioritize tournament identity, real circuit name, date/time/location, category and level, participant capacity, registration status and action. Existing `image_url` media is used when present; otherwise the approved shared tournament fallback resolver is used. Poster/locandina assets are not used as catalogue media.

Category pills use controlled semantic blue, plum, teal and ochre accents. Level remains a neutral dark pill. Registered and reserve states use the existing positive and warning semantics; cancellation stays a separate 44 px control.

## Filters

The current catalogue has no filter state or filter controls. No filtering behavior was added in this visual-only pass. A future filter UI must be backed by an approved functional model before it is rendered.

## Responsive behavior

Cards remain one per row from 320 px through desktop. At narrow widths actions wrap below participant data; from 700 px the existing landscape image/fallback sits beside the richer catalogue content. The page constrains its reading width at 980 px and preserves the public shell safe areas. Interactive controls have a minimum 44 px target, visible keyboard focus and no required horizontal scrolling.

## Local review

- Default catalogue: `http://127.0.0.1:3100/tornei`
- Deep link: `http://127.0.0.1:3100/tornei?tournament=<uuid>`
- Suggested viewports: 320, 390, 440, 768 and 1280 CSS pixels.
- Registered state requires the existing local authenticated fixture/user. There is no active-filter screenshot because the current product has no supported filter behavior.
