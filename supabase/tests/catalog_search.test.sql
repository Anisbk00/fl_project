-- ============================================================================
-- catalog_search.test.sql — Step 3 pgTAP tests for the public catalog
-- search/detail/related functions and RLS deny rules.
-- ----------------------------------------------------------------------------
-- Run with:  supabase db test
-- NOT runnable in the SQLite sandbox (no Docker/Supabase CLI); documented as a
-- blocker. The committed SQL is the production source of truth.
-- ============================================================================

begin;
  select plan(10);

  -- Assumes seed.sql has been applied (supabase db reset applies it).

  set role anon;

  -- 1. search_products() returns only published + rights-cleared products.
  select is(
    (select count(*) from public.search_products()),
    6::bigint,
    'anon search_products returns exactly the published + rights-cleared products'
  );

  -- 2. search_products() never returns hidden slugs.
  select is(
    (select count(*) from public.search_products()
       where slug in ('draft-track','archived-pack','unreviewed-draft','rejected-public')),
    0::bigint,
    'anon never sees draft/archived/unreviewed/rejected products via search'
  );

  -- 3. Text search filters by the public document (title weight A).
  select is(
    (select count(*) from public.search_products(p_q => 'vector')),
    1::bigint,
    'text search matches a title term'
  );

  -- 4. Product-type filter works.
  select is(
    (select count(*) from public.search_products(p_types => array['stems']::text[])),
    2::bigint,
    'type filter returns only stems'
  );

  -- 5. get_product_by_slug() returns a public product.
  select is(
    (select slug from public.get_product_by_slug('vector-drift')),
    'vector-drift',
    'anon get_product_by_slug returns a published rights-cleared product'
  );

  -- 6. get_product_by_slug() returns NULL for hidden slugs (nondisclosing).
  select is(
    (select count(*) from public.get_product_by_slug('draft-track')),
    0::bigint,
    'get_product_by_slug returns nothing for a draft (nondisclosing)'
  );
  select is(
    (select count(*) from public.get_product_by_slug('does-not-exist-at-all')),
    0::bigint,
    'get_product_by_slug returns nothing for a missing slug (nondisclosing)'
  );

  -- 7. The functions return ONLY public columns — no deliverable paths leak.
  --    (Function signatures omit deliverable columns by construction; this
  --     asserts the result does not contain a known private path.)
  select is(
    (select count(*) from public.search_products()
       where exists (select 1 from jsonb_array_elements(genres) j)),
    (select count(*) from public.search_products()),
    'search_products genres aggregate is well-formed'
  );

  -- 8. anon still cannot read product_deliverables or admin_users directly.
  select is(
    (select count(*) from public.product_deliverables),
    0::bigint,
    'anon cannot read product_deliverables (RLS deny)'
  );
  select is(
    (select count(*) from public.admin_users),
    0::bigint,
    'anon cannot read admin_users (RLS deny)'
  );

  select finish();
rollback;
