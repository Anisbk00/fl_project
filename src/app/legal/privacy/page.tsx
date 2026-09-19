import { LegalDraft, legalMetadata } from "@/components/site/legal-draft";

export const metadata = legalMetadata("Privacy");

export default function PrivacyPage() {
  return (
    <LegalDraft title="Privacy (draft)" lastUpdated="2026-09-19">
      <h2>Data minimization</h2>
      <p>
        [Draft] The store is designed to collect as little customer data as
        possible. There are no customer accounts. Checkout is guest-only.
      </p>
      <h2>What is processed</h2>
      <ul>
        <li>A delivery email, collected via Stripe-hosted Checkout.</li>
        <li>Order and access records needed to grant and revoke downloads.</li>
        <li>Aggregated, privacy-aware analytics (configured later).</li>
      </ul>
      <h2>Payment data</h2>
      <p>
        Card data never touches this application. Payment is handled by Stripe,
        a PCI-DSS-compliant processor. We receive only a payment status and an
        identifier, never card details.
      </p>
      <h2>Your rights</h2>
      <p>
        [Draft] You may request access to or erasure of your personal data,
        subject to legal retention obligations. Contact details are on the
        contact page.
      </p>
    </LegalDraft>
  );
}
