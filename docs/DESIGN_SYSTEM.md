# Design System

The visual direction and component contract for the storefront shell. This
document matches the implemented code (`src/app/globals.css`,
`src/components/site/*`).

## Visual principles

- **Premium, precise, producer-focused** — not gamer-like or corporate.
- **Dark graphite foundation** with warm off-white ink; one high-energy
  **chartreuse/lime** accent; a cool **violet** reserved sparingly for
  technical/audio-data states (never an uncontrolled rainbow gradient).
- **Editorial typography paired with technical detail** — headings and body in
  the sans family; money and technical metadata in the mono family with tabular
  numerals.
- **Calm hierarchy, dense where it counts** — useful product information is
  dense, but spacing and borders keep it readable.
- **Motion clarifies state**, never decorates: small CSS transitions only,
  removed under `prefers-reduced-motion`. No glow, glassmorphism, gradient text,
  giant mobile headlines, autoplay media, scroll hijack, custom cursor, or
  decorative animation library.

## Palette (semantic tokens)

All tokens are CSS custom properties in `src/app/globals.css` (`:root` =
dark-graphite default; `.light` variant provided but dark-first). The shadcn
aliases (`--background`, `--foreground`, `--primary`, …) are mapped onto these
so every pre-generated primitive inherits the system.

| Token | oklch (dark) | Usage |
| --- | --- | --- |
| `--canvas` | `0.155 0.004 250` | page background (near-black graphite) |
| `--surface` | `0.19 0.004 250` | cards, secondary surfaces |
| `--surface-elevated` | `0.225 0.005 250` | popovers, elevated surfaces |
| `--surface-inset` | `0.125 0.003 250` | recessed areas, code, footers |
| `--ink` | `0.965 0.012 95` | primary text (warm off-white) |
| `--ink-secondary` | `0.78 0.012 95` | secondary text |
| `--ink-muted` | `0.6 0.012 95` | captions, muted metadata |
| `--ink-inverse` | `0.15 0.01 250` | text on accent |
| `--line` | `rgb(1 0 0 / 9%)` | subtle borders |
| `--line-strong` | `rgb(1 0 0 / 18%)` | strong borders, inputs |
| `--focus` | `0.85 0.19 128` | focus ring (chartreuse) |
| `--brand` | `0.86 0.19 128` | primary accent (chartreuse/lime) |
| `--brand-foreground` | `0.16 0.02 130` | text on brand (near-black) |
| `--info` | `0.72 0.12 270` | technical/secondary accent (violet) |
| `--success` | `0.74 0.15 155` | success / free |
| `--warning` | `0.82 0.15 80` | warning / draft |
| `--danger` | `0.66 0.21 25` | destructive |

Contrast was validated by an axe-core scan (WCAG 2.2 A/AA + 2.1/2.2) returning
**0 violations** on `/`, `/catalog`, `/cart`, `/about`, and the open mobile
menu.

## Typography roles

Documented classes in `globals.css` (`@layer components`):

| Role | Class | Notes |
| --- | --- | --- |
| Display | `.t-display` | hero H1; fluid `clamp(2.125rem, …, 3.25rem)` |
| Heading 1 | `.t-heading-1` | section titles; fluid to 2.25rem |
| Heading 2 | `.t-heading-2` | 1.375rem, 600 |
| Heading 3 | `.t-heading-3` | 1.0625rem, 600 |
| Body | `.t-body` | 1rem / 1.6 |
| Body large | `.t-body-lg` | 1.125rem / 1.6 |
| Body small | `.t-body-sm` | 0.875rem |
| Label | `.t-label` | 0.8125rem, 600 |
| Caption | `.t-caption` | 0.75rem, secondary color |
| Eyebrow | `.t-eyebrow` | uppercase tracked section label |
| Price | `.t-price` | 1.125rem, 700, tabular nums |
| Technical | `.t-technical` | mono, 0.8125rem, tabular nums |

Heading levels follow document structure, not visual size — `t-display` is
applied to the H1, `t-heading-1` to H2s that need a larger feel, etc.

## Spacing, widths, radii, elevation

- **Spacing**: Tailwind's `--spacing: 0.25rem` base scale; section vertical
  rhythm `py-12 sm:py-16 lg:py-20`.
- **Container widths**: `--container-narrow` 40rem, `--container-content` 46rem
  (prose), `--container-wide` 80rem (shell). Gutters: `px-4 → sm:px-6 → lg:px-8`.
- **Radii**: `--radius-sm` 0.375rem, `--radius-md` 0.5rem, `--radius-lg` 0.625rem,
  `--radius-xl`, `--radius-2xl` 1.25rem, `--radius-pill`.
