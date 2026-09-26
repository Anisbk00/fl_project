import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_AUDIT_PATH, ADMIN_PRODUCTS_PATH } from "@/lib/admin-path";
import { getServerClient } from "@/lib/supabase/server-client";
import type { Database } from "@/types/database";
import { logout } from "./actions";
import { Button, LinkButton } from "@/components/site/button";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState, ErrorState } from "@/components/site/state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function adminClient(): Promise<SupabaseClient<Database>> {
  const c = await getServerClient();
  return c as unknown as SupabaseClient<Database>;
}

interface Counts {
  draft: number;
  published: number;
  archived: number;
}

interface AuditRow {
  id: string;
  actor_uid: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  changed_fields: unknown;
}

async function loadDashboard(): Promise<
  | { counts: Counts; audit: AuditRow[]; auditError?: string }
  | { error: string }
> {
  try {
    const client = await adminClient();
    const [draftRes, publishedRes, archivedRes, auditRes] = await Promise.all([
      client
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("lifecycle", "draft"),
      client
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("lifecycle", "published"),
      client
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("lifecycle", "archived"),
      client
        .from("audit_events")
        .select(
          "id,actor_uid,action,entity_type,entity_id,created_at,changed_fields",
        )
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (draftRes.error || publishedRes.error || archivedRes.error) {
      return {
        error: `Could not load product counts: ${
          draftRes.error?.message ||
          publishedRes.error?.message ||
          archivedRes.error?.message
        }`,
      };
    }
    if (auditRes.error) {
      // Don't fail the whole dashboard for an audit read failure; surface it.
      return {
        counts: {
          draft: draftRes.count ?? 0,
          published: publishedRes.count ?? 0,
          archived: archivedRes.count ?? 0,
        },
        audit: [],
        auditError: auditRes.error?.message ?? "Audit read failed.",
      };
    }
    return {
      counts: {
        draft: draftRes.count ?? 0,
        published: publishedRes.count ?? 0,
        archived: archivedRes.count ?? 0,
      },
      audit: (auditRes.data ?? []) as AuditRow[],
    };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Supabase is not configured in this environment.",
    };
  }
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
    return `${day}d ago`;
  } catch {
    return "—";
  }
}

function shortUid(uid: string | null): string {
  if (!uid) return "system";
  return uid.slice(0, 8);
}

export default async function AdminDashboard() {
  const data = await loadDashboard();

  return (
    <Container>
      <div className="flex items-center justify-between gap-4">
        <SectionHeading eyebrow="Admin" title="Dashboard" as="h1" />
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      {"error" in data ? (
        <div className="mt-8">
          <ErrorState
            title="Couldn't load the dashboard"
            description={data.error}
          />
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {(
              [
                ["Drafts", data.counts.draft, "warning"],
                ["Published", data.counts.published, "success"],
                ["Archived", data.counts.archived, "neutral"],
              ] as const
            ).map(([label, count, tone]) => (
              <div
                key={label}
                className="rounded-xl border border-line bg-surface p-5"
              >
                <p className="t-eyebrow">{label}</p>
                <p className="t-display text-ink mt-2">
                  {Number.isFinite(count) ? count : "—"}
                </p>
                <p className="t-caption text-ink-muted">
                  {label === "Published"
                    ? "Live in the public catalog."
                    : label === "Drafts"
                      ? "Awaiting publication."
                      : "Hidden from the public catalog."}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <h2 className="t-heading-2 text-ink mb-3">Recent audit events</h2>
            {"auditError" in data && data.auditError ? (
              <ErrorState
                title="Couldn't load audit events"
                description={data.auditError}
              />
            ) : data.audit.length === 0 ? (
              <EmptyState
                title="No audit events yet"
                description="Publish, archive, or edit a product to populate the audit log."
              />
            ) : (
              <div className="rounded-xl border border-line bg-surface overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.audit.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="t-technical text-ink">
                          {row.action}
                        </TableCell>
                        <TableCell>
                          <span className="t-technical text-ink-secondary">
                            {row.entity_type}
                          </span>
                          {row.entity_id ? (
                            <span className="t-technical text-ink-muted ml-2">
                              {row.entity_id.slice(0, 8)}…
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="t-technical text-ink-muted">
                          {shortUid(row.actor_uid)}
                        </TableCell>
                        <TableCell
                          className="t-technical text-ink-muted"
                          title={row.created_at}
                        >
                          {relativeTime(row.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="mt-8 flex gap-3">
            <LinkButton href={ADMIN_PRODUCTS_PATH}>Manage products</LinkButton>
            <LinkButton href={ADMIN_AUDIT_PATH} variant="outline">
              Full audit log
            </LinkButton>
          </div>
        </>
      )}
    </Container>
  );
}
