# Upload Security

Buckets + path rules, intent/finalize protocol, TUS configuration, exact
allow-lists/limits, validation + checksum trust levels, ZIP defenses, asset
state/version model, quarantine/malware posture, signed admin inspection,
cleanup, and platform limits. See `src/features/admin/uploads.ts` (pure,
unit-tested) + `supabase/migrations/0005_admin_cms.sql`.

## Buckets + paths

- `product-public` — intentionally public; only validated, sanitized cover/
  preview derivatives land here. No anonymous writes.
- `product-private` — private; paid ZIP deliverables live here permanently.
- `product-public-staging` — private staging; ALL uploads land here first.
  Unvalidated covers/previews are NOT instantly reachable from a public bucket.

Stored object keys are server-generated (random/opaque id + immutable version)
via `generateStagingKey()`. The client never chooses a path. Path-traversal is
rejected (`hasPathTraversal()`).

## Intent / finalize protocol (two-phase direct upload)

1. AAL2 server action creates an expiring `upload_intent` (validates product +
   role + declared filename/extension/type + expected size; generates the
   staging path; bound to product/role/creator; one-use; expires).
2. The authenticated browser uploads DIRECTLY to the staging bucket via the
   official resumable TUS client (access token, 6 MB chunks per current docs,
   retry, progress, cancellation, resume metadata). Large files never traverse
   a Vercel Function body.
3. AAL2 finalization accepts ONLY the intent id (not an arbitrary bucket/key);
   atomically claims the unexpired intent; confirms the object exists at the
   intended staging path; checks server-reported metadata/size; places it in
   `uploaded`/`quarantined` validation state. Idempotent.
4. A trusted validation worker reads the staging object with bounded resources,
   derives actual facts + streaming SHA-256, performs role-specific
   inspection, and only then marks `ready` + promotes/copies to the final
   public/private location.
5. Activation of a new version is atomic; the prior version is `superseded`
   only after the new one is `ready`. Never Storage `upsert`.

## TUS configuration

Client: official Supabase TUS client; 6 MB chunk size (current docs); retry
policy; resume metadata; progress; cancel. Storage write policies require the
authenticated current UID to be an active AAL2 admin AND restrict exact
buckets/path prefixes. Finalization repeats these checks server-side.

## Allow-lists + limits (`EXTENSION_ALLOWLISTS`, `MAX_BYTES`)

- cover_image: png, webp, jpeg (SVG omitted unless a sanitizer + need exist);
  ≤12 MB.
- audio_preview: mp3, m4a, aac; ≤8 MB.
- video_preview: mp4, webm; ≤64 MB (added only if the schema supports video).
- private_deliverable: zip; ≤2 GB.

## Validation + checksum trust levels

- Filename/extension/MIME/client checksum are UNTRUSTED claims.
- `validateFilename()` rejects empty, control/null bytes, path separators,
  traversal, trailing-dot/space, dangerous double extensions, length >255.
- `detectFileSignature()` inspects magic bytes (PNG/JPEG/WebP/MP3/MP4/WebM/
  ZIP) and compares to the role allow-list (`signatureMatchesRole`).
- The server computes a streaming SHA-256 in the trusted validator; the client
  checksum is a HINT only (`server_checksum` is never copied from it).

## ZIP defenses (`validateZip`)

Rejects: traversal/absolute entries, symlinks, encrypted archives, dangerous
embedded extensions (exe/sh/bat/ps1/…), nested archives, device paths
(CON/PRN/AUX/…), >10,000 entries, >4 GB total uncompressed, compression ratio
>200 (zip bombs). Bounded central-directory parsing. Stores derived
entry-count/uncompressed-size facts.

## Asset state + version model

`pending → uploaded → quarantined → ready → active → superseded` (with
`failed`/`deletion_pending`). Transitions enforced. DB rows + Storage objects
are not one atomic system → every cross-system op is idempotent + retry-safe.
New versions never overwrite old keys; activation supersedes only after
readiness.

## Quarantine / malware posture

If a real trusted malware scanner is available, integrate it behind a small
validator interface (record engine/signature + scan time; never leak file
contents). If NOT available (this sandbox), keep new deliverables quarantined
or require a documented, audited manual scan/approval gate; label the missing
automated scanner as a release blocker for the hardening step; NEVER set
`malware_scan = passed` by assumption.

## Signed admin inspection

A short-lived signed URL for an admin to inspect a private ready deliverable is
created ONLY after an AAL2 server check. Short TTL; never persisted/logged;
download-oriented content-disposition. This is NOT the future buyer
download-grant system (Step 6).

## Cleanup

Bounded cleanup for expired intents + orphan staging objects. A dry-run/safe
operator procedure exists if scheduling is deferred (no cron in this step).

## Honest blockers (sandbox)

TUS uploads, the trusted validator worker, real Storage policies, ZIP parsing
against real bytes, and the Storage-policy pgTAP tests require a linked
Supabase project. The pure validation logic (`uploads.ts`) is unit-tested
(19 tests). The committed SQL + pgTAP are the production source of truth.
