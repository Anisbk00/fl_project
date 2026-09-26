-- ============================================================================
-- 0001_catalog_schema.sql
-- Music Project Store — catalog schema (production Supabase/Postgres).
-- ----------------------------------------------------------------------------
-- This is the production source of truth that mirrors the Prisma schema used
-- in development. SQLite/Prisma cannot express Postgres enums, CHECK
-- constraints, or RLS, so those live HERE for the hosted project.
-- It is NOT runnable in the SQLite sandbox (documented blocker). Apply with:
--   supabase db push      (or `supabase migration up`)
-- ============================================================================

-- Enums -----------------------------------------------------------------------
-- Postgres has no `CREATE TYPE IF NOT EXISTS`, so wrap each in a DO block
-- to make the whole file safely re-runnable (idempotent). Re-running this
-- file on a database that already has these types will skip them.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'product_type') then
    create type product_type as enum ('project_file', 'remake', 'stems', 'sample_pack');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'product_lifecycle') then
    create type product_lifecycle as enum ('draft', 'published', 'archived');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'rights_status') then
    create type rights_status as enum ('unreviewed', 'original', 'licensed', 'rejected');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'media_kind') then
    create type media_kind as enum ('cover_image', 'audio_preview', 'video_preview');
  end if;
end $$;

-- Admin allow-list (private) --------------------------------------------------
-- Keyed by auth.users.id. Never exposed publicly; read only by the
-- is_admin() SECURITY DEFINER function (see 0002).
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Taxonomy --------------------------------------------------------------------
create table if not exists public.genres (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.plugins (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  vendor     text,
  created_at timestamptz not null default now()
);

-- Products --------------------------------------------------------------------
create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^(?!-)[a-z0-9]+(-[a-z0-9]+)*(?<!-)$'),
  title              text not null check (length(title) between 1 and 200),
  short_description  text not null check (length(short_description) between 1 and 300),
  long_description  text check (long_description is null or length(long_description) <= 20000),
  product_type       product_type not null,
  lifecycle          product_lifecycle not null default 'draft',
  rights_status      rights_status not null default 'unreviewed',
  price              integer not null check (price >= 0),               -- minor currency units
  price_currency     text not null default 'USD' check (price_currency ~ '^[A-Z]{3}$'),
  compare_at_price   integer check (compare_at_price is null or compare_at_price >= price),
  daw_name           text,
  daw_version        text,
  bpm                integer check (bpm is null or bpm between 1 and 400),
  musical_key        text,
  duration_seconds   integer check (duration_seconds is null or duration_seconds >= 1),
  total_size_bytes   bigint check (total_size_bytes is null or total_size_bytes >= 0),
  included_formats   text,
  featured           boolean not null default false,
  seo_title          text,
  seo_description    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  published_at       timestamptz,
  created_by_id      uuid,  -- references auth.users(id); admin audit, never public
  updated_by_id      uuid,  -- references auth.users(id); admin audit, never public
  -- Publication guardrail: a published product MUST be rights-cleared, have a
  -- valid published_at, and carry the required public metadata.
  constraint products_publication_check check (
    lifecycle <> 'published' or (
      rights_status in ('original','licensed')
      and published_at is not null
      and price >= 0
      and price_currency is not null
      and length(title) >= 1
      and length(short_description) >= 1
    )
  )
);
create index if not exists products_published_listing_idx
  on public.products (lifecycle, rights_status, published_at desc);
create index if not exists products_featured_idx
  on public.products (featured, lifecycle);

-- Joins -----------------------------------------------------------------------
create table if not exists public.product_genres (
  product_id uuid not null references public.products(id) on delete cascade,
  genre_id   uuid not null references public.genres(id) on delete cascade,
  primary key (product_id, genre_id)
);
create index if not exists product_genres_genre_idx on public.product_genres (genre_id);

create table if not exists public.product_plugins (
  product_id  uuid not null references public.products(id) on delete cascade,
  plugin_id   uuid not null references public.plugins(id) on delete cascade,
  min_version text,
  required    boolean not null default true,
  primary key (product_id, plugin_id)
);
create index if not exists product_plugins_plugin_idx on public.product_plugins (plugin_id);

-- PUBLIC preview media (product-public bucket) --------------------------------
create table if not exists public.product_media (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  kind              media_kind not null,
  bucket            text not null default 'product-public',
  storage_object_path text check (storage_object_path is null or length(storage_object_path) <= 1024),
  external_url      text,
  mime_type         text,
  bytes             bigint,
  alt_text          text,
  created_at        timestamptz not null default now()
);
create index if not exists product_media_product_kind_idx on public.product_media (product_id, kind);

