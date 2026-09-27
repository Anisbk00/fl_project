-- ===========================================================================
-- 0018 — Admin permanent delete for never-sold products.
--
-- Deliverables are referenced ON DELETE RESTRICT by order_items,
-- fulfillment_entitlements and checkout_attempt_items, so a sold product can
-- never be deleted. Dead checkout attempts (expired/failed, or past expires_at
-- when Stripe's expiry event never arrived) would still block the delete, so
-- delete_product purges THIS product's items from dead attempts only.
--
-- checkout_attempt_items stay immutable everywhere else: the delete guard only
-- yields when delete_product sets a transaction-local flag.
-- ===========================================================================

create or replace function public.attempt_items_guard_delete()
returns trigger language plpgsql as $$
begin
  if current_setting('app.purge_dead_attempt_items', true) = 'on' then
    return old;
  end if;
  raise exception 'finalized items are immutable';
end;
$$;
revoke all on function public.attempt_items_guard_delete() from public, anon, authenticated;

drop trigger if exists attempt_items_no_delete on public.checkout_attempt_items;
create trigger attempt_items_no_delete before delete on public.checkout_attempt_items
  for each row execute function public.attempt_items_guard_delete();

create or replace function public.delete_product(p_product_id uuid, p_expected_version int)
returns table (ok boolean, errors jsonb)
language plpgsql security definer set search_path = public as $$
declare
  v_product public.products%rowtype;
begin
  if not (public.is_active_admin() and public.aal2()) then
    return query select false, jsonb_build_array('unauthorized'); return;
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return query select false, jsonb_build_array('not_found'); return;
  end if;
  if v_product.row_version <> p_expected_version then
    return query select false, jsonb_build_array('conflict'); return;
  end if;
  if v_product.lifecycle = 'published' then
    return query select false, jsonb_build_array('published'); return;
  end if;
  if exists (select 1 from public.order_items where product_id = p_product_id) then
    return query select false, jsonb_build_array('sold'); return;
  end if;

  -- Any attempt that could still become an order blocks the delete.
  if exists (
    select 1
    from public.checkout_attempt_items i
    join public.checkout_attempts a on a.id = i.attempt_id
    where i.product_id = p_product_id
      and (a.state in ('completed', 'manual_review')
           or (a.state in ('creating', 'open') and a.expires_at > now()))
  ) then
    return query select false, jsonb_build_array('open_checkout'); return;
  end if;

  perform set_config('app.purge_dead_attempt_items', 'on', true);
  delete from public.checkout_attempt_items where product_id = p_product_id;
  perform set_config('app.purge_dead_attempt_items', 'off', true);

  -- Media, deliverables, taxonomy joins, cart items and upload intents cascade;
  -- the products_audit trigger records the delete.
  delete from public.products where id = p_product_id;

  return query select true, '[]'::jsonb;
end;
$$;
revoke all on function public.delete_product(uuid, int) from public, anon, authenticated;
grant execute on function public.delete_product(uuid, int) to authenticated;
