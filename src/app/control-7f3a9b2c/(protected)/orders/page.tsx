import type { Metadata } from "next";
import { requireAdminOrRedirect } from "@/lib/auth/require-admin";
import Link from "next/link";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState, ErrorState } from "@/components/site/state";
import { Badge } from "@/components/site/badge";
import { Button } from "@/components/site/button";
import { formatPrice } from "@/components/site/price";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ADMIN_ORDERS_PATH } from "@/lib/admin-path";
import { getServerClient } from "@/lib/supabase/server-client";
import { logError } from "@/lib/observability/logger";
import { paymentTone, relativeTime } from "./format";

export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const PAYMENT_FILTERS = ["paid", "partially_refunded", "refunded", "pending", "failed"] as const;
type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

interface Query { q: string; status: PaymentFilter | ""; page: number }

function parseQuery(sp: Record<string, string | string[] | undefined>): Query {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  // Allow only characters found in order numbers/emails; this text becomes an
  // ILIKE pattern, never part of a PostgREST filter expression.
  const q = one(sp.q).replace(/[^A-Za-z0-9@._+-]/g, "").slice(0, 120);
  const s = one(sp.status);
  const status = (PAYMENT_FILTERS as readonly string[]).includes(s) ? (s as PaymentFilter) : "";
  const page = Math.min(Math.max(parseInt(one(sp.page), 10) || 1, 1), 1000);
  return { q, status, page };
}

function href(q: Query, page: number) {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.status) p.set("status", q.status);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `${ADMIN_ORDERS_PATH}?${s}` : ADMIN_ORDERS_PATH;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminOrRedirect({ aal2: true });
  const query = parseQuery(await searchParams);
  const from = (query.page - 1) * PAGE_SIZE;

  let rows: {
    id: string; order_number: string; payment_state: string; fulfillment_state: string;
    dispute_state: string; currency: string; total: number; buyer_email: string | null; created_at: string;
  }[] = [];
  let total = 0;
  let failed = false;
  try {
    const client = await getServerClient();
    let req = client
      .from("orders")
      .select("id, order_number, payment_state, fulfillment_state, dispute_state, currency, total, buyer_email, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (query.status) req = req.eq("payment_state", query.status);
    if (query.q) {
      const pattern = `%${query.q.replace(/[%_]/g, "\\$&")}%`;
      req = query.q.includes("@") ? req.ilike("buyer_email", pattern) : req.ilike("order_number", pattern);
    }
    const { data, error, count } = await req;
    if (error) throw new Error(error.code ?? "orders_query_failed");
    rows = data;
    total = count ?? 0;
  } catch (e) {
    failed = true;
    logError("admin.orders_load_failed", { objectType: "order", reasonCode: e instanceof Error ? e.message : "unknown" });
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(query.q || query.status);

  return (
    <div>
      <SectionHeading
        eyebrow="Admin"
        title="Orders"
        as="h1"
        description="Payment and fulfillment states come from verified Stripe webhooks, never the browser."
      />

      <form method="get" action={ADMIN_ORDERS_PATH} className="mt-6 flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 t-caption text-ink-secondary">
          Order number or email
          <input name="q" defaultValue={query.q} maxLength={120} autoComplete="off"
            className="h-10 w-64 max-w-full rounded-md border border-line-strong bg-canvas px-3 t-body-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" />
        </label>
        <label className="flex flex-col gap-1 t-caption text-ink-secondary">
          Payment
          <select name="status" defaultValue={query.status}
            className="h-10 rounded-md border border-line-strong bg-canvas px-3 t-body-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
            <option value="">All</option>
            {PAYMENT_FILTERS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </label>
        <Button type="submit" size="sm">Apply</Button>
        {filtered ? <Link href={ADMIN_ORDERS_PATH} className="t-body-sm text-ink-secondary hover:text-ink">Clear</Link> : null}
      </form>

      <div className="mt-6">
        {failed ? (
          <ErrorState title="Couldn't load orders" description="The order list could not be loaded. Try again; if it persists, check the server logs." />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No matching orders" : "No orders yet"}
            description={filtered ? "No orders match these filters." : "Orders appear here after the first successful Stripe checkout."}
          />
        ) : (
          <>
            <div className="rounded-xl border border-line bg-surface overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead><TableHead>Payment</TableHead><TableHead>Fulfillment</TableHead>
                    <TableHead>Total</TableHead><TableHead>Buyer</TableHead><TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link href={`${ADMIN_ORDERS_PATH}/${row.id}`} className="t-technical text-brand hover:underline">{row.order_number}</Link>
                      </TableCell>
                      <TableCell>
                        <Badge tone={paymentTone(row.payment_state)}>{row.payment_state}</Badge>
                        {row.dispute_state === "open" ? <Badge tone="danger" className="ml-2">disputed</Badge> : null}
                      </TableCell>
                      <TableCell className="t-technical text-ink-secondary">{row.fulfillment_state}</TableCell>
                      <TableCell className="t-technical text-ink">{formatPrice(row.total, row.currency)}</TableCell>
                      <TableCell className="t-technical text-ink-muted break-all">{row.buyer_email ?? "—"}</TableCell>
                      <TableCell className="t-technical text-ink-muted whitespace-nowrap" title={row.created_at}>{relativeTime(row.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between t-body-sm text-ink-secondary">
              <span>{total} order{total === 1 ? "" : "s"} · page {query.page} of {pages}</span>
              <span className="flex gap-4">
                {query.page > 1 ? <Link href={href(query, query.page - 1)} className="hover:text-ink">← Newer</Link> : null}
                {query.page < pages ? <Link href={href(query, query.page + 1)} className="hover:text-ink">Older →</Link> : null}
              </span>
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
