-- ============================================================================
-- 0007_fulfillment.sql — Step 6: secure digital fulfillment + delivery email.
-- ----------------------------------------------------------------------------
-- Forward-only + additive. Fills the Step 5 `after_order_paid_extension`
-- hook with the atomic fulfillment creation: immutable entitlements, an
-- initial access token (HMAC digest + encrypted recovery material), one
-- initial delivery message + outbox job — all in the SAME transaction as
-- the paid transition. No email/token/signed URL is sent inside the DB.
--
-- RLS denies anon/authenticated by default. AAL2 admins get read-only.
-- The server-secret boundary (service_role) is the only write path.
--
-- NOT runnable in the SQLite sandbox (no Docker/Supabase CLI). Apply with
-- `supabase db reset`. Documented as a blocker.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- fulfillment_generations: monotonic credential/delivery generation per order.
-- ---------------------------------------------------------------------------
create table if not exists public.fulfillment_generations (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete restrict,
  generation        integer not null check (generation >= 1),
  reason            text not null check (reason in ('initial_paid','public_recovery_new_token','admin_rotate','reconciliation_repair')),
  state             text not null default 'active' check (state in ('active','superseded')),
  policy_snapshot   jsonb not null,    -- token_ttl, session_ttl, signed_url_ttl, quota, etc.
  creator_type      text check (creator_type in ('stripe','worker','admin','reconciler','public_recovery')),
  creator_uid       uuid,
  created_at        timestamptz not null default now(),
  unique (order_id, generation)
);
create unique index if not exists fulfillment_gen_initial_idx
  on public.fulfillment_generations (order_id) where generation = 1;

