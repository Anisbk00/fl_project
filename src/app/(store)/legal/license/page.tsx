import { LegalPage, SupportContact, legalMetadata } from "@/components/site/legal-page";

export const metadata = legalMetadata(
  "License",
  "What you can and can't do with the project files, stems and samples you download.",
);

export default function LicensePage() {
  return (
    <LegalPage title="License" lastUpdated="2026-09-27">
      <p>
        When you buy or download a product, you get a personal, worldwide, perpetual, non-exclusive,
        non-transferable license to use it as described below. Each product page shows which license type applies.
      </p>

      <h2>Original products (project files, stems, sample packs)</h2>
      <p>You may:</p>
      <ul>
        <li>Use the included audio, MIDI and project content in your own music, including commercial releases, streaming, sync and live performance, royalty-free.</li>
        <li>Edit, rearrange, process and combine the material with your own work.</li>
        <li>Use it in work for clients, as long as the raw files aren&rsquo;t handed over.</li>
      </ul>

      <h2>Educational remakes</h2>
      <p>
        Remakes recreate existing songs for study. You may open, study and learn from them, and use the techniques
        in your own original music. You may <strong>not</strong> release a remake or any audio from it, because the
        underlying song belongs to its original rights holders.
      </p>

      <h2>You may not, for any product</h2>
      <ul>
        <li>Resell, share, give away or upload the files, or any part of them in isolated or lightly edited form.</li>
        <li>Include the material in another sample pack, preset bank, template, loop library or AI training dataset.</li>
        <li>Register the unmodified material with content-ID systems or claim it as your own.</li>
        <li>Transfer this license to someone else.</li>
      </ul>

      <h2>Ownership and ending the license</h2>
      <p>
        We (or our licensors) keep ownership of the material. Music you made before the license ends stays yours to
        use. If you break these terms, the license ends automatically, and you must stop using and delete the files.
      </p>

      <h2>Third-party software</h2>
      <p>
        Projects may reference DAWs or plugins you need to buy separately. Their names are trademarks of their
        owners, used only to describe compatibility.
      </p>

      <h2>Questions</h2>
      <p>Not sure whether your use is covered? Email <SupportContact /> before you release.</p>
    </LegalPage>
  );
}
