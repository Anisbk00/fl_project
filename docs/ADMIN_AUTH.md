# Admin Authentication

Architecture, trust boundaries, route matrix, SSR/cookie pattern, central guard,
provisioning, login/MFA/recovery/logout flows, AAL1/AAL2 behavior, rate limits,
hosted settings, session failure behavior, and break-glass runbook.

## Trust boundary

1. **Supabase Auth proves identity** (email + password for the manually
   provisioned admin; public sign-up disabled).
2. **A database-backed active admin allow-list** (`admin_users.active`)
   grants the administrator role, keyed by the immutable Auth user UUID.
   Display email is descriptive only; an email-domain check is never
   authorization.
3. **A verified AAL2 claim** proves the session completed a TOTP challenge.
4. The server data-access layer checks identity + active-admin + AAL2 before
   rendering protected data or accepting a mutation.
5. Postgres RLS + Storage policies repeat the active-admin + AAL2 checks, so
   bypassing the UI or invoking an action directly still fails.

No application-level role stored only in cookies/localStorage/user_metadata.

## Central guard

`src/lib/auth/require-admin.ts` — `requireAdmin({ aal2 })`:
- `auth.getUser()` verifies the access token server-side (subject = Auth UUID).
  NEVER `getSession()` / an unverified cookie.
- `rpc('is_active_admin')` — SECURITY DEFINER checks `auth.uid()` against the
  active allow-list. Generic failure for inactive + non-admin + unauthenticated
  (no enumeration).
- `auth.mfa.getAuthenticatorAssuranceLevel()` — verified current AAL; CMS
  requires `aal2`.
- Returns a minimal typed `AdminPrincipal`. Page loaders redirect
  (`requireAdminOrRedirect`); actions/handlers receive a typed `AuthFailure`.

## SSR / cookie pattern

- Browser client: `src/lib/supabase/browser-client.ts`
  (`createBrowserClient`, publishable key only).
- Server client: `src/lib/supabase/server-client.ts` (`getServerClient` using
  async `cookies()`, Next 16).
- `src/middleware.ts` refreshes expired tokens + propagates response cookies.
  The matcher excludes static assets/images/sitemap/robots/api. Middleware is
  an early routing convenience, NOT the sole authorization barrier.

## Route matrix (App Router)

| Route | Guard |
| --- | --- |
| `/admin/login` | public (redirects AAL2 admins to `/admin`) |
| `/admin/mfa/enroll` | active admin (AAL1 ok) |
| `/admin/mfa/challenge` | active admin (AAL1 ok) |
| `/admin/password-recovery` | public form (generic response) |
| `/admin` (dashboard) | AAL2 |
| `/admin/products`, `/admin/products/new`, `/admin/products/[id]`, `/admin/products/[id]/preview`, `/admin/taxonomies`, `/admin/audit`, `/admin/security` | AAL2 |

All admin routes: `noindex,nofollow` metadata + `force-dynamic` (no-store). The
admin area is NOT in public navigation or the sitemap. Unauthorized requests
redirect or nondisclosing 401/403 — protected data never streams before auth.

## Login / MFA / recovery / logout

- **Login** (`LoginForm`, client): `signInWithPassword`; generic
  non-enumerating errors. On success routes through the guard → MFA.
- **MFA enroll** (`mfa-enroll-form.tsx`): `auth.mfa.enroll({factorType:'totp'})`;
  QR rendered LOCALLY from the TOTP URI via `qrcode` (the secret never goes to
  image/analytics/logs). After `verify`, the secret is cleared from state.
- **MFA challenge** (`mfa-challenge-form.tsx`): lists verified TOTP factors,
  challenges one, verifies the 6-digit code → AAL2.
- **Password recovery**: `auth.resetPasswordForEmail` with an allow-listed
  same-origin callback; always the same generic response; recovered admin must
  complete MFA before CMS access.
- **Logout**: POST Server Action (`actions.ts` `logout`); clears the session;
  redirects to `/admin/login`.

## Rate limits + hosted settings

- Use Supabase Auth's real endpoint rate limits (not a per-process JS map).
- Disable public sign-up + unused OAuth/phone/anonymous providers (hosted
  Dashboard). Strong password + leaked-password protection when supported.
- MFA settings + Auth rate limits configured in the hosted project.
- Secure custom SMTP before relying on password recovery in production.

## Provisioning + break-glass

- Provision the first admin out-of-band via the Supabase Dashboard or a
  server-only operator script that refuses browser execution, reads secrets
  from env/stdin, never logs the password/token, is safe to rerun, and is
  never a public route. Uses the Supabase admin API on a trusted machine.
- Break-glass for a lost TOTP factor: out-of-band, audited
  disable/reprovision of the account (do NOT bypass AAL2).

## Honest blockers (sandbox)

No Docker/Supabase CLI → the live Auth/MFA/AAL2/Storage/RLS/pgTAP/E2E
verification could not run here. Admin pages render honest "not available"
states when Supabase is unlinked. The committed SQL (`0005_admin_cms.sql`) +
pgTAP tests are the production source of truth; run `supabase db reset` +
`supabase db test` against a linked project.
