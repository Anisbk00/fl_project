import { LegalPage, SupportContact, legalMetadata } from "@/components/site/legal-page";

export const metadata = legalMetadata(
  "Refund Policy",
  "When refunds apply to digital downloads, and how to request one.",
);

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" lastUpdated="2026-09-27">
      <h2>Digital downloads</h2>
      <p>
        Products are delivered immediately as downloadable files. At checkout you ask for immediate delivery and
        accept that your statutory right of withdrawal ends once delivery begins. Because files can&rsquo;t be
        &ldquo;returned&rdquo;, we don&rsquo;t offer refunds for change of mind.
      </p>

      <h2>When we will refund</h2>
      <ul>
        <li>The files are faulty, corrupted, or can&rsquo;t be opened in the software listed on the product page, and we can&rsquo;t fix it.</li>
        <li>The product is materially different from its description.</li>
        <li>You were charged but never received access, and we can&rsquo;t resolve it.</li>
        <li>You were charged twice for the same product.</li>
        <li>A refund is otherwise required by consumer law where you live.</li>
      </ul>

      <h2>How to request a refund</h2>
      <p>
        Email <SupportContact /> within 30 days of purchase with the email you used at checkout, the product name,
        and a short description of the problem. We usually reply within 3 business days, and may first offer a fix
        or a replacement file.
      </p>

      <h2>What happens next</h2>
      <p>
        Approved refunds go back to your original payment method through Stripe. Your bank may take 5&ndash;10
        business days to show it. Once refunded, download access for that product is revoked.
      </p>

      <h2>Your statutory rights</h2>
      <p>Nothing in this policy limits consumer rights that can&rsquo;t be excluded under the law of your country.</p>
    </LegalPage>
  );
}
