import { createHash, randomUUID } from "node:crypto";

import type { PlacardVersionRecord } from "@drts/contracts";
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
import type { DatabaseService } from "../../apps/api/src/common/db";
import { PlatformAdminRepository } from "../../apps/api/src/modules/platform-admin/platform-admin.repository";
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
    // Single-instance tests only: this stub has no shared row to fence
    // against, so every claim trivially wins. Cross-instance arbitration is
    // exercised separately below, against a repository double that
    // actually implements the conditional guard (see
    // `sharedFencedRepository` in the "R7-followthrough" describe block).
    claimPlacardPublish: vi.fn(async () => ({
      claimed: true,
      currentRecord: null,
    })),
    finalizePlacardPublish: vi.fn(async () => true),
    releasePlacardPublishClaim: vi.fn(async () => true),
    getPlacardVersionRecord: vi.fn(async () => null),
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

    put(
      command: PutDocumentArtifactCommand,
    ): Promise<DocumentArtifactRecord> {
      return this.inner.put(command);
    }

    putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
      return this.inner.putIfAbsent(...args);
    }

    // The publish path's own object write goes through `putIfUnchanged`
    // (the byte-ownership fix), not plain `put` -- the failure injection
    // has to live here to actually land on the write a publish attempts.
    async putIfUnchanged(
      command: PutDocumentArtifactCommand,
      expectedGeneration: string | null,
    ) {
      if (this.failNextPut) {
        this.failNextPut = false;
        throw Object.assign(new Error("ServiceUnavailable"), {
          name: "ServiceUnavailable",
        });
      }
      return this.inner.putIfUnchanged(command, expectedGeneration);
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

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.inner.putIfUnchanged(...args);
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

      put(command: PutDocumentArtifactCommand) {
        return this.inner.put(command);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.inner.putIfAbsent(...args);
      }

      // The publish path's own object write goes through `putIfUnchanged`
      // (the byte-ownership fix) -- the hold-the-response instrumentation
      // has to live here, not on plain `put`, to actually model a slow
      // acknowledgement of a publish's own write.
      async putIfUnchanged(
        command: PutDocumentArtifactCommand,
        expectedGeneration: string | null,
      ) {
        const shouldHold = holdNextPut;
        holdNextPut = false;
        if (shouldHold) {
          publishPutCount += 1;
        }
        // Commit real bytes immediately -- only THIS call's own response is
        // held, modelling a slow acknowledgement, not a slow write.
        const result = await this.inner.putIfUnchanged(
          command,
          expectedGeneration,
        );
        if (shouldHold && putResponseState.gate) {
          await putResponseState.gate;
        }
        return result;
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

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.inner.putIfUnchanged(...args);
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

describe("R7-followthrough: two independent PlatformAdminService instances (two Cloud Run pods) racing to publish the same never-before-published placard must not both succeed", () => {
  /**
   * Models the shared `admin.phase1_placard_versions` row both pods write
   * through: `claimPlacardPublish`'s guard mirrors the real `WHERE
   * record->>'publishedAt' IS NULL` conditional write this review requires
   * in `PlatformAdminRepository`. Using the SAME `rows` Map for both pods'
   * repository handle is what actually proves cross-instance fencing --
   * each pod only ever sees the other's committed state through this one
   * shared table, never through any in-process field.
   */
  function sharedFencedRepository(publicInfoVersions: unknown[]) {
    const rows = new Map<string, any>();
    const repository = {
      loadState: vi.fn(async () => ({
        platformTenants: [],
        publicInfoVersions,
        placardVersions: [...rows.values()].map((row) => ({ ...row })),
        platformAdapters: [],
      })),
      persistChanges: vi.fn(async (changes: { placardVersions?: readonly any[] }) => {
        for (const placard of changes.placardVersions ?? []) {
          rows.set(placard.placardVersionId, { ...placard });
        }
      }),
      reportPersistenceFailure: vi.fn(),
      isEnabled: () => true,
      claimPlacardPublish: vi.fn(async (claim: any) => {
        const current = rows.get(claim.placardVersionId);
        if (current?.publishedAt) {
          return { claimed: false, currentRecord: { ...current } };
        }
        rows.set(claim.placardVersionId, { ...claim });
        return { claimed: true, currentRecord: { ...claim } };
      }),
      finalizePlacardPublish: vi.fn(async (record: any) => {
        rows.set(record.placardVersionId, { ...record });
        return true;
      }),
      releasePlacardPublishClaim: vi.fn(
        async (
          placardVersionId: string,
          claimedPublishedAt: string,
          reverted: any,
        ) => {
          const current = rows.get(placardVersionId);
          if (current?.publishedAt === claimedPublishedAt) {
            rows.set(placardVersionId, { ...reverted });
            return true;
          }
          return false;
        },
      ),
      getPlacardVersionRecord: vi.fn(async (placardVersionId: string) => {
        const current = rows.get(placardVersionId);
        return current ? { ...current } : null;
      }),
    };
    return {
      repository: repository as unknown as PlatformAdminRepository,
      rows,
    };
  }

  /**
   * `get` returns the real bytes the store actually holds AT THE MOMENT it
   * is called (never fabricated), but delivery of that already-captured
   * response can be held open -- modelling a slow acknowledgement of an
   * authentic successful S3 GetObject, exactly the window the original
   * defect exploited. Only armed once; subsequent `get` calls (e.g. a fresh
   * reader) are never held.
   */
  class DelayedReadbackStore implements DocumentArtifactStore {
    private readonly inner = new InMemoryDocumentArtifactStore();
    private gate: Promise<void> | undefined;
    private skip = 0;
    putCount = 0;

    /**
     * Holds the next `get` call, after letting `skip` of them pass through
     * untouched. The publish path now reads its own baseline generation
     * (the byte-ownership fix) before it ever writes, so its FIRST `get`
     * call is that baseline read, not the authentic post-write read-back
     * this test wants to hold open -- callers pass `skip: 1` to target the
     * read-back instead of the baseline read.
     */
    armNextGet(skip = 0): () => void {
      this.skip = skip;
      let release!: () => void;
      this.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => release();
    }

    async put(command: PutDocumentArtifactCommand) {
      this.putCount += 1;
      return this.inner.put(command);
    }

    putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
      return this.inner.putIfAbsent(...args);
    }

    async putIfUnchanged(
      command: PutDocumentArtifactCommand,
      expectedGeneration: string | null,
    ) {
      this.putCount += 1;
      return this.inner.putIfUnchanged(command, expectedGeneration);
    }

    async get(...args: Parameters<DocumentArtifactStore["get"]>) {
      const result = await this.inner.get(...args);
      if (this.gate) {
        if (this.skip > 0) {
          this.skip -= 1;
        } else {
          const held = this.gate;
          this.gate = undefined;
          await held;
        }
      }
      return result;
    }
  }

  it("fences the losing instance out before it ever writes bytes, even though the winner's own authentic read-back is held in flight", async () => {
    const { repository, rows } = sharedFencedRepository([PUBLIC_INFO_R4]);
    const sharedStore = new DelayedReadbackStore();
    const sharedRegistry = new DocumentArtifactRebuildRegistry();

    const podAService = new PlatformAdminService(
      new AuditNotificationService(),
      repository,
      undefined,
      sharedStore,
      sharedRegistry,
    );
    await podAService.onModuleInit();
    const draft = await podAService.generatePlacardVersion({
      versionCode: "placard-r7-followthrough-cross-instance",
      publicInfoVersionId: PUBLIC_INFO_R4.versionId,
      templateName: "seatback-r7-followthrough",
    });
    // Pod B boots from the same durable row pod A's draft was just
    // committed to -- two independently booted Cloud Run instances reading
    // the same table, not a shared in-process cache.
    await repository.persistChanges({ placardVersions: [draft] });

    const podBService = new PlatformAdminService(
      new AuditNotificationService(),
      repository,
      undefined,
      sharedStore,
      sharedRegistry,
    );
    await podBService.onModuleInit();

    // `generatePlacardVersion` above already issued the draft's own
    // initial `put`; only writes from here on are what this test counts.
    sharedStore.putCount = 0;

    const release = sharedStore.armNextGet(1);
    // Pod A: claims, writes its real bytes, then blocks on its own
    // (authentic, successful) read-back -- it has not yet committed
    // anything past the claim.
    const publishA = podAService.publishPlacardVersion(draft.placardVersionId);
    await new Promise((r) => setTimeout(r, 10));
    expect(sharedStore.putCount).toBe(1);
    expect(rows.get(draft.placardVersionId)?.publishedAt).toBeTruthy();

    // Pod B: its own in-memory cache still shows this placard unpublished,
    // but the shared claim it must go through first rejects it immediately
    // -- it must never reach `put` at all, let alone overwrite pod A's
    // bytes or metadata.
    await expect(
      podBService.publishPlacardVersion(draft.placardVersionId),
    ).rejects.toMatchObject({ code: "PLACARD_VERSION_ALREADY_PUBLISHED" });
    expect(sharedStore.putCount).toBe(1);

    // Only now does pod A's held read-back resolve (reversed completion
    // order vs. issue order): it must still see its own bytes, because
    // nothing else was ever allowed to write.
    release();
    const published = await publishA;

    const persisted = rows.get(draft.placardVersionId);
    expect(persisted?.artifactManifestHash).toBe(
      published.artifactManifestHash,
    );
    const stored = await sharedStore.get("placard", draft.placardVersionId);
    expect(stored?.record.sha256).toBe(published.artifactManifestHash);

    // An independent, freshly booted reader (a third pod) resolving the
    // winner's own link must succeed.
    const freshController = new ControlledDownloadController(
      sharedStore,
      sharedRegistry,
    );
    const file = (await resolve(
      freshController,
      "placard",
      draft.placardVersionId,
      paramsOf(published.artifactDownloadUrl!),
    )) as unknown as StreamableFileLike;
    const bytes = await drain(file.getStream());
    expect(sha256(bytes)).toBe(published.artifactManifestHash);
  });

  it("releases the claim after a failed store write, so a sibling instance's healthy retry still succeeds", async () => {
    const { repository, rows } = sharedFencedRepository([PUBLIC_INFO_R4]);

    class FailOnceStore implements DocumentArtifactStore {
      private readonly inner = new InMemoryDocumentArtifactStore();
      failNextPut = false;

      put(command: PutDocumentArtifactCommand) {
        return this.inner.put(command);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.inner.putIfAbsent(...args);
      }

      // See `FlakyDocumentArtifactStore` (R5) for why the failure injection
      // lives on `putIfUnchanged`, not `put`.
      async putIfUnchanged(
        command: PutDocumentArtifactCommand,
        expectedGeneration: string | null,
      ) {
        if (this.failNextPut) {
          this.failNextPut = false;
          throw Object.assign(new Error("ServiceUnavailable"), {
            name: "ServiceUnavailable",
          });
        }
        return this.inner.putIfUnchanged(command, expectedGeneration);
      }

      get(...args: Parameters<DocumentArtifactStore["get"]>) {
        return this.inner.get(...args);
      }
    }

    const sharedStore = new FailOnceStore();
    const sharedRegistry = new DocumentArtifactRebuildRegistry();

    const podAService = new PlatformAdminService(
      new AuditNotificationService(),
      repository,
      undefined,
      sharedStore,
      sharedRegistry,
    );
    await podAService.onModuleInit();
    const draft = await podAService.generatePlacardVersion({
      versionCode: "placard-r7-followthrough-retry",
      publicInfoVersionId: PUBLIC_INFO_R4.versionId,
      templateName: "seatback-r7-followthrough-retry",
    });
    await repository.persistChanges({ placardVersions: [draft] });

    const podBService = new PlatformAdminService(
      new AuditNotificationService(),
      repository,
      undefined,
      sharedStore,
      sharedRegistry,
    );
    await podBService.onModuleInit();

    sharedStore.failNextPut = true;
    await expect(
      podAService.publishPlacardVersion(draft.placardVersionId),
    ).rejects.toThrow(/ServiceUnavailable/);
    // Pod A's failed attempt must not leave the shared row claimed.
    expect(rows.get(draft.placardVersionId)?.publishedAt).toBeNull();

    const published = await podBService.publishPlacardVersion(
      draft.placardVersionId,
    );
    expect(published.publishedAt).toBeTruthy();
    expect(rows.get(draft.placardVersionId)?.publishedAt).toBe(
      published.publishedAt,
    );

    const stored = await sharedStore.get("placard", draft.placardVersionId);
    expect(stored?.record.sha256).toBe(published.artifactManifestHash);
  });
});

describe("R7-followthrough/R8/R9 (Codex REOPEN, generation 93a28b03b0574b038810ca5c0d435beb): production repository-path regressions for the durable publish claim", () => {
  const STALE_CLAIM_MS = 2 * 60 * 1000;

  type PlacardClaimFixture = PlacardVersionRecord & {
    __publishClaimToken?: string | null;
  };

  function placardFixture(
    overrides: Partial<PlacardClaimFixture> & { placardVersionId: string },
  ): PlacardClaimFixture {
    return {
      versionCode: overrides.placardVersionId,
      publicInfoVersionId: "public-info-fixture",
      templateName: "seatback",
      artifactFileId: `placard-artifact-${overrides.placardVersionId}`,
      artifactManifestHash: "draft-hash",
      artifactDownloadUrl: "https://controlled-download.invalid/draft",
      artifactExpiresAt: null,
      publishedAt: null,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
      downloadMetadata: null,
      ...overrides,
    };
  }

  /**
   * Exercises the REAL `PlatformAdminRepository` (not an interface-level
   * stand-in) against a fake query transport that implements the actual
   * SQL guards this review requires: the `persistChanges` placard upsert's
   * `updated_at <= EXCLUDED.updated_at` fence (R7-followthrough), and
   * `claimPlacardPublish`'s `publishedAt IS NULL OR (stale
   * __publishClaimToken)` claim guard (R8/R9). Only the external query
   * transport is modelled; the repository's own SQL text and parameter
   * binding are exercised for real, same evidentiary shape as this
   * lineage's prior rounds.
   */
  function createRealPlacardRepository(publicInfoVersions: unknown[] = []) {
    const rows = new Map<string, { updatedAt: string; record: any }>();
    // (R10-D) A mutable durable view of public-info versions, seeded from
    // the fixture array but upserted for real by `publishPublicInfoVersion`'s
    // `persistChanges` -- unlike `rows` above (placards), the fixture array
    // alone used to be the only source these tests ever read back, which
    // could never expose a caller reading STALE public info relative to a
    // sibling instance's real publish.
    const publicInfoRows = new Map<string, unknown>(
      publicInfoVersions.map((record: any) => [record.versionId, record]),
    );
    let armedInsertFailure: { error: Error; commits: boolean } | null = null;

    async function query(text: string, values: readonly unknown[] = []) {
      const q = text.replace(/\s+/g, " ").trim();

      if (
        q.startsWith("SELECT record") &&
        q.includes("phase1_public_info_versions")
      ) {
        if (q.includes("WHERE version_id")) {
          const match = publicInfoRows.get(values[0] as string);
          return { rows: match ? [{ record: structuredClone(match) }] : [] };
        }
        return {
          rows: [...publicInfoRows.values()].map((record) => ({
            record: structuredClone(record),
          })),
        };
      }
      if (q.startsWith("INSERT INTO admin.phase1_public_info_versions")) {
        const id = values[0] as string;
        const proposed = JSON.parse(values[4] as string);
        publicInfoRows.set(id, proposed);
        return { rows: [], rowCount: 1 };
      }
      if (
        q.startsWith("SELECT record") &&
        q.includes("phase1_placard_versions")
      ) {
        if (q.includes("WHERE placard_version_id")) {
          const row = rows.get(values[0] as string);
          return { rows: row ? [{ record: structuredClone(row.record) }] : [] };
        }
        return {
          rows: [...rows.values()].map((row) => ({
            record: structuredClone(row.record),
          })),
        };
      }
      if (
        q.startsWith("SELECT record") &&
        (q.includes("phase1_platform_tenants") ||
          q.includes("phase1_platform_adapters"))
      ) {
        return { rows: [] };
      }

      if (q.startsWith("INSERT INTO admin.phase1_placard_versions")) {
        const id = values[0] as string;
        const proposed = JSON.parse(values[5] as string);
        const current = rows.get(id);

        if (q.includes("RETURNING record")) {
          if (armedInsertFailure) {
            const { error, commits } = armedInsertFailure;
            armedInsertFailure = null;
            if (commits) {
              rows.set(id, { updatedAt: values[4] as string, record: proposed });
            }
            throw error;
          }
          const guardOk =
            !current ||
            current.record.publishedAt == null ||
            (current.record.__publishClaimToken != null &&
              Date.now() - Date.parse(current.updatedAt) > STALE_CLAIM_MS);
          if (!guardOk) {
            return { rows: [] };
          }
          rows.set(id, { updatedAt: values[4] as string, record: proposed });
          return { rows: [{ record: structuredClone(proposed) }] };
        }

        // Generic `persistChanges` upsert: only applies when it is not older
        // than whatever is already persisted (R7-followthrough).
        const guardOk =
          !current || Date.parse(current.updatedAt) <= Date.parse(values[4] as string);
        if (guardOk) {
          rows.set(id, { updatedAt: values[4] as string, record: proposed });
        }
        return { rows: [], rowCount: guardOk ? 1 : 0 };
      }

      if (q.startsWith("INSERT INTO admin.phase1_platform_adapters")) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith("UPDATE admin.phase1_placard_versions")) {
        const id = values[0] as string;
        const current = rows.get(id);
        const proposed = JSON.parse(values[2] as string);
        if (values.length === 4) {
          // finalizePlacardPublish: WHERE placard_version_id = $1 AND
          // record->>'__publishClaimToken' = $4
          const ok = current?.record.__publishClaimToken === values[3];
          if (ok) {
            rows.set(id, { updatedAt: values[1] as string, record: proposed });
          }
          return { rows: [], rowCount: ok ? 1 : 0 };
        }
        // releasePlacardPublishClaim: WHERE ... AND publishedAt = $4 AND
        // __publishClaimToken = $5
        const ok =
          current?.record.publishedAt === values[3] &&
          current?.record.__publishClaimToken === values[4];
        if (ok) {
          rows.set(id, { updatedAt: values[1] as string, record: proposed });
        }
        return { rows: [], rowCount: ok ? 1 : 0 };
      }

      throw new Error(`Unexpected SQL in test double: ${q}`);
    }

    const databaseService = {
      isEnabled: () => true,
      query,
    } as unknown as DatabaseService;

    return {
      repository: new PlatformAdminRepository(databaseService),
      rows,
      armNextClaimInsertFailure(error: Error, options: { commits: boolean } = { commits: true }) {
        armedInsertFailure = { error, commits: options.commits };
      },
    };
  }

  describe("R7-followthrough: a late, unconditioned placard write must not regress a newer claim/finalize", () => {
    it("rejects a stale write (older updated_at) against an already-finalized row, and still accepts a genuinely newer one", async () => {
      const { repository } = createRealPlacardRepository();
      const id = "placard_late_draft_guard";
      const finalized = placardFixture({
        placardVersionId: id,
        artifactManifestHash: "final-hash",
        artifactDownloadUrl: "https://controlled-download.invalid/final",
        publishedAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      });
      await repository.persistChanges({ placardVersions: [finalized] });

      // The draft's own fire-and-forget write, modelled landing AFTER the
      // claim/finalize above with its own older `updatedAt` -- exactly the
      // ordering this review's probe B demonstrated.
      const lateDraft = placardFixture({
        placardVersionId: id,
        artifactManifestHash: "draft-hash",
        artifactDownloadUrl: "https://controlled-download.invalid/draft",
        publishedAt: null,
        updatedAt: "2026-04-01T00:00:00.000Z",
      });
      await repository.persistChanges({ placardVersions: [lateDraft] });

      const persisted = await repository.getPlacardVersionRecord(id);
      expect(persisted?.publishedAt).toBe(finalized.publishedAt);
      expect(persisted?.artifactManifestHash).toBe("final-hash");

      const genuinelyNewer = placardFixture({
        placardVersionId: id,
        artifactManifestHash: "newer-hash",
        publishedAt: finalized.publishedAt,
        updatedAt: "2026-04-03T00:00:00.000Z",
      });
      await repository.persistChanges({ placardVersions: [genuinelyNewer] });
      const persistedAfterNewer = await repository.getPlacardVersionRecord(id);
      expect(persistedAfterNewer?.artifactManifestHash).toBe("newer-hash");
    });
  });

  describe("R8: a committed claim whose acknowledgement is lost must be reconciled, not left stuck", () => {
    it("adopts its own committed-but-unacknowledged claim instead of rejecting it", async () => {
      const { repository, rows, armNextClaimInsertFailure } =
        createRealPlacardRepository();
      const id = "placard_lost_ack";
      const claim = placardFixture({
        placardVersionId: id,
        publishedAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
        __publishClaimToken: randomUUID(),
      });
      armNextClaimInsertFailure(new Error("connection reset after commit"));

      const result = await repository.claimPlacardPublish(claim);
      expect(result.claimed).toBe(true);
      expect(result.currentRecord?.placardVersionId).toBe(id);
      expect(rows.get(id)?.record.publishedAt).toBe(claim.publishedAt);
    });

    it("does not fabricate success when the claim genuinely never committed", async () => {
      const { repository, armNextClaimInsertFailure } =
        createRealPlacardRepository();
      const id = "placard_never_committed";
      const claim = placardFixture({
        placardVersionId: id,
        publishedAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
        __publishClaimToken: randomUUID(),
      });
      armNextClaimInsertFailure(
        new Error("connection reset before commit"),
        { commits: false },
      );

      await expect(repository.claimPlacardPublish(claim)).rejects.toThrow(
        /connection reset before commit/,
      );
      expect(await repository.getPlacardVersionRecord(id)).toBeNull();
    });
  });

  describe("R8: bounded abandoned-claim recovery", () => {
    it("reclaims a pending claim once it is stale, but never a fresh pending claim or a finalized row", async () => {
      const { repository, rows } = createRealPlacardRepository();

      const abandonedId = "placard_abandoned_claim";
      const abandonedUpdatedAt = new Date(
        Date.now() - STALE_CLAIM_MS - 60_000,
      ).toISOString();
      rows.set(abandonedId, {
        updatedAt: abandonedUpdatedAt,
        record: placardFixture({
          placardVersionId: abandonedId,
          publishedAt: abandonedUpdatedAt,
          updatedAt: abandonedUpdatedAt,
          __publishClaimToken: randomUUID(),
        }),
      });
      const reclaim = placardFixture({
        placardVersionId: abandonedId,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        __publishClaimToken: randomUUID(),
      });
      const reclaimed = await repository.claimPlacardPublish(reclaim);
      expect(reclaimed.claimed).toBe(true);
      expect(reclaimed.currentRecord?.publishedAt).toBe(reclaim.publishedAt);

      const freshId = "placard_fresh_pending_claim";
      const freshNow = new Date().toISOString();
      rows.set(freshId, {
        updatedAt: freshNow,
        record: placardFixture({
          placardVersionId: freshId,
          publishedAt: freshNow,
          updatedAt: freshNow,
          __publishClaimToken: randomUUID(),
        }),
      });
      const blockedFresh = await repository.claimPlacardPublish(
        placardFixture({
          placardVersionId: freshId,
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          __publishClaimToken: randomUUID(),
        }),
      );
      expect(blockedFresh.claimed).toBe(false);

      const finalizedId = "placard_old_finalized";
      const veryOld = new Date(Date.now() - 10 * STALE_CLAIM_MS).toISOString();
      rows.set(finalizedId, {
        updatedAt: veryOld,
        record: placardFixture({
          placardVersionId: finalizedId,
          publishedAt: veryOld,
          updatedAt: veryOld,
        }),
      });
      const blockedFinalized = await repository.claimPlacardPublish(
        placardFixture({
          placardVersionId: finalizedId,
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          __publishClaimToken: randomUUID(),
        }),
      );
      expect(blockedFinalized.claimed).toBe(false);
    });
  });

  describe("R9: a losing/booting instance must not trust an unfinalized claim snapshot as a completed publish", () => {
    const PUBLIC_INFO_R9 = {
      versionId: "public-info-r9-reader-trust",
      title: "R9 Reader Trust Disclosure",
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

    class DelayedReadbackStore implements DocumentArtifactStore {
      private readonly inner = new InMemoryDocumentArtifactStore();
      private gate: Promise<void> | undefined;
      private skip = 0;
      putCount = 0;

      /**
       * Holds the next `get` call, after letting `skip` of them pass
       * through untouched -- see the R7-followthrough `DelayedReadbackStore`
       * above for why the publish path's own baseline-generation read
       * means the authentic post-write read-back is no longer its first
       * `get` call.
       */
      armNextGet(skip = 0): () => void {
        this.skip = skip;
        let release!: () => void;
        this.gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        return () => release();
      }

      async put(command: PutDocumentArtifactCommand) {
        this.putCount += 1;
        return this.inner.put(command);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.inner.putIfAbsent(...args);
      }

      async putIfUnchanged(
        command: PutDocumentArtifactCommand,
        expectedGeneration: string | null,
      ) {
        this.putCount += 1;
        return this.inner.putIfUnchanged(command, expectedGeneration);
      }

      async get(...args: Parameters<DocumentArtifactStore["get"]>) {
        const result = await this.inner.get(...args);
        if (this.gate) {
          if (this.skip > 0) {
            this.skip -= 1;
          } else {
            const held = this.gate;
            this.gate = undefined;
            await held;
          }
        }
        return result;
      }
    }

    it("a losing pod, and a pod booted mid-claim, both resolve the winner's authoritative bytes after it finalizes -- not their own stale pending snapshot", async () => {
      const { repository } = createRealPlacardRepository([PUBLIC_INFO_R9]);
      const sharedStore = new DelayedReadbackStore();
      const sharedRegistry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        sharedStore,
        sharedRegistry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r9-reader-trust",
        publicInfoVersionId: PUBLIC_INFO_R9.versionId,
        templateName: "seatback-r9",
      });

      const podB = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        sharedStore,
        sharedRegistry,
      );
      await podB.onModuleInit();

      sharedStore.putCount = 0;
      const release = sharedStore.armNextGet(1);
      const publishA = podA.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      expect(sharedStore.putCount).toBe(1);

      // Pod B loses the claim while A's authentic read-back is still held;
      // its own local cache now carries the pending (unfinalized) claim.
      await expect(
        podB.publishPlacardVersion(draft.placardVersionId),
      ).rejects.toMatchObject({ code: "PLACARD_VERSION_ALREADY_PUBLISHED" });

      // A third pod boots while the claim is still pending.
      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        sharedStore,
        sharedRegistry,
      );
      await podC.onModuleInit();

      release();
      const published = await publishA;

      const controller = new ControlledDownloadController(
        sharedStore,
        sharedRegistry,
      );

      for (const [, reader] of [
        ["losing pod", podB],
        ["pod booted during claim", podC],
      ] as const) {
        const fresh = await reader.getPlacardVersion(draft.placardVersionId);
        expect(fresh.artifactManifestHash).toBe(published.artifactManifestHash);
        const file = (await resolve(
          controller,
          "placard",
          draft.placardVersionId,
          paramsOf(fresh.artifactDownloadUrl!),
        )) as unknown as StreamableFileLike;
        const bytes = await drain(file.getStream());
        expect(sha256(bytes)).toBe(published.artifactManifestHash);
      }
    });
  });

  describe("R7-followthrough: a stale reader's source-drift recovery write must not erase a sibling's already-finalized publication", () => {
    const PUBLIC_INFO_R7_RECOVERY = {
      versionId: "public-info-r7-recovery-erase",
      title: "R7 Recovery Erase Disclosure",
      callPhone: "0800-020-020",
      complaintPhone: "0800-020-030",
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

    /**
     * Models a `get` whose underlying lookup genuinely returns "missing"
     * (the real entry condition `rebuildPlacardArtifact` recovers from), but
     * whose delivery to the caller is held open -- an authentic NoSuchKey
     * response that simply has not reached the caller yet. Only the FIRST
     * missing result is held; everything after (including the rebuild
     * path's own re-check) resolves immediately.
     */
    class DelayedMissingObjectStore implements DocumentArtifactStore {
      readonly inner = new InMemoryDocumentArtifactStore();
      private gate: Promise<void> | undefined;

      armNextMissingGet(): () => void {
        let release!: () => void;
        this.gate = new Promise((resolve) => {
          release = resolve;
        });
        return () => release();
      }

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.inner.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.inner.putIfAbsent(...args);
      }

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.inner.putIfUnchanged(...args);
      }

      async get(...args: Parameters<DocumentArtifactStore["get"]>) {
        const result = await this.inner.get(...args);
        if (result === null && this.gate) {
          const held = this.gate;
          this.gate = undefined;
          await held;
        }
        return result;
      }
    }

    it("denies the stale GET but keeps the durable row's publishedAt/hash exactly as the finalizing sibling left them", async () => {
      const { repository } = createRealPlacardRepository([
        PUBLIC_INFO_R7_RECOVERY,
      ]);
      const sharedStore = new DelayedMissingObjectStore();
      const sharedRegistry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        sharedStore,
        sharedRegistry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r7-recovery-erase",
        publicInfoVersionId: PUBLIC_INFO_R7_RECOVERY.versionId,
        templateName: "seatback-r7-recovery",
      });

      // Pod B boots from the same durable draft row; its own in-memory copy
      // is -- correctly, at this moment -- a plain unpublished draft.
      const podB = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        sharedStore,
        sharedRegistry,
      );
      await podB.onModuleInit();

      // The object is genuinely absent -- the supported recovery entry
      // condition, not a hash mismatch against something that does exist.
      (
        sharedStore.inner as unknown as { entries: Map<string, unknown> }
      ).entries.delete(`placard::${draft.placardVersionId}`);

      const controller = new ControlledDownloadController(
        sharedStore,
        sharedRegistry,
      );
      const release = sharedStore.armNextMissingGet();
      const staleRecovery = resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(draft.artifactDownloadUrl!),
      );
      await new Promise((r) => setTimeout(r, 10));

      // While B's missing-object determination is held in flight, A
      // publishes and finalizes successfully -- its link and bytes are
      // genuinely good.
      const published = await podA.publishPlacardVersion(
        draft.placardVersionId,
      );
      const publishedFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(publishedFile.getStream()))).toBe(
        published.artifactManifestHash,
      );

      // Deliver B's already-captured miss. Its own stale draft snapshot
      // (publishedAt still null) is not proof of what the durable row
      // actually holds now; the link it names can never match A's
      // published bytes, so the GET itself is correctly denied.
      release();
      await expect(staleRecovery).rejects.toMatchObject({
        code: "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH",
      });

      // The regression under review: B's recovery write must not have
      // regressed the durable row back to unpublished just because its own
      // write carried a newer wall-clock `updatedAt`.
      const persisted = await repository.getPlacardVersionRecord(
        draft.placardVersionId,
      );
      expect(persisted?.publishedAt).toBe(published.publishedAt);
      expect(persisted?.artifactManifestHash).toBe(
        published.artifactManifestHash,
      );

      // A's own link must still be valid, and the placard must still be
      // reported as published everywhere -- a second publish attempt must
      // still be rejected, not allowed to invalidate A's publication.
      await expect(
        podB.publishPlacardVersion(draft.placardVersionId),
      ).rejects.toMatchObject({ code: "PLACARD_VERSION_ALREADY_PUBLISHED" });
      const refetchedFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(refetchedFile.getStream()))).toBe(
        published.artifactManifestHash,
      );
    });
  });

  describe("R8-followthrough: an instance booted after an abandoned claim must still reach the repository's reclaim guard through the actual service entry point", () => {
    const PUBLIC_INFO_R8_RESTART = {
      versionId: "public-info-r8-restart-reclaim",
      title: "R8 Restart Reclaim Disclosure",
      callPhone: "0800-030-030",
      complaintPhone: "0800-030-040",
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

    it("lets a freshly booted instance reclaim a stale (>2 minute) pending claim instead of rejecting it from cache alone", async () => {
      const { repository, rows } = createRealPlacardRepository([
        PUBLIC_INFO_R8_RESTART,
      ]);
      const store = new InMemoryDocumentArtifactStore();
      const registry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r8-restart-reclaim",
        publicInfoVersionId: PUBLIC_INFO_R8_RESTART.versionId,
        templateName: "seatback-r8-restart",
      });

      // A takes a real claim via the actual repository, then is modelled as
      // crashed/lost before it ever finalizes or releases it -- the only
      // trace left is the stale, still-pending row itself.
      const abandonedClaim = {
        ...draft,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        __publishClaimToken: randomUUID(),
      } as PlacardVersionRecord & { __publishClaimToken: string };
      const claimed = await repository.claimPlacardPublish(abandonedClaim);
      expect(claimed.claimed).toBe(true);

      // Age the row past the 2-minute abandonment window the repository's
      // own `claimPlacardPublish` guard uses, exactly as a real crashed
      // claim would look after enough wall-clock time has passed.
      const row = rows.get(draft.placardVersionId)!;
      row.updatedAt = new Date(Date.now() - 3 * 60_000).toISOString();

      // A restarted/freshly-booted instance boots AFTER the abandoned
      // claim: its very first in-memory copy of this placard already has
      // `publishedAt` set (from the pending claim), never having published
      // anything itself.
      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await podC.onModuleInit();
      // Pod C's very first in-memory copy of this placard already carries
      // `publishedAt` from the abandoned claim -- confirmed indirectly
      // below: the old bug rejected this publish from that cached value
      // alone, with zero repository claim calls.
      const before = rows.get(draft.placardVersionId)?.updatedAt;

      const published = await podC.publishPlacardVersion(
        draft.placardVersionId,
      );
      expect(published.publishedAt).toBeTruthy();

      const persisted = await repository.getPlacardVersionRecord(
        draft.placardVersionId,
      );
      expect(persisted?.publishedAt).toBe(published.publishedAt);
      expect((persisted as any)?.__publishClaimToken).toBeUndefined();
      // A genuine reclaim write happened at the service boundary, not a
      // no-op fallthrough on the stale cached value.
      expect(rows.get(draft.placardVersionId)?.updatedAt).not.toBe(before);
    });

    it("still rejects a restarted instance's publish attempt while the pending claim is genuinely fresh (not yet abandoned)", async () => {
      const { repository } = createRealPlacardRepository([
        PUBLIC_INFO_R8_RESTART,
      ]);
      const store = new InMemoryDocumentArtifactStore();
      const registry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r8-restart-fresh-claim",
        publicInfoVersionId: PUBLIC_INFO_R8_RESTART.versionId,
        templateName: "seatback-r8-restart-fresh",
      });

      // Claim left genuinely fresh -- not aged past the 2-minute window --
      // so this is NOT an abandoned claim; reclaim must stay blocked.
      const freshClaim = {
        ...draft,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        __publishClaimToken: randomUUID(),
      } as PlacardVersionRecord & { __publishClaimToken: string };
      await repository.claimPlacardPublish(freshClaim);

      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await podC.onModuleInit();

      await expect(
        podC.publishPlacardVersion(draft.placardVersionId),
      ).rejects.toMatchObject({ code: "PLACARD_VERSION_ALREADY_PUBLISHED" });
    });
  });

  describe("R7/R8 byte-ownership fix: a stale owner's delayed object write must not replace a reclaimed-and-finalized winner's bytes", () => {
    const PUBLIC_INFO_R7R8_BYTES = {
      versionId: "public-info-r7r8-byte-ownership",
      title: "R7/R8 Byte Ownership Disclosure",
      callPhone: "0800-040-040",
      complaintPhone: "0800-040-050",
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

    /**
     * Holds a `putIfUnchanged` call's entire execution -- precondition
     * evaluation AND write, not merely delivery of an already-decided
     * response -- until released, for exactly one matching subjectId. This
     * is what models a real `PutObjectCommand` that has not yet reached the
     * transport (the task's "hold its genuine S3 PutObjectCommand BEFORE
     * the transport commits it"): the fencing check inside `inner`'s own
     * `putIfUnchanged` only runs against whatever the store actually holds
     * at RELEASE time, which may have changed while this call sat held.
     */
    class HeldWriteDocumentArtifactStore implements DocumentArtifactStore {
      readonly inner = new InMemoryDocumentArtifactStore();
      private holdSubjectId: string | null = null;
      private gate: Promise<void> | undefined;

      holdNextWriteFor(subjectId: string): () => void {
        this.holdSubjectId = subjectId;
        let release!: () => void;
        this.gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        return () => release();
      }

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.inner.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.inner.putIfAbsent(...args);
      }

      async putIfUnchanged(
        command: PutDocumentArtifactCommand,
        expectedGeneration: string | null,
      ) {
        if (this.holdSubjectId === command.subjectId && this.gate) {
          const held = this.gate;
          this.holdSubjectId = null;
          this.gate = undefined;
          await held;
        }
        return this.inner.putIfUnchanged(command, expectedGeneration);
      }

      get(...args: Parameters<DocumentArtifactStore["get"]>) {
        return this.inner.get(...args);
      }
    }

    it("fences out a stale owner's write that resumes after a reclaimed claim finalizes -- the winner's bytes, DB row, original link and a freshly issued link all stay correct", async () => {
      const { repository, rows } = createRealPlacardRepository([
        PUBLIC_INFO_R7R8_BYTES,
      ]);
      const store = new HeldWriteDocumentArtifactStore();
      const registry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r7r8-byte-ownership",
        publicInfoVersionId: PUBLIC_INFO_R7R8_BYTES.versionId,
        templateName: "seatback-r7r8-byte-ownership",
      });

      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await podC.onModuleInit();

      // A claims publication and starts rendering/writing; its own
      // PutObjectCommand is held BEFORE it reaches the transport.
      const release = store.holdNextWriteFor(draft.placardVersionId);
      const publishA = podA.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const claimedRow = rows.get(draft.placardVersionId);
      expect(claimedRow?.record.publishedAt).toBeTruthy();
      expect(claimedRow?.record.__publishClaimToken).toBeTruthy();

      // Age A's claim past the repository's 2-minute abandonment window --
      // A is modelled as stalled in flight, not crashed, but the guard only
      // looks at elapsed time, exactly like a real abandoned claim.
      claimedRow!.updatedAt = new Date(Date.now() - 3 * 60_000).toISOString();

      // C reclaims the now-stale claim, renders, writes and finalizes for
      // real -- A's own write has not landed yet, so C's baseline read
      // still observes the plain draft object, same as A's did.
      const published = await podC.publishPlacardVersion(
        draft.placardVersionId,
      );
      expect(published.publishedAt).toBeTruthy();
      expect(rows.get(draft.placardVersionId)?.record.__publishClaimToken).toBeUndefined();

      // Only now does A's held write actually reach the store -- AFTER C
      // has already finalized. A's baseline (the plain draft's generation)
      // no longer matches what C just wrote, so the store itself refuses
      // the write instead of silently replacing C's bytes.
      release();
      await expect(publishA).rejects.toMatchObject({
        code: "PLACARD_PUBLISH_CONFLICT",
      });

      // The durable row still reflects C's finalize, untouched by A's
      // rejected, superseded write.
      const persisted = rows.get(draft.placardVersionId);
      expect(persisted?.record.publishedAt).toBe(published.publishedAt);
      expect(persisted?.record.artifactManifestHash).toBe(
        published.artifactManifestHash,
      );

      // The actual stored bytes are C's, not corrupted by A's rejected
      // write -- the core regression this fix closes.
      const stored = await store.get("placard", draft.placardVersionId);
      expect(stored?.record.sha256).toBe(published.artifactManifestHash);

      // C's own successful link still resolves to the exact bytes it names.
      const controller = new ControlledDownloadController(store, registry);
      const winnerFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(winnerFile.getStream()))).toBe(
        published.artifactManifestHash,
      );

      // A freshly booted, independent reader -- never itself a claimant --
      // resolves the same winning bytes via its own freshly issued link.
      const freshReader = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await freshReader.onModuleInit();
      const fresh = await freshReader.getPlacardVersion(
        draft.placardVersionId,
      );
      expect(fresh.artifactManifestHash).toBe(published.artifactManifestHash);
      const freshFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(fresh.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(freshFile.getStream()))).toBe(
        published.artifactManifestHash,
      );
    });
  });

  describe("R9 additional reader gap: an ordinary reader booted before any claim must still discover a sibling's finalized publish", () => {
    const PUBLIC_INFO_R9_ORDINARY = {
      versionId: "public-info-r9-ordinary-reader",
      title: "R9 Ordinary Reader Disclosure",
      callPhone: "0800-040-040",
      complaintPhone: "0800-040-050",
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

    it("a sibling booted before the claim and never itself publishing still resolves the finalized metadata on its next get", async () => {
      const { repository } = createRealPlacardRepository([
        PUBLIC_INFO_R9_ORDINARY,
      ]);
      const sharedStore = new InMemoryDocumentArtifactStore();
      const sharedRegistry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        sharedStore,
        sharedRegistry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r9-ordinary-reader",
        publicInfoVersionId: PUBLIC_INFO_R9_ORDINARY.versionId,
        templateName: "seatback-r9-ordinary",
      });

      // Pod D boots BEFORE any publish claim is ever taken -- a plain
      // draft reader that never itself attempts to publish.
      const podD = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        sharedStore,
        sharedRegistry,
      );
      await podD.onModuleInit();

      const published = await podA.publishPlacardVersion(
        draft.placardVersionId,
      );

      // D never saw a claim token and never called publish itself; its own
      // next get/list must still resolve the authoritative finalized
      // metadata, not keep signing its original draft hash forever.
      const fresh = await podD.getPlacardVersion(draft.placardVersionId);
      expect(fresh.publishedAt).toBe(published.publishedAt);
      expect(fresh.artifactManifestHash).toBe(published.artifactManifestHash);

      const controller = new ControlledDownloadController(
        sharedStore,
        sharedRegistry,
      );
      const file = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(fresh.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(file.getStream()))).toBe(
        published.artifactManifestHash,
      );
    });
  });

  describe("R10 byte-ownership compensating restore (Codex REOPEN, generation 8b3a794454664b3d858cd10a63e00948): a stale owner's delayed BASELINE READ must not let its later write replace a reclaimed-and-finalized winner's bytes", () => {
    const PUBLIC_INFO_R10_BASELINE_GET = {
      versionId: "public-info-r10-baseline-get",
      title: "R10 Baseline Get Disclosure",
      callPhone: "0800-040-040",
      complaintPhone: "0800-040-050",
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

    /**
     * Holds a `get` call's entire execution -- not merely delivery of an
     * already-decided response -- until released, for exactly one matching
     * subjectId. This is what models a real `GetObjectCommand` that has not
     * yet reached the transport: the R7/R8 byte-ownership fix's own
     * `baselineArtifact` read (`publishPlacardVersionExclusive`, captured
     * before `ensurePlacardArtifact`'s fenced write) only observes whatever
     * the store actually holds at RELEASE time, which can be a sibling
     * instance's reclaim-and-finalize that happened entirely while this read
     * sat held -- the exact gap the prior fix's own `fenceGeneration` write
     * cannot see, because by the time the write runs, its baseline already
     * (legitimately, from the write's own point of view) matches the
     * winner's current generation.
     */
    class HeldGetDocumentArtifactStore implements DocumentArtifactStore {
      readonly inner = new InMemoryDocumentArtifactStore();
      private holdSubjectId: string | null = null;
      private gate: Promise<void> | undefined;

      holdNextGetFor(subjectId: string): () => void {
        this.holdSubjectId = subjectId;
        let release!: () => void;
        this.gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        return () => release();
      }

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.inner.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.inner.putIfAbsent(...args);
      }

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.inner.putIfUnchanged(...args);
      }

      async get(...args: Parameters<DocumentArtifactStore["get"]>) {
        const [, subjectId] = args;
        if (this.holdSubjectId === subjectId && this.gate) {
          const held = this.gate;
          this.holdSubjectId = null;
          this.gate = undefined;
          await held;
        }
        return this.inner.get(...args);
      }
    }

    it("fences out a stale owner's write whose baseline read resumes after a reclaimed claim finalizes -- the winner's bytes, DB row, original link and a freshly issued link all stay correct", async () => {
      const { repository, rows } = createRealPlacardRepository([
        PUBLIC_INFO_R10_BASELINE_GET,
      ]);
      const store = new HeldGetDocumentArtifactStore();
      const registry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r10-baseline-get",
        publicInfoVersionId: PUBLIC_INFO_R10_BASELINE_GET.versionId,
        templateName: "seatback-r10-baseline-get",
      });

      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await podC.onModuleInit();

      // A claims publication and starts its own baseline read -- the first
      // `get` this test allows to run for this subjectId is held BEFORE it
      // reaches the transport, i.e. before A has any idea what the store
      // actually holds.
      const release = store.holdNextGetFor(draft.placardVersionId);
      const publishA = podA.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const claimedRow = rows.get(draft.placardVersionId);
      expect(claimedRow?.record.publishedAt).toBeTruthy();
      expect(claimedRow?.record.__publishClaimToken).toBeTruthy();

      // Age A's claim past the repository's 2-minute abandonment window --
      // A is modelled as stalled in flight, not crashed, but the guard only
      // looks at elapsed time, exactly like a real abandoned claim.
      claimedRow!.updatedAt = new Date(Date.now() - 3 * 60_000).toISOString();

      // C reclaims the now-stale claim, renders, writes and finalizes for
      // real -- entirely while A's baseline read sits held, never having
      // observed any of it yet.
      const published = await podC.publishPlacardVersion(
        draft.placardVersionId,
      );
      expect(published.publishedAt).toBeTruthy();
      expect(
        rows.get(draft.placardVersionId)?.record.__publishClaimToken,
      ).toBeUndefined();

      // Only now does A's baseline read actually reach the store -- AFTER C
      // has already finalized. A observes C's own finalized generation as
      // "the current state", so its own fenced write legitimately succeeds
      // against that baseline and clobbers C's bytes -- UNLESS the
      // compensating restore below closes that gap.
      release();
      await expect(publishA).rejects.toMatchObject({
        code: "PLACARD_PUBLISH_CONFLICT",
      });

      // The durable row still reflects C's finalize, untouched by A's
      // rejected, superseded write.
      const persisted = rows.get(draft.placardVersionId);
      expect(persisted?.record.publishedAt).toBe(published.publishedAt);
      expect(persisted?.record.artifactManifestHash).toBe(
        published.artifactManifestHash,
      );

      // The actual stored bytes are C's, not A's -- even though A's own
      // write legitimately passed its own (stale) fence check, the
      // compensating restore put C's observed bytes straight back once the
      // DB-level finalize told A it had actually lost.
      const stored = await store.get("placard", draft.placardVersionId);
      expect(stored?.record.sha256).toBe(published.artifactManifestHash);

      // C's own successful link still resolves to the exact bytes it names.
      const controller = new ControlledDownloadController(store, registry);
      const winnerFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(winnerFile.getStream()))).toBe(
        published.artifactManifestHash,
      );

      // A freshly booted, independent reader -- never itself a claimant --
      // resolves the same winning bytes via its own freshly issued link.
      const freshReader = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await freshReader.onModuleInit();
      const fresh = await freshReader.getPlacardVersion(
        draft.placardVersionId,
      );
      expect(fresh.artifactManifestHash).toBe(published.artifactManifestHash);
      const freshFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(fresh.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(freshFile.getStream()))).toBe(
        published.artifactManifestHash,
      );
    });
  });

  describe("R10-A byte-ownership compensation must survive a failed post-write verification read (Codex REOPEN, generation 9f5f14e9954f4ee9bbb2cb629880b777)", () => {
    const PUBLIC_INFO_R10A_READBACK_FAILURE = {
      versionId: "public-info-r10a-readback-failure",
      title: "R10-A Readback Failure Disclosure",
      callPhone: "0800-040-040",
      complaintPhone: "0800-040-050",
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

    /**
     * Holds the FIRST `get()` call for a given subjectId (the baseline
     * read, same shape as `HeldGetDocumentArtifactStore` above) and, once
     * armed, makes the very NEXT `get()` call after that (the post-write
     * verification read, `storedEntry` in
     * `publishPlacardVersionExclusive`) throw a modeled transport error
     * instead of reaching the backing store at all -- the real S3 adapter
     * propagates a `GetObjectCommand` transport failure exactly like this,
     * not as a handled "missing"/"condition failed" response.
     */
    class HeldThenFailingGetDocumentArtifactStore implements DocumentArtifactStore {
      readonly inner = new InMemoryDocumentArtifactStore();
      private holdSubjectId: string | null = null;
      private gate: Promise<void> | undefined;
      private failSubjectId: string | null = null;

      holdNextGetFor(subjectId: string): () => void {
        this.holdSubjectId = subjectId;
        let release!: () => void;
        this.gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        return () => release();
      }

      failNextGetFor(subjectId: string): void {
        this.failSubjectId = subjectId;
      }

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.inner.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.inner.putIfAbsent(...args);
      }

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.inner.putIfUnchanged(...args);
      }

      async get(...args: Parameters<DocumentArtifactStore["get"]>) {
        const [, subjectId] = args;
        if (this.holdSubjectId === subjectId && this.gate) {
          const held = this.gate;
          this.holdSubjectId = null;
          this.gate = undefined;
          await held;
          // The call that was HELD is the baseline read itself -- once
          // released, it must resolve normally. The fail-trigger below is
          // for the NEXT, separate `get()` call (the post-write
          // verification read), not a second check on this same one.
          return this.inner.get(...args);
        }
        if (this.failSubjectId === subjectId) {
          this.failSubjectId = null;
          throw Object.assign(new Error("MODELED_S3_READBACK_UNAVAILABLE"), {
            name: "ModeledTransportError",
          });
        }
        return this.inner.get(...args);
      }
    }

    it("repairs the object back to the real winner's bytes even though this attempt's own post-write verification read fails with a transport error, not a clean finalize rejection", async () => {
      const { repository, rows } = createRealPlacardRepository([
        PUBLIC_INFO_R10A_READBACK_FAILURE,
      ]);
      const store = new HeldThenFailingGetDocumentArtifactStore();
      const registry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r10a-readback-failure",
        publicInfoVersionId: PUBLIC_INFO_R10A_READBACK_FAILURE.versionId,
        templateName: "seatback-r10a-readback-failure",
      });

      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await podC.onModuleInit();

      // A claims and starts its own baseline read -- held before it reaches
      // the transport, same as the R10 baseline-GET case above.
      const releaseBaseline = store.holdNextGetFor(draft.placardVersionId);
      const publishA = podA.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const claimedRow = rows.get(draft.placardVersionId);
      expect(claimedRow?.record.publishedAt).toBeTruthy();
      expect(claimedRow?.record.__publishClaimToken).toBeTruthy();

      claimedRow!.updatedAt = new Date(Date.now() - 3 * 60_000).toISOString();

      // C reclaims the now-stale claim, renders, writes and finalizes for
      // real -- entirely while A's baseline read sits held.
      const published = await podC.publishPlacardVersion(
        draft.placardVersionId,
      );
      expect(published.publishedAt).toBeTruthy();

      // Arm A's NEXT get call (its post-write verification read) to fail
      // with a transport error, then release A's held baseline. A reads
      // C's finalized state as its baseline, its own fenced write
      // legitimately lands on top of it (overwriting C's bytes), and then
      // its verification read throws instead of returning cleanly -- the
      // exact trigger this round's reopen reproduced against the locked
      // candidate.
      store.failNextGetFor(draft.placardVersionId);
      releaseBaseline();
      await expect(publishA).rejects.toThrow("MODELED_S3_READBACK_UNAVAILABLE");

      // The durable row still reflects C's finalize -- A never got far
      // enough to even attempt `finalizePlacardPublish`.
      const persisted = rows.get(draft.placardVersionId);
      expect(persisted?.record.publishedAt).toBe(published.publishedAt);
      expect(persisted?.record.artifactManifestHash).toBe(
        published.artifactManifestHash,
      );

      // The actual stored bytes are C's again, not A's -- the generic
      // `catch` path's own call to `repairPlacardArtifactAfterLostClaim`
      // closed the gap a transport failure on the verification read used
      // to leave open.
      const stored = await store.get("placard", draft.placardVersionId);
      expect(stored?.record.sha256).toBe(published.artifactManifestHash);

      const controller = new ControlledDownloadController(store, registry);
      const winnerFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(winnerFile.getStream()))).toBe(
        published.artifactManifestHash,
      );

      const freshReader = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        store,
        registry,
      );
      await freshReader.onModuleInit();
      const fresh = await freshReader.getPlacardVersion(
        draft.placardVersionId,
      );
      expect(fresh.artifactManifestHash).toBe(published.artifactManifestHash);
      const freshFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(fresh.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(freshFile.getStream()))).toBe(
        published.artifactManifestHash,
      );
    });
  });

  describe("R10-B overlapping compensations from two independently superseded attempts must not durably restore a loser's bytes (Codex REOPEN, generation 9f5f14e9954f4ee9bbb2cb629880b777)", () => {
    const PUBLIC_INFO_R10B_OVERLAPPING = {
      versionId: "public-info-r10b-overlapping",
      title: "R10-B Overlapping Compensation Disclosure",
      callPhone: "0800-040-040",
      complaintPhone: "0800-040-050",
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

    /**
     * One pod's view of a shared backing store: holds its OWN first `get()`
     * call (the baseline read) and its OWN second `get()` call (the
     * post-write verification read) independently, each until explicitly
     * released. Three instances of this class, sharing one
     * `InMemoryDocumentArtifactStore` backing, model three Cloud Run pods
     * against one real bucket -- exactly like the three separately
     * intercepted `store(label)` instances in this reopen's own read-only
     * production-path probe.
     */
    class PerPodArtifactStore implements DocumentArtifactStore {
      private getCount = 0;
      private baselineGate: Promise<void> | null = null;
      private verifyGate: Promise<void> | null = null;

      constructor(private readonly backing: DocumentArtifactStore) {}

      holdBaseline(): () => void {
        let release!: () => void;
        this.baselineGate = new Promise<void>((resolve) => {
          release = resolve;
        });
        return () => release();
      }

      holdVerification(): () => void {
        let release!: () => void;
        this.verifyGate = new Promise<void>((resolve) => {
          release = resolve;
        });
        return () => release();
      }

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.backing.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.backing.putIfAbsent(...args);
      }

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.backing.putIfUnchanged(...args);
      }

      async get(...args: Parameters<DocumentArtifactStore["get"]>) {
        this.getCount += 1;
        if (this.getCount === 1 && this.baselineGate) {
          await this.baselineGate;
        } else if (this.getCount === 2 && this.verifyGate) {
          await this.verifyGate;
        }
        return this.backing.get(...args);
      }
    }

    it("two independently superseded attempts (A, then B) overlapping their own compensations still leave the real winner's (C) bytes in place, with zero transport failures", async () => {
      const { repository, rows } = createRealPlacardRepository([
        PUBLIC_INFO_R10B_OVERLAPPING,
      ]);
      const backing = new InMemoryDocumentArtifactStore();
      const storeA = new PerPodArtifactStore(backing);
      const storeB = new PerPodArtifactStore(backing);
      const storeC = new PerPodArtifactStore(backing);
      const registry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        storeA,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r10b-overlapping",
        publicInfoVersionId: PUBLIC_INFO_R10B_OVERLAPPING.versionId,
        templateName: "seatback-r10b-overlapping",
      });

      const podB = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        storeB,
        registry,
      );
      await podB.onModuleInit();
      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        storeC,
        registry,
      );
      await podC.onModuleInit();

      // A claims; both its baseline read and its post-write verification
      // read are held before either reaches the transport.
      const releaseABaseline = storeA.holdBaseline();
      const releaseAVerify = storeA.holdVerification();
      const publishA = podA.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const afterA = rows.get(draft.placardVersionId);
      expect(afterA?.record.__publishClaimToken).toBeTruthy();
      afterA!.updatedAt = new Date(Date.now() - 3 * 60_000).toISOString();

      // B reclaims A's now-stale claim; both its own reads are held too.
      const releaseBBaseline = storeB.holdBaseline();
      const releaseBVerify = storeB.holdVerification();
      const publishB = podB.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const afterB = rows.get(draft.placardVersionId);
      expect(afterB?.record.__publishClaimToken).toBeTruthy();
      expect(afterB?.record.__publishClaimToken).not.toBe(
        afterA?.record.__publishClaimToken,
      );
      afterB!.updatedAt = new Date(Date.now() - 3 * 60_000).toISOString();

      // C reclaims B's now-stale claim and finalizes for real -- no holds
      // on C's own store, so this runs to completion normally.
      const published = await podC.publishPlacardVersion(
        draft.placardVersionId,
      );
      expect(published.publishedAt).toBeTruthy();
      expect(
        (await backing.get("placard", draft.placardVersionId))?.record.sha256,
      ).toBe(published.artifactManifestHash);

      // Release A's baseline: A reads C's finalized state, its own fenced
      // write legitimately lands on top of it (overwriting C's bytes), then
      // A's verification read sits held in turn.
      releaseABaseline();
      await new Promise((r) => setTimeout(r, 10));
      const afterAWrite = await backing.get("placard", draft.placardVersionId);
      expect(afterAWrite?.record.sha256).not.toBe(published.artifactManifestHash);

      // Release B's baseline: B reads A's (wrong) bytes as ITS baseline,
      // and its own fenced write legitimately lands on top of THAT
      // (overwriting A's bytes with B's), then B's verification read sits
      // held too. This is the overlap: B's own "what I observed before I
      // wrote" is already a different loser's corruption, not the real
      // winner's bytes -- restoring it verbatim (the pre-fix design) would
      // durably reinstate that corruption.
      releaseBBaseline();
      await new Promise((r) => setTimeout(r, 10));
      const afterBWrite = await backing.get("placard", draft.placardVersionId);
      expect(afterBWrite?.record.sha256).not.toBe(published.artifactManifestHash);
      expect(afterBWrite?.record.sha256).not.toBe(afterAWrite?.record.sha256);

      // Deliver A's verification read-back, then B's: both discover they
      // were superseded and both compensate.
      releaseAVerify();
      releaseBVerify();
      const [resultA, resultB] = await Promise.allSettled([publishA, publishB]);
      expect(resultA.status).toBe("rejected");
      expect(resultB.status).toBe("rejected");
      expect((resultA as PromiseRejectedResult).reason).toMatchObject({
        code: "PLACARD_PUBLISH_CONFLICT",
      });
      expect((resultB as PromiseRejectedResult).reason).toMatchObject({
        code: "PLACARD_PUBLISH_CONFLICT",
      });

      // Every publish has settled with zero transport failures. The DB row
      // still names C, and -- the core regression this fix closes -- the
      // actual stored bytes are C's too, not A's or B's, despite two
      // overlapping compensations landing in between.
      const persisted = rows.get(draft.placardVersionId);
      expect(persisted?.record.artifactManifestHash).toBe(
        published.artifactManifestHash,
      );
      const stored = await backing.get("placard", draft.placardVersionId);
      expect(stored?.record.sha256).toBe(published.artifactManifestHash);

      const controller = new ControlledDownloadController(backing, registry);
      const winnerFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(winnerFile.getStream()))).toBe(
        published.artifactManifestHash,
      );

      const freshReader = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        backing,
        registry,
      );
      await freshReader.onModuleInit();
      const fresh = await freshReader.getPlacardVersion(
        draft.placardVersionId,
      );
      expect(fresh.artifactManifestHash).toBe(published.artifactManifestHash);
      const freshFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(fresh.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(freshFile.getStream()))).toBe(
        published.artifactManifestHash,
      );
    });
  });

  describe("R10-C a still-pending successor's own eventual successful finalize must repair a stale loser's intervening overwrite (Codex REOPEN, generation ac45f6a18eb347a397a7f5faf84f00d7)", () => {
    const PUBLIC_INFO_R10C = {
      versionId: "public-info-r10c-pending-successor",
      title: "R10-C Pending Successor Disclosure",
      callPhone: "0800-040-040",
      complaintPhone: "0800-040-050",
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

    /**
     * One pod's view of a shared backing store whose hold points are
     * addressable independently as BEFORE or AFTER the real backing call
     * for a given `get()` ordinal. Unlike R10-B's `PerPodArtifactStore`
     * (which only holds BEFORE each call), R10-C needs C's own
     * verification read to actually execute against the backing store --
     * snapshotting C's own just-written bytes -- before delivery of that
     * response is held, exactly like this reopen's own read-only
     * production-path probe's `intercept(... , 'after')` hook.
     */
    class OrdinalHoldArtifactStore implements DocumentArtifactStore {
      private getCount = 0;
      private readonly beforeGates = new Map<number, Promise<void>>();
      private readonly afterGates = new Map<number, Promise<void>>();

      constructor(private readonly backing: DocumentArtifactStore) {}

      holdBefore(callOrdinal: number): () => void {
        let release!: () => void;
        this.beforeGates.set(
          callOrdinal,
          new Promise<void>((resolve) => {
            release = resolve;
          }),
        );
        return () => release();
      }

      holdAfter(callOrdinal: number): () => void {
        let release!: () => void;
        this.afterGates.set(
          callOrdinal,
          new Promise<void>((resolve) => {
            release = resolve;
          }),
        );
        return () => release();
      }

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.backing.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.backing.putIfAbsent(...args);
      }

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.backing.putIfUnchanged(...args);
      }

      async get(...args: Parameters<DocumentArtifactStore["get"]>) {
        this.getCount += 1;
        const ordinal = this.getCount;
        const before = this.beforeGates.get(ordinal);
        if (before) await before;
        const result = await this.backing.get(...args);
        const after = this.afterGates.get(ordinal);
        if (after) await after;
        return result;
      }
    }

    it("repairs a stale loser's intervening overwrite once the ACTUAL winner's own delayed finalize finally commits", async () => {
      const { repository, rows } = createRealPlacardRepository([
        PUBLIC_INFO_R10C,
      ]);
      const backing = new InMemoryDocumentArtifactStore();
      const storeA = new OrdinalHoldArtifactStore(backing);
      const storeC = new OrdinalHoldArtifactStore(backing);
      const registry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        storeA,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r10c-pending-successor",
        publicInfoVersionId: PUBLIC_INFO_R10C.versionId,
        templateName: "seatback-r10c-pending-successor",
      });

      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        storeC,
        registry,
      );
      await podC.onModuleInit();

      // A claims and stalls its own baseline read (call #1) before it even
      // reaches the backing store.
      const releaseABaseline = storeA.holdBefore(1);
      const publishA = podA.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const afterA = rows.get(draft.placardVersionId);
      expect(afterA?.record.__publishClaimToken).toBeTruthy();
      afterA!.updatedAt = new Date(Date.now() - 3 * 60_000).toISOString();

      // C reclaims A's now-stale claim, writes its own PDF for real, and
      // its own post-write verification read (call #2) genuinely executes
      // against the backing store -- snapshotting C's own just-written
      // bytes -- but delivery of that response is held before C can reach
      // its own finalize.
      const releaseCVerify = storeC.holdAfter(2);
      const publishC = podC.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const afterC = rows.get(draft.placardVersionId);
      expect(afterC?.record.__publishClaimToken).toBeTruthy();
      expect(afterC?.record.__publishClaimToken).not.toBe(
        afterA?.record.__publishClaimToken,
      );
      const cBytesWhileHeld = await backing.get(
        "placard",
        draft.placardVersionId,
      );
      const cHash = cBytesWhileHeld!.record.sha256;

      // Release A's baseline: it reads C's current (just-written) state, so
      // its own fenced write legitimately lands on top of it, overwriting
      // C's bytes with A's. A's own (unheld) verification read sees its own
      // write and passes, but A's finalize then loses the DB race -- C's
      // reclaim already moved the row's claim token -- and A's own repair
      // sees C's still-pending claim token and correctly no-ops.
      releaseABaseline();
      await expect(publishA).rejects.toMatchObject({
        code: "PLACARD_PUBLISH_CONFLICT",
      });
      const afterAOverwrite = await backing.get(
        "placard",
        draft.placardVersionId,
      );
      expect(afterAOverwrite?.record.sha256).not.toBe(cHash);

      // Deliver C's already-captured verification response: its hash check
      // passes against what it actually captured, its real DB finalize
      // succeeds (the claim token it holds was never touched), and -- the
      // exact fix under test -- its own success path now repairs the
      // object A overwrote in the interim.
      releaseCVerify();
      const published = await publishC;
      expect(published.artifactManifestHash).toBe(cHash);

      const persisted = rows.get(draft.placardVersionId);
      expect(persisted?.record.artifactManifestHash).toBe(cHash);
      expect(persisted?.record.__publishClaimToken).toBeFalsy();

      const stored = await backing.get("placard", draft.placardVersionId);
      expect(stored?.record.sha256).toBe(cHash);

      const controller = new ControlledDownloadController(backing, registry);
      const winnerFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(winnerFile.getStream()))).toBe(cHash);

      const freshReader = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        backing,
        registry,
      );
      await freshReader.onModuleInit();
      const fresh = await freshReader.getPlacardVersion(
        draft.placardVersionId,
      );
      expect(fresh.artifactManifestHash).toBe(cHash);
      const freshFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(fresh.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(freshFile.getStream()))).toBe(cHash);
    });
  });

  describe("R10-D a loser's own stale in-memory public-info cache must not corrupt its compensating repair (Codex REOPEN, generation ac45f6a18eb347a397a7f5faf84f00d7)", () => {
    const PUBLIC_INFO_R10D_DRAFT = {
      versionId: "public-info-r10d-source-drift",
      title: "R10-D Draft Disclosure",
      callPhone: "0800-050-050",
      complaintPhone: "0800-050-060",
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

    class HeldBaselineArtifactStore implements DocumentArtifactStore {
      private getCount = 0;
      private gate: Promise<void> | null = null;

      constructor(private readonly backing: DocumentArtifactStore) {}

      holdBaseline(): () => void {
        let release!: () => void;
        this.gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        return () => release();
      }

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.backing.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.backing.putIfAbsent(...args);
      }

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.backing.putIfUnchanged(...args);
      }

      async get(...args: Parameters<DocumentArtifactStore["get"]>) {
        this.getCount += 1;
        if (this.getCount === 1 && this.gate) {
          await this.gate;
        }
        return this.backing.get(...args);
      }
    }

    it("repairs the real winner's bytes from the durable public-info row, not a stale loser's own in-memory cache", async () => {
      const { repository, rows } = createRealPlacardRepository([
        PUBLIC_INFO_R10D_DRAFT,
      ]);
      const backing = new InMemoryDocumentArtifactStore();
      const storeA = new HeldBaselineArtifactStore(backing);
      const registry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        storeA,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r10d-source-drift",
        publicInfoVersionId: PUBLIC_INFO_R10D_DRAFT.versionId,
        templateName: "seatback-r10d-source-drift",
      });

      // A claims and stalls its own baseline read before it reaches the
      // transport.
      const releaseABaseline = storeA.holdBaseline();
      const publishA = podA.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const afterA = rows.get(draft.placardVersionId);
      expect(afterA?.record.__publishClaimToken).toBeTruthy();
      afterA!.updatedAt = new Date(Date.now() - 3 * 60_000).toISOString();

      // C boots a SEPARATE instance (its own in-memory caches hydrated
      // fresh from the durable repository/store, same as A's were), then
      // publishes the SOURCE public-info version through the real service
      // API -- not a direct mutation of any cache -- which persists the
      // published status for real. A's own in-memory `publicInfoVersions`
      // cache never observes this: it was hydrated at its own
      // `onModuleInit()`, before C's publish.
      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        backing,
        registry,
      );
      await podC.onModuleInit();
      podC.publishPublicInfoVersion(
        PUBLIC_INFO_R10D_DRAFT.versionId,
        {},
        "req-r10d",
        "platform-admin-r10d-actor",
      );
      // `publishPublicInfoVersion`'s own `persistChanges` call is
      // fire-and-forget; give its real (modeled) SQL write a tick to land
      // before relying on it being durably visible.
      await new Promise((r) => setTimeout(r, 10));
      const publishedSource = await repository.getPublicInfoVersionRecord(
        PUBLIC_INFO_R10D_DRAFT.versionId,
      );
      expect(publishedSource?.status).toBe("published");

      // C reclaims A's now-stale claim and finalizes normally, using its
      // own (correct, just-published) source.
      const published = await podC.publishPlacardVersion(
        draft.placardVersionId,
      );
      expect(published.publishedAt).toBeTruthy();
      expect(
        (await backing.get("placard", draft.placardVersionId))?.record
          .sha256,
      ).toBe(published.artifactManifestHash);

      // Release A's baseline: it reads C's current (published) state as
      // its baseline, so its own fenced write legitimately lands on top of
      // it -- overwriting C's bytes -- using A's OWN stale draft-based
      // render, which is self-consistent with A's own claimed hash and so
      // passes A's own verification; A's finalize then loses the DB race
      // to C's already-finalized claim, and A's OWN `!finalized` repair
      // branch runs -- and must complete -- before this attempt's promise
      // ever settles, so by the time `publishA` rejects the repair (fixed
      // or not) has already run to completion. A fixed repair reconstructs
      // C's bytes from the FRESH, durable public-info row -- not A's stale
      // local cache, which still thinks the source is a draft -- and
      // restores them before this rejection is even observable; the
      // pre-fix repair fails its own hash check against that same stale
      // cache and leaves A's corrupting bytes in place instead (the exact
      // R10-D defect: a no-fault repair declining to restore a winner
      // whose inputs the repairer's own cache has not seen).
      releaseABaseline();
      await expect(publishA).rejects.toMatchObject({
        code: "PLACARD_PUBLISH_CONFLICT",
      });
      const stored = await backing.get("placard", draft.placardVersionId);
      expect(stored?.record.sha256).toBe(published.artifactManifestHash);

      const persisted = rows.get(draft.placardVersionId);
      expect(persisted?.record.artifactManifestHash).toBe(
        published.artifactManifestHash,
      );

      const controller = new ControlledDownloadController(backing, registry);
      const winnerFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(winnerFile.getStream()))).toBe(
        published.artifactManifestHash,
      );

      const freshReader = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        backing,
        registry,
      );
      await freshReader.onModuleInit();
      const fresh = await freshReader.getPlacardVersion(
        draft.placardVersionId,
      );
      expect(fresh.artifactManifestHash).toBe(published.artifactManifestHash);
      const freshFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(fresh.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(freshFile.getStream()))).toBe(
        published.artifactManifestHash,
      );
    });
  });

  describe("R10-E a successful winner's own already-issued bytes must survive a legitimate LATER source update (Codex REOPEN, generation fdc2511b33d844c8b89d74ad71a982c9)", () => {
    const PUBLIC_INFO_R10E_SOURCE_AFTER_WINNER = {
      versionId: "public-info-r10e-source-after-winner",
      title: "R10-E Source-After-Winner Disclosure",
      callPhone: "0800-060-060",
      complaintPhone: "0800-060-070",
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

    /** Holds only the FIRST `get()` call (the baseline read) -- same shape
     * as R10-D's own `HeldBaselineArtifactStore` above (duplicated locally
     * since that one is scoped to R10-D's own `describe`). */
    class HeldBaselineArtifactStore implements DocumentArtifactStore {
      private getCount = 0;
      private gate: Promise<void> | null = null;

      constructor(private readonly backing: DocumentArtifactStore) {}

      holdBaseline(): () => void {
        let release!: () => void;
        this.gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        return () => release();
      }

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.backing.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.backing.putIfAbsent(...args);
      }

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.backing.putIfUnchanged(...args);
      }

      async get(...args: Parameters<DocumentArtifactStore["get"]>) {
        this.getCount += 1;
        if (this.getCount === 1 && this.gate) {
          await this.gate;
        }
        return this.backing.get(...args);
      }
    }

    it("restores the real winner's own durably preserved bytes even though the source it rendered from has since been legitimately published -- a re-render from CURRENT state would no longer match", async () => {
      const { repository, rows } = createRealPlacardRepository([
        PUBLIC_INFO_R10E_SOURCE_AFTER_WINNER,
      ]);
      const backing = new InMemoryDocumentArtifactStore();
      const storeA = new HeldBaselineArtifactStore(backing);
      const registry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        storeA,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r10e-source-after-winner",
        publicInfoVersionId: PUBLIC_INFO_R10E_SOURCE_AFTER_WINNER.versionId,
        templateName: "seatback-r10e-source-after-winner",
      });

      // A claims and stalls its own baseline read before it reaches the
      // transport.
      const releaseABaseline = storeA.holdBaseline();
      const publishA = podA.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const afterA = rows.get(draft.placardVersionId);
      expect(afterA?.record.__publishClaimToken).toBeTruthy();
      afterA!.updatedAt = new Date(Date.now() - 3 * 60_000).toISOString();

      // C boots a SEPARATE instance, reclaims A's now-stale claim, and
      // publishes for real -- rendering against the still-DRAFT source,
      // entirely while A's baseline read sits held.
      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        backing,
        registry,
      );
      await podC.onModuleInit();
      const published = await podC.publishPlacardVersion(
        draft.placardVersionId,
      );
      expect(published.publishedAt).toBeTruthy();
      expect(
        (await backing.get("placard", draft.placardVersionId))?.record
          .sha256,
      ).toBe(published.artifactManifestHash);

      // A LEGITIMATE, separate action, strictly AFTER C's own successful
      // publish: the source public-info version itself is published for
      // real, through the actual API and repository persistence -- not a
      // test-only mutation. This alone must not touch the artifact object;
      // C's original link keeps resolving right after it.
      const controller = new ControlledDownloadController(backing, registry);
      const updated = podC.publishPublicInfoVersion(
        PUBLIC_INFO_R10E_SOURCE_AFTER_WINNER.versionId,
        {},
        "req-r10e",
        "platform-admin-r10e-actor",
      );
      expect(updated.status).toBe("published");
      await new Promise((r) => setTimeout(r, 10));
      expect(
        (await repository.getPublicInfoVersionRecord(
          PUBLIC_INFO_R10E_SOURCE_AFTER_WINNER.versionId,
        ))?.status,
      ).toBe("published");
      const beforeAWinnerFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(beforeAWinnerFile.getStream()))).toBe(
        published.artifactManifestHash,
      );

      // Release A's baseline: it reads C's current (published-row) state as
      // its own baseline, so its own fenced write legitimately lands on top
      // of it -- overwriting C's bytes with A's OWN stale, draft-rendered
      // bytes -- and A's finalize then loses the DB race to C's
      // already-finalized claim.
      releaseABaseline();
      await expect(publishA).rejects.toMatchObject({
        code: "PLACARD_PUBLISH_CONFLICT",
      });

      // The durable row still names C, completely unaffected by A's lost
      // attempt.
      const persisted = rows.get(draft.placardVersionId);
      expect(persisted?.record.artifactManifestHash).toBe(
        published.artifactManifestHash,
      );
      expect(persisted?.record.__publishClaimToken).toBeUndefined();

      // The core regression this fix closes: the object itself must also
      // be restored to C's bytes, even though the source has moved on since
      // C's own render -- a re-render-from-CURRENT-state repair could never
      // reproduce C's original hash here, since C rendered against the
      // DRAFT source and the source is now "published". Restoring from
      // `preservePlacardPublicationBytes`'s own durable, content-addressed
      // copy of C's exact original render is what makes this possible.
      const stored = await backing.get("placard", draft.placardVersionId);
      expect(stored?.record.sha256).toBe(published.artifactManifestHash);

      const winnerFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(winnerFile.getStream()))).toBe(
        published.artifactManifestHash,
      );

      const freshReader = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        backing,
        registry,
      );
      await freshReader.onModuleInit();
      const fresh = await freshReader.getPlacardVersion(
        draft.placardVersionId,
      );
      expect(fresh.artifactManifestHash).toBe(published.artifactManifestHash);
      const freshFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(fresh.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(freshFile.getStream()))).toBe(
        published.artifactManifestHash,
      );
    });
  });

  describe("R10-F a single transient store failure inside the success-path repair must not permanently strand corrupted bytes behind a reported SUCCESS (Codex REOPEN, generation fdc2511b33d844c8b89d74ad71a982c9)", () => {
    const PUBLIC_INFO_R10F_REPAIR_RETRY = {
      versionId: "public-info-r10f-repair-retry",
      title: "R10-F Repair Retry Disclosure",
      callPhone: "0800-060-060",
      complaintPhone: "0800-060-070",
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

    /**
     * Same ordinal-addressable hold points as R10-C's own `OrdinalHoldArtifactStore`
     * (duplicated locally; that one is scoped to R10-C's own `describe`),
     * plus `failOnce`: makes exactly the given call ordinal throw a modeled
     * transport error instead of reaching the backing store at all, and
     * only that one ordinal -- every other call (including a RETRY of the
     * same logical operation, which gets the NEXT ordinal) passes through
     * normally.
     */
    class OrdinalHoldOrFailArtifactStore implements DocumentArtifactStore {
      private getCount = 0;
      private readonly beforeGates = new Map<number, Promise<void>>();
      private readonly afterGates = new Map<number, Promise<void>>();
      private failAtOrdinal: number | null = null;

      constructor(private readonly backing: DocumentArtifactStore) {}

      holdBefore(callOrdinal: number): () => void {
        let release!: () => void;
        this.beforeGates.set(
          callOrdinal,
          new Promise<void>((resolve) => {
            release = resolve;
          }),
        );
        return () => release();
      }

      holdAfter(callOrdinal: number): () => void {
        let release!: () => void;
        this.afterGates.set(
          callOrdinal,
          new Promise<void>((resolve) => {
            release = resolve;
          }),
        );
        return () => release();
      }

      failOnce(callOrdinal: number): void {
        this.failAtOrdinal = callOrdinal;
      }

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.backing.put(...args);
      }

      putIfAbsent(...args: Parameters<DocumentArtifactStore["putIfAbsent"]>) {
        return this.backing.putIfAbsent(...args);
      }

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.backing.putIfUnchanged(...args);
      }

      async get(...args: Parameters<DocumentArtifactStore["get"]>) {
        this.getCount += 1;
        const ordinal = this.getCount;
        if (this.failAtOrdinal === ordinal) {
          this.failAtOrdinal = null;
          throw Object.assign(
            new Error("MODELED_S3_REPAIR_GET_FAILURE"),
            { name: "ModeledTransportError" },
          );
        }
        const before = this.beforeGates.get(ordinal);
        if (before) await before;
        const result = await this.backing.get(...args);
        const after = this.afterGates.get(ordinal);
        if (after) await after;
        return result;
      }
    }

    it("retries past one transient GetObject failure inside the unconditional success-path repair and still restores the winner's own bytes, instead of reporting SUCCESS over corrupted bytes", async () => {
      const { repository, rows } = createRealPlacardRepository([
        PUBLIC_INFO_R10F_REPAIR_RETRY,
      ]);
      const backing = new InMemoryDocumentArtifactStore();
      const storeA = new OrdinalHoldOrFailArtifactStore(backing);
      const storeC = new OrdinalHoldOrFailArtifactStore(backing);
      const registry = new DocumentArtifactRebuildRegistry();

      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        storeA,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r10f-repair-retry",
        publicInfoVersionId: PUBLIC_INFO_R10F_REPAIR_RETRY.versionId,
        templateName: "seatback-r10f-repair-retry",
      });

      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        storeC,
        registry,
      );
      await podC.onModuleInit();

      // A claims and stalls its own baseline read (call #1) before it even
      // reaches the backing store.
      const releaseABaseline = storeA.holdBefore(1);
      const publishA = podA.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const afterA = rows.get(draft.placardVersionId);
      expect(afterA?.record.__publishClaimToken).toBeTruthy();
      afterA!.updatedAt = new Date(Date.now() - 3 * 60_000).toISOString();

      // C reclaims A's now-stale claim, writes its own PDF for real, and
      // its own post-write verification read (call #2) genuinely executes
      // against the backing store -- snapshotting C's own just-written
      // bytes -- but delivery of that response is held before C can reach
      // its own finalize.
      const releaseCVerify = storeC.holdAfter(2);
      const publishC = podC.publishPlacardVersion(draft.placardVersionId);
      await new Promise((r) => setTimeout(r, 10));
      const afterC = rows.get(draft.placardVersionId);
      expect(afterC?.record.__publishClaimToken).toBeTruthy();
      expect(afterC?.record.__publishClaimToken).not.toBe(
        afterA?.record.__publishClaimToken,
      );
      const cBytesWhileHeld = await backing.get(
        "placard",
        draft.placardVersionId,
      );
      const cHash = cBytesWhileHeld!.record.sha256;

      // Release A's baseline: it reads C's current (just-written) state, so
      // its own fenced write legitimately lands on top of it, overwriting
      // C's bytes with A's. A's finalize then loses the DB race -- C's
      // reclaim already moved the row's claim token -- and A's own repair
      // sees C's still-pending claim token and correctly no-ops.
      releaseABaseline();
      await expect(publishA).rejects.toMatchObject({
        code: "PLACARD_PUBLISH_CONFLICT",
      });
      const afterAOverwrite = await backing.get(
        "placard",
        draft.placardVersionId,
      );
      expect(afterAOverwrite?.record.sha256).not.toBe(cHash);

      // Arm EXACTLY C's next GetObject call (ordinal #3: the first store
      // read inside its own success-path repair's restore attempt) to fail
      // with a transport error, then deliver C's already-captured
      // verification response.
      storeC.failOnce(3);
      releaseCVerify();
      const published = await publishC;
      expect(published.artifactManifestHash).toBe(cHash);

      // C's own publish call still reports success -- the transient
      // failure happened inside its OWN best-effort repair, not its real
      // DB finalize -- but that success must not be allowed to leave
      // corrupted bytes behind uncorrected (the exact R10-F defect: the old
      // single-shot repair swallowed this one failure and gave up for
      // good).
      const persisted = rows.get(draft.placardVersionId);
      expect(persisted?.record.artifactManifestHash).toBe(cHash);
      expect(persisted?.record.__publishClaimToken).toBeFalsy();

      const stored = await backing.get("placard", draft.placardVersionId);
      expect(stored?.record.sha256).toBe(cHash);

      const controller = new ControlledDownloadController(backing, registry);
      const winnerFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(winnerFile.getStream()))).toBe(cHash);

      const freshReader = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        backing,
        registry,
      );
      await freshReader.onModuleInit();
      const fresh = await freshReader.getPlacardVersion(
        draft.placardVersionId,
      );
      expect(fresh.artifactManifestHash).toBe(cHash);
      const freshFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(fresh.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(freshFile.getStream()))).toBe(cHash);
    });
  });

  describe("R10-G a single failed publication-backup write must not let a destructive publish report success without it (Codex REOPEN, generation 86c0d8a2b0a94499b721fdb97ab1fbaf)", () => {
    const PUBLIC_INFO_R10G_BACKUP_FAILURE = {
      versionId: "public-info-r10g-backup-failure",
      title: "R10-G Backup Failure Disclosure",
      callPhone: "0800-070-070",
      complaintPhone: "0800-070-080",
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

    /** Fails the FIRST `putIfAbsent` whose subjectId is a publication-backup
     * key (`preservePlacardPublicationBytes`'s own key shape), then
     * delegates every other call -- including a later retry's own backup
     * write, which lands under a different hash it has never seen -- to the
     * backing store untouched. Every other store method always delegates. */
    class FailingBackupArtifactStore implements DocumentArtifactStore {
      private failed = false;

      constructor(private readonly backing: DocumentArtifactStore) {}

      put(...args: Parameters<DocumentArtifactStore["put"]>) {
        return this.backing.put(...args);
      }

      async putIfAbsent(
        ...args: Parameters<DocumentArtifactStore["putIfAbsent"]>
      ) {
        const [command] = args;
        if (
          !this.failed &&
          command.kind === "placard" &&
          command.subjectId.includes("::publication-backup::")
        ) {
          this.failed = true;
          throw Object.assign(
            new Error("MODELED_ONE_BACKUP_PUT_FAILURE"),
            { name: "ModeledTransportError" },
          );
        }
        return this.backing.putIfAbsent(...args);
      }

      putIfUnchanged(
        ...args: Parameters<DocumentArtifactStore["putIfUnchanged"]>
      ) {
        return this.backing.putIfUnchanged(...args);
      }

      get(...args: Parameters<DocumentArtifactStore["get"]>) {
        return this.backing.get(...args);
      }
    }

    it("fails the publish safely and leaves it retryable when the durable backup write fails, instead of committing a publication with no recovery copy", async () => {
      const { repository, rows } = createRealPlacardRepository([
        PUBLIC_INFO_R10G_BACKUP_FAILURE,
      ]);
      const backing = new InMemoryDocumentArtifactStore();
      const registry = new DocumentArtifactRebuildRegistry();

      // The draft is generated through a fault-free pod -- its own backup
      // write (over the draft's render hash) must succeed normally, so the
      // fault below lands on the PUBLISH attempt's own (different) render
      // hash, not on draft generation.
      const podA = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        backing,
        registry,
      );
      await podA.onModuleInit();
      const draft = await podA.generatePlacardVersion({
        versionCode: "placard-r10g-backup-failure",
        publicInfoVersionId: PUBLIC_INFO_R10G_BACKUP_FAILURE.versionId,
        templateName: "seatback-r10g-backup-failure",
      });
      const draftHash = draft.artifactManifestHash;
      expect(draftHash).toBeTruthy();

      const faultyStore = new FailingBackupArtifactStore(backing);
      const podC = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        faultyStore,
        registry,
      );
      await podC.onModuleInit();

      // The modeled single backup-write failure must reject the publish
      // itself -- the R10-G defect was reporting SUCCESS over it instead.
      await expect(
        podC.publishPlacardVersion(draft.placardVersionId),
      ).rejects.toThrow(/MODELED_ONE_BACKUP_PUT_FAILURE/);

      // The claim must have been released: the durable row is retryable,
      // not stuck mid-publish with a dangling claim token.
      const afterFailure = rows.get(draft.placardVersionId);
      expect(afterFailure?.record.publishedAt).toBeNull();
      expect(afterFailure?.record.__publishClaimToken).toBeUndefined();

      // The destructive write to the shared public slot must never have
      // run: `preservePlacardPublicationBytes` throwing (required) aborts
      // BEFORE it, in `renderPlacardArtifact`, so the slot still holds
      // exactly the pre-publish draft bytes, nothing half-published for a
      // sibling to clobber or a reader to see.
      const afterFailureObject = await backing.get(
        "placard",
        draft.placardVersionId,
      );
      expect(afterFailureObject?.record.sha256).toBe(draftHash);

      // A healthy retry -- same placard, now through a store with no fault
      // -- must succeed normally, with both the public slot and the durable
      // backup copy actually present, and both the original and a fresh
      // reader's link resolving the real published bytes.
      const retryService = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        backing,
        registry,
      );
      await retryService.onModuleInit();
      const published = await retryService.publishPlacardVersion(
        draft.placardVersionId,
      );
      expect(published.publishedAt).toBeTruthy();
      const stored = await backing.get("placard", draft.placardVersionId);
      expect(stored?.record.sha256).toBe(published.artifactManifestHash);

      const controller = new ControlledDownloadController(backing, registry);
      const originalFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(published.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(originalFile.getStream()))).toBe(
        published.artifactManifestHash,
      );

      const freshReader = new PlatformAdminService(
        new AuditNotificationService(),
        repository,
        undefined,
        backing,
        registry,
      );
      await freshReader.onModuleInit();
      const fresh = await freshReader.getPlacardVersion(
        draft.placardVersionId,
      );
      expect(fresh.artifactManifestHash).toBe(published.artifactManifestHash);
      const freshFile = (await resolve(
        controller,
        "placard",
        draft.placardVersionId,
        paramsOf(fresh.artifactDownloadUrl!),
      )) as unknown as StreamableFileLike;
      expect(sha256(await drain(freshFile.getStream()))).toBe(
        published.artifactManifestHash,
      );
    });
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
    ).toThrow(/must be s3 or gcs; memory is test-only/);
  });
});