-- PRIVATE paid deliverables (product-private bucket) --------------------------
-- NEVER returned by any public read path.
create table if not exists public.product_deliverables (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  bucket            text not null default 'product-private',
  storage_object_path text not null check (length(storage_object_path) <= 1024),
  customer_filename text not null check (length(customer_filename) between 1 and 255),
  mime_type         text not null,
  bytes             bigint not null check (bytes >= 0),
  version           integer not null default 1 check (version >= 1),
  sha_256           text check (sha_256 is null or sha_256 ~ '^[a-fA-F0-9]{64}$'),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists product_deliverables_product_active_idx
  on public.product_deliverables (product_id, active);

-- updated_at trigger ----------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();
drop trigger if exists product_deliverables_touch_updated_at on public.product_deliverables;
create trigger product_deliverables_touch_updated_at
  before update on public.product_deliverables
  for each row execute function public.touch_updated_at();
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
drop policy if exists "products_public_select" on public.products;
create policy "products_public_select" on public.products
  for select to anon, authenticated
  using (
    lifecycle = 'published'
    and rights_status in ('original','licensed')
  );

drop policy if exists "products_admin_all" on public.products;
create policy "products_admin_all" on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- product_genres / product_plugins / product_media: only for published rows -
drop policy if exists "joins_public_select" on public.product_genres;
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
drop policy if exists "joins_admin_all" on public.product_genres;
create policy "joins_admin_all" on public.product_genres
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "plugins_join_public_select" on public.product_plugins;
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
drop policy if exists "plugins_join_admin_all" on public.product_plugins;
create policy "plugins_join_admin_all" on public.product_plugins
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "media_public_select" on public.product_media;
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
drop policy if exists "media_admin_all" on public.product_media;
create policy "media_admin_all" on public.product_media
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- product_deliverables: NEVER readable by anon/authenticated ----------------
drop policy if exists "deliverables_admin_all" on public.product_deliverables;
create policy "deliverables_admin_all" on public.product_deliverables
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- No SELECT policy for anon/authenticated ⇒ they read nothing.

-- admin_users: NEVER readable by anon/authenticated -------------------------
drop policy if exists "admin_users_admin_all" on public.admin_users;
create policy "admin_users_admin_all" on public.admin_users
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- No SELECT policy for anon/authenticated ⇒ they read nothing.
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
-- ============================================================================
-- 0004_catalog_search.sql
-- Step 3 — live catalog search, filters, deterministic sort, pagination.
-- ----------------------------------------------------------------------------
-- Additive + reversible. Adapts to the Step 1 schema (does NOT rename/rebuild).
--
-- Security model:
--   * `search_products`, `get_product_by_slug`, `get_related_products`,
--     `count_free_products`, `list_free_products` are SECURITY INVOKER with a
--     fixed `search_path = public`. They run as the caller, so anonymous
--     callers are still subject to RLS (anon sees only published +
--     rights-cleared rows; product_deliverables/admin_users stay unreadable).
--     The functions ALSO filter on lifecycle/rights in WHERE as defense in
--     depth, and select ONLY public columns — never deliverable paths, admin
--     audit columns, or admin identities.
--   * Text search uses parameterized `websearch_to_tsquery` (never string
--     interpolation). Sort keys are an allow-list mapped to known ORDER BY
--     expressions — a URL value never becomes an identifier/clause.
--   * Every sort has deterministic tie-breakers so pagination cannot shuffle.
--
-- NOT runnable in the SQLite sandbox (no Docker/Supabase CLI). Apply with
-- `supabase db reset`. Documented as a blocker; the committed SQL is the source
-- of truth for the hosted project.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Generated search vector (title A, short_description B, long_description C).
-- Long_description may be NULL; coalesce to '' so weights stay valid.
-- Only public text is indexed — no admin notes, no private paths.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists search_vector tsvector;

create or replace function public.products_search_vector_tg()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.short_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.long_description, '')), 'C');
  return new;
end;
$$;

drop trigger if exists products_search_vector_trigger on public.products;
create trigger products_search_vector_trigger
  before insert or update of title, short_description, long_description
  on public.products
  for each row execute function public.products_search_vector_tg();

-- Backfill existing rows.
update public.products set search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(short_description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(long_description, '')), 'C')
where true;

create index if not exists products_search_vector_idx
  on public.products using gin (search_vector);

-- ---------------------------------------------------------------------------
-- Indexes for the real published-catalog query shapes (partial, matching the
-- public predicate). Not over-indexed; each matches a real filter/sort.
-- ---------------------------------------------------------------------------
create index if not exists products_published_newest_idx
  on public.products (published_at desc, updated_at desc, slug)
  where lifecycle = 'published' and rights_status in ('original','licensed');
create index if not exists products_published_title_idx
  on public.products (title, slug)
  where lifecycle = 'published' and rights_status in ('original','licensed');
create index if not exists products_published_type_idx
  on public.products (product_type)
  where lifecycle = 'published' and rights_status in ('original','licensed');
create index if not exists products_published_price_idx
  on public.products (price_currency, price)
  where lifecycle = 'published' and rights_status in ('original','licensed');
