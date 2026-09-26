# MOVI Player Matching

## Scope

Player Matching is an Admin-only, deterministic suggestion engine inside **Customer Hub → Giocatori**. It filters explicit incompatibilities, scores the remaining sporting profiles and returns explainable suggestions. It never selects or contacts a player automatically.

The engine reads only Player Identity, Player Profile with weekly availability, and Player Admin Profile numeric MOVI level. It does not read fiscal, medical, authentication, MoviBack, points, rewards, redemption or internal-note data.

## Criteria and weights

| Criterion | Maximum | Rules |
| --- | ---: | --- |
| Level | 30 | Numeric exact 30, distance 0.5 = 24, distance 1.0 = 16; a greater numeric distance excludes. |
| Day/time | 25 | Requested weekday 10, requested time window 15. |
| Club | 20 | Preferred 20, other clubs allowed 12, no preferences 10. |
| Match type | 15 | Explicit 15, any = 12, missing preference 10. |
| Last minute | 10 | In urgent searches: yes 10, unknown 5, no 0. |

For a numeric target with no numeric candidate level, a matching descriptive category scores 20/30. For a descriptive target, a candidate numeric level is compared through its approved descriptive category and scores at most 24/30; no numeric midpoint is fabricated.

## Unknown data

Unknown means unknown, not incompatible:

- missing level scores 8/30;
- no weekly availability scores a neutral 12/25;
- no club preference means no club restriction and scores 10/20;
- a non-empty club preference with unknown other-club availability scores 10/20;
- no match-type preference scores 10/15;
- unknown urgent availability scores 5/10.

Profile completeness remains a separate data-quality indicator and is not part of the matching score.

## Hard exclusions

A candidate is excluded only for:

- numeric MOVI level outside the requested ±1.0 interval;
- requested club not preferred while available_other_clubs is false;
- explicit incompatible match-type preference;
- archived or merged Player Identity;
- the requester identity when an adapter supplies exclude_player_id.

An open identity case does not exclude automatically. The result carries an **Identità da verificare** warning for Admin judgment.

## Normalization, threshold and ordering

Urgent searches use the raw 100 point scale. Normal searches have a raw maximum of 90 because last minute is irrelevant. Their final score is:

    round(raw score / 90 × 100)

Only candidates scoring at least 50/100 are returned. The endpoint returns at most 20 candidates, ordered by final score descending, numeric level distance ascending, explicit availability confidence descending, then player name and stable identity ID.

## Query and privacy boundary

The server first selects at most 500 canonical active Player Identities, ordered stably, then loads profiles, numeric levels, availability and open identity warnings through four set-based queries. Scoring runs on the server. The browser receives only operational sporting/contact fields and score explanations.

Players without accounts remain eligible and are marked **Senza account**.

## Future Gioca reuse

The pure domain functions in src/lib/playerMatching.ts accept either a numeric target or a descriptive target, a canonical weekday, time window, club, match type, urgency flag and optional requester identity. A future Gioca adapter can derive the weekday from a request date and call the same server-side engine. Stage 6 does not connect Gioca requests to matching.

## Local scenarios

Run the synthetic fixture only against the verified, unlinked local Supabase stack:

    supabase/tests/fixtures/player_matching.local.mjs

Scenario A uses Manta, MOVI 3.5, Friday evening, male and normal urgency.

Scenario B uses Costigliole, MOVI 3.0, Wednesday evening, mixed and last minute.

The fixture also covers unrestricted clubs, explicit club mismatch, unknown and incompatible availability, any and missing match types, all last-minute states, no-account players, archived/merged identities, open identity warnings, partial profiles and full profiles.
