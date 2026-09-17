\set ON_ERROR_STOP on

-- ============================================================================
-- LOCAL TEST FIXTURE ONLY
-- DO NOT APPLY TO PRODUCTION
-- ============================================================================
-- This fixture is deliberately fail-closed until the owner supplies the
-- SELECT-only metadata requested by:
-- docs/performance-2026/PF-08B2C3_PRODUCTION_METADATA_QUERY.sql
--
-- Missing evidence:
--   * linked Store product UUID/name for 11 STORE_PRODUCT rewards;
--   * requires_store_variant for all 13 STORE_PRODUCT rewards;
--   * active color, size, and exact stock identities for all 13 products;
--   * active/name confirmation and variants for Asciugamano Sport and
--     Palline Nucleon.
--
-- No production catalog row is invented. Replace this evidence gate with the
-- minimum sanitized inserts only after the owner reviews the query result.

DO $fixture_evidence_gate$
BEGIN
  RAISE EXCEPTION
    'PF08B2C3_PRODUCTION_METADATA_REQUIRED: classification fixture intentionally not populated';
END $fixture_evidence_gate$;