create index if not exists products_published_bpm_idx
  on public.products (bpm)
  where lifecycle = 'published' and rights_status in ('original','licensed');
create index if not exists products_published_daw_idx
  on public.products (daw_name)
  where lifecycle = 'published' and rights_status in ('original','licensed');
create index if not exists products_published_featured_idx
  on public.products (featured, published_at desc)
  where lifecycle = 'published' and rights_status in ('original','licensed');

-- ---------------------------------------------------------------------------
-- search_products(...) — paginated, filtered, ranked public catalog search.
-- Returns ONLY public columns + aggregated public taxonomy/media + total_count.
-- SECURITY INVOKER; fixed search_path; parameterized; allow-listed sort.
-- ---------------------------------------------------------------------------
create or replace function public.search_products(
  p_q             text    default '',
  p_types         text[]  default '{}',
  p_genres        text[]  default '{}',
  p_daw           text    default '',
  p_plugins       text[]  default '{}',
  p_plugin_free   boolean default false,
  p_bpm_min       integer default null,
  p_bpm_max       integer default null,
  p_musical_key   text    default '',
  p_price_min     integer default null,
  p_price_max     integer default null,
  p_price_currency text   default '',
  p_sort          text    default 'newest',
  p_page          integer default 1,
  p_page_size     integer default 24
) returns table (
  id uuid, slug text, title text, short_description text, long_description text,
  product_type product_type, lifecycle product_lifecycle, rights_status rights_status,
  price integer, price_currency text, compare_at_price integer,
  daw_name text, daw_version text, bpm integer, musical_key text,
  duration_seconds integer, total_size_bytes bigint, included_formats text, featured boolean,
  seo_title text, seo_description text, created_at timestamptz, updated_at timestamptz, published_at timestamptz,
  genres jsonb, plugins jsonb, cover_path text, audio_preview_path text,
  total_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_offset integer := greatest((greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 48), 0);
  v_q tsquery := websearch_to_tsquery('english', p_q);
begin
  return query
  select
    p.id, p.slug, p.title, p.short_description, p.long_description,
    p.product_type, p.lifecycle, p.rights_status, p.price, p.price_currency, p.compare_at_price,
    p.daw_name, p.daw_version, p.bpm, p.musical_key,
    p.duration_seconds, p.total_size_bytes, p.included_formats, p.featured,
    p.seo_title, p.seo_description, p.created_at, p.updated_at, p.published_at,
    coalesce(g.genres, '[]'::jsonb),
    coalesce(pl.plugins, '[]'::jsonb),
    m_cover.storage_object_path,
    m_audio.storage_object_path,
    count(*) over ()::bigint as total_count
  from public.products p
  left join lateral (
    select jsonb_agg(jsonb_build_object('slug', g.slug, 'name', g.name) order by g.name) as genres
    from public.product_genres pg
    join public.genres g on g.id = pg.genre_id
    where pg.product_id = p.id
  ) g on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'slug', pl.slug, 'name', pl.name, 'vendor', pl.vendor,
      'min_version', pp.min_version, 'required', pp.required
    ) order by pl.name) as plugins
    from public.product_plugins pp
    join public.plugins pl on pl.id = pp.plugin_id
    where pp.product_id = p.id
  ) pl on true
  left join lateral (
    select m.storage_object_path
    from public.product_media m
    where m.product_id = p.id and m.kind = 'cover_image'
    order by m.created_at
    limit 1
  ) m_cover on true
  left join lateral (
    select m.storage_object_path
    from public.product_media m
    where m.product_id = p.id and m.kind = 'audio_preview'
    order by m.created_at
    limit 1
  ) m_audio on true
  where p.lifecycle = 'published'
    and p.rights_status in ('original','licensed')
    and (p_types = '{}' or p.product_type::text = any(p_types))
    and (
      p_genres = '{}' or exists (
        select 1 from public.product_genres pg
        join public.genres g on g.id = pg.genre_id
        where pg.product_id = p.id and g.slug = any(p_genres)
      )
    )
    and (p_daw = '' or p.daw_name = p_daw)
    and (
      p_plugins = '{}' or exists (
        select 1 from public.product_plugins pp
        join public.plugins pl on pl.id = pp.plugin_id
        where pp.product_id = p.id and pl.slug = any(p_plugins)
      )
    )
    and (
      not p_plugin_free or not exists (
        select 1 from public.product_plugins pp
        where pp.product_id = p.id and pp.required = true
      )
    )
    and (p_bpm_min is null or p.bpm is not null and p.bpm >= p_bpm_min)
    and (p_bpm_max is null or p.bpm is not null and p.bpm <= p_bpm_max)
    and (p_musical_key = '' or p.musical_key = p_musical_key)
    and (
      p_price_min is null or (
        p_price_currency <> '' and p.price_currency = p_price_currency and p.price >= p_price_min
      )
    )
    and (
      p_price_max is null or (
        p_price_currency <> '' and p.price_currency = p_price_currency and p.price <= p_price_max
      )
    )
    and (p_q = '' or p.search_vector @@ v_q)
  order by
    case when p_sort = 'relevance' and p_q <> ''
         then ts_rank(p.search_vector, v_q) else 0 end desc,
    case when p_sort = 'price_asc'  then p.price end asc nulls last,
    case when p_sort = 'price_desc' then p.price end desc nulls last,
    case when p_sort = 'title'     then p.title end asc nulls last,
    p.published_at desc nulls last,
    p.updated_at desc nulls last,
    p.slug
  limit least(greatest(p_page_size, 1), 48)
  offset v_offset;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_product_by_slug(text) — single public product for the detail page.
