"use client";

import { useActionState, useMemo } from "react";
import { Button } from "@/components/site/button";
import {
  archiveProductAction,
  publishProductAction,
  unpublishProductAction,
} from "@/app/control-7f3a9b2c/(protected)/actions";
import { type ActionResult } from "@/lib/admin/product-schema";

type Lifecycle = "draft" | "published" | "archived";

/**
 * Lifecycle action buttons (Publish / Unpublish / Archive) for a product.
 *
 * Each button dispatches a transactional RPC Server Action that re-checks AAL2
 * + the expected `row_version` and surfaces a structured error if the readiness
 * gate rejects (missing cover, missing deliverable, etc.).
 * On success the action navigates back to the same edit page (which shows the
 * updated lifecycle badge).
 */
export function ProductLifecycleButtons({
  productId,
  expectedVersion,
  lifecycle,
}: {
  productId: string;
  expectedVersion: number;
  lifecycle: Lifecycle;
}) {
  // Pre-bind each action with the product id + version. `useActionState`
  // returns `[state, dispatch, isPending]`. Each button uses its own action
  // state so a publish failure doesn't blur into an archive failure UI.
  const publishBind = useMemo(
    () => publishProductAction.bind(null, productId, expectedVersion),
    [productId, expectedVersion],
  );
  const unpublishBind = useMemo(
    () => unpublishProductAction.bind(null, productId, expectedVersion),
    [productId, expectedVersion],
  );
  const archiveBind = useMemo(
    () => archiveProductAction.bind(null, productId, expectedVersion),
    [productId, expectedVersion],
  );

  const [publishState, publishDispatch, publishPending] = useActionState<
    ActionResult,
    void
  >(publishBind, { ok: false });
  const [unpublishState, unpublishDispatch, unpublishPending] = useActionState<
    ActionResult,
    void
  >(unpublishBind, { ok: false });
  const [archiveState, archiveDispatch, archivePending] = useActionState<
    ActionResult,
    void
  >(archiveBind, { ok: false });

  const publishErr = errorText(publishState);
  const unpublishErr = errorText(unpublishState);
  const archiveErr = errorText(archiveState);

  // `useActionState`'s dispatch expects a `void` payload; native `<form
  // action>` passes a `FormData`. Wrap to ignore the formData arg so the
  // signatures line up.
  const publishFormAction = (_formData: FormData) => publishDispatch();
  const unpublishFormAction = (_formData: FormData) => unpublishDispatch();
  const archiveFormAction = (_formData: FormData) => archiveDispatch();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {lifecycle === "draft" ? (
        <form action={publishFormAction} className="contents">
          <Button type="submit" size="sm" variant="primary" loading={publishPending}>
            {publishPending ? "Publishing…" : "Publish"}
          </Button>
        </form>
      ) : null}
      {lifecycle === "published" ? (
        <>
          <form action={unpublishFormAction} className="contents">
            <Button type="submit" size="sm" variant="outline" loading={unpublishPending}>
              {unpublishPending ? "Unpublishing…" : "Unpublish"}
            </Button>
          </form>
          <form action={archiveFormAction} className="contents">
            <Button type="submit" size="sm" variant="outline" loading={archivePending}>
              {archivePending ? "Archiving…" : "Archive"}
            </Button>
          </form>
        </>
      ) : null}
      {lifecycle === "archived" ? (
        <p className="t-caption text-ink-muted mr-auto">
          Archived. The product is no longer visible in the public catalog.
        </p>
      ) : null}

      <div className="flex flex-col gap-1 min-w-0">
        {publishErr ? (
          <p role="alert" className="t-caption text-danger">{publishErr}</p>
        ) : null}
        {unpublishErr ? (
          <p role="alert" className="t-caption text-danger">{unpublishErr}</p>
        ) : null}
        {archiveErr ? (
          <p role="alert" className="t-caption text-danger">{archiveErr}</p>
        ) : null}
      </div>
    </div>
  );
}

function errorText(state: ActionResult | undefined): string | null {
  if (!state || state.ok) return null;
  return state.message ?? "Action failed.";
}
