# Operations

Admin provisioning/disable/recovery, hosted Supabase settings, cleanup/validator
operation, cache retry, and incident steps — without any live secret.

## Admin provisioning / disable / recovery

- **Provision** the first admin out-of-band via the Supabase Dashboard, or a
  server-only operator script (`scripts/provision-admin.ts`, NOT committed as a
  public route) that: refuses browser execution; reads secrets from env/stdin;
  never logs the password/token; is idempotent; uses the Supabase admin API on
  a trusted machine. Then `insert into admin_users (user_id, display_name,
  active) values (<auth-uid>, …)`.
- **Disable** an admin: `update admin_users set active=false, disabled_at=now(),
  disabled_by=auth.uid() where user_id=…` (AAL2-only via RLS). Audited.
- **Recovery** (lost TOTP / password): break-glass — disable + reprovision the
  account out-of-band; never bypass AAL2. Documented in docs/ADMIN_AUTH.md.

## Hosted Supabase settings checklist

- Exact Site URL + redirect allow-list for local/preview/production origins.
- Disabled public sign-up + unused OAuth/phone/anonymous providers.
- Strong password + leaked-password protection (plan-dependent).
- MFA settings + Auth rate limits.
- Secure custom SMTP before relying on password recovery.
- Separate local/preview/production Supabase projects.
- Vercel env-var scope + preview-domain handling.
- Storage bucket privacy, MIME/size config, CORS limited to required origins/
  methods.
- Scheduled cleanup/validation worker operation where applicable.

## Cleanup / validator operation

- A bounded worker: expires stale `upload_intents`, deletes orphan staging
  objects, and runs the trusted validator over `uploaded`/`quarantined` assets
  (streaming SHA-256 + role inspection → `ready` + promote/copy).
- If scheduling is deferred, a dry-run/safe operator procedure exists. All
  cross-system (DB + Storage) operations are idempotent + retry-safe.

## Cache retry + reconciliation

- After a committed mutation, `invalidateForMutation()` revalidates the
  affected Step 3 tags (`src/features/admin/cache-invalidation.ts`).
- On failure: log a safe operational error; surface a retryable warning;
  idempotent retry/reconciliation; the committed DB change is NOT rolled back.
- Verify unpublished/archived content is not publicly accessible through an
  untagged cache path. Never cache admin data under a public tag.

## Incident steps (no live secret)

1. Disable the affected admin (`active=false`) — audited.
2. Rotate the affected session (sign out everywhere via Supabase) + the admin
   password.
3. Review `audit_events` for the actor + affected entities.
4. Quarantine any suspect assets (`validation_state=quarantined`).
5. Re-provision MFA out-of-band; never bypass AAL2.

## Honest blockers (sandbox)

No live Supabase project / Docker here → the worker, live provisioning, hosted
settings, and cleanup scheduling could not run. The pure cache-invalidation
mapping + audit redaction are unit-tested; the committed SQL is the source of
truth.