-- Returns full public columns + aggregated taxonomy + ALL public media rows.
-- Returns no row for draft/archived/unreviewed/rejected (RLS + WHERE).
-- SECURITY INVOKER.
-- ---------------------------------------------------------------------------
create or replace function public.get_product_by_slug(p_slug text)
returns table (
  id uuid, slug text, title text, short_description text, long_description text,
  product_type product_type, lifecycle product_lifecycle, rights_status rights_status,
  price integer, price_currency text, compare_at_price integer,
  daw_name text, daw_version text, bpm integer, musical_key text,
  duration_seconds integer, total_size_bytes bigint, included_formats text, featured boolean,
  seo_title text, seo_description text, created_at timestamptz, updated_at timestamptz, published_at timestamptz,
  genres jsonb, plugins jsonb, media jsonb
)
language sql
security invoker
set search_path = public
as $$
  select
    p.id, p.slug, p.title, p.short_description, p.long_description,
    p.product_type, p.lifecycle, p.rights_status, p.price, p.price_currency, p.compare_at_price,
    p.daw_name, p.daw_version, p.bpm, p.musical_key,
    p.duration_seconds, p.total_size_bytes, p.included_formats, p.featured,
    p.seo_title, p.seo_description, p.created_at, p.updated_at, p.published_at,
    coalesce((select jsonb_agg(jsonb_build_object('slug', g.slug, 'name', g.name) order by g.name)
              from public.product_genres pg join public.genres g on g.id = pg.genre_id
              where pg.product_id = p.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'slug', pl.slug, 'name', pl.name, 'vendor', pl.vendor,
                'min_version', pp.min_version, 'required', pp.required
              ) order by pl.name)
              from public.product_plugins pp join public.plugins pl on pl.id = pp.plugin_id
              where pp.product_id = p.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'id', m.id, 'kind', m.kind::text, 'bucket', m.bucket,
                'storage_object_path', m.storage_object_path, 'external_url', m.external_url,
                'mime_type', m.mime_type, 'bytes', m.bytes, 'alt_text', m.alt_text,
                'created_at', m.created_at
              ) order by m.created_at)
              from public.product_media m
              where m.product_id = p.id), '[]'::jsonb)
  from public.products p
  where p.slug = p_slug
    and p.lifecycle = 'published'
    and p.rights_status in ('original','licensed');
$$;

-- ---------------------------------------------------------------------------
-- get_related_products(p_slug text, p_limit int) — deterministic related rule:
-- same product_type first, then shared genres; excludes the current product
-- and all non-public rows. Returns only card columns.
-- ---------------------------------------------------------------------------
create or replace function public.get_related_products(p_slug text, p_limit integer default 4)
returns table (
  id uuid, slug text, title text, short_description text, product_type product_type,
  price integer, price_currency text, compare_at_price integer,
  daw_name text, daw_version text, bpm integer, musical_key text,
  duration_seconds integer, total_size_bytes bigint, included_formats text, featured boolean,
  published_at timestamptz, genres jsonb, plugins jsonb, cover_path text, audio_preview_path text
)
language sql
security invoker
set search_path = public
as $$
  select distinct on (p.id)
    p.id, p.slug, p.title, p.short_description, p.product_type,
    p.price, p.price_currency, p.compare_at_price,
    p.daw_name, p.daw_version, p.bpm, p.musical_key,
    p.duration_seconds, p.total_size_bytes, p.included_formats, p.featured,
    p.published_at,
    coalesce((select jsonb_agg(jsonb_build_object('slug', g.slug, 'name', g.name) order by g.name)
              from public.product_genres pg join public.genres g on g.id = pg.genre_id
              where pg.product_id = p.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'slug', pl.slug, 'name', pl.name, 'vendor', pl.vendor,
                'min_version', pp.min_version, 'required', pp.required
              ) order by pl.name)
              from public.product_plugins pp join public.plugins pl on pl.id = pp.plugin_id
              where pp.product_id = p.id), '[]'::jsonb),
    (select m.storage_object_path from public.product_media m
       where m.product_id = p.id and m.kind = 'cover_image' order by m.created_at limit 1),
    (select m.storage_object_path from public.product_media m
       where m.product_id = p.id and m.kind = 'audio_preview' order by m.created_at limit 1)
  from public.products p
  left join public.product_genres pgx on pgx.product_id = p.id
  where p.slug <> p_slug
    and p.lifecycle = 'published'
    and p.rights_status in ('original','licensed')
    and (
      p.product_type = (select p2.product_type from public.products p2 where p2.slug = p_slug)
      or exists (
        select 1 from public.product_genres pg2
        where pg2.product_id = p.id
          and pg2.genre_id in (
            select pg3.genre_id from public.product_genres pg3
            join public.products p3 on p3.id = pg3.product_id
            where p3.slug = p_slug and p3.lifecycle='published' and p3.rights_status in ('original','licensed')
          )
      )
    )
  order by p.id, p.published_at desc
  limit least(greatest(p_limit, 1), 12);
