import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState, ErrorState } from "@/components/site/state";
import { Button, LinkButton } from "@/components/site/button";
import { formatPrice } from "@/components/site/price";
import { getCart, type Cart } from "@/features/cart/cart";
import { logError } from "@/lib/observability/logger";
import { checkoutAction, removeFromCartAction } from "./actions";

export const metadata: Metadata = {
  title: "Cart",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  cancelled: "Checkout was cancelled. Nothing was charged — your cart is still here.",
  empty_cart: "Your cart is empty.",
  unavailable: "That product isn't available right now.",
  unavailable_items: "Some items are no longer available. Remove them to continue.",
  no_deliverable: "One of these items can't be delivered right now. Remove it or try again later.",
  mixed_currency: "Items priced in different currencies must be bought in separate orders.",
  cart_full: "Your cart is full. Check out or remove an item first.",
  invalid_product: "That product couldn't be added.",
  payment_in_progress: "Your payment for this cart is being confirmed. Check your email for your downloads.",
  live_payments_disabled: "Checkout is temporarily unavailable.",
  misconfigured: "Checkout is temporarily unavailable.",
  checkout_unavailable: "Checkout couldn't be started. Please try again in a moment.",
  rate_limited: "Too many requests. Please wait a minute and try again.",
  consent_required: "Please accept the terms and confirm immediate delivery to continue.",
};

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkout?: string }>;
}) {
  const sp = await searchParams;
  const notice = sp.checkout === "cancelled" ? MESSAGES.cancelled : sp.error ? MESSAGES[sp.error] : undefined;

  let cart: Cart | null = null;
  let failed = false;
  try {
    cart = await getCart();
  } catch (e) {
    failed = true;
    logError("cart.load_failed", { reasonCode: e instanceof Error ? e.message : "unknown" });
  }

  const lines = cart?.lines ?? [];
  const available = lines.filter((l) => l.available);
  const currencies = [...new Set(available.map((l) => l.currency))];
  const total = available.reduce((sum, l) => sum + (l.price ?? 0), 0);
  const canCheckout = available.length > 0 && available.length === lines.length && currencies.length === 1;

  return (
    <Section className="py-12 sm:py-16 lg:py-20">
      <Container>
        <SectionHeading eyebrow="Cart" title="Your cart" as="h1" />
        {notice ? <p role="status" className="mt-6 max-w-2xl rounded-md border border-line p-3 t-body-sm text-ink-secondary">{notice}</p> : null}

        {failed ? (
          <div className="mt-8 max-w-md">
            <ErrorState title="Couldn't load your cart" description="Something went wrong on our side. Please try again in a moment." />
          </div>
        ) : lines.length === 0 ? (
          <div className="mt-8 max-w-md">
            <EmptyState
              icon={<ShoppingCart className="h-8 w-8" />}
              title="Your cart is empty"
              description="Browse the catalog to add production resources."
              action={<LinkButton href="/catalog" variant="primary">Browse the catalog</LinkButton>}
            />
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
            <ul className="flex flex-col gap-3" aria-label="Cart items">
              {lines.map((line) => (
                <li key={line.productId} className="rounded-xl border border-line bg-surface p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    {line.available ? (
                      <Link href={`/products/${line.slug}`} className="t-label text-ink hover:underline break-words">{line.title}</Link>
                    ) : (
                      <p className="t-label text-ink-muted">{line.title}</p>
                    )}
                    <p className="t-caption text-ink-muted">
                      {line.available && line.price !== null && line.currency
                        ? formatPrice(line.price, line.currency)
                        : "No longer available — remove to continue"}
                    </p>
                  </div>
                  <form action={removeFromCartAction}>
                    <input type="hidden" name="productId" value={line.productId} />
                    <Button type="submit" size="sm" variant="outline" aria-label={`Remove ${line.title} from cart`}>Remove</Button>
                  </form>
                </li>
              ))}
            </ul>

            <aside className="rounded-xl border border-line bg-surface p-5 h-fit" aria-label="Order summary">
              <h2 className="t-heading-2 text-ink">Summary</h2>
              <dl className="mt-4 flex justify-between t-body text-ink">
                <dt>Total</dt>
                <dd className="font-semibold">
                  {currencies.length === 1 ? formatPrice(total, currencies[0]!) : "—"}
                </dd>
              </dl>
              <p className="mt-2 t-caption text-ink-muted">
                Final price and any applicable tax are confirmed on the secure Stripe payment page.
              </p>
              {currencies.length > 1 ? <p className="mt-3 t-caption text-danger">{MESSAGES.mixed_currency}</p> : null}
              <form action={checkoutAction} className="mt-5 flex flex-col gap-4">
                <label className="flex items-start gap-3 t-caption text-ink-secondary">
                  <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" />
                  <span>
                    I agree to the <Link href="/legal/terms" className="underline hover:text-ink">Terms</Link> and{" "}
                    <Link href="/legal/license" className="underline hover:text-ink">License</Link>, and I request immediate
                    access to the digital files. I understand I lose my right of withdrawal once delivery begins (see{" "}
                    <Link href="/legal/refunds" className="underline hover:text-ink">Refunds</Link>).
                  </span>
                </label>
                <Button type="submit" className="w-full" disabled={!canCheckout}>Checkout securely</Button>
              </form>
              <p className="mt-3 t-caption text-ink-muted">
                No account needed. Your files are delivered by email after payment.
              </p>
            </aside>
          </div>
        )}
      </Container>
    </Section>
  );
}
