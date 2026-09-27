-- ============================================================================
-- catalog_rls.test.sql — security-matrix regression tests (pgTAP).
-- Runs in CI (`supabase db test`) against a fresh local Supabase, so every
-- migration's grants/policies are exercised exactly as deployed.
-- Each block pins a real exploit that was fixed; do not weaken to make green.
-- ============================================================================

begin;
  select plan(14);

  -- Fixtures (as the table owner; satisfy every CHECK constraint).
  insert into public.products (id, slug, title, short_description, product_type, lifecycle, price, price_currency, published_at)
  values
    ('10000000-0000-4000-8000-000000000001','t-pub','Pub','d','stems','published',1500,'USD',now()),
    ('10000000-0000-4000-8000-000000000002','t-draft','Draft','d','stems','draft',1500,'USD',null),
    ('10000000-0000-4000-8000-000000000003','t-unreviewed','Unrev','d','stems','draft',1500,'USD',null);
  insert into public.product_deliverables (id, product_id, storage_object_path, customer_filename, mime_type, bytes)
  values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','products/x/v1/a.zip','a.zip','application/zip',10);

  -- --- anon: public catalog only -------------------------------------------
  set local role anon;
  select is((select count(*) from public.products where slug like 't-%'), 1::bigint,
    'anon sees only the published product');
  select throws_ok($$ select 1 from public.product_deliverables $$, '42501', null,
    'anon has no privilege on private deliverables');
  select throws_ok($$ select 1 from public.orders $$, '42501', null,
    'anon has no privilege on orders');
  select throws_ok($$ select 1 from public.download_access_tokens $$, '42501', null,
    'anon has no privilege on download tokens');
  reset role;

  -- --- authenticated non-admin (any self-signed-up user) --------------------
  set local role authenticated;
  select set_config('request.jwt.claims',
    '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);

  -- C1: forging a paid order / entitlements via RPC.
  select throws_ok(
    $$ select public.mark_order_paid(gen_random_uuid(),'cs','pi','ch',false,'test','usd',0,0,0,0,0,'a@b.c','FL-X','[]'::jsonb) $$,
    '42501', null, 'non-admin cannot call mark_order_paid');
  select throws_ok($$ select public.after_order_paid_extension(gen_random_uuid()) $$,
    '42501', null, 'non-admin cannot mint entitlements');
  select throws_ok($$ select public.revoke_fulfillment(gen_random_uuid(),'revoke','x') $$,
    '42501', null, 'non-admin cannot revoke a buyer''s access');
  select throws_ok($$ select public.rate_limit_hit('k',1,60) $$,
    '42501', null, 'non-admin cannot reset/abuse the rate limiter');

  select is((select count(*) from public.orders), 0::bigint,
    'non-admin reads zero orders (RLS)');
  select is((select count(*) from public.product_deliverables), 0::bigint,
    'non-admin reads zero deliverables (RLS)');
  select throws_ok(
    $$ insert into public.products (slug,title,short_description,product_type,price,price_currency)
       values ('t-intruder','x','d','stems',100,'USD') $$,
    '42501', null, 'non-admin cannot create products');
  select is((select ok from public.publish_product('10000000-0000-4000-8000-000000000002', 1)), false,
    'non-admin publish is refused by the RPC''s own admin check');
  reset role;

  -- --- Integrity guards (as owner) -----------------------------------------
  select throws_ok(
    $$ update public.products set lifecycle = 'published', published_at = now()
       where id = '10000000-0000-4000-8000-000000000003' $$,
    '23514', null, 'an unreviewed product cannot be published (CHECK)');

  -- A purchased deliverable version cannot be deleted (buyers need it).
  insert into public.orders (id, order_number, checkout_attempt_id, stripe_session_id, currency, subtotal, total)
    values ('40000000-0000-4000-8000-000000000001','FL-TEST0001', gen_random_uuid(), 'cs_test_x', 'usd', 1500, 1500);
  insert into public.order_items (order_id, product_id, product_row_version, deliverable_asset_id, title, slug, product_type, unit_amount, currency)
    values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,
            '20000000-0000-4000-8000-000000000001','Pub','t-pub','stems',1500,'usd');
  select throws_ok(
    $$ delete from public.product_deliverables where id = '20000000-0000-4000-8000-000000000001' $$,
    '23503', null, 'a purchased deliverable cannot be deleted');

  select finish();
rollback;
