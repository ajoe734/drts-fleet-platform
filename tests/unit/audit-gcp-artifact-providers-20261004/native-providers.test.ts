import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts/document-artifact-runtime.config";
import {
  createRemittanceProofScanner,
  createRemittanceProofStorage,
} from "../../../apps/api/src/modules/billing-settlement/remittance-proof-runtime.config";
import {
  GoogleCloudObjectClient,
  GoogleMetadataTokens,
} from "../../../apps/api/src/common/google-cloud/google-cloud-object-client";

const bucket = "drts-test-private-artifacts";
const origin = "https://drts-dev-proof-scanner-test-uc.a.run.app";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const md5 = (b: Buffer) => createHash("md5").update(b).digest("base64");
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const documentEnv = {
  NODE_ENV: "production",
  DOCUMENT_ARTIFACT_STORAGE_PROVIDER: "gcs",
  DOCUMENT_ARTIFACT_GCS_BUCKET: bucket,
};
const proofEnv = {
  NODE_ENV: "production",
  REMITTANCE_PROOF_STORAGE_PROVIDER: "gcs",
  REMITTANCE_PROOF_GCS_BUCKET: bucket,
};
interface ObjectRow {
  name: string;
  bucket: string;
  generation: string;
  bytes: Buffer;
  size: string;
  contentType: string;
  metadata: Record<string, string>;
  updated: string;
  md5Hash: string;
}

