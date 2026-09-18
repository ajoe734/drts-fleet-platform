import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { InMemoryDocumentArtifactStore } from "../../../../apps/api/src/common/document-artifacts";
import { ControlledDownloadController } from "../../../../apps/api/src/modules/controlled-download/controlled-download.controller";

type StreamableFileLike = {
  getStream(): NodeJS.ReadableStream;
  getHeaders(): { type?: string };
};

function createService(store: InMemoryDocumentArtifactStore) {
  const auditService = new AuditNotificationService();
  const billingSettlementService = new BillingSettlementService(
    auditService,
    undefined,
    undefined,
    undefined,
    store,
  );
  return { auditService, billingSettlementService };
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

const PERIOD = {
  periodStart: "2026-03-01T00:00:00Z",
  periodEnd: "2026-03-31T23:59:59Z",
};

describe("SR-INVOICE-001: tenant invoice download lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never exposes another tenant's invoice through getTenantInvoice", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { billingSettlementService } = createService(store);

    const invoice = await billingSettlementService.generateTenantInvoice(
      "tenant-demo-001",
      { tenantId: "tenant-demo-001", ...PERIOD },
    );

    expect(
      codeOf(() =>
        billingSettlementService.getTenantInvoice(
          "tenant-intruder",
          invoice.invoiceId,
        ),
      ),
    ).toBe("NOT_FOUND");
  });

  it("produces no invoice and no download surface for a period with no eligible trips", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { billingSettlementService } = createService(store);

    await expect(
      billingSettlementService.generateTenantInvoice("tenant-demo-001", {
        tenantId: "tenant-demo-001",
        periodStart: "2020-01-01T00:00:00Z",
        periodEnd: "2020-01-31T23:59:59Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(
      billingSettlementService.listTenantInvoices("tenant-demo-001"),
    ).toHaveLength(0);
  });

  it("does not create a duplicate invoice when the same period is regenerated", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { billingSettlementService } = createService(store);

    const first = await billingSettlementService.generateTenantInvoice(
      "tenant-demo-001",
      { tenantId: "tenant-demo-001", ...PERIOD },
    );
    const second = await billingSettlementService.generateTenantInvoice(
      "tenant-demo-001",
      { tenantId: "tenant-demo-001", ...PERIOD },
    );

    expect(second.invoiceId).toBe(first.invoiceId);
    expect(
      billingSettlementService.listTenantInvoices("tenant-demo-001"),
    ).toHaveLength(1);

    // The rerun's link must still actually resolve real bytes, not just
    // return a cached id.
    const controller = new ControlledDownloadController(store);
    const file = resolve(
      controller,
      "tenant-invoice",
      second.invoiceId,
      paramsOf(second.artifactUrl!),
    ) as StreamableFileLike;
    expect((await drain(file.getStream())).length).toBeGreaterThan(0);
  });

  it("transparently reissues an expired download link on read without changing the invoice's issuance date, lines, or amount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00Z"));

    const store = new InMemoryDocumentArtifactStore();
    const { billingSettlementService } = createService(store);

    const invoice = await billingSettlementService.generateTenantInvoice(
      "tenant-demo-001",
      { tenantId: "tenant-demo-001", ...PERIOD },
    );
    const originalExpiresAt = invoice.artifactDownloadMetadata.expiresAt;
    const originalUrl = invoice.artifactUrl;

    // Past the 15-minute controlled-download TTL.
    vi.setSystemTime(new Date("2026-04-01T00:30:00Z"));

    const reread = billingSettlementService.getTenantInvoice(
      "tenant-demo-001",
      invoice.invoiceId,
    );

    expect(reread.artifactDownloadMetadata.expiresAt).not.toBe(
      originalExpiresAt,
    );
    expect(Date.parse(reread.artifactDownloadMetadata.expiresAt)).toBeGreaterThan(
      Date.now(),
    );
    expect(reread.artifactUrl).not.toBe(originalUrl);
    // What was actually issued does not move just because someone looked at
    // the page later -- only the time-boxed link is allowed to change.
    expect(reread.createdAt).toBe(invoice.createdAt);
    expect(reread.lines).toEqual(invoice.lines);
    expect(reread.amount).toEqual(invoice.amount);

    // The stale link genuinely would have failed.
    const controller = new ControlledDownloadController(store);
    expect(
      codeOf(() =>
        resolve(
          controller,
          "tenant-invoice",
          invoice.invoiceId,
          paramsOf(originalUrl!),
        ),
      ),
    ).toBe("CONTROLLED_DOWNLOAD_EXPIRED");

    // The reissued one resolves the same real bytes.
    const refreshedFile = resolve(
      controller,
      "tenant-invoice",
      invoice.invoiceId,
      paramsOf(reread.artifactUrl!),
    ) as StreamableFileLike;
    const bytes = await drain(refreshedFile.getStream());
    expect(bytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
  });

  it("also reissues an expired link through the list/runtime read path used by the tenant console page", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00Z"));

    const store = new InMemoryDocumentArtifactStore();
    const { billingSettlementService } = createService(store);

    const invoice = await billingSettlementService.generateTenantInvoice(
      "tenant-demo-001",
      { tenantId: "tenant-demo-001", ...PERIOD },
    );

    vi.setSystemTime(new Date("2026-04-01T00:30:00Z"));

    const runtimeList = billingSettlementService.listTenantInvoicesRuntime(
      "tenant-demo-001",
    );
    const runtimeItem = runtimeList.items.find(
      (item) => item.invoiceId === invoice.invoiceId,
    );
    expect(runtimeItem).toBeDefined();
    expect(
      runtimeItem!.availableActions.find(
        (action) => action.action === "download_artifact",
      )?.enabled,
    ).toBe(true);
    const expiresAt = new URL(
      runtimeItem!.artifactUrl!,
      "http://controlled-download.invalid",
    ).searchParams.get("expires_at");
    expect(Date.parse(expiresAt!)).toBeGreaterThan(Date.now());
  });

  it("self-heals when the underlying artifact store no longer has bytes matching the invoice's recorded link (e.g. after a process restart)", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const { billingSettlementService } = createService(store);

    const invoice = await billingSettlementService.generateTenantInvoice(
      "tenant-demo-001",
      { tenantId: "tenant-demo-001", ...PERIOD },
    );

    // `DocumentArtifactStore` is in-memory only (SR-ARTIFACT-001 scope); a
    // restart empties it while `tenantInvoices` survives via the repository.
    // There is no public seam to swap the injected store, so this simulates
    // that restart directly on the private field.
    (billingSettlementService as unknown as {
      documentArtifactStore: InMemoryDocumentArtifactStore;
    }).documentArtifactStore = new InMemoryDocumentArtifactStore();

    const healed = billingSettlementService.getTenantInvoice(
      "tenant-demo-001",
      invoice.invoiceId,
    );

    expect(healed.lines).toEqual(invoice.lines);
    expect(healed.amount).toEqual(invoice.amount);
    expect(healed.createdAt).toBe(invoice.createdAt);

    const rehealedStore = (
      billingSettlementService as unknown as {
        documentArtifactStore: InMemoryDocumentArtifactStore;
      }
    ).documentArtifactStore;
    const materialised = rehealedStore.get("tenant-invoice", invoice.invoiceId);
    expect(materialised).not.toBeNull();
    expect(materialised!.record.sha256).toBe(
      healed.artifactDownloadMetadata.manifestHash,
    );

    const controller = new ControlledDownloadController(rehealedStore);
    const file = resolve(
      controller,
      "tenant-invoice",
      invoice.invoiceId,
      paramsOf(healed.artifactUrl!),
    ) as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(bytes.toString("latin1")).toContain(
      `Tenant Invoice ${invoice.invoiceId}`,
    );
  });
});
