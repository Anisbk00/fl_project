import type { Metadata } from "next";
import { requireAdminOrRedirect } from "@/lib/auth/require-admin";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_NEW_PRODUCT_PATH } from "@/lib/admin-path";
import { getServerClient } from "@/lib/supabase/server-client";
import type { Database } from "@/types/database";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { LinkButton } from "@/components/site/button";
import { Badge } from "@/components/site/badge";
import { EmptyState, ErrorState } from "@/components/site/state";
import { formatPrice } from "@/components/site/price";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Products",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface ProductListRow {
  id: string;
  slug: string;
  title: string;
  product_type: Database["public"]["Enums"]["product_type"];
  lifecycle: Database["public"]["Enums"]["product_lifecycle"];
  price: number;
  price_currency: string;
  featured: boolean;
  updated_at: string;
}

async function adminClient(): Promise<SupabaseClient<Database>> {
  const c = await getServerClient();
  return c as unknown as SupabaseClient<Database>;
}

async function listProducts(): Promise<
  { rows: ProductListRow[] } | { error: string }
> {
  try {
    const client = await adminClient();
    const { data, error } = await client
      .from("products")
      .select(
        "id,slug,title,product_type,lifecycle,price,price_currency,featured,updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) {
      return { error: `Could not load products: ${error.message}` };
    }
    return { rows: (data ?? []) as ProductListRow[] };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Supabase is not configured in this environment.",
    };
  }
}

function lifecycleTone(
  l: Database["public"]["Enums"]["product_lifecycle"],
): "success" | "neutral" | "warning" {
  if (l === "published") return "success";
  if (l === "archived") return "neutral";
  return "warning";
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
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo ago`;
    const yr = Math.floor(day / 365);
    return `${yr}y ago`;
  } catch {
    return "—";
  }
}

export default async function AdminProductsPage() {
  await requireAdminOrRedirect({ aal2: true });
  const result = await listProducts();

  return (
    <Container>
      <div className="flex items-center justify-between gap-4">
        <SectionHeading eyebrow="Admin" title="Products" as="h1" />
        <LinkButton href={ADMIN_NEW_PRODUCT_PATH} size="sm">
          New product
        </LinkButton>
      </div>

      <div className="mt-8">
        {"error" in result ? (
          <ErrorState
            title="Couldn't load products"
            description={result.error}
            action={
              <LinkButton href={ADMIN_NEW_PRODUCT_PATH} variant="outline">
                Create your first product
              </LinkButton>
            }
          />
        ) : result.rows.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Create your first product to populate the catalog."
            action={
              <LinkButton href={ADMIN_NEW_PRODUCT_PATH}>
                Create your first product
              </LinkButton>
            }
          />
        ) : (
          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[16rem]">Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Lifecycle</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-center">Featured</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/control-7f3a9b2c/products/${p.id}`}
                        className="text-ink hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded"
                      >
                        {p.title}
                      </Link>
                      <div className="t-technical text-ink-muted text-xs">
                        {p.slug}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="t-technical text-ink-secondary">
                        {p.product_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge tone={lifecycleTone(p.lifecycle)}>
                        {p.lifecycle}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right t-technical text-ink">
                      {formatPrice(p.price, p.price_currency)}
                    </TableCell>
                    <TableCell className="text-center">
                      {p.featured ? (
                        <Badge tone="brand">★</Badge>
                      ) : (
                        <span className="t-technical text-ink-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="t-technical text-ink-muted"
                      title={p.updated_at}
                    >
                      {relativeTime(p.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <p className="t-caption text-ink-muted mt-4">
        Showing up to 50 most-recently updated products. Server-side pagination
        will land in a later iteration.
      </p>
    </Container>
  );
}
