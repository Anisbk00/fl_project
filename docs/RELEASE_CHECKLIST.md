# RELEASE CHECKLIST

Step 8 hardening module. See the corresponding pure-logic modules in
`src/lib/observability/` + `src/lib/security/` + the tests in
`tests/observability/`.

## Key invariants
- Instrumentation never becomes a data leak. Logs, traces, metrics, analytics,
  errors, alerts, CSP reports, and artifacts pass canary leakage tests.
- Telemetry never authorizes payments, fulfillment, downloads, admin access,
  policy publication, or promotion redemption.
- CSP is a tested security control (strict baseline, Report-Only before
  enforcement, no unsafe-eval/unjustified unsafe-inline).
- Rate limits are durable, privacy-minimized, non-enumerating, and fail-closed
  for security-sensitive endpoints.
- Performance budgets are route-specific (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1).
- Accessibility targets WCAG 2.2 AA; automated tools are incomplete.
- Backup ≠ restore. An isolated restore drill is required before release.
- Live charging remains fail-closed. No production deployment.
