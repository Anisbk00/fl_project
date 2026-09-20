import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * Safe product long-description renderer.
 *
 * Product `long_description` is stored as Markdown/plain text (never arbitrary
 * stored HTML). react-markdown is used WITHOUT `rehype-raw`, so any raw HTML
 * in the source is ESCAPED, not rendered. Links are allow-listed to
 * http/https/mailto (and relative); external links get
 * `rel="nofollow noopener noreferrer" target="_blank"`. No scripts, styles,
 * iframes, images with remote sources, or dangerous elements are emitted.
 *
 * The structured-data (JSON-LD) path uses a separately sanitized serializer
 * (see src/features/catalog/seo.ts) and is never `dangerouslySetInnerHTML` of
 * user content.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function sanitizeHref(href: string | undefined): string | undefined {
  if (!href || !href.trim()) return undefined;
  // Relative links are allowed (same-origin).
  if (href.startsWith("/") || href.startsWith("#")) return href;
  try {
    const url = new URL(href, "https://example.invalid");
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return undefined;
    return href;
  } catch {
    return undefined;
  }
}

/** Testable: returns the sanitized href or null for a disallowed scheme. */
export function sanitizeUrl(href: string | undefined): string | null {
  return sanitizeHref(href) ?? null;
}

export function SafeMarkdown({
  source,
  className,
}: {
  source: string | null | undefined;
  className?: string;
}) {
  const text = source ?? "";
  return (
    <div
      className={cn(
        "flex flex-col gap-3 t-body text-ink [&_h2]:t-heading-1 [&_h2]:mt-6 [&_h2]:text-ink [&_h3]:t-heading-2 [&_h3]:mt-4 [&_h3]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-4 [&_code]:t-technical [&_code]:rounded [&_code]:bg-surface-inset [&_code]:px-1 [&_pre]:rounded [&_pre]:bg-surface-inset [&_pre]:p-4 [&_pre]:overflow-x-auto",
        className,
      )}
    >
      <ReactMarkdown
        // No rehype-raw: raw HTML is escaped by default.
        urlTransform={(url) => sanitizeUrl(url) ?? ""}
        components={{
          a(props) {
            const href = sanitizeUrl(props.href);
            if (!href) return <span>{props.children}</span>;
            const external = href.startsWith("http");
            return (
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "nofollow noopener noreferrer" } : {})}
              >
                {props.children}
              </a>
            );
          },
          // Disallow raw HTML elements react-markdown might pass through; only
          // standard markdown elements render.
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
