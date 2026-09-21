# Production Migration Manifest

Forward-only migrations. Never run `supabase db reset` against production.

| # | Migration ID | Description | Lock Risk | Backward Compatible | Preflight | Postflight | Rollback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0001_catalog_schema | Catalog tables, enums, CHECK, indexes | low | yes | `select count(*) from information_schema.tables where table_schema='public'` | verify 8 tables exist | forward-fix only |
| 2 | 0002_rls_and_admin | RLS policies + is_admin() | low | yes | verify RLS enabled | `select * from pg_policies where schemaname='public'` | forward-fix only |
| 3 | 0003_storage_buckets | Storage buckets + policies | low | yes | verify buckets exist | `select * from storage.buckets` | drop buckets (non-destructive) |
| 4 | 0004_catalog_search | FTS + search RPCs + indexes | medium | yes | verify search_vector column | `select * from public.search_products(p_q => 'test')` | forward-fix only |
| 5 | 0005_admin_cms | Admin tables + publish RPC + AAL2 RLS | medium | yes | verify is_active_admin() | `select public.is_active_admin()` | forward-fix only |
| 6 | 0006_payments | Cart + checkout + orders + refunds + webhook inbox | medium | yes | verify payment tables exist | `select count(*) from public.orders` | forward-fix only |
| 7 | 0007_fulfillment | Fulfillment tables + outbox + after_order_paid_extension | medium | yes | verify fulfillment tables exist | `select count(*) from public.fulfillment_outbox` | forward-fix only |
| 8 | 0008_trust_and_growth | Legal revisions + reviews + bundles + price history + promotions | low | yes | verify trust tables exist | `select count(*) from public.legal_revisions` | forward-fix only |

## Pre-Migration Checklist
1. Verify the exact project fingerprint (not dev/preview).
2. Confirm the reviewed backup or PITR point.
3. Record the migration start timestamp.
4. Confirm the recovery owner is available.
5. Pause conflicting admin publication or backfill work.

## Post-Migration Checklist
1. Verify migration history (`supabase migration list`).
2. Verify schema hash.
3. Verify generated types (`supabase gen types`).
4. Verify RLS + grants.
5. Verify security-definer search_path.
6. Verify Storage policies.
7. Run pgTAP tests.
8. Run Supabase security + performance advisors.
9. Run representative query plans.
10. Record the migration completion timestamp.

## Production Seed
Idempotent bootstrap ONLY: required configuration, genres, legal document keys.
Never creates: fake reviews, buyers, orders, payments, entitlements, promotions,
analytics, known/default admin credentials, or fake products.
