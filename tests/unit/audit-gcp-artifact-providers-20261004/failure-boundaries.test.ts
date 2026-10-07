import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoogleCloudObjectClient,
  GoogleMetadataTokens,
  GoogleCloudHttpError,
} from "../../../apps/api/src/common/google-cloud/google-cloud-object-client";
import { GcsDocumentArtifactStoreAdapter } from "../../../apps/api/src/common/document-artifacts/gcs-document-artifact-store.adapter";
import { GcsRemittanceProofStorageAdapter } from "../../../apps/api/src/modules/billing-settlement/gcs-remittance-proof-storage.adapter";
import { CloudRunRemittanceProofScannerAdapter } from "../../../apps/api/src/modules/billing-settlement/cloud-run-remittance-proof-scanner.adapter";

const bucket = "drts-private-fixture";
const bytes = Buffer.from("proof-fixture");
const sha = createHash("sha256").update(bytes).digest("hex");
const origin = "https://scanner-fixture-uc.a.run.app";
const record = {
  proofId: "proof-fixture",
  contentHash: sha,
  contentType: "application/pdf",
  sizeBytes: bytes.length,
};
const tokens = {
  accessToken: async () => "fixture",
  identityToken: async () => "fixture",
};
const json = (data: unknown) => new Response(JSON.stringify(data));
const metadata = (overrides: Record<string, unknown> = {}) => ({
  name: "key",
  bucket,
  generation: "100",
  size: String(bytes.length),
  contentType: "application/pdf",
  metadata: {},
  updated: new Date().toISOString(),
  md5Hash: createHash("md5").update(bytes).digest("base64"),
  ...overrides,
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("cloud transport ambiguity and hard resource bounds", () => {
  it.each([404, 412])(
    "metadata HTTP%d is not a storage absence/precondition verdict",
    async (status) => {
      const fetchImpl = vi.fn(async () => new Response("", { status }));
      const client = new GoogleCloudObjectClient(
        bucket,
        new GoogleMetadataTokens(fetchImpl),
        fetchImpl,
      );
      await expect(client.get("key", 100)).rejects.toMatchObject({
        service: "metadata",
        status,
      });
      const store = new GcsDocumentArtifactStoreAdapter(client);
      await expect(
        store.putIfAbsent({
          kind: "placard",
          subjectId: "key",
          mimeType: "application/pdf",
          bytes,
        }),
      ).rejects.toMatchObject({ service: "metadata", status });
      expect(fetchImpl.mock.calls).toHaveLength(2); // No GCS read fallback following credential failure.
    },
  );
  it("a missing pinned generation is not reinterpreted as missing current object", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(metadata()))
      .mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(
      new GoogleCloudObjectClient(bucket, tokens, fetchImpl).get("key", 100),
    ).rejects.toMatchObject({ service: "storage", status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("bounds oversized metadata before parsing", async () => {
    const fetchImpl = vi.fn(async () => new Response("x".repeat(65537)));
    await expect(
      new GoogleCloudObjectClient(bucket, tokens, fetchImpl).get("key", 100),
    ).rejects.toThrow("exceeds limit");
  });
  it("bounds oversized media against observed object length", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(metadata()))
      .mockResolvedValueOnce(new Response("x".repeat(bytes.length + 1)));
    await expect(
      new GoogleCloudObjectClient(bucket, tokens, fetchImpl).get("key", 100),
    ).rejects.toThrow("exceeds limit");
  });
  it("cancels a held response reader at the operation deadline", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(metadata()))
      .mockResolvedValueOnce(new Response(stream));
    const pending = expect(
      new GoogleCloudObjectClient(bucket, tokens, fetchImpl, 100).get(
        "key",
        100,
      ),
    ).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(101);
    await pending;
    expect(cancelled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    { name: "foreign" },
    { size: "1" },
    { md5Hash: "AAAAAAAAAAAAAAAAAAAAAA==" },
    { generation: "0" },
  ])("rejects unrelated upload acknowledgement %j", async (bad) => {
    const client = new GoogleCloudObjectClient(
      bucket,
      tokens,
      vi.fn(async () => json(metadata(bad))),
    );
    await expect(
      client.put("key", bytes, "application/pdf", {}, null),
    ).rejects.toThrow();
  });
  it("does not retry or reinterpret an ambiguous upload500", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }));
    const store = new GcsDocumentArtifactStoreAdapter(
      new GoogleCloudObjectClient(bucket, tokens, fetchImpl),
    );
    await expect(
      store.putIfUnchanged(
        {
          kind: "placard",
          subjectId: "key",
          mimeType: "application/pdf",
          bytes,
        },
        null,
      ),
    ).rejects.toBeInstanceOf(GoogleCloudHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([Buffer.alloc(0), Buffer.alloc(10 * 1024 * 1024 + 1)])(
    "rejects invalid proof size before issuing any network request",
    async (input) => {
      const fetchImpl = vi.fn();
      const storage = new GcsRemittanceProofStorageAdapter(
        new GoogleCloudObjectClient(bucket, tokens, fetchImpl),
      );
      await expect(
        storage.stage({ bytes: input, contentType: "application/pdf" }),
      ).rejects.toThrow();
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
});

describe("scanner receipt and immutable operation scope", () => {
  function storage(input = bytes) {
    return {
      providerName: "unit-external-storage-boundary",
      availability: () => ({ state: "available" as const }),
      read: vi.fn(async () => ({
        bytes: input,
        contentType: "application/pdf",
      })),
      stage: vi.fn(),
      commit: vi.fn(),
    };
  }
  it("snapshot input and bytes survive caller mutation while identity issuance is held", async () => {
    const mutableBytes = Buffer.from(bytes),
      command = { ...record };
    let release!: (value: string) => void, entered!: () => void;
    const held = new Promise<string>((resolve) => {
      release = resolve;
    });
    const seen = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const auth = {
      ...tokens,
      identityToken: () => {
        entered();
        return held;
      },
    };
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(Buffer.from(init!.body as Uint8Array)).toEqual(bytes);
        expect(new Headers(init?.headers).get("x-content-sha256")).toBe(sha);
        return json({ sha256: sha, sizeBytes: bytes.length, verdict: "clean" });
      },
    );
    const pending = new CloudRunRemittanceProofScannerAdapter(
      storage(mutableBytes),
      origin,
      1000,
      auth,
      fetchImpl,
    ).scan(command);
    await seen;
    command.contentHash = "0".repeat(64);
    command.sizeBytes = 1;
    mutableBytes.fill(0);
    release("fixture");
    expect(await pending).toMatchObject({ scanState: "clean" });
  });
  it("does not call scanner for a wrong storage identity", async () => {
    const fetchImpl = vi.fn();
    const adapter = new CloudRunRemittanceProofScannerAdapter(
      storage(Buffer.from("wrong")),
      origin,
      1000,
      tokens,
      fetchImpl,
    );
    await expect(adapter.scan(record)).rejects.toThrow("identity mismatch");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("rejects unbounded and non-definitive response shapes", async () => {
    for (const response of [
      new Response("x".repeat(4097)),
      json(null),
      json({ sha256: sha, sizeBytes: bytes.length, verdict: true }),
    ]) {
      const adapter = new CloudRunRemittanceProofScannerAdapter(
        storage(),
        origin,
        1000,
        tokens,
        vi.fn(async () => response),
      );
      await expect(adapter.scan(record)).rejects.toThrow();
    }
  });
  it("a held ID token cannot dispatch late after the scanner deadline", async () => {
    vi.useFakeTimers();
    let release!: (value: string) => void;
    const held = new Promise<string>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn();
    const adapter = new CloudRunRemittanceProofScannerAdapter(
      storage(),
      origin,
      100,
      { ...tokens, identityToken: () => held },
      fetchImpl,
    );
    const pending = expect(adapter.scan(record)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(101);
    await pending;
    release("late-fixture");
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
