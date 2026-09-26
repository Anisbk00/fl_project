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
create type product_type as enum ('project_file', 'remake', 'stems', 'sample_pack');
create type product_lifecycle as enum ('draft', 'published', 'archived');
create type rights_status as enum ('unreviewed', 'original', 'licensed', 'rejected');
create type media_kind as enum ('cover_image', 'audio_preview', 'video_preview');

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
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();
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
-- seed.sql — Step 3 deterministic local development / test data.
-- ----------------------------------------------------------------------------
-- DEV/TEST ONLY. Never run automatically against production.
-- Fictional titles, original descriptions, original abstract cover references.
-- Includes intentionally unpublished/rejected rows to prove RLS + 404 behavior.
-- No artist names, song titles, album art, reviews, sales numbers, or
-- third-party pack content. No real customer/admin data.
--
-- Apply with:  supabase db reset   (applies migrations + this seed)
-- Or standalone against a local project after migrations:
--   supabase db execute --file supabase/seed.sql
--
-- Local media seeding (idempotent): generate a tiny synthetic 1-second 8-bit
-- mono sine WAV (no third-party rights) and upload to the public bucket:
--   bun scripts/seed-local-media.ts   (documented in README; not committed as
--   a large binary — it generates the clip in-process and uploads via the
--   storage API). Cover images are original abstract SVGs generated the same way.
-- The product_media rows below reference those object paths.
-- ============================================================================

begin;

-- Genres ---------------------------------------------------------------------
insert into public.genres (slug, name) values
  ('techno','Techno'), ('deep-house','Deep House'), ('drum-and-bass','Drum & Bass'),
  ('ambient','Ambient'), ('trap','Trap'), ('lo-fi','Lo-fi'), ('cinematic','Cinematic')
on conflict (slug) do nothing;

-- Plugins --------------------------------------------------------------------
insert into public.plugins (slug, name, vendor) values
  ('serum','Serum','Xfer Records'),
  ('diva','Diva','u-he'),
  ('valhalla-vintageverb','Valhalla VintageVerb','Valhalla'),
  ('pro-q3','FabFilter Pro-Q 3','FabFilter'),
  ('omnisphere','Omnisphere','Spectrasonics')
on conflict (slug) do nothing;

-- Products -------------------------------------------------------------------
-- Visible (published + original/licensed)
insert into public.products
  (slug, title, short_description, long_description, product_type, lifecycle, rights_status, price, price_currency, compare_at_price, daw_name, daw_version, bpm, musical_key, duration_seconds, total_size_bytes, included_formats, featured, seo_title, seo_description, published_at, created_by_id)
values
  ('vector-drift','Vector Drift','Original melodic techno project file with full arrangement.','## Inside\n\nFull FL Studio session with routing, automation, and stems. All audio and MIDI are original.\n\n## Compatibility\n\nFL Studio 21; Serum 1.3 required.','project_file','published','original',2400,'USD',3200,'FL Studio','21',126,'F# minor',312,58720256,'.flp, .zip, stems',true,'Vector Drift — Original FL Studio Project','Original FL Studio project with full arrangement, stems, and routing.',now(),'00000000-0000-0000-0000-0000000000aa'),
  ('tape-hiss-studies','Tape Hiss Studies','Original lo-fi one-shots and loops in 24-bit WAV.','A pack of original dusty keys, tape hiss, and percussive loops. 24-bit WAV.','sample_pack','published','original',1900,'USD',null,null,null,90,'A minor',null,312412160,'24-bit WAV, 128 one-shots, 32 loops',true,'Tape Hiss Studies — Original Sample Pack','Original lo-fi one-shots and loops.',now(),'00000000-0000-0000-0000-0000000000aa'),
  ('perimeter','Perimeter','Drum & bass stems, mixed-down and ready to drop in.','Original DnB stems. Compatible with any DAW that imports WAV.','stems','published','licensed',1500,'EUR',null,'Ableton Live','12',174,'G minor',268,412877312,'stems, mixdown',true,'Perimeter — DnB Stems','Drum & bass stems pack.',now(),'00000000-0000-0000-0000-0000000000aa'),
  ('granite-room','Granite Room','Deep house project with mixed stems and routing.','Original deep house session. Includes stems and full routing.','project_file','published','original',2800,'USD',null,'Ableton Live','12',124,'D minor',358,88120128,'.als, .zip, stems',true,'Granite Room — Ableton Project','Original deep house project file.',now(),'00000000-0000-0000-0000-0000000000aa'),
  ('half-light','Half-Light','Ambient cinematic stems for layering and study.','Original ambient stems. Suited for layering and reverse-engineering.','stems','published','original',1200,'EUR',null,null,null,110,'E minor',240,220300800,'stems, mixdown',false,'Half-Light — Ambient Stems','Ambient cinematic stems.',now(),'00000000-0000-0000-0000-0000000000aa'),
  -- Free visible product (price = 0)
  ('ferrite','Ferrite','Free original techno one-shots.','A small free pack of original techno one-shots. 24-bit WAV.','sample_pack','published','original',0,'USD',null,null,null,128,'A minor',null,96420352,'24-bit WAV, 60 one-shots',false,'Ferrite — Free Techno Pack','Free original techno one-shots.',now(),'00000000-0000-0000-0000-0000000000aa')
