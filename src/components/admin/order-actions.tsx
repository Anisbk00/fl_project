"use client";

import { useActionState } from "react";
import { Button } from "@/components/site/button";
import {
  refundOrderAction,
  releaseAccessAction,
  resendDeliveryAction,
  revokeAccessAction,
} from "@/app/control-7f3a9b2c/(protected)/orders/actions";
import type { ActionResult } from "@/lib/admin/product-schema";

/**
 * Order support buttons. Each is a real Server Action (AAL2 re-checked on the
 * server); which buttons appear is a convenience only — the actions enforce
 * their own preconditions. Destructive ones ask for confirmation first.
 */
export function OrderActions({
  orderId,
  canResend,
  canRelease,
  canRevoke,
  canRefund,
}: {
  orderId: string;
  canResend: boolean;
  canRelease: boolean;
  canRevoke: boolean;
  canRefund: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {canResend ? <ActionButton label="Resend delivery email" pending="Sending…" action={resendDeliveryAction} orderId={orderId} /> : null}
        {canRelease ? <ActionButton label="Restore access" pending="Restoring…" action={releaseAccessAction} orderId={orderId} /> : null}
        {canRevoke ? (
          <ActionButton label="Revoke access" pending="Revoking…" action={revokeAccessAction} orderId={orderId}
            confirm="Revoke all download access for this order? The buyer's links and sessions stop working immediately." />
        ) : null}
        {canRefund ? (
          <ActionButton label="Refund remaining balance" pending="Refunding…" action={refundOrderAction} orderId={orderId}
            confirm="Refund the remaining balance through Stripe? This cannot be undone. Access is revoked once Stripe confirms." />
        ) : null}
      </div>
      {!canResend && !canRelease && !canRevoke && !canRefund ? (
        <p className="t-body-sm text-ink-muted">No support actions apply to this order in its current state.</p>
      ) : null}
    </div>
  );
}

function ActionButton({
  label,
  pending,
  action,
  orderId,
  confirm,
}: {
  label: string;
  pending: string;
  action: (id: string) => Promise<ActionResult>;
  orderId: string;
  confirm?: string;
}) {
  const [state, dispatch, isPending] = useActionState<ActionResult | null, void>(() => action(orderId), null);
  return (
    <form
      action={() => dispatch()}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="flex flex-col gap-1"
    >
      <Button type="submit" size="sm" variant="outline" loading={isPending}>
        {isPending ? pending : label}
      </Button>
      {state?.message ? (
        <p role="status" className={`t-caption ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>
      ) : null}
    </form>
  );
}
