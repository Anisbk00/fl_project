# Download Security

Token/session model, fragment exchange, crypto/key versions, private Storage
policies, signed-URL TTL/residual risk, issuance quota, headers/CSP, abuse
controls, threat analysis. See `src/features/fulfillment/crypto.ts`.

## Token cryptography

- 32 random bytes, base64url, prefixed with a non-secret key version.
- HMAC-SHA-256 digest (HKDF-derived subkey) for DB lookup.
- AES-256-GCM encryption (HKDF-derived subkey) with AAD bound to token ID,
  order ID, generation, purpose, key version, expiry.
- Key rotation: current + previous keys (never remove while ciphertext depends
  on it). `buildKeyRing()` validates versions + key length.
- Tamper/AAD/nonce/version failures → null (silent rejection).
- The raw token NEVER enters a DB column, log, audit, metric, or provider tag.

## Fragment exchange

Token is in the URL fragment (`/downloads/access#t=v1.xxx`), NOT the path/query.
The initial GET sends no token to the server. A small Client Component reads
the fragment into memory, removes it from history, and waits for an explicit
"Continue" POST. Manual paste fallback for clients that strip fragments.
The POST exchanges the token for a `__Host-` HttpOnly Secure SameSite=Strict
session cookie (30-minute absolute lifetime). Single-use; concurrent exchange
→ at most one session.

## Private Storage

Paid deliverables stay in the private `product-private` bucket. Anonymous and
ordinary authenticated roles cannot list/read. Only the server-secret client
issues short-lived signed URLs after validating a current entitlement + session.
Signed-URL TTL: 120s (hard max 10m). Never persisted or logged.

## Issuance quota

Counts successful + reserved signed-URL issuances per order item (default 10).
Failed/expired reservations do NOT permanently consume quota (cleaned by
reconciliation). `releaseReservation()` decrements without counting as success.

## Headers

All access/download/recovery responses: `no-store`, `Referrer-Policy: no-referrer`,
`X-Robots-Tag: noindex,nofollow,noarchive`, strict CSP (no third-party origins).
No analytics/session-replay/advertising scripts on these routes.

## Threat analysis

- Token guessing: 256 bits + keyed digest → infeasible.
- Token interception: fragment + HTTPS + single-use exchange.
- Signed-URL sharing: 120s residual window documented honestly.
- Quota exhaustion: bounded + AAL2 reset path.
- Refund revocation: holds/revoke all + future issuance denied.
- Admin abuse: AAL2-only; never decrypts/displays raw tokens/URLs.
