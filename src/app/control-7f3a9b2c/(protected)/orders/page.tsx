import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState, ErrorState } from "@/components/site/state";
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
  title: "Orders",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface OrderRow {
  id: string;
  order_number: string;
  payment_state: string;
  fulfillment_state: string;
  refund_state: string;
  currency: string;
  total: number;
  buyer_email: string | null;
  created_at: string;
}

function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "—";
    const diff = Date.now() - then;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  } catch {
    return "—";
  }
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

export default async function OrdersPage() {
  let rows: OrderRow[] = [];
  let loadError: string | null = null;

  try {
    const client = await getServerClient();
    const { data, error } = await client
      .from("orders")
      .select("id, order_number, payment_state, fulfillment_state, refund_state, currency, total, buyer_email, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as OrderRow[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load orders.";
  }

  return (
    <Container>
      <SectionHeading
        eyebrow="Admin"
        title="Orders"
        as="h1"
        description="Read-only view of orders. Payment + fulfillment state comes from verified Stripe webhooks, not the browser."
      />
      <div className="mt-8">
        {loadError ? (
          <ErrorState title="Couldn't load orders" description={loadError} />
        ) : rows.length === 0 ? (
          <EmptyState title="No orders yet" description="Orders appear here after the first successful Stripe checkout." />
        ) : (
          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Fulfillment</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`${ADMIN_ORDERS_PATH}/${row.id}`}
                        className="t-technical text-brand hover:underline"
                      >
                        {row.order_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge tone={paymentTone(row.payment_state)}>{row.payment_state}</Badge>
                      {row.refund_state !== "none" ? (
                        <span className="t-caption text-ink-muted ml-2">refund: {row.refund_state}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="t-technical text-ink-secondary">{row.fulfillment_state}</TableCell>
                    <TableCell className="t-technical text-ink">{formatMoney(row.total, row.currency)}</TableCell>
                    <TableCell className="t-technical text-ink-muted">{row.buyer_email ?? "—"}</TableCell>
                    <TableCell className="t-technical text-ink-muted whitespace-nowrap" title={row.created_at}>
                      {relativeTime(row.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Container>
  );
}
