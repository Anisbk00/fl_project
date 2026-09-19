import { serializeJsonLd } from "@/features/catalog/seo";

/**
 * Render sanitized JSON-LD as a single `application/ld+json` script.
 * `serializeJsonLd` escapes `<`, `>`, `&` and line/paragraph separators so
 * stored content cannot break out of the script element.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
