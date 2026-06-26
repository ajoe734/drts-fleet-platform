import { describe, expect, it } from "vitest";

import {
  PHASE2_AUDIT_DOMAINS,
  PHASE2_AUDIT_EVENT_CATALOG,
  PHASE2_AUDIT_EVENT_NAMES,
  getPhase2AuditDomain,
  isPhase2AuditEventName,
} from "@drts/contracts";

describe("phase2 audit context helpers (P2-DP-S4-001)", () => {
  it("recognizes every catalogued phase2 audit event name", () => {
    for (const eventName of PHASE2_AUDIT_EVENT_NAMES) {
      expect(isPhase2AuditEventName(eventName)).toBe(true);
    }
  });

  it("rejects non-phase2 (shared Phase 1) audit action names", () => {
    expect(isPhase2AuditEventName("bootstrap_seeded")).toBe(false);
    expect(isPhase2AuditEventName("mark_notifications_read")).toBe(false);
    expect(isPhase2AuditEventName("view_audit_log_evidence")).toBe(false);
  });

  it("maps a phase2 event name to its domain prefix", () => {
    expect(
      getPhase2AuditDomain(
        PHASE2_AUDIT_EVENT_CATALOG.sandbox
          .providerCapabilityRequirementConfigured,
      ),
    ).toBe("sandbox");
    expect(
      getPhase2AuditDomain(
        PHASE2_AUDIT_EVENT_CATALOG.safetyOperator.assignmentByStatus.assigned,
      ),
    ).toBe("safety_operator");
    expect(
      getPhase2AuditDomain(PHASE2_AUDIT_EVENT_CATALOG.accident.caseAmended),
    ).toBe("accident");
  });

  it("returns null for action names outside the phase2 catalog", () => {
    expect(getPhase2AuditDomain("bootstrap_seeded")).toBeNull();
    expect(getPhase2AuditDomain("view_audit_log_evidence")).toBeNull();
  });

  it("keeps PHASE2_AUDIT_DOMAINS in sync with every catalogued prefix", () => {
    const cataloguedPrefixes = new Set(
      PHASE2_AUDIT_EVENT_NAMES.map((name) => name.slice(0, name.indexOf("."))),
    );
    for (const prefix of cataloguedPrefixes) {
      expect(PHASE2_AUDIT_DOMAINS as readonly string[]).toContain(prefix);
    }
  });
});
