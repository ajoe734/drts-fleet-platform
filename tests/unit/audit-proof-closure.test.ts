import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { connect as tcpConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createControlledDownloadMetadata } from "../../apps/api/src/common/controlled-download";
import { RemittanceProofService } from "../../apps/api/src/modules/billing-settlement/remittance-proof.service";
import { RemittanceProofDownloadController } from "../../apps/api/src/modules/billing-settlement/remittance-proof-download.controller";
import { BillingSettlementController } from "../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementModule } from "../../apps/api/src/modules/billing-settlement/billing-settlement.module";
import { BillingSettlementRepository } from "../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { InMemoryRemittanceProofStorageAdapter } from "../../apps/api/src/modules/billing-settlement/remittance-proof-storage.adapter";
import {
  createRemittanceProofStorage,
  createRemittanceProofScanner,
} from "../../apps/api/src/modules/billing-settlement/remittance-proof-runtime.config";
import { S3RemittanceProofStorageAdapter } from "../../apps/api/src/modules/billing-settlement/s3-remittance-proof-storage.adapter";
import {
  ClamdRemittanceProofScannerAdapter,
  encodeClamdInstream,
  exchangeWithClamd,
} from "../../apps/api/src/modules/billing-settlement/clamd-remittance-proof-scanner.adapter";

