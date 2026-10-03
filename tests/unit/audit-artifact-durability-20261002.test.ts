import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { createControlledDownloadMetadata } from "../../apps/api/src/common/controlled-download";
import {
  DocumentArtifactRebuildRegistry,
  InMemoryDocumentArtifactStore,
} from "../../apps/api/src/common/document-artifacts";
import {
  createDocumentArtifactStore,
  UnprovisionedDocumentArtifactStore,
} from "../../apps/api/src/common/document-artifacts/document-artifact-runtime.config";
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