// External GCS/metadata/scanner transport ONLY. Real configured factories,
// native client, multipart request construction, preconditions, response
// validation and storage/scanner implementations run unchanged.
function transport() {
  const live = new Map<string, ObjectRow>();
  const versions = new Map<string, ObjectRow>();
  const requests: URL[] = [];
  let next = 9007199254741000n; // Never round uint64 generations through Number.
  let beforePut: ((row: ObjectRow) => Promise<void>) | undefined;
  let beforeMedia: (() => void) | undefined;
  let scanner: (bytes: Buffer) => Response = (bytes) =>
    json({ sha256: sha(bytes), sizeBytes: bytes.length, verdict: "clean" });
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.hostname === "metadata.google.internal") {
        expect(new Headers(init?.headers).get("metadata-flavor")).toBe(
          "Google",
        );
        expect(init?.redirect).toBe("error");
        return url.pathname.endsWith("/token")
          ? new Response(
              JSON.stringify({
                access_token: "fixture-access",
                token_type: "Bearer",
                expires_in: 3600,
              }),
              { headers: { "Metadata-Flavor": "Google" } },
            )
          : new Response("fixture.payload.signature", {
              headers: { "Metadata-Flavor": "Google" },
            });
      }
      expect(init?.redirect).toBe("error");
      if (url.origin === origin) {
        expect(url.pathname).toBe("/scan");
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer fixture.payload.signature",
        );
        const bytes = Buffer.from(init!.body as Uint8Array);
        expect(new Headers(init?.headers).get("x-content-sha256")).toBe(
          sha(bytes),
        );
        return scanner(bytes);
      }
      expect(url.origin).toBe("https://storage.googleapis.com");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer fixture-access",
      );
      if (init?.method === "POST") {
        const payload = Buffer.from(init.body as Uint8Array);
        const boundary = new Headers(init.headers)
          .get("content-type")!
          .split("boundary=")[1]!;
        const descriptorStart = payload.indexOf("\r\n\r\n") + 4;
        const descriptorEnd = payload.indexOf(
          `\r\n--${boundary}`,
          descriptorStart,
        );
        const descriptor = JSON.parse(
          payload.subarray(descriptorStart, descriptorEnd).toString("utf8"),
        );
        const dataStart = payload.indexOf("\r\n\r\n", descriptorEnd + 2) + 4;
        const dataEnd = payload.lastIndexOf(`\r\n--${boundary}--\r\n`);
        const bytes = payload.subarray(dataStart, dataEnd);
        expect(descriptor.md5Hash).toBe(md5(bytes));
        const row: ObjectRow = {
          ...descriptor,
          bytes: Buffer.from(bytes),
          bucket,
          generation: String(next++),
          size: String(bytes.length),
          updated: new Date().toISOString(),
        };
        await beforePut?.(row);
        const expected = url.searchParams.get("ifGenerationMatch");
        const current = live.get(row.name);
        if (
          expected !== null &&
          (expected === "0" ? !!current : current?.generation !== expected)
        )
          return json({}, 412);
        live.set(row.name, row);
        versions.set(row.generation, row);
        return json({ ...row, bytes: undefined });
      }
      const key = decodeURIComponent(url.pathname.split("/o/")[1]!);
      if (url.searchParams.get("alt") === "media") {
        beforeMedia?.();
        beforeMedia = undefined;
        const row = versions.get(url.searchParams.get("generation")!);
        return row ? new Response(new Uint8Array(row.bytes)) : json({}, 404);
      }
      const row = live.get(key);
      return row ? json({ ...row, bytes: undefined }) : json({}, 404);
    },
  );
  vi.stubGlobal("fetch", fetchImpl);
  return {
    live,
    versions,
    requests,
    fetchImpl,
    holdPut: (callback: typeof beforePut) => {
      beforePut = callback;
    },
    onMedia: (callback: () => void) => {
      beforeMedia = callback;
    },
    scanWith: (callback: typeof scanner) => {
      scanner = callback;
    },
  };
}
const command = (text: string) => ({
  kind: "placard" as const,
  subjectId: "fixture",
  mimeType: "application/pdf",
  bytes: Buffer.from(text),
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("native GCS shared artifact storage", () => {
  it("reads exact bytes across configured sibling/restarted instances and preserves uint64 generations", async () => {
    const io = transport();
    const a = createDocumentArtifactStore(documentEnv);
    const stored = await a.put(command("%PDF-fixture"));
    expect(stored.generation).toBe("9007199254741000");
    const restarted = createDocumentArtifactStore(documentEnv);
    const read = await restarted.get("placard", "fixture");
    expect(read?.bytes).toEqual(command("%PDF-fixture").bytes);
    expect(read?.record.sha256).toBe(stored.sha256);
    expect(
      io.requests.some(
        (u) => u.searchParams.get("generation") === stored.generation,
      ),
    ).toBe(true);
  });

  it("conditional create retains the actual winner and conditional replace rejects an old generation", async () => {
    transport();
    const a = createDocumentArtifactStore(documentEnv),
      b = createDocumentArtifactStore(documentEnv);
    const first = await a.putIfAbsent(command("first"));
    expect(first.created).toBe(true);
    const loser = await b.putIfAbsent(command("loser"));
    expect(loser).toMatchObject({
      created: false,
      record: { sha256: first.record.sha256 },
    });
    const winner = await b.putIfUnchanged(
      command("winner"),
      first.record.generation,
    );
    expect(winner.applied).toBe(true);
    expect(
      await a.putIfUnchanged(
        command("late old write"),
        first.record.generation,
      ),
    ).toMatchObject({ applied: false, record: winner.record });
    expect((await a.get("placard", "fixture"))?.bytes.toString()).toBe(
      "winner",
    );
  });

  it("a PUT held before acceptance cannot overwrite a replacement that finalizes first", async () => {
    const io = transport();
    const a = createDocumentArtifactStore(documentEnv),
      b = createDocumentArtifactStore(documentEnv);
    const original = await a.put(command("draft"));
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen = new Promise<void>((resolve) => {
      entered = resolve;
    });
    io.holdPut(async (row) => {
      if (row.bytes.toString() === "old") {
        entered();
        await held;
      }
    });
    const late = a.putIfUnchanged(command("old"), original.generation);
    await seen;
    const replacement = await b.putIfUnchanged(
      command("new"),
      original.generation,
    );
    release();
    expect(await late).toMatchObject({
      applied: false,
      record: replacement.record,
    });
    expect(
      (
        await createDocumentArtifactStore(documentEnv).get("placard", "fixture")
      )?.bytes.toString(),
    ).toBe("new");
  });

  it("pins a metadata/body read while the current generation changes", async () => {
    const io = transport();
    const store = createDocumentArtifactStore(documentEnv);
    await store.put(command("old bytes"));
    const old = io.live.get("document-artifacts/placard/fixture")!;
    await store.put(command("new bytes"));
    const current = io.live.get(old.name)!;
    io.live.set(old.name, old);
    io.onMedia(() => {
      io.live.set(old.name, current);
    });
    const read = await store.get("placard", "fixture");
    expect(read?.bytes.toString()).toBe("old bytes");
    expect(read?.record.generation).toBe(old.generation);
  });

  it.each(["bytes", "size", "generation", "name", "md5Hash"])(
    "fails closed on corrupted %s",
    async (field) => {
      const io = transport();
      const store = createDocumentArtifactStore(documentEnv);
      await store.put(command("intact"));
      const row = io.live.get("document-artifacts/placard/fixture")!;
      if (field === "bytes") row.bytes = Buffer.from("tamper");
      if (field === "size") row.size = "9999999999999";
      if (field === "generation") row.generation = "9e19";
      if (field === "name") row.name = "foreign";
      if (field === "md5Hash") row.md5Hash = "bad";
      await expect(store.get("placard", "fixture")).rejects.toThrow();
    },
  );

  it("conditional conflict retains submitted identity despite caller mutation during PUT", async () => {
    const io = transport();
    const store = createDocumentArtifactStore(documentEnv);
    const first = await store.put(command("winner"));
    await store.put({
      ...command("bystander"),
      kind: "report",
      subjectId: "foreign",
    });
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen = new Promise<void>((resolve) => {
      entered = resolve;
    });
    io.holdPut(async (row) => {
      if (row.bytes.toString() === "loser") {
        entered();
        await held;
      }
    });
    const input = command("loser");
    const pending = store.putIfAbsent(input);
    await seen;
    Object.assign(input, { kind: "report", subjectId: "foreign" });
    release();
    expect(await pending).toMatchObject({ created: false, record: first });
  });

  it("missing object returns null without fallback writes", async () => {
    const io = transport();
    expect(
      await createDocumentArtifactStore(documentEnv).get("placard", "missing"),
    ).toBeNull();
    expect(io.live.size).toBe(0);
  });
});

describe("native GCS proof lifecycle and authenticated ClamAV client", () => {
  async function proof() {
    const io = transport();
    const storage = createRemittanceProofStorage(proofEnv);
    const staged = await storage.stage({
      bytes: Buffer.from("%PDF-proof"),
      contentType: "application/pdf",
    });
    const record = await storage.commit(staged);
    return {
      io,
      storage,
      staged,
      record: { ...record, proofId: "proof-fixture" },
    };
  }
  it("single-consumer stage and content-addressed restart bytes use native conditional create", async () => {
    const { record, staged } = await proof();
    const sibling = createRemittanceProofStorage(proofEnv);
    expect((await sibling.read(record.contentHash))?.bytes.toString()).toBe(
      "%PDF-proof",
    );
    await expect(sibling.commit(staged)).rejects.toThrow(
      "already been consumed",
    );
  });
  it("simultaneous sibling commits consume a stage exactly once", async () => {
    transport();
    const a = createRemittanceProofStorage(proofEnv),
      b = createRemittanceProofStorage(proofEnv);
    const staged = await a.stage({
      bytes: Buffer.from("%PDF-concurrent"),
      contentType: "application/pdf",
    });
    const outcomes = await Promise.allSettled([
      a.commit(staged),
      b.commit(staged),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("valid transfer MD5 cannot substitute for proof SHA256 identity", async () => {
    const { io, storage, record } = await proof();
    const row = io.live.get(`remittance-proof/content/${record.contentHash}`)!;
    row.bytes = Buffer.from("%PDF-wrong");
    row.size = String(row.bytes.length);
    row.md5Hash = md5(row.bytes);
    await expect(storage.read(record.contentHash)).rejects.toThrow(
      "identity mismatch",
    );
  });
  it("rejects expired stages and invalid proof identifiers", async () => {
    const io = transport();
    const storage = createRemittanceProofStorage(proofEnv);
    const staged = await storage.stage({
      bytes: Buffer.from("proof"),
      contentType: "application/pdf",
    });
    io.live.get(
      `remittance-proof/staged/${staged.stagedContentRef}`,
    )!.metadata.expires = "0";
    await expect(storage.commit(staged)).rejects.toThrow("expired");
    await expect(storage.read("../other")).rejects.toThrow();
    await expect(
      storage.commit({ stagedContentRef: "../other" }),
    ).rejects.toThrow();
  });
  it.each(["clean", "infected"] as const)(
    "accepts only correlated definitive %s from the authenticated gateway",
    async (verdict) => {
      const { io, storage, record } = await proof();
      io.scanWith((bytes) =>
        json({ sha256: sha(bytes), sizeBytes: bytes.length, verdict }),
      );
      const scanner = createRemittanceProofScanner(storage, {
        REMITTANCE_PROOF_SCANNER_PROVIDER: "cloud-run-clamd",
        REMITTANCE_PROOF_SCANNER_URL: origin,
      });
      expect(await scanner.scan(record)).toMatchObject({
        scanState: verdict === "clean" ? "clean" : "rejected",
      });
      expect(
        io.requests.some((u) => u.searchParams.get("audience") === origin),
      ).toBe(true);
    },
  );
  it.each([
    "malformed",
    "foreign-hash",
    "foreign-size",
    "unknown",
    "unauthorized",
    "unavailable",
  ])("does not convert %s into clean", async (failure) => {
    const { io, storage, record } = await proof();
    io.scanWith((bytes) => {
      if (failure === "malformed") return json({});
      if (failure === "unauthorized") return json({}, 403);
      if (failure === "unavailable") return json({}, 503);
      return json({
        sha256: failure === "foreign-hash" ? "0".repeat(64) : sha(bytes),
        sizeBytes: failure === "foreign-size" ? 1 : bytes.length,
        verdict: failure === "unknown" ? "pending" : "clean",
      });
    });
    const scanner = createRemittanceProofScanner(storage, {
      REMITTANCE_PROOF_SCANNER_PROVIDER: "cloud-run-clamd",
      REMITTANCE_PROOF_SCANNER_URL: origin,
    });
    await expect(scanner.scan(record)).rejects.toThrow();
  });
});

describe("runtime configuration and bounded credentials", () => {
  it("does not replace missing durable providers with fixtures in strict environments", () => {
    expect(
      createRemittanceProofStorage({
        NODE_ENV: "test",
        APP_ENV: "production",
      }).availability().state,
    ).toBe("unavailable");
    expect(() =>
      createRemittanceProofStorage({
        NODE_ENV: "test",
        DRTS_ENV: "staging",
        REMITTANCE_PROOF_STORAGE_PROVIDER: "memory",
      }),
    ).toThrow();
    expect(() =>
      createDocumentArtifactStore({
        ...documentEnv,
        DOCUMENT_ARTIFACT_GCS_BUCKET: "",
      }),
    ).toThrow();
    expect(() =>
      createRemittanceProofStorage({
        ...proofEnv,
        REMITTANCE_PROOF_GCS_BUCKET: "bad/bucket",
      }),
    ).toThrow();
  });
  it.each([
    "http://scanner.run.app",
    "https://scanner.run.app/path",
    "https://user:pass@scanner.run.app",
    "https://scanner.example.org",
    "https://scanner.run.app?x=y",
  ])("rejects unsafe scanner origin %s", (url) => {
    const storage = createRemittanceProofStorage(proofEnv);
    expect(() =>
      createRemittanceProofScanner(storage, {
        REMITTANCE_PROOF_SCANNER_PROVIDER: "cloud-run-clamd",
        REMITTANCE_PROOF_SCANNER_URL: url,
      }),
    ).toThrow();
  });
  it("rejects non-Google metadata response rather than trusting its token", async () => {
    const tokens = new GoogleMetadataTokens(
      vi.fn(async () =>
        json({
          access_token: "fixture",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      ),
    );
    await expect(
      tokens.accessToken(new AbortController().signal),
    ).rejects.toThrow("Invalid metadata response");
  });
  it("bounds even held token acquisition and sends no late storage request", async () => {
    vi.useFakeTimers();
    let release!: (token: string) => void;
    const token = new Promise<string>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn();
    const client = new GoogleCloudObjectClient(
      bucket,
      { accessToken: () => token, identityToken: async () => "unused" },
      fetchImpl,
      100,
    );
    const pending = expect(client.get("object", 100)).rejects.toThrow(
      "timed out",
    );
    await vi.advanceTimersByTimeAsync(101);
    await pending;
    release("late-fixture-token");
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
