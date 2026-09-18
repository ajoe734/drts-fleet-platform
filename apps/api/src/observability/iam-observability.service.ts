import { Injectable, Logger, ForbiddenException } from "@nestjs/common";
import { iamSecurityMetrics, IamSecurityMetrics } from "./iam-security-metrics";

export class AuditPipelineException extends ForbiddenException {
  constructor(
    message: string = "Audit pipeline failure: Privileged write blocked to ensure auditability",
  ) {
    super(message);
    this.name = "AuditPipelineException";
  }
}

export interface SecurityAlertSignal {
  signalId: string;
  metricName: string;
  severity: "critical" | "high" | "warning" | "info";
  ownerTeam: string;
  routeChannel: string;
  details: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class IamObservabilityService {
  private readonly logger = new Logger(IamObservabilityService.name);
  private readonly alertHistory: SecurityAlertSignal[] = [];

  constructor() {}

  getMetricsRecorder(): IamSecurityMetrics {
    return iamSecurityMetrics;
  }

  recordAuthAbuseSignal(
    eventType: "login_brute_force" | "invitation_abuse",
    outcome: "denied" | "throttled",
    realm: "tenant" | "partner" | "workforce" | "driver" = "tenant",
  ): void {
    iamSecurityMetrics.recordAuthAbuse(eventType, outcome, realm);
    this.checkAndDispatchAlert({
      signalId: `auth-abuse-${Date.now()}`,
      metricName: "drts_iam_auth_abuse_total",
      severity: "warning",
      ownerTeam: "Security Ops",
      routeChannel: "security-oncall",
      details: { eventType, outcome, realm },
      timestamp: new Date().toISOString(),
    });
  }

  recordRefreshTokenReuseSignal(
    outcome: "family_revoked" = "family_revoked",
    realm: "tenant" | "driver" | "partner" = "tenant",
  ): SecurityAlertSignal {
    iamSecurityMetrics.recordRefreshTokenReuse(outcome, realm);
    const alert = {
      signalId: `refresh-reuse-${Date.now()}`,
      metricName: "drts_iam_refresh_token_reuse_total",
      severity: "critical" as const,
      ownerTeam: "Security Ops",
      routeChannel: "security-pager-p1",
      details: { outcome, realm },
      timestamp: new Date().toISOString(),
    };
    this.checkAndDispatchAlert(alert);
    return alert;
  }

  recordCrossTenantSignal(
    eventType:
      | "cross_tenant_access"
      | "wrong_realm_access" = "cross_tenant_access",
    outcome: "denied" = "denied",
    realm: "tenant" | "partner" | "platform" = "tenant",
  ): void {
    iamSecurityMetrics.recordCrossTenantAttempt(eventType, outcome, realm);
    this.checkAndDispatchAlert({
      signalId: `cross-tenant-${Date.now()}`,
      metricName: "drts_iam_cross_tenant_attempts_total",
      severity: "high",
      ownerTeam: "Security Ops",
      routeChannel: "security-oncall",
      details: { eventType, outcome, realm },
      timestamp: new Date().toISOString(),
    });
  }

  recordPrivilegedChangeSignal(
    changeType:
      | "role_updated"
      | "user_invited"
      | "api_key_issued"
      | "api_key_rotated"
      | "api_key_revoked",
    outcome: "approved" | "unapproved_drill" | "applied",
    realm: "tenant" | "workforce" | "platform" = "platform",
  ): SecurityAlertSignal {
    iamSecurityMetrics.recordPrivilegedChange(changeType, outcome, realm);
    const severity = outcome === "unapproved_drill" ? "high" : "info";
    const alert = {
      signalId: `priv-change-${Date.now()}`,
      metricName: "drts_iam_privileged_changes_total",
      severity: severity as "high" | "info",
      ownerTeam: "Platform Security",
      routeChannel: "security-platform-owner",
      details: { changeType, outcome, realm },
      timestamp: new Date().toISOString(),
    };
    this.checkAndDispatchAlert(alert);
    return alert;
  }

  recordBreakGlassSignal(
    action: "activated" | "expired" | "revoked",
    outcome: "success" | "denied",
    realm: "ops" | "platform" = "ops",
  ): void {
    iamSecurityMetrics.recordBreakGlass(action, outcome, realm);
    this.checkAndDispatchAlert({
      signalId: `break-glass-${Date.now()}`,
      metricName: "drts_iam_break_glass_total",
      severity: "high",
      ownerTeam: "Security Lead",
      routeChannel: "security-pager-p1",
      details: { action, outcome, realm },
      timestamp: new Date().toISOString(),
    });
  }

  recordDormantCredentialSignal(
    credentialType: "platform_user" | "tenant_api_key" | "partner_key",
    outcome: "flagged" | "investigating" = "flagged",
  ): void {
    iamSecurityMetrics.recordDormantCredentialUsage(credentialType, outcome);
    this.checkAndDispatchAlert({
      signalId: `dormant-cred-${Date.now()}`,
      metricName: "drts_iam_dormant_credential_usage_total",
      severity: "warning",
      ownerTeam: "Security Ops",
      routeChannel: "security-oncall",
      details: { credentialType, outcome },
      timestamp: new Date().toISOString(),
    });
  }

  recordCredentialExpirySignal(
    credentialType: "tenant_api_key" | "partner_key" | "signing_key",
    daysRemaining: "30" | "14" | "7" | "1",
    ownerTeam: "security" | "platform" | "tenant_admin" = "security",
  ): void {
    iamSecurityMetrics.recordCredentialExpiryWarning(
      credentialType,
      daysRemaining,
      ownerTeam,
    );
    const severity =
      Number.parseInt(daysRemaining, 10) <= 7 ? "warning" : "info";
    this.checkAndDispatchAlert({
      signalId: `cred-expiry-${Date.now()}`,
      metricName: "drts_iam_credential_expiry_warnings_total",
      severity,
      ownerTeam: "Credential Owner",
      routeChannel: "ops-ticket",
      details: { credentialType, daysRemaining, ownerTeam },
      timestamp: new Date().toISOString(),
    });
  }

  recordIdpDriftSignal(
    driftType: "group_mismatch" | "subject_unresolved",
    outcome: "least_privilege_applied" | "denied" = "least_privilege_applied",
  ): void {
    iamSecurityMetrics.recordIdpDrift(driftType, outcome);
    this.checkAndDispatchAlert({
      signalId: `idp-drift-${Date.now()}`,
      metricName: "drts_iam_idp_drift_total",
      severity: "warning",
      ownerTeam: "IAM Security",
      routeChannel: "iam-team",
      details: { driftType, outcome },
      timestamp: new Date().toISOString(),
    });
  }

  recordAuditPipelineFailureSignal(
    operationClass:
      | "privileged_mutation"
      | "standard_event" = "privileged_mutation",
    outcome: "write_blocked" | "logged" = "write_blocked",
  ): SecurityAlertSignal {
    iamSecurityMetrics.recordAuditPipelineFailure(operationClass, outcome);
    const alert = {
      signalId: `audit-failure-${Date.now()}`,
      metricName: "drts_iam_audit_pipeline_failures_total",
      severity: "critical" as const,
      ownerTeam: "SRE & Security",
      routeChannel: "security-pager-p1",
      details: {
        operationClass,
        outcome,
        blocked: outcome === "write_blocked",
      },
      timestamp: new Date().toISOString(),
    };
    this.checkAndDispatchAlert(alert);
    return alert;
  }

  /**
   * Enforces Audit Pipeline Fail-Closed logic:
   * If an operation is marked privileged, and the audit recording function throws an error,
   * this method records the audit failure metric (write_blocked), pages security,
   * and THROWS AuditPipelineException to prevent the privileged write from taking effect.
   */
  async executePrivilegedOperationWithAudit<T>(
    operationName: string,
    isPrivileged: boolean,
    auditFn: () => Promise<void>,
    mutateFn: () => Promise<T>,
  ): Promise<T> {
    try {
      await auditFn();
    } catch (auditError) {
      if (isPrivileged) {
        this.logger.error(
          `Audit pipeline failed during privileged mutation [${operationName}]: ${
            auditError instanceof Error
              ? auditError.message
              : String(auditError)
          }. Blocking write (fail-closed).`,
        );
        this.recordAuditPipelineFailureSignal(
          "privileged_mutation",
          "write_blocked",
        );
        throw new AuditPipelineException(
          `Audit pipeline failure during privileged mutation [${operationName}]: write blocked to preserve auditability.`,
        );
      }
      this.logger.warn(
        `Audit recording failed for non-privileged operation [${operationName}]. Continuing with warning.`,
      );
      this.recordAuditPipelineFailureSignal("standard_event", "logged");
    }

    return mutateFn();
  }

  runDrill(
    drillType: "refresh_reuse" | "privileged_change" | "audit_failure",
  ): { drillType: string; status: string; alertSignal: SecurityAlertSignal } {
    this.logger.log(`Executing security alert drill: ${drillType}`);

    let alertSignal: SecurityAlertSignal;
    if (drillType === "refresh_reuse") {
      alertSignal = this.recordRefreshTokenReuseSignal(
        "family_revoked",
        "tenant",
      );
    } else if (drillType === "privileged_change") {
      alertSignal = this.recordPrivilegedChangeSignal(
        "role_updated",
        "unapproved_drill",
        "platform",
      );
    } else {
      alertSignal = this.recordAuditPipelineFailureSignal(
        "privileged_mutation",
        "write_blocked",
      );
    }

    return {
      drillType,
      status: "alert_triggered",
      alertSignal,
    };
  }

  getAlertHistory(): readonly SecurityAlertSignal[] {
    return this.alertHistory;
  }

  private checkAndDispatchAlert(signal: SecurityAlertSignal) {
    this.alertHistory.push(signal);
    if (this.alertHistory.length > 500) {
      this.alertHistory.shift();
    }
    this.logger.warn(
      `[SECURITY ALERT] [${signal.severity.toUpperCase()}] Metric: ${signal.metricName} -> Route: ${signal.routeChannel} (Owner: ${signal.ownerTeam})`,
    );
  }
}
