import { describe, expect, it, vi } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { InMemoryDocumentArtifactStore } from "../../../../apps/api/src/common/document-artifacts";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ComplaintService } from "../../../../apps/api/src/modules/complaint/complaint.service";
import { ControlledDownloadController } from "../../../../apps/api/src/modules/controlled-download/controlled-download.controller";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// SR-RELEASE-001 / C118: 同一訂單跨角色的完整業務閉環。
//
// 9/6 audit 標記 C118 為「驗收缺口」：既有各 SR-QA-* 驗收任務分別證明了各段
// 鏈路（例如 apps/api/tests/integration/tenant-governance-e2e.test.ts 的
// "booking -> approval -> dispatch -> completion -> billing"），但沒有任何一個
// 既有測試把 建單 -> 簽核 -> 派車 -> driver 完成 -> 帳務 -> 文件(可下載檔案) ->
// 客訴結案 這七段，用同一個 orderId/bookingId 串成一條可重跑的鏈路一路走到「客訴
// 結案」。本測試補上這條完整鏈路，全程使用真實服務層類別（與
// tenant-governance-e2e.test.ts、sr-qa-booking-001 系列相同的組裝方式），不使用
// fixture 或假送達模擬結果。
//
// 「文件」段額外驗證 N04（「帳單建立了下載中繼資料，但沒有真正帳單檔案」）於
// 9/6 audit 之後是否已修復：直接呼叫 ControlledDownloadController.resolve() 走
// 真實簽章驗證並讀出實際 PDF bytes，而非只看程式碼判斷。
//
// 本測試不覆蓋「文件已寄送」「推播已送達真機」等 live/外部邊界（見
// docs/04-uat/system-remediation-20260906/closed-loop-evidence.md 的誠實揭露）。

// Approver-kind resolution needs a resolvable, status:"active"
// tenant_finance_admin user; without a backing repository the only such user
// available is TenantPartnerService's built-in demo seed (USER_ROLE_SEED)
// under DEMO_TENANT_ID ("tenant-demo-001", userId "tenant-user-demo-003") --
// same reuse this codebase already establishes in
// tests/unit/system-remediation/sr-qa-booking-001/c025-tenant-approval-workflow-order-consistency.test.ts.
const TENANT_ID = "tenant-demo-001";
const FINANCE_APPROVER_ID = "tenant-user-demo-003";
const TENANT_ADMIN = {
  actorType: "tenant_admin",
  actorId: `${TENANT_ID}-admin`,
} as never;
const RESERVATION_WINDOW_START = "2026-09-15T14:00:00.000Z";

function createHarness(tenantId: string) {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService as never,
  );
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "driver-release-001",
        vehicleId: "vehicle-release-001",
        etaMinutes: 6,
        operatingArea: "taipei",
        serviceBuckets: ["business_dispatch"],
      },
    ]),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };
  const stubEmitter = { emit: () => {} } as never;
  const taskEventsService = new OwnedMobilityTaskEventsService(stubEmitter);
  const opsDispatchEventsService = new OpsDispatchEventsService(stubEmitter);
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    tenantPartnerService,
  );

  tenantPartnerService.registerOrderFeedProvider(() =>
    ownedMobilityService.listOrders(),
  );
  tenantPartnerService.upsertTenantQuotaPolicy(tenantId, {
    period: "monthly",
    limit: {
      bookingCountLimit: 5,
      amountMinorLimit: 1_000_000,
      currency: "TWD",
      enforcementMode: "hard_block",
    },
  });
  tenantPartnerService.upsertApprovalRule(tenantId, {
    ruleName: "High-value finance approval",
    priority: 10,
    conditions: [
      {
        field: "booking.amount_minor",
        op: "gte",
        value: 100_000,
      },
    ],
    action: "require_approval",
    approvalMode: "any_of",
    approvers: [{ kind: "tenant_finance_admin" }],
  });

  // Same wiring as apps/api/tests/integration/tenant-governance-e2e.test.ts's
  // createHarness(): the billing-settlement repository's completed-trip feed is
  // sourced directly from this same OwnedMobilityService instance, so an
  // invoice line for this order proves the SAME orderId, not a fixture.
  const billingSettlementRepository = {
    isEnabled: vi.fn(() => true),
    loadState: vi.fn(async () => ({
      tenantBillingProfiles: [],
      tenantInvoices: [],
      driverFeePlans: [],
      driverStatements: [],
      reimbursementBatches: [],
      reconciliationIssues: [],
    })),
    persistChanges: vi.fn(async () => {}),
    reportPersistenceFailure: vi.fn(),
    listLiveCompletedTenantTrips: vi.fn(
      async (
        requestedTenantId: string,
        periodStart: string,
        periodEnd: string,
      ) => {
        const start = new Date(periodStart).getTime();
        const end = new Date(periodEnd).getTime();
        const ordersById = new Map(
          ownedMobilityService
            .listOrders()
            .filter((order) => order.tenantId === requestedTenantId)
            .map((order) => [order.orderId, order]),
        );

        return ownedMobilityService
          .listDriverTasks()
          .filter(
            (task) =>
              task.status === "completed" &&
              task.completedAt &&
              new Date(task.completedAt).getTime() >= start &&
              new Date(task.completedAt).getTime() <= end,
          )
          .flatMap((task) => {
            const order = ordersById.get(task.orderId);
            if (!order) {
              return [];
            }

            return [
              {
                tenantId: order.tenantId ?? requestedTenantId,
                driverId: task.driverId,
                orderId: order.orderId,
                completedAt: task.completedAt ?? order.updatedAt,
                grossEarning: task.fare ??
                  order.quotedFare ?? {
                    currency: "NTD",
                    amountMinor: 0,
                  },
                costCenter: order.costCenter,
                orderSource: order.orderSource,
                serviceBucket: order.serviceBucket,
                businessDispatchSubtype: order.businessDispatchSubtype,
                partnerId: order.partnerId,
                partnerProgramId: order.partnerProgramId,
                partnerEntrySlug: order.partnerEntrySlug,
                eligibilityVerificationId: order.eligibilityVerificationId,
                issuerAuthorizationRef: order.issuerAuthorizationRef,
                benefitReference: order.benefitReference,
              },
            ];
          });
      },
    ),
    listLiveDriverTripsInPeriod: vi.fn(async () => []),
    listLiveDriverTripsInPeriodForDriver: vi.fn(async () => []),
  };

  const documentArtifactStore = new InMemoryDocumentArtifactStore();
  const billingSettlementService = new BillingSettlementService(
    auditNotificationService,
    billingSettlementRepository as never,
    undefined,
    undefined,
    documentArtifactStore,
  );

  const complaintService = new ComplaintService(auditNotificationService);

  return {
    auditNotificationService,
    tenantPartnerService,
    ownedMobilityService,
    billingSettlementService,
    documentArtifactStore,
    complaintService,
  };
}

