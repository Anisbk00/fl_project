/**
 * Ambient type shim for `bun:test`.
 *
 * Bun's real test API is provided at runtime by the bun test runner. This
 * declaration gives the TypeScript compiler a minimal, test-only shape for the
 * `bun:test` module so that `tsc --noEmit` can type-check the test files
 * without pulling in the full bun-types ambient globals (which could clash
 * with Next.js's process/node typings). It is intentionally loose for the
 * matchers; the real `bun:test` implementation provides stricter runtime
 * behavior and will fail any incorrect assertion at runtime.
 */
declare module "bun:test" {
  type TestFn = () => void | Promise<void>;
  type SuiteFn = () => void;

  interface ExpectMatchers<T> {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toContain(expected: unknown): void;
    toHaveLength(n: number): void;
    toHaveProperty(prop: string | symbol): void;
    toMatch(pattern: RegExp | string): void;
    toThrow(expected?: unknown): void;
    toBeInstanceOf(cls: unknown): void;
    toBeGreaterThan(n: number): void;
    toBeGreaterThanOrEqual(n: number): void;
    toBeLessThan(n: number): void;
    toBeLessThanOrEqual(n: number): void;
    readonly not: ExpectMatchers<T>;
  }

  interface ExpectPromise<_T> {
    toThrow(expected?: unknown): Promise<void>;
    toBe(expected: unknown): Promise<void>;
    toEqual(expected: unknown): Promise<void>;
    toBeTruthy(): Promise<void>;
    toBeFalsy(): Promise<void>;
  }

  interface Expect<T> extends ExpectMatchers<T> {
    resolves: ExpectPromise<T>;
    rejects: ExpectPromise<T>;
  }

  export function describe(name: string, fn: SuiteFn): void;
  export function describe(name: string, fn: () => void): void;
  export namespace describe {
    function skip(name: string, fn: SuiteFn): void;
    function skipIf(condition: boolean): (name: string, fn: SuiteFn) => void;
    function only(name: string, fn: SuiteFn): void;
    function todo(name: string): void;
  }
  export const it: {
    (name: string, fn: TestFn): void;
    only(name: string, fn: TestFn): void;
    skip(name: string, fn: TestFn): void;
    skipIf(condition: boolean): (name: string, fn: TestFn) => void;
    todo(name: string): void;
  };
  export const test: typeof it;
  export function beforeAll(fn: TestFn): void;
  export function beforeEach(fn: TestFn): void;
  export function afterAll(fn: TestFn): void;
  export function afterEach(fn: TestFn): void;
  export function expect<T>(actual: T): Expect<T>;
  export function expect(actual: unknown): Expect<unknown>;
  export const mock: {
    module(moduleName: string, factory: () => unknown): void;
  };
}
