import { LegalDraft, legalMetadata } from "@/components/site/legal-draft";

export const metadata = legalMetadata("License");

export default function LicensePage() {
  return (
    <LegalDraft title="License (draft)" lastUpdated="2026-09-19">
      <h2>Grant</h2>
      <p>
        [Draft] The license granted per product depends on its type and is
        summarized on each product page. Original project files and sample packs
        grant a broad commercial-use license for the included audio and
        construction. Educational remakes are licensed for study and
        reverse-engineering, not as masters to release.
      </p>
      <h2>What you may do</h2>
      <ul>
        <li>Use included original audio and MIDI in your own productions.</li>
        <li>Modify, rearrange, and combine the provided materials.</li>
        <li>Release music created with these materials, subject to the product's license tier.</li>
      </ul>
      <h2>What you may not do</h2>
      <ul>
        <li>Resell or redistribute the raw project files, stems, or samples as-is.</li>
        <li>Claim ownership of the underlying original content.</li>
        <li>Use a remake's audio as a release-ready master.</li>
      </ul>
      <h2>Third-party references</h2>
      <p>
        DAW and plugin names referenced for compatibility are trademarks of their
        owners and are not affiliated with this store.
      </p>
    </LegalDraft>
  );
}
