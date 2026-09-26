import type { Metadata } from "next";
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
import { getServerClient } from "@/lib/supabase/server-client";

export const metadata: Metadata = {
  title: "Audit log",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface AuditRow {
  id: string;
  actor_uid: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  changed_fields: unknown;
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

export default async function AuditPage() {
  let rows: AuditRow[] = [];
  let loadError: string | null = null;

  try {
    const client = await getServerClient();
    const { data, error } = await client
      .from("audit_events")
      .select("id, actor_uid, action, entity_type, entity_id, created_at, changed_fields")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as AuditRow[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load audit events.";
  }

  return (
    <Container>
      <SectionHeading
        eyebrow="Admin"
        title="Audit log"
        as="h1"
        description="Append-only record of admin mutations. The last 100 events are shown."
      />
      <div className="mt-8">
        {loadError ? (
          <ErrorState title="Couldn't load audit events" description={loadError} />
        ) : rows.length === 0 ? (
          <EmptyState title="No audit events yet" description="Publish, archive, or edit a product to populate the audit log." />
        ) : (
          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="t-technical text-ink-muted whitespace-nowrap" title={row.created_at}>
                      {relativeTime(row.created_at)}
                    </TableCell>
                    <TableCell className="t-technical text-ink">{row.action}</TableCell>
                    <TableCell>
                      <span className="t-technical text-ink-secondary">{row.entity_type ?? "—"}</span>
                      {row.entity_id ? (
                        <span className="t-technical text-ink-muted ml-2">{row.entity_id.slice(0, 8)}…</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="t-technical text-ink-muted">
                      {row.actor_uid ? row.actor_uid.slice(0, 8) : "system"}
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
