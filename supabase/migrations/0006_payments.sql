-- ============================================================================
-- 0006_payments.sql — Step 5: durable guest cart + Stripe checkout + orders.
-- ----------------------------------------------------------------------------
-- Forward-only + additive. Private payment tables: RLS denies anon/
-- authenticated by default; only the server-secret boundary (service_role,
-- which bypasses RLS in narrowly scoped server-only repositories) and AAL2
-- admins (read-only) access them. No browser role can read/write payment data.
--
-- The paid transition is ONE transactional SECURITY DEFINER function
-- `mark_order_paid(...)` that re-reads + matches + upserts the order + immutable
-- items + marks the cart converted + the attempt completed + writes an audit
-- event, and calls a clean atomic extension hook `after_order_paid_extension()`
-- where Step 6 will create download grants + a delivery-outbox job BEFORE commit.
--
-- NOT runnable in the SQLite sandbox (no Docker/Supabase CLI). Apply with
-- `supabase db reset`. Documented as a blocker; the committed SQL is the
-- production source of truth.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- guest_carts: server-owned anonymous cart. Only a token DIGEST is stored.
-- ---------------------------------------------------------------------------
create table if not exists public.guest_carts (
  id                  uuid primary key default gen_random_uuid(),
  token_digest        text not null unique,           -- HMAC-SHA-256(raw token, pepper)
  state               text not null default 'active'
                      check (state in ('active','abandoned','converted')),
  currency            text not null default 'usd',
  version             integer not null default 1,    -- optimistic concurrency
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_activity_at    timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '30 days'),
  converted_order_id  uuid,                           -- references orders(id)
  converted_at        timestamptz
);
create index if not exists guest_carts_token_digest_idx on public.guest_carts (token_digest);
create index if not exists guest_carts_expires_idx on public.guest_carts (expires_at)
  where state = 'active';

