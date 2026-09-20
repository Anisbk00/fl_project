# Email Delivery

Provider interface, Resend configuration, immutable payload/idempotency,
templates, retries, webhook events, bounce/suppression, latency, safe test
addresses, deliverability/DNS, no-attachment rule.

## Provider interface

`TransactionalEmailProvider` (server-only): `send(payload, idempotencyKey)` →
provider message ID + safe status. `verifyWebhook(rawBody, headers)` → verified
event. Domain code imports the interface, never the Resend SDK directly.

## Resend adapter (production)

- Official stable Resend SDK; API key server-only; verified `from` + `reply-to`.
- Both HTML + plain text; stable idempotency key per message.
- Non-PII tags (environment, message kind) — never order number/email/token.
- Classify timeouts/429/5xx as retryable; validation errors as dead-letter.
- Handle same-key/different-payload + concurrent-idempotency conflicts.
- NO attachments; NO open/click tracking; NO marketing/audiences.

## Test adapter

Deterministic; records safe structured facts in test memory; never allows
production selection. Local/preview uses the test adapter or an allowlisted
recipient override.

## Immutable payload

`prepareEmailPayload()` (tested) builds one immutable HTML + plain-text payload
with a SHA-256 hash. Retries send the exact same bytes. A changed payload under
the same idempotency key is rejected. All variable content is HTML-escaped +
CRLF-sanitized. No tracking pixel / third-party image / remote font.

## Retries

Immediate → seconds → tens of seconds → minutes. Bounded attempts (8).
Dead-letter on exhaustion. Reconciliation repairs stuck/accepted-not-finalized.

## Resend webhooks

`/api/resend/webhook` (Node runtime, no-store): raw-body Svix verification
(`svix-id`/`svix-timestamp`/`svix-signature`); persist verified event before 2xx;
duplicate/concurrent/out-of-order handled idempotently. Subscribed: `email.sent/
delivered/delivery_delayed/bounced/failed/complained/suppressed`. No `opened/
clicked` (tracking disabled). Bounce/complaint never revokes an entitlement but
stops blind resend loops.

## Latency semantics

Provider acceptance = API accepted. Sent = attempt to receiving system.
Delivered = recipient mail server accepted (not human-read). The under-60-second
SLO is paid→provider-accepted. Inbox delivery is controlled by receiving systems.

## DNS / deliverability (release blockers)

Verified transactional subdomain; DKIM/SPF/DMARC; return path; tracking disabled;
region/TLS; API key scope/rotation; webhook creation/signing-secret rotation;
retention/privacy settings. These remain release blockers until verified.
