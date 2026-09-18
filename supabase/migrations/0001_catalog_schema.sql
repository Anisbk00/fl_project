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
