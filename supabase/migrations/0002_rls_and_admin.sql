-- ============================================================================
-- 0002_rls_and_admin.sql
-- Row-Level Security, the is_admin() SECURITY DEFINER, and grants.
-- ----------------------------------------------------------------------------
-- Mirrors the access matrix in docs/SECURITY.md. NOT runnable in the SQLite
-- sandbox; apply to the hosted Supabase project.
-- ============================================================================

-- is_admin(): SECURITY DEFINER, fixed empty search_path, least privilege.
-- Admin status comes from auth.uid() against the private admin_users table —
-- NEVER from an email or a browser claim.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;
-- Execute only; no public grant that would leak the function's row behavior.
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- Enable RLS on every exposed table ------------------------------------------
alter table public.admin_users         enable row level security;
alter table public.products           enable row level security;
alter table public.genres             enable row level security;
alter table public.plugins            enable row level security;
alter table public.product_genres     enable row level security;
alter table public.product_plugins    enable row level security;
alter table public.product_media      enable row level security;
alter table public.product_deliverables enable row level security;

-- Revoke broad defaults, grant back only what's needed -----------------------
revoke all on public.admin_users, public.products, public.genres, public.plugins,
            public.product_genres, public.product_plugins, public.product_media,
            public.product_deliverables from public, anon, authenticated;
grant select on public.genres, public.plugins to anon, authenticated;

-- products: anon/authenticated read only published + rights-cleared rows ----
-- and only public columns (private audit columns are NOT selected by policy).
create policy "products_public_select" on public.products
  for select to anon, authenticated
  using (
    lifecycle = 'published'
    and rights_status in ('original','licensed')
  );

create policy "products_admin_all" on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- product_genres / product_plugins / product_media: only for published rows -
create policy "joins_public_select" on public.product_genres
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and p.lifecycle = 'published'
        and p.rights_status in ('original','licensed')
    )
  );
create policy "joins_admin_all" on public.product_genres
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "plugins_join_public_select" on public.product_plugins
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and p.lifecycle = 'published'
        and p.rights_status in ('original','licensed')
    )
  );
create policy "plugins_join_admin_all" on public.product_plugins
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "media_public_select" on public.product_media
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and p.lifecycle = 'published'
        and p.rights_status in ('original','licensed')
    )
  );
create policy "media_admin_all" on public.product_media
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- product_deliverables: NEVER readable by anon/authenticated ----------------
create policy "deliverables_admin_all" on public.product_deliverables
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- No SELECT policy for anon/authenticated ⇒ they read nothing.

-- admin_users: NEVER readable by anon/authenticated -------------------------
create policy "admin_users_admin_all" on public.admin_users
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- No SELECT policy for anon/authenticated ⇒ they read nothing.
