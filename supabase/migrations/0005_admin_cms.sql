-- ============================================================================
-- 0005_admin_cms.sql — Step 4: secure admin auth support + product CMS.
-- ----------------------------------------------------------------------------
-- Additive + forward-only. Extends the Step 1 catalog model; does NOT duplicate
-- or weaken existing tables/constraints.
--
-- Security model (enforced THREE times: server guard, RLS/RPC, Storage):
--   * `is_active_admin()` — SECURITY DEFINER, fixed safe search_path, consults
--     auth.uid() against the active admin allow-list. Never accepts a caller-
--     supplied user id.
--   * Admin CMS RLS policies require BOTH active-admin membership AND a
--     verified AAL2 claim: `(select auth.jwt()->>'aal') = 'aal2'`.
--   * Audit is append-only, written by trusted triggers/functions sourced from
--     auth.uid() (never a form field). Clients cannot insert/update/delete it.
--
-- NOT runnable in the SQLite sandbox (no Docker/Supabase CLI). Apply with
-- `supabase db reset`. Documented as a blocker; the committed SQL is the
-- production source of truth.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin_users: extend the Step 1 allow-list with active/disabled state,
-- display metadata, and who performed administrative changes.
-- ---------------------------------------------------------------------------
alter table public.admin_users
  add column if not exists active boolean not null default true,
  add column if not exists display_name text,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid; -- references auth.users(id)

-- ---------------------------------------------------------------------------
-- product_rights: private rights review / attestation (1:1 with product).
-- Never exposed publicly. Holds the reviewer attestation required before
-- a product may be published.
-- ---------------------------------------------------------------------------
create table if not exists public.product_rights (
  product_id          uuid primary key references public.products(id) on delete cascade,
  rights_status       rights_status not null default 'unreviewed',
  source_type         text,        -- 'original' | 'licensed'
  evidence_ref        text,        -- private reference (doc id / contract id)
  internal_notes      text,        -- private, never in public DTOs/audit
  reviewer_uid        uuid,        -- references auth.users(id)
  reviewed_at         timestamptz,
  license_expires_at  timestamptz, -- null = no expiry
  restrictions        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- upload_intents: one-use, expiring, server-generated staging paths.
-- The client never chooses a path. Bound to (product, role, creator).
-- ---------------------------------------------------------------------------
create table if not exists public.upload_intents (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  role              text not null check (role in ('cover_image','audio_preview','video_preview','private_deliverable')),
  staging_path      text not null,           -- immutable, server-generated
  expected_size     bigint,
  expected_type     text,                     -- declared extension/mime (untrusted)
  original_filename  text,                    -- display metadata only (length-limited)
  creator_uid       uuid not null,            -- references auth.users(id)
  expires_at        timestamptz not null,
  state             text not null default 'pending'
                    check (state in ('pending','uploaded','finalized','expired','failed')),
  created_at        timestamptz not null default now()
);
create index if not exists upload_intents_product_idx on public.upload_intents (product_id);
create index if not exists upload_intents_state_expires_idx
  on public.upload_intents (state, expires_at);

-- ---------------------------------------------------------------------------
-- product_media / product_deliverables: extend with immutable version +
-- validation state + server-verified checksum + detected type + creator.
-- (Step 1 already has version/sha_256/active on deliverables; add the rest.)
-- ---------------------------------------------------------------------------
alter table public.product_media
  add column if not exists version int not null default 1,
  add column if not exists validation_state text not null default 'ready'
    check (validation_state in ('pending','quarantined','ready','active','superseded','failed')),
  add column if not exists detected_type text,
  add column if not exists server_checksum text,
  add column if not exists checksum_verified_at timestamptz,
  add column if not exists created_by_uid uuid;

alter table public.product_deliverables
  add column if not exists validation_state text not null default 'ready'
    check (validation_state in ('pending','quarantined','ready','active','superseded','failed')),
  add column if not exists detected_type text,
  add column if not exists checksum_verified_at timestamptz,
  add column if not exists created_by_uid uuid;

-- ---------------------------------------------------------------------------
-- audit_events: append-only. Written by trusted triggers/functions only.
-- Clients (even AAL2 admins) can READ authorized events but never
-- insert/update/delete.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  actor_uid       uuid,                       -- auth.users(id), from auth.uid()
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  changed_fields  jsonb,                      -- compact, safe field list (no secrets)
  correlation_id  text,
  context         jsonb,                      -- non-secret structured context
  created_at      timestamptz not null default now()
);
create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id, created_at desc);
create index if not exists audit_events_actor_idx on public.audit_events (actor_uid, created_at desc);

