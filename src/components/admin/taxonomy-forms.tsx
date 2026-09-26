"use client";

import { useCallback, useActionState } from "react";
import { Button } from "@/components/site/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/admin/product-schema";

/**
 * Simple form wrappers for the taxonomy CRUD actions. Uses useActionState so
 * server-action return values (ActionResult) are surfaced as inline error
 * messages. The action always redirects on success (NEXT_REDIRECT throws),
 * so the form never "returns" on the happy path.
 */

function useActionStateWithError(action: (formData: FormData) => Promise<ActionResult>) {
  const adapter = useCallback(
    async (_prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult | undefined> => {
      try {
        return await action(formData);
      } catch {
        // NEXT_REDIRECT throws on success — the form navigates away. Any
        // other thrown error is surfaced as a generic failure.
        return undefined;
      }
    },
    [action],
  );
  return useActionState<ActionResult | undefined, FormData>(adapter, undefined);
}

function errorMessage(state: ActionResult | undefined): string | null {
  if (!state || state.ok) return null;
  return state.message ?? Object.values(state.errors ?? {})[0] ?? "Something went wrong.";
}

export function AddGenreForm({
  action,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionStateWithError(action);
  const err = errorMessage(state);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="genre-slug">Slug</Label>
          <Input id="genre-slug" name="slug" required placeholder="techno" pattern="^(?!-)[a-z0-9]+(?:-[a-z0-9]+)*(?<!-)$" disabled={pending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="genre-name">Name</Label>
          <Input id="genre-name" name="name" required placeholder="Techno" maxLength={200} disabled={pending} />
        </div>
      </div>
      {err ? <p role="alert" className="t-body-sm text-danger">{err}</p> : null}
      <Button type="submit" size="sm" className="self-start" loading={pending}>Add genre</Button>
    </form>
  );
}

export function AddPluginForm({
  action,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionStateWithError(action);
  const err = errorMessage(state);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plugin-slug">Slug</Label>
          <Input id="plugin-slug" name="slug" required placeholder="serum" pattern="^(?!-)[a-z0-9]+(?:-[a-z0-9]+)*(?<!-)$" disabled={pending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plugin-name">Name</Label>
          <Input id="plugin-name" name="name" required placeholder="Serum" maxLength={200} disabled={pending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plugin-vendor">Vendor</Label>
          <Input id="plugin-vendor" name="vendor" placeholder="Xfer Records" maxLength={200} disabled={pending} />
        </div>
      </div>
      {err ? <p role="alert" className="t-body-sm text-danger">{err}</p> : null}
      <Button type="submit" size="sm" className="self-start" loading={pending}>Add plugin</Button>
    </form>
  );
}

export function DeleteButton({
  action,
  id,
  label,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  id: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionStateWithError(action);
  const err = errorMessage(state);
  return (
    <div className="flex flex-col gap-1">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" disabled={pending} className="t-caption text-danger hover:underline disabled:opacity-50" title={`Delete ${label}`}>
          {pending ? "Deleting…" : "Delete"}
        </button>
      </form>
      {err ? <p role="alert" className="t-caption text-danger max-w-[14rem]">{err}</p> : null}
    </div>
  );
}
