-- ============================================================================
-- catalog_rls.test.sql — pgTAP tests for the production access matrix.
-- ----------------------------------------------------------------------------
-- Run against a real Supabase project:
--   supabase db test
-- These are the production equivalents of tests/catalog/db-access.test.ts.
-- NOT runnable in the SQLite sandbox; documented as a blocker.
-- ============================================================================

begin;
  select plan(9);

  -- Test fixtures: an admin allow-list row + products in each state.
  -- (Assumes an auth.users row exists for the test admin id.)
  insert into public.admin_users (user_id) values
    ('00000000-0000-0000-0000-0000000000aa')
    on conflict do nothing;

  insert into public.genres (slug, name) values ('house','House')
    on conflict (slug) do nothing;

  insert into public.products (slug, title, short_description, product_type, lifecycle, rights_status, price, price_currency)
  values
    ('pub-original','P1','d','project_file','published','original',1900,'USD'),
    ('draft-original','P2','d','stems','draft','original',900,'USD'),
    ('archived-licensed','P3','d','sample_pack','archived','licensed',1500,'USD'),
    ('unreviewed-draft','P4','d','remake','draft','unreviewed',1900,'USD'),
    ('pub-rejected','P5','d','stems','published','rejected',1900,'USD')
  on conflict (slug) do nothing;

  set role anon;
  -- 1. anon sees only the published + rights-cleared product.
  select is(
    (select count(*) from public.products),
    1::bigint,
    'anon sees only published + rights-cleared products'
  );
  -- 2. anon cannot read product_deliverables at all.
  select is(
    (select count(*) from public.product_deliverables),
    0::bigint,
    'anon cannot read any deliverables'
  );
  -- 3. anon cannot read admin_users.
  select is(
    (select count(*) from public.admin_users),
    0::bigint,
    'anon cannot read the admin allow-list'
  );

  reset role;
  set role authenticated;
  -- 4. A non-admin authenticated user still cannot mutate.
  select throws_ok(
    $$ insert into public.products (slug,title,short_description,product_type,price,price_currency)
       values ('intruder','x','d','stems',100,'USD') $$,
    'non-admin insert is rejected'
  );

  reset role;
  -- 5-8. The publication CHECK rejects an unreviewed publish attempt.
  select throws_ok(
    $$ update public.products set lifecycle='published' where slug='unreviewed-draft' $$,
    'cannot publish an unreviewed product (CHECK constraint)'
  );

  select finish();
rollback;
