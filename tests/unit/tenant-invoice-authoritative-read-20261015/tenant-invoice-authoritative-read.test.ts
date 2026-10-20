import { canonicalTargetPersistence } from "../billing-monthly-batch-resumption-20261015/fixtures";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePdf } from "../billing-pdf-chinese-printable-content-20261016/pdf-parser";

import type { TenantBillingProfile } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { InMemoryDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import {
  BillingSettlementRepository,
  type StoredTenantInvoiceRecord,
} from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import type { BillingSettlementService as BillingSettlementServiceType } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ControlledDownloadController } from "../../../apps/api/src/modules/controlled-download/controlled-download.controller";
import type { OwnedMobilityTripCompletedEvent } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-events";

type StreamableFileLike = {
  getStream(): NodeJS.ReadableStream;
  getHeaders(): { type?: string };
};

type CanonicalTripRowFixture = {
  tenantId: string;
  driverId: string;
  orderId: string;
  completedAt: string;
  amountMinor: number;
  currency?: string;
  orderSource?: "portal" | "api" | "phone";
  serviceBucket?: "business_dispatch";
  businessDispatchSubtype?:
    | "enterprise_dispatch"
    | "credit_card_airport_transfer"
    | null;
  costCenter?: string | null;
  passengerId?: string | null;
  partnerId?: string | null;
  partnerProgramId?: string | null;
  partnerEntrySlug?: string | null;
  eligibilityVerificationId?: string | null;
  issuerAuthorizationRef?: string | null;
  benefitReference?: string | null;
};

const serviceModulePath = resolve(
  process.env.TENANT_INVOICE_SERVICE_MODULE_PATH ??
    "apps/api/src/modules/billing-settlement/billing-settlement.service.ts",
);

async function loadBillingSettlementServiceClass(): Promise<
  typeof BillingSettlementServiceType
