# Environment + Ownership Matrix

Variable names + classifications only. Never values.

| Variable | Provider | Owner | Scope | Classification | Boundary | Creation | Rotation | Restart? | Validation | Emergency Revocation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NEXT_PUBLIC_SITE_URL | App | REQUIRES_OWNER | prod | public | browser | deploy config | on domain change | yes | URL format | n/a |
| NEXT_PUBLIC_SITE_NAME | App | REQUIRES_OWNER | all | public | browser | deploy config | on rename | yes | non-empty | n/a |
| NEXT_PUBLIC_SUPABASE_URL | Supabase | REQUIRES_OWNER | per-env | public | browser | Supabase project | on project change | yes | URL format | n/a |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Supabase | REQUIRES_OWNER | per-env | public | browser | Supabase project | on key rotation | yes | key format | n/a |
| SUPABASE_URL | Supabase | REQUIRES_OWNER | per-env | secret | server | Supabase project | on project change | yes | URL format | revoke key |
| SUPABASE_SECRET_KEY | Supabase | REQUIRES_OWNER | per-env | secret | server | Supabase project | on key rotation | yes | key format | revoke key |
| STRIPE_SECRET_KEY | Stripe | REQUIRES_OWNER | per-env | secret | server | Stripe Dashboard | on key rotation | yes | sk_live_/sk_test_ prefix | revoke key in Dashboard |
| STRIPE_WEBHOOK_SECRET | Stripe | REQUIRES_OWNER | per-env | secret | server | Stripe CLI/Dashboard | on endpoint rotation | yes | whsec_ prefix | recreate endpoint |
| CART_TOKEN_PEPPER | App | REQUIRES_OWNER | per-env | secret | server | operator script | on key rotation | yes | ≥32 bytes | rotate + rehash |
| CHECKOUT_ORIGIN_ALLOWLIST | App | REQUIRES_OWNER | per-env | sensitive | server | deploy config | on domain change | yes | comma-separated | n/a |
| LIVE_CHECKOUT_ENABLED | App | REQUIRES_OWNER | per-env | sensitive | server | deploy config | manual | yes | boolean | set false |
| RESEND_API_KEY | Resend | REQUIRES_OWNER | per-env | secret | server | Resend Dashboard | on key rotation | yes | re_ prefix | revoke key |
| RESEND_WEBHOOK_SECRET | Resend | REQUIRES_OWNER | per-env | secret | server | Resend Dashboard | on endpoint rotation | yes | non-empty | recreate endpoint |
| RESEND_FROM_EMAIL | Resend | REQUIRES_OWNER | per-env | sensitive | server | deploy config | on domain change | yes | email format | n/a |
| CRON_SECRET | App | REQUIRES_OWNER | per-env | secret | server | operator script | on rotation | yes | ≥32 bytes | rotate |
| FULFILLMENT_ROOT_KEY_HEX | App | REQUIRES_OWNER | per-env | secret | server | operator script | on key rotation | yes | ≥64 hex chars | rotate + re-encrypt |
| FULFILLMENT_PREV_KEY_HEX | App | REQUIRES_OWNER | per-env | secret | server | operator script | on previous rotation | yes | ≥64 hex chars | remove after re-encrypt |
| FULFILLMENT_KEY_VERSION | App | REQUIRES_OWNER | per-env | sensitive | server | deploy config | on key rotation | yes | non-negative int | n/a |
