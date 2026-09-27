import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { getPrivilegedClient } from "@/lib/supabase/privileged";
import { getCartPepper } from "@/lib/env/server";
import {
  CART_IDLE_EXPIRY_DAYS,
  MAX_CART_ITEMS,
  cartCookieName,
  cartCookieOptions,
  digestCartToken,
  generateCartToken,
} from "@/features/payments/cart-token";

/**
 * Server-owned guest cart. The browser holds only an opaque HttpOnly token;
 * the DB stores its HMAC digest. The cart stores product IDs only — prices,
 * availability and currency are always re-read from `products`.
 */

const secureCookies = process.env.NODE_ENV === "production";
const COOKIE = cartCookieName(secureCookies);

export const productIdSchema = z.string().uuid();

export interface CartLine {
  productId: string;
  slug: string;
  title: string;
  /** Current authoritative price in minor units (null when unavailable). */
  price: number | null;
  currency: string | null;
  /** Published right now. */
  available: boolean;
}

export interface Cart {
  id: string;
  lines: CartLine[];
}

async function findCartId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const { data, error } = await getPrivilegedClient()
    .from("guest_carts")
    .select("id")
    .eq("token_digest", digestCartToken(raw, getCartPepper()))
    .eq("state", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error("cart_lookup_failed");
  return data?.id ?? null;
}

async function createCart(): Promise<string> {
  const token = generateCartToken();
  const { data, error } = await getPrivilegedClient()
    .from("guest_carts")
    .insert({ token_digest: digestCartToken(token, getCartPepper()) })
    .select("id")
    .single();
  if (error) throw new Error("cart_create_failed");
  (await cookies()).set(
    COOKIE,
    token,
    cartCookieOptions({ secure: secureCookies, maxAgeSeconds: CART_IDLE_EXPIRY_DAYS * 86400 }),
  );
  return data.id;
}

/** Load the current cart with authoritative product facts, or null if none. */
export async function getCart(): Promise<Cart | null> {
  const id = await findCartId();
  if (!id) return null;
  const db = getPrivilegedClient();
  const { data, error } = await db
    .from("guest_cart_items")
    .select("product_id, created_at, products(slug, title, price, price_currency, lifecycle)")
    .eq("cart_id", id)
    .order("created_at");
  if (error) throw new Error("cart_items_failed");
  const lines = data.map((row): CartLine => {
    const p = row.products;
    const available = !!p && p.lifecycle === "published";
    return {
      productId: row.product_id,
      slug: p?.slug ?? "",
      title: p?.title ?? "Unavailable product",
      price: available ? p.price : null,
      currency: available ? p.price_currency.toLowerCase() : null,
      available,
    };
  });
  return { id, lines };
}

export type CartMutationResult = { ok: true } | { ok: false; error: string };

export async function addToCart(productId: string): Promise<CartMutationResult> {
  if (!productIdSchema.safeParse(productId).success) return { ok: false, error: "invalid_product" };
  const db = getPrivilegedClient();

  // Only published products may enter a cart.
  const { data: product, error: pErr } = await db
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("lifecycle", "published")
    .maybeSingle();
  if (pErr) throw new Error("product_lookup_failed");
  if (!product) return { ok: false, error: "unavailable" };

  const cartId = (await findCartId()) ?? (await createCart());
  const { count, error: cErr } = await db
    .from("guest_cart_items")
    .select("product_id", { count: "exact", head: true })
    .eq("cart_id", cartId);
  if (cErr) throw new Error("cart_count_failed");
  if ((count ?? 0) >= MAX_CART_ITEMS) return { ok: false, error: "cart_full" };

  // Quantity is always one; a duplicate add is a no-op.
  const { error } = await db
    .from("guest_cart_items")
    .upsert({ cart_id: cartId, product_id: productId }, { onConflict: "cart_id,product_id", ignoreDuplicates: true });
  if (error) throw new Error("cart_add_failed");
  await touchCart(cartId);
  return { ok: true };
}

export async function removeFromCart(productId: string): Promise<CartMutationResult> {
  if (!productIdSchema.safeParse(productId).success) return { ok: false, error: "invalid_product" };
  const cartId = await findCartId();
  if (!cartId) return { ok: true };
  const { error } = await getPrivilegedClient()
    .from("guest_cart_items")
    .delete()
    .eq("cart_id", cartId)
    .eq("product_id", productId);
  if (error) throw new Error("cart_remove_failed");
  await touchCart(cartId);
  return { ok: true };
}

async function touchCart(cartId: string) {
  const now = new Date();
  const { error } = await getPrivilegedClient()
    .from("guest_carts")
    .update({
      last_activity_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + CART_IDLE_EXPIRY_DAYS * 86400_000).toISOString(),
    })
    .eq("id", cartId);
  if (error) throw new Error("cart_touch_failed");
}
