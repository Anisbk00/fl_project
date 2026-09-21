# Release Candidate Audit

## Status: `READY BUT AWAITING OWNER AUTHORIZATION`

The codebase is complete through Step 9. All sandbox-verifiable checks pass
(lint, typecheck, 321 tests, dev boot). Every external action that requires
live infrastructure or owner authorization is documented as a `blocked` or
`not authorized` gate below.

## Unresolved Blockers

| Blocker | Severity | Owner | Evidence Required | Blocks Deployment | Blocks Charging | Blocks Email | Blocks Launch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| No production Supabase project | critical | REQUIRES_HUMAN_OWNER | Provision a production Supabase project; verify plan/region/backups/PITR/RLS | yes | yes | yes | yes |
| No production Stripe live mode | critical | REQUIRES_HUMAN_OWNER | Verify merchant profile, payouts, bank, Radar, payment methods, tax | yes | yes | — | yes |
| No production Resend account | critical | REQUIRES_HUMAN_OWNER | Verify domain ownership, SPF/DKIM/DMARC, From/Reply-To, webhook | — | yes | yes | yes |
| No production Vercel project | critical | REQUIRES_HUMAN_OWNER | Provision production Vercel project with minute-level cron plan | yes | — | yes | yes |
| No production DNS/domain | critical | REQUIRES_HUMAN_OWNER | Verify domain ownership, registrar, DNS, TLS, CAA, HSTS | yes | — | — | yes |
| No production admin provisioned | critical | REQUIRES_HUMAN_OWNER | Out-of-band admin provisioning, TOTP, AAL2 verification | — | yes | yes | yes |
| Legal/tax/market review incomplete | critical | REQUIRES_HUMAN_OWNER | Reviewed terms, privacy, refund, license, tax registrations, market rules | yes | yes | — | yes |
| No monitoring/alerting owner | critical | REQUIRES_HUMAN_OWNER | Operational owners, escalation, alert routing tested | — | yes | yes | yes |
| No backup/restore drill | critical | REQUIRES_HUMAN_OWNER | Isolated restore drill, RPO/RTO measured | — | yes | — | yes |
| No real assistive-technology test | warning | REQUIRES_HUMAN_OWNER | NVDA/VoiceOver smoke test in Step 9 | — | — | — | no (partial) |
| No live purchase smoke test | critical | REQUIRES_HUMAN_OWNER | One approved low-value purchase/refund/download test | — | yes | yes | yes |
| Sandbox environment limitation | info | Z.ai Code | No Docker/Supabase CLI/Stripe keys/Resend keys/Vercel production plan | — | — | — | no (preparation complete) |

## Steps 1-8 Summary

| Step | Status | Tests | Notes |
| --- | --- | --- | --- |
| 1 | ✅ complete | env, redact, visibility, publish-constraint | Foundation + secure catalog data layer |
| 2 | ✅ complete | price, view-models, fixtures, nav | Brand system + storefront shell |
| 3 | ✅ complete | url-params, sort, mapping, markdown, seo, audio | Live catalog + filters + SEO + audio |
| 4 | ✅ complete | lifecycle, readiness, concurrency, uploads | Admin auth + CMS architecture |
| 5 | ✅ complete | money, cart-fingerprint, payments-domain | Guest cart + Stripe checkout |
| 6 | ✅ complete | crypto, policy | Secure fulfillment + delivery email |
| 7 | ✅ complete | legal-revisions, reviews, bundles, pricing, consent, recommendations | Trust + legal + reviews + growth |
| 8 | ✅ complete | hardening (correlation, redaction, CSP, SLO, abuse) | Observability + security + performance + a11y |
| 9 | ✅ preparation complete | config-validation | Production deployment + release (preparation only; live verification blocked) |

## Total: 321 tests pass / 4 skip / 0 fail
