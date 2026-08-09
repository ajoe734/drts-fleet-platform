import { describe, expect, it, beforeEach } from "vitest";

import {
  AuditPipelineException,
  iamSecurityMetrics,
  IamObservabilityService,
  sanitizeMetricLabelValue,
} from "../../apps/api/src/observability";

describe("IAM Observability & Alert Policy Integration", () => {
  let service: IamObservabilityService;

  beforeEach(() => {
    iamSecurityMetrics.reset();
    service = new IamObservabilityService();
  });

  describe("1. Label Sanitization & Zero PII Guarantee", () => {
    it("redacts sensitive email, token, IP, and raw identity values from metric labels", () => {
      expect(sanitizeMetricLabelValue("user@example.com")).toBe("redacted");
      expect(
        sanitizeMetricLabelValue(
          "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        ),
      ).toBe("redacted");
      expect(sanitizeMetricLabelValue("Bearer eyJhbGciOiJIUzI1NiJ9...")).toBe(
        "redacted",
      );
      expect(
        sanitizeMetricLabelValue("very_long_string_exceeding_forty_characters_limit_value"),
      ).toBe("redacted");
    });

    it("preserves canonical low-cardinality enum labels", () => {
      expect(sanitizeMetricLabelValue("tenant")).toBe("tenant");
      expect(sanitizeMetricLabelValue("security_ops")).toBe("security_ops");
      expect(sanitizeMetricLabelValue("refresh_token_reuse")).toBe(
        "refresh_token_reuse",
      );
      expect(sanitizeMetricLabelValue("write_blocked")).toBe("write_blocked");
      expect(sanitizeMetricLabelValue("write_blocked")).toBe("write_blocked");
    });
  });

  describe("2. Security Signal Metrics Recording", () => {
    it("records all 8 required security metrics signals into Prometheus telemetry", () => {
      service.recordAuthAbuseSignal("login_brute_force", "denied", "tenant");
      service.recordRefreshTokenReuseSignal("family_revoked", "tenant");
      service.recordCrossTenantSignal("cross_tenant_access", "denied", "tenant");
      service.recordPrivilegedChangeSignal("role_updated", "applied", "platform");
      service.recordBreakGlassSignal("activated", "success", "ops");
      service.recordDormantCredentialSignal("platform_user", "flagged");
      service.recordCredentialExpirySignal("tenant_api_key", "7", "security");
      service.recordIdpDriftSignal("group_mismatch", "least_privilege_applied");
      service.recordAuditPipelineFailureSignal("privileged_mutation", "write_blocked");

      const output = iamSecurityMetrics.toPrometheusFormat();

      expect(output).toContain("drts_iam_auth_abuse_total");
      expect(output).toContain("drts_iam_refresh_token_reuse_total");
      expect(output).toContain("drts_iam_cross_tenant_attempts_total");
      expect(output).toContain("drts_iam_privileged_changes_total");
      expect(output).toContain("drts_iam_break_glass_total");
      expect(output).toContain("drts_iam_dormant_credential_usage_total");
      expect(output).toContain("drts_iam_credential_expiry_warnings_total");
      expect(output).toContain("drts_iam_idp_drift_total");
      expect(output).toContain("drts_iam_audit_pipeline_failures_total");

      // Verify no PII present in output
      expect(output).not.toContain("@");
      expect(output).not.toContain("password");
    });
  });

  describe("3. Security Alert Drills", () => {
    it("triggers critical alert and page on refresh token reuse drill", () => {
      const result = service.runDrill("refresh_reuse");

      expect(result.drillType).toBe("refresh_reuse");
      expect(result.alertSignal.severity).toBe("critical");
      expect(result.alertSignal.routeChannel).toBe("security-pager-p1");
      expect(result.alertSignal.ownerTeam).toBe("Security Ops");
      expect(result.alertSignal.metricName).toBe("drts_iam_refresh_token_reuse_total");
    });

    it("triggers high severity alert on unapproved privileged change drill", () => {
      const result = service.runDrill("privileged_change");

      expect(result.drillType).toBe("privileged_change");
      expect(result.alertSignal.severity).toBe("high");
      expect(result.alertSignal.routeChannel).toBe("security-platform-owner");
      expect(result.alertSignal.ownerTeam).toBe("Platform Security");
    });

    it("triggers critical alert on audit failure drill", () => {
      const result = service.runDrill("audit_failure");

      expect(result.drillType).toBe("audit_failure");
      expect(result.alertSignal.severity).toBe("critical");
      expect(result.alertSignal.routeChannel).toBe("security-pager-p1");
    });
  });

  describe("4. Audit Pipeline Fail-Closed Enforcement", () => {
    it("allows privileged mutation to proceed when audit recording succeeds", async () => {
      let auditDone = false;
      let mutateDone = false;

      const result = await service.executePrivilegedOperationWithAudit(
        "update_user_role",
        true,
        async () => {
          auditDone = true;
        },
        async () => {
          mutateDone = true;
          return { status: "updated" };
        },
      );

      expect(auditDone).toBe(true);
      expect(mutateDone).toBe(true);
      expect(result).toEqual({ status: "updated" });
    });

    it("pages security and BLOCKS privileged mutation (throws AuditPipelineException) when audit fails", async () => {
      let mutateExecuted = false;

      const auditFailurePromise = service.executePrivilegedOperationWithAudit(
        "grant_admin_privilege",
        true,
        async () => {
          throw new Error("PostgreSQL connection timeout during audit append");
        },
        async () => {
          mutateExecuted = true;
          return { status: "should_not_reach_here" };
        },
      );

      await expect(auditFailurePromise).rejects.toThrowError(AuditPipelineException);
      expect(mutateExecuted).toBe(false);

      const metrics = iamSecurityMetrics.toPrometheusFormat();
      expect(metrics).toContain('drts_iam_audit_pipeline_failures_total{operation_class="privileged_mutation",outcome="write_blocked"} 1');

      const history = service.getAlertHistory();
      const lastAlert = history[history.length - 1];
      expect(lastAlert?.routeChannel).toBe("security-pager-p1");
      expect(lastAlert?.severity).toBe("critical");
    });

    it("allows non-privileged write to proceed with log warning when audit fails", async () => {
      let mutateExecuted = false;

      const result = await service.executePrivilegedOperationWithAudit(
        "get_public_feed",
        false, // non-privileged
        async () => {
          throw new Error("Transient audit warning");
        },
        async () => {
          mutateExecuted = true;
          return { status: "success" };
        },
      );

      expect(mutateExecuted).toBe(true);
      expect(result).toEqual({ status: "success" });

      const metrics = iamSecurityMetrics.toPrometheusFormat();
      expect(metrics).toContain('drts_iam_audit_pipeline_failures_total{operation_class="standard_event",outcome="logged"} 1');
    });
  });
});
