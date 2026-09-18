---
Task ID: 1
Agent: Z.ai Code (main)
Task: Step 1 — Foundation, architecture, and secure catalog data layer of the Music Project Store (implement Step 1 only).

Work Log:
- Read existing project (Next.js 16 / bun / Prisma+SQLite / shadcn). Confirmed environment differs from the plan's pnpm+Supabase+Vercel; adapted faithfully and documented.
- Hardened tsconfig: strict + noUncheckedIndexedAccess (+ noImplicitOverride, noFallthroughCasesInSwitch, noImplicitReturns). Excluded examples/skills/mini-services/supabase from type-check (pre-existing demo/skill files).
- next.config.ts: poweredByHeader:false, reactStrictMode, typescript.ignoreBuildErrors:false, global security headers (nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy). CSP deliberately deferred to Step 8.
- package.json: renamed to music-project-store; engines.node 24.x; packageManager bun@1.3.14; added typecheck/test/test:db/db:seed scripts. .node-version=24.
- Env layer: .env.example; src/lib/env/public.ts (eager Zod validation, safe dev defaults); src/lib/env/server.ts (lazy, server-only, never prints secrets); index barrel.
- Installed @supabase/supabase-js, @supabase/ssr, server-only. Created three server-only-guarded client factories: publishable.ts, server.ts (cookie-aware, getAll/setAll shape), privileged.ts (secret key, never compensates for broken RLS).
- Prisma schema (prisma/schema.prisma): AdminUser allow-list, Genre, Plugin, Product (with lifecycle/rights/money/technical/SEO/audit), ProductGenre, ProductPlugin, ProductMedia (public), ProductDeliverable (private), with indexes. db:push + db:generate succeeded.
- Access matrix in src/features/catalog/data-access.ts: public reads use explicit select omitting deliverables + admin audit columns; filter lifecycle=published AND rights in (original,licensed); every mutation calls requireAdmin + Zod. visibility.ts + publish-constraint.ts are pure, unit-tested helpers. schema.ts = Zod trust boundary.
- src/lib/auth/is-admin.ts: isAdmin/requireAdmin against AdminUser allow-list (maps to production is_admin() SECURITY DEFINER). UnauthorizedError.
- src/lib/security: headers.ts, redact.ts (scrubs sb_secret_*, Bearer, JWTs), rate-limit.ts (documented stub, NOT a fake in-memory limiter).
- Minimal accessible Step 1 home page (src/app/page.tsx): one semantic H1, implemented/pending sections, sticky footer (min-h-screen flex flex-col, main flex-1, footer mt-auto). layout.tsx metadata from validated env, robots noindex.
- Tests (bun test): env, redact, visibility, publish-constraint, DB-backed access-matrix (real SQLite, seeds/denies), smoke. 53 pass / 0 fail. tests/bun-test.d.ts ambient shim for bun:test; tests/setup.ts stubs server-only for the runtime only (production guard unaffected); bunfig.toml preload.
- Documentation: README.md, docs/ARCHITECTURE.md, docs/SECURITY.md, docs/ROADMAP.md (Steps 2-9 unimplemented), docs/DECISIONS.md.
- Production Supabase artifacts (committed, correct, not runnable here): supabase/migrations/0001_catalog_schema.sql (enums, CHECK publication guardrail, indexes), 0002_rls_and_admin.sql (RLS policies per operation + is_admin() SECURITY DEFINER + grants), 0003_storage_buckets.sql (public/private buckets + storage RLS), supabase/tests/catalog_rls.test.sql (pgTAP).
- prisma/seed.ts: fictional original products only. .github/workflows/ci.yml + .github/dependabot.yml.
- Verification run: lint ✓, typecheck ✓, db:generate ✓, db:push ✓, db:seed ✓, bun test 53/0 ✓. Dev server boots clean; agent-browser confirmed / renders, correct title, one H1, no console/runtime errors, no hydration mismatch; security headers present via curl; sticky-footer pattern verified mobile+desktop.

Stage Summary:
- Step 1 complete and browser-verified. No Step 2+ feature implemented.
- Honest blockers: production build (`bun run build`) intentionally not run per sandbox rules (verified via lint+typecheck+test+dev boot instead); Supabase CLI migrations / pgTAP / real RLS not runnable in sandbox (equivalent guarantees proven by application-layer DB-backed tests).
- Recommended next prompt title: "Step 2 — Brand system and responsive storefront shell".
