# Tax and Checkout Legal

Engineering safeguards, NOT legal or tax advice. Merchant country, legal
entity, and target-market obligations are NOT yet approved.

## Consent plumbing (versioned)
- Pre-Checkout acknowledgement bound to the exact cart fingerprint +
  policy version; required re-consent on change; server-enforced (bypassing the
  checkbox cannot create a Session).
- `consent_collection.terms_of_service=required` only with an approved Terms URL
  + Stripe account setting + policy. Test placeholder labels are marked
  not-legally-approved.

## Tax boundary
- Stripe Tax `automatic_tax.enabled` only when Tax is activated + merchant
  registrations/settings complete + product tax codes reviewed + price tax
  behavior explicit + sandbox tests pass.
- When tax is unconfigured: no fabricated tax amount; no "includes/excludes
  tax" claim.
- Reconcile Stripe subtotal/tax/total against the trusted subtotal (integer
  minor units). No Adaptive Pricing.

## Live-release blockers (fail-closed)
- Terms, privacy, refund, customer license, digital-content consent wording,
  policy version registry, business identity/contact, checkout button wording.
- Step 6 fulfillment not ready. Approved tax configuration. Production secrets.
- Monitoring. Release checklist.
- `LIVE_CHECKOUT_ENABLED` alone does NOT enable live charges; an accidental live
  key is refused until every gate is intentionally set (`live-gate.ts`).

## Unresolved
Statutory financial-record retention period — pending legal review.
