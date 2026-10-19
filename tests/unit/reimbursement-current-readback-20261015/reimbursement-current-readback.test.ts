// @vitest-environment jsdom
import { Buffer as NodeBuffer } from "node:buffer";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sdk from "../../../packages/api-client/src";
import { ApiClient } from "../../../packages/api-client/src";
import * as contracts from "@drts/contracts";
import type {
  DriverStatementRecord,
  ReimbursementBatchRecord,
  RemittanceProofRecord,
} from "@drts/contracts";
import * as canvas from "../../../packages/ui-web/src/index";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const apiRequire = createRequire(resolve("apps/api/package.json"));
// The mounted UI calls the real Node PDF producer. fs.readFileSync returns
// Node Buffer bytes, which fail PDFKit's instanceof checks against jsdom's
// separate typed-array realm. Restore these stubs in the existing cleanup.
const NodeUint8Array = Object.getPrototypeOf(NodeBuffer.prototype)
  .constructor as Uint8ArrayConstructor;
const NodeArrayBuffer = new NodeUint8Array().buffer
  .constructor as ArrayBufferConstructor;
const { Reflector } = apiRequire("@nestjs/core") as {
  Reflector: new () => ConstructorParameters<typeof BootstrapAuthGuard>[0];
};

function createBillingService() {
  const auditNotificationService = new AuditNotificationService();
  return {
    service: new BillingSettlementService(auditNotificationService, undefined, {
      listReconciliationIssues: () => [],
    } as never),
    auditNotificationService,
  };
}

function driverIdentity(driverId: string): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver"],
    scopes: ["driver:read", "driver:write", "dispatch:read"],
    requestId: null,
  };
}

function platformFinanceIdentity(
  actorId = "fin-admin-readback",
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId,
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: ["billing:read", "billing:write", "reimbursement:write"],
    requestId: null,
  };
}

