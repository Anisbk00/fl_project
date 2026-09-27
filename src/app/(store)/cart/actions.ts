"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addToCart, getCart, removeFromCart } from "@/features/cart/cart";
import { createCheckout } from "@/features/payments/checkout";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logError } from "@/lib/observability/logger";

/**
 * Cart Server Actions. Next.js rejects cross-origin Server Action calls
 * (Origin check), the inputs are re-validated in the cart module, and every
 * outcome is a redirect with a short error code the cart page explains.
 */

function fail(code: string): never {
  redirect(`/cart?error=${code}`);
}

export async function addToCartAction(formData: FormData) {
  if (!(await checkRateLimit(RATE_LIMITS.cartMutate, await headers()))) fail("rate_limited");
  let result;
  try {
    result = await addToCart(String(formData.get("productId") ?? ""));
  } catch (e) {
    logError("cart.add_failed", { reasonCode: e instanceof Error ? e.message : "unknown" });
    fail("unavailable");
  }
  if (!result.ok) fail(result.error);
  revalidatePath("/cart");
  redirect("/cart");
}

export async function removeFromCartAction(formData: FormData) {
  if (!(await checkRateLimit(RATE_LIMITS.cartMutate, await headers()))) fail("rate_limited");
  try {
    const result = await removeFromCart(String(formData.get("productId") ?? ""));
    if (!result.ok) fail(result.error);
  } catch (e) {
    unstable_rethrow(e);
    logError("cart.remove_failed", { reasonCode: e instanceof Error ? e.message : "unknown" });
    fail("unavailable");
  }
  revalidatePath("/cart");
  redirect("/cart");
}

export async function checkoutAction() {
  if (!(await checkRateLimit(RATE_LIMITS.checkoutCreate, await headers()))) fail("rate_limited");
  let url: string;
  try {
    const cart = await getCart();
    if (!cart || cart.lines.length === 0) fail("empty_cart");
    const result = await createCheckout(cart.id);
    if (!result.ok) fail(result.error);
    url = result.url;
  } catch (e) {
    unstable_rethrow(e);
    logError("checkout.failed", { reasonCode: e instanceof Error ? e.message : "unknown" });
    fail("checkout_unavailable");
  }
  redirect(url); // Stripe-hosted Checkout
}

