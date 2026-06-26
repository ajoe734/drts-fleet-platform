import { describe, expect, it } from "vitest";

import {
  PHASE2_AUDIT_EVENT_CATALOG,
  type Phase2AuditContext,
} from "@drts/contracts";

import { emitPhase2AuditedAction } from "../../src/common/phase2-audit";
import type { DatabaseService } from "../../src/common/db";
import { AuditLogRepository } from "../../src/modules/audit-notification/audit-log.repository";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";

const PLATFORM_IDENTITY = {
  actorId: "platform-admin-001",
  actorType: "platform_admin" as const,
  realm: "platform" as const,
  scopes: ["audit:read"],
  tenantId: null,
};

function sandboxConfiguredContext(
  overrides: Partial<Phase2AuditContext> = {},
): Phase2AuditContext {
  return {
    actorId: "ops-user-001",
    actorType: "ops_user",
    tenantId: "tenant-demo-001",
    moduleName: "sandbox-governance",
    eventName:
      PHASE2_AUDIT_EVENT_CATALOG.sandbox
        .providerCapabilityRequirementConfigured,
    resourceType: "provider_capability_requirement",
    resourceId: "program-1:av_dispatch",
    requestId: "req-sandbox-001",
    summary: { sandboxProgramId: "program-1", capability: "av_dispatch" },
    ...overrides,
  };
}

function accidentContext(): Phase2AuditContext {
  return {
    actorId: "ops-user-002",
    actorType: "ops_user",
    tenantId: "tenant-demo-001",
    moduleName: "accident-investigation",
    eventName: PHASE2_AUDIT_EVENT_CATALOG.accident.caseByStatus.open,
    resourceType: "accident_case",
    resourceId: "case-001",
    requestId: "req-accident-001",
    summary: { vehicleId: "veh-001", status: "open" },
  };
}

class FakeClient {
  released = false;

  constructor(
    private readonly sink: Array<{ text: string; values: unknown[] }>,
    private readonly failOn?: string,
  ) {}

  async query(text: string, values?: readonly unknown[]) {
    this.sink.push({ text, values: (values ?? []) as unknown[] });
    if (this.failOn && text.includes(this.failOn)) {
      throw new Error(`simulated failure on ${this.failOn}`);
    }
    return { rows: [], rowCount: 0 };
  }

  release() {
    this.released = true;
  }
}

class FakeDatabaseService {
  readonly queries: Array<{ text: string; values: unknown[] }> = [];
  // When set, the checked-out client throws on any query whose text contains
  // this fragment, simulating a mid-transaction insert failure.
  failOn?: string;
  lastClient?: FakeClient;

  isEnabled() {
    return true;
  }

  async query(text: string, values?: readonly unknown[]) {
    this.queries.push({ text, values: (values ?? []) as unknown[] });
    return { rows: [], rowCount: 0 };
  }