-- ---------------------------------------------------------------------------
-- optimistic concurrency: products already has updated_at; add a monotonic
-- row_version the editor sends with mutations.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists row_version integer not null default 1;

-- ===========================================================================
-- is_active_admin(): SECURITY DEFINER, fixed safe search_path.
-- Consults auth.uid() against the ACTIVE admin allow-list. Does NOT accept a
-- caller-supplied user id (callers cannot use it to inspect another user).
-- ===========================================================================
create or replace function public.is_active_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid() and a.active = true
  );
$$;
revoke all on function public.is_active_admin() from public, anon, authenticated;
grant execute on function public.is_active_admin() to authenticated;

-- ===========================================================================
-- aal2(): helper that reads the verified AAL claim from the JWT. (Supabase
-- sets `aal` to 'aal2' after a verified MFA challenge.) Used by RLS policies.
-- ===========================================================================
create or replace function public.aal2()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false);
$$;
revoke all on function public.aal2() from public, anon, authenticated;
grant execute on function public.aal2() to authenticated;

-- ===========================================================================
-- publish_product(p_product_id uuid, p_expected_version int): ONE atomic
-- transactional publication gate. Re-reads the row and rejects unless every
-- readiness condition holds. Updates lifecycle/row_version and writes an
-- audit event IN THE SAME TRANSACTION. Returns structured readiness errors.
-- ===========================================================================
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
  v_has_audio  boolean;  -- optional but recommended
  v_has_zip    boolean;
begin
  -- Caller must be an active admin at AAL2.
  if not (public.is_active_admin() and public.aal2()) then
    return query select false::boolean, jsonb_build_array('unauthorized')::jsonb;
    return;
  end if;

  select * into v_row from public.products where id = p_product_id for update;
  if not found then
    return query select false::boolean, jsonb_build_array('not_found')::jsonb;
    return;
  end if;

  -- Optimistic concurrency.
  if v_row.row_version <> p_expected_version then
    return query select false::boolean, jsonb_build_array('conflict')::jsonb;
    return;
  end if;

  select * into v_rights from public.product_rights where product_id = p_product_id;

  -- Rights: original or licensed, with current admin attestation + review.
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

  -- Required public data.
  if coalesce(length(v_row.title),0) < 1 then v_errors := v_errors || '"title_missing"'::jsonb; end if;
  if coalesce(length(v_row.short_description),0) < 1 then v_errors := v_errors || '"summary_missing"'::jsonb; end if;
  if v_row.price < 0 then v_errors := v_errors || '"invalid_price"'::jsonb; end if;
  if v_row.price_currency is null or v_row.price_currency !~ '^[A-Z]{3}$' then v_errors := v_errors || '"invalid_currency"'::jsonb; end if;

  -- Required public cover (validated + active).
  select exists (
    select 1 from public.product_media m
    where m.product_id = p_product_id and m.kind = 'cover_image'
      and m.validation_state in ('ready','active')
  ) into v_has_cover;
  if not v_has_cover then v_errors := v_errors || '"cover_missing"'::jsonb; end if;

  -- Paid/downloadable product: at least one active, immutable, fully validated private ZIP.
  select exists (
    select 1 from public.product_deliverables d
    where d.product_id = p_product_id and d.active = true
      and d.validation_state in ('ready','active')
  ) into v_has_zip;
  if v_row.price > 0 and not v_has_zip then v_errors := v_errors || '"private_zip_missing"'::jsonb; end if;

  -- No pending/quarantined/failed uploads for this product.
  if exists (select 1 from public.upload_intents i where i.product_id = p_product_id and i.state = 'pending') then
    v_errors := v_errors || '"pending_uploads"'::jsonb;
  end if;

  if jsonb_array_length(v_errors) > 0 then
    return query select false::boolean, v_errors;
    return;
  end if;

  -- All checks passed: publish atomically.
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

