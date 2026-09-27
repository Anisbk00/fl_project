# Deployment runbook

Do these in order. Use **separate** Supabase projects, Stripe modes and webhook secrets for Preview and Production — never point Production at test services or Preview at the production database.

## 1. Supabase

1. Create the production project (region close to your customers).
2. **Auth → Providers → Email:** turn **off** "Allow new users to sign up". Customers never have accounts; only admins you create should exist.
3. **Auth → Password security:** enable leaked-password protection and a minimum length of at least 12.
4. **Auth → MFA:** keep TOTP enabled (the admin area requires AAL2).
5. **Auth → URL configuration:** Site URL = your production origin; add `https://<domain>/control-7f3a9b2c/**` to redirect URLs.
6. Apply the schema from this repo:
   ```bash
   supabase link --project-ref <prod-ref>
   supabase db push          # applies supabase/migrations/0001…0016 in order
   ```
   Never paste SQL into the dashboard: anything not in `supabase/migrations/` is drift.
7. Create the first admin: sign up the admin user once from **Auth → Users → Add user**, then run:
   ```sql
   insert into public.admin_users (user_id, display_name) values ('<auth user id>', '<name>');
   ```
   The admin enrolls TOTP on first login at `/control-7f3a9b2c/mfa/enroll`.
8. Check **Advisors → Security**: only "RLS enabled, no policy" INFO notices on `guest_carts`, `guest_cart_items` and `rate_limits` are expected (server-only tables).

> **The existing dev project (`fl_store`)** was bootstrapped by pasting SQL, so its migration history doesn't match the files. Before using `supabase db push` against it, mark the history as applied:
> ```bash
> supabase migration repair --status reverted 20260927102845 20260927103333 20260927103432 20260927105102 20260927105448 20260927112224 20260927112241 <0016 version>
> supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014 0015 0016
> ```
> (List the MCP-applied versions with `supabase migration list`.)

## 2. Stripe

1. Activate the account for live payments (business details, payout bank).
2. **Settings → Payment methods:** enable the methods you want; Checkout shows eligible ones automatically.
3. **Developers → Webhooks → Add endpoint** `https://<domain>/api/stripe/webhook`, subscribed to exactly:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Tax: if you must collect VAT/sales tax, configure Stripe Tax before launch (not enabled in code; totals are reconciled against Stripe's).

## 3. Resend

1. Add and verify your sending domain (SPF, DKIM, and a DMARC record).
2. Create an API key with **sending access only** → `RESEND_API_KEY`.
3. `RESEND_FROM_EMAIL` = an address on the verified domain, e.g. `FL Store <orders@yourdomain.com>`.
4. **Webhooks → Add** `https://<domain>/api/resend/webhook` with `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` → secret into `RESEND_WEBHOOK_SECRET`.

## 4. Vercel

1. Import the repo. Framework: Next.js. Install/build commands come from `vercel.json` (`bun install --frozen-lockfile`, `bun run build`). Node.js version: 24.x.
2. Set every variable from `.env.example`, **scoped per environment** (Production vs Preview). Generate secrets with `openssl rand -hex 32` (`CART_TOKEN_PEPPER`, `FULFILLMENT_ROOT_KEY_HEX`, `CRON_SECRET`).
3. `CHECKOUT_ORIGIN_ALLOWLIST` must contain `NEXT_PUBLIC_SITE_URL` exactly, or checkout refuses to start.
4. Leave `LIVE_CHECKOUT_ENABLED=0` until step 6 passes; live Stripe keys are refused while it is 0.
5. Cron: `vercel.json` runs `/api/cron/fulfillment-drain` every 5 minutes (retries webhooks and emails). **Sub-daily crons need a Vercel Pro plan**; on Hobby they run once a day, which delays email retries (first sends are unaffected; they happen inline after payment).

## 5. Domain

Add the domain in Vercel, set the DNS records it shows, and wait for TLS. Then update `NEXT_PUBLIC_SITE_URL`, `CHECKOUT_ORIGIN_ALLOWLIST`, the Supabase Site URL and both webhook endpoints to the final domain, and redeploy. HSTS (2 years) is sent automatically in production.

## 6. Production verification (before setting `LIVE_CHECKOUT_ENABLED=1`)

Run once end to end with Stripe **test** keys on the production deployment, then once with a small real payment you refund:

- [ ] Buy a product → Stripe → success page shows "Payment confirmed".
- [ ] Delivery email arrives; admin order page shows email `sent` → `delivered`.
- [ ] Access link → download works; the file opens.
- [ ] Stripe Dashboard → **resend** the same `checkout.session.completed` event → still one order, one email.
- [ ] Refund from the admin order page → order `refunded`, download link and session stop working.
- [ ] Cancel on the Stripe page → back to cart, nothing charged, no order.
- [ ] Signed-out visitor opening `/control-7f3a9b2c` is sent to login; a password-only session is sent to MFA.
- [ ] `/api/cron/fulfillment-drain` without the bearer secret returns 401.

## Rollback

- **Code:** Vercel → Deployments → promote the previous deployment (instant).
- **Database:** migrations are forward-only. To undo one, write a new migration that reverses it; restore from Supabase point-in-time recovery only for data loss.
- **Kill switch:** set `LIVE_CHECKOUT_ENABLED=0` and redeploy to stop new live payments while keeping downloads working for existing buyers.
