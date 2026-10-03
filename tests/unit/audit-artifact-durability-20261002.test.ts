import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { createControlledDownloadMetadata } from "../../apps/api/src/common/controlled-download";
import {
  DocumentArtifactRebuildRegistry,
  InMemoryDocumentArtifactStore,
  type DocumentArtifactStore,
  type DocumentArtifactRecord,
  type PutDocumentArtifactCommand,
} from "../../apps/api/src/common/document-artifacts";
import {
  createDocumentArtifactStore,
  UnprovisionedDocumentArtifactStore,
} from "../../apps/api/src/common/document-artifacts/document-artifact-runtime.config";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { BillingSettlementRepository } from "../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ControlledDownloadController } from "../../apps/api/src/modules/controlled-download/controlled-download.controller";
import type { PlatformAdminRepository } from "../../apps/api/src/modules/platform-admin/platform-admin.repository";
import { PlatformAdminService } from "../../apps/api/src/modules/platform-admin/platform-admin.service";

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

async function codeOf(call: () => unknown): Promise<string> {
  try {
    await call();
  } catch (error) {
    return (error as ApiRequestError).code;
  }
  throw new Error("expected the call to throw");
}

function emptyRepository(
  overrides: Partial<
    Awaited<ReturnType<BillingSettlementRepository["loadState"]>>
  > = {},
): BillingSettlementRepository {
  return {
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
      ...overrides,
    })),
    persistChanges: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
  } as unknown as BillingSettlementRepository;
}

/**
 * Wires a `BillingSettlementService` + `ControlledDownloadController` pair
 * exactly the way `ControlledDownloadModule` being `@Global()` wires the
 * real app: one `DocumentArtifactStore` and one `DocumentArtifactRebuildRegistry`
 * shared between them, with the service registering its own tenant-invoice
 * /report rebuilders against that registry in its constructor.
 *
 * `store` defaults to a fresh `InMemoryDocumentArtifactStore()`, but callers
 * that want to model "two instances behind the same durable backend" (the
 * normal production shape once `DOCUMENT_ARTIFACT_STORE` resolves to
 * `S3DocumentArtifactStoreAdapter`) pass the SAME store instance into two
 * calls -- that shared instance is this suite's test double for the shared
 * external storage boundary, not a per-instance process-local cache.
 */
