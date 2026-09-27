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
