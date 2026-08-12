const MAX_METRIC_ENTRIES = 1000;

const REDACTED_LABEL = "redacted";

const ALLOWED_METRIC_LABELS = new Set([
  "event_type",
  "outcome",
  "severity",
  "realm",
  "change_type",
  "action",
  "credential_type",
  "days_remaining",
  "owner_team",
  "operation_class",
  "drift_type",
  "none",
  "unknown",
  "success",
  "denied",
  "failure",
  "throttled",
  "revoked",
  "expired",
  "approved",
  "unapproved_drill",
  "applied",
  "activated",
  "flagged",
  "investigating",
  "least_privilege_applied",
  "write_blocked",
  "logged",
  "tenant",
  "partner",
  "workforce",
  "driver",
  "platform",
  "ops",
  "security",
  "platform_owner",
  "tenant_admin",
  "security_ops",
  "sre",
  "iam_team",
  "login_brute_force",
  "invitation_abuse",
  "refresh_token_reuse",
  "cross_tenant_access",
  "wrong_realm_access",
  "role_updated",
  "user_invited",
  "api_key_issued",
  "api_key_rotated",
  "api_key_revoked",
  "platform_user",
  "tenant_api_key",
  "partner_key",
  "signing_key",
  "group_mismatch",
  "subject_unresolved",
  "privileged_mutation",
  "standard_event",
  "30",
  "14",
  "7",
  "1",
]);

export function sanitizeMetricLabelValue(value: string | undefined | null): string {
  if (!value) return "unknown";
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (
    normalized.includes("@") ||
    normalized.includes("sha256") ||
    normalized.includes("bearer") ||
    normalized.includes("jwt") ||
    normalized.length > 40
  ) {
    return REDACTED_LABEL;
  }
  if (ALLOWED_METRIC_LABELS.has(normalized)) {
    return normalized;
  }
  return REDACTED_LABEL;
}

