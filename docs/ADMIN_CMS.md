# Admin CMS

Information architecture, editor fields, validation, concurrency, lifecycle
state machine, transactional publication/readiness gate, archive policy,
taxonomies, audit behavior, and cache invalidation/reconciliation.

## Information architecture

- `/admin` dashboard: draft/published/archived counts, items needing
  asset validation, recent safe audit events. No business analytics.
- `/admin/products` — server-side paginated, filterable table
  (title/slug, type, lifecycle, asset readiness, genre,
  updated). Filters in the URL. The full catalog is never loaded into the browser.
- `/admin/products/new` + `/admin/products/[id]` editor.
- `/admin/products/[id]/preview` — protected draft preview (AAL2, no-store,
  noindex); renders the real product-page presentation from private admin data;
  no publicly shareable preview token in Step 4; never via the public catalog
  repository.
- `/admin/taxonomies`, `/admin/audit`, `/admin/security`.

## Editor fields

Basics (title, slug, short summary, safe-Markdown long description), pricing/
classification (integer minor-unit price + ISO currency, product type, free/
paid, genres, tags, plugin/software relationships), compatibility (DAW + version,
plugin requirements + min versions, BPM, key, duration, formats, file size),
public cover/preview media, immutable private deliverable versions, license/
customer-facing usage summary, SEO title/description, lifecycle
+ publish-readiness status.

## Validation + concurrency

- One canonical Zod schema for client hints AND authoritative server
  validation. Trim + normalize; strict length/count/range limits; IDs are
  opaque + verified; raw HTML/executable URLs disabled (safe Markdown only).
  Client never supplies `created_by`/`updated_by`/reviewer UID/lifecycle
  readiness/checksum/audit actor.
- **Optimistic concurrency**: the editor sends the last-read `row_version`;
  the DB compares atomically and returns a typed conflict (`checkConcurrency`
  pure helper; `publish_product` re-checks). No silent overwrite. The conflict
  UI lets the admin reload or consciously reconcile (no auto-merge of legal/
  asset fields).
- Slugs unique + normalized by one shared rule. Published slugs are locked in
  Step 4 (post-publication slug changes need a tested redirect record — not
  implemented here).
- Explicit **Save Draft** + lifecycle actions (no fragile autosave). Dirty/
  submitting/success/error/conflict states; field errors; unsaved-navigation
  warning; input preserved after a recoverable validation error.

## Lifecycle state machine (pure: `src/features/admin/lifecycle.ts`)

`draft → published | archived`; `published → draft | archived`;
`archived → draft` (republish requires going through draft). Invalid
transitions are rejected atomically by the DB RPCs.

## Transactional publication gate (`publish_product(p_id, p_expected_version)`)

ONE atomic SECURITY DEFINER RPC. Re-reads the row (`for update`) and rejects
unless: caller is active admin + AAL2; optimistic-concurrency version matches;
required public
data valid; a validated public cover exists; a paid product has ≥1 active
validated private ZIP; no pending uploads. Updates lifecycle/`row_version` +
writes an audit event in the SAME transaction. Returns structured, non-secret
readiness errors; leaves the product unchanged on any failure. The pure mirror
is `src/features/admin/readiness.ts` (unit-tested) for the editor checklist.

`archive_product` / `unpublish_product` are also transactional + audited and
invalidate the public cache immediately after commit.

## Archive policy

Prefer archive (soft-delete) everywhere. Hard-delete of an empty
never-published draft requires typed confirmation + DB proof of no
assets/audit/legal dependencies. Never hard-delete a published product or an
asset version a future order could reference.

## Taxonomies

AAL2 admins create/edit genres + plugins. Normalized unique names/slugs.
Referenced entries are archived/disabled, not deleted. Mutations are
authorized, audited, concurrency-safe, and invalidate the public cache.

## Audit + cache invalidation

- Audit is append-only (`audit_events`); written by trusted triggers/functions
  from `auth.uid()`. Clients cannot insert/update/delete (RLS + triggers).
  Compact changed-field list; redacted (`src/features/admin/audit.ts`); no
  passwords/tokens/signed URLs/private evidence in payloads.
- `src/features/admin/cache-invalidation.ts` maps mutations → Step 3 cache tags
  (`catalog:products`, `catalog:product:<slug>`, `catalog:taxonomy`,
  `catalog:free`, `catalog:related`, `catalog:featured`). Called ONLY after a
  committed success. Draft-only edits do NOT invalidate. On invalidation
  failure: log a safe operational error, surface a retryable warning, idempotent
  retry/reconciliation; the committed DB change is NOT rolled back.

## Honest blockers (sandbox)

The full editor UI, live product fetch, transactional publish, audit viewer,
and E2E CMS tests require a linked Supabase project. The pure security logic
(lifecycle, readiness, concurrency, audit redaction) is unit-tested; the DB
RPCs + pgTAP role/AAL matrix are committed, unrunnable here.
