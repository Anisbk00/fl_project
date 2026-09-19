import { mock } from "bun:test";

/**
 * Test preload.
 *
 * The `server-only` package is designed to be resolved by the Next.js bundler:
 * in a server graph it resolves to an empty module; in a client graph it
 * resolves to a module that throws. Bun's test runner is NOT the Next bundler,
 * so the default (throwing) build is imported, which would crash any test that
 * imports a server-only-guarded module.
 *
 * Here we stub `server-only` to an empty module for the test runtime only.
 * This does NOT weaken the real production guard: the `server-only` import is
 * still present in source, so a Client Component importing these modules still
 * fails the production build. We are only bypassing the runtime throw for the
 * purpose of running server modules under `bun test`.
 */
mock.module("server-only", () => ({}));