on conflict (slug) do nothing;

-- Hidden (prove RLS + 404 behavior) -----------------------------------------
insert into public.products
  (slug, title, short_description, product_type, lifecycle, rights_status, price, price_currency, daw_name, bpm, musical_key)
values
  ('draft-track','Draft Track','Should never be public.','stems','draft','original',900,'USD','FL Studio',128,'A minor'),
  ('archived-pack','Archived Pack','Removed from sale.','sample_pack','archived','licensed',1500,'USD',null,140,'F minor'),
  ('unreviewed-draft','Unreviewed Draft','Awaiting rights review.','remake','draft','unreviewed',1900,'USD','FL Studio',140,'C# minor'),
  ('rejected-public','Should Be Hidden','Rights rejected.','stems','draft','rejected',1900,'USD',null,120,'A minor')
on conflict (slug) do nothing;

-- Joins ----------------------------------------------------------------------
insert into public.product_genres (product_id, genre_id)
  select p.id, g.id from public.products p, public.genres g
  where p.slug='vector-drift' and g.slug='techno'
  on conflict do nothing;
insert into public.product_genres (product_id, genre_id)
  select p.id, g.id from public.products p, public.genres g
  where p.slug='vector-drift' and g.slug='melodic'
  on conflict do nothing;  -- 'melodic' may not exist; harmless if absent
insert into public.product_genres (product_id, genre_id)
  select p.id, g.id from public.products p, public.genres g
  where p.slug='perimeter' and g.slug='drum-and-bass'
  on conflict do nothing;
insert into public.product_genres (product_id, genre_id)
  select p.id, g.id from public.products p, public.genres g
  where p.slug='granite-room' and g.slug='deep-house'
  on conflict do nothing;
insert into public.product_genres (product_id, genre_id)
  select p.id, g.id from public.products p, public.genres g
  where p.slug='half-light' and g.slug in ('ambient','cinematic')
  on conflict do nothing;
insert into public.product_genres (product_id, genre_id)
  select p.id, g.id from public.products p, public.genres g
  where p.slug='ferrite' and g.slug='techno'
  on conflict do nothing;

insert into public.product_plugins (product_id, plugin_id, min_version, required)
  select p.id, pl.id, '1.3', true from public.products p, public.plugins pl
  where p.slug='vector-drift' and pl.slug='serum'
  on conflict do nothing;
insert into public.product_plugins (product_id, plugin_id, min_version, required)
  select p.id, pl.id, '1.4', true from public.products p, public.plugins pl
  where p.slug='granite-room' and pl.slug='diva'
  on conflict do nothing;
insert into public.product_plugins (product_id, plugin_id, min_version, required)
  select p.id, pl.id, null, false from public.products p, public.plugins pl
  where p.slug='perimeter' and pl.slug='pro-q3'
  on conflict do nothing;

-- Public media (covers + a tiny synthetic audio preview reference) ----------
-- storage_object_path points to objects in the intentionally-public bucket.
insert into public.product_media (product_id, kind, bucket, storage_object_path, mime_type, bytes, alt_text)
  select p.id, 'cover_image', 'product-public', 'product-public/' || p.slug || '/v1/cover.svg', 'image/svg+xml', 2048, p.title || ' — abstract cover'
  from public.products p
  where p.slug in ('vector-drift','tape-hiss-studies','perimeter','granite-room','half-light','ferrite')
  on conflict do nothing;

insert into public.product_media (product_id, kind, bucket, storage_object_path, mime_type, bytes, alt_text)
  select p.id, 'audio_preview', 'product-public', 'product-public/' || p.slug || '/v1/preview.mp3', 'audio/mpeg', 8192, 'Short original audio preview'
  from public.products p
  where p.slug in ('vector-drift','perimeter','granite-room','ferrite')
  on conflict do nothing;

-- PRIVATE deliverables (must NEVER be returned by any public path) ----------
insert into public.product_deliverables (product_id, bucket, storage_object_path, customer_filename, mime_type, bytes, version, sha_256, active)
  select p.id, 'product-private', 'product-private/' || p.slug || '/v1/archive.zip', p.slug || '.zip', 'application/zip', 123456, 1, repeat('a',64), true
  from public.products p
  where p.slug in ('vector-drift','tape-hiss-studies','perimeter','granite-room','half-light')
  on conflict do nothing;

commit;
