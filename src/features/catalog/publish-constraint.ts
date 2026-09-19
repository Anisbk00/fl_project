import { PUBLISHABLE_RIGHTS, type RightsStatus } from "./schema";

/**
 * The publication constraint.
 *
 * A product may move to `lifecycle = "published"` ONLY when:
 *   1. rightsStatus is "original" or "licensed" (rights-cleared); and
 *   2. price is a valid integer >= 0; and
 *   3. priceCurrency is a 3-letter code; and
 *   4. the required public metadata (title, short description, product type)
 *      are present.
 *
 * This is the engineering guardrail that prevents shipping a product whose
 * rights have not been cleared. It is NOT a substitute for legal review — see
 * docs/SECURITY.md and the "Legal and operational release gate".
 *
 * In production this is ALSO enforced by a Postgres CHECK constraint so a bug
 * or a privileged-client misuse cannot bypass it. In this sandbox it is
 * enforced by assertPublishable() in the data-access write path.
 */

export class PublicationError extends Error {}

export interface PublishableProduct {
  rightsStatus: RightsStatus | string;
  price: number;
  priceCurrency: string;
  title: string;
  shortDescription: string;
  productType: string;
}

export function canPublish(product: PublishableProduct): boolean {
  if (!PUBLISHABLE_RIGHTS.includes(product.rightsStatus as RightsStatus)) {
    return false;
  }
  if (!Number.isInteger(product.price) || product.price < 0) {
    return false;
  }
  if (!/^[A-Z]{3}$/.test(product.priceCurrency)) {
    return false;
  }
  if (!product.title || !product.shortDescription || !product.productType) {
    return false;
  }
  return true;
}

export function assertPublishable(product: PublishableProduct): void {
  if (!PUBLISHABLE_RIGHTS.includes(product.rightsStatus as RightsStatus)) {
    throw new PublicationError(
      `Cannot publish: rights status must be one of ${PUBLISHABLE_RIGHTS.join(
        ", ",
      )} (got "${product.rightsStatus}"). The product is not rights-cleared.`,
    );
  }
  if (!Number.isInteger(product.price) || product.price < 0) {
    throw new PublicationError(
      "Cannot publish: price must be a non-negative integer (minor currency units).",
    );
  }
  if (!/^[A-Z]{3}$/.test(product.priceCurrency)) {
    throw new PublicationError(
      "Cannot publish: price_currency must be a 3-letter ISO 4217 code.",
    );
  }
  if (!product.title || !product.shortDescription || !product.productType) {
    throw new PublicationError(
      "Cannot publish: title, short_description, and product_type are required.",
    );
  }
}
