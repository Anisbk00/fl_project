# TRUST CONTENT

Step 7 module. See the corresponding pure-logic module in `src/features/` + the SQL migration `0008_trust_and_growth.sql`.

## Architecture
The pure-logic domain is implemented and unit-tested (287 total tests). The SQL migration defines the tables + RLS + constraints (committed, unrunnable in the sandbox). The live data layer + admin UI + E2E verification are documented blockers (no live Supabase/Stripe/Resend).

## Key invariants
- All public mutations are schema-validated, size-bounded, abuse-controlled, durably rate-limited, non-enumerating, CSRF-protected.
- No fake reviews, ratings, testimonials, urgency, scarcity, or trust badges.
- All prices/discounts use integer minor units + lowercase ISO currency codes.
- Buyer accounts, bulk marketing, optional analytics, live charging, and production deployment remain unimplemented.
