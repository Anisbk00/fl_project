import { LegalDraft, legalMetadata } from "@/components/site/legal-draft";

export const metadata = legalMetadata("Refunds");

export default function RefundsPage() {
  return (
    <LegalDraft title="Refunds (draft)" lastUpdated="2026-09-19">
      <h2>Digital content</h2>
      <p>
        [Draft] Products are digital and delivered electronically. Because
        access is immediate and the content can be copied, the right of
        withdrawal may be limited once delivery begins, consistent with
        applicable digital-content rules in your jurisdiction.
      </p>
      <h2>When a refund may apply</h2>
      <ul>
        <li>The delivered files are materially defective or not as described.</li>
        <li>Access was never granted due to a fault on our side.</li>
        <li>Required by consumer law in your jurisdiction.</li>
      </ul>
      <h2>How to request</h2>
      <p>
        [Draft] Write to the support address on the contact page with your order
        reference. Refund requests are reviewed case by case.
      </p>
      <h2>Statutory rights</h2>
      <p>
        Nothing here limits statutory consumer rights that cannot be excluded
        under the laws of your country of residence.
      </p>
    </LegalDraft>
  );
}