- **Elevation**: `--shadow-xs/sm/md/lg` + `--shadow-focus`; used sparingly.
- **z-index**: `--z-base`, `--z-header` 50, `--z-mobile-nav` 60, `--z-overlay` 70,
  `--z-toast` 80.
- **Motion**: `--duration-fast` 120ms, `--duration-base` 180ms, `--duration-slow`
  280ms; `--ease-standard`, `--ease-emphasized`.

## Components (`src/components/site/`)

| Component | Purpose |
| --- | --- |
| `Container` / `Section` / `Stack` / `Grid` | layout primitives |
| `Button` / `LinkButton` / `IconButton` | variants (primary/secondary/outline/ghost/danger), sizes, loading-safe spinner, focus-visible ring, disabled; icon-only requires `aria-label` |
| `Badge` | tones (neutral/brand/info/success/warning/danger/outline) |
| `Price` | `Intl.NumberFormat` formatter from integer minor units; compare-at strikethrough |
| `ProductCard` | single-anchor card (no nested interactive); surfaces DAW/BPM/key/duration/formats/size/price |
| `ProductArtwork` | deterministic abstract SVG waveform cover, stable 4:3 aspect ratio |
| `SectionHeading` | eyebrow + heading + description |
| `EmptyState` / `ErrorState` / `NoResultsState` / `SkeletonCard` / `SkeletonGrid` | state patterns |
| `SkipLink` | keyboard-visible skip-to-content |
| `PageHeader` / `Prose` | inner-page hero + long-form content |
| `MobileNav` | client island; Radix Dialog (focus trap, Escape, focus return) |
| `SiteHeader` / `SiteFooter` | global shell (RSC) |
| `BrandMark` / `Wordmark` | original SVG glyph + real-text wordmark |
| `LegalDraft` | shared draft-legal layout (noindex) |

## State behavior

- Hover/active/focus-visible on every interactive control; disabled + loading
  states on `Button`.
- Cards lift 2px on hover (disabled under `prefers-reduced-motion`).
- The mobile menu is fully operable if animation is disabled (CSS strips
  transitions globally under reduced-motion; Radix logic is JS-driven).

## Responsive rules

Mobile-first. Inspected at **320, 375, 768, 1024, 1440, 1920** CSS px. Verified:
no horizontal overflow at 320 (`document.scrollWidth === innerWidth`), no clipped
focus rings, product grids progress from one column to many via
`repeat(auto-fill, minmax(16rem, 1fr))`, footer reflows into a stacked hierarchy
on small screens, header collapses desktop nav into a mobile sheet below `lg`.
Fluid type uses `clamp()` with controlled min/max; reading text stays within the
narrow/content container widths.

## Accessibility requirements

- Semantic landmarks: `header`, `nav`, `main`, `section`, `footer`.
- A keyboard-visible skip link is the first focusable element; it reveals
  **instantly** on focus (no transition).
- Every interactive element is keyboard-reachable with an obvious
  focus-visible ring.
- The mobile menu traps focus, closes on Escape, returns focus to its trigger,
  and blocks background interaction (Radix Dialog).
- Icon-only buttons carry `aria-label`; decorative icons/motifs are `aria-hidden`.
- Heading order is logical; H1 count per page is 1.
- Color contrast meets WCAG 2.2 AA (≥4.5:1 normal, ≥3:1 large/boundaries),
  validated by axe-core (0 violations on core pages).
- Primary controls ≥44×44 CSS px where layout allows.
- `prefers-reduced-motion` removes non-essential motion; meaning never depends on
  motion/hover/color alone.
- No placeholder-as-only-label; no focus-outline suppression without a stronger
  replacement.
- No nested interactive elements in cards (the product card is a single anchor).

## Asset rules

- Fonts via `next/font` (Geist Sans + Geist Mono — two families, self-hosted, no
  request to a font provider). System fallbacks defined.
- Original SVG/CSS only: brand mark, hero visual, product artwork, OG image —
  all authored locally, no copied or stock assets.
- `next/image` would be used for raster images (none required in Step 2). No
  remote-image wildcard hosts; no external/hotlinked media; no base64 blobs in
  components.

## Replacing the temporary site name

The brand name is **not approved**. `Audio Project Store` is an explicitly
documented working label. To replace it, change ONE value:
`NEXT_PUBLIC_SITE_NAME` (default in `src/lib/env/public.ts`, or set it in
`.env.local`). `siteConfig.name` (`src/lib/site-config.ts`) reads from validated
env and propagates everywhere (header wordmark, footer, metadata, mobile menu).
The wordmark is real text, never an image, so a new name needs no asset work.
