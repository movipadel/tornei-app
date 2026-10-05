# MOVI tournament poster system

## Temporary poster background policy

Only two production poster backgrounds are currently approved:

- every `Baraonda` tournament uses `public/posters/backgrounds/poster-baraonda-maschile.png`;
- every `Coppie fisse` tournament uses `public/posters/backgrounds/poster-coppie-maschile.png`.

This rule applies to every category, including Maschile, Femminile, Misto, Open and Libero. Category and circuit membership intentionally do not participate in production background selection. Unsupported or unknown tournament types use the renderer's safe neutral fallback.

Category-specific poster backgrounds are deferred future work. The centralized resolver in `src/lib/posters/getPosterProductionBackground.ts` is the only production selection point and can be extended when new variants are designed and explicitly approved. Existing source assets remain untouched until then.