-- ---------------------------------------------------------------------------
-- guest_cart_items: a product appears at most once; quantity is always one.
-- ---------------------------------------------------------------------------
create table if not exists public.guest_cart_items (
  cart_id     uuid not null references public.guest_carts(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (cart_id, product_id)
);

-- ---------------------------------------------------------------------------
-- checkout_attempts: immutable server snapshot of one exact cart version +
-- current product/price/currency/asset/license/policy facts. Owns the Stripe
-- idempotency key. Partial unique: at most one creating/open attempt per
-- fingerprint (Session reuse).
-- ---------------------------------------------------------------------------
create table if not exists public.checkout_attempts (
  id                       uuid primary key default gen_random_uuid(),
  cart_id                  uuid not null references public.guest_carts(id) on delete cascade,
  cart_version             integer not null,
  fingerprint              text not null,            -- deterministic trusted fingerprint
  state                    text not null default 'creating'
                           check (state in ('creating','open','completed','expired','failed','manual_review')),
  stripe_idempotency_key   text not null unique,     -- checkout_<attempt_id>
  expected_subtotal        bigint not null check (expected_subtotal >= 0),
  expected_currency        text not null,
  policy_version           text,
  stripe_session_id        text unique,              -- set when Stripe returns a Session
  stripe_payment_intent_id text,
  expires_at               timestamptz not null,
  failure_category         text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index if not exists checkout_attempts_open_fingerprint_idx
  on public.checkout_attempts (fingerprint)
  where state in ('creating','open');
create index if not exists checkout_attempts_session_idx
  on public.checkout_attempts (stripe_session_id) where stripe_session_id is not null;
create index if not exists checkout_attempts_state_idx
  on public.checkout_attempts (state, expires_at);

-- ---------------------------------------------------------------------------
-- checkout_attempt_items: immutable snapshots. NO client-facing private key.
-- ---------------------------------------------------------------------------
create table if not exists public.checkout_attempt_items (
  attempt_id           uuid not null references public.checkout_attempts(id) on delete cascade,
  product_id           uuid not null,
  product_row_version  integer not null,             -- immutable product version reference
  title                text not null,
  slug                 text not null,
  product_type         text not null,
  unit_amount          bigint not null check (unit_amount >= 0),
  currency             text not null,
  quantity             integer not null default 1 check (quantity = 1),
  license_version      text,
  tax_code             text,
  deliverable_asset_id uuid not null,                 -- selected immutable ready deliverable version
  primary key (attempt_id, product_id)
);

-- ---------------------------------------------------------------------------
-- webhook_inbox: durable receipt of each signature-verified Stripe event,
-- unique by Stripe event ID. Private. Retryable. Dead-letter on exhaustion.
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_inbox (
  stripe_event_id    text primary key,
  event_type         text not null,
  related_object_id  text,
  livemode           boolean not null,
  api_version        text,
  received_at        timestamptz not null default now(),
  payload            jsonb,                           -- private; purged after retention
  state               text not null default 'received'
                     check (state in ('received','processing','processed','failed','dead_letter')),
  attempt_count      integer not null default 0,
  lease_until         timestamptz,
  next_attempt_at     timestamptz,
  processed_at        timestamptz,
  last_error          text,                           -- redacted failure code only
  correlation_id      text
);
create index if not exists webhook_inbox_process_idx
  on public.webhook_inbox (state, next_attempt_at) where state in ('received','failed');

-- ---------------------------------------------------------------------------
-- orders: local source of truth after reconciling a verified event with
-- current Stripe state. Separate payment/refund/dispute/fulfillment states.
-- Fulfillment is fixed to not_started / blocked in Step 5.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                         uuid primary key default gen_random_uuid(),
  order_number               text not null unique,    -- non-sequential public number
  checkout_attempt_id        uuid not null unique,
  stripe_session_id          text not null unique,
  stripe_payment_intent_id   text,
  stripe_charge_id           text,
  payment_state              text not null default 'pending'
                             check (payment_state in ('none','pending','paid','failed','refunded','partially_refunded')),
  refund_state               text not null default 'none'
                             check (refund_state in ('none','pending','succeeded','failed')),
  dispute_state              text not null default 'none'
                             check (dispute_state in ('none','open','won','lost','challenged')),
  fulfillment_state          text not null default 'not_started'
                             check (fulfillment_state in ('not_started','blocked_until_step_6','hold','started','completed')),
  currency                   text not null,
  subtotal                   bigint not null check (subtotal >= 0),
  discount                   bigint not null default 0 check (discount >= 0),
  tax                        bigint not null default 0 check (tax >= 0),
  total                      bigint not null check (total >= 0),
  amount_refunded            bigint not null default 0 check (amount_refunded >= 0),
  buyer_email                text,                    -- minimal PII; from Stripe customer_details
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  paid_at                    timestamptz,
  failed_at                  timestamptz,
  manual_review_reason       text
);
create index if not exists orders_payment_state_idx on public.orders (payment_state, created_at desc);
create index if not exists orders_refund_state_idx on public.orders (refund_state);

-- ---------------------------------------------------------------------------
-- order_items: immutable commercial + product/deliverable-version snapshots.
-- Not download grants. Not cascade-deleted with a cart/product.
-- ---------------------------------------------------------------------------
create table if not exists public.order_items (
  order_id             uuid not null references public.orders(id) on delete restrict,
  product_id           uuid not null,
  product_row_version  integer not null,
  deliverable_asset_id uuid not null,                 -- the version the buyer purchased
  title                text not null,
  slug                 text not null,
  product_type         text not null,
  unit_amount          bigint not null check (unit_amount >= 0),
  currency             text not null,
  quantity             integer not null default 1 check (quantity = 1),
  license_version      text,
  primary key (order_id, product_id)
);

-- ---------------------------------------------------------------------------
-- refunds: idempotent requests + authoritative Stripe outcomes per order.
-- ---------------------------------------------------------------------------
create table if not exists public.refunds (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references public.orders(id) on delete restrict,
  internal_request_id      text not null unique,
  stripe_idempotency_key   text not null unique,      -- refund_<request_id>
  amount                   bigint not null check (amount > 0),
  reason                   text,
  requesting_admin_uid     uuid,                       -- auth.users(id)
  stripe_refund_id         text,
  state                    text not null default 'pending'
                           check (state in ('pending','succeeded','failed')),
  stripe_failure_code      text,                      -- safe subset only
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists refunds_order_idx on public.refunds (order_id, state);

-- ===========================================================================
-- RLS: deny anon + authenticated by default. Only AAL2 admins may READ
-- orders/order_items/refunds/checkout_attempts/webhook_inbox (no writes via
-- RLS — writes happen through the service_role server boundary + the
-- SECURITY DEFINER functions below).
-- ===========================================================================
alter table public.guest_carts            enable row level security;
alter table public.guest_cart_items       enable row level security;
alter table public.checkout_attempts     enable row level security;
alter table public.checkout_attempt_items enable row level security;
alter table public.webhook_inbox         enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.refunds               enable row level security;

create policy "orders_admin_read" on public.orders
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
create policy "order_items_admin_read" on public.order_items
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
create policy "refunds_admin_read" on public.refunds
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
create policy "attempts_admin_read" on public.checkout_attempts
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
create policy "attempt_items_admin_read" on public.checkout_attempt_items
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
create policy "webhook_admin_read" on public.webhook_inbox
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
-- No admin read on guest_carts/guest_cart_items (cart tokens are PII-adjacent;
-- admin support reads go through a narrow, audited server function).

-- ===========================================================================
-- Step 6 atomic extension hook. Step 5 ships a no-op; Step 6 overrides it to
-- create download grants + a delivery-outbox job in the SAME transaction as
-- the paid transition, BEFORE commit. No email/token/signed URL here.
-- ===========================================================================
create or replace function public.after_order_paid_extension(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Step 6 will insert download grants + enqueue a durable delivery-email job
  -- here, atomically with the paid transition. Step 5 intentionally does nothing
  -- except preserve the extension point.
  perform 1;
end;
$$;
revoke all on function public.after_order_paid_extension(uuid) from public, anon, authenticated;
grant execute on function public.after_order_paid_extension(uuid) to authenticated;

-- ===========================================================================
-- mark_order_paid(...): ONE atomic transactional paid transition.
-- Re-reads + matches the attempt/session/currency/subtotal/payment-intent/
-- environment/email; upserts exactly one order + immutable items; marks the
-- cart converted + the attempt completed; writes an audit event; calls the
-- Step 6 extension hook. Unsafe mismatches route to manual_review. Returns
-- structured readiness errors. Never sends an email / issues a token / signs
-- a URL.
-- ===========================================================================
create or replace function public.mark_order_paid(
  p_attempt_id            uuid,
  p_stripe_session_id     text,
  p_stripe_payment_intent text,
  p_stripe_charge_id      text,
  p_stripe_livemode       boolean,
  p_expected_environment  text,    -- 'test' | 'live'
  p_expected_currency     text,
  p_expected_subtotal     bigint,
  p_stripe_subtotal       bigint,
  p_stripe_tax            bigint,
  p_stripe_discount       bigint,
  p_stripe_total          bigint,
  p_buyer_email           text,
  p_order_number          text,
  p_items                 jsonb    -- [{product_id, product_row_version, deliverable_asset_id, title, slug, product_type, unit_amount, currency, license_version}]
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
    return query select false::boolean, null::uuid, jsonb_build_array('not_found')::jsonb;
    return;
  end if;

  -- Match the opaque attempt reference + Stripe Session + environment.
  if v_attempt.stripe_session_id is not null and v_attempt.stripe_session_id <> p_stripe_session_id then
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
  -- If already completed, this is an idempotent re-delivery → return the existing order.
  if v_attempt.state = 'completed' then
    select id into v_order_id from public.orders where checkout_attempt_id = p_attempt_id;
    return query select true::boolean, v_order_id, '[]'::jsonb;
    return;
  end if;

  if jsonb_array_length(v_errors) > 0 then
    update public.checkout_attempts set state = 'manual_review', failure_category = 'paid_transition_mismatch',
      updated_at = now() where id = p_attempt_id;
    insert into public.audit_events (actor_uid, action, entity_type, entity_id, changed_fields)
      values (auth.uid(), 'checkout.manual_review', 'checkout_attempt', p_attempt_id, v_errors);
    return query select false::boolean, null::uuid, v_errors;
    return;
  end if;

  -- Atomic upsert of exactly one order under unique attempt + session ids.
  insert into public.orders (order_number, checkout_attempt_id, stripe_session_id,
      stripe_payment_intent_id, stripe_charge_id, payment_state, refund_state, dispute_state,
      fulfillment_state, currency, subtotal, discount, tax, total, amount_refunded, buyer_email, paid_at)
    values (p_order_number, p_attempt_id, p_stripe_session_id, p_stripe_payment_intent,
      p_stripe_charge_id, 'paid', 'none', 'none', 'blocked_until_step_6',
      p_expected_currency, p_expected_subtotal, coalesce(p_stripe_discount,0), p_stripe_tax,
      p_stripe_total, 0, p_buyer_email, now())
    on conflict (checkout_attempt_id) do update set
      payment_state = 'paid', stripe_payment_intent_id = excluded.stripe_payment_intent_id,
      stripe_charge_id = excluded.stripe_charge_id, tax = excluded.tax, total = excluded.total,
      buyer_email = excluded.buyer_email, paid_at = now(), updated_at = now()
    returning id into v_order_id;

  -- Immutable order-item snapshots from the trusted attempt items.
  insert into public.order_items (order_id, product_id, product_row_version, deliverable_asset_id,
      title, slug, product_type, unit_amount, currency, license_version)
    select v_order_id, (e->>'product_id')::uuid, (e->>'product_row_version')::int,
      (e->>'deliverable_asset_id')::uuid, e->>'title', e->>'slug', e->>'product_type',
      (e->>'unit_amount')::bigint, e->>'currency', nullif(e->>'license_version','')
    from jsonb_array_elements(p_items) e
    on conflict (order_id, product_id) do nothing;

  -- Mark the cart converted + the attempt completed.
  update public.guest_carts set state = 'converted', converted_order_id = v_order_id,
    converted_at = now(), updated_at = now()
    where id = v_attempt.cart_id;
  update public.checkout_attempts set state = 'completed', updated_at = now()
    where id = p_attempt_id;

  -- Audit (safe changed-field summary, no PII).
  insert into public.audit_events (actor_uid, action, entity_type, entity_id, changed_fields)
    values (auth.uid(), 'order.paid', 'order', v_order_id,
      jsonb_build_object('payment_state','paid','fulfillment_state','blocked_until_step_6'));

  -- Step 6 atomic extension point (no-op in Step 5).
  perform public.after_order_paid_extension(v_order_id);

  return query select true::boolean, v_order_id, '[]'::jsonb;
end;
$$;
revoke all on function public.mark_order_paid(uuid,text,text,text,boolean,text,text,bigint,bigint,bigint,bigint,bigint,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid,text,text,text,boolean,text,text,bigint,bigint,bigint,bigint,bigint,text,text,jsonb) to authenticated;

-- ===========================================================================
-- Append-only protection for finalized order items + attempt items (no UPDATE/
-- DELETE through RLS; only the service_role boundary can repair via migration).
-- ===========================================================================
create or replace function public.no_update_delete_finalized()
returns trigger language plpgsql as $$
begin
  raise exception 'finalized items are immutable';
end;
$$;
drop trigger if exists order_items_no_update on public.order_items;
drop trigger if exists order_items_no_delete on public.order_items;
create trigger order_items_no_update before update on public.order_items
  for each row execute function public.no_update_delete_finalized();
create trigger order_items_no_delete before delete on public.order_items
  for each row execute function public.no_update_delete_finalized();
drop trigger if exists attempt_items_no_update on public.checkout_attempt_items;
drop trigger if exists attempt_items_no_delete on public.checkout_attempt_items;
create trigger attempt_items_no_update before update on public.checkout_attempt_items
  for each row execute function public.no_update_delete_finalized();
create trigger attempt_items_no_delete before delete on public.checkout_attempt_items
  for each row execute function public.no_update_delete_finalized();
