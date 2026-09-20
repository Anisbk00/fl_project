import { Container, Section, Grid } from "@/components/site/container";
import { SkeletonCard } from "@/components/site/state";

export default function Loading() {
  return (
    <Section className="py-12 sm:py-16 lg:py-20">
      <Container>
        <div className="flex flex-col gap-4 max-w-2xl">
          <div className="h-4 w-24 rounded bg-surface-inset animate-pulse" />
          <div className="h-9 w-3/4 rounded bg-surface-inset animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-surface-inset animate-pulse" />
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[18rem_1fr]">
          <div className="hidden lg:block h-96 rounded-xl border border-line bg-surface p-5 animate-pulse" />
          <Grid min="16rem">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </Grid>
        </div>
      </Container>
    </Section>
  );
}