$$;

-- ---------------------------------------------------------------------------
-- list_free_products() — published + rights-cleared products with price = 0.
-- ---------------------------------------------------------------------------
create or replace function public.list_free_products()
returns table (
  id uuid, slug text, title text, short_description text, product_type product_type,
  price integer, price_currency text, compare_at_price integer,
  daw_name text, daw_version text, bpm integer, musical_key text,
  duration_seconds integer, total_size_bytes bigint, included_formats text, featured boolean,
  published_at timestamptz, genres jsonb, plugins jsonb, cover_path text, audio_preview_path text
)
language sql
security invoker
set search_path = public
as $$
  select
    p.id, p.slug, p.title, p.short_description, p.product_type,
    p.price, p.price_currency, p.compare_at_price,
    p.daw_name, p.daw_version, p.bpm, p.musical_key,
    p.duration_seconds, p.total_size_bytes, p.included_formats, p.featured,
    p.published_at,
    coalesce((select jsonb_agg(jsonb_build_object('slug', g.slug, 'name', g.name) order by g.name)
              from public.product_genres pg join public.genres g on g.id = pg.genre_id
              where pg.product_id = p.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'slug', pl.slug, 'name', pl.name, 'vendor', pl.vendor,
                'min_version', pp.min_version, 'required', pp.required
              ) order by pl.name)
              from public.product_plugins pp join public.plugins pl on pl.id = pp.plugin_id
              where pp.product_id = p.id), '[]'::jsonb),
    (select m.storage_object_path from public.product_media m
       where m.product_id = p.id and m.kind = 'cover_image' order by m.created_at limit 1),
    (select m.storage_object_path from public.product_media m
       where m.product_id = p.id and m.kind = 'audio_preview' order by m.created_at limit 1)
  from public.products p
  where p.lifecycle = 'published'
    and p.rights_status in ('original','licensed')
    and p.price = 0
  order by p.featured desc, p.published_at desc, p.slug;
$$;

revoke all on function public.search_products(text,text[],text[],text,text[],boolean,integer,integer,text,integer,integer,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.get_product_by_slug(text) from public, anon, authenticated;
revoke all on function public.get_related_products(text,integer) from public, anon, authenticated;
revoke all on function public.list_free_products() from public, anon, authenticated;
grant execute on function public.search_products(text,text[],text[],text,text[],boolean,integer,integer,text,integer,integer,text,text,integer,integer) to anon, authenticated;
grant execute on function public.get_product_by_slug(text) to anon, authenticated;
grant execute on function public.get_related_products(text,integer) to anon, authenticated;
grant execute on function public.list_free_products() to anon, authenticated;
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
drop policy if exists "rights_admin_all" on public.product_rights;
create policy "rights_admin_all" on public.product_rights
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());

-- upload_intents: only active AAL2 admins. Anon/non-admin: nothing.
drop policy if exists "intents_admin_all" on public.upload_intents;
create policy "intents_admin_all" on public.upload_intents
  for all to authenticated
  using (public.is_active_admin() and public.aal2())
  with check (public.is_active_admin() and public.aal2());

-- audit_events: append-only. Admins (AAL2) may SELECT. No INSERT/UPDATE/DELETE
-- via RLS — writes only happen inside the SECURITY DEFINER functions above.
drop policy if exists "audit_admin_select" on public.audit_events;
create policy "audit_admin_select" on public.audit_events
  for select to authenticated
  using (public.is_active_admin() and public.aal2());

-- admin_users: extend the Step 1 admin-all policy to require ACTIVE + AAL2
-- for mutations, and allow an admin at AAL1 to read only their OWN allow-list
-- row (so the login/guard can route to enrollment/challenge). Replace the
-- Step 1 policy.
drop policy if exists "admin_users_admin_all" on public.admin_users;
drop policy if exists "admin_users_self_select" on public.admin_users;
create policy "admin_users_self_select" on public.admin_users
  for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "admin_users_admin_mutate" on public.admin_users;
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
create trigger audit_no_update before update on public.audit_events
  for each row execute function public.audit_no_update_delete();
