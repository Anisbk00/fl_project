import type { Metadata } from "next";
import { requireAdminOrRedirect } from "@/lib/auth/require-admin";
import Link from "next/link";
import { ADMIN_AUDIT_PATH, ADMIN_ORDERS_PATH, ADMIN_PRODUCTS_PATH } from "@/lib/admin-path";
import { getServerClient, must } from "@/lib/supabase/server-client";
import { logError } from "@/lib/observability/logger";
import { SectionHeading } from "@/components/site/section-heading";
import { ErrorState } from "@/components/site/state";
import { Badge } from "@/components/site/badge";
import { formatPrice } from "@/components/site/price";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { paymentTone, relativeTime } from "./orders/format";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

async function loadDashboard() {
  // Cookie client: every read is RLS-limited to active AAL2 admins.
  const client = await getServerClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const count = (lifecycle: "draft" | "published" | "archived") =>
    client.from("products").select("id", { count: "exact", head: true }).eq("lifecycle", lifecycle);
  const [recent, allTime, attention, draft, published, archived, orders, audit] = await Promise.all([
    client.rpc("admin_sales_summary", { p_since: since }),
    client.rpc("admin_sales_summary", { p_since: "1970-01-01T00:00:00Z" }), // all time
    client.rpc("admin_attention_counts"),
    count("draft"),
    count("published"),
    count("archived"),
    client.from("orders").select("id, order_number, payment_state, currency, total, created_at")
      .order("created_at", { ascending: false }).limit(5),
    client.from("audit_events").select("id, action, entity_type, created_at")
      .order("created_at", { ascending: false }).limit(8),
  ]);
  const counts = [draft, published, archived].map((r) => {
    if (r.error || r.count === null) throw new Error(r.error?.code || "count_failed");
    return r.count;
  });
  const a = must(attention)[0];
  if (!a) throw new Error("attention_missing");
  return {
    recent: must(recent),
    allTime: must(allTime),
    attention: a,
    catalog: { draft: counts[0]!, published: counts[1]!, archived: counts[2]! },
    orders: must(orders),
    audit: must(audit),
  };
}

type SalesRow = { currency: string; paid_orders: number; gross: number; refunded: number };

function SalesCard({ title, rows }: { title: string; rows: SalesRow[] }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="t-eyebrow">{title}</h2>
      {rows.length === 0 ? (
        <p className="t-display text-ink mt-2">0 <span className="t-body-sm text-ink-muted">paid orders</span></p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.currency}>
              <p className="t-display text-ink">{formatPrice(r.gross - r.refunded, r.currency)}</p>
              <p className="t-caption text-ink-muted">
                net · {r.paid_orders} paid order{r.paid_orders === 1 ? "" : "s"}
                {r.refunded > 0 ? ` · ${formatPrice(r.refunded, r.currency)} refunded` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminDashboard() {
  await requireAdminOrRedirect({ aal2: true });
  let data: Awaited<ReturnType<typeof loadDashboard>>;
  try {
    data = await loadDashboard();
  } catch (e) {
    logError("admin.dashboard_load_failed", { reasonCode: e instanceof Error ? e.message : "unknown" });
    return (
      <div>
        <SectionHeading eyebrow="Admin" title="Dashboard" as="h1" />
        <div className="mt-8">
          <ErrorState title="Couldn't load the dashboard" description="The dashboard data could not be loaded. Try again; if it persists, check the server logs." />
        </div>
      </div>
    );
  }

  const a = data.attention;
  const attention = [
    { label: "Checkouts in manual review", n: a.manual_review_checkouts, hint: "Paid in Stripe but failed reconciliation — check the Stripe Dashboard." },
    { label: "Orders with access on hold", n: a.held_orders, hint: "Partial refunds or disputes. Restore or revoke on the order page." },
    { label: "Open disputes", n: a.open_disputes, hint: "Respond in the Stripe Dashboard before the deadline." },
    { label: "Failed delivery emails", n: a.failed_emails, hint: "Resend from the order page after fixing the cause." },
    { label: "Fulfillment stuck > 15 min", n: a.stuck_fulfillment, hint: "Paid but no email accepted yet. The cron retries automatically." },
    { label: "Dead-letter webhooks", n: a.dead_webhooks, hint: "Stripe events that failed 8 times. Investigate in the logs." },
  ].filter((x) => x.n > 0);

  return (
    <div>
      <SectionHeading eyebrow="Admin" title="Dashboard" as="h1" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <SalesCard title={`Last ${WINDOW_DAYS} days`} rows={data.recent} />
        <SalesCard title="All time" rows={data.allTime} />
      </div>

      <section className="mt-8" aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="t-heading-2 text-ink mb-3">Needs attention</h2>
        {attention.length === 0 ? (
          <p className="t-body-sm text-ink-muted rounded-xl border border-line bg-surface p-5">Nothing needs attention right now.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {attention.map((x) => (
              <li key={x.label} className="rounded-xl border border-line bg-surface p-4">
                <p className="t-label text-ink"><Badge tone="warning">{x.n}</Badge> {x.label}</p>
                <p className="t-caption text-ink-muted mt-1">{x.hint}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="t-heading-2 text-ink">Recent orders</h2>
            <Link href={ADMIN_ORDERS_PATH} className="t-caption text-brand hover:underline">All orders →</Link>
          </div>
          {data.orders.length === 0 ? (
            <p className="t-body-sm text-ink-muted rounded-xl border border-line bg-surface p-5">No orders yet.</p>
          ) : (
            <div className="rounded-xl border border-line bg-surface overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Payment</TableHead><TableHead>Total</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell><Link href={`${ADMIN_ORDERS_PATH}/${o.id}`} className="t-technical text-brand hover:underline">{o.order_number}</Link></TableCell>
                      <TableCell><Badge tone={paymentTone(o.payment_state)}>{o.payment_state}</Badge></TableCell>
                      <TableCell className="t-technical">{formatPrice(o.total, o.currency)}</TableCell>
                      <TableCell className="t-technical text-ink-muted" title={o.created_at}>{relativeTime(o.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="t-heading-2 text-ink">Catalog</h2>
            <Link href={ADMIN_PRODUCTS_PATH} className="t-caption text-brand hover:underline">Manage products →</Link>
          </div>
          <dl className="grid grid-cols-3 gap-3">
            {([["Published", data.catalog.published], ["Drafts", data.catalog.draft], ["Archived", data.catalog.archived]] as const).map(([label, n]) => (
              <div key={label} className="rounded-xl border border-line bg-surface p-4">
                <dt className="t-eyebrow">{label}</dt>
                <dd className="t-heading-2 text-ink mt-1">{n}</dd>
              </div>
            ))}
          </dl>

          <div className="flex items-baseline justify-between mt-6 mb-3">
            <h2 className="t-heading-2 text-ink">Recent activity</h2>
            <Link href={ADMIN_AUDIT_PATH} className="t-caption text-brand hover:underline">Audit log →</Link>
          </div>
          {data.audit.length === 0 ? (
            <p className="t-body-sm text-ink-muted">No audit events yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 t-technical">
              {data.audit.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span className="text-ink">{e.action}</span>
                  <span className="text-ink-muted whitespace-nowrap" title={e.created_at}>{relativeTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
