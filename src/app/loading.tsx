import { Container, Section } from "@/components/site/container";
import { SkeletonGrid } from "@/components/site/state";

/** Global loading skeleton shown while a route segment is loading. */
export default function Loading() {
  return (
    <Section className="py-12 sm:py-16 lg:py-20">
      <Container>
        <div className="flex flex-col gap-4 max-w-2xl">
          <div className="h-4 w-24 rounded bg-surface-inset animate-pulse" />
          <div className="h-9 w-3/4 rounded bg-surface-inset animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-surface-inset animate-pulse" />
        </div>
        <div className="mt-8">
          <SkeletonGrid count={4} />
        </div>
      </Container>
    </Section>
  );
}
