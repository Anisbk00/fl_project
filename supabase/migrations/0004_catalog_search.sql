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
language plpgsql
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
language plpgsql
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
language plpgsql
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