> {
  const mod = (await import(serviceModulePath)) as unknown as {
    BillingSettlementService: typeof BillingSettlementServiceType;
  };
  return mod.BillingSettlementService;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function paramsOf(downloadUrl: string) {
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

function buildCanonicalTripRow(fixture: CanonicalTripRowFixture) {
  const currency = fixture.currency ?? "NTD";
  return {
    tenantId: fixture.tenantId,
    completedAt: fixture.completedAt,
    serviceBucket: fixture.serviceBucket ?? "business_dispatch",
    order_record: {
      orderId: fixture.orderId,
      tenantId: fixture.tenantId,
      orderSource: fixture.orderSource ?? "portal",
      serviceBucket: fixture.serviceBucket ?? "business_dispatch",
      businessDispatchSubtype:
        fixture.businessDispatchSubtype ?? "enterprise_dispatch",
      costCenter: fixture.costCenter ?? "CC-FINANCE",
      passenger: fixture.passengerId
        ? { passengerId: fixture.passengerId }
        : { passengerId: `rider-${fixture.orderId}` },
      quotedFare: {
        currency,
        amountMinor: fixture.amountMinor,
      },
      partnerId: fixture.partnerId ?? null,
      partnerProgramId: fixture.partnerProgramId ?? null,
      partnerEntrySlug: fixture.partnerEntrySlug ?? null,
      eligibilityVerificationId: fixture.eligibilityVerificationId ?? null,
      issuerAuthorizationRef: fixture.issuerAuthorizationRef ?? null,
      benefitReference: fixture.benefitReference ?? null,
      updatedAt: fixture.completedAt,
    },
    task_record: {
      taskId: `task-${fixture.orderId}`,
      orderId: fixture.orderId,
      driverId: fixture.driverId,
      status: "completed",
      completedAt: fixture.completedAt,
      fare: {
        currency,
        amountMinor: fixture.amountMinor,
      },
    },
  };
}

function buildCompletedTripEvent(
  fixture: CanonicalTripRowFixture,
): OwnedMobilityTripCompletedEvent {
  return {
    bookingId: null,
    tenantId: fixture.tenantId,
    driverId: fixture.driverId,
    orderId: fixture.orderId,
    completedAt: fixture.completedAt,
    grossEarning: {
      currency: fixture.currency ?? "NTD",
      amountMinor: fixture.amountMinor,
    },
    orderSource: fixture.orderSource ?? "portal",
    serviceBucket: fixture.serviceBucket ?? "business_dispatch",
    businessDispatchSubtype:
      fixture.businessDispatchSubtype ?? "enterprise_dispatch",
    costCenterCode: fixture.costCenter ?? "CC-FINANCE",
    riderId: fixture.passengerId ?? `rider-${fixture.orderId}`,
    partnerId: fixture.partnerId ?? null,
    partnerProgramId: fixture.partnerProgramId ?? null,
    partnerEntrySlug: fixture.partnerEntrySlug ?? null,
    eligibilityVerificationId: fixture.eligibilityVerificationId ?? null,
    issuerAuthorizationRef: fixture.issuerAuthorizationRef ?? null,
    benefitReference: fixture.benefitReference ?? null,
    serviceProduct: fixture.businessDispatchSubtype ?? "enterprise_dispatch",
    tenantServiceProgramId: fixture.partnerProgramId ?? null,
    sourcePlatform: fixture.orderSource ?? "portal",
  };
}

async function createAuthoritativeReadHarness(options?: {
  canonicalTrips?: CanonicalTripRowFixture[];
  failCompletedTripSelect?: Error | null;
}) {
  const BillingSettlementService = await loadBillingSettlementServiceClass();
  const state = {
    canonicalTrips: (options?.canonicalTrips ?? []).map(buildCanonicalTripRow),
    failCompletedTripSelect: options?.failCompletedTripSelect ?? null,
    completedTripSelectCalls: [] as Array<{
      tenantId: string;
      periodStart: string;
      periodEnd: string;
    }>,
    invoiceInsertCalls: [] as StoredTenantInvoiceRecord[],
    profileUpsertCalls: [] as TenantBillingProfile[],
    persistedInvoices: new Map<string, StoredTenantInvoiceRecord>(),
    persistedProfiles: new Map<string, TenantBillingProfile>(),
  };

  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (
      sql.includes("FROM ops.phase1_driver_tasks AS tasks") &&
      sql.includes("INNER JOIN ops.phase1_owned_orders AS orders") &&
      !sql.includes("SELECT DISTINCT")
    ) {
      const [requestedTenantId, periodStart, periodEnd] = values as [
        string,
        string,
        string,
      ];
      state.completedTripSelectCalls.push({
        tenantId: requestedTenantId,
        periodStart,
        periodEnd,
      });
      if (state.failCompletedTripSelect) {
        throw state.failCompletedTripSelect;
      }

      const startMs = Date.parse(periodStart);
      const endMs = Date.parse(periodEnd);
      const matchingRows = state.canonicalTrips
        .filter((row) => {
          const completedMs = Date.parse(row.completedAt);
          return (
            row.tenantId === requestedTenantId &&
            row.serviceBucket === "business_dispatch" &&
            completedMs >= startMs &&
            completedMs <= endMs
          );
        })
        .sort((left, right) =>
          right.completedAt.localeCompare(left.completedAt),
        )
        .map((row) => ({
          order_record: structuredClone(row.order_record),
          task_record: structuredClone(row.task_record),
        }));

      return { rows: matchingRows };
    }

    if (sql.includes("INSERT INTO billing.phase1_tenant_invoices")) {
      const record = JSON.parse(String(values[7])) as StoredTenantInvoiceRecord;
      state.invoiceInsertCalls.push(structuredClone(record));
      state.persistedInvoices.set(record.invoiceId, structuredClone(record));
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes("INSERT INTO billing.phase1_tenant_billing_profiles")) {
      const profile = JSON.parse(String(values[2])) as TenantBillingProfile;
      state.profileUpsertCalls.push(structuredClone(profile));
      state.persistedProfiles.set(profile.tenantId, structuredClone(profile));
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes("FROM billing.phase1_tenant_invoices") &&
      sql.includes("WHERE tenant_id = $1 AND invoice_id = $2")
    ) {
      const [requestedTenantId, requestedInvoiceId] = values as [
        string,
        string,
      ];
      const match = state.persistedInvoices.get(requestedInvoiceId);
      if (!match || match.tenantId !== requestedTenantId) {
        return { rows: [] };
      }
      return { rows: [{ record: structuredClone(match) }] };
    }

    if (
      sql.includes("FROM billing.phase1_tenant_invoices") &&
      sql.includes("WHERE tenant_id = $1")
    ) {
      const [requestedTenantId] = values as [string];
      const rows = [...state.persistedInvoices.values()]
        .filter((invoice) => invoice.tenantId === requestedTenantId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((invoice) => ({ record: structuredClone(invoice) }));
      return { rows };
    }

    if (
      sql.includes("FROM billing.phase1_tenant_billing_profiles") &&
      sql.includes("WHERE tenant_id = $1")
    ) {
      const [requestedTenantId] = values as [string];
      const profile = state.persistedProfiles.get(requestedTenantId);
      return {
        rows: profile ? [{ record: structuredClone(profile) }] : [],
      };
    }

    if (sql.includes("FROM billing.phase1_tenant_billing_profiles")) {
      return {
        rows: [...state.persistedProfiles.values()].map((profile) => ({
          record: structuredClone(profile),
        })),
      };
    }

    if (sql.includes("FROM billing.phase1_tenant_invoices")) {
      return {
        rows: [...state.persistedInvoices.values()].map((invoice) => ({
          record: structuredClone(invoice),
        })),
      };
    }

    return { rows: [] };
  });

  const databaseService = {
    isEnabled: () => true,
    query,
  } as unknown as DatabaseService;

  const repository = new BillingSettlementRepository(databaseService);
  const reportPersistenceFailureSpy = vi.spyOn(
    repository,
    "reportPersistenceFailure",
  );
  const auditNotificationService = new AuditNotificationService();
  const recordAuditLogSpy = vi.spyOn(
    auditNotificationService,
    "recordAuditLog",
  );
  const artifactStore = new InMemoryDocumentArtifactStore();
  const artifactPutSpy = vi.spyOn(artifactStore, "put");

  const service = new BillingSettlementService(
    auditNotificationService,
    repository,
    undefined,
    undefined,
    artifactStore,
  );
  const controller = new BillingSettlementController(service);
  const downloadController = new ControlledDownloadController(artifactStore);

  return {
    BillingSettlementService,
    state,
    query,
    databaseService,
    repository,
    reportPersistenceFailureSpy,
    auditNotificationService,
    recordAuditLogSpy,
    artifactStore,
    artifactPutSpy,
    service,
    controller,
    downloadController,
  };
}

describe("TENANT-INVOICE-AUTHORITATIVE-READ-20261015: authoritative tenant invoice trip read", () => {
  const TENANT_ID = "tenant-c077-auth-001";
  const CLOSED_PERIOD = {
    periodStart: "2026-05-01T00:00:00.000Z",
    periodEnd: "2026-05-31T23:59:59.000Z",
  };
  const TRIP_A: CanonicalTripRowFixture = {
    tenantId: TENANT_ID,
    driverId: "drv-c077-001",
    orderId: "order-c077-trip-A",
    completedAt: "2026-05-10T10:00:00.000Z",
    amountMinor: 10000,
  };
  const TRIP_B: CanonicalTripRowFixture = {
    tenantId: TENANT_ID,
    driverId: "drv-c077-002",
    orderId: "order-c077-trip-B",
    completedAt: "2026-05-20T15:00:00.000Z",
    amountMinor: 20000,
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("1. tenant-invoice_authoritative-read-failure-refuses-partial-issuance", () => {
    it("refuses to issue a partial 1-line invoice from local cache when canonical completed-trip SELECT fails while subsequent writes are capable of succeeding", async () => {
      const harness = await createAuthoritativeReadHarness({
        canonicalTrips: [TRIP_A, TRIP_B],
        failCompletedTripSelect: new Error(
          "canonical completed-trip SELECT failed: connection reset",
        ),
      });

      await harness.service.updateTenantBillingProfile(
        TENANT_ID,
        {
          invoiceTitle: "權威行程讀取驗證企業股份有限公司",
          taxId: "53124680",
          address: "臺北市信義區松仁路100號",
          contactName: "陳財務經理",
          email: "ap@c077-auth.example.com",
        },
        "req-c077-profile",
      );

      // Local instance cache contains only Trip A (10000 minor); Trip B (20000 minor) is only in canonical PG.
      await harness.service.handleOwnedMobilityTripCompleted(
        buildCompletedTripEvent(TRIP_A),
      );

      await expect(
        harness.service.generateTenantInvoice(
          TENANT_ID,
          {
            tenantId: TENANT_ID,
            ...CLOSED_PERIOD,
          },
          "req-c077-partial-refuse",
        ),
      ).rejects.toMatchObject({
        status: 503,
        code: "TENANT_INVOICE_TRIP_READ_UNAVAILABLE",
      });

      expect(harness.state.completedTripSelectCalls).toEqual([
        {
          tenantId: TENANT_ID,
          ...CLOSED_PERIOD,
        },
      ]);
      expect(harness.reportPersistenceFailureSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "canonical completed-trip SELECT failed: connection reset",
        }),
        "list_live_completed_tenant_trips",
      );

      // No PDF artifact materialized, no invoice row persisted, no issued invoice in memory, no notification/audit.
      expect(harness.artifactPutSpy).not.toHaveBeenCalled();
      expect(harness.state.invoiceInsertCalls).toHaveLength(0);
      expect(harness.state.persistedInvoices.size).toBe(0);
      expect(harness.service.listTenantInvoices(TENANT_ID)).toEqual([]);
      expect(harness.service.listPlatformInvoices()).toEqual([]);
      expect(
        harness.auditNotificationService
          .listNotifications()
          .filter((item) => item.title === "Tenant invoice generated"),
      ).toEqual([]);
      expect(
        harness.recordAuditLogSpy.mock.calls.filter(
          ([entry]) => entry.actionName === "generate_tenant_invoice",
        ),
      ).toEqual([]);

      // Local in-memory cache is preserved, not cleared on read failure.
      const cachedTrips = (
        harness.service as unknown as {
          liveSettlementTrips: Map<string, unknown>;
        }
      ).liveSettlementTrips;
      expect(cachedTrips.has(TRIP_A.orderId)).toBe(true);
    });

    it("refuses partial issuance from nonempty seed trips when canonical completed-trip SELECT fails, including through the controller endpoint", async () => {
      const demoTenantId = "tenant-demo-001";
      const marchPeriod = {
        periodStart: "2026-03-01T00:00:00.000Z",
        periodEnd: "2026-03-31T23:59:59.000Z",
      };
      const harness = await createAuthoritativeReadHarness({
        canonicalTrips: [
          {
            tenantId: demoTenantId,
            driverId: "drv-demo-001",
            orderId: "order-live-march-extra-001",
            completedAt: "2026-03-29T11:00:00.000Z",
            amountMinor: 150000,
          },
        ],
        failCompletedTripSelect: new Error("pg read replica timeout"),
      });

      const financeIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorId: "actor-tenant-finance-001",
        actorType: "tenant_admin",
        realm: "tenant",
        tenantId: demoTenantId,
        roleFamilies: ["tenant"],
        roles: ["tenant_finance"],
        scopes: ["tenant:billing:read", "tenant:billing:write"],
        requestId: "req-c077-seed-refuse",
      };

      await expect(
        harness.controller.generateTenantInvoice(
          {
            tenantId: demoTenantId,
            ...marchPeriod,
          },
          demoTenantId,
          "req-c077-seed-refuse",
          financeIdentity,
        ),
      ).rejects.toMatchObject({
        status: 503,
        code: "TENANT_INVOICE_TRIP_READ_UNAVAILABLE",
      });

      expect(harness.artifactPutSpy).not.toHaveBeenCalled();
      expect(harness.state.invoiceInsertCalls).toHaveLength(0);
      expect(harness.service.listTenantInvoices(demoTenantId)).toEqual([]);
    });

    it("propagates an existing ApiRequestError from the canonical trip reader without masking it as a zero-trip validation error", async () => {
      const upstreamError = new ApiRequestError(
        503,
        "DATABASE_READ_UNAVAILABLE",
        "Upstream canonical read pool exhausted.",
        { pool: "primary" },
        true,
      );
      const harness = await createAuthoritativeReadHarness({
        canonicalTrips: [TRIP_A, TRIP_B],
        failCompletedTripSelect: upstreamError,
      });

      await harness.service.handleOwnedMobilityTripCompleted(
        buildCompletedTripEvent(TRIP_A),
      );

      await expect(
        harness.service.generateTenantInvoice(TENANT_ID, {
          tenantId: TENANT_ID,
          ...CLOSED_PERIOD,
        }),
      ).rejects.toMatchObject({
        status: 503,
        code: "DATABASE_READ_UNAVAILABLE",
      });

      expect(harness.artifactPutSpy).not.toHaveBeenCalled();
      expect(harness.state.invoiceInsertCalls).toHaveLength(0);
    });
  });

  describe("2. tenant-invoice_actual-complete-source-and-recovery-calculation", () => {
    it("recovers cleanly once canonical SELECT succeeds, billing both A and B (30000 minor) without stale partial invoice or duplicate rows", async () => {
      const harness = await createAuthoritativeReadHarness({
        canonicalTrips: [TRIP_A, TRIP_B],
        failCompletedTripSelect: new Error("transient pg select error"),
      });

      await harness.service.updateTenantBillingProfile(TENANT_ID, {
        invoiceTitle: "復原開帳驗證股份有限公司",
        taxId: "87654321",
        address: "新竹市東區光復路二段101號",
        contactName: "王會計",
        email: "billing@recover-c077.example.com",
      });

      // Only Trip A (10000 minor) in local cache.
      await harness.service.handleOwnedMobilityTripCompleted(
        buildCompletedTripEvent(TRIP_A),
      );

      // Step 1: Failed canonical SELECT refuses partial issuance.
      await expect(
        harness.service.generateTenantInvoice(
          TENANT_ID,
          {
            tenantId: TENANT_ID,
            ...CLOSED_PERIOD,
          },
          "req-c077-attempt-1",
        ),
      ).rejects.toMatchObject({
        status: 503,
        code: "TENANT_INVOICE_TRIP_READ_UNAVAILABLE",
      });
      expect(harness.state.invoiceInsertCalls).toHaveLength(0);
      expect(harness.artifactPutSpy).not.toHaveBeenCalled();

      // Step 2: Canonical SELECT recovers and returns A (10000) + B (20000).
      harness.state.failCompletedTripSelect = null;

      const recoveredInvoice = await harness.service.generateTenantInvoice(
        TENANT_ID,
        {
          tenantId: TENANT_ID,
          ...CLOSED_PERIOD,
        },
        "req-c077-attempt-2",
      );

      expect(recoveredInvoice.status).toBe("issued");
      expect(recoveredInvoice.tenantId).toBe(TENANT_ID);
      expect(recoveredInvoice.lines).toHaveLength(2);
      expect(recoveredInvoice.lines.map((line) => line.orderId)).toEqual([
        TRIP_B.orderId,
        TRIP_A.orderId,
      ]);
      expect(recoveredInvoice.amount).toEqual({
        currency: "TWD",
        amountMinor: 30000,
      });

      expect(harness.artifactPutSpy).toHaveBeenCalledTimes(1);
      expect(harness.state.invoiceInsertCalls).toHaveLength(1);
      expect(harness.state.invoiceInsertCalls[0]?.invoiceId).toBe(
        recoveredInvoice.invoiceId,
      );
      expect(harness.state.invoiceInsertCalls[0]?.amount.amountMinor).toBe(
        30000,
      );
      expect(harness.state.invoiceInsertCalls[0]?.lines).toHaveLength(2);

      // Step 3: Subsequent regeneration for the same period is idempotent and does not insert duplicate rows.
      const rerunInvoice = await harness.service.generateTenantInvoice(
        TENANT_ID,
        {
          tenantId: TENANT_ID,
          ...CLOSED_PERIOD,
        },
        "req-c077-attempt-3",
      );
      expect(rerunInvoice.invoiceId).toBe(recoveredInvoice.invoiceId);
      expect(rerunInvoice.amount.amountMinor).toBe(30000);
      expect(rerunInvoice.lines).toHaveLength(2);
      expect(harness.state.invoiceInsertCalls).toHaveLength(1);
      expect(harness.service.listTenantInvoices(TENANT_ID)).toHaveLength(1);
    });

    it("deduplicates overlapping cached and canonical orderIds with canonical row precedence while filtering out other tenants and out-of-period trips", async () => {
      const canonicalTripAUpdated: CanonicalTripRowFixture = {
        ...TRIP_A,
        amountMinor: 12500,
      };
      const outOfPeriodTrip: CanonicalTripRowFixture = {
        tenantId: TENANT_ID,
        driverId: "drv-c077-003",
        orderId: "order-c077-april-out",
        completedAt: "2026-04-30T23:59:59.000Z",
        amountMinor: 99000,
      };
      const otherTenantTrip: CanonicalTripRowFixture = {
        tenantId: "tenant-other-999",
        driverId: "drv-c077-004",
        orderId: "order-c077-other-tenant",
        completedAt: "2026-05-15T12:00:00.000Z",
        amountMinor: 88000,
      };

      const harness = await createAuthoritativeReadHarness({
        canonicalTrips: [
          canonicalTripAUpdated,
          TRIP_B,
          outOfPeriodTrip,
          otherTenantTrip,
        ],
      });

      // Local cache has stale 10000 minor for TRIP_A plus an out-of-period cached trip.
      await harness.service.handleOwnedMobilityTripCompleted(
        buildCompletedTripEvent(TRIP_A),
      );
      await harness.service.handleOwnedMobilityTripCompleted(
        buildCompletedTripEvent(outOfPeriodTrip),
      );
      await harness.service.handleOwnedMobilityTripCompleted(
        buildCompletedTripEvent(otherTenantTrip),
      );

      const invoice = await harness.service.generateTenantInvoice(TENANT_ID, {
        tenantId: TENANT_ID,
        ...CLOSED_PERIOD,
      });

      expect(invoice.lines).toHaveLength(2);
      expect(invoice.lines.map((line) => line.orderId)).toEqual([
        TRIP_B.orderId,
        TRIP_A.orderId,
      ]);
      const lineA = invoice.lines.find(
        (line) => line.orderId === TRIP_A.orderId,
      );
      const lineB = invoice.lines.find(
        (line) => line.orderId === TRIP_B.orderId,
      );
      expect(lineA?.amount.amountMinor).toBe(12500);
      expect(lineB?.amount.amountMinor).toBe(20000);
      expect(invoice.amount).toEqual({
        currency: "TWD",
        amountMinor: 32500,
      });
    });
  });

  describe("3. tenant-invoice_original-offline-driver-scope-and-artifact-regressions", () => {
    it("preserves deliberate noDB/demo offline invoice issuance when repository is disabled or absent", async () => {
      const BillingSettlementService =
        await loadBillingSettlementServiceClass();
      const auditService = new AuditNotificationService();
      const store = new InMemoryDocumentArtifactStore();
      const offlineService = new BillingSettlementService(
        auditService,
        undefined,
        undefined,
        undefined,
        store,
      );

      await offlineService.handleOwnedMobilityTripCompleted(
        buildCompletedTripEvent(TRIP_A),
      );

      const invoice = await offlineService.generateTenantInvoice(TENANT_ID, {
        tenantId: TENANT_ID,
        ...CLOSED_PERIOD,
      });

      expect(invoice.status).toBe("issued");
      expect(invoice.lines).toHaveLength(1);
      expect(invoice.lines[0]?.orderId).toBe(TRIP_A.orderId);
      expect(invoice.amount.amountMinor).toBe(10000);

      // Seeded demo tenant in offline mode also continues to work.
      const demoInvoice = await offlineService.generateTenantInvoice(
        "tenant-demo-001",
        {
          tenantId: "tenant-demo-001",
          periodStart: "2026-03-01T00:00:00.000Z",
          periodEnd: "2026-03-31T23:59:59.000Z",
        },
      );
      expect(demoInvoice.status).toBe("issued");
      expect(demoInvoice.lines).toHaveLength(3);
      expect(demoInvoice.amount.amountMinor).toBe(350000);
    });

    it("preserves driver-statement seed fallback when live driver trip query fails on an enabled repository", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));

      const BillingSettlementService =
        await loadBillingSettlementServiceClass();
      const repository = {
        isEnabled: vi.fn(() => true),
        persistChanges: vi.fn(async () => undefined),
        listLiveDriverTripsInPeriod: vi.fn(async () => {
          throw new Error("db offline");
        }),
        reportPersistenceFailure: vi.fn(),
      } as unknown as BillingSettlementRepository;

      repository.withDriverStatementTarget = canonicalTargetPersistence(
        repository.persistChanges.bind(repository),
      );

      const service = new BillingSettlementService(
        new AuditNotificationService(),
        repository,
      );
      await service.publishDriverFeePlan({
        planName: "default-driver-plan",
        version: "v1",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });

      const result = await service.generateDriverStatements({
        periodMonth: "2026-03",
      });

      expect(repository.reportPersistenceFailure).toHaveBeenCalledWith(
        expect.any(Error),
        "list_live_driver_trips_in_period",
      );
      expect(result.items).toHaveLength(2);
      const statement001 = result.items.find(
        (item) => item.driverId === "drv-demo-001",
      );
      expect(statement001?.lines.map((line) => line.orderId)).toEqual([
        "order-demo-032",
        "order-demo-031",
      ]);
    });

    it("preserves real PDF artifact bytes, SHA-256 manifest verification, expiry link reissue, profile durable readback, and C079 fresh PG readback", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));

      const harness = await createAuthoritativeReadHarness({
        canonicalTrips: [TRIP_A, TRIP_B],
      });

      const updatedProfile = await harness.service.updateTenantBillingProfile(
        TENANT_ID,
        {
          invoiceTitle: "Taiwan Fleet PDF & Mail Verification Ltd.",
          taxId: "24681357",
          address: "Taipei Xinyi District",
          contactName: "Finance Director",
          email: "finance@pdf-mail-verify.example.com",
        },
        "req-profile-durable",
      );
      expect(harness.service.getTenantBillingProfile(TENANT_ID)).toEqual(
        updatedProfile,
      );
      expect(
        await harness.repository.findInvoiceMailBillingProfile(TENANT_ID),
      ).toEqual(updatedProfile);

      // Denials for cross-tenant, unclosed period, and empty period when canonical SELECT succeeds with 0 rows.
      await expect(
        harness.service.generateTenantInvoice(TENANT_ID, {
          tenantId: "tenant-mismatch-999",
          ...CLOSED_PERIOD,
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "TENANT_SCOPE_MISMATCH",
      });

      await expect(
        harness.service.generateTenantInvoice(TENANT_ID, {
          tenantId: TENANT_ID,
          periodStart: "2026-06-01T00:00:00.000Z",
          periodEnd: "2026-06-30T23:59:59.000Z",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      await expect(
        harness.service.generateTenantInvoice(TENANT_ID, {
          tenantId: TENANT_ID,
          periodStart: "2025-01-01T00:00:00.000Z",
          periodEnd: "2025-01-31T23:59:59.000Z",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      // Valid closed period with A + B issues invoice and materializes real PDF bytes.
      const invoice = await harness.service.generateTenantInvoice(
        TENANT_ID,
        {
          tenantId: TENANT_ID,
          ...CLOSED_PERIOD,
        },
        "req-pdf-mail-issue",
      );

      expect(invoice.amount.amountMinor).toBe(30000);
      const originalUrl = invoice.artifactUrl!;
      const originalParams = paramsOf(originalUrl);
      const resolvedFile = (await harness.downloadController.resolve(
        "tenant-invoice",
        invoice.invoiceId,
        originalParams.signedAt,
        originalParams.expiresAt,
        originalParams.keyId,
        originalParams.manifestHash,
        originalParams.sig,
        originalParams.sigV,
      )) as unknown as StreamableFileLike;
      const pdfBytes = await drain(resolvedFile.getStream());
      expect(pdfBytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
      expect(pdfBytes.toString("latin1")).toContain("%%EOF");
      const text = (await parsePdf(pdfBytes)).text;
      expect(text).toContain(`Tenant Invoice ${invoice.invoiceId}`);
      expect(text).toContain("Taiwan Fleet PDF & Mail Verification Ltd.");
      expect(sha256(pdfBytes)).toBe(
        invoice.artifactDownloadMetadata.manifestHash,
      );

      // Advance past 15-minute link TTL and verify transparent link reissue preserves hash, lines, and amount.
      vi.setSystemTime(new Date("2026-06-01T00:30:00.000Z"));
      const reissued = harness.service.getTenantInvoice(
        TENANT_ID,
        invoice.invoiceId,
      );
      expect(reissued.artifactUrl).not.toBe(originalUrl);
      expect(reissued.artifactDownloadMetadata.manifestHash).toBe(
        invoice.artifactDownloadMetadata.manifestHash,
      );
      expect(reissued.amount).toEqual(invoice.amount);
      expect(reissued.lines).toEqual(invoice.lines);
      expect(reissued.createdAt).toBe(invoice.createdAt);

      // Verify C079 fresh PG readback on a separate replica instance sharing the PG state and artifact store.
      const replicaService = new harness.BillingSettlementService(
        new AuditNotificationService(),
        harness.repository,
        undefined,
        undefined,
        harness.artifactStore,
      );
      const freshDetail = await replicaService.getTenantInvoiceFresh(
        TENANT_ID,
        invoice.invoiceId,
      );
      expect(freshDetail.invoiceId).toBe(invoice.invoiceId);
      expect(freshDetail.amount.amountMinor).toBe(30000);
      expect(freshDetail.lines).toHaveLength(2);

      const freshList = await replicaService.listTenantInvoicesFresh(TENANT_ID);
      expect(freshList.items.map((item) => item.invoiceId)).toEqual([
        invoice.invoiceId,
      ]);
    });
  });
});