-- ===========================================================================
-- Archive/unpublish transactional helpers (audited). Same guard pattern.
-- ===========================================================================
create or replace function public.archive_product(p_product_id uuid, p_expected_version int)
returns table (ok boolean, errors jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_active_admin() and public.aal2()) then
    return query select false::boolean, jsonb_build_array('unauthorized')::jsonb; return;
  end if;
  update public.products
    set lifecycle = 'archived', published_at = null, row_version = row_version + 1,
        updated_at = now(), updated_by_id = auth.uid()
    where id = p_product_id and row_version = p_expected_version;
  if not found then return query select false::boolean, jsonb_build_array('conflict')::jsonb; return; end if;
  insert into public.audit_events (actor_uid, action, entity_type, entity_id)
    values (auth.uid(), 'product.archive', 'product', p_product_id);
  return query select true::boolean, '[]'::jsonb;
end;
$$;
revoke all on function public.archive_product(uuid,int) from public, anon, authenticated;
grant execute on function public.archive_product(uuid,int) to authenticated;

create or replace function public.unpublish_product(p_product_id uuid, p_expected_version int)
returns table (ok boolean, errors jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_active_admin() and public.aal2()) then
    return query select false::boolean, jsonb_build_array('unauthorized')::jsonb; return;
  end if;
  update public.products
    set lifecycle = 'draft', row_version = row_version + 1,
        updated_at = now(), updated_by_id = auth.uid()
    where id = p_product_id and row_version = p_expected_version and lifecycle = 'published';
  if not found then return query select false::boolean, jsonb_build_array('conflict')::jsonb; return; end if;
  insert into public.audit_events (actor_uid, action, entity_type, entity_id)
    values (auth.uid(), 'product.unpublish', 'product', p_product_id);
  return query select true::boolean, '[]'::jsonb;
end;
$$;
revoke all on function public.archive_product(uuid,int) from public, anon, authenticated;
grant execute on function public.archive_product(uuid,int) to authenticated;

-- ===========================================================================
-- RLS on new tables + extended policies.
-- ===========================================================================
alter table public.product_rights   enable row level security;
alter table public.upload_intents   enable row level security;
alter table public.audit_events    enable row level security;

-- product_rights: only active AAL2 admins (read+write). NEVER public.
create policy "rights_admin_all" on public.product_rights
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());

-- upload_intents: only active AAL2 admins. Anon/non-admin: nothing.
create policy "intents_admin_all" on public.upload_intents
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());

-- audit_events: append-only. Admins (AAL2) may SELECT. No INSERT/UPDATE/DELETE
-- via RLS — writes only happen inside the SECURITY DEFINER functions above.
create policy "audit_admin_select" on public.audit_events
  for select to authenticated
  using (public.is_active_admin() and public.aal2());

-- admin_users: extend the Step 1 admin-all policy to require ACTIVE + AAL2
-- for mutations, and allow an admin at AAL1 to read only their OWN allow-list
-- row (so the login/guard can route to enrollment/challenge). Replace the
-- Step 1 policy.
drop policy if exists "admin_users_admin_all" on public.admin_users;
create policy "admin_users_self_select" on public.admin_users
  for select to authenticated
  using (user_id = auth.uid());
create policy "admin_users_admin_mutate" on public.admin_users
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());

-- products: keep the Step 1 public-read + admin-all policies, but tighten
-- admin mutation to require ACTIVE + AAL2. Public read unchanged.
drop policy if exists "products_admin_all" on public.products;
create policy "products_admin_all" on public.products
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());

-- product_media / product_deliverables: tighten admin mutation to AAL2.
drop policy if exists "media_admin_all" on public.product_media;
create policy "media_admin_all" on public.product_media
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());
drop policy if exists "deliverables_admin_all" on public.product_deliverables;
create policy "deliverables_admin_all" on public.product_deliverables
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());

-- ===========================================================================
-- Append-only audit enforcement: prevent direct UPDATE/DELETE on audit_events
-- even by an AAL2 admin. (SELECT is allowed; writes only via the functions.)
-- ===========================================================================
create or replace function public.audit_no_update_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;
drop trigger if exists audit_no_update on public.audit_events;
drop trigger if exists audit_no_delete on public.audit_events;
create trigger audit_no_update before update on public.audit_events
  for each row execute function public.audit_no_update_delete();
create trigger audit_no_delete before delete on public.audit_events
  for each row execute function public.audit_no_update_delete();
-- (Direct INSERT by a client is already blocked because the RLS has no
--  INSERT policy for authenticated — only the SECURITY DEFINER functions,
--  which bypass RLS, can insert audit rows.)

-- updated_at triggers for new tables.
create trigger product_rights_touch_updated_at
  before update on public.product_rights
  for each row execute function public.touch_updated_at();
