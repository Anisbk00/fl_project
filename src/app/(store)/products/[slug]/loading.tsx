import { Container, Section } from "@/components/site/container";

export default function Loading() {
  return (
    <Section className="py-12 sm:py-16 lg:py-20">
      <Container>
        <div className="flex flex-col gap-4 max-w-2xl">
          <div className="h-4 w-24 skeleton" />
          <div className="h-9 w-3/4 skeleton" />
          <div className="h-4 w-1/2 skeleton" />
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.05fr]">
          <div className="aspect-[4/3] rounded-xl border border-line skeleton" />
          <div className="flex flex-col gap-4">
            <div className="h-6 w-1/3 skeleton" />
            <div className="h-10 w-3/4 skeleton" />
            <div className="h-32 w-full skeleton" />
          </div>
        </div>
      </Container>
    </Section>
  );
}
