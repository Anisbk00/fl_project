"use client";

import { useEffect } from "react";
import { Container, Section } from "@/components/site/container";
import { ErrorState } from "@/components/site/state";
import { Button, LinkButton } from "@/components/site/button";

/**
 * Route-level error boundary (rendered within the root layout, so the header,
 * footer, and skip link remain). Logs the error to the console for
 * development visibility and offers a recovery action. Never logs secrets.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Development-only visibility. No secrets are included in the message.
    console.error("Route error:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <Section className="py-20 sm:py-28">
      <Container>
        <ErrorState
          title="Something went wrong"
          description={
            <>
              An unexpected error occurred while rendering this page. You can
              try again, or return to a known route.
              {error.digest ? (
                <span className="block mt-1 t-technical text-ink-muted">
                  Reference: {error.digest}
                </span>
              ) : null}
            </>
          }
          action={
            <div className="flex gap-3">
              <Button onClick={() => reset()}>Try again</Button>
              <LinkButton href="/" variant="outline">
                Back home
              </LinkButton>
            </div>
          }
        />
      </Container>
    </Section>
  );
}
