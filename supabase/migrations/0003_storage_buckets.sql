-- ============================================================================
-- 0003_storage_buckets.sql
-- Supabase Storage buckets and policies.
-- ----------------------------------------------------------------------------
-- product-public: intentionally public, CDN delivery of cover images + compressed
--   previews. Writes only by allow-listed admin.
-- product-private: private. Reads only via short-lived signed URLs issued by the
--   fulfillment server after verified payment + a download grant. Writes only
--   by allow-listed admin.
-- NOT runnable in the SQLite sandbox; apply via Supabase CLI / Dashboard.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('product-public', 'product-public', true),
  ('product-private', 'product-private', false)
on conflict (id) do nothing;

-- Storage RLS policies --------------------------------------------------------
-- (Supabase Storage objects are rows in storage.objects; RLS controls access.)

-- product-public: anyone may read; only admins may create/update/delete.
drop policy if exists "product_public_read" on storage.objects;
create policy "product_public_read" on storage.objects
  for select using (bucket_id = 'product-public');

drop policy if exists "product_public_admin_write" on storage.objects;
create policy "product_public_admin_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-public' and public.is_admin())
  with check (bucket_id = 'product-public' and public.is_admin());

-- product-private: NO public/anon read; only admins may write.
-- (Signed URLs are the only read path for customers, and are issued server-side
--  after verified payment. Storage-level public reads are deliberately blocked.)
drop policy if exists "product_private_admin_all" on storage.objects;
create policy "product_private_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-private' and public.is_admin())
  with check (bucket_id = 'product-private' and public.is_admin());
-- No SELECT policy for anon/authenticated on product-private ⇒ no direct reads.
