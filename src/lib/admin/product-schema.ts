import { z } from "zod";

/**
 * Product form schema + shared action result types.
 *
 * Lives OUTSIDE the `"use server"` actions file because `"use server"` modules
 * can only export async functions — a Zod schema object is not a function.
 * Both the server actions and the client form component import from here so
 * validation stays in sync.
 */

export type FieldErrors = Record<string, string>;

export interface ActionResult {
  ok: boolean;
  /** Per-field validation errors (keyed by the form field name). */
  errors?: FieldErrors;
  /** Top-level, user-readable error message for non-field failures. */
  message?: string;
}

// ---------------------------------------------------------------------------
// Validation schemas (mirror the DB CHECK constraints exactly)
// ---------------------------------------------------------------------------

const SLUG_REGEX = /^(?!-)[a-z0-9]+(?:-[a-z0-9]+)*(?<!-)$/;
const CURRENCY_REGEX = /^[A-Z]{3}$/;

export const productFormSchema = z.object({
  id: z.string().uuid().optional(),
  rowVersion: z.number().int().min(1).optional(),
  title: z
    .string()
    .trim()
    .min(1, "Title is required (1–200 characters).")
    .max(200, "Title must be 200 characters or fewer."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      SLUG_REGEX,
      "Slug must be lowercase kebab-case (a–z, 0–9, hyphens between segments).",
    )
    .max(160, "Slug must be 160 characters or fewer."),
  shortDescription: z
    .string()
    .trim()
    .min(1, "Short description is required (1–300 characters).")
    .max(300, "Short description must be 300 characters or fewer."),
  longDescription: z
    .string()
    .trim()
    .max(20000, "Long description must be 20,000 characters or fewer.")
    .optional()
    .nullable(),
  productType: z.enum(["project_file", "remake", "stems", "sample_pack"]),
  price: z
    .number()
    .int("Price must be an integer in minor currency units (e.g. 2400 = $24.00).")
    .min(0, "Price must be ≥ 0 (use 0 for free)."),
  priceCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CURRENCY_REGEX, "Currency must be a 3-letter ISO 4217 code (e.g. USD)."),
  compareAtPrice: z
    .number()
    .int("Compare-at price must be an integer in minor currency units.")
    .min(0, "Compare-at price must be ≥ 0.")
    .optional()
    .nullable(),
  dawName: z.string().trim().max(100).optional().nullable(),
  dawVersion: z.string().trim().max(100).optional().nullable(),
  bpm: z.number().int().min(1).max(400).optional().nullable(),
  musicalKey: z.string().trim().max(50).optional().nullable(),
  durationSeconds: z.number().int().min(1).optional().nullable(),
  totalSizeBytes: z.number().int().min(0).optional().nullable(),
  includedFormats: z.string().trim().max(300).optional().nullable(),
  featured: z.boolean(),
  seoTitle: z.string().trim().max(200).optional().nullable(),
  seoDescription: z.string().trim().max(300).optional().nullable(),
  // Taxonomy joins (from the form's hidden field JSON).
  genres: z.array(z.string().uuid()).optional().default([]),
  plugins: z
    .array(
      z.object({
        id: z.string().uuid(),
        minVersion: z.string().trim().max(50).optional().nullable(),
        required: z.boolean(),
      }),
    )
    .optional()
    .default([]),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