  async connect() {
    const client = new FakeClient(this.queries, this.failOn);
    this.lastClient = client;
    return client;
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("INT-DP-S4-001 phase2 audit context integration", () => {
  it("lands phase2 events in the shared Phase 1 store through the single emitter and filters by phase2/domain", () => {
    const service = new AuditNotificationService();

    // Single emitter: the audit-notification service IS the Phase2AuditSink, so
    // there is no second store — phase2 rows append to the same audit log list.
    emitPhase2AuditedAction({
      sink: service,
      audit: sandboxConfiguredContext(),
      data: {},
      message: "Configured provider capability requirement.",
    });
    emitPhase2AuditedAction({
      sink: service,
      audit: accidentContext(),
      data: {},
      message: "Opened accident case.",
    });

    const all = service.listAuditLogs(PLATFORM_IDENTITY, "req-all");
    const actionNames = all.map((log) => log.actionName);
    expect(actionNames).toContain(
      PHASE2_AUDIT_EVENT_CATALOG.sandbox
        .providerCapabilityRequirementConfigured,
    );
    expect(actionNames).toContain(
      PHASE2_AUDIT_EVENT_CATALOG.accident.caseByStatus.open,
    );
    // The Phase 1 bootstrap row shares the same store.
    expect(actionNames).toContain("bootstrap_seeded");

    const phase2Only = service.listAuditLogs(PLATFORM_IDENTITY, "req-p2", {
      phase2Only: true,
    });
    expect(phase2Only.length).toBeGreaterThanOrEqual(2);
    expect(phase2Only.every((log) => log.actionName.includes("."))).toBe(true);
    expect(phase2Only.map((log) => log.actionName)).not.toContain(
      "bootstrap_seeded",
    );

    const sandboxOnly = service.listAuditLogs(PLATFORM_IDENTITY, "req-sb", {
      phase2Domain: "sandbox",
    });
    expect(sandboxOnly.length).toBe(1);
    expect(sandboxOnly[0]?.actionName).toBe(
      PHASE2_AUDIT_EVENT_CATALOG.sandbox
        .providerCapabilityRequirementConfigured,
    );
  });

  it("dual-writes evidence access to the access-log projection linked by auditId", () => {
    const service = new AuditNotificationService();

    // Listing audit logs is itself an audit_log-family evidence access.
    service.listAuditLogs(PLATFORM_IDENTITY, "req-access-001");

    const accessLogs = service.listEvidenceAccessLogs();
    expect(accessLogs.length).toBeGreaterThanOrEqual(1);

    const accessLog = accessLogs[0];
    expect(accessLog?.evidenceFamily).toBe("audit_log");
    expect(accessLog?.accessAction).toBe("list");
    expect(accessLog?.actorId).toBe("platform-admin-001");

    // The dual-write keeps a 1:1 link back to its canonical audit row.
    const snapshot = service.getAuditLogsSnapshot();
    const linkedAuditRow = snapshot.find(
      (log) => log.auditId === accessLog?.auditId,
    );
    expect(linkedAuditRow).toBeDefined();
    expect(linkedAuditRow?.resourceType).toBe("audit_log");
  });

  it("enforces the audit_log evidence policy on the evidence-access-logs projection", () => {
    const service = new AuditNotificationService();

    // Seed an evidence-access row so the projection is non-empty.
    service.listAuditLogs(PLATFORM_IDENTITY, "req-seed-001");

    // A platform caller that carries scopes but lacks audit:read cannot read the
    // audit evidence projection — the same policy that gates listAuditLogs.
    const withoutAuditRead = {
      actorId: "platform-admin-002",
      actorType: "platform_admin" as const,
      realm: "platform" as const,
      scopes: ["notification:read"],
      tenantId: null,
    };
    const accessErrorCode = (run: () => unknown): string | undefined => {
      try {
        run();
      } catch (error) {
        const response = (error as { getResponse?: () => unknown }).getResponse?.();
        return (response as { error?: { code?: string } })?.error?.code;
      }
      return undefined;
    };

    expect(
      accessErrorCode(() =>
        service.listEvidenceAccessLogs(withoutAuditRead, "req-forbidden-001"),
      ),
    ).toBe("EVIDENCE_ACCESS_FORBIDDEN");

    // The same caller is forbidden from listAuditLogs, confirming parity.
    expect(
      accessErrorCode(() =>
        service.listAuditLogs(withoutAuditRead, "req-forbidden-002"),
      ),
    ).toBe("EVIDENCE_ACCESS_FORBIDDEN");

    // An authorized caller succeeds.
    expect(() =>
      service.listEvidenceAccessLogs(PLATFORM_IDENTITY, "req-allowed-001"),
    ).not.toThrow();
  });

  it("audits reads of the evidence-access-logs projection through the single emitter", () => {
    const service = new AuditNotificationService();

    const before = service
      .getAuditLogsSnapshot()
      .filter((log) => log.actionName === "view_audit_log_evidence").length;

    service.listEvidenceAccessLogs(PLATFORM_IDENTITY, "req-self-audit-001");

    const accessRows = service
      .getAuditLogsSnapshot()
      .filter(
        (log) =>
          log.actionName === "view_audit_log_evidence" &&
          log.requestId === "req-self-audit-001",
      );
    // Reading the projection is itself recorded as an audit_log evidence access.
    expect(accessRows.length).toBe(1);
    expect(accessRows[0]?.actorId).toBe("platform-admin-001");
    expect(accessRows[0]?.newValuesSummary?.projection).toBe(
      "evidence_access_logs",
    );
    expect(
      service
        .getAuditLogsSnapshot()
        .filter((log) => log.actionName === "view_audit_log_evidence").length,
    ).toBe(before + 1);
  });

  it("write-through persists evidence access into av_evidence.evidence_access_logs", async () => {
    const fakeDb = new FakeDatabaseService();
    const repository = new AuditLogRepository(
      fakeDb as unknown as DatabaseService,
    );
    const service = new AuditNotificationService(repository);

    service.listAuditLogs(PLATFORM_IDENTITY, "req-access-db-001");
    await flush();

    const evidenceAccessInsert = fakeDb.queries.find((query) =>
      query.text.includes("av_evidence.evidence_access_logs"),
    );
    expect(evidenceAccessInsert).toBeDefined();
    expect(evidenceAccessInsert?.text).toContain("INSERT INTO");

    // Phase2 (non evidence-access) audit rows do not create a second access row.
    emitPhase2AuditedAction({
      sink: service,
      audit: sandboxConfiguredContext({ requestId: "req-sandbox-db-001" }),
      data: {},
      message: "Configured provider capability requirement.",
    });
    await flush();

    const evidenceAccessInserts = fakeDb.queries.filter((query) =>
      query.text.includes("av_evidence.evidence_access_logs"),
    );
    // Only the evidence-access listing produced an access-log write.
    expect(evidenceAccessInserts.length).toBe(1);

    // The dual-write is atomic: both inserts run inside a single transaction,
    // canonical audit row before the evidence-access mirror, then COMMIT.
    const order = fakeDb.queries.map((query) => query.text);
    const beginAt = order.findIndex((text) => text.includes("BEGIN"));
    const auditAt = order.findIndex((text) =>
      text.includes("admin.audit_logs"),
    );
    const mirrorAt = order.findIndex((text) =>
      text.includes("av_evidence.evidence_access_logs"),
    );
    const commitAt = order.findIndex((text) => text.includes("COMMIT"));
    expect(beginAt).toBeGreaterThanOrEqual(0);
    expect(beginAt).toBeLessThan(auditAt);
    expect(auditAt).toBeLessThan(mirrorAt);
    expect(mirrorAt).toBeLessThan(commitAt);
  });

  it("rolls back the evidence-access mirror when the canonical insert fails so no orphan row is stranded", async () => {
    const fakeDb = new FakeDatabaseService();
    // Fail the canonical admin.audit_logs insert mid-transaction.
    fakeDb.failOn = "admin.audit_logs";
    const repository = new AuditLogRepository(
      fakeDb as unknown as DatabaseService,
    );
    const service = new AuditNotificationService(repository);

    // Listing audit logs self-audits an audit_log-family access, triggering the
    // evidence-access dual-write whose canonical insert is rigged to fail.
    expect(() =>
      service.listAuditLogs(PLATFORM_IDENTITY, "req-orphan-guard-001"),
    ).not.toThrow();
    await flush();

    const order = fakeDb.queries.map((query) => query.text);
    // The transaction opened and rolled back without committing.
    expect(order.some((text) => text.includes("BEGIN"))).toBe(true);
    expect(order.some((text) => text.includes("ROLLBACK"))).toBe(true);
    expect(order.some((text) => text.includes("COMMIT"))).toBe(false);
    // The mirror insert never ran, so no orphan evidence-access row is possible.
    expect(
      order.filter((text) =>
        text.includes("av_evidence.evidence_access_logs"),
      ).length,
    ).toBe(0);
    // The failed transaction still released its client back to the pool.
    expect(fakeDb.lastClient?.released).toBe(true);
  });
});
