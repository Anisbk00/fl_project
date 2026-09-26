import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { ErrorState } from "@/components/site/state";
import { Badge } from "@/components/site/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_ORDERS_PATH } from "@/lib/admin-path";
import { getServerClient } from "@/lib/supabase/server-client";

export const metadata: Metadata = {
  title: "Order detail",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface OrderDetail {
  id: string;
  order_number: string;
  payment_state: string;
  refund_state: string;
  dispute_state: string;
  fulfillment_state: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amount_refunded: number;
  buyer_email: string | null;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
  paid_at: string | null;
}

interface OrderItem {
  product_id: string;
  title: string;
  slug: string;
  product_type: string;
  unit_amount: number;
  currency: string;
  quantity: number;
}

function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${minor} ${currency}`;
  }
}

function paymentTone(state: string): "success" | "neutral" | "danger" | "warning" {
  if (state === "paid") return "success";
  if (state === "failed") return "danger";
  if (state === "pending") return "warning";
  return "neutral";
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let order: OrderDetail | null = null;
  let items: OrderItem[] = [];
  let loadError: string | null = null;

  try {
    const client = await getServerClient();
    const [o, i] = await Promise.all([
      client
        .from("orders")
        .select("id, order_number, payment_state, refund_state, dispute_state, fulfillment_state, currency, subtotal, discount, tax, total, amount_refunded, buyer_email, stripe_session_id, stripe_payment_intent_id, created_at, paid_at")
        .eq("id", id)
        .maybeSingle(),
      client
        .from("order_items")
        .select("product_id, title, slug, product_type, unit_amount, currency, quantity")
        .eq("order_id", id),
    ]);
    if (o.error) throw new Error(o.error.message);
    if (i.error) throw new Error(i.error.message);
    if (!o.data) {
      notFound();
    }
    order = o.data as OrderDetail;
    items = (i.data ?? []) as OrderItem[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load the order.";
  }

  if (loadError) {
    return (
      <Container>
        <ErrorState title="Couldn't load the order" description={loadError} />
      </Container>
    );
  }
  if (!order) {
    return (
      <Container>
        <ErrorState title="Order not found" description="This order does not exist or was deleted." />
      </Container>
    );
  }

  return (
    <Container>
      <Link href={ADMIN_ORDERS_PATH} className="t-caption text-ink-secondary hover:text-ink">← All orders</Link>
      <SectionHeading eyebrow="Admin" title={`Order ${order.order_number}`} as="h1" />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="t-heading-2 text-ink mb-3">State</h2>
          <dl className="grid grid-cols-2 gap-y-3 t-technical text-ink">
            <dt className="text-ink-muted">Payment</dt>
            <dd><Badge tone={paymentTone(order.payment_state)}>{order.payment_state}</Badge></dd>
            <dt className="text-ink-muted">Refund</dt>
            <dd>{order.refund_state}</dd>
            <dt className="text-ink-muted">Dispute</dt>
            <dd>{order.dispute_state}</dd>
            <dt className="text-ink-muted">Fulfillment</dt>
            <dd>{order.fulfillment_state}</dd>
          </dl>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="t-heading-2 text-ink mb-3">Totals</h2>
          <dl className="grid grid-cols-2 gap-y-3 t-technical text-ink">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd>{formatMoney(order.subtotal, order.currency)}</dd>
            <dt className="text-ink-muted">Discount</dt>
            <dd>−{formatMoney(order.discount, order.currency)}</dd>
            <dt className="text-ink-muted">Tax</dt>
            <dd>{formatMoney(order.tax, order.currency)}</dd>
            <dt className="text-ink font-semibold">Total</dt>
            <dd className="font-semibold">{formatMoney(order.total, order.currency)}</dd>
            {order.amount_refunded > 0 ? (
              <>
                <dt className="text-ink-muted">Refunded</dt>
                <dd className="text-danger">{formatMoney(order.amount_refunded, order.currency)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <h2 className="t-heading-2 text-ink mb-3">Buyer</h2>
        <p className="t-technical text-ink">{order.buyer_email ?? "—"}</p>
      </div>
      <div className="mt-6">
        <h2 className="t-heading-2 text-ink mb-3">Items</h2>
        {items.length === 0 ? (
          <p className="t-body-sm text-ink-muted">No items on this order.</p>
        ) : (
          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.product_id}>
                    <TableCell className="text-ink">{it.title}</TableCell>
                    <TableCell className="t-technical text-ink-secondary">{it.product_type}</TableCell>
                    <TableCell className="t-technical text-ink">{formatMoney(it.unit_amount, it.currency)}</TableCell>
                    <TableCell className="t-technical text-ink">{it.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <h2 className="t-heading-2 text-ink mb-3">Metadata</h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-y-2 gap-x-4 t-technical text-ink">
          <dt className="text-ink-muted">Stripe session</dt>
          <dd className="break-all">{order.stripe_session_id}</dd>
          <dt className="text-ink-muted">Payment intent</dt>
          <dd className="break-all">{order.stripe_payment_intent_id ?? "—"}</dd>
          <dt className="text-ink-muted">Created</dt>
          <dd>{order.created_at}</dd>
          <dt className="text-ink-muted">Paid at</dt>
          <dd>{order.paid_at ?? "—"}</dd>
        </dl>
      </div>
    </Container>
  );
}
