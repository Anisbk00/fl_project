import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { LinkButton } from "@/components/site/button";
import { getPrivilegedClient } from "@/lib/supabase/privileged";
import { logError } from "@/lib/observability/logger";

export const metadata: Metadata = {
  title: "Order status",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

type Status = "confirmed" | "processing" | "unknown";

/**
 * Read-only status page. It NEVER marks anything paid — only the verified
 * webhook does. The Stripe session id is an unguessable lookup key; the page
 * reveals only the public order number and whether payment is confirmed.
 */
async function lookup(sessionId: string | undefined): Promise<{ status: Status; orderNumber?: string }> {
  if (!sessionId || !SESSION_ID.test(sessionId)) return { status: "unknown" };
  try {
    const { data, error } = await getPrivilegedClient()
      .from("orders")
      .select("order_number, payment_state")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (error) throw new Error(error.code || "order_status_failed");
    if (data && (data.payment_state === "paid" || data.payment_state === "partially_refunded")) {
      return { status: "confirmed", orderNumber: data.order_number };
    }
    return { status: "processing" };
  } catch (e) {
    logError("checkout.status_failed", { reasonCode: e instanceof Error ? e.message : "unknown" });
    return { status: "processing" };
  }
}

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  const { status, orderNumber } = await lookup(session_id);

  return (
    <Section className="py-20">
      <Container>
        <div className="max-w-xl">
          {status === "confirmed" ? (
            <>
              <SectionHeading eyebrow={`Order ${orderNumber}`} title="Payment confirmed — thank you!" as="h1" />
              <p className="mt-4 t-body text-ink-secondary">
                We’re emailing your download link to the address you entered at checkout. It usually arrives within a
                minute — check your spam folder if you don’t see it.
              </p>
            </>
          ) : status === "processing" ? (
            <>
              <SectionHeading eyebrow="Order status" title="We’re confirming your payment" as="h1" />
              <p className="mt-4 t-body text-ink-secondary">
                Stripe is confirming your payment. Some payment methods take a little longer. As soon as it’s confirmed,
                your download link is emailed to you — you don’t need to keep this page open.
              </p>
              <div className="mt-6">
                <LinkButton href={`/checkout/success?session_id=${encodeURIComponent(session_id ?? "")}`} variant="outline">
                  Check again
                </LinkButton>
              </div>
            </>
          ) : (
            <>
              <SectionHeading eyebrow="Order status" title="We couldn’t find that checkout" as="h1" />
              <p className="mt-4 t-body text-ink-secondary">
                If you completed a payment, your download link will arrive by email. Otherwise, you can return to your cart.
              </p>
              <div className="mt-6"><LinkButton href="/cart" variant="outline">Back to cart</LinkButton></div>
            </>
          )}
        </div>
      </Container>
    </Section>
  );
}
