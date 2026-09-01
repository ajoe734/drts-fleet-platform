import { sanitizeLogMessage, type DriverAuthState } from "@/lib/api-client";

/**
 * Internal-only diagnostics for the driver app.
 *
 * These records exist so that support can reconstruct *why* the workspace went
 * into a restricted state. They are deliberately kept out of the UI: the
 * product requirement forbids showing source code, call stacks, file names,
 * environment variable names, API paths or HTTP status codes to a driver.
 *
 * Everything here is emitted through `console.warn` on purpose. React Native's
 * LogBox turns `console.error` into a full-screen red overlay, which would
 * itself be a user-visible technical leak.
 */

export type DriverDiagnosticKind =
  | "workspace_degrade"
  | "workspace_recover"
  | "identity_refresh"
  | "api_failure"
  | "feature_flag_fallback";

export type DriverDiagnosticRequestOutcome = "ok" | "failed" | "skipped";

export type DriverDiagnosticInput = {
  kind: DriverDiagnosticKind;
  reason: string;
  identityState?: DriverAuthState | null;
  connectivity?: string | null;
  requestResults?: Record<string, DriverDiagnosticRequestOutcome>;
  at?: string;
};

export type DriverDiagnosticRecord = {
  kind: DriverDiagnosticKind;
  reason: string;
  identityState: DriverAuthState | "unknown";
  connectivity: string;
  requestResults: Record<string, DriverDiagnosticRequestOutcome>;
  at: string;
};

const MAX_DIAGNOSTICS = 50;

const ring: DriverDiagnosticRecord[] = [];

/**
 * `sanitizeLogMessage` strips bearer tokens, JWTs and credential-looking
 * key/value pairs. Guarded so a diagnostic can never throw on its own.
 */
function safeSanitize(value: unknown): string | null {
  try {
    return sanitizeLogMessage(value);
  } catch {
    return null;
  }
}

function normalizeReason(reason: string): string {
  return safeSanitize(reason) ?? "unknown";
}

/**
 * Appends one diagnostic record to the in-memory ring buffer and mirrors it to
 * the developer console. Never throws: diagnostics must not be able to break a
 * screen that is already handling a failure.
 */
export function recordDriverDiagnostic(
  event: DriverDiagnosticInput,
): DriverDiagnosticRecord {
  const record: DriverDiagnosticRecord = {
    kind: event.kind,
    reason: normalizeReason(event.reason),
    identityState: event.identityState ?? "unknown",
    connectivity: event.connectivity ?? "unknown",
    requestResults: { ...(event.requestResults ?? {}) },
    at: event.at ?? new Date().toISOString(),
  };

  ring.push(record);
  while (ring.length > MAX_DIAGNOSTICS) {
    ring.shift();
  }

  try {
    // console.warn (not console.error): LogBox renders console.error as a
    // blocking red overlay on device, which would surface internals to drivers.
    console.warn(
      `[driver-diagnostics] ${record.kind}`,
      safeSanitize(
        JSON.stringify({
          reason: record.reason,
          identityState: record.identityState,
          connectivity: record.connectivity,
          requestResults: record.requestResults,
          at: record.at,
        }),
      ),
    );
  } catch {
    // Logging must never break the caller.
  }

  return record;
}

/** Most recent diagnostics, oldest first. For tests and internal inspection. */
export function getDriverDiagnostics(): ReadonlyArray<DriverDiagnosticRecord> {
  return ring.slice();
}

/** Test helper: empties the ring buffer. */
export function clearDriverDiagnostics(): void {
  ring.length = 0;
}

/**
 * Classifies a request failure without exposing the raw error anywhere near
 * the UI. Used to decide whether a failure means "the network is gone" or "the
 * server answered and refused".
 */
export function classifyDriverRequestFailure(
  error: unknown,
): "offline" | "timeout" | "denied" | "server" | "unknown" {
  const raw =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";
  const text = raw.toLowerCase();

  if (text.includes("abort") || text.includes("timeout")) {
    return "timeout";
  }
  if (
    text.includes("network request failed") ||
    text.includes("failed to fetch") ||
    text.includes("networkerror")
  ) {
    return "offline";
  }
  const statusMatch = /api error (\d{3})/.exec(text);
  if (statusMatch) {
    const status = Number.parseInt(statusMatch[1], 10);
    if (status === 401 || status === 403) {
      return "denied";
    }
    if (status >= 500) {
      return "server";
    }
    return "server";
  }
  return "unknown";
}
