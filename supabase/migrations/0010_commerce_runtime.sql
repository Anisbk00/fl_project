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