drop trigger if exists audit_no_delete on public.audit_events;
create trigger audit_no_delete before delete on public.audit_events
  for each row execute function public.audit_no_update_delete();
-- (Direct INSERT by a client is already blocked because the RLS has no
--  INSERT policy for authenticated — only the SECURITY DEFINER functions,
--  which bypass RLS, can insert audit rows.)

-- updated_at triggers for new tables.
drop trigger if exists product_rights_touch_updated_at on public.product_rights;
create trigger product_rights_touch_updated_at
  before update on public.product_rights
  for each row execute function public.touch_updated_at();
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

drop policy if exists "orders_admin_read" on public.orders;
create policy "orders_admin_read" on public.orders
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
drop policy if exists "order_items_admin_read" on public.order_items;
create policy "order_items_admin_read" on public.order_items
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
drop policy if exists "refunds_admin_read" on public.refunds;
create policy "refunds_admin_read" on public.refunds
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
drop policy if exists "attempts_admin_read" on public.checkout_attempts;
create policy "attempts_admin_read" on public.checkout_attempts
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
drop policy if exists "attempt_items_admin_read" on public.checkout_attempt_items;
create policy "attempt_items_admin_read" on public.checkout_attempt_items
  for select to authenticated
  using (public.is_active_admin() and public.aal2());
drop policy if exists "webhook_admin_read" on public.webhook_inbox;
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
create trigger order_items_no_update before update on public.order_items
  for each row execute function public.no_update_delete_finalized();
drop trigger if exists order_items_no_delete on public.order_items;
create trigger order_items_no_delete before delete on public.order_items
  for each row execute function public.no_update_delete_finalized();
drop trigger if exists attempt_items_no_update on public.checkout_attempt_items;
create trigger attempt_items_no_update before update on public.checkout_attempt_items
  for each row execute function public.no_update_delete_finalized();
drop trigger if exists attempt_items_no_delete on public.checkout_attempt_items;
create trigger attempt_items_no_delete before delete on public.checkout_attempt_items
  for each row execute function public.no_update_delete_finalized();
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

drop policy if exists "fulfillment_gen_admin_read" on public.fulfillment_generations;
create policy "fulfillment_gen_admin_read" on public.fulfillment_generations
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "fulfillment_ent_admin_read" on public.fulfillment_entitlements;
create policy "fulfillment_ent_admin_read" on public.fulfillment_entitlements
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "download_tokens_admin_read" on public.download_access_tokens;
create policy "download_tokens_admin_read" on public.download_access_tokens
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "download_sessions_admin_read" on public.download_access_sessions;
create policy "download_sessions_admin_read" on public.download_access_sessions
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "delivery_msg_admin_read" on public.delivery_messages;
create policy "delivery_msg_admin_read" on public.delivery_messages
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "fulfillment_outbox_admin_read" on public.fulfillment_outbox;
create policy "fulfillment_outbox_admin_read" on public.fulfillment_outbox
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "email_webhook_admin_read" on public.email_webhook_inbox;
create policy "email_webhook_admin_read" on public.email_webhook_inbox
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "download_issuances_admin_read" on public.download_url_issuances;
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
create trigger fulfillment_gen_no_update before update on public.fulfillment_generations
  for each row execute function public.no_fulfillment_update_delete();
drop trigger if exists fulfillment_gen_no_delete on public.fulfillment_generations;
create trigger fulfillment_gen_no_delete before delete on public.fulfillment_generations
  for each row execute function public.no_fulfillment_update_delete();
-- ============================================================================
-- 0008_trust_and_growth.sql — Step 7: legal revisions, reviews, free
-- acquisitions, marketing consent, bundles, price history, promotions,
-- recommendation pins. RLS denies anon/authenticated; AAL2 admin read-only.
-- Forward-only. NOT runnable in the SQLite sandbox.
-- ============================================================================

-- legal_revisions: immutable published revisions per (document_key, locale, market).
create table if not exists public.legal_revisions (
  id              uuid primary key default gen_random_uuid(),
  document_key    text not null,
  locale          text not null default 'en',
  market          text not null default 'global',
  semantic_version text not null,
  markdown_source text not null,
  content_hash    text not null,
  status          text not null default 'draft' check (status in ('draft','in_review','published','superseded')),
  effective_from  timestamptz,
  published_by    uuid,
  review_metadata jsonb,
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  superseded_at   timestamptz
);
create index if not exists legal_rev_key_locale_market_idx
  on public.legal_revisions (document_key, locale, market, status);

