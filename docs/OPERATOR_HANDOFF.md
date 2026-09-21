# Operator Handoff

## Release ID
- Commit: `sandbox-build` (no git repo)
- Tag: `step-9-preparation`
- Status: `READY BUT AWAITING OWNER AUTHORIZATION`

## Architecture Links
- `docs/ARCHITECTURE.md` — end-state topology
- `docs/SECURITY.md` — threat model + RLS + controls
- `docs/ROADMAP.md` — Steps 1-9 complete (Step 9 preparation only)

## Environment Owners
All items: `REQUIRES_HUMAN_OWNER`

## Daily Checks
- [ ] Dashboard: 5xx, latency, Checkout errors
- [ ] Webhook backlog + dead letters
- [ ] Fulfillment latency (p50/p95, under 60s)
- [ ] Email bounce/complaint/suppression
- [ ] Cost alerts (Vercel, Supabase, Stripe, Resend)

## Weekly Checks
- [ ] Stripe reconciliation (payments, refunds, disputes)
- [ ] Resend reconciliation (delivery, bounce, suppression)
- [ ] Database: connections, locks, slow queries, bloat
- [ ] Storage: egress, bucket policies, orphan cleanup
- [ ] Backup verification (PITR point exists)

## Monthly Checks
- [ ] Dependency updates + vulnerability scan
- [ ] Key rotation calendar (Stripe, Resend, fulfillment keys, cron secret)
- [ ] Legal/policy review calendar
- [ ] Accessibility regression
- [ ] Performance regression (Lighthouse, CWV)
- [ ] Security review (RLS, advisors, ASVS)

## Incident Contacts
- All: `REQUIRES_HUMAN_OWNER` — no real on-call has been established.

## Accepted Risks
None accepted — all gates are `BLOCKED` or `NOT AUTHORIZED`.

## Disaster Recovery
- Database: PITR (Supabase plan-dependent — BLOCKED)
- Storage: separate backup/version/export strategy (BLOCKED)
- Stripe: provider-side data (reconcile, not restore)
- Resend: provider-side delivery events (reconcile, not restore)
- Restore drill: NOT YET PERFORMED (BLOCKED)
