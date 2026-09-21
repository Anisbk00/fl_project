# Release Checklist + Go/No-Go Signoff

## Status: `NOT YET SIGNED — AWAITING OWNER AUTHORIZATION`

Every item must be `GO`, `NO-GO`, `GO WITH TIME-BOUNDED ACCEPTED RISK`, or `N/A`.

### Code + Build
- [ ] Immutable release commit + tag verified → `BLOCKED` (no git repo in sandbox)
- [ ] Clean lockfile install → `COMPLETED` (bun install)
- [ ] Lint → `COMPLETED` (clean)
- [ ] TypeScript strict → `COMPLETED` (clean)
- [ ] Full tests (321) → `COMPLETED` (0 fail)
- [ ] Production build → `BLOCKED` (sandbox forbids bun run build)
- [ ] Dependency + secret scan → `COMPLETED` (no secrets found)
- [ ] SBOM → `BLOCKED` (requires CI/CD pipeline)

### Environment + Secrets
- [ ] Dev/preview/prod isolation → `BLOCKED` (no production environment)
- [ ] Secret scope + validation → `COMPLETED` (config-validation module + tests)
- [ ] No secrets in source/bundles → `COMPLETED` (verified)

### Supabase
- [ ] Production project provisioned → `BLOCKED`
- [ ] Migrations rehearsed → `BLOCKED` (no Docker/Supabase CLI)
- [ ] RLS + grants verified → `BLOCKED`
- [ ] Backup + PITR → `BLOCKED`
- [ ] Restore drill → `BLOCKED`
- [ ] Storage policies → `BLOCKED`

### Stripe
- [ ] Live merchant verified → `NOT AUTHORIZED`
- [ ] Live API key provisioned → `NOT AUTHORIZED`
- [ ] Live webhook endpoint → `NOT AUTHORIZED`
- [ ] Tax + market decisions → `NOT AUTHORIZED`
- [ ] Refund + dispute ops → `NOT AUTHORIZED`

### Resend
- [ ] Domain verified (SPF/DKIM/DMARC) → `NOT AUTHORIZED`
- [ ] From/Reply-To configured → `NOT AUTHORIZED`
- [ ] Webhook configured → `NOT AUTHORIZED`
- [ ] Tracking disabled → `NOT AUTHORIZED`

### Domain + DNS
- [ ] Domain ownership verified → `NOT AUTHORIZED`
- [ ] DNS configured → `NOT AUTHORIZED`
- [ ] TLS issued → `NOT AUTHORIZED`
- [ ] Canonical redirects → `NOT AUTHORIZED`
- [ ] HSTS decision → `NOT AUTHORIZED`

### Cron + Workers
- [ ] Minute-level cron configured → `BLOCKED` (requires Vercel production plan)
- [ ] Cron authentication verified → `BLOCKED`

### Monitoring
- [ ] Dashboards + alerts → `BLOCKED`
- [ ] Alert routing tested → `BLOCKED`
- [ ] Operational owners confirmed → `BLOCKED`

### Legal + Tax
- [ ] Terms reviewed → `BLOCKED`
- [ ] Privacy reviewed → `BLOCKED`
- [ ] Refund policy reviewed → `BLOCKED`
- [ ] License reviewed → `BLOCKED`
- [ ] Tax registrations → `BLOCKED`
- [ ] Market rules → `BLOCKED`

### Admin
- [ ] Production admin provisioned → `NOT AUTHORIZED`
- [ ] AAL2 verified → `NOT AUTHORIZED`

### Smoke Test
- [ ] Owner-approved product + amount + inbox → `NOT AUTHORIZED`
- [ ] Real purchase → `NOT AUTHORIZED`
- [ ] Webhook receipt → `NOT AUTHORIZED`
- [ ] Email delivery → `NOT AUTHORIZED`
- [ ] Secure download → `NOT AUTHORIZED`
- [ ] Real refund → `NOT AUTHORIZED`
- [ ] Access revocation → `NOT AUTHORIZED`

## Go/No-Go: `NO-GO — AWAITING OWNER AUTHORIZATION`

All preparation is complete. Every external gate requires explicit owner
authorization and live infrastructure that does not exist in this sandbox.