-- reviews: verified-purchase, one per order item.
create table if not exists public.reviews (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete restrict,
  order_item_id   text not null,
  product_id      uuid not null,
  rating          integer not null check (rating between 1 and 5),
  body            text not null check (length(body) between 1 and 2000),
  display_name    text check (display_name is null or length(display_name) <= 100),
  state           text not null default 'pending' check (state in ('pending','published','rejected','withdrawn_by_author','hidden_for_safety','ineligible')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (order_id, order_item_id)
);
create index if not exists reviews_product_state_idx on public.reviews (product_id, state);

-- review_moderation_events: append-only.
create table if not exists public.review_moderation_events (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid not null references public.reviews(id) on delete restrict,
  action          text not null check (action in ('publish','reject','hide','resubmit','redact')),
  reason          text,
  actor_uid       uuid,
  created_at      timestamptz not null default now()
);
create index if not exists review_mod_review_idx on public.review_moderation_events (review_id, created_at desc);

-- free_acquisitions: distinct from paid orders.
create table if not exists public.free_acquisitions (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null,
  deliverable_asset_id uuid not null,
  buyer_email     text,
  access_token_digest text,
  state           text not null default 'active' check (state in ('active','expired','revoked')),
  created_at      timestamptz not null default now()
);
create index if not exists free_acq_product_idx on public.free_acquisitions (product_id, state);

-- marketing_consent_events: append-only, latest wins.
create table if not exists public.marketing_consent_events (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid references public.orders(id),
  email_digest    text,
  state           text not null check (state in ('pending','confirmed','withdrawn','suppressed')),
  source          text not null,
  consent_text_revision text,
  locale          text not null default 'en',
  created_at      timestamptz not null default now()
);
create index if not exists marketing_consent_email_idx on public.marketing_consent_events (email_digest, created_at desc);

-- bundle_versions: immutable, versioned component sets.
create table if not exists public.bundle_versions (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete restrict,
  version         integer not null check (version >= 1),
  components      jsonb not null,    -- [{product_id, product_row_version, deliverable_asset_id, title, slug, unit_amount, currency}]
  license_version text,
  price           integer not null check (price >= 0),
  currency        text not null,
  status          text not null default 'draft' check (status in ('draft','published','archived')),
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  unique (product_id, version)
);

-- price_history: immutable intervals.
create table if not exists public.price_history (
  id              uuid primary key default gen_random_uuid(),
  sellable_id     uuid not null,
  currency        text not null,
  amount          integer not null check (amount >= 0),
  price_type      text not null check (price_type in ('normal','promotional')),
  valid_from      timestamptz not null,
  valid_until     timestamptz,
  reason          text,
  published_by    uuid,
  created_at      timestamptz not null default now()
);
create index if not exists price_history_sellable_idx
  on public.price_history (sellable_id, currency, valid_from desc);

-- promotions: immutable revisions + code digests.
create table if not exists public.promotions (
  id              uuid primary key default gen_random_uuid(),
  code_digest     text not null unique,
  label           text not null,
  currency        text not null,
  market          text not null default 'global',
  start_time      timestamptz not null,
  end_time        timestamptz not null,
  state           text not null default 'scheduled' check (state in ('active','scheduled','expired','disabled','exhausted')),
  discount_type   text not null check (discount_type in ('fixed_amount','percentage')),
  discount_value  integer not null check (discount_value >= 0),
  max_discount    integer,
  min_subtotal    integer not null default 0,
  total_usage_limit integer not null default 0,
  total_usage_count integer not null default 0,
  created_at      timestamptz not null default now()
);

-- redemption_reservations: concurrency-safe.
create table if not exists public.redemption_reservations (
  id              uuid primary key default gen_random_uuid(),
  promotion_id    uuid not null references public.promotions(id) on delete restrict,
  order_id        uuid,
  idempotency_key text not null unique,
  state           text not null default 'reserved' check (state in ('reserved','consumed','released','expired')),
  created_at      timestamptz not null default now(),
  consumed_at      timestamptz
);

-- recommendation_pins: AAL2-curated, audited.
create table if not exists public.recommendation_pins (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null,
  pinned_product_id uuid not null,
  reason          text,
  valid_from      timestamptz,
  valid_until     timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now()
);

-- RLS: enable on all new tables; deny anon/authenticated; AAL2 admin read-only.
alter table public.legal_revisions              enable row level security;
alter table public.reviews                      enable row level security;
alter table public.review_moderation_events     enable row level security;
alter table public.free_acquisitions           enable row level security;
alter table public.marketing_consent_events    enable row level security;
alter table public.bundle_versions             enable row level security;
alter table public.price_history               enable row level security;
alter table public.promotions                  enable row level security;
alter table public.redemption_reservations    enable row level security;
alter table public.recommendation_pins         enable row level security;

-- Public can read only published reviews (for aggregate display).
drop policy if exists "reviews_public_select" on public.reviews;
create policy "reviews_public_select" on public.reviews
  for select to anon, authenticated
  using (state = 'published');

-- AAL2 admin read-only on all new tables.
drop policy if exists "legal_rev_admin_read" on public.legal_revisions;
create policy "legal_rev_admin_read" on public.legal_revisions
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "reviews_admin_all" on public.reviews;
create policy "reviews_admin_all" on public.reviews
  for all to authenticated using (public.is_active_admin() and public.aal2()) with check (public.is_active_admin() and public.aal2());
drop policy if exists "review_mod_admin_read" on public.review_moderation_events;
create policy "review_mod_admin_read" on public.review_moderation_events
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "free_acq_admin_read" on public.free_acquisitions;
create policy "free_acq_admin_read" on public.free_acquisitions
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "marketing_consent_admin_read" on public.marketing_consent_events;
create policy "marketing_consent_admin_read" on public.marketing_consent_events
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "bundle_ver_admin_read" on public.bundle_versions;
create policy "bundle_ver_admin_read" on public.bundle_versions
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "price_history_public_select" on public.price_history;
create policy "price_history_public_select" on public.price_history
  for select to anon, authenticated using (true);
drop policy if exists "promotions_admin_read" on public.promotions;
create policy "promotions_admin_read" on public.promotions
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "redemption_admin_read" on public.redemption_reservations;
create policy "redemption_admin_read" on public.redemption_reservations
  for select to authenticated using (public.is_active_admin() and public.aal2());
drop policy if exists "recommendation_pins_public_select" on public.recommendation_pins;
-- ============================================================================
-- Seed data — REMOVED (Step 9 fix)
-- ----------------------------------------------------------------------------
-- The original seed.sql inserted fictional products (Vector Drift, Perimeter,
-- Granite Room, etc.). The operator wants a CLEAN production catalog with only
-- real products they create via the admin CMS. The seed was useful for Step 3
-- layout review but must not run against production.
--
-- If you need test data, apply seed.sql manually to a LOCAL dev project only:
--   supabase db reset   (applies migrations + seed)
-- Do NOT run seed.sql against production.
-- ============================================================================


-- ============================================================================
-- Idempotent grants (Step 9 fix)
-- ----------------------------------------------------------------------------
-- The earlier `revoke all on public.products, ... from anon, authenticated`
-- (line ~213) was too broad — it stripped SELECT on `products` and friends,
-- so RLS policies on those tables were defined but UNREACHABLE: the role
-- couldn't even attempt a SELECT, so every direct query returned HTTP 403.
-- The public catalog worked because it goes through SECURITY INVOKER/DEFINER
-- RPCs (search_products, get_product_by_slug, etc.) which run with the
-- function owner's privileges. But the admin CMS queries the tables directly,
-- which failed with 403.
--
-- This block re-grants the minimum privileges RLS needs to be evaluated:
--   - SELECT on public-facing tables to anon + authenticated (RLS filters rows)
--   - SELECT on admin-only tables to authenticated (RLS restricts to AAL2)
--   - INSERT/UPDATE/DELETE on catalog tables to authenticated (RLS restricts
--     mutations to AAL2 admins via is_active_admin() AND aal2())
--
-- These grants are safe: RLS is the real access boundary. A grant just lets
-- the role REACH the table; RLS decides which rows are visible/mutable.
-- ============================================================================

-- Catalog (public reads via RLS; admin mutations via RLS)
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.product_genres to anon, authenticated;
grant insert, delete on public.product_genres to authenticated;
grant select on public.product_plugins to anon, authenticated;
grant insert, delete on public.product_plugins to authenticated;
grant select on public.product_media to anon, authenticated;
grant insert, update, delete on public.product_media to authenticated;
grant select on public.product_deliverables to anon, authenticated;
grant insert, update, delete on public.product_deliverables to authenticated;
grant select, insert, update, delete on public.genres, public.plugins to authenticated;
grant select on public.genres, public.plugins to anon;

-- Admin-only tables (SELECT to authenticated; RLS restricts to active AAL2 admin)
grant select on public.admin_users to authenticated;
grant select on public.audit_events to authenticated;
grant select on public.product_rights to authenticated;
grant select on public.upload_intents to authenticated;

-- Payments + fulfillment (admin-only via RLS)
grant select on public.guest_carts, public.guest_cart_items to authenticated;
grant select, insert, update on public.guest_carts, public.guest_cart_items to authenticated;
grant select on public.checkout_attempts, public.checkout_attempt_items to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant select on public.refunds to authenticated;
grant select on public.webhook_inbox to authenticated;
grant select on public.fulfillment_generations, public.fulfillment_entitlements to authenticated;
grant select on public.download_access_tokens, public.download_access_sessions to authenticated;
grant select on public.delivery_messages, public.fulfillment_outbox to authenticated;
grant select on public.download_url_issuances to authenticated;

-- Trust + growth (Step 7)
grant select on public.legal_revisions to authenticated;
grant select on public.reviews, public.review_moderation_events to authenticated;
grant select on public.free_acquisitions to authenticated;
grant select on public.marketing_consent_events to authenticated;
grant select on public.bundle_versions to authenticated;
grant select on public.price_history to anon, authenticated;
grant select on public.promotions to authenticated;
grant select on public.recommendation_pins to anon, authenticated;
