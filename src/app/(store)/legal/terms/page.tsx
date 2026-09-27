import Link from "next/link";
import { LegalPage, SupportContact, legalMetadata } from "@/components/site/legal-page";
import { siteConfig } from "@/lib/site-config";

export const metadata = legalMetadata(
  "Terms of Sale",
  "The terms that apply when you buy or download products from the store.",
);

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Sale" lastUpdated="2026-09-27">
      <h2>1. Who we are</h2>
      <p>
        These terms apply to purchases and free downloads from {siteConfig.name} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;). You can reach us at <SupportContact />. By placing an order or downloading a product
        you accept these terms.
      </p>

      <h2>2. Products</h2>
      <p>
        We sell digital products: DAW project files, stems, MIDI and sample packs. Each product page lists its
        format, compatible software and versions, and license type. Please check compatibility before you buy.
        Third-party software and plugins are not included unless the product page says so.
      </p>

      <h2>3. Prices and payment</h2>
      <p>
        Prices are shown in the currency on the product page. Any tax is calculated and shown on the secure
        payment page before you pay. Payments are processed by Stripe; we never see or store your card details.
        A contract is formed when your payment is confirmed.
      </p>

      <h2>4. Delivery</h2>
      <p>
        No account is needed. After payment we email a secure, time-limited link to the address you give at
        checkout. Download links expire and each file can be downloaded a limited number of times, so save your
        files once downloaded. If your link expires, you can request a new one from the downloads page.
      </p>

      <h2>5. Right of withdrawal</h2>
      <p>
        Because the files are delivered immediately, at checkout you ask for immediate delivery and accept that
        you lose your statutory right of withdrawal once delivery begins. See our{" "}
        <Link href="/legal/refunds">Refund Policy</Link> for when refunds still apply.
      </p>

      <h2>6. License</h2>
      <p>
        Products are licensed, not sold. Your use is governed by our <Link href="/legal/license">License</Link>.
        Sharing, reselling or redistributing the files is not allowed.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        All original content remains ours or our licensors&rsquo;. DAW and plugin names are trademarks of their
        owners, used only to describe compatibility. We are not affiliated with them.
      </p>

      <h2>8. Misuse</h2>
      <p>We may revoke download access for orders involving fraud, chargebacks, or a breach of the License.</p>

      <h2>9. Liability</h2>
      <p>
        We supply products with reasonable care and as described. To the extent the law allows, we are not liable
        for indirect or consequential loss, and our total liability for an order is limited to the amount you paid
        for it. Nothing in these terms limits liability that cannot be limited by law, or your statutory consumer
        rights.
      </p>

      <h2>10. Changes</h2>
      <p>We may update these terms. The version in force when you place an order applies to that order.</p>
    </LegalPage>
  );
}
