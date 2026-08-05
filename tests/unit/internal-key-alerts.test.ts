import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  evaluateInternalKey,
  internalKeyAuditRecorder,
  internalKeyMetrics,
} from "../../apps/api/src/common/auth";

const workspaceRoot = process.cwd();
const alertsPath = path.resolve(
  workspaceRoot,
  "infra/alerts/internal-key-alerts.yaml",
);

const alertsText = readFileSync(alertsPath, "utf8");

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alertBlock(alertName: string) {
  const matcher = new RegExp(
    `- alert: ${escapeRegExp(alertName)}[\\s\\S]*?(?=\\n\\s*- alert:|$)`,
  );
  const match = alertsText.match(matcher);
  expect(match, `expected alert ${alertName} to exist`).not.toBeNull();
  return match?.[0] ?? "";
}

describe("internal key alert rules", () => {
  it("defines required alert rules with expected metrics", () => {
    const expectedRules = [
      {
        alertName: "InternalKeyExceptionDriftAlert",
        metric: "drts_internal_key_drift_alert_total",
      },
      {
        alertName: "InternalKeyExpiredOrUndocumentedAttempt",
        metric: "drts_internal_key_unauthorized_attempts_total",
      },
      {
        alertName: "InternalKeyRotationPreviousKeyUsed",
        metric: "drts_internal_key_rotation_previous_used_total",
      },
    ];

    for (const rule of expectedRules) {
      const block = alertBlock(rule.alertName);
      expect(block).toContain("expr:");
      expect(block).toContain(rule.metric);
      expect(block).toContain("runbook: docs/02-architecture/internal-key-exceptions.md");
    }
  });

  it("records metrics and formats Prometheus output correctly", () => {
    internalKeyMetrics.reset();

    internalKeyMetrics.recordDriftAlert(
      "INTERNAL_KEY_EXCP_002",
      "INTERNAL_KEY_INVALID",
      "POST /api/test",
    );
    internalKeyMetrics.recordUnauthorizedAttempt(
      "INTERNAL_KEY_UNDOCUMENTED",
      "GET /api/test",
    );
    internalKeyMetrics.recordRotationPreviousUsed(
      "INTERNAL_KEY_EXCP_002",
      "control-plane-ops",
    );

    const promOutput = internalKeyMetrics.toPrometheusFormat();

    expect(promOutput).toContain("drts_internal_key_drift_alert_total");
    expect(promOutput).toContain('exception_id="INTERNAL_KEY_EXCP_002"');
    expect(promOutput).toContain("drts_internal_key_unauthorized_attempts_total");
    expect(promOutput).toContain('code="INTERNAL_KEY_UNDOCUMENTED"');
    expect(promOutput).toContain("drts_internal_key_rotation_previous_used_total");
    expect(promOutput).toContain('owner="control-plane-ops"');
  });

  it("records security audit events matching SECURITY_EVENT_MATRIX schema", () => {
    internalKeyAuditRecorder.reset();

    const validEval = evaluateInternalKey("key123", "key123", {
      headerName: "x-drts-internal-key",
      requestPath: "/api/tenants",
      requestMethod: "GET",
    });
    expect(validEval.valid).toBe(true);

    const usageEvent = internalKeyAuditRecorder.recordUsage(validEval, {
      header: "x-drts-internal-key",
      route: "GET /api/tenants",
    });

    expect(usageEvent.eventType).toBe("internal_key.used");
    expect(usageEvent.eventFamily).toBe("credential");
    expect(usageEvent.outcome).toBe("success");

    const invalidEval = evaluateInternalKey("wrongKey", "key123", {
      headerName: "x-drts-internal-key",
      requestPath: "/api/tenants",
      requestMethod: "GET",
    });

    const driftEvent = internalKeyAuditRecorder.recordDrift(invalidEval, {
      header: "x-drts-internal-key",
      route: "GET /api/tenants",
    });

    expect(driftEvent.eventType).toBe("internal_key_drift.detected");
    expect(driftEvent.eventFamily).toBe("credential");
    expect(driftEvent.context.code).toBe("INTERNAL_KEY_INVALID");

    const events = internalKeyAuditRecorder.getEvents();
    expect(events.length).toBe(2);
  });

  it("escapes Prometheus label values to prevent metric injection (F10)", () => {
    internalKeyMetrics.reset();

    const maliciousRoute = 'GET /a?x="} 999\ndrts_fake_metric{evil="1';
    internalKeyMetrics.recordDriftAlert(
      "INTERNAL_KEY_EXCP_002",
      "INTERNAL_KEY_INVALID",
      maliciousRoute,
    );

    const promOutput = internalKeyMetrics.toPrometheusFormat();
    expect(promOutput).not.toContain('drts_fake_metric{evil="1');
    expect(promOutput).toContain('route="GET /a"');
  });

  it("bounds metrics map size and strips query parameters to prevent DoS (F7)", () => {
    internalKeyMetrics.reset();

    for (let i = 0; i < 1500; i++) {
      internalKeyMetrics.recordDriftAlert(
        "INTERNAL_KEY_EXCP_002",
        "INTERNAL_KEY_INVALID",
        `POST /api/ops/dispatch?nonce=${i}`,
      );
    }

    // Since query params are stripped, all 1500 requests resolve to route "POST /api/ops/dispatch"
    expect(internalKeyMetrics.driftAlertCounter.size).toBe(1);
    expect(internalKeyMetrics.driftAlertCounter.get('exception_id="INTERNAL_KEY_EXCP_002",code="INTERNAL_KEY_INVALID",route="POST /api/ops/dispatch"')).toBe(1500);
  });

  it("caps audit recorder memory and forwards events to SecurityEventsService sink (F7 & F9)", () => {
    internalKeyAuditRecorder.reset();
    const recordedEvents: unknown[] = [];
    const mockSink = {
      recordEvent: (input: unknown) => {
        recordedEvents.push(input);
      },
    };
    internalKeyAuditRecorder.setSecurityEventsService(mockSink);

    const evalResult = evaluateInternalKey("key123", "key123", {
      headerName: "x-drts-internal-key",
      requestPath: "/api/tenants",
      requestMethod: "GET",
    });

    for (let i = 0; i < 1200; i++) {
      internalKeyAuditRecorder.recordUsage(evalResult, {
        header: "x-drts-internal-key",
        route: "GET /api/tenants",
      });
    }

    expect(internalKeyAuditRecorder.getEvents().length).toBe(1000);
    expect(recordedEvents.length).toBe(1200);
    expect((recordedEvents[0] as { eventType: string }).eventType).toBe("internal_key.used");

    internalKeyAuditRecorder.setSecurityEventsService(undefined);
  });
});
