import "server-only";
import { redactForTelemetry, sanitizeLogValue, boundString } from "./redaction";

/**
 * Server-only structured JSON logging facade (Step 8).
 *
 * Allowlisted schema: timestamp, severity, event name+version, environment,
 * route template (never raw URL), correlation ID, safe actor class, safe
 * object type, outcome+reason code, attempt, duration, measurements.
 *
 * Sanitizes CR/LF/control chars (log injection defense). Centralized
 * recursive redaction. Logging failures are bounded + non-fatal — they never
 * authorize operations, hide business failures, or trigger retry storms.
 *
 * Never logs: request/response bodies, cookies, auth headers, webhook
 * signatures, database URLs, provider payloads, emails, raw IPs, tokens,
 * URL fragments, signed URLs, private paths, encryption material.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  severity: LogLevel;
  event: string;
  eventVersion: string;
  environment: string;
  routeTemplate?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  actorClass?: string;
  objectType?: string;
  outcome?: string;
  reasonCode?: string;
  attempt?: number;
  durationMs?: number;
  measurements?: Record<string, number>;
  message?: string;
  [key: string]: unknown;
}

const MAX_MESSAGE_LEN = 500;
const MAX_STACK_LEN = 2000;
const MAX_ENTRY_KEYS = 32;

function now(): string {
  return new Date().toISOString();
}

function env(): string {
  return process.env.NODE_ENV ?? "development";
}

/** Emit a structured log entry. Redacted + sanitized. Bounded + non-fatal. */
export function log(entry: Partial<LogEntry>): void {
  try {
    const redacted = redactForTelemetry(entry) as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    let keyCount = 0;
    for (const [k, v] of Object.entries(redacted)) {
      if (keyCount >= MAX_ENTRY_KEYS) break;
      if (typeof v === "string") {
        sanitized[k] = boundString(sanitizeLogValue(v), k === "stack" ? MAX_STACK_LEN : MAX_MESSAGE_LEN);
      } else {
        sanitized[k] = v;
      }
      keyCount++;
    }
    const output: LogEntry = {
      timestamp: now(),
      severity: entry.severity ?? "info",
      event: entry.event ?? "unknown",
      eventVersion: entry.eventVersion ?? "1",
      environment: env(),
      ...sanitized,
    };
    // Strip query strings + fragments from routeTemplate.
    if (output.routeTemplate) {
      output.routeTemplate = output.routeTemplate.split("?")[0]?.split("#")[0];
    }
    const level = output.severity;
    if (level === "error") {
      console.error(JSON.stringify(output));
    } else if (level === "warn") {
      console.warn(JSON.stringify(output));
    } else if (level === "debug") {
      if (env() !== "production") console.debug(JSON.stringify(output));
    } else {
      console.log(JSON.stringify(output));
    }
  } catch {
    // Logging failures are non-fatal. Do not throw or retry.
  }
}

/** Convenience helpers. */
export function logInfo(event: string, extra?: Partial<LogEntry>): void {
  log({ severity: "info", event, ...extra });
}
export function logWarn(event: string, extra?: Partial<LogEntry>): void {
  log({ severity: "warn", event, ...extra });
}
export function logError(event: string, extra?: Partial<LogEntry>): void {
  log({ severity: "error", event, ...extra });
}