function buildInstance(
  repository?: BillingSettlementRepository,
  store: InMemoryDocumentArtifactStore = new InMemoryDocumentArtifactStore(),
) {
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

const DEMO_PROFILE_P1 = {
  invoiceTitle: "Demo Tenant P1 Original Co., Ltd.",
  taxId: "24567891",
  address: "Taichung Harbor",
  contactName: "Billing Owner",
  email: "ap@demo-tenant.example.com",
};

const DEMO_PROFILE_P2 = {
  invoiceTitle: "Demo Tenant P2 Renamed Co., Ltd.",
  taxId: "99999999",
  address: "Kaohsiung Harbor",
  contactName: "New Billing Owner",
  email: "ap2@demo-tenant.example.com",
};

describe("document artifacts survive a restart / a sibling Cloud Run instance (AUDIT-ARTIFACT-DURABILITY-20261002)", () => {
  describe("R1/R2: the durable, shared DOCUMENT_ARTIFACT_STORE is the primary cross-instance/restart mechanism", () => {
    it("serves a tenant invoice from an independent reader instance that existed BEFORE generation, sharing only the external storage boundary -- no restart, no repository reload, no rebuild fallback", async () => {
      // `store` is this test's double for the shared external storage
      // boundary (S3 in production): both the producer and every reader
      // below are constructed against the SAME instance, never a per-pod
      // copy, which is exactly what R2 requires and the prior rebuild-only
      // design did not exercise.
      const store = new InMemoryDocumentArtifactStore();
      const podA = buildInstance(undefined, store);

      // Reader B: constructed BEFORE generation even runs, with no
      // BillingSettlementService / rebuild registry of its own at all --
      // proving the common cross-instance path is satisfied by the shared
      // store alone, never by asking a producer to re-render.
      const readerB = new ControlledDownloadController(store);

      await podA.service.updateTenantBillingProfile(
        "tenant-demo-001",
        DEMO_PROFILE_P1,
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

      const params = paramsOf(invoice.artifactUrl!);
      const fileB = (await resolve(
        readerB,
        "tenant-invoice",
        invoice.invoiceId,
        params,
      )) as unknown as StreamableFileLike;
      const bytesB = await drain(fileB.getStream());
      expect(sha256(bytesB)).toBe(
        invoice.artifactDownloadMetadata.manifestHash,
      );

      // Repeat after constructing a FRESH reader (no repository reload
      // either): same shared store, brand new controller instance, same
      // bytes -- the shared boundary is what makes this durable, not any
      // state carried by a particular controller/service object.
      const readerC = new ControlledDownloadController(store);
      const fileC = (await resolve(
        readerC,
        "tenant-invoice",
        invoice.invoiceId,
        params,
      )) as unknown as StreamableFileLike;
      const bytesC = await drain(fileC.getStream());
      expect(bytesC.equals(bytesB)).toBe(true);
    });

    it("serves a driver statement report from an independent reader instance that existed BEFORE generation, sharing only the external storage boundary", async () => {
      const store = new InMemoryDocumentArtifactStore();
      const podA = buildInstance(undefined, store);
      const readerB = new ControlledDownloadController(store);

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

      const params = paramsOf(statement.artifactUrl!);
      const file = (await resolve(
        readerB,
        "report",
        statement.statementId,
        params,
      )) as unknown as StreamableFileLike;
      const bytes = await drain(file.getStream());
      expect(sha256(bytes)).toBe(
        statement.artifactDownloadMetadata!.manifestHash,
      );
    });
  });

  describe("R3: byte identity across a restart is real, not re-derived from mutable current state", () => {
    it("serves the ORIGINAL issued invoice bytes for a still-valid link even after the tenant's billing profile was mutated and the instance restarted", async () => {
      const store = new InMemoryDocumentArtifactStore();
      const podA = buildInstance(undefined, store);

      await podA.service.updateTenantBillingProfile(
        "tenant-demo-001",
        DEMO_PROFILE_P1,
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
      const originalHash = invoice.artifactDownloadMetadata.manifestHash;

      // Mutate the billing profile AFTER issuance, without regenerating the
      // invoice -- exactly the scenario the reviewer required.
      const profileP2 = await podA.service.updateTenantBillingProfile(
        "tenant-demo-001",
        DEMO_PROFILE_P2,
        "req",
      );

      // Restart: a fresh instance reloading tenantInvoices/profiles from the
      // repository, but sharing the SAME durable store -- a real restart
      // never empties it.
      const repository = emptyRepository({
        tenantBillingProfiles: [profileP2],
        tenantInvoices: [invoice],
      });
      const restarted = buildInstance(repository, store);
      await restarted.service.onModuleInit();

      const params = paramsOf(invoice.artifactUrl!);
      const file = (await resolve(
        restarted.controller,
        "tenant-invoice",
        invoice.invoiceId,
        params,
      )) as unknown as StreamableFileLike;
      const bytes = await drain(file.getStream());

      expect(sha256(bytes)).toBe(originalHash);
      const text = bytes.toString("latin1");
      // The served bytes still show what was actually issued (P1), proving
      // they are the durably stored original bytes, not re-derived from the
      // now-current P2 profile.
      expect(text).toContain(DEMO_PROFILE_P1.invoiceTitle);
      expect(text).toContain(`Tax ID: ${DEMO_PROFILE_P1.taxId}`);
      expect(text).not.toContain(DEMO_PROFILE_P2.invoiceTitle);
      expect(text).not.toContain(`Tax ID: ${DEMO_PROFILE_P2.taxId}`);
    });

    it("serves the ORIGINAL driver statement bytes for a still-valid link even after payoutStatus changed post-issuance", async () => {
      const store = new InMemoryDocumentArtifactStore();
      const podA = buildInstance(undefined, store);

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
      expect(statement.payoutStatus).toBe("pending");
      const originalHash = statement.artifactDownloadMetadata!.manifestHash;

      // Mutate payoutStatus post-issuance without re-rendering -- modelling
      // the real `markReimbursementPaidWithProof` side effect, without this
      // unit-level byte-identity regression needing the full remittance
      // proof upload/scan/approval pipeline it depends on.
      (
        podA.service as unknown as {
          driverStatements: Array<{
            statementId: string;
            payoutStatus: string;
          }>;
        }
      ).driverStatements = (
        podA.service as unknown as {
          driverStatements: Array<{
            statementId: string;
            payoutStatus: string;
          }>;
        }
      ).driverStatements.map((candidate) =>
        candidate.statementId === statement.statementId
          ? { ...candidate, payoutStatus: "paid" }
          : candidate,
      );

      const params = paramsOf(statement.artifactUrl!);
      const file = (await resolve(
        podA.controller,
        "report",
        statement.statementId,
        params,
      )) as unknown as StreamableFileLike;
      const bytes = await drain(file.getStream());

      expect(sha256(bytes)).toBe(originalHash);
      const text = bytes.toString("latin1");
      expect(text).toContain("Payout Status: pending");
      expect(text).not.toContain("Payout Status: paid");
    });
  });

  describe("fallback: the rebuild registry still recovers a genuinely missing artifact, and never waives signature/content checks", () => {
    it("serves a tenant invoice's exact bytes from an instance that never rendered them, deriving them from durably persisted invoice data alone, when the store genuinely has nothing (a true data gap, not the common restart case)", async () => {
      const podA = buildInstance();
      const profile = await podA.service.updateTenantBillingProfile(
        "tenant-demo-001",
        DEMO_PROFILE_P1,
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
      const paramsA = paramsOf(invoice.artifactUrl!);
      const fileA = (await resolve(
        podA.controller,
        "tenant-invoice",
        invoice.invoiceId,
        paramsA,
      )) as unknown as StreamableFileLike;
      const bytesA = await drain(fileA.getStream());
      expect(sha256(bytesA)).toBe(
        invoice.artifactDownloadMetadata.manifestHash,
      );

      // Pod B: a fresh process with its OWN, genuinely empty store (not the
      // shared boundary -- a real production gap, e.g. the durable backend
      // lost this object), whose repository reload gives it the same
      // durably persisted invoice and billing profile.
      const repository = emptyRepository({
        tenantBillingProfiles: [profile],
        tenantInvoices: [invoice],
      });
      const podB = buildInstance(repository);
      await podB.service.onModuleInit();

      expect(
        await podB.store.get("tenant-invoice", invoice.invoiceId),
      ).toBeNull();

      const fileB = (await resolve(
        podB.controller,
        "tenant-invoice",
        invoice.invoiceId,
        paramsA,
      )) as unknown as StreamableFileLike;
      const bytesB = await drain(fileB.getStream());

      expect(bytesB.equals(bytesA)).toBe(true);
      expect(sha256(bytesB)).toBe(
        invoice.artifactDownloadMetadata.manifestHash,
      );
      // The rebuild also leaves pod B able to answer a second request for the
      // same artifact without rebuilding again.
      expect(
        await podB.store.get("tenant-invoice", invoice.invoiceId),
      ).not.toBeNull();
    });

    it("serves a driver statement report's exact bytes from an instance that never rendered them, when the store genuinely has nothing", async () => {
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

      const repository = emptyRepository({ driverStatements: [statement] });
      const podB = buildInstance(repository);
      await podB.service.onModuleInit();

      expect(await podB.store.get("report", statement.statementId)).toBeNull();

      const params = paramsOf(statement.artifactUrl!);
      const file = (await resolve(
        podB.controller,
        "report",
        statement.statementId,
        params,
      )) as unknown as StreamableFileLike;
      const bytes = await drain(file.getStream());

      expect(sha256(bytes)).toBe(
        statement.artifactDownloadMetadata!.manifestHash,
      );
    });

    it("still denies a stale link after a rebuild: a hash that was honestly signed but no longer matches the real file does not get waved through because a rebuild happened to run", async () => {
      const podA = buildInstance();
      const profile = await podA.service.updateTenantBillingProfile(
        "tenant-demo-001",
        DEMO_PROFILE_P1,
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

      // Pod B's own store is empty (modelling a genuine data gap, not the
      // common restart case), so resolution must go through the rebuild
      // path before this check can even be reached -- the rebuild must not
      // short-circuit it.
      const repository = emptyRepository({
        tenantBillingProfiles: [profile],
        tenantInvoices: [invoice],
      });
      const podB = buildInstance(repository);
      await podB.service.onModuleInit();

      expect(
        await codeOf(() =>
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
      expect(
        await podB.store.get("tenant-invoice", invoice.invoiceId),
      ).not.toBeNull();
    });

    it("still fails explicitly for a kind with no registered rebuilder, even though the registry exists", async () => {
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
        await codeOf(() =>
          resolve(controller, "placard", "placard-never-rendered", params),
        ),
      ).toBe("ARTIFACT_NOT_MATERIALISED");
    });

    it("still fails explicitly for a genuinely unknown subjectId, even for a kind that does have a registered rebuilder", async () => {
      const repository = emptyRepository();
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
        await codeOf(() =>
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
});

function emptyPlatformAdminRepository(
  overrides: {
    publicInfoVersions?: unknown[];
    placardVersions?: unknown[];
  } = {},
): PlatformAdminRepository {
  return {
    loadState: vi.fn(async () => ({
      platformTenants: [],
      publicInfoVersions: [],
      placardVersions: [],
      platformAdapters: [],
      ...overrides,
    })),
    persistChanges: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
  } as unknown as PlatformAdminRepository;
}

// Status is "draft" (not "published") on purpose: `generatePlacardVersion`
// auto-derives `placard.publishedAt` from a "published" source version,
// which would publish the placard as a side effect of generation and defeat
// these tests' own explicit `publishPlacardVersion` call. The placard's own
// publish lifecycle is independent of its source public-info version's
// status.
const PUBLIC_INFO_R4 = {
  versionId: "public-info-r4-recover",
  title: "R4 Recovery Disclosure",
  callPhone: "0800-010-010",
  complaintPhone: "0800-010-020",
  callRateText: "依表計費",
  fareText: "依公告",
  paymentMethodText: "現金",
  status: "draft" as const,
  effectiveFrom: "2026-04-01T00:00:00Z",
  effectiveTo: null,
  publishedBy: null,
  publishedAt: null,
  createdAt: "2026-03-20T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

describe("R4: a placard's artifactManifestHash does not by itself certify the durable store holds the object", () => {
  it("recovers a published legacy placard via the registered 'placard' rebuilder when a fresh instance's durable store genuinely has nothing behind an already-recorded manifest hash", async () => {
    // Pod A: a real store, real render -- the placard exactly as it was
    // originally published, with artifactManifestHash set the same way a
    // placard published under the OLD process-local store would also have
    // had it set.
    const podAStore = new InMemoryDocumentArtifactStore();
    const podARegistry = new DocumentArtifactRebuildRegistry();
    const podAService = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({ publicInfoVersions: [PUBLIC_INFO_R4] }),
      undefined,
      podAStore,
      podARegistry,
    );
    await podAService.onModuleInit();
    const draft = await podAService.generatePlacardVersion({
      versionCode: "placard-r4-recover",
      publicInfoVersionId: PUBLIC_INFO_R4.versionId,
      templateName: "seatback-r4",
    });
    const published = await podAService.publishPlacardVersion(
      draft.placardVersionId,
    );
    expect(published.artifactManifestHash).toBeTruthy();

    // Pod B: a brand-new instance -- same persisted placard + public-info
    // records via repository reload (the record `artifactManifestHash`
    // included), but its OWN durable store, which has never seen these
    // bytes: a placard published before this durable store existed, or
    // restored into a bucket that never held this particular object.
    const podBStore = new InMemoryDocumentArtifactStore();
    const podBRegistry = new DocumentArtifactRebuildRegistry();
    const podBService = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({
        publicInfoVersions: [PUBLIC_INFO_R4],
        placardVersions: [published],
      }),
      undefined,
      podBStore,
      podBRegistry,
    );
    await podBService.onModuleInit();

    const reloaded = await podBService.getPlacardVersion(
      draft.placardVersionId,
    );
    expect(reloaded.artifactManifestHash).toBe(
      published.artifactManifestHash,
    );
    expect(reloaded.artifactDownloadUrl).toBe(published.artifactDownloadUrl);
    // The durable store genuinely has nothing yet -- `getPlacardVersion`
    // trusting the persisted hash never checked, by design (see
    // `ensurePlacardArtifact`); only a real download attempt surfaces the
    // gap, and only there must it be closed.
    expect(await podBStore.get("placard", draft.placardVersionId)).toBeNull();

    // A separately configured download controller, sharing only pod B's own
    // store + registry (exactly how `ControlledDownloadController` is wired
    // in the real app), must still serve the link pod B's own
    // `getPlacardVersion` just handed back.
    const controller = new ControlledDownloadController(
      podBStore,
      podBRegistry,
    );
    const params = paramsOf(reloaded.artifactDownloadUrl!);
    const file = (await resolve(
      controller,
      "placard",
      draft.placardVersionId,
      params,
    )) as unknown as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(sha256(bytes)).toBe(reloaded.artifactManifestHash);

    // The rebuild also leaves pod B able to answer a second request without
    // rebuilding again.
    expect(
      await podBStore.get("placard", draft.placardVersionId),
    ).not.toBeNull();
  });

  it("recovers a DRAFT (never published) legacy placard the same way, and correctly reissues an already-expired link over the recovered, unchanged hash", async () => {
    const draftPublicInfo = {
      ...PUBLIC_INFO_R4,
      status: "draft" as const,
      publishedAt: null,
    };
    const podAStore = new InMemoryDocumentArtifactStore();
    const podARegistry = new DocumentArtifactRebuildRegistry();
    const podAService = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({ publicInfoVersions: [draftPublicInfo] }),
      undefined,
      podAStore,
      podARegistry,
    );
    await podAService.onModuleInit();
    const draft = await podAService.generatePlacardVersion({
      versionCode: "placard-r4-draft-recover",
      publicInfoVersionId: draftPublicInfo.versionId,
      templateName: "seatback-r4-draft",
    });
    expect(draft.publishedAt).toBeNull();
    expect(draft.artifactManifestHash).toBeTruthy();

    // Pod B reloads the same draft but with an artificially EXPIRED signed
    // link -- modelling an old link whose window has long since lapsed --
    // and its own empty store.
    const expiredDraft = {
      ...draft,
      artifactExpiresAt: "2020-01-01T00:00:00.000Z",
    };
    const podBStore = new InMemoryDocumentArtifactStore();
    const podBRegistry = new DocumentArtifactRebuildRegistry();
    const podBService = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({
        publicInfoVersions: [draftPublicInfo],
        placardVersions: [expiredDraft],
      }),
      undefined,
      podBStore,
      podBRegistry,
    );
    await podBService.onModuleInit();

    const reloaded = await podBService.getPlacardVersion(
      draft.placardVersionId,
    );
    // The hash is unchanged -- still proof of the same original content;
    // only the signature/expiry window is reissued, to a genuinely future
    // expiry (not just a URL that happens to differ as a string).
    expect(reloaded.artifactManifestHash).toBe(draft.artifactManifestHash);
    expect(Date.parse(reloaded.artifactExpiresAt!)).toBeGreaterThan(
      Date.now(),
    );

    const controller = new ControlledDownloadController(
      podBStore,
      podBRegistry,
    );
    const params = paramsOf(reloaded.artifactDownloadUrl!);
    const file = (await resolve(
      controller,
      "placard",
      draft.placardVersionId,
      params,
    )) as unknown as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(sha256(bytes)).toBe(draft.artifactManifestHash);
  });
});

describe("R4-followthrough: a placard whose source has mutated since issuance must migrate to a servable hash, not advertise one the store can never produce again", () => {
  it("migrates a legacy placard's canonical hash when its source public-info version was retired by an ordinary successor publish, so a fresh link succeeds after the first, honest denial", async () => {
    const publishedSource = {
      ...PUBLIC_INFO_R4,
      status: "published" as const,
      publishedAt: "2026-04-01T00:00:00Z",
    };
    const podAStore = new InMemoryDocumentArtifactStore();
    const podARegistry = new DocumentArtifactRebuildRegistry();
    const podAService = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({ publicInfoVersions: [publishedSource] }),
      undefined,
      podAStore,
      podARegistry,
    );
    await podAService.onModuleInit();
    const published = await podAService.generatePlacardVersion({
      versionCode: "placard-r4ft-published-source",
      publicInfoVersionId: publishedSource.versionId,
      templateName: "seatback-r4ft",
    });
    const originalHash = published.artifactManifestHash!;

    // An ordinary content-management action: a successor public-info
    // version is published, which retires the one this placard was
    // generated from. Not a test-only mutation.
    const successor = podAService.createPublicInfoVersion({
      title: "R4-followthrough successor disclosure",
      callPhone: "0800-020-020",
    });
    podAService.publishPublicInfoVersion(
      successor.versionId,
      {},
      "req",
      "platform-admin-r4ft-actor",
    );
    const retiredSource = podAService
      .listPublicInfoVersions()
      .find((v) => v.versionId === publishedSource.versionId)!;
    expect(retiredSource.status).toBe("retired");

    // Pod B: a fresh instance, persisted-equivalent records reloaded
    // (the NOW-RETIRED source and the placard's ORIGINAL hash included),
    // but its own durable store has never seen these bytes.
    const podBStore = new InMemoryDocumentArtifactStore();
    const podBRegistry = new DocumentArtifactRebuildRegistry();
    const podBService = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({
        publicInfoVersions: [retiredSource, successor],
        placardVersions: [published],
      }),
      undefined,
      podBStore,
      podBRegistry,
    );
    await podBService.onModuleInit();

    const reloaded = await podBService.getPlacardVersion(
      published.placardVersionId,
    );
    expect(reloaded.artifactManifestHash).toBe(originalHash);

    const controller = new ControlledDownloadController(
      podBStore,
      podBRegistry,
    );
    const staleParams = paramsOf(reloaded.artifactDownloadUrl!);

    // The OLD link, signed for bytes this instance's store can never
    // reproduce again (the source has moved on since issuance), honestly
    // denies -- it must never be silently served mismatching bytes under
    // the old hash.
    await expect(
      resolve(controller, "placard", published.placardVersionId, staleParams),
    ).rejects.toMatchObject({ code: "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH" });

    // That failed recovery attempt must have migrated this placard's own
    // canonical hash forward -- explicitly and audited, not silently -- so
    // a FRESH link now succeeds instead of repeating the same denial
    // forever.
    const afterMigration = await podBService.getPlacardVersion(
      published.placardVersionId,
    );
    expect(afterMigration.artifactManifestHash).not.toBe(originalHash);

    const freshParams = paramsOf(afterMigration.artifactDownloadUrl!);
    const file = (await resolve(
      controller,
      "placard",
      published.placardVersionId,
      freshParams,
    )) as unknown as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(sha256(bytes)).toBe(afterMigration.artifactManifestHash);
  });

  it("migrates a legacy placard's canonical hash when its DRAFT source was later published, covering the draft-to-published source drift", async () => {
    const draftSource = { ...PUBLIC_INFO_R4 };
    const podAStore = new InMemoryDocumentArtifactStore();
    const podARegistry = new DocumentArtifactRebuildRegistry();
    const podAService = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({ publicInfoVersions: [draftSource] }),
      undefined,
      podAStore,
      podARegistry,
    );
    await podAService.onModuleInit();
    const draftPlacard = await podAService.generatePlacardVersion({
      versionCode: "placard-r4ft-draft-source",
      publicInfoVersionId: draftSource.versionId,
      templateName: "seatback-r4ft-draft",
    });
    const originalHash = draftPlacard.artifactManifestHash!;

    podAService.publishPublicInfoVersion(
      draftSource.versionId,
      {},
      "req",
      "platform-admin-r4ft-actor",
    );
    const publishedSource = podAService
      .listPublicInfoVersions()
      .find((v) => v.versionId === draftSource.versionId)!;
    expect(publishedSource.status).toBe("published");

    const podBStore = new InMemoryDocumentArtifactStore();
    const podBRegistry = new DocumentArtifactRebuildRegistry();
    const podBService = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({
        publicInfoVersions: [publishedSource],
        placardVersions: [draftPlacard],
      }),
      undefined,
      podBStore,
      podBRegistry,
    );
    await podBService.onModuleInit();

    const reloaded = await podBService.getPlacardVersion(
      draftPlacard.placardVersionId,
    );
    const controller = new ControlledDownloadController(
      podBStore,
      podBRegistry,
    );
    await expect(
      resolve(
        controller,
        "placard",
        draftPlacard.placardVersionId,
        paramsOf(reloaded.artifactDownloadUrl!),
      ),
    ).rejects.toMatchObject({ code: "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH" });

    const afterMigration = await podBService.getPlacardVersion(
      draftPlacard.placardVersionId,
    );
    expect(afterMigration.artifactManifestHash).not.toBe(originalHash);
    const file = (await resolve(
      controller,
      "placard",
      draftPlacard.placardVersionId,
      paramsOf(afterMigration.artifactDownloadUrl!),
    )) as unknown as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(sha256(bytes)).toBe(afterMigration.artifactManifestHash);
  });
});

describe("R5: a transient durable-store failure during publish must not leave a placard permanently marked published", () => {
  /** Throws on `put` exactly once (configurable), delegating to a real
   * in-memory store otherwise -- only the external write boundary is
   * doubled, never the service/render logic. */
  class FlakyDocumentArtifactStore implements DocumentArtifactStore {
    private readonly inner = new InMemoryDocumentArtifactStore();
    failNextPut = false;

    async put(
      command: PutDocumentArtifactCommand,
    ): Promise<DocumentArtifactRecord> {
      if (this.failNextPut) {
        this.failNextPut = false;
        throw Object.assign(new Error("ServiceUnavailable"), {
          name: "ServiceUnavailable",
        });
      }
      return this.inner.put(command);
    }

    putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
      return this.inner.putIfAbsent(...args);
    }

    get(...args: Parameters<DocumentArtifactStore["get"]>) {
      return this.inner.get(...args);
    }
  }

  it("leaves the placard retryable as a draft, with its draft bytes/metadata unchanged, after a failed publish write -- then succeeds on a healthy retry", async () => {
    const store = new FlakyDocumentArtifactStore();
    const registry = new DocumentArtifactRebuildRegistry();
    const service = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({ publicInfoVersions: [PUBLIC_INFO_R4] }),
      undefined,
      store,
      registry,
    );
    await service.onModuleInit();
    const draft = await service.generatePlacardVersion({
      versionCode: "placard-r5-flaky-publish",
      publicInfoVersionId: PUBLIC_INFO_R4.versionId,
      templateName: "seatback-r5",
    });
    const draftHash = draft.artifactManifestHash;
    const draftUrl = draft.artifactDownloadUrl;

    store.failNextPut = true;
    await expect(
      service.publishPlacardVersion(draft.placardVersionId),
    ).rejects.toThrow(/ServiceUnavailable/);

    const afterFailure = await service.getPlacardVersion(
      draft.placardVersionId,
    );
    // Still an unpublished, retryable draft -- not stuck claiming success
    // for a write that never actually happened.
    expect(afterFailure.publishedAt).toBeNull();
    expect(afterFailure.artifactManifestHash).toBe(draftHash);
    expect(afterFailure.artifactDownloadUrl).toBe(draftUrl);

    const published = await service.publishPlacardVersion(
      draft.placardVersionId,
    );
    expect(published.publishedAt).toBeTruthy();
    expect(published.artifactManifestHash).toBeTruthy();

    // A second publish attempt now correctly reports the real conflict,
    // proving the first retry genuinely published it.
    await expect(
      service.publishPlacardVersion(draft.placardVersionId),
    ).rejects.toMatchObject({ code: "PLACARD_VERSION_ALREADY_PUBLISHED" });
  });
});

describe("R6: an existing-object hash mismatch must deny without invoking the rebuild writer or damaging another valid link", () => {
  it("does not overwrite a durably stored invoice when a genuinely signed stale-hash link is resolved against it, and the original link keeps working", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const registry = new DocumentArtifactRebuildRegistry();
    const service = new BillingSettlementService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      store,
      undefined,
      registry,
    );
    const controller = new ControlledDownloadController(store, registry);

    await service.updateTenantBillingProfile(
      "tenant-demo-001",
      DEMO_PROFILE_P1,
      "req",
    );
    const invoice = await service.generateTenantInvoice(
      "tenant-demo-001",
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
      "req",
    );
    const originalHash = invoice.artifactDownloadMetadata.manifestHash;

    // Tenant profile changes AFTER issuance -- if a rebuild were ever
    // triggered, it would render visibly different (P2) bytes.
    await service.updateTenantBillingProfile(
      "tenant-demo-001",
      DEMO_PROFILE_P2,
      "req",
    );

    // A genuinely signed link for the SAME subject, but naming a manifest
    // hash that does not match the real, existing object -- a stale link
    // (the invoice was regenerated after signing) or a forged one, not an
    // absent object.
    const staleLink = createControlledDownloadMetadata({
      kind: "tenant-invoice",
      subjectId: invoice.invoiceId,
      manifestHash: "0".repeat(64),
    }).downloadUrl;

    const putCallsBefore = (
      store as unknown as { entries: Map<string, unknown> }
    ).entries.size;

    await expect(
      resolve(controller, "tenant-invoice", invoice.invoiceId, paramsOf(staleLink)),
    ).rejects.toMatchObject({ code: "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH" });

    // The real, existing object must be completely untouched: same entry
    // count, same bytes/hash as issued.
    expect(
      (store as unknown as { entries: Map<string, unknown> }).entries.size,
    ).toBe(putCallsBefore);
    const stillStored = await store.get("tenant-invoice", invoice.invoiceId);
    expect(stillStored?.record.sha256).toBe(originalHash);

    // The ORIGINAL, still-valid link must still resolve -- a rejected stale
    // request must never have damaged it.
    const originalParams = paramsOf(invoice.artifactUrl!);
    const file = (await resolve(
      controller,
      "tenant-invoice",
      invoice.invoiceId,
      originalParams,
    )) as unknown as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(sha256(bytes)).toBe(originalHash);
    const text = bytes.toString("latin1");
    expect(text).toContain(DEMO_PROFILE_P1.invoiceTitle);
    expect(text).not.toContain(DEMO_PROFILE_P2.invoiceTitle);
  });

  it("still recovers a genuinely MISSING object via the rebuild path -- R6's guard narrows the trigger to not_found, it does not remove recovery", async () => {
    const podA = buildInstance();
    const profile = await podA.service.updateTenantBillingProfile(
      "tenant-demo-001",
      DEMO_PROFILE_P1,
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

    const repository = emptyRepository({
      tenantBillingProfiles: [profile],
      tenantInvoices: [invoice],
    });
    const podB = buildInstance(repository);
    await podB.service.onModuleInit();
    expect(
      await podB.store.get("tenant-invoice", invoice.invoiceId),
    ).toBeNull();

    const params = paramsOf(invoice.artifactUrl!);
    const file = (await resolve(
      podB.controller,
      "tenant-invoice",
      invoice.invoiceId,
      params,
    )) as unknown as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(sha256(bytes)).toBe(invoice.artifactDownloadMetadata.manifestHash);
  });
});

describe("R6-followthrough: a recovery write racing a concurrent restoration must not overwrite bytes the concurrent writer already restored", () => {
  it("does not let a stale-link GET's not_found recovery clobber bytes an independent writer restores while this GET's not_found result is still in flight", async () => {
    // Holds an already-determined `get` result "in transit": the lookup
    // itself runs (and snapshots the then-current state) immediately, but
    // the result is only delivered to the caller once `armed` is consumed
    // and `gate` resolves -- modelling a real GetObject response that is
    // already a NoSuchKey, just not yet delivered over the wire.
    // `armed`/`gate` are declared together as one mutable holder (instead
    // of separate `let`s) so the one-time `gate` assignment below does not
    // trip `prefer-const` -- the class's `get()` closes over `state` by
    // reference, which is itself never reassigned.
    const state: { armed: boolean; gate?: Promise<void> } = {
      armed: false,
    };

    class InterleavedDocumentArtifactStore implements DocumentArtifactStore {
      readonly inner = new InMemoryDocumentArtifactStore();

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.inner.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.inner.putIfAbsent(...args);
      }

      async get(...args: Parameters<DocumentArtifactStore["get"]>) {
        const result = await this.inner.get(...args);
        if (state.armed) {
          state.armed = false;
          await state.gate;
        }
        return result;
      }
    }

    const store = new InterleavedDocumentArtifactStore();
    const registry = new DocumentArtifactRebuildRegistry();
    const service = new BillingSettlementService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      store,
      undefined,
      registry,
    );
    const controller = new ControlledDownloadController(store, registry);

    await service.updateTenantBillingProfile(
      "tenant-demo-001",
      DEMO_PROFILE_P1,
      "req",
    );
    const invoice = await service.generateTenantInvoice(
      "tenant-demo-001",
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
      "req",
    );
    const originalHash = invoice.artifactDownloadMetadata.manifestHash;
    const originalBytes = Buffer.from(
      (await store.get("tenant-invoice", invoice.invoiceId))!.bytes,
    );

    // Profile changes AFTER issuance -- if THIS instance's own rebuild were
    // ever to win, it would render visibly different (P2) bytes.
    await service.updateTenantBillingProfile(
      "tenant-demo-001",
      DEMO_PROFILE_P2,
      "req",
    );

    // Model actual absence: the durable store genuinely lost the object.
    (
      store.inner as unknown as { entries: Map<string, unknown> }
    ).entries.delete(`tenant-invoice::${invoice.invoiceId}`);

    // A genuinely signed link for the SAME subject, but naming a manifest
    // hash that does not match the real object (stale/forged) -- this is
    // the request whose not_found check we suspend below.
    const staleLink = createControlledDownloadMetadata({
      kind: "tenant-invoice",
      subjectId: invoice.invoiceId,
      manifestHash: "0".repeat(64),
    }).downloadUrl;

    let release!: () => void;
    state.gate = new Promise((resolve) => {
      release = resolve;
    });
    state.armed = true;

    const stalePending = resolve(
      controller,
      "tenant-invoice",
      invoice.invoiceId,
      paramsOf(staleLink),
    );

    // While A's not_found determination is held in transit, an independent
    // writer (a sibling instance, or any other legitimate restorer) puts
    // the exact ORIGINAL bytes back.
    await store.put({
      kind: "tenant-invoice",
      subjectId: invoice.invoiceId,
      mimeType: "application/pdf",
      bytes: originalBytes,
    });
    const restored = await store.get("tenant-invoice", invoice.invoiceId);
    expect(restored?.record.sha256).toBe(originalHash);

    // Release A's held not_found result; its rebuild now runs against a
    // store that, in reality, already holds a good object again.
    release();

    await expect(stalePending).rejects.toMatchObject({
      code: "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH",
    });

    // The real, restored object must be completely untouched by A's
    // rebuild attempt: still the original bytes/hash, never A's P2 render.
    const finalEntry = await store.get("tenant-invoice", invoice.invoiceId);
    expect(finalEntry?.record.sha256).toBe(originalHash);
    expect(finalEntry?.bytes.equals(originalBytes)).toBe(true);

    // The ORIGINAL, still-valid link must still resolve correctly.
    const file = (await resolve(
      controller,
      "tenant-invoice",
      invoice.invoiceId,
      paramsOf(invoice.artifactUrl!),
    )) as unknown as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(sha256(bytes)).toBe(originalHash);
  });
});

