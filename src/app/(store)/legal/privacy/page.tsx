import { LegalPage, SupportContact, legalMetadata } from "@/components/site/legal-page";
import { siteConfig } from "@/lib/site-config";

export const metadata = legalMetadata(
  "Privacy Policy",
  "What personal data the store collects, why, how long it's kept, and your rights.",
);

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="2026-09-27">
      <h2>Who is responsible</h2>
      <p>
        {siteConfig.name} is responsible for your personal data. Contact us about privacy at <SupportContact />.
      </p>

      <h2>What we collect, and why</h2>
      <ul>
        <li><strong>Email address</strong>: collected by Stripe at checkout, used to send your download link and order emails (to perform our contract with you).</li>
        <li><strong>Order and download records</strong>: what you bought, when, and download activity, used to deliver, limit and revoke access (contract performance and fraud prevention).</li>
        <li><strong>A one-way hash of your IP address</strong>: kept for up to a day to rate-limit checkout and download requests (our legitimate interest in preventing abuse).</li>
      </ul>
      <p>
        There are no customer accounts. We don&rsquo;t collect your name, postal address or phone number, and we
        never see your card details.
      </p>

      <h2>Cookies</h2>
      <p>
        We use strictly necessary cookies only: a cart cookie (30 days) and a download-session cookie (30
        minutes). No analytics, tracking or advertising cookies are used.
      </p>

      <h2>Who we share data with</h2>
      <ul>
        <li><strong>Stripe</strong>: payment processing.</li>
        <li><strong>Resend</strong>: sending order and download emails.</li>
        <li><strong>Supabase</strong>: database and file hosting.</li>
        <li><strong>Vercel</strong>: website hosting.</li>
      </ul>
      <p>
        These providers process data only on our instructions. Some may process data outside your country; where
        required, they use recognised safeguards such as Standard Contractual Clauses. We never sell your data.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Abandoned carts: deleted after about 30 days.</li>
        <li>IP hashes for rate limiting: about 24 hours.</li>
        <li>Orders and payment records: as long as tax and accounting law requires.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you can ask to access, correct, delete or export your data, or object to or
        restrict its use. Email <SupportContact /> from the address you used at checkout and we&rsquo;ll respond
        within one month. Records we must keep by law can&rsquo;t be deleted early. You can also complain to your
        local data protection authority.
      </p>
    </LegalPage>
  );
}
