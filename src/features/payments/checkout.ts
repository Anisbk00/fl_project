import "server-only";
import type Stripe from "stripe";
import { getPrivilegedClient } from "@/lib/supabase/privileged";
import { getStripeClient } from "@/lib/stripe/server";
import { getOriginAllowlist, isLiveCheckoutEnabled, stripeKeyIsLive } from "@/lib/env/server";
import { publicEnv } from "@/lib/env/public";
import { validateOrigin } from "./live-gate";
import { cartFingerprint } from "./cart-fingerprint";
import { buildCheckoutSessionParams, CHECKOUT_SESSION_EXPIRY_MINUTES } from "./checkout-config";
import { checkoutIdempotencyKey } from "./idempotency";
import { computeSubtotal } from "./money";
import { logError, logInfo } from "@/lib/observability/logger";

/**
 * Checkout saga: cart → authoritative snapshot → checkout_attempt →
 * Stripe-hosted Checkout Session. Every price, currency and deliverable comes
 * from the database; nothing from the browser except the cart cookie.
 */

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: CheckoutError };

export type CheckoutError =
  | "empty_cart"
  | "unavailable_items"
  | "no_deliverable"
  | "mixed_currency"
  | "payment_in_progress"
  | "live_payments_disabled"
  | "misconfigured";

interface SnapshotItem {
  productId: string;
  rowVersion: number;
  slug: string;
  title: string;
  description: string;
  productType: string;
  unitAmount: number;
  currency: string;
  deliverableId: string;
}

