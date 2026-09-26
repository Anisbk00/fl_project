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