function paramsOfDownloadUrl(downloadUrl: string) {
  const query = new URLSearchParams(downloadUrl.split("?")[1]);
  return {
    signedAt: query.get("signed_at") ?? undefined,
    expiresAt: query.get("expires_at") ?? undefined,
    keyId: query.get("key_id") ?? undefined,
    manifestHash: query.get("manifest_hash") ?? undefined,
    sig: query.get("sig") ?? undefined,
    sigV: query.get("sig_v") ?? undefined,
  };
}

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("SR-RELEASE-001 / C118: same-order cross-role closed loop", () => {
  it(
    "walks one orderId through create -> approval -> dispatch -> driver " +
      "completion -> billing invoice -> document download -> complaint " +
      "closure",
    async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));

      const {
        tenantPartnerService,
        ownedMobilityService,
        billingSettlementService,
        documentArtifactStore,
        complaintService,
      } = createHarness(TENANT_ID);

      // 1. 建單（企業／租戶通道）。
      const created = await ownedMobilityService.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          reservationWindowStart: RESERVATION_WINDOW_START,
          reservationWindowEnd: "2026-09-15T15:00:00.000Z",
          pickup: { address: "Pickup" },
          dropoff: { address: "Dropoff" },
          passenger: { name: "Release Rider", phone: "0912345678" },
        } as never,
        TENANT_ID,
        TENANT_ADMIN,
        "req-release-001-create",
      );
      const { orderId, bookingId } = created;

      const pendingBooking = ownedMobilityService.getTenantBooking(
        TENANT_ID,
        bookingId,
      );
      expect(pendingBooking.approvalState).toBe("pending");

      // 2. 簽核：派車在核准前應遭拒，核准後才可派車。
      expect(() =>
        ownedMobilityService.dispatchOrder(orderId, { mode: "auto" }),
      ).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "BOOKING_APPROVAL_PENDING",
            }),
          }),
        }),
      );

      const approvalRequest = tenantPartnerService.listApprovalRequests(
        TENANT_ID,
        { bookingId },
      )[0];
      expect(approvalRequest?.status).toBe("pending");

      await ownedMobilityService.approveTenantBookingApprovalRequest(
        TENANT_ID,
        approvalRequest!.approvalRequestId,
        FINANCE_APPROVER_ID,
        null,
        {},
        "req-release-001-approve",
      );
      expect(
        ownedMobilityService.getTenantBooking(TENANT_ID, bookingId)
          .approvalState,
      ).toBe("approved");

      // 3. 派車：核准後成功指派同一 orderId 給司機／車輛。
      const dispatchJob = ownedMobilityService.dispatchOrder(
        orderId,
        { mode: "auto" },
        "req-release-001-dispatch",
      );
      const assignment = ownedMobilityService.assignDispatch(
        {
          dispatchJobId: dispatchJob.dispatchJobId,
          vehicleId: "vehicle-release-001",
          driverId: "driver-release-001",
        },
        "req-release-001-assign",
      );
      expect(
        ownedMobilityService
          .listDriverTasks()
          .find((task) => task.taskId === assignment.taskId)?.orderId,
      ).toBe(orderId);

      // 4. Driver 完成：同一 taskId／orderId 走完出發到完成。
      ownedMobilityService.acceptDriverTask(assignment.taskId, {
        acceptedAt: "2026-09-15T12:05:00.000Z",
      });
      ownedMobilityService.departDriverTask(assignment.taskId, {
        departedAt: "2026-09-15T12:10:00.000Z",
      });
      ownedMobilityService.arrivedPickup(assignment.taskId, {
        arrivedAt: "2026-09-15T12:20:00.000Z",
      });
      ownedMobilityService.startDriverTask(assignment.taskId, {
        startedAt: "2026-09-15T12:25:00.000Z",
      });
      await ownedMobilityService.completeDriverTask(
        assignment.taskId,
        {
          completedAt: "2026-09-15T12:45:00.000Z",
          actualDistanceKm: 12.5,
          actualDurationSec: 1200,
          proof: { photos: ["cmVsZWFzZS0wMDEtcHJvb2Y="] },
        },
        "req-release-001-complete",
      );

      const completedOrder = ownedMobilityService.getOrder(orderId);
      expect(completedOrder.status).toBe("completed");

      const quotaLedgerAfterComplete =
        tenantPartnerService.listTenantQuotaLedger(TENANT_ID, { bookingId });
      expect(quotaLedgerAfterComplete).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ bookingId, entryType: "consume" }),
        ]),
      );

      // 5. 帳務：同一 orderId 出現在租戶月結帳單的 invoice line。
      vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
      const invoice = await billingSettlementService.generateTenantInvoice(
        TENANT_ID,
        {
          tenantId: TENANT_ID,
          periodStart: "2026-09-01T00:00:00.000Z",
          periodEnd: "2026-09-15T23:59:59.000Z",
        },
        "req-release-001-invoice",
      );
      expect(invoice.lines).toEqual(
        expect.arrayContaining([expect.objectContaining({ orderId })]),
      );

      // 6. 文件：帳單不只是「中繼資料」——透過真正的簽章驗證下載路徑讀出實際
      // PDF bytes，重新驗證 N04（"帳單建立了下載中繼資料，但沒有真正帳單檔案")
      // 在目前 SHA 是否仍然成立。
      expect(invoice.artifactUrl).toBeTruthy();
      const controller = new ControlledDownloadController(
        documentArtifactStore,
      );
      const params = paramsOfDownloadUrl(invoice.artifactUrl!);
      const file = controller.resolve(
        "tenant-invoice",
        invoice.invoiceId,
        params.signedAt,
        params.expiresAt,
        params.keyId,
        params.manifestHash,
        params.sig,
        params.sigV,
      ) as unknown as {
        getStream(): NodeJS.ReadableStream;
        getHeaders(): { type?: string };
      };
      const bytes = await drain(file.getStream());
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(file.getHeaders().type).toBe("application/pdf");

      // 7. 客訴結案：新開一筆客訴案件，relatedOrderId 綁定「同一個」orderId，
      // 走完 resolve -> close，證明客訴系統確實可用同一訂單 ID 跨角色追溯，而
      // 非只是獨立於訂單之外的案件。
      const complaint = complaintService.createComplaintCase(
        {
          caseSource: "app",
          relatedOrderId: orderId,
          category: "fare_dispute",
          severity: "normal",
          description:
            "SR-RELEASE-001 closed-loop regression: passenger disputes the fare on this same order.",
        },
        "req-release-001-complaint-open",
      );
      expect(complaint.relatedOrderId).toBe(orderId);
      expect(complaint.status).not.toBe("closed");

      const resolved = complaintService.resolveComplaintCase(
        complaint.caseNo,
        {
          resolutionCode: "resolved_with_credit",
          closingNote:
            "SR-RELEASE-001 closed-loop regression: fare dispute resolved with a credit.",
        },
        "req-release-001-complaint-resolve",
      );
      expect(resolved.status).toBe("resolved");
      expect(resolved.relatedOrderId).toBe(orderId);

      const closed = complaintService.closeComplaintCase(
        complaint.caseNo,
        {
          resolutionCode: "resolved_with_credit",
          closingNote:
            "SR-RELEASE-001 closed-loop regression: case closed after credit applied.",
        },
        "req-release-001-complaint-close",
      );
      expect(closed.status).toBe("closed");
      expect(closed.relatedOrderId).toBe(orderId);

      // 8. 最終斷言：同一個 orderId／bookingId 貫穿建單、簽核、派車、driver
      // 完成、帳務（invoice line）、文件（真實 PDF bytes）、客訴結案七段。
      expect(
        new Set([
          created.orderId,
          ownedMobilityService
            .listDriverTasks()
            .find((task) => task.taskId === assignment.taskId)?.orderId,
          completedOrder.orderId,
          invoice.lines.find((line) => line.orderId === orderId)?.orderId,
          closed.relatedOrderId,
        ]),
      ).toEqual(new Set([orderId]));

      vi.useRealTimers();
    },
  );
});