describe("R7: concurrent publishes for the same placard must not leave metadata pointing at bytes the store does not have", () => {
  it("serializes concurrent publish attempts for the same placardVersionId, so a stale completion cannot overwrite a newer committed publish", async () => {
    let publishPutCount = 0;
    let holdNextPut = false;
    let releasePutResponse: (() => void) | undefined;
    // See the R6-followthrough test above for why this is one mutable
    // holder rather than a separate `let putResponseGate`.
    const putResponseState: { gate?: Promise<void> } = {};

    class ReorderedDocumentArtifactStore implements DocumentArtifactStore {
      private readonly inner = new InMemoryDocumentArtifactStore();

      async put(command: PutDocumentArtifactCommand) {
        const shouldHold = holdNextPut;
        holdNextPut = false;
        if (shouldHold) {
          publishPutCount += 1;
        }
        // Commit real bytes immediately -- only THIS call's own response is
        // held, modelling a slow acknowledgement, not a slow write.
        const record = await this.inner.put(command);
        if (shouldHold && putResponseState.gate) {
          await putResponseState.gate;
        }
        return record;
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.inner.putIfAbsent(...args);
      }

      get(...args: Parameters<DocumentArtifactStore["get"]>) {
        return this.inner.get(...args);
      }
    }

    const store = new ReorderedDocumentArtifactStore();
    const registry = new DocumentArtifactRebuildRegistry();
    const service = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({ publicInfoVersions: [PUBLIC_INFO_R4] }),
      undefined,
      store,
      registry,
    );
    await service.onModuleInit();
    // The draft's own issuance put happens here, BEFORE any publish-related
    // counting/gating is armed below.
    const draft = await service.generatePlacardVersion({
      versionCode: "placard-r7-concurrent-publish",
      publicInfoVersionId: PUBLIC_INFO_R4.versionId,
      templateName: "seatback-r7",
    });

    putResponseState.gate = new Promise((resolve) => {
      releasePutResponse = resolve;
    });
    holdNextPut = true;

    // A starts, commits its bytes, and is held waiting on its own response.
    const publishA = service.publishPlacardVersion(draft.placardVersionId);
    // B starts "after" A in wall-clock terms; the in-process publish lock
    // means B cannot even begin its own render/write until A's entire call
    // (including its held response) settles -- the fix's serialization.
    const publishB = service.publishPlacardVersion(draft.placardVersionId);

    await new Promise((r) => setTimeout(r, 10));
    expect(publishPutCount).toBe(1);

    releasePutResponse!();
    const [resultA, resultB] = await Promise.allSettled([publishA, publishB]);

    expect(resultA.status).toBe("fulfilled");
    expect(resultB.status).toBe("rejected");
    expect((resultB as PromiseRejectedResult).reason).toMatchObject({
      code: "PLACARD_VERSION_ALREADY_PUBLISHED",
    });
    // B never reached its own render/write: the lock resolved its guard
    // check against A's already-committed state before any put occurred.
    expect(publishPutCount).toBe(1);

    const published = (
      resultA as PromiseFulfilledResult<
        Awaited<ReturnType<typeof service.publishPlacardVersion>>
      >
    ).value;
    const stored = await store.get("placard", draft.placardVersionId);
    expect(stored?.record.sha256).toBe(published.artifactManifestHash);

    const controller = new ControlledDownloadController(store, registry);
    const file = (await resolve(
      controller,
      "placard",
      draft.placardVersionId,
      paramsOf(published.artifactDownloadUrl!),
    )) as unknown as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(sha256(bytes)).toBe(published.artifactManifestHash);
  });

  it("reports a conflict instead of committing metadata when the durable store's read-back disagrees with what publish just wrote (a cross-instance clobber)", async () => {
    class ClobberedReadbackDocumentArtifactStore
      implements DocumentArtifactStore
    {
      private readonly inner = new InMemoryDocumentArtifactStore();

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.inner.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.inner.putIfAbsent(...args);
      }

      async get(kind: Parameters<DocumentArtifactStore["get"]>[0], subjectId: string) {
        // Model a different instance's own publish landing between THIS
        // publish's put and its own read-back verification.
        await this.inner.put({
          kind,
          subjectId,
          mimeType: "application/pdf",
          bytes: Buffer.from(
            "%PDF-1.4 a different instance's publish\n%%EOF",
          ),
        });
        return this.inner.get(kind, subjectId);
      }
    }

    const store = new ClobberedReadbackDocumentArtifactStore();
    const registry = new DocumentArtifactRebuildRegistry();
    const service = new PlatformAdminService(
      new AuditNotificationService(),
      emptyPlatformAdminRepository({ publicInfoVersions: [PUBLIC_INFO_R4] }),
      undefined,
      store,
      registry,
    );
    await service.onModuleInit();
    const draft = await service.generatePlacardVersion({
      versionCode: "placard-r7-clobbered-readback",
      publicInfoVersionId: PUBLIC_INFO_R4.versionId,
      templateName: "seatback-r7-clobber",
    });
    const draftHash = draft.artifactManifestHash;
    const draftUrl = draft.artifactDownloadUrl;

    await expect(
      service.publishPlacardVersion(draft.placardVersionId),
    ).rejects.toMatchObject({ code: "PLACARD_PUBLISH_CONFLICT" });

    // The conflicting completion must not have committed its metadata: the
    // placard stays an unpublished, retryable draft.
    const afterConflict = await service.getPlacardVersion(
      draft.placardVersionId,
    );
    expect(afterConflict.publishedAt).toBeNull();
    expect(afterConflict.artifactManifestHash).toBe(draftHash);
    expect(afterConflict.artifactDownloadUrl).toBe(draftUrl);
  });
});

