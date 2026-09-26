-- Quick fix: grant SELECT to anon on public catalog tables (needed for the publishable client)
-- Run this in the Supabase SQL Editor after the main migrations
grant select on public.products to anon, authenticated;
grant select on public.product_genres to anon, authenticated;
grant select on public.product_plugins to anon, authenticated;
grant select on public.product_media to anon, authenticated;
grant select on public.genres to anon, authenticated;
grant select on public.plugins to anon, authenticated;

-- Verify it works
select count(*) as published_products from public.products
  where lifecycle = 'published' and rights_status in ('original','licensed');