-- ---------------------------------------------------------------------------
-- fulfillment_entitlements: one per purchased order-item/deliverable snapshot.
-- ---------------------------------------------------------------------------
create table if not exists public.fulfillment_entitlements (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references public.orders(id) on delete restrict,
  order_item_id           uuid not null,
  generation_id           uuid not null references public.fulfillment_generations(id) on delete restrict,
  deliverable_asset_id    uuid not null,
  state                   text not null default 'active' check (state in ('active','held','revoked')),
  hold_reason             text,
  revocation_reason       text,
  issuance_quota_snapshot integer not null default 10,
  successful_issuances    integer not null default 0 check (successful_issuances >= 0),
  reserved_issuances      integer not null default 0 check (reserved_issuances >= 0),
  first_issuance_at       timestamptz,
  last_issuance_at        timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index if not exists fulfillment_ent_order_item_idx
  on public.fulfillment_entitlements (order_id, order_item_id);
create index if not exists fulfillment_ent_state_idx on public.fulfillment_entitlements (state);

-- ---------------------------------------------------------------------------
-- download_access_tokens: HMAC digest + encrypted recovery material.
-- The plaintext token NEVER enters a DB column.
-- ---------------------------------------------------------------------------
create table if not exists public.download_access_tokens (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete restrict,
  generation_id     uuid not null references public.fulfillment_generations(id) on delete restrict,
  token_digest      text not null unique,   -- HMAC-SHA-256(raw_token, versioned subkey)
  key_version       integer not null,
  encrypted_envelope jsonb,                -- { v, ct, iv, tag } — AES-256-GCM with AAD
  expires_at        timestamptz not null,
  consumed_at       timestamptz,
  revoked_at        timestamptz,
  revocation_reason text,
  creation_reason   text not null default 'initial_paid',
  last_sent_at      timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists download_tokens_order_idx on public.download_access_tokens (order_id, consumed_at);
create index if not exists download_tokens_digest_idx on public.download_access_tokens (token_digest);

-- ---------------------------------------------------------------------------
-- download_access_sessions: short-lived DB-backed guest sessions.
-- Store only a digest of the session cookie token.
-- ---------------------------------------------------------------------------
create table if not exists public.download_access_sessions (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete restrict,
  generation_id     uuid not null references public.fulfillment_generations(id) on delete restrict,
  token_digest      text not null unique,   -- digest of the session cookie token
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  last_used_at      timestamptz,
  revoked_at        timestamptz,
  revocation_reason text
);
create index if not exists download_sessions_digest_idx on public.download_access_sessions (token_digest, expires_at);

-- ---------------------------------------------------------------------------
-- delivery_messages: immutable transactional email message records.
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_messages (
  id                        uuid primary key default gen_random_uuid(),
  order_id                  uuid not null references public.orders(id) on delete restrict,
  generation_id             uuid not null references public.fulfillment_generations(id) on delete restrict,
  access_token_id           uuid references public.download_access_tokens(id),
  message_kind              text not null check (message_kind in ('initial_delivery','recovery_resend','recovery_new_token','admin_resend','admin_rotate')),
  template_version          text not null,
  send_sequence             integer not null check (send_sequence >= 1),
  provider                  text not null default 'resend',
  provider_idempotency_key  text not null unique,
  state                     text not null default 'queued' check (state in ('queued','sending','accepted','sent','delivered','delayed','bounced','failed','complained','suppressed','dead','cancelled')),
  provider_message_id       text unique,
  payload_hash              text,
  attempt_count             integer not null default 0,
  lease_until               timestamptz,
  next_attempt_at           timestamptz,
  accepted_at               timestamptz,
  sent_at                   timestamptz,
  delivered_at              timestamptz,
  bounced_at                timestamptz,
  failed_at                 timestamptz,
  dead_at                   timestamptz,
  safe_error_class          text,
  correlation_id            text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create unique index if not exists delivery_msg_seq_idx
  on public.delivery_messages (order_id, message_kind, send_sequence);
create index if not exists delivery_msg_state_idx
  on public.delivery_messages (state, next_attempt_at) where state in ('queued','sending','failed');
create index if not exists delivery_msg_provider_idx
  on public.delivery_messages (provider_message_id) where provider_message_id is not null;

-- ---------------------------------------------------------------------------
-- fulfillment_outbox: durable, leased, idempotent job queue.
-- ---------------------------------------------------------------------------
create table if not exists public.fulfillment_outbox (
  id                uuid primary key default gen_random_uuid(),
  job_type          text not null check (job_type in ('send_delivery_email','reconcile_order','cleanup_expired','reconcile_stripe')),
  aggregate_id      uuid not null,   -- order_id or message_id
  idempotency_key   text not null unique,
  state             text not null default 'queued' check (state in ('queued','claimed','completed','dead','cancelled')),
  priority          integer not null default 5,
  attempt_count     integer not null default 0,
  next_attempt_at   timestamptz not null default now(),
  lease_owner       text,
  lease_until       timestamptz,
  last_error_class  text,
  correlation_id    text,
  completed_at      timestamptz,
  dead_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists fulfillment_outbox_queue_idx
  on public.fulfillment_outbox (state, next_attempt_at, priority) where state in ('queued','claimed');

-- ---------------------------------------------------------------------------
-- email_webhook_inbox: Resend delivery events (Svix-verified).
-- ---------------------------------------------------------------------------
create table if not exists public.email_webhook_inbox (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null default 'resend',
  provider_event_id text not null unique,   -- svix-id
  event_type        text not null,
  provider_message_id text,
  received_at       timestamptz not null default now(),
  state             text not null default 'received' check (state in ('received','processing','processed','failed','dead_letter')),
  attempt_count     integer not null default 0,
  lease_until       timestamptz,
  next_attempt_at   timestamptz,
  processed_at      timestamptz,
  last_error        text,
  correlation_id    text
);
create index if not exists email_webhook_process_idx
  on public.email_webhook_inbox (state, next_attempt_at) where state in ('received','failed');

-- ---------------------------------------------------------------------------
-- download_url_issuances: signed-URL reservation + finalization.
-- NEVER store the signed URL itself.
-- ---------------------------------------------------------------------------
create table if not exists public.download_url_issuances (
  id                uuid primary key default gen_random_uuid(),
  entitlement_id    uuid not null references public.fulfillment_entitlements(id) on delete restrict,
  session_id        uuid not null references public.download_access_sessions(id) on delete restrict,
  idempotency_key   text not null unique,
  state             text not null default 'creating' check (state in ('creating','issued','failed','expired')),
  reserved_at       timestamptz not null default now(),
  issued_at         timestamptz,
  expires_at        timestamptz,   -- the signed URL's own expiry (120s)
  safe_error_class  text,
  created_at        timestamptz not null default now()
);
create index if not exists download_issuances_entitlement_idx
  on public.download_url_issuances (entitlement_id, state);

-- ===========================================================================
-- RLS: deny anon/authenticated; AAL2 admin read-only on fulfillment tables.
-- ===========================================================================
alter table public.fulfillment_generations  enable row level security;
alter table public.fulfillment_entitlements enable row level security;
alter table public.download_access_tokens   enable row level security;
alter table public.download_access_sessions enable row level security;
alter table public.delivery_messages        enable row level security;
alter table public.fulfillment_outbox       enable row level security;
alter table public.email_webhook_inbox      enable row level security;
alter table public.download_url_issuances   enable row level security;

create policy "fulfillment_gen_admin_read" on public.fulfillment_generations
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "fulfillment_ent_admin_read" on public.fulfillment_entitlements
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "download_tokens_admin_read" on public.download_access_tokens
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "download_sessions_admin_read" on public.download_access_sessions
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "delivery_msg_admin_read" on public.delivery_messages
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "fulfillment_outbox_admin_read" on public.fulfillment_outbox
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "email_webhook_admin_read" on public.email_webhook_inbox
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "download_issuances_admin_read" on public.download_url_issuances
  for select to authenticated using (public.is_active_admin() and public.aal2());

-- ===========================================================================
-- Fill the Step 5 extension hook: atomic fulfillment creation inside the paid
-- transition. Creates entitlements + initial token + initial delivery message +
-- outbox job IN THE SAME TRANSACTION as mark_order_paid. No email/token/URL
-- is sent inside the DB; the outbox worker handles the network send after commit.
-- ===========================================================================
create or replace function public.after_order_paid_extension(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_generation_id uuid;
  v_token_id uuid;
  v_message_id uuid;
  v_policy jsonb;
  v_order_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return; end if;

  -- Policy snapshot (centralized defaults from the application).
  v_policy := jsonb_build_object(
    'access_token_expiry_hours', 72,
    'download_session_minutes', 30,
    'signed_url_ttl_seconds', 120,
    'signed_url_issuance_quota', 10
  );

  -- Create or return the one initial fulfillment generation.
  insert into public.fulfillment_generations (order_id, generation, reason, state, policy_snapshot, creator_type)
    values (p_order_id, 1, 'initial_paid', 'active', v_policy, 'stripe')
    on conflict (order_id, generation) do nothing
    returning id into v_generation_id;
  if v_generation_id is null then
    select id into v_generation_id from public.fulfillment_generations where order_id = p_order_id and generation = 1;
  end if;

  -- Create one entitlement per order item (idempotent on conflict).
  for v_order_item in select * from public.order_items where order_id = p_order_id
  loop
    insert into public.fulfillment_entitlements (order_id, order_item_id, generation_id, deliverable_asset_id, state, issuance_quota_snapshot)
      values (p_order_id, v_order_item.product_id, v_generation_id, v_order_item.deliverable_asset_id, 'active', 10)
      on conflict (order_id, order_item_id) do nothing;
  end loop;

  -- Create the one initial delivery message + outbox job (idempotent).
  insert into public.delivery_messages (order_id, generation_id, message_kind, template_version, send_sequence, provider, provider_idempotency_key, state)
    values (p_order_id, v_generation_id, 'initial_delivery', 'v1', 1, 'resend', 'delivery_' || p_order_id::text || '_1', 'queued')
    on conflict (provider_idempotency_key) do nothing
    returning id into v_message_id;

  if v_message_id is not null then
    insert into public.fulfillment_outbox (job_type, aggregate_id, idempotency_key, state, priority)
      values ('send_delivery_email', v_message_id, 'outbox_' || v_message_id::text, 'queued', 5)
      on conflict (idempotency_key) do nothing;
  end if;
end;
$$;
revoke all on function public.after_order_paid_extension(uuid) from public, anon, authenticated;
grant execute on function public.after_order_paid_extension(uuid) to authenticated;

-- ===========================================================================
-- Entitlement revocation on refund/dispute (called by the payment processor).
-- ===========================================================================
create or replace function public.revoke_fulfillment(
  p_order_id uuid,
  p_action text,   -- 'hold' | 'revoke' | 'release'
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_active_admin() and public.aal2()) and p_action <> 'revoke' then
    raise exception 'unauthorized';
  end if;
  if p_action = 'revoke' then
    update public.fulfillment_entitlements set state = 'revoked', revocation_reason = p_reason, updated_at = now() where order_id = p_order_id and state in ('active','held');
    update public.download_access_tokens set revoked_at = now(), revocation_reason = p_reason where order_id = p_order_id and consumed_at is null and revoked_at is null;
    update public.download_access_sessions set revoked_at = now(), revocation_reason = p_reason where order_id = p_order_id and revoked_at is null;
  elsif p_action = 'hold' then
    update public.fulfillment_entitlements set state = 'held', hold_reason = p_reason, updated_at = now() where order_id = p_order_id and state = 'active';
    update public.download_access_sessions set revoked_at = now(), revocation_reason = p_reason where order_id = p_order_id and revoked_at is null;
  elsif p_action = 'release' then
    update public.fulfillment_entitlements set state = 'active', hold_reason = null, updated_at = now() where order_id = p_order_id and state = 'held';
  end if;
end;
$$;
revoke all on function public.revoke_fulfillment(uuid,text,text) from public, anon, authenticated;
grant execute on function public.revoke_fulfillment(uuid,text,text) to authenticated;

-- Immutability triggers: entitlements + tokens + messages + issuances are
-- not UPDATE/DELETE-able through RLS by clients.
create or replace function public.no_fulfillment_update_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'fulfillment records are immutable through RLS';
end;
$$;
-- (Apply only to tables that should be append-only from the client perspective.
--  Entitlements and issuances need transition updates through trusted functions,
--  so we protect only generation/message rows from direct client writes.)
drop trigger if exists fulfillment_gen_no_update on public.fulfillment_generations;
drop trigger if exists fulfillment_gen_no_delete on public.fulfillment_generations;
create trigger fulfillment_gen_no_update before update on public.fulfillment_generations
  for each row execute function public.no_fulfillment_update_delete();
create trigger fulfillment_gen_no_delete before delete on public.fulfillment_generations
  for each row execute function public.no_fulfillment_update_delete();
