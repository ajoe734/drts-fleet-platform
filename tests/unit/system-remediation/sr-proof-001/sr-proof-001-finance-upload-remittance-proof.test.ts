/**
 * REMITTANCE-FINANCE-PROOF-UPLOAD-FLOW-20261015
 *
 * Before this task, a verified system/platform/ops caller with
 * billing:write (the "出納" / cashier half of capabilities.json C081's
 * cashier/reviewer role) had no route to stage or upload a remittance
 * proof at all -- only the driver-only `POST reimbursements/proofs` and
 * `POST reimbursements/proofs/staged-content` routes existed, both locked
 * to `@RequireRealms("driver")` + `@RequireScopes("driver:write")`. See
 * `.local/goal-continuation-20261015T0940-internal-frontier-root/REMITTANCE-PROOF-ACTOR-AUTHORITY-20261015.md`
 * §1-5 for why widening those routes would silently broaden an existing
 * guard, and why two new parallel finance-only routes are the fix instead.
 *
 * This file exercises the two new routes end to end: real-guard RBAC
 * (admits finance, rejects driver/tenant/partner and
 * billing:read-only; there is no distinct "passenger" AuthRealm in this
 * codebase to exercise), canonical batch/uploader attribution, a distinct
 * finance idempotency namespace, the unchanged scan lifecycle, and the
 * unchanged pay-with-proof gate. The driver-only route's own 19 existing
 * regressions (`sr-proof-001-remittance-proof.test.ts`) and its RBAC
 * (`proof-route-auth.test.ts`) are untouched by this file.
 */
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { RemittanceProofService } from "../../../../apps/api/src/modules/billing-settlement/remittance-proof.service";
import { UnprovisionedRemittanceProofScannerAdapter } from "../../../../apps/api/src/modules/billing-settlement/remittance-proof-scanner.adapter";
import type {
  RemittanceProofScanInput,
  RemittanceProofScanOutcome,
  RemittanceProofScannerAvailability,
  RemittanceProofScannerPort,
} from "../../../../apps/api/src/modules/billing-settlement/remittance-proof-scanner.port";
import { InMemoryRemittanceProofStorageAdapter } from "../../../../apps/api/src/modules/billing-settlement/remittance-proof-storage.adapter";

class ScriptedRemittanceProofScanner implements RemittanceProofScannerPort {
  readonly providerName = "scripted-finance-upload-test-scanner";
  private readonly verdicts = new Map<string, RemittanceProofScanOutcome>();

  setVerdict(proofId: string, outcome: RemittanceProofScanOutcome) {
    this.verdicts.set(proofId, outcome);
  }

  availability(): RemittanceProofScannerAvailability {
    return { state: "available" };
  }

  async scan(
    input: RemittanceProofScanInput,
  ): Promise<RemittanceProofScanOutcome> {
    return (
      this.verdicts.get(input.proofId) ?? {
        scanState: "clean",
        rejectionReason: null,
        scanCompletedAt: new Date().toISOString(),
      }
    );
  }
}

function financeIdentity(actorId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "system",
    actorId,
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: [],
    scopes: ["billing:read", "billing:write"],
    requestId: null,
  };
}

function driverIdentity(actorId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: [],
    scopes: ["driver:write"],
    requestId: null,
  };
}

function createService() {
  const auditService = new AuditNotificationService();
  const scanner = new ScriptedRemittanceProofScanner();
  const remittanceProofService = new RemittanceProofService(
    undefined,
    new InMemoryRemittanceProofStorageAdapter(),
    scanner,
  );
  const billingSettlementService = new BillingSettlementService(
    auditService,
    undefined,
    undefined,
    undefined,
    undefined,
    remittanceProofService,
  );
  return { auditService, billingSettlementService, scanner };
}