function createHarness(options: {
  batches?: ReimbursementBatchRecord[];
  statements?: DriverStatementRecord[];
  proofByBatchId?: Map<string, RemittanceProofRecord | null>;
  service?: BillingSettlementService;
  batchId?: string;
  failQueueLoad?: boolean;
}) {
  const appRoot = resolve("apps/platform-admin-web");
  const state = {
    batchId: options.batchId ?? options.batches?.[0]?.batchId ?? "batch-1",
    failQueueLoad: options.failQueueLoad ?? false,
    batches: options.batches,
    statements: options.statements,
    proofByBatchId:
      options.proofByBatchId ?? new Map<string, RemittanceProofRecord | null>(),
    service: options.service,
  };

  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();

      if (state.failQueueLoad) {
        return new Response(
          JSON.stringify({
            error: {
              code: "REIMBURSEMENT_UPSTREAM_UNAVAILABLE",
              message: "Reimbursement service unavailable",
              retryable: true,
              traceId: "trace-reimbursement-err",
            },
          }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (method === "GET" && url.pathname === "/api/reimbursements") {
        const data = state.service
          ? state.service.listReimbursementBatches()
          : (state.batches ?? []);
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (method === "GET" && url.pathname === "/api/driver-statements") {
        const data = state.service
          ? await state.service.listDriverStatements()
          : (state.statements ?? []);
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      const proofMatch = url.pathname.match(
        /^\/api\/reimbursements\/([^/]+)\/proof$/,
      );
      if (method === "GET" && proofMatch) {
        const targetBatchId = decodeURIComponent(proofMatch[1]!);
        const data = state.service
          ? await state.service.getReimbursementProof(targetBatchId)
          : (state.proofByBatchId.get(targetBatchId) ?? null);
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      const payWithProofMatch = url.pathname.match(
        /^\/api\/reimbursements\/([^/]+)\/pay-with-proof$/,
      );
      if (method === "POST" && payWithProofMatch && state.service) {
        const targetBatchId = decodeURIComponent(payWithProofMatch[1]!);
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const data = await state.service.markReimbursementPaidWithProof(
          targetBatchId,
          body,
          platformFinanceIdentity(),
        );
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error(`Unexpected HTTP call: ${method} ${url.pathname}`);
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  const client = new ApiClient({ baseUrl: "https://api.drts.test" });

  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "@drts/api-client": sdk,
    "@drts/contracts": contracts,
    "next/link": {
      __esModule: true,
      default: ({
        href,
        children,
        style,
      }: {
        href: string;
        children: React.ReactNode;
        style?: React.CSSProperties;
      }) => React.createElement("a", { href, style }, children),
    },
    "next/navigation": {
      useParams: () => ({ batchId: state.batchId }),
      useRouter: () => ({ refresh: vi.fn() }),
    },
    "@/lib/admin-client": {
      usePlatformAdminClient: () => client,
      formatDateTime: (iso: string) => iso || "—",
    },
  });

  const { LanguageProvider } = load<{
    LanguageProvider: React.ComponentType<{
      children?: React.ReactNode;
      defaultLocale?: "zh" | "en";
    }>;
  }>(resolve(appRoot, "lib/i18n.tsx"));

  const QueuePage = load<{ default: React.ComponentType }>(
    resolve(appRoot, "app/payments/reimbursements/page.tsx"),
  ).default;

  const DetailPage = load<{ default: React.ComponentType }>(
    resolve(appRoot, "app/payments/reimbursements/[batchId]/page.tsx"),
  ).default;

  return {
    state,
    fetchMock,
    renderQueue: () =>
      render(
        React.createElement(
          LanguageProvider,
          { defaultLocale: "zh" },
          React.createElement(QueuePage),
        ),
      ),
    renderDetail: (batchId?: string) => {
      if (batchId !== undefined) {
        state.batchId = batchId;
      }
      return render(
        React.createElement(
          LanguageProvider,
          { defaultLocale: "zh" },
          React.createElement(DetailPage),
        ),
      );
    },
  };
}

function getDlValueByLabel(container: HTMLElement, labelText: string): string {
  const divs = Array.from(container.querySelectorAll("div"));
  const labelDiv = divs.find(
    (el) => el.childElementCount === 0 && el.textContent?.trim() === labelText,
  );
  return labelDiv?.nextElementSibling?.textContent?.trim() ?? "";
}

describe("REIMBURSEMENT-CURRENT-READBACK-20261015: canonical minor-unit money display and status readback", () => {
  beforeEach(() => {
    vi.stubGlobal("Uint8Array", NodeUint8Array);
    vi.stubGlobal("ArrayBuffer", NodeArrayBuffer);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("1. reimbursement_actual-minor-unit-list-detail-item-display", () => {
    it("renders TWD amountMinor 12345 as 123.45, 1 as 0.01, and 0 as 0.00 across queue totals, detail totals, and recipient line items", async () => {
      const batches: ReimbursementBatchRecord[] = [
        {
          batchId: "reimb-batch-12345",
          driverId: "driver-12345",
          statementId: "stmt-12345",
          periodMonth: "2026-03",
          status: "pending",
          totalAmount: { currency: "TWD", amountMinor: 12345 },
          remittanceProofId: null,
          items: [
            {
              itemId: "item-12345",
              orderId: "order-12345",
              amount: { currency: "TWD", amountMinor: 12345 },
              reason: "platform_funded_discount",
              channelKey: "partner_airport",
            },
          ],
          approvedAt: "2026-03-10T10:00:00.000Z",
          paidAt: null,
        },
        {
          batchId: "reimb-batch-00001",
          driverId: "driver-00001",
          statementId: "stmt-00001",
          periodMonth: "2026-03",
          status: "pending",
          totalAmount: { currency: "TWD", amountMinor: 1 },
          remittanceProofId: null,
          items: [
            {
              itemId: "item-00001",
              orderId: "order-00001",
              amount: { currency: "TWD", amountMinor: 1 },
              reason: "platform_funded_discount",
              channelKey: "tenant_enterprise",
            },
          ],
          approvedAt: "2026-03-10T09:00:00.000Z",
          paidAt: null,
        },
        {
          batchId: "reimb-batch-00000",
          driverId: "driver-00000",
          statementId: "stmt-00000",
          periodMonth: "2026-03",
          status: "pending",
          totalAmount: { currency: "TWD", amountMinor: 0 },
          remittanceProofId: null,
          items: [
            {
              itemId: "item-00000",
              orderId: "order-00000",
              amount: { currency: "TWD", amountMinor: 0 },
              reason: "platform_funded_discount",
              channelKey: "phone_dispatch",
            },
          ],
          approvedAt: "2026-03-10T08:00:00.000Z",
          paidAt: null,
        },
      ];

      const harness = createHarness({ batches });
      harness.renderQueue();

      await waitFor(() => {
        expect(screen.getByText("reimb-batch-12345")).toBeTruthy();
      });

      const queueTable = screen.getByRole("table");
      const queueRows = within(queueTable).getAllByRole("row").slice(1);
      expect(queueRows).toHaveLength(3);
      expect(within(queueRows[0]!).getAllByRole("cell")[2]?.textContent).toBe(
        "123.45 TWD",
      );
      expect(within(queueRows[1]!).getAllByRole("cell")[2]?.textContent).toBe(
        "0.01 TWD",
      );
      expect(within(queueRows[2]!).getAllByRole("cell")[2]?.textContent).toBe(
        "0.00 TWD",
      );

      cleanup();

      for (const [batchId, expectedDisplay] of [
        ["reimb-batch-12345", "123.45 TWD"],
        ["reimb-batch-00001", "0.01 TWD"],
        ["reimb-batch-00000", "0.00 TWD"],
      ] as const) {
        const detailView = harness.renderDetail(batchId);
        await waitFor(() => {
          expect(screen.getAllByText(batchId).length).toBeGreaterThan(0);
        });

        expect(detailView.container.textContent).toContain(
          `· ${expectedDisplay} ·`,
        );
        expect(getDlValueByLabel(detailView.container, "總金額")).toBe(
          expectedDisplay,
        );

        const detailTable = screen.getByRole("table");
        const itemRows = within(detailTable).getAllByRole("row").slice(1);
        expect(itemRows).toHaveLength(1);
        expect(within(itemRows[0]!).getAllByRole("cell")[1]?.textContent).toBe(
          expectedDisplay,
        );

        cleanup();
      }
    });

    it("preserves canonical BillingSettlementService integer minor amounts, multi-item sums, negative signs, and currency codes", async () => {
      const { service } = createBillingService();

      await service.publishDriverFeePlan({
        planName: "Canonical Minor Unit Plan",
        version: "fee-2026-03-minor",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });

      const templateTrip = (service as any).settlementTrips.find(
        (t: any) =>
          String(t.completedAt).startsWith("2026-03") &&
          t.platformFundedDiscount?.amountMinor > 0,
      );
      expect(templateTrip).toBeDefined();

      const targetDriverId = templateTrip.driverId as string;
      (service as any).settlementTrips = [
        {
          ...templateTrip,
          orderId: "order-minor-12345",
          platformFundedDiscount: { currency: "TWD", amountMinor: 12345 },
        },
        {
          ...templateTrip,
          orderId: "order-minor-00001",
          platformFundedDiscount: { currency: "TWD", amountMinor: 1 },
        },
      ];

      await service.generateDriverStatements({ periodMonth: "2026-03" });

      const generatedBatches = service.listReimbursementBatches({
        driverId: targetDriverId,
      });
      expect(generatedBatches).toHaveLength(1);
      const canonicalBatch = generatedBatches[0]!;
      expect(canonicalBatch.totalAmount).toEqual({
        currency: "TWD",
        amountMinor: 12346,
      });
      expect(canonicalBatch.items.map((item) => item.amount)).toEqual([
        { currency: "TWD", amountMinor: 12345 },
        { currency: "TWD", amountMinor: 1 },
      ]);

      const signedAndForeignBatch: ReimbursementBatchRecord = {
        batchId: "reimb-batch-signed-usd",
        driverId: "driver-signed",
        statementId: "stmt-signed",
        periodMonth: "2026-03",
        status: "pending",
        totalAmount: { currency: "USD", amountMinor: -12345 },
        remittanceProofId: null,
        items: [
          {
            itemId: "item-neg-12345",
            orderId: "order-neg-12345",
            amount: { currency: "USD", amountMinor: -12345 },
            reason: "adjustment",
          },
          {
            itemId: "item-neg-00001",
            orderId: "order-neg-00001",
            amount: { currency: "TWD", amountMinor: -1 },
            reason: "sub_unit_adjustment",
          },
        ],
        approvedAt: "2026-03-11T00:00:00.000Z",
        paidAt: null,
      };

      const harness = createHarness({
        batches: [canonicalBatch, signedAndForeignBatch],
      });
      harness.renderQueue();

      await waitFor(() => {
        expect(screen.getByText(canonicalBatch.batchId)).toBeTruthy();
      });

      expect(screen.getByText("123.46 TWD")).toBeTruthy();
      expect(screen.getByText("-123.45 USD")).toBeTruthy();

      cleanup();

      const detailCanonical = harness.renderDetail(canonicalBatch.batchId);
      await waitFor(() => {
        expect(
          screen.getAllByText(canonicalBatch.batchId).length,
        ).toBeGreaterThan(0);
      });
      expect(getDlValueByLabel(detailCanonical.container, "總金額")).toBe(
        "123.46 TWD",
      );
      const canonicalRows = within(screen.getByRole("table"))
        .getAllByRole("row")
        .slice(1);
      expect(canonicalRows).toHaveLength(2);
      expect(
        within(canonicalRows[0]!).getAllByRole("cell")[1]?.textContent,
      ).toBe("123.45 TWD");
      expect(
        within(canonicalRows[1]!).getAllByRole("cell")[1]?.textContent,
      ).toBe("0.01 TWD");

      cleanup();

      const detailSigned = harness.renderDetail(signedAndForeignBatch.batchId);
      await waitFor(() => {
        expect(
          screen.getAllByText(signedAndForeignBatch.batchId).length,
        ).toBeGreaterThan(0);
      });
      expect(getDlValueByLabel(detailSigned.container, "總金額")).toBe(
        "-123.45 USD",
      );
      const signedRows = within(screen.getByRole("table"))
        .getAllByRole("row")
        .slice(1);
      expect(within(signedRows[0]!).getAllByRole("cell")[1]?.textContent).toBe(
        "-123.45 USD",
      );
      expect(within(signedRows[1]!).getAllByRole("cell")[1]?.textContent).toBe(
        "-0.01 TWD",
      );
    });
  });

  describe("2. reimbursement_canonical-status-without-timer-reconciliation", () => {
    it("keeps a canonical paid batch in paid state before and after 72 hours across queue and detail without timer-fabricated reconciliation", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date("2026-03-01T10:00:00.000Z"));

      const { service } = createBillingService();
      await service.publishDriverFeePlan({
        planName: "Status Readback Plan",
        version: "fee-2026-03-status",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });
      await service.generateDriverStatements({ periodMonth: "2026-03" });

      const batch = service.listReimbursementBatches()[0]!;
      await service.approveReimbursementBatch(batch.batchId, {
        statementId: batch.statementId,
      });

      const staged = await service.stageRemittanceProofContent(
        Buffer.from("clean remittance proof bytes"),
        "image/png",
      );
      const uploaded = await service.uploadRemittanceProof(
        {
          batchId: batch.batchId,
          originalFilename: "proof.png",
          contentType: "image/png",
          sizeBytes: 28,
          stagedContentRef: staged.stagedContentRef,
        },
        driverIdentity(batch.driverId),
      );

      const internalProof = (service as any).remittanceProofService.proofs.find(
        (p: any) => p.proofId === uploaded.proofId,
      );
      internalProof.scanState = "clean";
      internalProof.scanCompletedAt = "2026-03-01T10:05:00.000Z";

      await service.markReimbursementPaidWithProof(
        batch.batchId,
        {
          batchId: batch.batchId,
          proofId: uploaded.proofId,
          idempotencyKey: "idem-paid-72h-check",
          paidAt: "2026-03-01T12:00:00.000Z",
        },
        platformFinanceIdentity(),
      );

      const harness = createHarness({ service, batchId: batch.batchId });

      // 1) Before 72 hours (36 hours elapsed)
      vi.setSystemTime(new Date("2026-03-03T00:00:00.000Z"));
      harness.renderQueue();
      await waitFor(() => {
        expect(screen.getByText(batch.batchId)).toBeTruthy();
      });
      const rowBefore72h = within(screen.getByRole("table"))
        .getAllByRole("row")
        .find((r) => r.textContent?.includes(batch.batchId))!;
      expect(within(rowBefore72h).getAllByRole("cell")[3]?.textContent).toBe(
        "已付款",
      );
      cleanup();

      // 2) After 72 hours (96 hours elapsed, and 240 hours elapsed) — same canonical record, no reconciliation evidence
      for (const isoNow of [
        "2026-03-05T12:00:01.000Z",
        "2026-03-11T12:00:00.000Z",
      ]) {
        vi.setSystemTime(new Date(isoNow));

        harness.renderQueue();
        await waitFor(() => {
          expect(screen.getByText(batch.batchId)).toBeTruthy();
        });
        const rowAfter72h = within(screen.getByRole("table"))
          .getAllByRole("row")
          .find((r) => r.textContent?.includes(batch.batchId))!;
        expect(within(rowAfter72h).getAllByRole("cell")[3]?.textContent).toBe(
          "已付款",
        );
        expect(
          within(rowAfter72h).getAllByRole("cell")[3]?.textContent,
        ).not.toBe("已對帳");
        cleanup();

        const detailAfter72h = harness.renderDetail(batch.batchId);
        await waitFor(() => {
          expect(screen.getAllByText(batch.batchId).length).toBeGreaterThan(0);
        });
        expect(getDlValueByLabel(detailAfter72h.container, "狀態")).toBe(
          "已付款",
        );
        cleanup();
      }
    });

    it("preserves draft, pending_approval, approved, exported, explicit authoritative reconciled, empty, and error branches across queue and detail", async () => {
      const statesFixture: Array<{
        batch: ReimbursementBatchRecord & { reconciledAt?: string | null };
        expectedLabel: string;
      }> = [
        {
          batch: {
            batchId: "batch-state-draft",
            driverId: "drv-draft",
            statementId: "stmt-draft",
            periodMonth: "2026-03",
            status: "pending",
            totalAmount: { currency: "TWD", amountMinor: 0 },
            remittanceProofId: null,
            items: [],
            approvedAt: null,
            paidAt: null,
          },
          expectedLabel: "草稿",
        },
        {
          batch: {
            batchId: "batch-state-pending",
            driverId: "drv-pending",
            statementId: "stmt-pending",
            periodMonth: "2026-03",
            status: "pending",
            totalAmount: { currency: "TWD", amountMinor: 5000 },
            remittanceProofId: null,
            items: [
              {
                itemId: "item-p1",
                orderId: "ord-p1",
                amount: { currency: "TWD", amountMinor: 5000 },
                reason: "platform_funded_discount",
              },
            ],
            approvedAt: null,
            paidAt: null,
          },
          expectedLabel: "待核准",
        },
        {
          batch: {
            batchId: "batch-state-approved",
            driverId: "drv-approved",
            statementId: "stmt-approved",
            periodMonth: "2026-03",
            status: "pending",
            totalAmount: { currency: "TWD", amountMinor: 8000 },
            remittanceProofId: null,
            items: [
              {
                itemId: "item-a1",
                orderId: "ord-a1",
                amount: { currency: "TWD", amountMinor: 8000 },
                reason: "platform_funded_discount",
              },
            ],
            approvedAt: "2026-03-12T01:00:00.000Z",
            paidAt: null,
          },
          expectedLabel: "已核准",
        },
        {
          batch: {
            batchId: "batch-state-exported",
            driverId: "drv-exported",
            statementId: "stmt-exported",
            periodMonth: "2026-03",
            status: "pending",
            totalAmount: { currency: "TWD", amountMinor: 9500 },
            remittanceProofId: "proof-attached-01",
            items: [
              {
                itemId: "item-e1",
                orderId: "ord-e1",
                amount: { currency: "TWD", amountMinor: 9500 },
                reason: "platform_funded_discount",
              },
            ],
            approvedAt: "2026-03-12T02:00:00.000Z",
            paidAt: null,
          },
          expectedLabel: "已匯出",
        },
        {
          batch: {
            batchId: "batch-state-reconciled",
            driverId: "drv-reconciled",
            statementId: "stmt-reconciled",
            periodMonth: "2026-03",
            status: "paid",
            totalAmount: { currency: "TWD", amountMinor: 12345 },
            remittanceProofId: "proof-reconciled-01",
            items: [
              {
                itemId: "item-r1",
                orderId: "ord-r1",
                amount: { currency: "TWD", amountMinor: 12345 },
                reason: "platform_funded_discount",
              },
            ],
            approvedAt: "2026-03-12T03:00:00.000Z",
            paidAt: "2026-03-12T04:00:00.000Z",
            reconciledAt: "2026-03-12T05:00:00.000Z",
          },
          expectedLabel: "已對帳",
        },
      ];

      const harness = createHarness({
        batches: statesFixture.map((entry) => entry.batch),
      });
      harness.renderQueue();

      await waitFor(() => {
        expect(screen.getByText("batch-state-draft")).toBeTruthy();
      });

      const queueRows = within(screen.getByRole("table")).getAllByRole("row");
      for (const { batch, expectedLabel } of statesFixture) {
        const row = queueRows.find((r) =>
          r.textContent?.includes(batch.batchId),
        )!;
        expect(within(row).getAllByRole("cell")[3]?.textContent).toBe(
          expectedLabel,
        );
      }
      cleanup();

      for (const { batch, expectedLabel } of statesFixture) {
        const detailView = harness.renderDetail(batch.batchId);
        await waitFor(() => {
          expect(screen.getAllByText(batch.batchId).length).toBeGreaterThan(0);
        });
        expect(getDlValueByLabel(detailView.container, "狀態")).toBe(
          expectedLabel,
        );
        cleanup();
      }

      // Empty queue branch
      const emptyHarness = createHarness({ batches: [] });
      emptyHarness.renderQueue();
      await waitFor(() => {
        expect(screen.getByText("目前沒有符合此狀態的代墊批次。")).toBeTruthy();
      });
      cleanup();

      // Queue and detail error/unavailable branches
      const errorHarness = createHarness({ batches: [], failQueueLoad: true });
      errorHarness.renderQueue();
      await waitFor(() => {
        expect(screen.getByText("無法載入代墊批次")).toBeTruthy();
      });
      cleanup();

      errorHarness.renderDetail("missing-batch-999");
      await waitFor(() => {
        expect(screen.getByText("找不到批次")).toBeTruthy();
      });
    });
  });

  describe("3. reimbursement_original-proof-role-and-error-regressions", () => {
    it("preserves proof-gated payment, scan fail-closed, driver ownership boundary, UI mark-paid gate, and route RBAC denials", async () => {
      const { service } = createBillingService();

      await service.publishDriverFeePlan({
        planName: "Proof Gate Regression Plan",
        version: "fee-2026-03-proof",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });
      await service.generateDriverStatements({ periodMonth: "2026-03" });

      const batch = service.listReimbursementBatches()[0]!;

      // 1. Mismatched statementId on approve is rejected
      await expect(
        service.approveReimbursementBatch(batch.batchId, {
          statementId: "wrong-statement-id",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      // 2. Unapproved batch payment is rejected
      await expect(
        service.markReimbursementPaid(
          batch.batchId,
          { remittanceProofId: "proof-unapproved" },
          undefined,
          "idem-unapproved",
        ),
      ).rejects.toMatchObject({
        code: "REMITTANCE_PROOF_BATCH_NOT_APPROVED",
      });

      await service.approveReimbursementBatch(batch.batchId, {
        statementId: batch.statementId,
      });

      // 3. Foreign driver proof upload is rejected with 403
      const staged = await service.stageRemittanceProofContent(
        Buffer.from("remittance slip binary content"),
        "image/png",
      );
      await expect(
        service.uploadRemittanceProof(
          {
            batchId: batch.batchId,
            originalFilename: "slip.png",
            contentType: "image/png",
            sizeBytes: 30,
            stagedContentRef: staged.stagedContentRef,
          },
          driverIdentity(`foreign-${batch.driverId}`),
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: "REMITTANCE_PROOF_BATCH_OWNERSHIP_VIOLATION",
      });

      // 4. Legitimate driver upload starts in pending_scan and blocks payment (409) and UI button
      const uploaded = await service.uploadRemittanceProof(
        {
          batchId: batch.batchId,
          originalFilename: "slip.png",
          contentType: "image/png",
          sizeBytes: 30,
          stagedContentRef: staged.stagedContentRef,
        },
        driverIdentity(batch.driverId),
      );
      expect(uploaded.scanState).toBe("pending_scan");

      await expect(
        service.markReimbursementPaidWithProof(
          batch.batchId,
          {
            batchId: batch.batchId,
            proofId: uploaded.proofId,
            idempotencyKey: "idem-pending-scan",
          },
          platformFinanceIdentity(),
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: "REMITTANCE_PROOF_NOT_CLEAN",
      });

      const harness = createHarness({ service, batchId: batch.batchId });
      harness.renderDetail(batch.batchId);
      await waitFor(() => {
        expect(screen.getByText("slip.png")).toBeTruthy();
      });
      const markPaidBtnBeforeClean = screen.getByRole("button", {
        name: "標記已付款",
      }) as HTMLButtonElement;
      expect(markPaidBtnBeforeClean.disabled).toBe(true);
      cleanup();

      // 5. After scan is clean, UI button enables and completes proof-backed payment
      const internalProof = (service as any).remittanceProofService.proofs.find(
        (p: any) => p.proofId === uploaded.proofId,
      );
      internalProof.scanState = "clean";
      internalProof.scanCompletedAt = "2026-03-20T10:00:00.000Z";

      harness.renderDetail(batch.batchId);
      await waitFor(() => {
        const btn = screen.getByRole("button", {
          name: "標記已付款",
        }) as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
      });
      fireEvent.click(screen.getByRole("button", { name: "標記已付款" }));

      await waitFor(() => {
        expect(service.getReimbursementBatch(batch.batchId).status).toBe(
          "paid",
        );
      });

      // 6. Route RBAC guard preserves driver-only upload and denies driver on finance scan/pay
      vi.stubEnv("APP_ENV", "staging");
      vi.stubEnv("DRTS_ENV", "staging");
      vi.stubEnv("JWT_SECRET", "offline-proof-route-auth-secret");
      vi.stubEnv("JWT_ISSUER", "drts");
      vi.stubEnv("JWT_AUDIENCE", "drts-api");
      const jwt = new JwtAuthService();
      vi.spyOn(jwt, "verifyAccessToken").mockResolvedValue({} as never);

      const authorizeRoute = (
        url: string,
        handler: (...args: never[]) => unknown,
        identity: BootstrapRequestIdentity,
        method = "POST",
      ) => {
        vi.spyOn(jwt, "toRequestIdentity").mockReturnValue(identity);
        const context = {
          switchToHttp: () => ({
            getRequest: () => ({
              headers: { authorization: "Bearer test-token" },
              method,
              url,
            }),
          }),
          getHandler: () => handler,
          getClass: () => BillingSettlementController,
        } as unknown as Parameters<BootstrapAuthGuard["canActivate"]>[0];
        return new BootstrapAuthGuard(new Reflector(), jwt).canActivate(
          context,
        );
      };

      const controller = BillingSettlementController.prototype;
      const validDriver = driverIdentity(batch.driverId);

      await expect(
        authorizeRoute(
          "/api/reimbursements/proofs",
          controller.uploadRemittanceProof,
          validDriver,
        ),
      ).resolves.toBe(true);

      await expect(
        authorizeRoute(
          "/api/reimbursements/proofs",
          controller.uploadRemittanceProof,
          { ...validDriver, scopes: ["driver:read"] },
        ),
      ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });

      await expect(
        authorizeRoute(
          "/api/reimbursements/proofs/unit-proof/scan",
          controller.scanRemittanceProof,
          validDriver,
        ),
      ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
    });
  });
});
