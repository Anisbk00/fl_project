-- ============================================================================
-- 0017_remove_rights.sql — remove the rights-status / rights-review feature.
-- ----------------------------------------------------------------------------
-- A product is now public when lifecycle = 'published'; publishing no longer
-- requires a rights status or reviewer attestation.
-- ============================================================================

-- --- Policies: public read = published --------------------------------------
drop policy if exists "products_public_select" on public.products;
create policy "products_public_select" on public.products
  for select to anon, authenticated using (lifecycle = 'published');

drop policy if exists "joins_public_select" on public.product_genres;
create policy "joins_public_select" on public.product_genres
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.lifecycle = 'published'));

drop policy if exists "plugins_join_public_select" on public.product_plugins;
create policy "plugins_join_public_select" on public.product_plugins
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.lifecycle = 'published'));

drop policy if exists "media_public_select" on public.product_media;
create policy "media_public_select" on public.product_media
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.lifecycle = 'published'));

-- --- Publication constraint without rights ----------------------------------
alter table public.products drop constraint if exists products_publication_check;
alter table public.products add constraint products_publication_check check (
  lifecycle <> 'published' or (
    published_at is not null
    and price >= 0
    and price_currency is not null
    and length(title) >= 1
    and length(short_description) >= 1
  )
);

-- --- Publish gate without rights checks (0012 minus the rights block) --------
create or replace function public.publish_product(p_product_id uuid, p_expected_version int)
returns table (ok boolean, errors jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row        public.products;
  v_errors     jsonb := '[]'::jsonb;
  v_has_cover  boolean;
  v_has_zip    boolean;
begin
  if not (public.is_active_admin() and public.aal2()) then
    return query select false::boolean, jsonb_build_array('unauthorized')::jsonb;
    return;
  end if;

  select * into v_row from public.products where id = p_product_id for update;
  if not found then
    return query select false::boolean, jsonb_build_array('not_found')::jsonb;
    return;
  end if;
  if v_row.row_version <> p_expected_version then
    return query select false::boolean, jsonb_build_array('conflict')::jsonb;
    return;
  end if;

  if coalesce(length(v_row.title),0) < 1 then v_errors := v_errors || '"title_missing"'::jsonb; end if;
  if coalesce(length(v_row.short_description),0) < 1 then v_errors := v_errors || '"summary_missing"'::jsonb; end if;
  if v_row.price < 0 then v_errors := v_errors || '"invalid_price"'::jsonb; end if;
  if v_row.price_currency is null or v_row.price_currency !~ '^[A-Z]{3}$' then v_errors := v_errors || '"invalid_currency"'::jsonb; end if;

  select exists (
    select 1 from public.product_media m
    where m.product_id = p_product_id and m.kind = 'cover_image' and m.validation_state in ('ready','active')
  ) into v_has_cover;
  if not v_has_cover then v_errors := v_errors || '"cover_missing"'::jsonb; end if;

  select exists (
    select 1 from public.product_deliverables d
    where d.product_id = p_product_id and d.active = true and d.validation_state in ('ready','active')
  ) into v_has_zip;
  if not v_has_zip then v_errors := v_errors || '"private_zip_missing"'::jsonb; end if;

  if exists (select 1 from public.upload_intents i where i.product_id = p_product_id and i.state = 'pending') then
    v_errors := v_errors || '"pending_uploads"'::jsonb;
  end if;

  if jsonb_array_length(v_errors) > 0 then
    return query select false::boolean, v_errors;
    return;
  end if;

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

-- --- Catalog read functions without rights (return types change → drop) -----
drop function if exists public.search_products(text,text[],text[],text,text[],boolean,integer,integer,text,integer,integer,text,text,integer,integer);
drop function if exists public.get_product_by_slug(text);

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
  product_type product_type, lifecycle product_lifecycle,
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
    p.product_type, p.lifecycle, p.price, p.price_currency, p.compare_at_price,
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
  product_type product_type, lifecycle product_lifecycle,
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
    p.product_type, p.lifecycle, p.price, p.price_currency, p.compare_at_price,
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
    and p.lifecycle = 'published';
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
    and (
      p.product_type = (select p2.product_type from public.products p2 where p2.slug = p_slug)
      or exists (
        select 1 from public.product_genres pg2
        where pg2.product_id = p.id
          and pg2.genre_id in (
            select pg3.genre_id from public.product_genres pg3
            join public.products p3 on p3.id = pg3.product_id
            where p3.slug = p_slug and p3.lifecycle='published'
          )
      )
    )
  order by p.id, p.published_at desc
  limit least(greatest(p_limit, 1), 12);
$$;

-- ---------------------------------------------------------------------------
-- list_free_products() — published products with price = 0.
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

-- --- Drop the rights data ---------------------------------------------------
drop table if exists public.product_rights;  -- also drops rights_audit trigger
drop index if exists public.products_published_listing_idx;
drop index if exists public.products_published_newest_idx;
drop index if exists public.products_published_title_idx;
drop index if exists public.products_published_type_idx;
drop index if exists public.products_published_price_idx;
drop index if exists public.products_published_bpm_idx;
drop index if exists public.products_published_daw_idx;
drop index if exists public.products_published_featured_idx;
alter table public.products drop column if exists rights_status;
drop type if exists rights_status;

create index if not exists products_published_listing_idx
  on public.products (lifecycle, published_at desc);
create index if not exists products_published_newest_idx
  on public.products (published_at desc, updated_at desc, slug) where lifecycle = 'published';
create index if not exists products_published_title_idx
  on public.products (title, slug) where lifecycle = 'published';
create index if not exists products_published_type_idx
  on public.products (product_type) where lifecycle = 'published';
create index if not exists products_published_price_idx
  on public.products (price_currency, price) where lifecycle = 'published';
create index if not exists products_published_bpm_idx
  on public.products (bpm) where lifecycle = 'published';
create index if not exists products_published_daw_idx
  on public.products (daw_name) where lifecycle = 'published';
create index if not exists products_published_featured_idx
  on public.products (featured, published_at desc) where lifecycle = 'published';
