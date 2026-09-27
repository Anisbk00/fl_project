import type { Metadata } from "next";
import { requireAdminOrRedirect } from "@/lib/auth/require-admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { SectionHeading } from "@/components/site/section-heading";
import { ErrorState } from "@/components/site/state";
import { Badge } from "@/components/site/badge";
import { formatPrice } from "@/components/site/price";
import { OrderActions } from "@/components/admin/order-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ADMIN_ORDERS_PATH } from "@/lib/admin-path";
import { getServerClient, must } from "@/lib/supabase/server-client";
import { logError } from "@/lib/observability/logger";
import { paymentTone } from "../format";

export const metadata: Metadata = {
  title: "Order detail",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

async function loadOrder(id: string) {
  // Cookie client: RLS limits every read below to active AAL2 admins.
  const client = await getServerClient();
  const [o, items, ents, msgs, refunds] = await Promise.all([
    client.from("orders")
      .select("id, order_number, payment_state, refund_state, dispute_state, fulfillment_state, currency, subtotal, discount, tax, total, amount_refunded, buyer_email, stripe_session_id, stripe_payment_intent_id, created_at, paid_at")
      .eq("id", id).maybeSingle(),
    client.from("order_items").select("product_id, title, slug, product_type, unit_amount, currency").eq("order_id", id),
    client.from("fulfillment_entitlements")
      .select("id, order_item_id, state, hold_reason, revocation_reason, successful_issuances, issuance_quota_snapshot, last_issuance_at")
      .eq("order_id", id),
    client.from("delivery_messages")
      .select("id, message_kind, state, attempt_count, safe_error_class, sent_at, delivered_at, bounced_at, created_at")
      .eq("order_id", id).order("created_at", { ascending: false }),
    client.from("refunds").select("id, amount, state, stripe_failure_code, created_at").eq("order_id", id).order("created_at", { ascending: false }),
  ]);
  if (o.error) throw new Error(o.error.code || "order_query_failed");
  return { order: o.data, items: must(items), entitlements: must(ents), messages: must(msgs), refunds: must(refunds) };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-5">
      <h2 className="t-heading-2 text-ink mb-3">{title}</h2>
      {children}
    </section>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC" : "—");

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminOrRedirect({ aal2: true });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  let data: Awaited<ReturnType<typeof loadOrder>>;
  try {
    data = await loadOrder(id);
  } catch (e) {
    logError("admin.order_load_failed", { objectType: "order", reasonCode: e instanceof Error ? e.message : "unknown" });
    return <ErrorState title="Couldn't load the order" description="The order could not be loaded. Try again; if it persists, check the server logs." />;
  }
  const { order, items, entitlements, messages, refunds } = data;
  if (!order) notFound();

  const paidLike = order.payment_state === "paid" || order.payment_state === "partially_refunded";
  const anyHeld = entitlements.some((e) => e.state === "held");
  const anyActiveOrHeld = entitlements.some((e) => e.state !== "revoked");
  const hasPendingRefund = refunds.some((r) => r.state === "pending");

  return (
    <div>
      <Link href={ADMIN_ORDERS_PATH} className="t-caption text-ink-secondary hover:text-ink">← All orders</Link>
      <SectionHeading eyebrow="Admin" title={`Order ${order.order_number}`} as="h1" />

      <Section title="Support actions">
        <OrderActions
          orderId={order.id}
          canResend={paidLike && order.dispute_state !== "open" && anyActiveOrHeld}
          canRelease={anyHeld && order.payment_state !== "refunded" && order.dispute_state !== "open" && order.dispute_state !== "lost"}
          canRevoke={anyActiveOrHeld}
          canRefund={paidLike && !!order.stripe_payment_intent_id && order.total - order.amount_refunded > 0 && !hasPendingRefund}
        />
      </Section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="t-heading-2 text-ink mb-3">State</h2>
          <dl className="grid grid-cols-2 gap-y-3 t-technical text-ink">
            <dt className="text-ink-muted">Payment</dt>
            <dd><Badge tone={paymentTone(order.payment_state)}>{order.payment_state}</Badge></dd>
            <dt className="text-ink-muted">Refund</dt><dd>{order.refund_state}</dd>
            <dt className="text-ink-muted">Dispute</dt>
            <dd>{order.dispute_state === "open" ? <Badge tone="danger">open</Badge> : order.dispute_state}</dd>
            <dt className="text-ink-muted">Fulfillment</dt><dd>{order.fulfillment_state}</dd>
          </dl>
        </section>
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="t-heading-2 text-ink mb-3">Totals</h2>
          <dl className="grid grid-cols-2 gap-y-3 t-technical text-ink">
            <dt className="text-ink-muted">Subtotal</dt><dd>{formatPrice(order.subtotal, order.currency)}</dd>
            <dt className="text-ink-muted">Discount</dt><dd>−{formatPrice(order.discount, order.currency)}</dd>
            <dt className="text-ink-muted">Tax</dt><dd>{formatPrice(order.tax, order.currency)}</dd>
            <dt className="text-ink font-semibold">Total</dt><dd className="font-semibold">{formatPrice(order.total, order.currency)}</dd>
            {order.amount_refunded > 0 ? (
              <><dt className="text-ink-muted">Refunded</dt><dd className="text-danger">{formatPrice(order.amount_refunded, order.currency)}</dd></>
            ) : null}
          </dl>
        </section>
      </div>

      <Section title="Buyer">
        <p className="t-technical text-ink break-all">{order.buyer_email ?? "—"}</p>
      </Section>

      <Section title="Items & download access">
        {entitlements.length === 0 && items.length === 0 ? (
          <p className="t-body-sm text-ink-muted">No items on this order.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead><TableHead>Price</TableHead><TableHead>Access</TableHead><TableHead>Downloads</TableHead><TableHead>Last download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const ent = entitlements.find((e) => e.order_item_id === it.product_id);
                  return (
                    <TableRow key={it.product_id}>
                      <TableCell className="text-ink">{it.title}<span className="block t-caption text-ink-muted">{it.product_type}</span></TableCell>
                      <TableCell className="t-technical">{formatPrice(it.unit_amount, it.currency)}</TableCell>
                      <TableCell>
                        {ent ? (
                          <>
                            <Badge tone={ent.state === "active" ? "success" : ent.state === "held" ? "warning" : "danger"}>{ent.state}</Badge>
                            {ent.hold_reason || ent.revocation_reason ? (
                              <span className="block t-caption text-ink-muted">{ent.hold_reason ?? ent.revocation_reason}</span>
                            ) : null}
                          </>
                        ) : <span className="t-caption text-ink-muted">not granted</span>}
                      </TableCell>
                      <TableCell className="t-technical">{ent ? `${ent.successful_issuances} / ${ent.issuance_quota_snapshot}` : "—"}</TableCell>
                      <TableCell className="t-technical text-ink-muted">{when(ent?.last_issuance_at ?? null)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="Delivery emails">
        {messages.length === 0 ? (
          <p className="t-body-sm text-ink-muted">No delivery email has been queued for this order.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Kind</TableHead><TableHead>State</TableHead><TableHead>Attempts</TableHead><TableHead>Sent</TableHead><TableHead>Last error</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="t-technical">{m.message_kind}</TableCell>
                    <TableCell>
                      <Badge tone={m.state === "sent" || m.state === "delivered" ? "success" : m.state === "queued" || m.state === "sending" ? "warning" : "danger"}>{m.state}</Badge>
                    </TableCell>
                    <TableCell className="t-technical">{m.attempt_count}</TableCell>
                    <TableCell className="t-technical text-ink-muted">{when(m.delivered_at ?? m.sent_at)}</TableCell>
                    <TableCell className="t-technical text-ink-muted">{m.safe_error_class ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      {refunds.length > 0 ? (
        <Section title="Refund requests">
          <ul className="flex flex-col gap-2 t-technical">
            {refunds.map((r) => (
              <li key={r.id}>
                {formatPrice(r.amount, order.currency)} · <Badge tone={r.state === "succeeded" ? "success" : r.state === "pending" ? "warning" : "danger"}>{r.state}</Badge>
                {r.stripe_failure_code ? <span className="text-ink-muted"> · {r.stripe_failure_code}</span> : null}
                <span className="text-ink-muted"> · {when(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="References">
        <dl className="grid grid-cols-[max-content_1fr] gap-y-2 gap-x-4 t-technical text-ink">
          <dt className="text-ink-muted">Stripe session</dt><dd className="break-all">{order.stripe_session_id}</dd>
          <dt className="text-ink-muted">Payment intent</dt><dd className="break-all">{order.stripe_payment_intent_id || "—"}</dd>
          <dt className="text-ink-muted">Created</dt><dd>{when(order.created_at)}</dd>
          <dt className="text-ink-muted">Paid</dt><dd>{when(order.paid_at)}</dd>
        </dl>
      </Section>
    </div>
  );
}
