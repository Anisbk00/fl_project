/**
 * ============================================================================
 * Hand-authored Supabase `Database` type.
 * ----------------------------------------------------------------------------
 * This is the TypeScript source of truth for the catalog schema. It mirrors
 * the production SQL migrations in `supabase/migrations/` (enums, tables,
 * columns, the `is_admin()` function).
 *
 * In a real project, regenerate from the live database instead:
 *   supabase gen types --typescript --local > src/types/database.generated.ts
 * and prefer the generated file. This hand-authored file exists so the
 * application type-checks and builds WITHOUT a live Supabase project, which is
 * required for Step 1 (no local DB, no Prisma — Supabase only).
 *
 * If the migration SQL changes, update this file to match.
 * ============================================================================
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Enums: {
      product_type: "project_file" | "remake" | "stems" | "sample_pack";
      product_lifecycle: "draft" | "published" | "archived";
      rights_status: "unreviewed" | "original" | "licensed" | "rejected";
      media_kind: "cover_image" | "audio_preview" | "video_preview";
    };
    Tables: {
      admin_users: {
        Row: {
          user_id: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      genres: {
        Row: {
          id: string;
          slug: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      plugins: {
        Row: {
          id: string;
          slug: string;
          name: string;
          vendor: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          vendor?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          vendor?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          slug: string;
          title: string;
          short_description: string;
          long_description: string | null;
          product_type: Database["public"]["Enums"]["product_type"];
          lifecycle: Database["public"]["Enums"]["product_lifecycle"];
          rights_status: Database["public"]["Enums"]["rights_status"];
          price: number;
          price_currency: string;
          compare_at_price: number | null;
          daw_name: string | null;
          daw_version: string | null;
          bpm: number | null;
          musical_key: string | null;
          duration_seconds: number | null;
          total_size_bytes: number | null;
          included_formats: string | null;
          featured: boolean;
          seo_title: string | null;
          seo_description: string | null;
          created_at: string;
          updated_at: string;
          published_at: string | null;
          created_by_id: string | null; // admin audit, never public
          updated_by_id: string | null; // admin audit, never public
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          short_description: string;
          long_description?: string | null;
          product_type: Database["public"]["Enums"]["product_type"];
          lifecycle?: Database["public"]["Enums"]["product_lifecycle"];
          rights_status?: Database["public"]["Enums"]["rights_status"];
          price: number;
          price_currency?: string;
          compare_at_price?: number | null;
          daw_name?: string | null;
          daw_version?: string | null;
          bpm?: number | null;
          musical_key?: string | null;
          duration_seconds?: number | null;
          total_size_bytes?: number | null;
          included_formats?: string | null;
          featured?: boolean;
          seo_title?: string | null;
          seo_description?: string | null;
          created_at?: string;
          updated_at?: string;
          published_at?: string | null;
          created_by_id?: string | null;
          updated_by_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      product_genres: {
        Row: {
          product_id: string;
          genre_id: string;
        };
        Insert: {
          product_id: string;
          genre_id: string;
        };
        Update: {
          product_id?: string;
          genre_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_genres_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_genres_genre_id_fkey";
            columns: ["genre_id"];
            referencedRelation: "genres";
            referencedColumns: ["id"];
          },
        ];
      };
      product_plugins: {
        Row: {
          product_id: string;
          plugin_id: string;
          min_version: string | null;
          required: boolean;
        };
        Insert: {
          product_id: string;
          plugin_id: string;
          min_version?: string | null;
          required?: boolean;
        };
        Update: {
          product_id?: string;
          plugin_id?: string;
          min_version?: string | null;
          required?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "product_plugins_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_plugins_plugin_id_fkey";
            columns: ["plugin_id"];
            referencedRelation: "plugins";
            referencedColumns: ["id"];
          },
        ];
      };
      product_media: {
        Row: {
          id: string;
          product_id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          bucket: string;
          storage_object_path: string | null;
          external_url: string | null;
          mime_type: string | null;
          bytes: number | null;
          alt_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          bucket?: string;
          storage_object_path?: string | null;
          external_url?: string | null;
          mime_type?: string | null;
          bytes?: number | null;
          alt_text?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_media"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_deliverables: {
        Row: {
          id: string;
          product_id: string;
          bucket: string;
          storage_object_path: string;
          customer_filename: string;
          mime_type: string;
          bytes: number;
          version: number;
          sha_256: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          bucket?: string;
          storage_object_path: string;
          customer_filename: string;
          mime_type: string;
          bytes: number;
          version?: number;
          sha_256?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_deliverables"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "product_deliverables_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    CompositeTypes: Record<string, never>;
  };
};
