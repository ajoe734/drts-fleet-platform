import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { createControlledDownloadMetadata } from "../../apps/api/src/common/controlled-download";
import {
  DocumentArtifactRebuildRegistry,
  InMemoryDocumentArtifactStore,
} from "../../apps/api/src/common/document-artifacts";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { BillingSettlementRepository } from "../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ControlledDownloadController } from "../../apps/api/src/modules/controlled-download/controlled-download.controller";

// Structural stand-in for `@nestjs/common`'s `StreamableFile`; see the same
// caveat in sr-artifact-001/controlled-download-artifact-bytes.test.ts.
type StreamableFileLike = {
  getStream(): NodeJS.ReadableStream;
  getHeaders(): { type?: string };
};

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

function resolve(
  controller: ControlledDownloadController,
  kind: string,
  subjectId: string,
  p: ReturnType<typeof paramsOf>,
) {
  return controller.resolve(
    kind,
    subjectId,
    p.signedAt,
    p.expiresAt,
    p.keyId,
    p.manifestHash,
    p.sig,
    p.sigV,
  );
}

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function codeOf(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return (error as ApiRequestError).code;
  }
  throw new Error("expected the call to throw");
}

/**
 * Wires a `BillingSettlementService` + `ControlledDownloadController` pair
 * exactly the way `ControlledDownloadModule` being `@Global()` wires the
 * real app: one process-local `DocumentArtifactStore` and one
 * `DocumentArtifactRebuildRegistry` shared between them, with the service
 * registering its own tenant-invoice/report rebuilders against that
 * registry in its constructor. A second call to this function with a fresh
 * store/registry pair -- fed the same repository-persisted state -- models
 * either a sibling Cloud Run instance or this same instance after a
 * restart: same durably persisted invoice/statement metadata, zero bytes
 * ever rendered locally.
 */
function buildInstance(repository?: BillingSettlementRepository) {
  const store = new InMemoryDocumentArtifactStore();
  const registry = new DocumentArtifactRebuildRegistry();
  const service = new BillingSettlementService(
    new AuditNotificationService(),
    repository,
    undefined,
    undefined,
    store,
    undefined,
    registry,
  );
  const controller = new ControlledDownloadController(store, registry);
  return { service, store, registry, controller };
}