vi.mock("node:net", async (original) => ({
  ...(await original<typeof import("node:net")>()),
  connect: vi.fn(),
}));
vi.mock("node:tls", async (original) => ({
  ...(await original<typeof import("node:tls")>()),
  connect: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const clamdConfig = {
  host: "scanner.example.test",
  port: 3310,
  tls: true,
  timeoutMs: 500,
};

async function stagedProof() {
  const storage = new InMemoryRemittanceProofStorageAdapter();
  const proofs = new RemittanceProofService(undefined, storage);
  const bytes = Buffer.from(
    "%PDF unit-test fixture, not an actual financial document",
  );
  const staged = await proofs.stageContent(bytes, "application/pdf");
  const proof = await proofs.uploadProof({
    batchId: "batch-unit",
    driverId: "driver-unit",
    originalFilename: "unit.pdf",
    stagedContentRef: staged.stagedContentRef,
    uploadedByActorId: null,
  });
  return { storage, proofs, proof, bytes };
}

function s3Boundary() {
  const objects = new Map<
    string,
    { bytes: Buffer; type: string; metadata?: Record<string, string> }
  >();
  const send = vi.fn(
    async (command: {
      constructor: { name: string };
      input: {
        Key?: string;
        IfNoneMatch?: string;
        Body?: unknown;
        ContentType?: string;
        Metadata?: Record<string, string>;
      };
    }) => {
      const key = command.input.Key!;
      if (command.constructor.name === "PutObjectCommand") {
        if (command.input.IfNoneMatch === "*" && objects.has(key))
          throw Object.assign(new Error("conflict"), {
            name: "PreconditionFailed",
          });
        objects.set(key, {
          bytes: Buffer.from(command.input.Body as Uint8Array),
          type: command.input.ContentType!,
          metadata: command.input.Metadata,
        });
        return {};
      }
      const found = objects.get(key);
      if (!found)
        throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
      return {
        Body: Readable.from([found.bytes]),
        ContentLength: found.bytes.length,
        ContentType: found.type,
        Metadata: found.metadata,
      };
    },
  );
  const client = { send } as never;
  const instance = () =>
    new S3RemittanceProofStorageAdapter(
      { bucket: "unit-private-bucket", clientConfig: { region: "us-east-1" } },
      client,
    );
  return { objects, send, instance };
}

describe("configured shared proof storage (external SDK boundary double only)", () => {
  it("preserves exact bytes across fresh instances and enforces one-time concurrent commit", async () => {
    const { instance } = s3Boundary();
    const bytes = Buffer.from("%PDF private unit receipt");
    const stage = await instance().stage({
      bytes,
      contentType: "application/pdf",
    });
    const raced = await Promise.allSettled([
      instance().commit(stage),
      instance().commit(stage),
    ]);
    expect(
      raced.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(raced.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );
    expect(await instance().read(hash(bytes))).toEqual({
      bytes,
      contentType: "application/pdf",
    });
    await expect(instance().commit(stage)).rejects.toThrow(/consumed/);
  });
  it("rejects expired references, namespace traversal, changed bytes and conflicting MIME", async () => {
    const { instance, objects } = s3Boundary();
    const store = instance();
    const bytes = Buffer.from("stored PDF fixture");
    const stage = await store.stage({ bytes, contentType: "application/pdf" });
    const committed = await store.commit(stage);
    const second = await store.stage({ bytes, contentType: "image/png" });
    await expect(instance().commit(second)).rejects.toThrow(/MIME/);
    objects.get(`remittance-proof/content/${committed.contentHash}`)!.bytes =
      Buffer.from("tampered");
    await expect(instance().read(committed.contentHash)).rejects.toThrow(
      /hash mismatch/,
    );
    await expect(
      store.commit({ stagedContentRef: "../../content/arbitrary" }),
    ).rejects.toThrow(/Invalid/);
    const expiring = await store.stage({
      bytes,
      contentType: "application/pdf",
    });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60_000);
    await expect(instance().commit(expiring)).rejects.toThrow(/expired/);
  });
  it("requires runtime providers, rejects fake scanner/partial config, and requires DB metadata", async () => {
    expect(
      createRemittanceProofStorage({ NODE_ENV: "production" }).availability()
        .state,
    ).toBe("unavailable");
    expect(() =>
      createRemittanceProofStorage({
        NODE_ENV: "production",
        REMITTANCE_PROOF_STORAGE_PROVIDER: "memory",
      }),
    ).toThrow(/test-only/);
    expect(() =>
      createRemittanceProofStorage({ REMITTANCE_PROOF_STORAGE_PROVIDER: "s3" }),
    ).toThrow(/required/);
    expect(() =>
      createRemittanceProofScanner(
        new InMemoryRemittanceProofStorageAdapter(),
        { REMITTANCE_PROOF_SCANNER_PROVIDER: "eicar-signature" },
      ),
    ).toThrow(/not runtime/);
    vi.stubEnv("NODE_ENV", "production");
    const proofs = new RemittanceProofService(
      undefined,
      new InMemoryRemittanceProofStorageAdapter(),
    );
    await expect(
      proofs.stageContent(Buffer.from("no DB"), "application/pdf"),
    ).rejects.toMatchObject({
      code: "REMITTANCE_PROOF_PERSISTENCE_UNAVAILABLE",
    });
  });
});

it("serializes durable payments by batch before reading any receipt/proof (SQL boundary double)", async () => {
  const existing = {
    receipt_id: "receipt-unit",
    batch_id: "batch-unit",
    proof_id: "proof-unit",
    driver_id: "driver-unit",
    idempotency_key: "first-intent",
    amount_minor: 100,
    currency: "TWD",
    paid_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
  };
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes(
      "SELECT * FROM billing.phase1_remittance_proof_payment_receipts",
    )
      ? [existing]
      : [],
  }));
  const release = vi.fn();
  const repository = new BillingSettlementRepository({
    isEnabled: () => true,
    connect: async () => ({ query, release }),
  } as never);
  const result = await repository.markRemittanceProofPaid({
    batchId: "batch-unit",
    proofId: "proof-unit",
    driverId: "driver-unit",
    idempotencyKey: "different-intent",
    amount: { amountMinor: 100, currency: "TWD" },
    paidAt: "2026-01-02T00:00:00Z",
  });
  expect(query.mock.calls[0]![0]).toBe("BEGIN");
  expect(query.mock.calls[1]![0]).toContain("pg_advisory_xact_lock");
  expect(query.mock.calls[2]![0]).toContain(
    "WHERE batch_id = $1 ORDER BY created_at, receipt_id LIMIT 1",
  );
  expect(result).toMatchObject({
    outcome: "paid",
    replayed: true,
    receipt: { idempotencyKey: "first-intent" },
  });
  expect(query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
  expect(release).toHaveBeenCalledOnce();
});

it("HTTP upload invokes the configured scanner, retains pending on failure, and exposes authorized retry", async () => {
  const storage = new InMemoryRemittanceProofStorageAdapter();
  const exchange = vi
    .fn()
    .mockRejectedValueOnce(new Error("engine down"))
    .mockResolvedValueOnce("stream: OK");
  const proofs = new RemittanceProofService(
    undefined,
    storage,
    new ClamdRemittanceProofScannerAdapter(storage, clamdConfig, exchange),
  );
  const billing = new BillingSettlementService(
    new AuditNotificationService(),
    undefined,
    undefined,
    undefined,
    undefined,
    proofs,
  );
  await billing.publishDriverFeePlan({
    planName: "Scan unit",
    version: "scan-unit",
    serviceFeeBps: 1500,
    reimbursementMode: "platform_funded",
  });
  const batches = await billing.generateDriverStatements({
    periodMonth: "2026-03",
  });
  const staged = await proofs.stageContent(
    Buffer.from("unit upload retry"),
    "application/pdf",
  );
  const controller = new BillingSettlementController(billing);
  const uploaded = await controller.uploadRemittanceProof(
    {
      batchId: batches.reimbursementBatchIds[0]!,
      originalFilename: "unit.pdf",
      contentType: "application/pdf",
      sizeBytes: 999,
      stagedContentRef: staged.stagedContentRef,
    },
    null,
    "upload-scan-unit",
  );
  expect(uploaded.data.scanState).toBe("pending_scan");
  const beforePayment = await controller.getReimbursementProof(
    batches.reimbursementBatchIds[0]!,
  );
  expect(beforePayment.data?.proofId).toBe(uploaded.data.proofId);
  expect(
    billing.getReimbursementBatch(batches.reimbursementBatchIds[0]!).status,
  ).not.toBe("paid");
  expect(exchange).toHaveBeenCalledOnce();
  const retry = await controller.scanRemittanceProof(
    uploaded.data.proofId,
    null,
  );
  expect(retry.data.scanState).toBe("clean");
  expect(exchange).toHaveBeenCalledTimes(2);
});

describe("actual proof download controller path", () => {
  it("registers an explicit controller and returns the signed immutable bytes/MIME", async () => {
    vi.stubEnv("CONTROLLED_DOWNLOAD_KEY_ID", "rotated-unit-key");
    const { proofs, proof, bytes } = await stagedProof();
    await proofs.recordScanResult(proof.proofId, {
      scanState: "clean",
      rejectionReason: null,
      scanCompletedAt: new Date().toISOString(),
    });
    const grant = await proofs.requestReadback(proof.proofId);
    const url = new URL(grant.readbackUrl, "https://unit.invalid");
    expect(url.pathname).toBe(
      `/api/reimbursements/proof-downloads/remittance-proof/${proof.proofId}`,
    );
    expect(url.searchParams.get("key_id")).toBe("rotated-unit-key");
    expect(
      Reflect.getMetadata("controllers", BillingSettlementModule),
    ).toContain(RemittanceProofDownloadController);
    const file = await new RemittanceProofDownloadController(proofs).download(
      proof.proofId,
      Object.fromEntries(url.searchParams),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(bytes);
    expect(file.getHeaders()).toMatchObject({
      type: "application/pdf",
      length: bytes.length,
      disposition: 'attachment; filename="remittance-proof"',
    });
  });
  it("rejects missing/tampered/version/expired/future/overlong grants before reading storage", async () => {
    const { proofs, proof, storage } = await stagedProof();
    const controller = new RemittanceProofDownloadController(proofs);
    const read = vi.spyOn(storage, "read");
    const grant = await proofs.requestReadback(proof.proofId);
    const query = Object.fromEntries(
      new URL(grant.readbackUrl, "https://unit.invalid").searchParams,
    );
    for (const changes of [
      { sig: "" },
      { sig: "0".repeat(64) },
      { sig_v: "2" },
      { manifest_hash: "b".repeat(64) },
      { signed_at: [query.signed_at] },
    ]) {
      await expect(
        controller.download(proof.proofId, { ...query, ...changes }),
      ).rejects.toMatchObject({ status: 403 });
    }
    const signedAt = new Date(Date.now() + 60_000).toISOString();
    const badWindow = createControlledDownloadMetadata({
      kind: "remittance-proof",
      subjectId: proof.proofId,
      manifestHash: proof.content.contentHash,
      createdAt: signedAt,
      ttlMinutes: 16,
    });
    await expect(
      controller.download(
        proof.proofId,
        Object.fromEntries(
          new URL(badWindow.downloadUrl, "https://unit.invalid").searchParams,
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(grant.expiresAt) + 1);
    await expect(
      controller.download(proof.proofId, query),
    ).rejects.toMatchObject({ status: 410 });
    expect(read).not.toHaveBeenCalled();
  });
  it("blocks pending/rejected content, and checks returned hash/size/MIME rather than trusting a URL", async () => {
    const { proofs, proof, storage } = await stagedProof();
    const grant = await proofs.requestReadback(proof.proofId);
    const controller = new RemittanceProofDownloadController(proofs);
    const query = Object.fromEntries(
      new URL(grant.readbackUrl, "https://unit.invalid").searchParams,
    );
    await expect(
      controller.download(proof.proofId, query),
    ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_NOT_CLEAN" });
    await proofs.recordScanResult(proof.proofId, {
      scanState: "clean",
      rejectionReason: null,
      scanCompletedAt: new Date().toISOString(),
    });
    const read = vi.spyOn(storage, "read").mockResolvedValue({
      bytes: Buffer.from("tampered"),
      contentType: "application/pdf",
    });
    await expect(
      controller.download(proof.proofId, query),
    ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_CONTENT_MISMATCH" });
    read.mockResolvedValue(null);
    await expect(
      controller.download(proof.proofId, query),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("gives both payment routes identical explicit RBAC metadata", () => {
    const old = BillingSettlementController.prototype.markReimbursementPaid;
    const next =
      BillingSettlementController.prototype.markReimbursementPaidWithProof;
    const keys = Reflect.getMetadataKeys(next).filter((key: string) =>
      /realm|scope/i.test(key),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys)
      expect(Reflect.getMetadata(key, old)).toEqual(
        Reflect.getMetadata(key, next),
      );
  });
});

describe("real clamd transport/protocol, with external socket/provider doubles", () => {
  it.each(["stream: OK", "stream: Eicar-Test-Signature FOUND"])(
    "interprets definitive verdict %s over actual proof bytes",
    async (reply) => {
      const { storage, proofs, proof, bytes } = await stagedProof();
      const exchange = vi.fn<typeof exchangeWithClamd>(async () => reply);
      const scanner = new ClamdRemittanceProofScannerAdapter(
        storage,
        clamdConfig,
        exchange,
      );
      const result = await scanner.scan({
        proofId: proof.proofId,
        ...proof.content,
      });
      expect(result.scanState).toBe(
        reply.endsWith("OK") ? "clean" : "rejected",
      );
      expect(exchange).toHaveBeenCalledWith(
        clamdConfig,
        encodeClamdInstream(bytes),
      );
      const framed = exchange.mock.calls[0]![1] as unknown as Buffer;
      expect(framed.subarray(0, 10).toString()).toBe("zINSTREAM\0");
      expect(framed.readUInt32BE(10)).toBe(bytes.length);
      expect(framed.subarray(14, -4)).toEqual(bytes);
      expect((await proofs.getProof(proof.proofId)).scanState).toBe(
        "pending_scan",
      );
    },
  );
  it.each([
    "stream: size limit exceeded ERROR",
    "OK",
    "stream: OK\nmalicious",
    "",
  ])("never turns engine/protocol failure into clean: %s", async (reply) => {
    const { storage, proof } = await stagedProof();
    const scanner = new ClamdRemittanceProofScannerAdapter(
      storage,
      clamdConfig,
      async () => reply,
    );
    await expect(
      scanner.scan({ proofId: proof.proofId, ...proof.content }),
    ).rejects.toThrow(/definitive/);
  });
  it("leaves pending on transport failure; a real configured scan can then be retried", async () => {
    const storage = new InMemoryRemittanceProofStorageAdapter();
    const exchange = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("stream: OK");
    const proofs = new RemittanceProofService(
      undefined,
      storage,
      new ClamdRemittanceProofScannerAdapter(storage, clamdConfig, exchange),
    );
    const staged = await proofs.stageContent(
      Buffer.from("unit retry"),
      "application/pdf",
    );
    const proof = await proofs.uploadProof({
      batchId: "batch",
      driverId: "driver",
      uploadedByActorId: null,
      originalFilename: "retry.pdf",
      stagedContentRef: staged.stagedContentRef,
    });
    await expect(proofs.attemptScan(proof.proofId)).rejects.toThrow("timeout");
    expect((await proofs.getProof(proof.proofId)).scanState).toBe(
      "pending_scan",
    );
    expect((await proofs.attemptScan(proof.proofId)).scanState).toBe("clean");
    await proofs.attemptScan(proof.proofId);
    expect(exchange).toHaveBeenCalledTimes(2);
  });
  it("uses verified TLS, frames data, collects split replies and destroys the socket", async () => {
    const socket = Object.assign(new EventEmitter(), {
      write: vi.fn(),
      destroy: vi.fn(),
    });
    vi.mocked(tlsConnect).mockImplementation(((
      _options: unknown,
      connected: () => void,
    ) => {
      queueMicrotask(connected);
      return socket;
    }) as never);
    const payload = encodeClamdInstream(Buffer.from("unit transport"));
    const result = exchangeWithClamd(clamdConfig, payload);
    await Promise.resolve();
    expect(tlsConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectUnauthorized: true,
        servername: clamdConfig.host,
      }),
      expect.any(Function),
    );
    expect(tcpConnect).not.toHaveBeenCalled();
    expect(socket.write).toHaveBeenCalledWith(payload);
    socket.emit("data", Buffer.from("stream: "));
    socket.emit("data", Buffer.from("OK\0"));
    await expect(result).resolves.toBe("stream: OK");
    expect(socket.destroy).toHaveBeenCalled();
  });
  it("times out and rejects truncated or oversized socket replies", async () => {
    vi.useFakeTimers();
    for (const failure of ["timeout", "close", "oversize"] as const) {
      const socket = Object.assign(new EventEmitter(), {
        write: vi.fn(),
        destroy: vi.fn(),
      });
      vi.mocked(tlsConnect).mockReturnValue(socket as never);
      const result = exchangeWithClamd(
        clamdConfig,
        encodeClamdInstream(Buffer.from("unit transport")),
      );
      const assertion = expect(result).rejects.toThrow();
      if (failure === "timeout") await vi.advanceTimersByTimeAsync(501);
      if (failure === "close") socket.emit("close");
      if (failure === "oversize") socket.emit("data", Buffer.alloc(4097));
      await assertion;
      expect(socket.destroy).toHaveBeenCalled();
    }
  });
});
