# Content Guide

Voice, terminology, and rules for storefront copy. Followed by the Step 2 route
pages (`/`, `/about`, `/faq`, `/contact`, `/legal/*`).

## Voice

- Direct, technically literate, confident, concise.
- Producer-focused: assume the reader knows their DAW, BPM, and key.
- Honest about what is and isn't built. Nothing unfinished is presented as live.

## Prohibited (unsupported) claims

Do not use any of: "industry-leading", "official", "guaranteed hit",
"used by top producers", "best on the market", "#1", or any superlative that
isn't supportable.

Do not fabricate: company history, social accounts, awards, sales counts,
ratings, reviews, testimonials, or customer quotes. (Verified-purchase reviews
arrive in Step 7 and will be real, never synthetic.)

Do not use fake scarcity or countdown timers. The header announcement (if any)
must be truthful and configured centrally in `siteConfig`.

Do not imply a feature works before its implementation step. Specifically in
Step 2: do not simulate checkout, download, newsletter signup, audio preview
playback, review submission, contact-form submission, or filtering/search.

## Do not copy

Do not reproduce the visual identity, code, layout, product wording, media, or
assets of FLPStudio.com, Splice, any producer/artist, label, DAW vendor, or
sample-pack company. Category inspiration is allowed; imitation is not.

Do not include third-party music, album art, artist likenesses, trademarks used
as branding, extracted commercial stems, or files without redistribution rights.
Fixture data uses fictional titles and original abstract artwork only.

## Product naming pattern

- Use original, evocative, non-trademark titles (e.g. "Vector Drift",
  "Granite Room", "Half-Light"). No real artist or song names.
- The product type label is separate from the title
  (`PRODUCT_TYPE_LABELS`: "Project File", "Remake", "Stems", "Sample Pack").
- Capitalize titles in Title Case.

## Terminology & capitalization

- **DAW** — uppercase acronym (FL Studio, Ableton Live, Logic Pro are proper
  nouns; capitalize as their vendors do).
- **BPM**, **WAV**, **MIDI**, **ZIP** — uppercase.
- **stems** — lowercase when used generically ("mixed-down stems").
- **project file** — lowercase generic; **Project File** when it's the product
  type label.
- **minor units** — prices are stored/flowed as integer minor currency units;
  render via `Price`/`formatPrice` (Intl.NumberFormat), never string concat.
- **free** — lowercase generic; **Free** when it's a badge/label.

## Referring to third-party DAWs and plugins

DAW and plugin names (FL Studio, Ableton Live, Logic Pro, Serum, Diva,
Valhalla VintageVerb, FabFilter Pro-Q, Omnisphere) are referenced **factually**
for compatibility only. Never imply affiliation, sponsorship, or endorsement.
They are trademarks of their owners.

Example acceptable phrasing: "Made in FL Studio 21; requires Serum 1.3."
Example prohibited phrasing: "FL Studio edition" or "powered by Serum" (implies
endorsement).

## Legal / originality language

- The store publishes only **original** or **properly licensed** material.
- State independence from artists, labels, and DAW vendors wherever legally
  appropriate (footer, about, product footers).
- Draft legal pages carry a "Draft — under legal review" badge and `noindex`
  metadata until approved. They are clearly draft structure, not final policies
  or legal advice. Statutory consumer rights are never waived.

## Tone examples (used in Step 2)

- Hero H1: "Study, reverse-engineer, and build with detailed production files."
- Trust principle: "DAW, version, BPM, key, plugins, formats, and file size are
  visible before you buy — not buried in the small print."
- Originality: "We publish only original material, or content the owner has the
  right to distribute."
- Honest limitation: "Live catalog data, checkout, and delivery arrive in later
  steps."
