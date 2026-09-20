# Media Previews

Public/private boundary, supported preview types, loading policy, player
behavior, encoding expectations for future uploads, accessibility, and failure
handling. See `src/components/site/audio-preview.tsx`,
`audio-player-state.ts`, and `src/features/catalog/repository.ts`.

## Public / private boundary

- `product_media` rows reference versioned, immutable object paths in the
  intentionally-public `product-public` bucket (cover images, compressed audio
  previews, optional video previews). Public URLs are constructed by
  `publicMediaUrl()` from the validated publishable config.
- `product_deliverables` reference private paid files in `product-private`.
  Those rows are NEVER returned by any public read path (RLS + the explicit
  repository `select`/DTO shapes forbid it). The public preview is NEVER the
  paid lossless deliverable, and a public preview URL is never treated as
  secret.

## Supported preview types

- `cover_image` — original abstract SVG cover (or original raster via
  `next/image` when added in a later step). Rendered by `ProductArtwork` with a
  stable 4:3 aspect ratio to prevent layout shift.
- `audio_preview` — a short, compressed, public preview derivative rendered by
  the `AudioPreview` component.
- `video_preview` — an optional validated external URL (no arbitrary embeds
  in Step 3).

## Loading policy

- Audio uses `preload="none"` so a card grid does NOT download preview bytes
  before the user presses play. Verified by a browser network test on a linked
  project (no live data in this sandbox to measure against).
- Below-the-fold covers are lazy-loaded; the principal above-the-fold cover on
  the product page is prioritized.

## Player behavior

- Built on the native `HTMLMediaElement`; no waveform/audio framework.
- Audio NEVER autoplays.
- Only one preview plays at a time across cards + the detail page (a
  module-level `SingleActivePreviewCoordinator` + pause-handler registry).
  Starting another pauses the previous.
- Play/pause, seek (range input), elapsed/duration, and a thin progress bar
  for the compact card variant. Volume/mute omitted to keep it simple and
  accessible.
- Loading + error states are honest. A failure (missing/unsupported/expired)
  degrades to a "Preview unavailable" status with a retry, never breaking the
  card/page.
- Stops playback and releases listeners/`src` on unmount/navigation.
- `prefers-reduced-motion`: non-essential motion removed; meaning never
  depends on motion/hover/color alone.

## Encoding expectations (future uploads)

- Preview audio: short (≤30–60s), compressed (MP3/AAC), normalized loudness,
  no copyrighted third-party audio. The paid lossless deliverable is never used
  as the preview.
- Covers: original abstract SVG or optimized raster with accurate `sizes`.
- The admin upload flow (Step 4) uploads directly from the admin browser to
  Supabase Storage (TUS/resumable or signed upload token), never proxying
  bytes through a Vercel Function.

## Accessibility

- The play/pause button has an accessible name that reflects state
  (`Play preview: <title>` / `Pause preview: <title>` / `Loading…` /
  `Preview unavailable`).
- The seek range input has an accessible label; the compact progress bar is a
  `role="progressbar"` with `aria-valuemin/max/now`.
- Controls are keyboard + pointer operable with an obvious focus-visible ring.
- Errors are announced via `role="status"` without repeatedly disturbing
  screen readers.

## Internal event boundary

`AudioPreview` accepts an optional `onPreviewEvent(kind)` callback
(`play`/`pause`/`ended`/`error`). Step 8 can instrument this for measurement
WITHOUT logging full URLs or personal data. No analytics are wired in Step 3.