export async function createCheckout(cartId: string): Promise<CheckoutResult> {
  // Live keys are refused unless explicitly enabled (fail closed).
  if (stripeKeyIsLive() && !isLiveCheckoutEnabled()) return { ok: false, error: "live_payments_disabled" };
  const origin = validateOrigin(publicEnv.NEXT_PUBLIC_SITE_URL, { origins: getOriginAllowlist() });
  if (!origin) return { ok: false, error: "misconfigured" };

  const db = getPrivilegedClient();
  const { data: cart, error: cartErr } = await db
    .from("guest_carts").select("id, version").eq("id", cartId).eq("state", "active").single();
  if (cartErr) throw new Error("checkout_cart_failed");

  const { data: rows, error } = await db
    .from("guest_cart_items")
    .select(
      "product_id, products(id, slug, title, short_description, product_type, price, price_currency, row_version, lifecycle, rights_status, product_deliverables(id, version, active, validation_state))",
    )
    .eq("cart_id", cartId);
  if (error) throw new Error("checkout_items_failed");
  if (rows.length === 0) return { ok: false, error: "empty_cart" };

  const items: SnapshotItem[] = [];
  for (const row of rows) {
    const p = row.products;
    if (!p || p.lifecycle !== "published" || !(p.rights_status === "original" || p.rights_status === "licensed")) {
      return { ok: false, error: "unavailable_items" };
    }
    // Newest active, validated deliverable version is what the buyer purchases.
    const deliverable = p.product_deliverables
      .filter((d) => d.active && (d.validation_state === "ready" || d.validation_state === "active"))
      .sort((a, b) => b.version - a.version)[0];
    if (!deliverable) return { ok: false, error: "no_deliverable" };
    items.push({
      productId: p.id,
      rowVersion: p.row_version,
      slug: p.slug,
      title: p.title,
      description: p.short_description,
      productType: p.product_type,
      unitAmount: p.price,
      currency: p.price_currency.toLowerCase(),
      deliverableId: deliverable.id,
    });
  }
  const currency = items[0]!.currency;
  if (items.some((i) => i.currency !== currency)) return { ok: false, error: "mixed_currency" };
  const subtotal = computeSubtotal(items.map((i) => i.unitAmount));

  const fingerprint = cartFingerprint({
    currency,
    policyVersion: null,
    items: items.map((i) => ({
      productId: i.productId,
      productRowVersion: i.rowVersion,
      slug: i.slug,
      unitAmount: i.unitAmount,
      currency: i.currency,
      deliverableAssetId: i.deliverableId,
      licenseVersion: null,
      taxCode: null,
    })),
  });

  const stripe = getStripeClient();
  const reused = await reuseOpenSession(fingerprint, stripe);
  if (reused === PAYMENT_IN_PROGRESS) return { ok: false, error: "payment_in_progress" };
  if (reused) return { ok: true, url: reused };

  // Immutable attempt snapshot. The partial unique index allows one open
  // attempt per fingerprint; reuseOpenSession() retired any stale one.
  const expiresAt = new Date(Date.now() + CHECKOUT_SESSION_EXPIRY_MINUTES * 60_000);
  const attemptId = crypto.randomUUID();
  const { error: attemptErr } = await db.from("checkout_attempts").insert({
    id: attemptId,
    cart_id: cart.id,
    cart_version: cart.version,
    fingerprint,
    state: "creating",
    stripe_idempotency_key: checkoutIdempotencyKey(attemptId),
    expected_subtotal: subtotal,
    expected_currency: currency,
    expires_at: expiresAt.toISOString(),
  });
  if (attemptErr) throw new Error("checkout_attempt_failed");
  const { error: itemsErr } = await db.from("checkout_attempt_items").insert(
    items.map((i) => ({
      attempt_id: attemptId,
      product_id: i.productId,
      product_row_version: i.rowVersion,
      title: i.title,
      slug: i.slug,
      product_type: i.productType,
      unit_amount: i.unitAmount,
      currency: i.currency,
      deliverable_asset_id: i.deliverableId,
    })),
  );
  if (itemsErr) throw new Error("checkout_attempt_items_failed");

  let session: Stripe.Checkout.Session;
  try {
    const params = buildCheckoutSessionParams({
      attemptId,
      currency,
      cartInternalId: cart.id,
      policyVersion: null,
      canonicalOrigin: origin,
      lineItems: items.map((i) => ({
        slug: i.slug,
        title: i.title,
        description: i.description,
        unitAmount: i.unitAmount,
        currency: i.currency,
      })),
    }) as Stripe.Checkout.SessionCreateParams;
    session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: checkoutIdempotencyKey(attemptId),
    });
  } catch (e) {
    await db.from("checkout_attempts")
      .update({ state: "failed", failure_category: "stripe_create_failed", updated_at: new Date().toISOString() })
      .eq("id", attemptId);
    logError("checkout.stripe_create_failed", { objectType: "checkout_attempt", reasonCode: e instanceof Error ? e.name : "unknown" });
    throw new Error("checkout_stripe_failed");
  }

  const { error: openErr } = await db.from("checkout_attempts")
    .update({ state: "open", stripe_session_id: session.id, updated_at: new Date().toISOString() })
    .eq("id", attemptId);
  if (openErr) throw new Error("checkout_attempt_open_failed");
  if (!session.url) throw new Error("checkout_no_url");
  logInfo("checkout.session_created", { objectType: "checkout_attempt", measurements: { items: items.length } });
  return { ok: true, url: session.url };
}

const PAYMENT_IN_PROGRESS = Symbol("payment_in_progress");

/** Reuse an unexpired open Session for the identical cart; retire stale ones. */
async function reuseOpenSession(
  fingerprint: string,
  stripe: Stripe,
): Promise<string | typeof PAYMENT_IN_PROGRESS | null> {
  const db = getPrivilegedClient();
  const { data: open, error } = await db
    .from("checkout_attempts")
    .select("id, state, stripe_session_id")
    .eq("fingerprint", fingerprint)
    .in("state", ["creating", "open"])
    .maybeSingle();
  if (error) throw new Error("checkout_reuse_lookup_failed");
  if (!open) return null;
  if (open.stripe_session_id) {
    const s = await stripe.checkout.sessions.retrieve(open.stripe_session_id);
    if (s.status === "open" && s.url) return s.url;
    // Paid but the webhook hasn't landed yet: never open a second session
    // (that would double-charge). The webhook completes this attempt.
    if (s.status === "complete") return PAYMENT_IN_PROGRESS;
  }
  await db.from("checkout_attempts")
    .update({ state: "expired", updated_at: new Date().toISOString() })
    .eq("id", open.id)
    .in("state", ["creating", "open"]);
  return null;
}
