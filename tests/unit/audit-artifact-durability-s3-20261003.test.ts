import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createControlledDownloadMetadata } from "../../apps/api/src/common/controlled-download";
import {
  DOCUMENT_ARTIFACT_STORE,
  type DocumentArtifactStore,
} from "../../apps/api/src/common/document-artifacts";
import {
  MAX_DOCUMENT_ARTIFACT_BYTES,
  S3DocumentArtifactStoreAdapter,
} from "../../apps/api/src/common/document-artifacts/s3-document-artifact-store.adapter";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ControlledDownloadController } from "../../apps/api/src/modules/controlled-download/controlled-download.controller";
import { ControlledDownloadModule } from "../../apps/api/src/modules/controlled-download/controlled-download.module";
import { PlatformAdminService } from "../../apps/api/src/modules/platform-admin/platform-admin.service";

// Resolve API-owned dependencies from its importer, not an undeclared root
// dependency or a copied SDK. This is the same SDK used by the real adapter.
const apiRequire = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
apiRequire("reflect-metadata");
const { MODULE_METADATA } = apiRequire("@nestjs/common/constants") as {
  MODULE_METADATA: { PROVIDERS: string };
};
type Client = NonNullable<
  ConstructorParameters<typeof S3DocumentArtifactStoreAdapter>[1]
>;
interface ObjectInput {
  Bucket?: string;
  Key?: string;
  Body?: Buffer;
  ContentType?: string;
  ContentLength?: number;
  Metadata?: Record<string, string>;
  IfNoneMatch?: string;
}
const { S3Client, GetObjectCommand, PutObjectCommand } = apiRequire(
  "@aws-sdk/client-s3",
) as {
  S3Client: { prototype: Client };
  GetObjectCommand: new (...args: never[]) => { input: ObjectInput };
  PutObjectCommand: new (...args: never[]) => { input: ObjectInput };
};

// Only the SDK's external transport is doubled. Factory, adapter, commands,
// placard renderer, signature checks and download controller are real.
interface StoredObject {
  bytes: Buffer;
  ContentType?: string | undefined;
  ContentLength?: number | undefined;
  Metadata?: Record<string, string> | undefined;
}
const objects = new Map<string, StoredObject>();
let unreadableBody = false;
let transportError: Error | undefined;
let sends: ReturnType<typeof vi.spyOn>;
const clients = new Set<Client>();
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const key = (kind: string, subject: string) =>
  `offline-bucket/document-artifacts/${kind}/${encodeURIComponent(subject)}`;

function configuredModuleStore(): DocumentArtifactStore {
  const providers = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    ControlledDownloadModule,
  ) as Array<{
    provide?: unknown;
    useFactory?: () => DocumentArtifactStore;
  }>;
  const provider = providers.find(
    (entry) => entry.provide === DOCUMENT_ARTIFACT_STORE,
  );
  expect(provider?.useFactory).toBeTypeOf("function");
  return provider!.useFactory!();
}

function resolveLink(controller: ControlledDownloadController, link: string) {
  const url = new URL(link, "https://offline.invalid");
  const segments = url.pathname.split("/");
  const query = url.searchParams;
  return controller.resolve(
    decodeURIComponent(segments.at(-2)!),
    decodeURIComponent(segments.at(-1)!),
    query.get("signed_at")!,
    query.get("expires_at")!,
    query.get("key_id")!,
    query.get("manifest_hash")!,
    query.get("sig")!,
    query.get("sig_v")!,
  );
}

