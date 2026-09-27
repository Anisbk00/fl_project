-- ====================================================================================
-- NEW MIGRATIONS 0009-0016 (run AFTER the original 0001-0008 are applied)
-- These came in via commit d2097b0 (Production hardening).
-- Paste this whole block into Supabase SQL Editor → Run.
-- ====================================================================================


-- ============================================================================
-- 0009_security_fixes
-- ----------------------------------------------------------------------------
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


-- ============================================================================
-- 0010_commerce_runtime
-- ----------------------------------------------------------------------------
-- ============================================================================
-- 0010_commerce_runtime.sql — runtime support for the purchase pipeline.
-- ----------------------------------------------------------------------------
-- 1. Drop the Step 7 (0008) tables: no route/UI ever used them and they held
--    no data. Removing them keeps "if it exists it must work" true.
-- 2. Durable, serverless-safe rate limiting (fixed window, one row per key).
-- 3. mark_order_paid: paid orders now enter fulfillment_state = 'started'
--    (was the dead 'blocked_until_step_6'); the email worker completes it.
-- 4. Lookup index for refund/dispute events keyed by PaymentIntent.
-- ============================================================================

-- --- 1. Remove unused Step 7 tables ------------------------------------------
drop table if exists public.redemption_reservations, public.promotions,
  public.review_moderation_events, public.reviews, public.free_acquisitions,
  public.marketing_consent_events, public.bundle_versions, public.price_history,
  public.recommendation_pins, public.legal_revisions cascade;

-- --- 2. Rate limiting --------------------------------------------------------
-- Keys are server-built "<action>:<sha256(ip)>" strings — never raw IPs/emails.
create table if not exists public.rate_limits (
  key          text primary key check (length(key) <= 200),
  window_start timestamptz not null,
  hits         integer not null check (hits >= 0)
);
alter table public.rate_limits enable row level security;  -- no policies: server only
revoke all on public.rate_limits from anon, authenticated;

-- Atomically count a hit; returns true while the caller is within the limit.
-- Single-statement upsert → correct under concurrent serverless instances.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.rate_limits as r (key, window_start, hits)
    values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                        then now() else r.window_start end,
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                then 1 else r.hits + 1 end
  returning hits <= p_limit;
$$;
revoke all on function public.rate_limit_hit(text,int,int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text,int,int) to service_role;

