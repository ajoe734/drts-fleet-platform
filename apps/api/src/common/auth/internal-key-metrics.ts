const MAX_METRIC_ENTRIES = 1000;

export function escapePrometheusLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function normalizeMetricRoute(route: string | undefined): string {
  if (!route) return "unknown";
  const queryIndex = route.indexOf("?");
  const pathOnly = queryIndex >= 0 ? route.slice(0, queryIndex) : route;
  return pathOnly.trim() || "unknown";
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
  ): void {
    const safeExceptionId = escapePrometheusLabelValue(exceptionId ?? "none");
    const safeCode = escapePrometheusLabelValue(code ?? "unknown");
    const safeRoute = escapePrometheusLabelValue(normalizeMetricRoute(route));
    const key = `exception_id="${safeExceptionId}",code="${safeCode}",route="${safeRoute}"`;
    this.incrementBoundedMap(this.driftAlertCounter, key);
  }

  public recordUnauthorizedAttempt(
    code: string | undefined,
    route: string | undefined,
  ): void {
    const safeCode = escapePrometheusLabelValue(code ?? "unknown");
    const safeRoute = escapePrometheusLabelValue(normalizeMetricRoute(route));
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
