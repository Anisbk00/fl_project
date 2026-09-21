# Vercel Production Deployment

## Staged Deployment Procedure

1. **Build the immutable release candidate**
   ```bash
   bun install --frozen-lockfile
   bun run lint && bun run typecheck && bun test
   # (bun run build — forbidden in sandbox; run in CI/Vercel)
   ```

2. **Deploy to Vercel preview** (staging Supabase + Stripe sandbox + safe Resend)
   - Use Vercel environment scoping: preview env vars only.
   - Verify: staging canonical origin, staging Supabase, Stripe sandbox keys.
   - Run: E2E, accessibility, Lighthouse, webhook replay, load tests.

3. **Production migration** (after staging verification)
   ```bash
   # Verify the target project fingerprint FIRST.
   supabase migration list  # confirm 0001-0008 applied
   supabase db push         # forward-only; never db reset in production
   supabase gen types       # verify type drift
   ```

4. **Deploy to Vercel production** (production Supabase + live Stripe disabled + production Resend)
   - `LIVE_CHECKOUT_ENABLED=false` — charging remains disabled.
   - Use Vercel environment scoping: production env vars only.
   - Do NOT auto-assign the production domain yet.

5. **Pre-charge checks** (canonical domain, while charging is disabled)
   - DNS, TLS, canonical redirects, headers, CSP, cache, robots, sitemap.
   - Catalog, prices, audio, legal pages, accessibility.
   - RLS, private bucket denial, admin AAL1 denial, admin AAL2 access.
   - Webhook endpoint reachability (no fake signatures).
   - Cron authentication + recovery.
   - Telemetry + secret canary scan.

6. **Owner GO/NO-GO signoff** (second explicit approval)

7. **Enable charging** (audited config change + new deployment)
   - Set `LIVE_CHECKOUT_ENABLED=true` in production Vercel env.
   - Trigger a new deployment to activate.
   - Verify disabled in preview/staging.

8. **Real controlled smoke test**
   - One approved low-value product + payment method + inbox.
   - Collect redacted evidence for the full purchase → email → download → refund → revocation flow.
   - Measure paid-to-provider-accepted latency.
   - Do NOT delete the test order.

9. **Launch + hypercare**
   - Monitor at: launch, 15 min, 1 hour, 24 hours, 72 hours.
   - Reconcile: Stripe, Resend, orders, entitlements, outbox, promotions.
   - Kill switch: `LIVE_CHECKOUT_ENABLED=false` is the fastest containment.

## Rollback
- Application: known-good Vercel deployment (if schema-compatible).
- Database: forward-fix only (never destructive down-migration).
- Charging: kill switch (`LIVE_CHECKOUT_ENABLED=false`) — webhook processing continues.
