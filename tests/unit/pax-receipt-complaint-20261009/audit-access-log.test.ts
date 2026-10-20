import { describe, expect, it } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminRegulatorCasesService } from "../../../apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.service";

describe("passenger audit actor projection into existing regulator case logs", () => {
  it("preserves the genuine actor and existing case filter", () => {
    const audit = new AuditNotificationService();
    const passenger = "drts_passenger_11111111-1111-4111-8111-111111111111";
    const record = audit.recordAuditLog({
      actorType: "first_party_passenger",
      actorId: passenger,
      tenantId: null,
      moduleName: "complaint",
      actionName: "create_passenger_complaint",
      resourceType: "complaint_case",
      resourceId: "unit-complaint",
      requestId: "unit-passenger-audit",
      newValuesSummary: { orderId: "unit-related-order" },
    });
    audit.recordAuditLog({
      actorType: "first_party_passenger",
      actorId: passenger,
      tenantId: null,
      moduleName: "complaint",
      actionName: "create_passenger_complaint",
      resourceType: "complaint_case",
      resourceId: "unit-unrelated-complaint",
      requestId: "unit-unrelated-audit",
      newValuesSummary: { orderId: "unit-unrelated-order" },
    });
    // Only the independent investigation/report repositories are fixtures.
    // Audit creation, case matching and access-log projection run real methods.
    const service = new PlatformAdminRegulatorCasesService(
      {
        listCorrelatedTakeoverCases: () => [],
        getLatestInvestigationBundleForCase: () => null,
      } as never,
      audit,
      {
        getInvestigation: () => ({
          caseId: "unit-regulator-case",
          orderId: "unit-related-order",
        }),
        listControlledExports: () => [],
        listLegalHolds: () => [],
      } as never,
      { listReports: () => [], listNotifications: () => [] } as never,
    );
    expect(service.listRegulatorCaseAccessLogs("unit-regulator-case")).toEqual([
      {
        auditId: record.auditId,
        createdAt: record.createdAt,
        actorId: passenger,
        actorType: "first_party_passenger",
        actionName: record.actionName,
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        requestId: record.requestId,
      },
    ]);
  });
});
