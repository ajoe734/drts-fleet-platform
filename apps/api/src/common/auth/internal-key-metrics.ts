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

  public recordDriftAlert(
    exceptionId: string | undefined,
    code: string | undefined,
    route: string | undefined,
  ): void {
    const key = `exception_id=${exceptionId ?? "none"},code=${code ?? "unknown"},route=${route ?? "unknown"}`;
    this.driftAlertCounter.set(key, (this.driftAlertCounter.get(key) ?? 0) + 1);
  }

  public recordUnauthorizedAttempt(
    code: string | undefined,
    route: string | undefined,
  ): void {
    const key = `code=${code ?? "unknown"},route=${route ?? "unknown"}`;
    this.unauthorizedAttemptsCounter.set(
      key,
      (this.unauthorizedAttemptsCounter.get(key) ?? 0) + 1,
    );
  }

  public recordRotationPreviousUsed(
    exceptionId: string | undefined,
    owner: string | undefined,
  ): void {
    const key = `exception_id=${exceptionId ?? "none"},owner=${owner ?? "unknown"}`;
    this.rotationPreviousUsedCounter.set(
      key,
      (this.rotationPreviousUsedCounter.get(key) ?? 0) + 1,
    );
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
    for (const [key, val] of this.driftAlertCounter.entries()) {
      lines.push(
        `drts_internal_key_drift_alert_total{${key.replace(/,/g, '",').replace(/=/g, '="')}"} ${val}`,
      );
    }

    lines.push(
      "# HELP drts_internal_key_unauthorized_attempts_total Counter of unauthorized internal key attempts",
    );
    lines.push("# TYPE drts_internal_key_unauthorized_attempts_total counter");
    for (const [key, val] of this.unauthorizedAttemptsCounter.entries()) {
      lines.push(
        `drts_internal_key_unauthorized_attempts_total{${key.replace(/,/g, '",').replace(/=/g, '="')}"} ${val}`,
      );
    }

    lines.push(
      "# HELP drts_internal_key_rotation_previous_used_total Counter of rotated previous internal key usages",
    );
    lines.push(
      "# TYPE drts_internal_key_rotation_previous_used_total counter",
    );
    for (const [key, val] of this.rotationPreviousUsedCounter.entries()) {
      lines.push(
        `drts_internal_key_rotation_previous_used_total{${key.replace(/,/g, '",').replace(/=/g, '="')}"} ${val}`,
      );
    }

    return lines.join("\n");
  }
}

export const internalKeyMetrics = InternalKeyMetrics.getInstance();
