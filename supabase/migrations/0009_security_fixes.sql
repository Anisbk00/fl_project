-- ============================================================================
-- 0009_security_fixes.sql — production audit fixes (grants + policies).
-- ----------------------------------------------------------------------------
-- C1: payment/fulfillment SECURITY DEFINER RPCs were EXECUTE-able by any
--     `authenticated` session (forge paid orders / revoke any buyer's access).
--     They are now callable only by the server (service_role).
-- H1: catalog table privileges were revoked in 0002 and only patched by the
--     out-of-band supabase/fix-grants.sql. Grants now live here; RLS remains
--     the row-level boundary.
-- H2: unpublish_product was never granted (0005 re-granted archive_product).
-- H8: Storage + join-table admin policies used is_admin() without AAL2.
-- Taxonomy: genres/plugins had RLS enabled with no policies at all.
-- Private tables: anon/authenticated keep no table privileges beyond what an
--     explicit policy needs (defense in depth under RLS).
-- ============================================================================

-- --- C1: server-only RPCs ----------------------------------------------------
revoke all on function public.mark_order_paid(uuid,text,text,text,boolean,text,text,bigint,bigint,bigint,bigint,bigint,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.after_order_paid_extension(uuid) from public, anon, authenticated;
revoke all on function public.revoke_fulfillment(uuid,text,text) from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid,text,text,text,boolean,text,text,bigint,bigint,bigint,bigint,bigint,text,text,jsonb)
  to service_role;
grant execute on function public.after_order_paid_extension(uuid) to service_role;
grant execute on function public.revoke_fulfillment(uuid,text,text) to service_role;

-- revoke_fulfillment is now server-only, so the in-function admin check (which
-- let ANY caller 'revoke') is replaced by the grant above. Keep the body's
-- behavior; drop the auth.uid()-based branch that no longer applies.
create or replace function public.revoke_fulfillment(p_order_id uuid, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action = 'revoke' then
    update public.fulfillment_entitlements set state = 'revoked', revocation_reason = p_reason, updated_at = now()
      where order_id = p_order_id and state in ('active','held');
    update public.download_access_tokens set revoked_at = now(), revocation_reason = p_reason
      where order_id = p_order_id and consumed_at is null and revoked_at is null;
    update public.download_access_sessions set revoked_at = now(), revocation_reason = p_reason
      where order_id = p_order_id and revoked_at is null;
  elsif p_action = 'hold' then
    update public.fulfillment_entitlements set state = 'held', hold_reason = p_reason, updated_at = now()
      where order_id = p_order_id and state = 'active';
    update public.download_access_sessions set revoked_at = now(), revocation_reason = p_reason
      where order_id = p_order_id and revoked_at is null;
  elsif p_action = 'release' then
    update public.fulfillment_entitlements set state = 'active', hold_reason = null, updated_at = now()
      where order_id = p_order_id and state = 'held';
  else
    raise exception 'invalid action';
  end if;
end;
$$;
revoke all on function public.revoke_fulfillment(uuid,text,text) from public, anon, authenticated;
grant execute on function public.revoke_fulfillment(uuid,text,text) to service_role;

-- --- H2: unpublish grant -----------------------------------------------------
revoke all on function public.unpublish_product(uuid,int) from public, anon, authenticated;
grant execute on function public.unpublish_product(uuid,int) to authenticated;

-- --- H1: catalog grants (replaces supabase/fix-grants.sql) --------------------
grant select on public.products, public.product_genres, public.product_plugins,
                public.product_media, public.genres, public.plugins
  to anon, authenticated;
grant insert, update, delete on public.products, public.product_genres, public.product_plugins,
                public.product_media, public.product_deliverables, public.product_rights,
                public.genres, public.plugins, public.upload_intents
  to authenticated;
grant select on public.product_deliverables, public.product_rights, public.upload_intents,
                public.audit_events
  to authenticated;

-- --- Taxonomy policies -------------------------------------------------------
drop policy if exists "genres_public_select" on public.genres;
create policy "genres_public_select" on public.genres
  for select to anon, authenticated using (true);  -- non-sensitive public taxonomy
drop policy if exists "genres_admin_write" on public.genres;
create policy "genres_admin_write" on public.genres
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());

drop policy if exists "plugins_public_select" on public.plugins;
create policy "plugins_public_select" on public.plugins
  for select to anon, authenticated using (true);  -- non-sensitive public taxonomy
drop policy if exists "plugins_admin_write" on public.plugins;
create policy "plugins_admin_write" on public.plugins
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());

-- --- H8: AAL2 on join tables + Storage --------------------------------------
drop policy if exists "joins_admin_all" on public.product_genres;
create policy "joins_admin_all" on public.product_genres
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());
drop policy if exists "plugins_join_admin_all" on public.product_plugins;
create policy "plugins_join_admin_all" on public.product_plugins
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());

drop policy if exists "product_public_admin_write" on storage.objects;
create policy "product_public_admin_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-public' and public.is_active_admin() and public.aal2())
  with check (bucket_id = 'product-public' and public.is_active_admin() and public.aal2());
drop policy if exists "product_private_admin_all" on storage.objects;
create policy "product_private_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-private' and public.is_active_admin() and public.aal2())
  with check (bucket_id = 'product-private' and public.is_active_admin() and public.aal2());

-- Bucket-level limits (second line of defense behind app validation).
update storage.buckets set file_size_limit = 64 * 1024 * 1024,
  allowed_mime_types = array['image/png','image/webp','image/jpeg','audio/mpeg','audio/mp4','audio/aac','video/mp4','video/webm']
  where id = 'product-public';
update storage.buckets set file_size_limit = 2147483648,
  allowed_mime_types = array['application/zip','application/x-zip-compressed']
  where id = 'product-private';

-- --- Private tables: no browser-role privileges beyond admin reads -----------
revoke all on public.guest_carts, public.guest_cart_items, public.checkout_attempts,
              public.checkout_attempt_items, public.webhook_inbox, public.orders,
              public.order_items, public.refunds, public.fulfillment_generations,
              public.fulfillment_entitlements, public.download_access_tokens,
              public.download_access_sessions, public.delivery_messages,
              public.fulfillment_outbox, public.email_webhook_inbox,
              public.download_url_issuances, public.audit_events, public.admin_users
  from anon, authenticated;
grant select on public.checkout_attempts, public.checkout_attempt_items, public.webhook_inbox,
                public.orders, public.order_items, public.refunds,
                public.fulfillment_generations, public.fulfillment_entitlements,
                public.delivery_messages, public.fulfillment_outbox,
                public.email_webhook_inbox, public.download_url_issuances,
                public.audit_events, public.admin_users
  to authenticated;  -- still gated by the admin+AAL2 (or self) SELECT policies
grant insert, update, delete on public.admin_users to authenticated;  -- admin_users_admin_mutate policy
