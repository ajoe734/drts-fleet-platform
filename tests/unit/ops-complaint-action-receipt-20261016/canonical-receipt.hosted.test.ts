import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../../apps/api/src/common/idempotency";
import { AuditLogRepository } from "../../../apps/api/src/modules/audit-notification/audit-log.repository";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import type { DatabaseService } from "../../../apps/api/src/common/db";

const identity = {
  actorId: "ops-receipt-hosted",
  actorType: "ops_user" as const,
  realm: "ops" as const,
  scopes: ["audit:read"],
  tenantId: null,
};

// The existing harness owns migrated disposable databases. Never opens a DB on
// the VM; the original hosted flag controls this suite without new policy rails.
describe.skipIf(!hostedPaymentEnabled)(
  "complaint receipt canonical storage across API instances",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterAll(() => h.close(), 30000);

    async function services(database: DatabaseService) {
      const audit = new AuditNotificationService(
        new AuditLogRepository(database),
      );
      await audit.onModuleInit();
      const complaint = new ComplaintService(
        audit,
        new ComplaintRepository(database),
      );
      await complaint.onModuleInit();
      return {
        audit,
        complaint,
        controller: new ComplaintController(
          complaint,
          new IncidentService(audit),
          new IdempotencyService(new IdempotencyRepository(database)),
        ),
      };
    }

    it("replays one durable create receipt on a fresh API and reads its exact committed audit record", async () => {
      const writer = await services(h.database);
      const key = randomUUID();
      const command = {
        caseSource: "ops" as const,
        category: "lost_and_found" as const,
        severity: "normal" as const,
        description: "Fictional canonical receipt exercise",
      };
      const response = { status: vi.fn(), setHeader: vi.fn() };
      const first = await writer.controller.createComplaintCase(
        command,
        response,
        key,
        "first-create",
      );
      const receipt = first.meta.actionReceipt;
      await vi.waitFor(
        async () => {
          const row = await h.pool!.query(
            "SELECT request_id FROM admin.audit_logs WHERE audit_id=$1",
            [receipt.auditId],
          );
          expect(row.rows).toEqual([{ request_id: "first-create" }]);
        },
        { timeout: 5000 },
      );
      const peer = await services(h.peerDatabase());
      const replay = await peer.controller.createComplaintCase(
        command,
        response,
        key,
        "peer-replay",
      );
      expect(replay.data).toEqual(first.data);
      expect(replay.meta.actionReceipt).toEqual(receipt);
      const coldReader = new AuditNotificationService(
        new AuditLogRepository(h.peerDatabase()),
      );
      expect(
        coldReader
          .getAuditLogsSnapshot()
          .some((a) => a.auditId === receipt.auditId),
      ).toBe(false);
      const found = await coldReader.readAuditLogById(
        receipt.auditId,
        identity,
        "cold-read",
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        auditId: receipt.auditId,
        requestId: receipt.actionId,
        resourceType: "complaint_case",
        resourceId: first.data.caseNo,
        actionName: "create_complaint_case",
      });
      const count = await h.pool!.query(
        "SELECT count(*)::int AS n FROM admin.audit_logs WHERE resource_id=$1 AND action_name='create_complaint_case'",
        [first.data.caseNo],
      );
      expect(count.rows).toEqual([{ n: 1 }]);
    }, 30000);

    it("keeps close replay canonical and records only explicit export preparation", async () => {
      const f = await services(h.database);
      const original = await f.controller.createComplaintCase(
        {
          caseSource: "ops",
          category: "lost_and_found",
          severity: "normal",
          description: "Fictional case; no human contact or physical return",
        },
        { status: vi.fn(), setHeader: vi.fn() },
        randomUUID(),
        "create-export-case",
      );
      const resolution = {
        resolutionCode: "resolved_other" as const,
        closingNote: "Internal fictional exercise only",
      };
      await f.controller.resolveComplaintCase(
        original.data.caseNo,
        resolution,
        "resolve-for-export",
      );
      const closed = await f.controller.closeComplaintCase(
        original.data.caseNo,
        resolution,
        "close-for-export",
      );
      const repeated = await f.controller.closeComplaintCase(
        original.data.caseNo,
        resolution,
        "repeat-close",
      );
      expect(repeated.meta.actionReceipt).toEqual(closed.meta.actionReceipt);
      await f.controller.getComplaintExportView(
        original.data.caseNo,
        "background-view",
      );
      const exported = await f.controller.getComplaintExportView(
        original.data.caseNo,
        "explicit-export",
        "true",
      );
      expect(exported.data.readyForAudit).toBe(true);
      const reader = new AuditLogRepository(h.peerDatabase());
      await vi.waitFor(
        async () => {
          const found = await reader.findById(
            exported.meta.actionReceipt!.auditId,
          );
          expect(found).toMatchObject({
            requestId: "explicit-export",
            actionName: "export_complaint_case_view",
            resourceId: original.data.caseNo,
            newValuesSummary: { readyForAudit: true },
          });
        },
        { timeout: 5000 },
      );
      const counts = await h.pool!.query(
        "SELECT action_name,count(*)::int AS n FROM admin.audit_logs WHERE resource_id=$1 GROUP BY action_name",
        [original.data.caseNo],
      );
      expect(counts.rows).toEqual(
        expect.arrayContaining([
          { action_name: "close_complaint_case", n: 1 },
          { action_name: "export_complaint_case_view", n: 1 },
        ]),
      );
    }, 30000);
  },
);