export function escapePrometheusLabel(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

export class IamSecurityMetrics {
  private static instance: IamSecurityMetrics;

  public readonly authAbuseCounter = new Map<string, number>();
  public readonly refreshTokenReuseCounter = new Map<string, number>();
  public readonly crossTenantAttemptsCounter = new Map<string, number>();
  public readonly privilegedChangesCounter = new Map<string, number>();
  public readonly breakGlassCounter = new Map<string, number>();
  public readonly dormantCredentialUsageCounter = new Map<string, number>();
  public readonly credentialExpiryWarningsCounter = new Map<string, number>();
  public readonly idpDriftCounter = new Map<string, number>();
  public readonly auditPipelineFailuresCounter = new Map<string, number>();

  public static getInstance(): IamSecurityMetrics {
    if (!IamSecurityMetrics.instance) {
      IamSecurityMetrics.instance = new IamSecurityMetrics();
    }
    return IamSecurityMetrics.instance;
  }

  private incrementBoundedMap(map: Map<string, number>, key: string): void {
    if (!map.has(key) && map.size >= MAX_METRIC_ENTRIES) {
      return;
    }
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  public recordAuthAbuse(
    eventType: string,
    outcome: string,
    realm: string,
  ): void {
    const safeEventType = escapePrometheusLabel(sanitizeMetricLabelValue(eventType));
    const safeOutcome = escapePrometheusLabel(sanitizeMetricLabelValue(outcome));
    const safeRealm = escapePrometheusLabel(sanitizeMetricLabelValue(realm));
    const key = `event_type="${safeEventType}",outcome="${safeOutcome}",realm="${safeRealm}"`;
    this.incrementBoundedMap(this.authAbuseCounter, key);
  }

  public recordRefreshTokenReuse(
    outcome: string = "family_revoked",
    realm: string = "tenant",
  ): void {
    const safeOutcome = escapePrometheusLabel(sanitizeMetricLabelValue(outcome));
    const safeRealm = escapePrometheusLabel(sanitizeMetricLabelValue(realm));
    const key = `event_type="refresh_token_reuse",outcome="${safeOutcome}",realm="${safeRealm}"`;
    this.incrementBoundedMap(this.refreshTokenReuseCounter, key);
  }

  public recordCrossTenantAttempt(
    eventType: string = "cross_tenant_access",
    outcome: string = "denied",
    realm: string = "tenant",
  ): void {
    const safeEventType = escapePrometheusLabel(sanitizeMetricLabelValue(eventType));
    const safeOutcome = escapePrometheusLabel(sanitizeMetricLabelValue(outcome));
    const safeRealm = escapePrometheusLabel(sanitizeMetricLabelValue(realm));
    const key = `event_type="${safeEventType}",outcome="${safeOutcome}",realm="${safeRealm}"`;
    this.incrementBoundedMap(this.crossTenantAttemptsCounter, key);
  }

  public recordPrivilegedChange(
    changeType: string,
    outcome: string,
    realm: string = "platform",
  ): void {
    const safeChangeType = escapePrometheusLabel(sanitizeMetricLabelValue(changeType));
    const safeOutcome = escapePrometheusLabel(sanitizeMetricLabelValue(outcome));
    const safeRealm = escapePrometheusLabel(sanitizeMetricLabelValue(realm));
    const key = `change_type="${safeChangeType}",outcome="${safeOutcome}",realm="${safeRealm}"`;
    this.incrementBoundedMap(this.privilegedChangesCounter, key);
  }

  public recordBreakGlass(
    action: string,
    outcome: string,
    realm: string = "ops",
  ): void {
    const safeAction = escapePrometheusLabel(sanitizeMetricLabelValue(action));
    const safeOutcome = escapePrometheusLabel(sanitizeMetricLabelValue(outcome));
    const safeRealm = escapePrometheusLabel(sanitizeMetricLabelValue(realm));
    const key = `action="${safeAction}",outcome="${safeOutcome}",realm="${safeRealm}"`;
    this.incrementBoundedMap(this.breakGlassCounter, key);
  }

  public recordDormantCredentialUsage(
    credentialType: string,
    outcome: string = "flagged",
  ): void {
    const safeType = escapePrometheusLabel(sanitizeMetricLabelValue(credentialType));
    const safeOutcome = escapePrometheusLabel(sanitizeMetricLabelValue(outcome));
    const key = `credential_type="${safeType}",outcome="${safeOutcome}"`;
    this.incrementBoundedMap(this.dormantCredentialUsageCounter, key);
  }

  public recordCredentialExpiryWarning(
    credentialType: string,
    daysRemaining: string,
    ownerTeam: string = "security",
  ): void {
    const safeType = escapePrometheusLabel(sanitizeMetricLabelValue(credentialType));
    const safeDays = escapePrometheusLabel(sanitizeMetricLabelValue(daysRemaining));
    const safeOwner = escapePrometheusLabel(sanitizeMetricLabelValue(ownerTeam));
    const key = `credential_type="${safeType}",days_remaining="${safeDays}",owner_team="${safeOwner}"`;
    this.incrementBoundedMap(this.credentialExpiryWarningsCounter, key);
  }

  public recordIdpDrift(
    driftType: string,
    outcome: string = "least_privilege_applied",
  ): void {
    const safeType = escapePrometheusLabel(sanitizeMetricLabelValue(driftType));
    const safeOutcome = escapePrometheusLabel(sanitizeMetricLabelValue(outcome));
    const key = `drift_type="${safeType}",outcome="${safeOutcome}"`;
    this.incrementBoundedMap(this.idpDriftCounter, key);
  }

  public recordAuditPipelineFailure(
    operationClass: string = "privileged_mutation",
    outcome: string = "write_blocked",
  ): void {
    const safeClass = escapePrometheusLabel(sanitizeMetricLabelValue(operationClass));
    const safeOutcome = escapePrometheusLabel(sanitizeMetricLabelValue(outcome));
    const key = `operation_class="${safeClass}",outcome="${safeOutcome}"`;
    this.incrementBoundedMap(this.auditPipelineFailuresCounter, key);
  }

  public reset(): void {
    this.authAbuseCounter.clear();
    this.refreshTokenReuseCounter.clear();
    this.crossTenantAttemptsCounter.clear();
    this.privilegedChangesCounter.clear();
    this.breakGlassCounter.clear();
    this.dormantCredentialUsageCounter.clear();
    this.credentialExpiryWarningsCounter.clear();
    this.idpDriftCounter.clear();
    this.auditPipelineFailuresCounter.clear();
  }

  public toPrometheusFormat(): string {
    const lines: string[] = [];

    lines.push("# HELP drts_iam_auth_abuse_total Counter of login and invitation brute-force attempts");
    lines.push("# TYPE drts_iam_auth_abuse_total counter");
    for (const [keyLabels, val] of this.authAbuseCounter.entries()) {
      lines.push(`drts_iam_auth_abuse_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_iam_refresh_token_reuse_total Counter of refresh token reuse attempts");
    lines.push("# TYPE drts_iam_refresh_token_reuse_total counter");
    for (const [keyLabels, val] of this.refreshTokenReuseCounter.entries()) {
      lines.push(`drts_iam_refresh_token_reuse_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_iam_cross_tenant_attempts_total Counter of cross-tenant and realm boundary violations");
    lines.push("# TYPE drts_iam_cross_tenant_attempts_total counter");
    for (const [keyLabels, val] of this.crossTenantAttemptsCounter.entries()) {
      lines.push(`drts_iam_cross_tenant_attempts_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_iam_privileged_changes_total Counter of privileged role and account mutations");
    lines.push("# TYPE drts_iam_privileged_changes_total counter");
    for (const [keyLabels, val] of this.privilegedChangesCounter.entries()) {
      lines.push(`drts_iam_privileged_changes_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_iam_break_glass_total Counter of break-glass emergency access events");
    lines.push("# TYPE drts_iam_break_glass_total counter");
    for (const [keyLabels, val] of this.breakGlassCounter.entries()) {
      lines.push(`drts_iam_break_glass_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_iam_dormant_credential_usage_total Counter of dormant credential activations");
    lines.push("# TYPE drts_iam_dormant_credential_usage_total counter");
    for (const [keyLabels, val] of this.dormantCredentialUsageCounter.entries()) {
      lines.push(`drts_iam_dormant_credential_usage_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_iam_credential_expiry_warnings_total Counter of credential expiration warnings");
    lines.push("# TYPE drts_iam_credential_expiry_warnings_total counter");
    for (const [keyLabels, val] of this.credentialExpiryWarningsCounter.entries()) {
      lines.push(`drts_iam_credential_expiry_warnings_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_iam_idp_drift_total Counter of IdP group and subject drift detections");
    lines.push("# TYPE drts_iam_idp_drift_total counter");
    for (const [keyLabels, val] of this.idpDriftCounter.entries()) {
      lines.push(`drts_iam_idp_drift_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_iam_audit_pipeline_failures_total Counter of audit log pipeline failures");
    lines.push("# TYPE drts_iam_audit_pipeline_failures_total counter");
    for (const [keyLabels, val] of this.auditPipelineFailuresCounter.entries()) {
      lines.push(`drts_iam_audit_pipeline_failures_total{${keyLabels}} ${val}`);
    }

    return lines.join("\n");
  }
}

export const iamSecurityMetrics = IamSecurityMetrics.getInstance();
