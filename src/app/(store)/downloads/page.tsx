import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState, ErrorState } from "@/components/site/state";
import { Button, LinkButton } from "@/components/site/button";
import { currentSession, listDownloads } from "@/features/fulfillment/downloads";
import { logError } from "@/lib/observability/logger";

export const metadata: Metadata = {
  title: "Your downloads",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  denied: "That file isn't available in this session. Open the link from your email again.",
  quota_exhausted: "You've reached the download limit for this file. Contact support if you need another copy.",
  rate_limited: "Too many download requests. Wait a few minutes and try again.",
  unavailable: "The download couldn't be prepared right now. Please try again shortly.",
};

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default async function DownloadsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const errorText = error ? ERRORS[error] : undefined;

  let data: Awaited<ReturnType<typeof listDownloads>> | null = null;
  let failed = false;
  try {
    const session = await currentSession();
    if (session) data = await listDownloads(session.orderId);
  } catch (e) {
    failed = true;
    logError("download.page_failed", { reasonCode: e instanceof Error ? e.message : "unknown" });
  }

  return (
    <Section className="py-16">
      <Container>
        <div className="max-w-2xl mx-auto">
          {failed ? (
            <ErrorState title="Couldn't load your downloads" description="Something went wrong on our side. Please try again in a moment." />
          ) : !data ? (
            <EmptyState
              title="Your download session has ended"
              titleAs="h1"
              description="For security, download sessions last 30 minutes. Open the “Continue to downloads” link in your purchase email to start a new one."
              action={<LinkButton href="/downloads/access" variant="outline">I have an access code</LinkButton>}
            />
          ) : (
            <>
              <SectionHeading eyebrow={`Order ${data.orderNumber}`} title="Your downloads" as="h1" />
              {errorText ? <p role="alert" className="mt-6 rounded-md border border-danger/40 p-3 t-body-sm text-danger">{errorText}</p> : null}
              {data.items.length === 0 ? (
                <p className="mt-6 t-body-sm text-ink-secondary">This order has no downloadable files. Please contact support.</p>
              ) : (
                <ul className="mt-8 flex flex-col gap-4">
                  {data.items.map((item) => (
                    <li key={item.entitlementId} className="rounded-xl border border-line bg-surface p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="t-label text-ink break-words">{item.title}</p>
                        <p className="t-caption text-ink-muted break-all">
                          {item.filename} · {formatBytes(item.bytes)}
                          {item.state === "active" ? ` · ${item.remaining} download${item.remaining === 1 ? "" : "s"} left` : ""}
                        </p>
                      </div>
                      {item.state === "active" && item.remaining > 0 ? (
                        <form method="post" action="/api/downloads/file">
                          <input type="hidden" name="entitlementId" value={item.entitlementId} />
                          <Button type="submit" size="sm" aria-label={`Download ${item.title}`}>Download</Button>
                        </form>
                      ) : (
                        <p className="t-caption text-ink-muted">
                          {item.state === "held" ? "Temporarily unavailable — contact support." : item.state === "revoked" ? "No longer available." : "Download limit reached."}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-8 t-caption text-ink-muted">
                Each download link is created when you click and expires after two minutes. Links are personal — please don’t share them.
              </p>
            </>
          )}
        </div>
      </Container>
    </Section>
  );
}
