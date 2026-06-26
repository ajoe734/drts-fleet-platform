import { describe, expect, it } from "vitest";

import {
  PHASE2_AUDIT_EVENT_NAMES,
  type Phase2AuditContext,
} from "../../packages/contracts/src/phase2-tesla-fsd-sandbox";

describe("Phase 2 audit contracts", () => {
  it("exports the canonical event catalog in <domain>.<resource>.<past_tense_action> form", () => {
    expect(PHASE2_AUDIT_EVENT_NAMES).toEqual([
      "sandbox.provider_capability_requirement.configured",
      "sandbox.provider_capability_requirement.amended",
      "tesla.remote_command.issued",
      "tesla.remote_command.acknowledged",
      "tesla.remote_command.rejected",
      "tesla.remote_command.failed",
      "tesla.remote_command.expired",
      "sandbox.dispatch_decision.evaluated",
      "sandbox.dispatch_decision.amended",
      "tesla.regulatory_event.ingested",
      "tesla.vehicle_state_snapshot.ingested",
      "tesla.public_telemetry_sample.ingested",
      "sandbox.safety_operator_assignment.assigned",
      "sandbox.safety_operator_assignment.engaged",
      "sandbox.safety_operator_assignment.released",
      "sandbox.safety_operator_assignment.expired",
      "sandbox.roc_intervention.started",
      "sandbox.roc_intervention.resolved",
      "evidence.manifest.captured",
      "evidence.manifest.verified",
      "evidence.manifest.sealed",
      "evidence.manifest.released",
      "evidence.manifest.purged",
      "evidence.manifest_item.recorded",
      "evidence.accident_case.opened",
      "evidence.accident_case.updated",
      "evidence.accident_case.closed",
      "evidence.regulatory_report.generated",
      "evidence.regulatory_report.submitted",
      "evidence.regulatory_report.accepted",
      "evidence.regulatory_report.rejected",
      "evidence.regulatory_report.amended",
    ]);
    expect(
      PHASE2_AUDIT_EVENT_NAMES.every((eventName) =>
        /^[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_]+$/.test(eventName),
      ),
    ).toBe(true);
  });

  it("provides a compilable Phase2AuditContext shape", () => {
    const context: Phase2AuditContext = {
      actorId: "ops-user-001",
      actorType: "ops_user",
      tenantId: null,
      moduleName: "sandbox-governance",
      requestId: "req-phase2-001",
      correlationId: "corr-phase2-001",
      sourceSystem: "sandbox_governance",
    };

    expect(context.moduleName).toBe("sandbox-governance");
  });
});