async function createApprovedBatch(
  billingSettlementService: BillingSettlementService,
) {
  await billingSettlementService.publishDriverFeePlan({
    planName: "Finance Upload Unit Fee Plan",
    version: "finance-upload-fee-v1",
    serviceFeeBps: 1500,
    reimbursementMode: "platform_funded",
  });
  const result = await billingSettlementService.generateDriverStatements({
    periodMonth: "2026-03",
  });
  const batchId = result.reimbursementBatchIds[0]!;
  const pendingBatch = billingSettlementService.getReimbursementBatch(batchId);
  await billingSettlementService.approveReimbursementBatch(
    batchId,
    { statementId: pendingBatch.statementId },
    "sr-proof-001-finance-upload-approve",
  );
  return billingSettlementService.getReimbursementBatch(batchId);
}

// ── RBAC through the real auth guard ──

const apiRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = apiRequire("@nestjs/core") as {
  Reflector: new () => ConstructorParameters<typeof BootstrapAuthGuard>[0];
};

const financeGuardIdentity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "system",
  actorId: "unit-finance",
  realm: "platform",
  tenantId: null,
  roles: [],
  roleFamilies: ["platform"],
  scopes: ["billing:read", "billing:write"],
  requestId: null,
};

afterEach(() => vi.unstubAllEnvs());

function authorize(
  url: string,
  handler: (...args: never[]) => unknown,
  identity: BootstrapRequestIdentity = financeGuardIdentity,
  method = "POST",
) {
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("DRTS_ENV", "staging");
  vi.stubEnv("JWT_SECRET", "offline-finance-proof-route-auth-secret");
  vi.stubEnv("JWT_ISSUER", "drts");
  vi.stubEnv("JWT_AUDIENCE", "drts-api");
  const jwt = new JwtAuthService();
  // Mock only credential verification/identity at the external boundary;
  // route policy, actual handler metadata, reflector and guard remain real.
  vi.spyOn(jwt, "verifyAccessToken").mockResolvedValue({} as never);
  vi.spyOn(jwt, "toRequestIdentity").mockReturnValue(identity);
  const request = {
    headers: { authorization: "Bearer offline-unit-token" },
    method,
    url,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => BillingSettlementController,
  } as unknown as Parameters<BootstrapAuthGuard["canActivate"]>[0];
  return new BootstrapAuthGuard(new Reflector(), jwt).canActivate(context);
}

const controllerProto = BillingSettlementController.prototype;
const financeCreationRoutes = [
  [
    "/api/reimbursements/proofs/finance-staged-content",
    controllerProto.financeStageRemittanceProofContent,
  ],
  [
    "/api/reimbursements/proofs/finance-upload",
    controllerProto.financeUploadRemittanceProof,
  ],
] as const;
const driverCreationRoutes = [
  [
    "/api/reimbursements/proofs/staged-content",
    controllerProto.stageRemittanceProofContent,
  ],
  ["/api/reimbursements/proofs", controllerProto.uploadRemittanceProof],
] as const;

