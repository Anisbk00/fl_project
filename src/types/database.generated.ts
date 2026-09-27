// Generated from the live Supabase schema (supabase gen types). Do not edit by hand.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          active: boolean
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          display_name: string | null
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          display_name?: string | null
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          display_name?: string | null
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_uid: string | null
          changed_fields: Json | null
          context: Json | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_uid?: string | null
          changed_fields?: Json | null
          context?: Json | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_uid?: string | null
          changed_fields?: Json | null
          context?: Json | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      checkout_attempt_items: {
        Row: {
          attempt_id: string
          currency: string
          deliverable_asset_id: string
          license_version: string | null
          product_id: string
          product_row_version: number
          product_type: string
          quantity: number
          slug: string
          tax_code: string | null
          title: string
          unit_amount: number
        }
        Insert: {
          attempt_id: string
          currency: string
          deliverable_asset_id: string
          license_version?: string | null
          product_id: string
          product_row_version: number
          product_type: string
          quantity?: number
          slug: string
          tax_code?: string | null
          title: string
          unit_amount: number
        }
        Update: {
          attempt_id?: string
          currency?: string
          deliverable_asset_id?: string
          license_version?: string | null
          product_id?: string
          product_row_version?: number
          product_type?: string
          quantity?: number
          slug?: string
          tax_code?: string | null
          title?: string
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "attempt_items_deliverable_fk"
            columns: ["deliverable_asset_id"]
            isOneToOne: false
            referencedRelation: "product_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_attempt_items_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "checkout_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_attempts: {
        Row: {
          cart_id: string
          cart_version: number
          created_at: string
          expected_currency: string
          expected_subtotal: number
          expires_at: string
          failure_category: string | null
          fingerprint: string
          id: string
          policy_version: string | null
          state: string
          stripe_idempotency_key: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
        }
        Insert: {
          cart_id: string
          cart_version: number
          created_at?: string
          expected_currency: string
          expected_subtotal: number
          expires_at: string
          failure_category?: string | null
          fingerprint: string
          id?: string
          policy_version?: string | null
          state?: string
          stripe_idempotency_key: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Update: {
          cart_id?: string
          cart_version?: number
          created_at?: string
          expected_currency?: string
          expected_subtotal?: number
          expires_at?: string
          failure_category?: string | null
          fingerprint?: string
          id?: string
          policy_version?: string | null
          state?: string
          stripe_idempotency_key?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_attempts_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "guest_carts"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_messages: {
        Row: {
          accepted_at: string | null
          access_token_id: string | null
          attempt_count: number
          bounced_at: string | null
          correlation_id: string | null
          created_at: string
          dead_at: string | null
          delivered_at: string | null
          failed_at: string | null
          generation_id: string
          id: string
          lease_until: string | null
          message_kind: string
          next_attempt_at: string | null
          order_id: string
          payload_hash: string | null
          provider: string
          provider_idempotency_key: string
          provider_message_id: string | null
          safe_error_class: string | null
          send_sequence: number
          sent_at: string | null
          state: string
          template_version: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          access_token_id?: string | null
          attempt_count?: number
          bounced_at?: string | null
          correlation_id?: string | null
          created_at?: string
          dead_at?: string | null
          delivered_at?: string | null
          failed_at?: string | null
          generation_id: string
          id?: string
          lease_until?: string | null
          message_kind: string
          next_attempt_at?: string | null
          order_id: string
          payload_hash?: string | null
          provider?: string
          provider_idempotency_key: string
          provider_message_id?: string | null
          safe_error_class?: string | null
          send_sequence: number
          sent_at?: string | null
          state?: string
          template_version: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          access_token_id?: string | null
          attempt_count?: number
          bounced_at?: string | null
          correlation_id?: string | null
          created_at?: string
          dead_at?: string | null
          delivered_at?: string | null
          failed_at?: string | null
          generation_id?: string
          id?: string
          lease_until?: string | null
          message_kind?: string
          next_attempt_at?: string | null
          order_id?: string
          payload_hash?: string | null
          provider?: string
          provider_idempotency_key?: string
          provider_message_id?: string | null
          safe_error_class?: string | null
          send_sequence?: number
          sent_at?: string | null
          state?: string
          template_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_messages_access_token_id_fkey"
            columns: ["access_token_id"]
            isOneToOne: false
            referencedRelation: "download_access_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_messages_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      download_access_sessions: {
        Row: {
          created_at: string
          expires_at: string
          generation_id: string
          id: string
          last_used_at: string | null
          order_id: string
          revocation_reason: string | null
          revoked_at: string | null
          token_digest: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          generation_id: string
          id?: string
          last_used_at?: string | null
          order_id: string
          revocation_reason?: string | null
          revoked_at?: string | null
          token_digest: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          generation_id?: string
          id?: string
          last_used_at?: string | null
          order_id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          token_digest?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_access_sessions_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "download_access_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      download_access_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          creation_reason: string
          encrypted_envelope: Json | null
          expires_at: string
          generation_id: string
          id: string
          key_version: number
          last_sent_at: string | null
          order_id: string
          revocation_reason: string | null
          revoked_at: string | null
          token_digest: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          creation_reason?: string
          encrypted_envelope?: Json | null
          expires_at: string
          generation_id: string
          id?: string
          key_version: number
          last_sent_at?: string | null
          order_id: string
          revocation_reason?: string | null
          revoked_at?: string | null
          token_digest: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          creation_reason?: string
          encrypted_envelope?: Json | null
          expires_at?: string
          generation_id?: string
          id?: string
          key_version?: number
          last_sent_at?: string | null
          order_id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          token_digest?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_access_tokens_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "download_access_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      download_url_issuances: {
        Row: {
          created_at: string
          entitlement_id: string
          expires_at: string | null
          id: string
          idempotency_key: string
          issued_at: string | null
          reserved_at: string
          safe_error_class: string | null
          session_id: string
          state: string
        }
        Insert: {
          created_at?: string
          entitlement_id: string
          expires_at?: string | null
          id?: string
          idempotency_key: string
          issued_at?: string | null
          reserved_at?: string
          safe_error_class?: string | null
          session_id: string
          state?: string
        }
        Update: {
          created_at?: string
          entitlement_id?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          issued_at?: string | null
          reserved_at?: string
          safe_error_class?: string | null
          session_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_url_issuances_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "download_url_issuances_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "download_access_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_webhook_inbox: {
        Row: {
          attempt_count: number
          correlation_id: string | null
          event_type: string
          id: string
          last_error: string | null
          lease_until: string | null
          next_attempt_at: string | null
          processed_at: string | null
          provider: string
          provider_event_id: string
          provider_message_id: string | null
          received_at: string
          state: string
        }
        Insert: {
          attempt_count?: number
          correlation_id?: string | null
          event_type: string
          id?: string
          last_error?: string | null
          lease_until?: string | null
          next_attempt_at?: string | null
          processed_at?: string | null
          provider?: string
          provider_event_id: string
          provider_message_id?: string | null
          received_at?: string
          state?: string
        }
        Update: {
          attempt_count?: number
          correlation_id?: string | null
          event_type?: string
          id?: string
          last_error?: string | null
          lease_until?: string | null
          next_attempt_at?: string | null
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          provider_message_id?: string | null
          received_at?: string
          state?: string
        }
        Relationships: []
      }
      fulfillment_entitlements: {
        Row: {
          created_at: string
          deliverable_asset_id: string
          first_issuance_at: string | null
          generation_id: string
          hold_reason: string | null
          id: string
          issuance_quota_snapshot: number
          last_issuance_at: string | null
          order_id: string
          order_item_id: string
          reserved_issuances: number
          revocation_reason: string | null
          state: string
          successful_issuances: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deliverable_asset_id: string
          first_issuance_at?: string | null
          generation_id: string
          hold_reason?: string | null
          id?: string
          issuance_quota_snapshot?: number
          last_issuance_at?: string | null
          order_id: string
          order_item_id: string
          reserved_issuances?: number
          revocation_reason?: string | null
          state?: string
          successful_issuances?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deliverable_asset_id?: string
          first_issuance_at?: string | null
          generation_id?: string
          hold_reason?: string | null
          id?: string
          issuance_quota_snapshot?: number
          last_issuance_at?: string | null
          order_id?: string
          order_item_id?: string
          reserved_issuances?: number
          revocation_reason?: string | null
          state?: string
          successful_issuances?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_deliverable_fk"
            columns: ["deliverable_asset_id"]
            isOneToOne: false
            referencedRelation: "product_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_entitlements_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_entitlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_generations: {
        Row: {
          created_at: string
          creator_type: string | null
          creator_uid: string | null
          generation: number
          id: string
          order_id: string
          policy_snapshot: Json
          reason: string
          state: string
        }
        Insert: {
          created_at?: string
          creator_type?: string | null
          creator_uid?: string | null
          generation: number
          id?: string
          order_id: string
          policy_snapshot: Json
          reason: string
          state?: string
        }
        Update: {
          created_at?: string
          creator_type?: string | null
          creator_uid?: string | null
          generation?: number
          id?: string
          order_id?: string
          policy_snapshot?: Json
          reason?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_generations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_outbox: {
        Row: {
          aggregate_id: string
          attempt_count: number
          completed_at: string | null
          correlation_id: string | null
          created_at: string
          dead_at: string | null
          id: string
          idempotency_key: string
          job_type: string
          last_error_class: string | null
          lease_owner: string | null
          lease_until: string | null
          next_attempt_at: string
          priority: number
          state: string
          updated_at: string
        }
        Insert: {
          aggregate_id: string
          attempt_count?: number
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          dead_at?: string | null
          id?: string
          idempotency_key: string
          job_type: string
          last_error_class?: string | null
          lease_owner?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          priority?: number
          state?: string
          updated_at?: string
        }
        Update: {
          aggregate_id?: string
          attempt_count?: number
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          dead_at?: string | null
          id?: string
          idempotency_key?: string
          job_type?: string
          last_error_class?: string | null
          lease_owner?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          priority?: number
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      genres: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      guest_cart_items: {
        Row: {
          cart_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "guest_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_carts: {
        Row: {
          converted_at: string | null
          converted_order_id: string | null
          created_at: string
          currency: string
          expires_at: string
          id: string
          last_activity_at: string
          state: string
          token_digest: string
          updated_at: string
          version: number
        }
        Insert: {
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          last_activity_at?: string
          state?: string
          token_digest: string
          updated_at?: string
          version?: number
        }
        Update: {
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          last_activity_at?: string
          state?: string
          token_digest?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          currency: string
          deliverable_asset_id: string
          license_version: string | null
          order_id: string
          product_id: string
          product_row_version: number
          product_type: string
          quantity: number
          slug: string
          title: string
          unit_amount: number
        }
        Insert: {
          currency: string
          deliverable_asset_id: string
          license_version?: string | null
          order_id: string
          product_id: string
          product_row_version: number
          product_type: string
          quantity?: number
          slug: string
          title: string
          unit_amount: number
        }
        Update: {
          currency?: string
          deliverable_asset_id?: string
          license_version?: string | null
          order_id?: string
          product_id?: string
          product_row_version?: number
          product_type?: string
          quantity?: number
          slug?: string
          title?: string
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_deliverable_fk"
            columns: ["deliverable_asset_id"]
            isOneToOne: false
            referencedRelation: "product_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_refunded: number
          buyer_email: string | null
          checkout_attempt_id: string
          created_at: string
          currency: string
          discount: number
          dispute_state: string
          failed_at: string | null
          fulfillment_state: string
          id: string
          manual_review_reason: string | null
          order_number: string
          paid_at: string | null
          payment_state: string
          refund_state: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_refunded?: number
          buyer_email?: string | null
          checkout_attempt_id: string
          created_at?: string
          currency: string
          discount?: number
          dispute_state?: string
          failed_at?: string | null
          fulfillment_state?: string
          id?: string
          manual_review_reason?: string | null
          order_number: string
          paid_at?: string | null
          payment_state?: string
          refund_state?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id: string
          subtotal: number
          tax?: number
          total: number
          updated_at?: string
        }
        Update: {
          amount_refunded?: number
          buyer_email?: string | null
          checkout_attempt_id?: string
          created_at?: string
          currency?: string
          discount?: number
          dispute_state?: string
          failed_at?: string | null
          fulfillment_state?: string
          id?: string
          manual_review_reason?: string | null
          order_number?: string
          paid_at?: string | null
          payment_state?: string
          refund_state?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      plugins: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          vendor: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          vendor?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          vendor?: string | null
        }
        Relationships: []
      }
      product_deliverables: {
        Row: {
          active: boolean
          bucket: string
          bytes: number
          checksum_verified_at: string | null
          created_at: string
          created_by_uid: string | null
          customer_filename: string
          detected_type: string | null
          id: string
          mime_type: string
          product_id: string
          sha_256: string | null
          storage_object_path: string
          updated_at: string
          validation_state: string
          version: number
        }
        Insert: {
          active?: boolean
          bucket?: string
          bytes: number
          checksum_verified_at?: string | null
          created_at?: string
          created_by_uid?: string | null
          customer_filename: string
          detected_type?: string | null
          id?: string
          mime_type: string
          product_id: string
          sha_256?: string | null
          storage_object_path: string
          updated_at?: string
          validation_state?: string
          version?: number
        }
        Update: {
          active?: boolean
          bucket?: string
          bytes?: number
          checksum_verified_at?: string | null
          created_at?: string
          created_by_uid?: string | null
          customer_filename?: string
          detected_type?: string | null
          id?: string
          mime_type?: string
          product_id?: string
          sha_256?: string | null
          storage_object_path?: string
          updated_at?: string
          validation_state?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_deliverables_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_genres: {
        Row: {
          genre_id: string
          product_id: string
        }
        Insert: {
          genre_id: string
          product_id: string
        }
        Update: {
          genre_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_genres_genre_id_fkey"
            columns: ["genre_id"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_genres_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string | null
          bucket: string
          bytes: number | null
          checksum_verified_at: string | null
          created_at: string
          created_by_uid: string | null
          detected_type: string | null
          external_url: string | null
          id: string
          kind: Database["public"]["Enums"]["media_kind"]
          mime_type: string | null
          product_id: string
          server_checksum: string | null
          storage_object_path: string | null
          validation_state: string
          version: number
        }
        Insert: {
          alt_text?: string | null
          bucket?: string
          bytes?: number | null
          checksum_verified_at?: string | null
          created_at?: string
          created_by_uid?: string | null
          detected_type?: string | null
          external_url?: string | null
          id?: string
          kind: Database["public"]["Enums"]["media_kind"]
          mime_type?: string | null
          product_id: string
          server_checksum?: string | null
          storage_object_path?: string | null
          validation_state?: string
          version?: number
        }
        Update: {
          alt_text?: string | null
          bucket?: string
          bytes?: number | null
          checksum_verified_at?: string | null
          created_at?: string
          created_by_uid?: string | null
          detected_type?: string | null
          external_url?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          mime_type?: string | null
          product_id?: string
          server_checksum?: string | null
          storage_object_path?: string | null
          validation_state?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_plugins: {
        Row: {
          min_version: string | null
          plugin_id: string
          product_id: string
          required: boolean
        }
        Insert: {
          min_version?: string | null
          plugin_id: string
          product_id: string
          required?: boolean
        }
        Update: {
          min_version?: string | null
          plugin_id?: string
          product_id?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_plugins_plugin_id_fkey"
            columns: ["plugin_id"]
            isOneToOne: false
            referencedRelation: "plugins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_plugins_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_rights: {
        Row: {
          created_at: string
          evidence_ref: string | null
          internal_notes: string | null
          license_expires_at: string | null
          product_id: string
          restrictions: string | null
          reviewed_at: string | null
          reviewer_uid: string | null
          rights_status: Database["public"]["Enums"]["rights_status"]
          source_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_ref?: string | null
          internal_notes?: string | null
          license_expires_at?: string | null
          product_id: string
          restrictions?: string | null
          reviewed_at?: string | null
          reviewer_uid?: string | null
          rights_status?: Database["public"]["Enums"]["rights_status"]
          source_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_ref?: string | null
          internal_notes?: string | null
          license_expires_at?: string | null
          product_id?: string
          restrictions?: string | null
          reviewed_at?: string | null
          reviewer_uid?: string | null
          rights_status?: Database["public"]["Enums"]["rights_status"]
          source_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_rights_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          bpm: number | null
          compare_at_price: number | null
          created_at: string
          created_by_id: string | null
          daw_name: string | null
          daw_version: string | null
          duration_seconds: number | null
          featured: boolean
          id: string
          included_formats: string | null
          lifecycle: Database["public"]["Enums"]["product_lifecycle"]
          long_description: string | null
          musical_key: string | null
          price: number
          price_currency: string
          product_type: Database["public"]["Enums"]["product_type"]
          published_at: string | null
          rights_status: Database["public"]["Enums"]["rights_status"]
          row_version: number
          search_vector: unknown
          seo_description: string | null
          seo_title: string | null
          short_description: string
          slug: string
          title: string
          total_size_bytes: number | null
          updated_at: string
          updated_by_id: string | null
        }
        Insert: {
          bpm?: number | null
          compare_at_price?: number | null
          created_at?: string
          created_by_id?: string | null
          daw_name?: string | null
          daw_version?: string | null
          duration_seconds?: number | null
          featured?: boolean
          id?: string
          included_formats?: string | null
          lifecycle?: Database["public"]["Enums"]["product_lifecycle"]
          long_description?: string | null
          musical_key?: string | null
          price: number
          price_currency?: string
          product_type: Database["public"]["Enums"]["product_type"]
          published_at?: string | null
          rights_status?: Database["public"]["Enums"]["rights_status"]
          row_version?: number
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          short_description: string
          slug: string
          title: string
          total_size_bytes?: number | null
          updated_at?: string
          updated_by_id?: string | null
        }
        Update: {
          bpm?: number | null
          compare_at_price?: number | null
          created_at?: string
          created_by_id?: string | null
          daw_name?: string | null
          daw_version?: string | null
          duration_seconds?: number | null
          featured?: boolean
          id?: string
          included_formats?: string | null
          lifecycle?: Database["public"]["Enums"]["product_lifecycle"]
          long_description?: string | null
          musical_key?: string | null
          price?: number
          price_currency?: string
          product_type?: Database["public"]["Enums"]["product_type"]
          published_at?: string | null
          rights_status?: Database["public"]["Enums"]["rights_status"]
          row_version?: number
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string
          slug?: string
          title?: string
          total_size_bytes?: number | null
          updated_at?: string
          updated_by_id?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          internal_request_id: string
          order_id: string
          reason: string | null
          requesting_admin_uid: string | null
          state: string
          stripe_failure_code: string | null
          stripe_idempotency_key: string
          stripe_refund_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          internal_request_id: string
          order_id: string
          reason?: string | null
          requesting_admin_uid?: string | null
          state?: string
          stripe_failure_code?: string | null
          stripe_idempotency_key: string
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          internal_request_id?: string
          order_id?: string
          reason?: string | null
          requesting_admin_uid?: string | null
          state?: string
          stripe_failure_code?: string | null
          stripe_idempotency_key?: string
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_intents: {
        Row: {
          created_at: string
          creator_uid: string
          expected_size: number | null
          expected_type: string | null
          expires_at: string
          id: string
          original_filename: string | null
          product_id: string
          role: string
          staging_path: string
          state: string
        }
        Insert: {
          created_at?: string
          creator_uid: string
          expected_size?: number | null
          expected_type?: string | null
          expires_at: string
          id?: string
          original_filename?: string | null
          product_id: string
          role: string
          staging_path: string
          state?: string
        }
        Update: {
          created_at?: string
          creator_uid?: string
          expected_size?: number | null
          expected_type?: string | null
          expires_at?: string
          id?: string
          original_filename?: string | null
          product_id?: string
          role?: string
          staging_path?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_intents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_inbox: {
        Row: {
          api_version: string | null
          attempt_count: number
          correlation_id: string | null
          event_type: string
          last_error: string | null
          lease_until: string | null
          livemode: boolean
          next_attempt_at: string | null
          payload: Json | null
          processed_at: string | null
          received_at: string
          related_object_id: string | null
          state: string
          stripe_event_id: string
        }
        Insert: {
          api_version?: string | null
          attempt_count?: number
          correlation_id?: string | null
          event_type: string
          last_error?: string | null
          lease_until?: string | null
          livemode: boolean
          next_attempt_at?: string | null
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          related_object_id?: string | null
          state?: string
          stripe_event_id: string
        }
        Update: {
          api_version?: string | null
          attempt_count?: number
          correlation_id?: string | null
          event_type?: string
          last_error?: string | null
          lease_until?: string | null
          livemode?: boolean
          next_attempt_at?: string | null
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          related_object_id?: string | null
          state?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aal2: { Args: never; Returns: boolean }
      admin_attention_counts: {
        Args: never
        Returns: {
          dead_webhooks: number
          failed_emails: number
          held_orders: number
          manual_review_checkouts: number
          open_disputes: number
          stuck_fulfillment: number
        }[]
      }
      admin_sales_summary: {
        Args: { p_since: string }
        Returns: {
          currency: string
          gross: number
          paid_orders: number
          refunded: number
        }[]
      }
      after_order_paid_extension: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      archive_product: {
        Args: { p_expected_version: number; p_product_id: string }
        Returns: {
          errors: Json
          ok: boolean
        }[]
      }
      get_product_by_slug: {
        Args: { p_slug: string }
        Returns: {
          bpm: number
          compare_at_price: number
          created_at: string
          daw_name: string
          daw_version: string
          duration_seconds: number
          featured: boolean
          genres: Json
          id: string
          included_formats: string
          lifecycle: Database["public"]["Enums"]["product_lifecycle"]
          long_description: string
          media: Json
          musical_key: string
          plugins: Json
          price: number
          price_currency: string
          product_type: Database["public"]["Enums"]["product_type"]
          published_at: string
          rights_status: Database["public"]["Enums"]["rights_status"]
          seo_description: string
          seo_title: string
          short_description: string
          slug: string
          title: string
          total_size_bytes: number
          updated_at: string
        }[]
      }
      get_related_products: {
        Args: { p_limit?: number; p_slug: string }
        Returns: {
          audio_preview_path: string
          bpm: number
          compare_at_price: number
          cover_path: string
          daw_name: string
          daw_version: string
          duration_seconds: number
          featured: boolean
          genres: Json
          id: string
          included_formats: string
          musical_key: string
          plugins: Json
          price: number
          price_currency: string
          product_type: Database["public"]["Enums"]["product_type"]
          published_at: string
          short_description: string
          slug: string
          title: string
          total_size_bytes: number
        }[]
      }
      is_active_admin: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      list_free_products: {
        Args: never
        Returns: {
          audio_preview_path: string
          bpm: number
          compare_at_price: number
          cover_path: string
          daw_name: string
          daw_version: string
          duration_seconds: number
          featured: boolean
          genres: Json
          id: string
          included_formats: string
          musical_key: string
          plugins: Json
          price: number
          price_currency: string
          product_type: Database["public"]["Enums"]["product_type"]
          published_at: string
          short_description: string
          slug: string
          title: string
          total_size_bytes: number
        }[]
      }
      mark_order_paid: {
        Args: {
          p_attempt_id: string
          p_buyer_email: string
          p_expected_currency: string
          p_expected_environment: string
          p_expected_subtotal: number
          p_items: Json
          p_order_number: string
          p_stripe_charge_id: string
          p_stripe_discount: number
          p_stripe_livemode: boolean
          p_stripe_payment_intent: string
          p_stripe_session_id: string
          p_stripe_subtotal: number
          p_stripe_tax: number
          p_stripe_total: number
        }
        Returns: {
          errors: Json
          ok: boolean
          order_id: string
        }[]
      }
      publish_product: {
        Args: { p_expected_version: number; p_product_id: string }
        Returns: {
          errors: Json
          ok: boolean
        }[]
      }
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      revoke_fulfillment: {
        Args: { p_action: string; p_order_id: string; p_reason: string }
        Returns: undefined
      }
      search_products: {
        Args: {
          p_bpm_max?: number
          p_bpm_min?: number
          p_daw?: string
          p_genres?: string[]
          p_musical_key?: string
          p_page?: number
          p_page_size?: number
          p_plugin_free?: boolean
          p_plugins?: string[]
          p_price_currency?: string
          p_price_max?: number
          p_price_min?: number
          p_q?: string
          p_sort?: string
          p_types?: string[]
        }
        Returns: {
          audio_preview_path: string
          bpm: number
          compare_at_price: number
          cover_path: string
          created_at: string
          daw_name: string
          daw_version: string
          duration_seconds: number
          featured: boolean
          genres: Json
          id: string
          included_formats: string
          lifecycle: Database["public"]["Enums"]["product_lifecycle"]
          long_description: string
          musical_key: string
          plugins: Json
          price: number
          price_currency: string
          product_type: Database["public"]["Enums"]["product_type"]
          published_at: string
          rights_status: Database["public"]["Enums"]["rights_status"]
          seo_description: string
          seo_title: string
          short_description: string
          slug: string
          title: string
          total_count: number
          total_size_bytes: number
          updated_at: string
        }[]
      }
      unpublish_product: {
        Args: { p_expected_version: number; p_product_id: string }
        Returns: {
          errors: Json
          ok: boolean
        }[]
      }
    }
    Enums: {
      media_kind: "cover_image" | "audio_preview" | "video_preview"
      product_lifecycle: "draft" | "published" | "archived"
      product_type: "project_file" | "remake" | "stems" | "sample_pack"
      rights_status: "unreviewed" | "original" | "licensed" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      media_kind: ["cover_image", "audio_preview", "video_preview"],
      product_lifecycle: ["draft", "published", "archived"],
      product_type: ["project_file", "remake", "stems", "sample_pack"],
      rights_status: ["unreviewed", "original", "licensed", "rejected"],
    },
  },
} as const
