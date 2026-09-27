import { z } from "zod";

/**
 * Catalog trust-boundary schemas.
 *
 * Every value that crosses a trust boundary (admin form input, an API body,
 * a webhook payload surrogate) is validated here before it touches the
 * data-access layer. The database column types are intentionally permissive
 * strings (SQLite/Prisma cannot express Postgres enums in this sandbox); these
 * schemas are the authoritative, narrowed set of allowed values.
 *
 * In production these constraints are mirrored by Postgres enums + CHECK
 * constraints + RLS; here they are enforced by Zod at the edge.
 */

export const PRODUCT_TYPES = [
  "project_file",
  "remake",
  "stems",
  "sample_pack",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const LIFECYCLES = ["draft", "published", "archived"] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

export const productTypeSchema = z.enum(PRODUCT_TYPES);
export const lifecycleSchema = z.enum(LIFECYCLES);

const slugRegex = /^(?!-)[a-z0-9]+(?:-[a-z0-9]+)*(?<!-)$/;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    slugRegex,
    "slug must be lowercase kebab-case (a-z0-9, hyphens between segments)",
  )
  .max(160);

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "currency must be a 3-letter ISO 4217 code");

export const bpmSchema = z.number().int().min(1).max(400);

export const priceSchema = z
  .number()
  .int("price must be an integer in minor currency units")
  .min(0, "price must be >= 0");

export const mediaKindSchema = z.enum([
  "cover_image",
  "audio_preview",
  "video_preview",
]);

/**
 * Input schema for creating a product. This is the trust boundary: the browser
 * is NEVER trusted for price or entitlement data, but a trusted admin's form
 * input is still validated before it reaches the database.
 */
export const createProductInputSchema = z
  .object({
    slug: slugSchema,
    title: z.string().trim().min(1).max(200),
    shortDescription: z.string().trim().min(1).max(300),
    longDescription: z.string().trim().max(20000).optional(),
    productType: productTypeSchema,
    price: priceSchema,
    priceCurrency: currencySchema.default("USD"),
    compareAtPrice: z.number().int().min(0).optional(),
    dawName: z.string().trim().max(100).optional(),
    dawVersion: z.string().trim().max(100).optional(),
    bpm: bpmSchema.optional(),
    musicalKey: z.string().trim().max(50).optional(),
    durationSeconds: z.number().int().min(1).optional(),
    totalSizeBytes: z.number().int().min(0).optional(),
    includedFormats: z.string().trim().max(300).optional(),
    featured: z.boolean().default(false),
    seoTitle: z.string().trim().max(200).optional(),
    seoDescription: z.string().trim().max(300).optional(),
  })
  .refine(
    (data) =>
      data.compareAtPrice === undefined || data.compareAtPrice >= data.price,
    { message: "compare_at_price must be >= price", path: ["compareAtPrice"] },
  );

export type CreateProductInput = z.infer<typeof createProductInputSchema>;
