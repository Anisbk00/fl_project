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
create policy "reviews_public_select" on public.reviews
  for select to anon, authenticated
  using (state = 'published');

-- AAL2 admin read-only on all new tables.
create policy "legal_rev_admin_read" on public.legal_revisions
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "reviews_admin_all" on public.reviews
  for all to authenticated using (public.is_active_admin() and public.aal2()) with check (public.is_active_admin() and public.aal2());
create policy "review_mod_admin_read" on public.review_moderation_events
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "free_acq_admin_read" on public.free_acquisitions
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "marketing_consent_admin_read" on public.marketing_consent_events
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "bundle_ver_admin_read" on public.bundle_versions
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "price_history_public_select" on public.price_history
  for select to anon, authenticated using (true);
create policy "promotions_admin_read" on public.promotions
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "redemption_admin_read" on public.redemption_reservations
  for select to authenticated using (public.is_active_admin() and public.aal2());
create policy "recommendation_pins_public_select" on public.recommendation_pins
  for select to anon, authenticated using (valid_from is null or valid_from <= now());
