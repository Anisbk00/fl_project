/**
 * Optimistic concurrency (Step 4). The editor sends the last-read
 * `row_version` with every mutation; the server/DB compares it atomically and
 * returns a typed conflict when another edit won. Never silently overwrite a
 * newer version.
 */
export interface ConcurrencyCheck {
  conflict: boolean;
  expected: number;
  current: number;
}

export function checkConcurrency(
  expected: number,
  current: number,
): ConcurrencyCheck {
  return {
    expected,
    current,
    conflict: expected !== current,
  };
}

/** A typed conflict result returned to the editor on a stale write. */
export class ConcurrencyConflictError extends Error {
  readonly code = "conflict" as const;
  constructor(
    message: string,
    readonly expected: number,
    readonly current: number,
  ) {
    super(message);
  }
}