async function bytesOf(
  file: Awaited<ReturnType<ControlledDownloadController["resolve"]>>,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

beforeEach(() => {
  objects.clear();
  clients.clear();
  unreadableBody = false;
  transportError = undefined;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DRTS_ENV", "production");
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("DOCUMENT_ARTIFACT_STORAGE_PROVIDER", "s3");
  vi.stubEnv("DOCUMENT_ARTIFACT_S3_BUCKET", "offline-bucket");
  vi.stubEnv("DOCUMENT_ARTIFACT_S3_REGION", "us-central-1");
  vi.stubEnv("DOCUMENT_ARTIFACT_S3_ENDPOINT", "");
  vi.stubEnv("DOCUMENT_ARTIFACT_S3_ACCESS_KEY_ID", "");
  vi.stubEnv("DOCUMENT_ARTIFACT_S3_SECRET_ACCESS_KEY", "");
  vi.stubEnv("DOCUMENT_ARTIFACT_S3_SESSION_TOKEN", "");
  vi.stubEnv(
    "CONTROLLED_DOWNLOAD_SIGNING_SECRET",
    "offline-test-signing-secret",
  );
  sends = vi
    .spyOn(S3Client.prototype, "send")
    .mockImplementation(async function (this: Client, command: unknown) {
      clients.add(this);
      if (transportError) throw transportError;
      if (command instanceof PutObjectCommand) {
        const input = command.input;
        expect(Buffer.isBuffer(input.Body)).toBe(true);
        const objectKey = `${input.Bucket}/${input.Key}`;
        if (input.IfNoneMatch === "*" && objects.has(objectKey)) {
          throw Object.assign(new Error("At least one of the pre-conditions you specified did not hold."), {
            name: "PreconditionFailed",
            $metadata: { httpStatusCode: 412 },
          });
        }
        objects.set(objectKey, {
          bytes: Buffer.from(input.Body as Buffer),
          ContentType: input.ContentType,
          ContentLength: input.ContentLength,
          Metadata: { ...input.Metadata },
        });
        return { $metadata: { httpStatusCode: 200 } };
      }
      expect(command).toBeInstanceOf(GetObjectCommand);
      const input = (command as InstanceType<typeof GetObjectCommand>).input;
      const object = objects.get(`${input.Bucket}/${input.Key}`);
      if (!object)
        throw Object.assign(new Error("not found"), { name: "NoSuchKey" });
      const snapshot = Buffer.from(object.bytes);
      return {
        ContentType: object.ContentType,
        ContentLength: object.ContentLength,
        Metadata: { ...object.Metadata },
        Body: unreadableBody
          ? {}
          : (async function* () {
              yield snapshot.subarray(0, Math.floor(snapshot.length / 2));
              yield snapshot.subarray(Math.floor(snapshot.length / 2));
            })(),
      };
    } as Client["send"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("configured durable document path with SDK transport boundary only", () => {
  it("constructs independent S3 clients and reads original signed bytes from a pre-existing sibling and a restarted reader", async () => {
    const producer = configuredModuleStore();
    const sibling = configuredModuleStore();
    expect(producer).toBeInstanceOf(S3DocumentArtifactStoreAdapter);
    expect(sibling).toBeInstanceOf(S3DocumentArtifactStoreAdapter);
    expect(sibling).not.toBe(producer);
    const bytes = Buffer.from("%PDF-1.4\noriginal invoice bytes\n%%EOF");
    const subjectId = "invoice/../escaped % identifier";
    const record = await producer.put({
      kind: "tenant-invoice",
      subjectId,
      mimeType: "application/pdf",
      bytes,
    });
    expect(objects.get(key("tenant-invoice", subjectId))?.bytes).toEqual(bytes);
    const link = createControlledDownloadMetadata({
      kind: record.kind,
      subjectId,
      manifestHash: record.sha256,
    }).downloadUrl;
    for (const reader of [sibling, configuredModuleStore()]) {
      const file = await resolveLink(
        new ControlledDownloadController(reader),
        link,
      );
      expect(file.getHeaders().type).toBe("application/pdf");
      expect(await bytesOf(file)).toEqual(bytes);
    }
    expect(clients.size).toBe(3);
    expect(
      sends.mock.calls.filter(
        ([command]: readonly unknown[]) => command instanceof PutObjectCommand,
      ),
    ).toHaveLength(1);
  });

  it("materializes a real platform-admin placard through the configured module factory, visible to a reader created before generation", async () => {
    const producer = configuredModuleStore();
    const reader = new ControlledDownloadController(configuredModuleStore());
    const service = new PlatformAdminService(
      new AuditNotificationService(),
      undefined,
      undefined,
      producer,
    );
    const info = service.createPublicInfoVersion({
      title: "Offline durable disclosure",
      callPhone: "0800-000-000",
    });
    const placard = await service.generatePlacardVersion({
      versionCode: "offline-s3-placard",
      publicInfoVersionId: info.versionId,
      templateName: "seatback-standard",
    });
    const original = objects.get(
      key("placard", placard.placardVersionId),
    )!.bytes;
    expect(original.subarray(0, 5).toString()).toBe("%PDF-");
    expect(hash(original)).toBe(placard.artifactManifestHash);
    expect(
      await bytesOf(await resolveLink(reader, placard.artifactDownloadUrl!)),
    ).toEqual(original);
    expect(
      await bytesOf(
        await resolveLink(
          new ControlledDownloadController(configuredModuleStore()),
          placard.artifactDownloadUrl!,
        ),
      ),
    ).toEqual(original);
  });

  it("keeps an actual issued invoice's original bytes after billing-profile changes and reader restart", async () => {
    const producer = configuredModuleStore();
    const reader = new ControlledDownloadController(configuredModuleStore());
    const service = new BillingSettlementService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      producer,
    );
    const invoice = await service.generateTenantInvoice(
      "tenant-demo-001",
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
      "offline-invoice",
    );
    const original = Buffer.from(
      objects.get(key("tenant-invoice", invoice.invoiceId))!.bytes,
    );
    await service.updateTenantBillingProfile(
      "tenant-demo-001",
      {
        invoiceTitle: "Changed Offline Fixture",
        taxId: "00000000",
        address: "Offline fixture address",
        contactName: "Fixture billing contact",
        email: "billing@example.invalid",
      },
      "offline-profile-change",
    );
    for (const controller of [
      reader,
      new ControlledDownloadController(configuredModuleStore()),
    ]) {
      expect(
        await bytesOf(await resolveLink(controller, invoice.artifactUrl!)),
      ).toEqual(original);
    }
    expect(hash(original)).toBe(invoice.artifactDownloadMetadata.manifestHash);
  });

  it("shares real driver statement report bytes with a pre-existing independently configured reader", async () => {
    const producer = configuredModuleStore();
    const reader = new ControlledDownloadController(configuredModuleStore());
    const service = new BillingSettlementService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      producer,
    );
    service.publishDriverFeePlan({
      planName: "offline-plan",
      version: "v1",
      serviceFeeBps: 1000,
      reimbursementMode: "platform_funded",
    });
    const generated = await service.generateDriverStatements({
      periodMonth: "2026-03",
    });
    const statement = generated.items[0]!;
    const bytes = await bytesOf(
      await resolveLink(reader, statement.artifactUrl!),
    );
    expect(bytes).toEqual(
      objects.get(key("report", statement.statementId))!.bytes,
    );
    expect(hash(bytes)).toBe(statement.artifactDownloadMetadata!.manifestHash);
  });

  it("denies forged links before transport, tampered stored bytes despite stale metadata, and missing objects", async () => {
    const producer = configuredModuleStore();
    const reader = new ControlledDownloadController(configuredModuleStore());
    const record = await producer.put({
      kind: "report",
      subjectId: "report-1",
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4 original"),
    });
    const link = createControlledDownloadMetadata({
      kind: record.kind,
      subjectId: record.subjectId,
      manifestHash: record.sha256,
    }).downloadUrl;
    const forged = new URL(link, "https://offline.invalid");
    forged.searchParams.set("sig", "0".repeat(64));
    const callCount = sends.mock.calls.length;
    await expect(resolveLink(reader, forged.href)).rejects.toMatchObject({
      code: "CONTROLLED_DOWNLOAD_SIGNATURE_INVALID",
    });
    expect(sends).toHaveBeenCalledTimes(callCount);
    const corrupted = objects.get(key("report", "report-1"))!.bytes;
    corrupted[8] = corrupted[8]! ^ 1;
    await expect(resolveLink(reader, link)).rejects.toMatchObject({
      code: "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH",
    });
    objects.delete(key("report", "report-1"));
    await expect(resolveLink(reader, link)).rejects.toMatchObject({
      code: "ARTIFACT_NOT_MATERIALISED",
    });
  });

  it.each([
    ["missing MIME", { ContentType: undefined }, /no MIME/],
    ["zero length", { ContentLength: 0 }, /size is invalid/],
    [
      "oversized length",
      { ContentLength: MAX_DOCUMENT_ARTIFACT_BYTES + 1 },
      /size is invalid/,
    ],
    ["truncated body", { ContentLength: 100 }, /length mismatch/],
    ["overlong body", { ContentLength: 1 }, /exceeds its byte limit/],
  ] as const)("fails closed for %s", async (_name, fields, error) => {
    const store = configuredModuleStore();
    objects.set(key("report", "bad"), {
      bytes: Buffer.from("pdf bytes"),
      ContentType: "application/pdf",
      ContentLength: 9,
      ...fields,
    });
    await expect(store.get("report", "bad")).rejects.toThrow(error);
  });

  it("rejects unreadable bodies and propagates denied transport instead of calling it a missing object", async () => {
    const store = configuredModuleStore();
    objects.set(key("report", "bad"), {
      bytes: Buffer.from("pdf"),
      ContentType: "application/pdf",
      ContentLength: 3,
    });
    unreadableBody = true;
    await expect(store.get("report", "bad")).rejects.toThrow(/Unreadable/);
    transportError = Object.assign(new Error("access denied"), {
      name: "AccessDenied",
    });
    await expect(store.get("report", "bad")).rejects.toBe(transportError);
  });

  it("putIfAbsent creates the object over real IfNoneMatch semantics, and preserves a concurrent winner instead of overwriting it", async () => {
    const store = configuredModuleStore() as S3DocumentArtifactStoreAdapter;
    const firstBytes = Buffer.from("%PDF-1.4 first writer\n%%EOF");

    const created = await store.putIfAbsent({
      kind: "report",
      subjectId: "race-s3-1",
      mimeType: "application/pdf",
      bytes: firstBytes,
    });
    expect(created.created).toBe(true);
    expect(created.record.sha256).toBe(hash(firstBytes));
    expect(
      sends.mock.calls.filter(
        ([command]: readonly unknown[]) => command instanceof PutObjectCommand,
      ),
    ).toHaveLength(1);
    expect(
      (sends.mock.calls.at(-1)![0] as InstanceType<typeof PutObjectCommand>)
        .input.IfNoneMatch,
    ).toBe("*");

    // A concurrent recoverer's own attempt, after the object above already
    // exists: must not overwrite it, and must report the real winner.
    const losingBytes = Buffer.from("%PDF-1.4 a different render\n%%EOF");
    const puts = sends.mock.calls.filter(
      ([command]: readonly unknown[]) => command instanceof PutObjectCommand,
    ).length;
    const lost = await store.putIfAbsent({
      kind: "report",
      subjectId: "race-s3-1",
      mimeType: "application/pdf",
      bytes: losingBytes,
    });
    expect(lost.created).toBe(false);
    expect(lost.record.sha256).toBe(hash(firstBytes));
    expect(objects.get(key("report", "race-s3-1"))!.bytes).toEqual(
      firstBytes,
    );
    // The attempted (failed) PutObject still counted as a transport call,
    // but no NEW object content landed because of it.
    expect(
      sends.mock.calls.filter(
        ([command]: readonly unknown[]) => command instanceof PutObjectCommand,
      ).length,
    ).toBe(puts + 1);
  });

  it("rejects oversize uploads before any transport and fails configured-module reads closed when unprovisioned", async () => {
    const store = configuredModuleStore();
    await expect(
      store.put({
        kind: "report",
        subjectId: "big",
        mimeType: "application/pdf",
        bytes: Buffer.alloc(MAX_DOCUMENT_ARTIFACT_BYTES + 1),
      }),
    ).rejects.toThrow(/byte limit/);
    expect(sends).not.toHaveBeenCalled();
    vi.stubEnv("DOCUMENT_ARTIFACT_STORAGE_PROVIDER", "");
    const unprovisioned = configuredModuleStore();
    await expect(unprovisioned.get("report", "big")).rejects.toThrow(
      /not configured/,
    );
    expect(sends).not.toHaveBeenCalled();
  });
});