describe("document artifacts survive a restart / a sibling Cloud Run instance (AUDIT-ARTIFACT-DURABILITY-20261002)", () => {
  it("serves a tenant invoice's exact bytes from an instance that never rendered them, deriving them from durably persisted invoice data alone", async () => {
    const podA = buildInstance();
    const profile = await podA.service.updateTenantBillingProfile(
      "tenant-demo-001",
      {
        invoiceTitle: "Demo Tenant Co., Ltd.",
        taxId: "24567891",
        address: "Taichung Harbor",
        contactName: "Billing Owner",
        email: "ap@demo-tenant.example.com",
      },
      "billing-profile-request",
    );
    const invoice = await podA.service.generateTenantInvoice(
      "tenant-demo-001",
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
      "invoice-generate-request",
    );

    // Pod A can serve it immediately: this is the existing, unchanged path.
    const paramsA = paramsOf(invoice.artifactUrl);
    const fileA = resolve(
      podA.controller,
      "tenant-invoice",
      invoice.invoiceId,
      paramsA,
    ) as unknown as StreamableFileLike;
    const bytesA = await drain(fileA.getStream());
    expect(sha256(bytesA)).toBe(invoice.artifactDownloadMetadata.manifestHash);

    // Pod B: a fresh process whose repository reload gives it the SAME
    // durably persisted invoice and billing profile, but whose own
    // DocumentArtifactStore has never rendered this PDF.
    const repository = {
      isEnabled: vi.fn(() => true),
      loadState: vi.fn(async () => ({
        tenantBillingProfiles: [profile],
        tenantInvoices: [invoice],
        driverFeePlans: [],
        driverStatements: [],
        reimbursementBatches: [],
        reconciliationIssues: [],
        fulfillmentSegments: [],
        sandboxBillingTreatments: [],
      })),
      persistChanges: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    } as unknown as BillingSettlementRepository;
    const podB = buildInstance(repository);
    await podB.service.onModuleInit();

    expect(podB.store.get("tenant-invoice", invoice.invoiceId)).toBeNull();

    const fileB = resolve(
      podB.controller,
      "tenant-invoice",
      invoice.invoiceId,
      paramsA,
    ) as unknown as StreamableFileLike;
    const bytesB = await drain(fileB.getStream());

    expect(bytesB.equals(bytesA)).toBe(true);
    expect(sha256(bytesB)).toBe(invoice.artifactDownloadMetadata.manifestHash);
    // The rebuild also leaves pod B able to answer a second request for the
    // same artifact without rebuilding again.
    expect(podB.store.get("tenant-invoice", invoice.invoiceId)).not.toBeNull();
  });

  it("serves a driver statement report's exact bytes from an instance that never rendered them", async () => {
    const podA = buildInstance();
    podA.service.publishDriverFeePlan({
      planName: "default-driver-plan",
      version: "v1",
      serviceFeeBps: 1000,
      reimbursementMode: "platform_funded",
    });
    const generated = await podA.service.generateDriverStatements({
      periodMonth: "2026-03",
    });
    const statement = generated.items[0]!;
    expect(statement.artifactUrl).toBeTruthy();

    const repository = {
      isEnabled: vi.fn(() => true),
      loadState: vi.fn(async () => ({
        tenantBillingProfiles: [],
        tenantInvoices: [],
        driverFeePlans: [],
        driverStatements: [statement],
        reimbursementBatches: [],
        reconciliationIssues: [],
        fulfillmentSegments: [],
        sandboxBillingTreatments: [],
      })),
      persistChanges: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    } as unknown as BillingSettlementRepository;
    const podB = buildInstance(repository);
    await podB.service.onModuleInit();

    expect(podB.store.get("report", statement.statementId)).toBeNull();

    const params = paramsOf(statement.artifactUrl!);
    const file = resolve(
      podB.controller,
      "report",
      statement.statementId,
      params,
    ) as unknown as StreamableFileLike;
    const bytes = await drain(file.getStream());

    expect(sha256(bytes)).toBe(
      statement.artifactDownloadMetadata!.manifestHash,
    );
  });

  it("still denies a stale link after a rebuild: a hash that was honestly signed but no longer matches the real file does not get waved through because a rebuild happened to run", async () => {
    const podA = buildInstance();
    const profile = await podA.service.updateTenantBillingProfile(
      "tenant-demo-001",
      {
        invoiceTitle: "Demo Tenant Co., Ltd.",
        taxId: "24567891",
        address: "Taichung Harbor",
        contactName: "Billing Owner",
        email: "ap@demo-tenant.example.com",
      },
      "req",
    );
    const invoice = await podA.service.generateTenantInvoice(
      "tenant-demo-001",
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
      "req",
    );

    // A link whose signature genuinely covers this (kind, subjectId) pair,
    // but over a manifest hash that does not -- and will never -- match
    // this invoice's real, deterministically-rendered content. Modelling a
    // stale link (the invoice was regenerated after this link was signed)
    // or a tampered one, not a malformed request.
    const staleLink = createControlledDownloadMetadata({
      kind: "tenant-invoice",
      subjectId: invoice.invoiceId,
      manifestHash: "0".repeat(64),
    }).downloadUrl;
    const staleParams = paramsOf(staleLink);

    // Pod B's own store is empty (modelling a sibling instance), so
    // resolution must go through the rebuild path before this check can
    // even be reached -- the rebuild must not short-circuit it.
    const repository = {
      isEnabled: vi.fn(() => true),
      loadState: vi.fn(async () => ({
        tenantBillingProfiles: [profile],
        tenantInvoices: [invoice],
        driverFeePlans: [],
        driverStatements: [],
        reimbursementBatches: [],
        reconciliationIssues: [],
        fulfillmentSegments: [],
        sandboxBillingTreatments: [],
      })),
      persistChanges: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    } as unknown as BillingSettlementRepository;
    const podB = buildInstance(repository);
    await podB.service.onModuleInit();

    expect(
      codeOf(() =>
        resolve(
          podB.controller,
          "tenant-invoice",
          invoice.invoiceId,
          staleParams,
        ),
      ),
    ).toBe("CONTROLLED_DOWNLOAD_CONTENT_MISMATCH");
    // The rebuild did run (and correctly produced the CURRENT real bytes);
    // it just never gets to serve them because they don't match this
    // particular stale link.
    expect(podB.store.get("tenant-invoice", invoice.invoiceId)).not.toBeNull();
  });

  it("still fails explicitly for a kind with no registered rebuilder, even though the registry exists", () => {
    const store = new InMemoryDocumentArtifactStore();
    const registry = new DocumentArtifactRebuildRegistry();
    // Only ever registered for "tenant-invoice" / "report" by
    // BillingSettlementService; nothing registers "placard" here.
    const controller = new ControlledDownloadController(store, registry);

    const params = paramsOf(
      createControlledDownloadMetadata({
        kind: "placard",
        subjectId: "placard-never-rendered",
        manifestHash: "0".repeat(64),
      }).downloadUrl,
    );

    expect(
      codeOf(() =>
        resolve(controller, "placard", "placard-never-rendered", params),
      ),
    ).toBe("ARTIFACT_NOT_MATERIALISED");
  });

  it("still fails explicitly for a genuinely unknown subjectId, even for a kind that does have a registered rebuilder", async () => {
    const repository = {
      isEnabled: vi.fn(() => true),
      loadState: vi.fn(async () => ({
        tenantBillingProfiles: [],
        tenantInvoices: [],
        driverFeePlans: [],
        driverStatements: [],
        reimbursementBatches: [],
        reconciliationIssues: [],
        fulfillmentSegments: [],
        sandboxBillingTreatments: [],
      })),
      persistChanges: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    } as unknown as BillingSettlementRepository;
    const podB = buildInstance(repository);
    await podB.service.onModuleInit();

    const params = paramsOf(
      createControlledDownloadMetadata({
        kind: "tenant-invoice",
        subjectId: "invoice-that-never-existed",
        manifestHash: "0".repeat(64),
      }).downloadUrl,
    );

    expect(
      codeOf(() =>
        resolve(
          podB.controller,
          "tenant-invoice",
          "invoice-that-never-existed",
          params,
        ),
      ),
    ).toBe("ARTIFACT_NOT_MATERIALISED");
  });
});
