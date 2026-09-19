import { Container, Section } from "@/components/site/container";
import { LinkButton } from "@/components/site/button";

export default function NotFound() {
  return (
    <Section className="py-20 sm:py-28">
      <Container>
        <div className="flex flex-col items-center gap-5 text-center max-w-md mx-auto">
          <span className="t-eyebrow">Error 404</span>
          <h1 className="t-display text-ink">Page not found</h1>
          <p className="t-body text-ink-secondary">
            The page you were looking for does not exist, or it hasn't been
            built yet. Some routes are intentionally pending until their
            implementation step.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <LinkButton href="/">Back home</LinkButton>
            <LinkButton href="/catalog" variant="outline">
              Browse the catalog
            </LinkButton>
          </div>
        </div>
      </Container>
    </Section>
  );
}