-- --- 3. mark_order_paid: enter fulfillment ------------------------------------
create or replace function public.mark_order_paid(
  p_attempt_id            uuid,
  p_stripe_session_id     text,
  p_stripe_payment_intent text,
  p_stripe_charge_id      text,
  p_stripe_livemode       boolean,
  p_expected_environment  text,
  p_expected_currency     text,
  p_expected_subtotal     bigint,
  p_stripe_subtotal       bigint,
  p_stripe_tax            bigint,
  p_stripe_discount       bigint,
  p_stripe_total          bigint,
  p_buyer_email           text,
  p_order_number          text,
  p_items                 jsonb
)
returns table (ok boolean, order_id uuid, errors jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.checkout_attempts;
  v_errors  jsonb := '[]'::jsonb;
  v_order_id uuid;
begin
  select * into v_attempt from public.checkout_attempts where id = p_attempt_id for update;
  if not found then
    return query select false, null::uuid, jsonb_build_array('not_found');
    return;
  end if;

  -- Idempotent re-delivery: the attempt already produced its one order.
  if v_attempt.state = 'completed' then
    select o.id into v_order_id from public.orders o where o.checkout_attempt_id = p_attempt_id;
    return query select true, v_order_id, '[]'::jsonb;
    return;
  end if;

  if v_attempt.stripe_session_id is distinct from p_stripe_session_id then
    v_errors := v_errors || '"session_mismatch"'::jsonb;
  end if;
  if (p_expected_environment = 'test') <> (not p_stripe_livemode) then
    v_errors := v_errors || '"environment_mismatch"'::jsonb;
  end if;
  if v_attempt.expected_currency <> p_expected_currency then
    v_errors := v_errors || '"currency_mismatch"'::jsonb;
  end if;
  if v_attempt.expected_subtotal <> p_expected_subtotal then
    v_errors := v_errors || '"subtotal_mismatch"'::jsonb;
  end if;
  if p_expected_subtotal <> p_stripe_subtotal then
    v_errors := v_errors || '"stripe_subtotal_mismatch"'::jsonb;
  end if;
  if (p_stripe_subtotal + p_stripe_tax - coalesce(p_stripe_discount,0)) <> p_stripe_total then
    v_errors := v_errors || '"total_does_not_reconcile"'::jsonb;
  end if;
  if p_buyer_email is null or p_buyer_email = '' then
    v_errors := v_errors || '"missing_email"'::jsonb;
  end if;

  if jsonb_array_length(v_errors) > 0 then
    update public.checkout_attempts set state = 'manual_review', failure_category = 'paid_transition_mismatch',
      updated_at = now() where id = p_attempt_id;
    insert into public.audit_events (actor_uid, action, entity_type, entity_id, changed_fields)
      values (null, 'checkout.manual_review', 'checkout_attempt', p_attempt_id, v_errors);
    return query select false, null::uuid, v_errors;
    return;
  end if;

  insert into public.orders (order_number, checkout_attempt_id, stripe_session_id,
      stripe_payment_intent_id, stripe_charge_id, payment_state, refund_state, dispute_state,
      fulfillment_state, currency, subtotal, discount, tax, total, amount_refunded, buyer_email, paid_at)
    values (p_order_number, p_attempt_id, p_stripe_session_id, p_stripe_payment_intent,
      p_stripe_charge_id, 'paid', 'none', 'none', 'started',
      p_expected_currency, p_expected_subtotal, coalesce(p_stripe_discount,0), p_stripe_tax,
      p_stripe_total, 0, p_buyer_email, now())
    on conflict (checkout_attempt_id) do nothing
    returning id into v_order_id;
  if v_order_id is null then
    select o.id into v_order_id from public.orders o where o.checkout_attempt_id = p_attempt_id;
  end if;

  insert into public.order_items (order_id, product_id, product_row_version, deliverable_asset_id,
      title, slug, product_type, unit_amount, currency, license_version)
    select v_order_id, (e->>'product_id')::uuid, (e->>'product_row_version')::int,
      (e->>'deliverable_asset_id')::uuid, e->>'title', e->>'slug', e->>'product_type',
      (e->>'unit_amount')::bigint, e->>'currency', nullif(e->>'license_version','')
    from jsonb_array_elements(p_items) e
    on conflict (order_id, product_id) do nothing;

  update public.guest_carts set state = 'converted', converted_order_id = v_order_id,
    converted_at = now(), updated_at = now()
    where id = v_attempt.cart_id;
  update public.checkout_attempts set state = 'completed', updated_at = now()
    where id = p_attempt_id;

  insert into public.audit_events (actor_uid, action, entity_type, entity_id, changed_fields)
    values (null, 'order.paid', 'order', v_order_id,
      jsonb_build_object('payment_state','paid','fulfillment_state','started'));

  perform public.after_order_paid_extension(v_order_id);

  return query select true, v_order_id, '[]'::jsonb;
end;
$$;
revoke all on function public.mark_order_paid(uuid,text,text,text,boolean,text,text,bigint,bigint,bigint,bigint,bigint,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid,text,text,text,boolean,text,text,bigint,bigint,bigint,bigint,bigint,text,text,jsonb)
  to service_role;

-- --- 4. Refund/dispute lookup ------------------------------------------------
create index if not exists orders_payment_intent_idx
  on public.orders (stripe_payment_intent_id) where stripe_payment_intent_id is not null;


-- ============================================================================
-- 0011_fix_mark_order_paid
-- ----------------------------------------------------------------------------
-- 0011: mark_order_paid ambiguity fix.
-- RETURNS TABLE(order_id ...) makes order_id a PL/pgSQL variable, so
-- 'on conflict (order_id, product_id)' raised 42702 on every call (also in 0006).
-- Naming the constraint removes the ambiguity. Body otherwise identical to 0010.
create or replace function public.mark_order_paid(
  p_attempt_id            uuid,
  p_stripe_session_id     text,
  p_stripe_payment_intent text,
  p_stripe_charge_id      text,
  p_stripe_livemode       boolean,
  p_expected_environment  text,
  p_expected_currency     text,
  p_expected_subtotal     bigint,
  p_stripe_subtotal       bigint,
  p_stripe_tax            bigint,
  p_stripe_discount       bigint,
  p_stripe_total          bigint,
  p_buyer_email           text,
  p_order_number          text,
  p_items                 jsonb
)
returns table (ok boolean, order_id uuid, errors jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.checkout_attempts;
  v_errors  jsonb := '[]'::jsonb;
  v_order_id uuid;
begin
  select * into v_attempt from public.checkout_attempts where id = p_attempt_id for update;
  if not found then
    return query select false, null::uuid, jsonb_build_array('not_found');
    return;
  end if;

  -- Idempotent re-delivery: the attempt already produced its one order.
  if v_attempt.state = 'completed' then
    select o.id into v_order_id from public.orders o where o.checkout_attempt_id = p_attempt_id;
    return query select true, v_order_id, '[]'::jsonb;
    return;
  end if;

  if v_attempt.stripe_session_id is distinct from p_stripe_session_id then
    v_errors := v_errors || '"session_mismatch"'::jsonb;
  end if;
  if (p_expected_environment = 'test') <> (not p_stripe_livemode) then
    v_errors := v_errors || '"environment_mismatch"'::jsonb;
  end if;
  if v_attempt.expected_currency <> p_expected_currency then
    v_errors := v_errors || '"currency_mismatch"'::jsonb;
  end if;
  if v_attempt.expected_subtotal <> p_expected_subtotal then
    v_errors := v_errors || '"subtotal_mismatch"'::jsonb;
  end if;
  if p_expected_subtotal <> p_stripe_subtotal then
    v_errors := v_errors || '"stripe_subtotal_mismatch"'::jsonb;
  end if;
  if (p_stripe_subtotal + p_stripe_tax - coalesce(p_stripe_discount,0)) <> p_stripe_total then
    v_errors := v_errors || '"total_does_not_reconcile"'::jsonb;
  end if;
  if p_buyer_email is null or p_buyer_email = '' then
    v_errors := v_errors || '"missing_email"'::jsonb;
  end if;

  if jsonb_array_length(v_errors) > 0 then
    update public.checkout_attempts set state = 'manual_review', failure_category = 'paid_transition_mismatch',
      updated_at = now() where id = p_attempt_id;
    insert into public.audit_events (actor_uid, action, entity_type, entity_id, changed_fields)
      values (null, 'checkout.manual_review', 'checkout_attempt', p_attempt_id, v_errors);
    return query select false, null::uuid, v_errors;
    return;
  end if;

  insert into public.orders (order_number, checkout_attempt_id, stripe_session_id,
      stripe_payment_intent_id, stripe_charge_id, payment_state, refund_state, dispute_state,
      fulfillment_state, currency, subtotal, discount, tax, total, amount_refunded, buyer_email, paid_at)
    values (p_order_number, p_attempt_id, p_stripe_session_id, p_stripe_payment_intent,
      p_stripe_charge_id, 'paid', 'none', 'none', 'started',
      p_expected_currency, p_expected_subtotal, coalesce(p_stripe_discount,0), p_stripe_tax,
      p_stripe_total, 0, p_buyer_email, now())
    on conflict (checkout_attempt_id) do nothing
    returning id into v_order_id;
  if v_order_id is null then
    select o.id into v_order_id from public.orders o where o.checkout_attempt_id = p_attempt_id;
  end if;

  insert into public.order_items (order_id, product_id, product_row_version, deliverable_asset_id,
      title, slug, product_type, unit_amount, currency, license_version)
    select v_order_id, (e->>'product_id')::uuid, (e->>'product_row_version')::int,
      (e->>'deliverable_asset_id')::uuid, e->>'title', e->>'slug', e->>'product_type',
      (e->>'unit_amount')::bigint, e->>'currency', nullif(e->>'license_version','')
    from jsonb_array_elements(p_items) e
    on conflict on constraint order_items_pkey do nothing;

  update public.guest_carts set state = 'converted', converted_order_id = v_order_id,
    converted_at = now(), updated_at = now()
    where id = v_attempt.cart_id;
  update public.checkout_attempts set state = 'completed', updated_at = now()
    where id = p_attempt_id;

  insert into public.audit_events (actor_uid, action, entity_type, entity_id, changed_fields)
    values (null, 'order.paid', 'order', v_order_id,
      jsonb_build_object('payment_state','paid','fulfillment_state','started'));

  perform public.after_order_paid_extension(v_order_id);

  return query select true, v_order_id, '[]'::jsonb;
end;
$$;
revoke all on function public.mark_order_paid(uuid,text,text,text,boolean,text,text,bigint,bigint,bigint,bigint,bigint,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid,text,text,text,boolean,text,text,bigint,bigint,bigint,bigint,bigint,text,text,jsonb)
  to service_role;


-- ============================================================================
-- 0012_admin_integrity
-- ----------------------------------------------------------------------------
-- ============================================================================
-- 0012_admin_integrity.sql — admin data-safety + auditability.
-- ----------------------------------------------------------------------------
-- 1. Purchased deliverables can never be deleted: order/attempt/entitlement
--    rows now reference product_deliverables with ON DELETE RESTRICT.
--    (Deactivate instead; buyers keep their purchased version.)
-- 2. publish_product: every product needs a downloadable ZIP, including free
--    ones (all acquisitions go through the entitlement flow). Was price > 0.
-- 3. Audit triggers on catalog tables. The 0005 header promised "trusted
--    triggers" but none existed, so price edits, file uploads/removals and
--    rights changes left no trail. Actor = auth.uid(), never a form field.
-- ============================================================================

-- --- 1. Deliverable referential integrity -----------------------------------
alter table public.order_items
  add constraint order_items_deliverable_fk foreign key (deliverable_asset_id)
  references public.product_deliverables(id) on delete restrict;
alter table public.checkout_attempt_items
  add constraint attempt_items_deliverable_fk foreign key (deliverable_asset_id)
  references public.product_deliverables(id) on delete restrict;
alter table public.fulfillment_entitlements
  add constraint entitlements_deliverable_fk foreign key (deliverable_asset_id)
  references public.product_deliverables(id) on delete restrict;
create index if not exists order_items_deliverable_idx on public.order_items (deliverable_asset_id);
create index if not exists attempt_items_deliverable_idx on public.checkout_attempt_items (deliverable_asset_id);
create index if not exists entitlements_deliverable_idx on public.fulfillment_entitlements (deliverable_asset_id);

-- --- 2. Publish gate: ZIP always required -----------------------------------
create or replace function public.publish_product(p_product_id uuid, p_expected_version int)
returns table (ok boolean, errors jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row        public.products;
  v_rights     public.product_rights;
  v_errors     jsonb := '[]'::jsonb;
  v_has_cover  boolean;
  v_has_zip    boolean;
begin
  if not (public.is_active_admin() and public.aal2()) then
    return query select false::boolean, jsonb_build_array('unauthorized')::jsonb;
    return;
  end if;

  select * into v_row from public.products where id = p_product_id for update;
  if not found then
    return query select false::boolean, jsonb_build_array('not_found')::jsonb;
    return;
  end if;
  if v_row.row_version <> p_expected_version then
    return query select false::boolean, jsonb_build_array('conflict')::jsonb;
    return;
  end if;

  select * into v_rights from public.product_rights where product_id = p_product_id;
  if v_row.rights_status not in ('original','licensed') then
    v_errors := v_errors || '"rights_not_cleared"'::jsonb;
  end if;
  if v_rights.reviewer_uid is null or v_rights.reviewed_at is null then
    v_errors := v_errors || '"rights_not_attested"'::jsonb;
  end if;
  if v_row.rights_status = 'licensed' and (v_rights.evidence_ref is null or v_rights.source_type is null) then
    v_errors := v_errors || '"licensed_evidence_missing"'::jsonb;
  end if;
  if v_rights.license_expires_at is not null and v_rights.license_expires_at < now() then
    v_errors := v_errors || '"license_expired"'::jsonb;
  end if;

  if coalesce(length(v_row.title),0) < 1 then v_errors := v_errors || '"title_missing"'::jsonb; end if;
  if coalesce(length(v_row.short_description),0) < 1 then v_errors := v_errors || '"summary_missing"'::jsonb; end if;
  if v_row.price < 0 then v_errors := v_errors || '"invalid_price"'::jsonb; end if;
  if v_row.price_currency is null or v_row.price_currency !~ '^[A-Z]{3}$' then v_errors := v_errors || '"invalid_currency"'::jsonb; end if;

  select exists (
    select 1 from public.product_media m
    where m.product_id = p_product_id and m.kind = 'cover_image' and m.validation_state in ('ready','active')
  ) into v_has_cover;
  if not v_has_cover then v_errors := v_errors || '"cover_missing"'::jsonb; end if;

  select exists (
    select 1 from public.product_deliverables d
    where d.product_id = p_product_id and d.active = true and d.validation_state in ('ready','active')
  ) into v_has_zip;
  if not v_has_zip then v_errors := v_errors || '"private_zip_missing"'::jsonb; end if;

  if exists (select 1 from public.upload_intents i where i.product_id = p_product_id and i.state = 'pending') then
    v_errors := v_errors || '"pending_uploads"'::jsonb;
  end if;

  if jsonb_array_length(v_errors) > 0 then
    return query select false::boolean, v_errors;
    return;
  end if;

  update public.products
    set lifecycle = 'published', published_at = now(),
        row_version = row_version + 1, updated_at = now(), updated_by_id = auth.uid()
    where id = p_product_id and row_version = p_expected_version;
  if not found then
    return query select false::boolean, jsonb_build_array('conflict')::jsonb;
    return;
  end if;

  insert into public.audit_events (actor_uid, action, entity_type, entity_id, changed_fields)
    values (auth.uid(), 'product.publish', 'product', p_product_id,
            jsonb_build_object('lifecycle','published','row_version', v_row.row_version + 1));
  return query select true::boolean, '[]'::jsonb;
end;
$$;
revoke all on function public.publish_product(uuid,int) from public, anon, authenticated;
grant execute on function public.publish_product(uuid,int) to authenticated;

-- --- 3. Catalog audit triggers ----------------------------------------------
-- Records WHICH columns changed (names only), plus old/new price because
-- price changes are commercially significant. Never copies text bodies or
-- private rights evidence into the audit log.
create or replace function public.audit_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changed jsonb;
  v_entity uuid;
  v_ignore text[] := array['updated_at','row_version','search_vector','updated_by_id'];
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_changed
      from jsonb_object_keys(v_new) k
      where v_new->k is distinct from v_old->k and not (k = any (v_ignore));
    if jsonb_array_length(v_changed) = 0 then return new; end if;
  else
    v_changed := '[]'::jsonb;
  end if;

  v_entity := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid,
                       (v_new->>'product_id')::uuid, (v_old->>'product_id')::uuid);

  -- Lifecycle changes are already audited by the publish/archive RPCs.
  if tg_table_name = 'products' and tg_op = 'UPDATE' and v_changed <@ '["lifecycle","published_at"]'::jsonb then
    return new;
  end if;

  insert into public.audit_events (actor_uid, action, entity_type, entity_id, changed_fields, context)
    values (auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name, v_entity, v_changed,
      case when tg_table_name = 'products' and v_changed ? 'price'
           then jsonb_build_object('old_price', v_old->'price', 'new_price', v_new->'price', 'currency', v_new->'price_currency')
           when tg_table_name in ('product_deliverables','product_media')
           then jsonb_build_object('product_id', coalesce(v_new->'product_id', v_old->'product_id'))
      end);
  return coalesce(new, old);
end;
$$;
revoke all on function public.audit_catalog_change() from public, anon, authenticated;

drop trigger if exists products_audit on public.products;
create trigger products_audit after insert or update or delete on public.products
  for each row execute function public.audit_catalog_change();
drop trigger if exists deliverables_audit on public.product_deliverables;
create trigger deliverables_audit after insert or update or delete on public.product_deliverables
  for each row execute function public.audit_catalog_change();
drop trigger if exists media_audit on public.product_media;
create trigger media_audit after insert or update or delete on public.product_media
  for each row execute function public.audit_catalog_change();
drop trigger if exists rights_audit on public.product_rights;
create trigger rights_audit after insert or update or delete on public.product_rights
  for each row execute function public.audit_catalog_change();


-- ============================================================================
-- 0013_admin_dashboard
-- ----------------------------------------------------------------------------
-- ============================================================================
-- 0013_admin_dashboard.sql — real sales + operations figures for the admin
-- dashboard, computed in SQL (PostgREST aggregates are disabled on Supabase).
-- SECURITY INVOKER: the caller's RLS applies, so non-admins read zero rows.
-- ============================================================================

-- Per-currency sales (never summed across currencies).
create or replace function public.admin_sales_summary(p_since timestamptz)
returns table (currency text, paid_orders bigint, gross bigint, refunded bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select o.currency,
         count(*)                         as paid_orders,
         coalesce(sum(o.total), 0)        as gross,
         coalesce(sum(o.amount_refunded), 0) as refunded
  from public.orders o
  where o.paid_at is not null
    and (p_since is null or o.paid_at >= p_since)
  group by o.currency
  order by o.currency;
$$;
revoke all on function public.admin_sales_summary(timestamptz) from public, anon;
grant execute on function public.admin_sales_summary(timestamptz) to authenticated;

-- Items that need a human. Each count is a real query over live state.
create or replace function public.admin_attention_counts()
returns table (
  manual_review_checkouts bigint,
  held_orders bigint,
  open_disputes bigint,
  failed_emails bigint,
  stuck_fulfillment bigint,
  dead_webhooks bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.checkout_attempts where state = 'manual_review'),
    (select count(distinct order_id) from public.fulfillment_entitlements where state = 'held'),
    (select count(*) from public.orders where dispute_state = 'open'),
    (select count(*) from public.delivery_messages where state in ('failed','dead','bounced','complained')),
    (select count(*) from public.orders where fulfillment_state = 'started' and paid_at < now() - interval '15 minutes'),
    (select count(*) from public.webhook_inbox where state = 'dead_letter');
$$;
revoke all on function public.admin_attention_counts() from public, anon;
grant execute on function public.admin_attention_counts() to authenticated;

-- Admin list of checkouts needing review (dashboard drill-down).
create index if not exists checkout_attempts_manual_review_idx
  on public.checkout_attempts (updated_at desc) where state = 'manual_review';


-- ============================================================================
-- 0014_advisor_hardening
-- ----------------------------------------------------------------------------
-- ============================================================================
-- 0014_advisor_hardening.sql — Supabase security-advisor findings.
-- ----------------------------------------------------------------------------
-- 1. Pin search_path on trigger functions (defense against search_path
--    hijacking of unqualified references).
-- 2. rls_auto_enable() is Supabase's own event-trigger function; it is fired
--    by DDL, never via RPC, so browser roles need no EXECUTE on it.
-- ============================================================================
alter function public.touch_updated_at() set search_path = public;
alter function public.products_search_vector_tg() set search_path = public;
alter function public.audit_no_update_delete() set search_path = public;
alter function public.no_update_delete_finalized() set search_path = public;
alter function public.no_fulfillment_update_delete() set search_path = public;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;


-- ============================================================================
-- 0015_query_indexes
-- ----------------------------------------------------------------------------
-- ============================================================================
-- 0015_query_indexes.sql — indexes for foreign keys the runtime filters on.
-- Each index has a named caller; unused-FK indexes are deliberately omitted.
-- ============================================================================

-- revoke_fulfillment() updates sessions by order_id on every refund/dispute.
create index if not exists download_sessions_order_idx on public.download_access_sessions (order_id);
-- Checkout loads attempts per cart; ON DELETE CASCADE from guest_carts scans it.
create index if not exists checkout_attempts_cart_idx on public.checkout_attempts (cart_id);
-- Archiving/deleting a product cascades into carts that contain it.
create index if not exists guest_cart_items_product_idx on public.guest_cart_items (product_id);

-- Evaluate auth.uid() once per query instead of once per row.
drop policy if exists "admin_users_self_select" on public.admin_users;
create policy "admin_users_self_select" on public.admin_users
  for select to authenticated
  using (user_id = (select auth.uid()));


-- ============================================================================
-- 0016_revoke_anon_private_catalog
-- ----------------------------------------------------------------------------
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