describe("finance remittance-proof upload RBAC through the real auth guard", () => {
  it.each(financeCreationRoutes)(
    "admits a verified system/platform/ops caller with billing:write at %s",
    async (url, handler) => {
      await expect(authorize(url, handler)).resolves.toBe(true);
      await expect(
        authorize(url, handler, { ...financeGuardIdentity, realm: "system" }),
      ).resolves.toBe(true);
      await expect(
        authorize(url, handler, { ...financeGuardIdentity, realm: "ops" }),
      ).resolves.toBe(true);
    },
  );

  it.each(financeCreationRoutes)(
    "rejects billing:read-only (missing billing:write) at %s",
    async (url, handler) => {
      await expect(
        authorize(url, handler, {
          ...financeGuardIdentity,
          scopes: ["billing:read"],
        }),
      ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
    },
  );

  it.each(financeCreationRoutes)(
    "rejects the driver realm at %s, even if it somehow carried billing:write",
    async (url, handler) => {
      await expect(
        authorize(url, handler, {
          ...financeGuardIdentity,
          realm: "driver",
          scopes: ["driver:write", "billing:write"],
        }),
      ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
    },
  );

  it.each(financeCreationRoutes)(
    "rejects tenant/partner realms at %s",
    async (url, handler) => {
      for (const realm of ["tenant", "partner"] as const) {
        await expect(
          authorize(url, handler, { ...financeGuardIdentity, realm }),
        ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
      }
    },
  );

  it("does not widen the existing driver-only staged-content/upload routes to a finance caller", async () => {
    for (const [url, handler] of driverCreationRoutes) {
      await expect(
        authorize(url, handler, financeGuardIdentity),
      ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
    }
  });

  it("does not let a driver caller reach the new finance-only routes even with driver:write", async () => {
    for (const [url, handler] of financeCreationRoutes) {
      await expect(
        authorize(url, handler, {
          authMode: "jwt_bearer",
          actorType: "driver_user",
          actorId: "unit-driver",
          realm: "driver",
          tenantId: null,
          roles: [],
          roleFamilies: ["driver"],
          scopes: ["driver:read", "driver:write"],
          requestId: null,
        }),
      ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
    }
  });
});

// ── Functional behavior: canonical attribution, idempotency, scan/pay gates ──

describe("SR-PROOF-001 finance upload: canonical batch and uploader attribution", () => {
  it("stages and uploads a proof as a finance caller, taking driverId from the batch and uploadedByActorId from the finance caller", async () => {
    const { billingSettlementService } = createService();
    const batch = await createApprovedBatch(billingSettlementService);
    const controller = new BillingSettlementController(
      billingSettlementService,
    );
    const fileBytes = Buffer.from("finance uploaded bank remittance bytes");

    const staged = await controller.financeStageRemittanceProofContent(
      {
        contentBase64: fileBytes.toString("base64"),
        contentType: "application/pdf",
      },
      "finance-stage-key-attribution",
      "req-finance-stage-attribution",
    );
    const uploaded = await controller.financeUploadRemittanceProof(
      {
        batchId: batch.batchId,
        originalFilename: "finance-remit.pdf",
        contentType: "application/pdf",
        sizeBytes: 999999, // deliberately wrong -- server must not trust this
        stagedContentRef: staged.data.stagedContentRef,
      },
      financeIdentity("finance-caller-attribution"),
      "finance-upload-key-attribution",
      "req-finance-upload-attribution",
    );

    expect(uploaded.data.batchId).toBe(batch.batchId);
    expect(uploaded.data.driverId).toBe(batch.driverId);
    expect(uploaded.data.uploadedByActorId).toBe("finance-caller-attribution");
    expect(uploaded.data.uploadedByActorId).not.toBe(batch.driverId);
    expect(uploaded.data.content.sizeBytes).toBe(fileBytes.length);
    expect(uploaded.data.proofId).not.toContain(String(999999));
  });

  it("allows a finance caller to upload against any existing batch, not only one it 'owns' (finance is not a batch owner)", async () => {
    const { billingSettlementService } = createService();
    const batchA = await createApprovedBatch(billingSettlementService);
    const controller = new BillingSettlementController(
      billingSettlementService,
    );
    const staged = await controller.financeStageRemittanceProofContent(
      {
        contentBase64: Buffer.from("not the driver, still allowed").toString(
          "base64",
        ),
        contentType: "application/pdf",
      },
      "finance-stage-key-any-batch",
    );

    const uploaded = await controller.financeUploadRemittanceProof(
      {
        batchId: batchA.batchId,
        originalFilename: "finance.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        stagedContentRef: staged.data.stagedContentRef,
      },
      financeIdentity("finance-caller-not-the-driver"),
      "finance-upload-key-any-batch",
    );

    expect(uploaded.data.driverId).toBe(batchA.driverId);
    expect(uploaded.data.uploadedByActorId).toBe(
      "finance-caller-not-the-driver",
    );
  });

  it("404s a finance upload against an unknown batchId, same as the driver path", async () => {
    const { billingSettlementService } = createService();
    const controller = new BillingSettlementController(
      billingSettlementService,
    );
    const staged = await controller.financeStageRemittanceProofContent(
      {
        contentBase64: Buffer.from("x").toString("base64"),
        contentType: "application/pdf",
      },
      "finance-stage-key-404",
    );

    await expect(
      controller.financeUploadRemittanceProof(
        {
          batchId: "finance-batch-does-not-exist",
          originalFilename: "f.pdf",
          contentType: "application/pdf",
          sizeBytes: 1,
          stagedContentRef: staged.data.stagedContentRef,
        },
        financeIdentity("finance-caller-404"),
        "finance-upload-key-404",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("SR-PROOF-001 finance upload: idempotency scope is distinct from the driver path", () => {
  it("does not collide when the driver and a finance caller reuse the same raw idempotency key for the same batch", async () => {
    const { billingSettlementService } = createService();
    const batch = await createApprovedBatch(billingSettlementService);
    const controller = new BillingSettlementController(
      billingSettlementService,
    );
    const sharedRawKey = "shared-raw-idempotency-key-across-callers";

    const driverStaged = await controller.stageRemittanceProofContent(
      {
        contentBase64: Buffer.from("driver bytes").toString("base64"),
        contentType: "application/pdf",
      },
      "driver-stage-key-shared",
    );
    const driverUploaded = await controller.uploadRemittanceProof(
      {
        batchId: batch.batchId,
        originalFilename: "driver.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        stagedContentRef: driverStaged.data.stagedContentRef,
      },
      driverIdentity(batch.driverId),
      sharedRawKey,
    );

    const financeStaged = await controller.financeStageRemittanceProofContent(
      {
        contentBase64: Buffer.from("finance bytes").toString("base64"),
        contentType: "application/pdf",
      },
      "finance-stage-key-shared",
    );
    const financeUploaded = await controller.financeUploadRemittanceProof(
      {
        batchId: batch.batchId,
        originalFilename: "finance.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        stagedContentRef: financeStaged.data.stagedContentRef,
      },
      financeIdentity("finance-caller-shared"),
      sharedRawKey,
    );

    // If the two routes shared one idempotency scope, the second call with
    // the same raw key but a different payload would have thrown
    // IDEMPOTENCY_KEY_REUSED instead of succeeding independently.
    expect(driverUploaded.data.proofId).not.toBe(financeUploaded.data.proofId);
    expect(driverUploaded.data.uploadedByActorId).toBe(batch.driverId);
    expect(financeUploaded.data.uploadedByActorId).toBe(
      "finance-caller-shared",
    );
  });

  it("replays the identical finance upload result when the same idempotencyKey and payload are resent", async () => {
    const { billingSettlementService } = createService();
    const batch = await createApprovedBatch(billingSettlementService);
    const controller = new BillingSettlementController(
      billingSettlementService,
    );
    const staged = await controller.financeStageRemittanceProofContent(
      {
        contentBase64: Buffer.from("replay bytes").toString("base64"),
        contentType: "application/pdf",
      },
      "finance-stage-key-replay",
    );
    const command = {
      batchId: batch.batchId,
      originalFilename: "replay.pdf",
      contentType: "application/pdf",
      sizeBytes: 12,
      stagedContentRef: staged.data.stagedContentRef,
    };

    const first = await controller.financeUploadRemittanceProof(
      command,
      financeIdentity("finance-caller-replay"),
      "finance-upload-key-replay",
    );
    const second = await controller.financeUploadRemittanceProof(
      command,
      financeIdentity("finance-caller-replay"),
      "finance-upload-key-replay",
    );

    expect(second.data.proofId).toBe(first.data.proofId);
    expect(second.data.createdAt).toBe(first.data.createdAt);
  });
});

describe("SR-PROOF-001 finance upload: unchanged scan lifecycle and pay-with-proof gate", () => {
  it("pays a batch with a finance-uploaded, scanner-confirmed clean proof, through the unchanged pay-with-proof gate", async () => {
    const { billingSettlementService } = createService();
    const batch = await createApprovedBatch(billingSettlementService);
    const controller = new BillingSettlementController(
      billingSettlementService,
    );
    const staged = await controller.financeStageRemittanceProofContent(
      {
        contentBase64: Buffer.from("clean finance bytes").toString("base64"),
        contentType: "application/pdf",
      },
      "finance-stage-key-pay",
    );
    const uploaded = await controller.financeUploadRemittanceProof(
      {
        batchId: batch.batchId,
        originalFilename: "finance-pay.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        stagedContentRef: staged.data.stagedContentRef,
      },
      financeIdentity("finance-caller-pay"),
      "finance-upload-key-pay",
    );
    // The controller's finance-upload route synchronously best-effort scans,
    // same as the driver path -- the scripted scanner's default verdict is
    // "clean".
    expect(uploaded.data.scanState).toBe("clean");

    const receipt =
      await billingSettlementService.markReimbursementPaidWithProof(
        batch.batchId,
        {
          batchId: batch.batchId,
          proofId: uploaded.data.proofId,
          idempotencyKey: "finance-pay-key",
        },
        null,
        "req-finance-pay",
      );

    expect(receipt.proofId).toBe(uploaded.data.proofId);
    expect(receipt.driverId).toBe(batch.driverId);
    const paidBatch = billingSettlementService.getReimbursementBatch(
      batch.batchId,
    );
    expect(paidBatch.status).toBe("paid");
  });

  it("rejects a finance-uploaded proof used against a different batch (cross-batch gate unchanged)", async () => {
    const { billingSettlementService, scanner } = createService();
    const batchA = await createApprovedBatch(billingSettlementService);
    const controller = new BillingSettlementController(
      billingSettlementService,
    );
    const staged = await controller.financeStageRemittanceProofContent(
      {
        contentBase64: Buffer.from("cross batch finance bytes").toString(
          "base64",
        ),
        contentType: "application/pdf",
      },
      "finance-stage-key-cross-batch",
    );
    const uploaded = await controller.financeUploadRemittanceProof(
      {
        batchId: batchA.batchId,
        originalFilename: "finance-cross.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        stagedContentRef: staged.data.stagedContentRef,
      },
      financeIdentity("finance-caller-cross-batch"),
      "finance-upload-key-cross-batch",
    );
    expect(uploaded.data.scanState).toBe("clean");
    void scanner;

    await expect(
      billingSettlementService.remittanceProofServiceForTest.markPaidWithProof({
        batchId: "some-other-real-looking-batch-id",
        proofId: uploaded.data.proofId,
        idempotencyKey: "finance-cross-batch-key",
        driverId: batchA.driverId,
        amount: batchA.totalAmount,
        paidAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_BATCH_MISMATCH" });
  });

  it("keeps a finance upload honestly pending_scan when the scanner is unavailable, and surfaces an explicit authorized retry failure rather than fabricating a verdict", async () => {
    const remittanceProofService = new RemittanceProofService(
      undefined,
      new InMemoryRemittanceProofStorageAdapter(),
      new UnprovisionedRemittanceProofScannerAdapter(),
    );
    const billingSettlementService = new BillingSettlementService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      remittanceProofService,
    );
    const batch = await createApprovedBatch(billingSettlementService);
    const controller = new BillingSettlementController(
      billingSettlementService,
    );

    const staged = await controller.financeStageRemittanceProofContent(
      {
        contentBase64: Buffer.from("unavailable scanner bytes").toString(
          "base64",
        ),
        contentType: "application/pdf",
      },
      "finance-stage-key-unavailable",
    );
    const uploaded = await controller.financeUploadRemittanceProof(
      {
        batchId: batch.batchId,
        originalFilename: "finance-unavailable.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        stagedContentRef: staged.data.stagedContentRef,
      },
      financeIdentity("finance-caller-unavailable"),
      "finance-upload-key-unavailable",
    );
    expect(uploaded.data.scanState).toBe("pending_scan");

    await expect(
      controller.scanRemittanceProof(
        uploaded.data.proofId,
        financeIdentity("finance-caller-unavailable"),
      ),
    ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_SCANNER_UNAVAILABLE" });
  });
});
