import {
  INTERNAL_KEY_EXCEPTION_REGISTRY,
  matchesScope,
  type InternalKeyExceptionMetadata,
} from "./internal-key-exception-registry";

const MAX_METRIC_ENTRIES = 1000;

export function escapePrometheusLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function parseRoute(route: string): { method?: string; path?: string } {
  const trimmed = route.trim();
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx > 0) {
    return {
      method: trimmed.slice(0, spaceIdx).toUpperCase(),
      path: trimmed.slice(spaceIdx + 1).trim(),
    };
  }
  return { path: trimmed };
}

export function normalizeMetricRoute(
  route: string | undefined,
  exception?: InternalKeyExceptionMetadata,
): string {
  if (!route) return "other";
  const { method, path } = parseRoute(route);
  if (!path) return "other";

  if (exception?.scope) {
    for (const pattern of exception.scope) {
      if (
        pattern !== "* *" &&
        pattern !== "*" &&
        matchesScope(pattern, method, path)
      ) {
        return pattern;
      }
    }
  }

  for (const entry of INTERNAL_KEY_EXCEPTION_REGISTRY) {
    for (const pattern of entry.scope) {
      if (
        pattern !== "* *" &&
        pattern !== "*" &&
        matchesScope(pattern, method, path)
      ) {
        return pattern;
      }
    }
  }

  return "other";
}

export class InternalKeyMetrics {
  private static instance: InternalKeyMetrics;

  public readonly driftAlertCounter = new Map<string, number>();
  public readonly unauthorizedAttemptsCounter = new Map<string, number>();
  public readonly rotationPreviousUsedCounter = new Map<string, number>();

  public static getInstance(): InternalKeyMetrics {
    if (!InternalKeyMetrics.instance) {
      InternalKeyMetrics.instance = new InternalKeyMetrics();
    }
    return InternalKeyMetrics.instance;
  }

  private incrementBoundedMap(map: Map<string, number>, key: string): void {
    if (!map.has(key) && map.size >= MAX_METRIC_ENTRIES) {
      return;
    }
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  public recordDriftAlert(
    exceptionId: string | undefined,
    code: string | undefined,
    route: string | undefined,
    exception?: InternalKeyExceptionMetadata,
  ): void {
    const safeExceptionId = escapePrometheusLabelValue(exceptionId ?? "none");
    const safeCode = escapePrometheusLabelValue(code ?? "unknown");
    const safeRoute = escapePrometheusLabelValue(
      normalizeMetricRoute(route, exception),
    );
    const key = `exception_id="${safeExceptionId}",code="${safeCode}",route="${safeRoute}"`;
    this.incrementBoundedMap(this.driftAlertCounter, key);
  }

  public recordUnauthorizedAttempt(
    code: string | undefined,
    route: string | undefined,
    exception?: InternalKeyExceptionMetadata,
  ): void {
    const safeCode = escapePrometheusLabelValue(code ?? "unknown");
    const safeRoute = escapePrometheusLabelValue(
      normalizeMetricRoute(route, exception),
    );
    const key = `code="${safeCode}",route="${safeRoute}"`;
    this.incrementBoundedMap(this.unauthorizedAttemptsCounter, key);
  }

  public recordRotationPreviousUsed(
    exceptionId: string | undefined,
    owner: string | undefined,
  ): void {
    const safeExceptionId = escapePrometheusLabelValue(exceptionId ?? "none");
    const safeOwner = escapePrometheusLabelValue(owner ?? "unknown");
    const key = `exception_id="${safeExceptionId}",owner="${safeOwner}"`;
    this.incrementBoundedMap(this.rotationPreviousUsedCounter, key);
  }

  public reset(): void {
    this.driftAlertCounter.clear();
    this.unauthorizedAttemptsCounter.clear();
    this.rotationPreviousUsedCounter.clear();
  }

  public toPrometheusFormat(): string {
    const lines: string[] = [];

    lines.push(
      "# HELP drts_internal_key_drift_alert_total Counter of internal key drift alerts",
    );
    lines.push("# TYPE drts_internal_key_drift_alert_total counter");
    for (const [keyLabels, val] of this.driftAlertCounter.entries()) {
      lines.push(`drts_internal_key_drift_alert_total{${keyLabels}} ${val}`);
    }

    lines.push(
      "# HELP drts_internal_key_unauthorized_attempts_total Counter of unauthorized internal key attempts",
    );
    lines.push("# TYPE drts_internal_key_unauthorized_attempts_total counter");
    for (const [keyLabels, val] of this.unauthorizedAttemptsCounter.entries()) {
      lines.push(
        `drts_internal_key_unauthorized_attempts_total{${keyLabels}} ${val}`,
      );
    }

    lines.push(
      "# HELP drts_internal_key_rotation_previous_used_total Counter of rotated previous internal key usages",
    );
    lines.push(
      "# TYPE drts_internal_key_rotation_previous_used_total counter",
    );
    for (const [keyLabels, val] of this.rotationPreviousUsedCounter.entries()) {
      lines.push(
        `drts_internal_key_rotation_previous_used_total{${keyLabels}} ${val}`,
      );
    }

    return lines.join("\n");
  }
}

export const internalKeyMetrics = InternalKeyMetrics.getInstance();