describe("createDocumentArtifactStore provider resolution", () => {
  it("fails closed when no provider is configured and NODE_ENV is not test", () => {
    const store = createDocumentArtifactStore({});
    expect(store).toBeInstanceOf(UnprovisionedDocumentArtifactStore);
  });

  it("falls back to memory only implicitly under NODE_ENV=test", () => {
    const store = createDocumentArtifactStore({ NODE_ENV: "test" });
    expect(store).toBeInstanceOf(InMemoryDocumentArtifactStore);
  });

  it.each([{}, { NODE_ENV: "test" }, { NODE_ENV: "development" }])(
    "allows explicit memory for a non-strict fixture without changing unrelated auth configuration: %j",
    (env) => {
      const store = createDocumentArtifactStore({
        ...env,
        DOCUMENT_ARTIFACT_STORAGE_PROVIDER: "memory",
      });
      expect(store).toBeInstanceOf(InMemoryDocumentArtifactStore);
    },
  );

  const strictEnvironments = ["NODE_ENV", "APP_ENV", "DRTS_ENV"].flatMap(
    (key) => ["production", "prod", "staging", "stage", " PRODUCTION ", " STAGING "].map(
      (value) => ({ key, value }),
    ),
  );
  it.each(strictEnvironments)(
    "rejects explicit memory for $key=$value even when other markers and CI claim fixture mode",
    ({ key, value }) => {
      expect(() => createDocumentArtifactStore({
        NODE_ENV: "test",
        APP_ENV: "development",
        DRTS_ENV: "test",
        CI: "true",
        [key]: value,
        DOCUMENT_ARTIFACT_STORAGE_PROVIDER: "memory",
      })).toThrow(/forbidden in staging\/production/);
    },
  );
  it.each(strictEnvironments)(
    "never implicitly defaults to memory for $key=$value",
    async ({ key, value }) => {
      const store = createDocumentArtifactStore({
        NODE_ENV: "test",
        APP_ENV: "development",
        DRTS_ENV: "test",
        CI: "true",
        [key]: value,
      });
      expect(store).toBeInstanceOf(UnprovisionedDocumentArtifactStore);
      await expect(store.get("tenant-invoice", "not-materialized")).rejects.toThrow(/not configured/);
    },
  );

  it("still rejects an unrecognised explicit provider", () => {
    expect(() =>
      createDocumentArtifactStore({
        DOCUMENT_ARTIFACT_STORAGE_PROVIDER: "filesystem",
      }),
    ).toThrow(/must be s3; memory is test-only/);
  });
});
