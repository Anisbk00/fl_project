import { LegalDraft, legalMetadata } from "@/components/site/legal-draft";

export const metadata = legalMetadata("Terms");

export default function TermsPage() {
  return (
    <LegalDraft title="Terms (draft)" lastUpdated="2026-09-19">
      <h2>Acceptance</h2>
      <p>
        [Draft] By using the store you agree to these terms. If you do not agree,
        do not use the service.
      </p>
      <h2>Use of content</h2>
      <p>
        Content is licensed, not sold. Your use is governed by the product's
        license (see /legal/license). You must not redistribute raw files.
      </p>
      <h2>Intellectual property</h2>
      <p>
        Original content is owned by the store operator. Third-party trademarks
        (DAW and plugin names) are referenced for compatibility only and are not
        affiliated with this store.
      </p>
      <h2>Liability</h2>
      <p>
        [Draft] To the maximum extent permitted by law, the service is provided
        "as is" without warranty. Liability for digital content is limited as
        permitted by applicable consumer law.
      </p>
      <h2>Changes</h2>
      <p>
        [Draft] These terms may be updated; material changes will be reflected
        by the updated date above.
      </p>
    </LegalDraft>
  );
}
