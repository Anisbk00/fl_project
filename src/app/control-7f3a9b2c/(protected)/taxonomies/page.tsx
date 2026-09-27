import type { Metadata } from "next";
import { requireAdminOrRedirect } from "@/lib/auth/require-admin";
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
import { addGenre, addPlugin, deleteGenre, deletePlugin } from "../actions";
import { AddGenreForm, AddPluginForm, DeleteButton } from "@/components/admin/taxonomy-forms";

export const metadata: Metadata = {
  title: "Taxonomies",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface GenreRow {
  id: string;
  slug: string;
  name: string;
}
interface PluginRow {
  id: string;
  slug: string;
  name: string;
  vendor: string | null;
}

export default async function TaxonomiesPage() {
  await requireAdminOrRedirect({ aal2: true });
  let genres: GenreRow[] = [];
  let plugins: PluginRow[] = [];
  let loadError: string | null = null;

  try {
    const client = await getServerClient();
    const [g, p] = await Promise.all([
      client.from("genres").select("id, slug, name").order("name"),
      client.from("plugins").select("id, slug, name, vendor").order("name"),
    ]);
    if (g.error) throw new Error(g.error.message);
    if (p.error) throw new Error(p.error.message);
    genres = (g.data ?? []) as GenreRow[];
    plugins = (p.data ?? []) as PluginRow[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load taxonomies.";
  }

  return (
    <Container>
      <SectionHeading
        eyebrow="Admin"
        title="Taxonomies"
        as="h1"
        description="Genres & plugins. Referenced entries can't be deleted — remove them from products first."
      />

      {loadError ? (
        <div className="mt-8">
          <ErrorState title="Couldn't load taxonomies" description={loadError} />
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          {/* Genres */}
          <section className="flex flex-col gap-4">
            <h2 className="t-heading-2 text-ink">Genres ({genres.length})</h2>
            <AddGenreForm action={addGenre} />
            {genres.length === 0 ? (
              <EmptyState title="No genres yet" description="Add the genres your products reference (e.g. Techno, Ambient, Drum & Bass)." />
            ) : (
              <div className="rounded-xl border border-line bg-surface overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Slug</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {genres.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="t-technical text-ink">{g.slug}</TableCell>
                        <TableCell className="text-ink">{g.name}</TableCell>
                        <TableCell>
                          <DeleteButton action={deleteGenre} id={g.id} label={g.name} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Plugins */}
          <section className="flex flex-col gap-4">
            <h2 className="t-heading-2 text-ink">Plugins ({plugins.length})</h2>
            <AddPluginForm action={addPlugin} />
            {plugins.length === 0 ? (
              <EmptyState title="No plugins yet" description="Add the plugins your products require (e.g. Serum, Diva, Pro-Q 3)." />
            ) : (
              <div className="rounded-xl border border-line bg-surface overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Slug</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plugins.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="t-technical text-ink">{p.slug}</TableCell>
                        <TableCell className="text-ink">{p.name}</TableCell>
                        <TableCell className="t-technical text-ink-muted">{p.vendor ?? "—"}</TableCell>
                        <TableCell>
                          <DeleteButton action={deletePlugin} id={p.id} label={p.name} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      )}
    </Container>
  );
}
