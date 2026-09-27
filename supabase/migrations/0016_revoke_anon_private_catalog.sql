-- ============================================================================
-- 0016_revoke_anon_private_catalog.sql
-- ----------------------------------------------------------------------------
-- product_rights and upload_intents (0005) were created after 0002's revoke,
-- so Supabase's default privileges gave `anon` full CRUD on them; only RLS
-- stood in the way. product_deliverables had drifted to anon SELECT on the
-- hosted project. Anonymous visitors never need these tables: revoke, so
-- RLS is a second layer rather than the only one. Caught by the pgTAP
-- security-matrix test (supabase/tests/catalog_rls.test.sql).
-- ============================================================================
revoke all on public.product_deliverables, public.product_rights, public.upload_intents
  from anon;
