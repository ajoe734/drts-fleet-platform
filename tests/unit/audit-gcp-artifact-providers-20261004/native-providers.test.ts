import { FleetDocumentStorageService } from "../../../apps/api/src/modules/fleet-partner/fleet-document-storage.service";
import { FleetPartnerCaseService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { SupplyDocumentService } from "../../../apps/api/src/modules/fleet-partner/supply-document.service";
import { SupplySubmissionService } from "../../../apps/api/src/modules/fleet-partner/supply-submission.service";
import { SupplySubmissionRepository } from "../../../apps/api/src/modules/fleet-partner/supply-submission.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { fleetIdentity } from "../helpers/fleet-document-fixture";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
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
const pngBytes = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da6338639c060003340166067b33000000000049454e44ae426082",
  "hex",
);
const jpegBytes = Buffer.from(
  "ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbfdffd9",
  "hex",
);
const photoFixtures = [
  {
    label: "PNG",
    fileName: "native-photo.png",
    contentType: "image/png" as const,
    alternateMime: "image/jpeg" as const,
    bytes: pngBytes,
    byteLength: 69,
    sha256: "2128be2646bad332aa1e97b2676d9f960a43ff1a9d80bc6baf42c2d131034b83",
  },
  {
    label: "JPEG",
    fileName: "native-photo.jpg",
    contentType: "image/jpeg" as const,
    alternateMime: "image/png" as const,
    bytes: jpegBytes,
    byteLength: 332,
    sha256: "2873aca24970d8ab5f392f0d694229e3b14cf65c9425cadd92a8295399576288",
  },
] as const;

function assertValidPhotoFixture(photo: (typeof photoFixtures)[number]) {
  expect(photo.bytes.length).toBe(photo.byteLength);
  expect(sha(photo.bytes)).toBe(photo.sha256);
  expect(photo.bytes.some((b) => b > 0x7f)).toBe(true);
  expect(
    Buffer.from(photo.bytes.toString("utf8"), "utf8").equals(photo.bytes),
  ).toBe(false);
  if (photo.contentType === "image/png") {
    expect(photo.bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(photo.bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(photo.bytes.readUInt32BE(16)).toBe(1);
    expect(photo.bytes.readUInt32BE(20)).toBe(1);
    expect(photo.bytes.subarray(37, 41).toString("ascii")).toBe("IDAT");
    const idatLen = photo.bytes.readUInt32BE(33);
    expect(inflateSync(photo.bytes.subarray(41, 41 + idatLen))).toEqual(
      Buffer.from([0x00, 0xcc, 0x33, 0x66]),
    );
    expect(photo.bytes.subarray(photo.bytes.length - 12)).toEqual(
      Buffer.from("0000000049454e44ae426082", "hex"),
    );
  } else {
    expect(photo.bytes.subarray(0, 4)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    );
    expect(photo.bytes.subarray(6, 11).toString("ascii")).toBe("JFIF\0");
    expect(photo.bytes.includes(Buffer.from([0xff, 0xdb]))).toBe(true);
    expect(photo.bytes.includes(Buffer.from([0xff, 0xc0]))).toBe(true);
    expect(photo.bytes.includes(Buffer.from([0xff, 0xc4]))).toBe(true);
    expect(photo.bytes.includes(Buffer.from([0xff, 0xda]))).toBe(true);
    expect(photo.bytes.subarray(photo.bytes.length - 2)).toEqual(
      Buffer.from([0xff, 0xd9]),
    );
  }
}
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
        const mediaHeaderStart = descriptorEnd + `\r\n--${boundary}\r\n`.length;
        const mediaHeaderEnd = payload.indexOf("\r\n\r\n", mediaHeaderStart);
        const mediaHeaders = payload
          .subarray(mediaHeaderStart, mediaHeaderEnd)
          .toString("utf8");
        const mediaType = /^Content-Type: ([^\r\n]+)$/im.exec(
          mediaHeaders,
        )?.[1];
        // The genuine GCS boundary returns400 for conflicting media/metadata
        // MIME. Do not let the external transport mock hide this contract.
        if (mediaType !== descriptor.contentType)
          return json(
            { error: { code: 400, errors: [{ reason: "invalid" }] } },
            400,
          );
        const dataStart = mediaHeaderEnd + 4;
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
  it.each([
    ["fleet-upload-intent", "application/json"],
    ["fleet-upload-scan", "application/json"],
    ["fleet-case-attachments", "application/json"],
    ["placard", "application/pdf"],
    ["report", "text/csv; charset=utf-8"],
    ["fleet-upload-content", "image/png"],
    ["fleet-upload-content", "image/jpeg"],
    ["fleet-upload-content", "application/octet-stream"],
  ] as const)(
    "matches multipart media MIME for %s / %s",
    async (kind, mimeType) => {
      const io = transport();
      const store = createDocumentArtifactStore(documentEnv);
      const payloadBytes =
        mimeType === "image/png"
          ? pngBytes
          : mimeType === "image/jpeg"
            ? jpegBytes
            : Buffer.from("harmless MIME boundary payload");
      const input = {
        kind,
        subjectId: "mime-boundary",
        mimeType,
        bytes: payloadBytes,
      };
      const created = await store.putIfAbsent(input);
      expect(created.created).toBe(true);
      const storedRow = io.live.get(
        `document-artifacts/${kind}/${input.subjectId}`,
      );
      expect(storedRow?.contentType).toBe(mimeType);
      expect(storedRow?.bytes).toEqual(input.bytes);
      expect(storedRow?.md5Hash).toBe(md5(input.bytes));
      const readback = await createDocumentArtifactStore(documentEnv).get(
        kind,
        input.subjectId,
      );
      expect(readback?.bytes).toEqual(input.bytes);
      expect(readback?.record.mimeType).toBe(mimeType);
      expect(readback?.record.sha256).toBe(sha(input.bytes));
      expect(io.live.size).toBe(1);
    },
  );

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

describe("C125 fleet upload composition with native GCS and Cloud Run scanner", () => {
  it("persists and scans uploaded bytes, then reads the same attachment from a second instance", async () => {
    const cloud = transport();
    const createService = () =>
      new FleetPartnerCaseService(
        undefined,
        undefined,
        undefined,
        new FleetDocumentStorageService(
          createDocumentArtifactStore(documentEnv),
          (storage) =>
            createRemittanceProofScanner(storage, {
              REMITTANCE_PROOF_SCANNER_PROVIDER: "cloud-run-clamd",
              REMITTANCE_PROOF_SCANNER_URL: origin,
            }),
        ),
      );
    const service = createService();
    const bytes = Buffer.from("%PDF real fleet attachment GCS transport");
    const metadata = {
      fileName: "evidence.pdf",
      fileSize: bytes.length,
      contentType: "application/pdf",
    };
    const intent = await service.createAttachmentUploadUrl(
      "METRO_FLEET",
      "cmp_0908",
      "owner",
      metadata,
    );
    await service.uploadAttachmentContent(
      "METRO_FLEET",
      "cmp_0908",
      intent.objectKey,
      Readable.from([bytes]),
      "application/octet-stream",
    );
    const record = await createService().confirmAttachmentUpload(
      "METRO_FLEET",
      "cmp_0908",
      "owner",
      { ...metadata, ...intent, checksumSha256: sha(bytes) },
    );
    const read = await createService().downloadAttachmentForReview(
      "cmp_0908",
      record.attachmentId,
    );
    expect(read.fileContent).toEqual(bytes);
    expect(
      cloud.live.get(
        `document-artifacts/fleet-upload-content/${encodeURIComponent(intent.objectKey)}`,
      )?.bytes,
    ).toEqual(bytes);
    expect(cloud.requests.filter((url) => url.origin === origin)).toHaveLength(
      1,
    );
    cloud.scanWith((content) =>
      json({
        sha256: sha(content),
        sizeBytes: content.length,
        verdict: "infected",
      }),
    );
    const infected = await service.createAttachmentUploadUrl(
      "METRO_FLEET",
      "cmp_0908",
      "owner",
      metadata,
    );
    await expect(
      service.uploadAttachmentContent(
        "METRO_FLEET",
        "cmp_0908",
        infected.objectKey,
        Readable.from([bytes]),
        "application/octet-stream",
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_SCAN_REJECTED" });
    await expect(
      createService().confirmAttachmentUpload(
        "METRO_FLEET",
        "cmp_0908",
        "owner",
        { ...metadata, ...infected },
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });
  });

  it.each(photoFixtures)(
    "composes native GCS factory, multipart client and Cloud Run scanner for Case $contentType binary lifecycle across instances",
    async (photo) => {
      assertValidPhotoFixture(photo);
      const cloud = transport();
      const createStorage = () =>
        new FleetDocumentStorageService(
          createDocumentArtifactStore(documentEnv),
          (storage) =>
            createRemittanceProofScanner(storage, {
              REMITTANCE_PROOF_SCANNER_PROVIDER: "cloud-run-clamd",
              REMITTANCE_PROOF_SCANNER_URL: origin,
            }),
        );
      const createCaseService = () =>
        new FleetPartnerCaseService(
          undefined,
          undefined,
          undefined,
          createStorage(),
        );
      const controllerFor = (service: FleetPartnerCaseService) =>
        new FleetPartnerController(
          undefined as never,
          undefined as never,
          undefined as never,
          undefined as never,
          undefined as never,
          service,
        );
      const partnerIdentity = { ...fleetIdentity, partnerId: "METRO_FLEET" };
      const metadata = {
        fileName: photo.fileName,
        fileSize: photo.bytes.length,
        contentType: photo.contentType,
      };
      const service = createCaseService();
      const intent = await service.createAttachmentUploadUrl(
        "METRO_FLEET",
        "cmp_0908",
        "owner",
        metadata,
      );
      await expect(
        createCaseService().confirmAttachmentUpload(
          "METRO_FLEET",
          "cmp_0908",
          "owner",
          {
            ...metadata,
            ...intent,
            checksumSha256: photo.sha256,
          },
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });

      const uploaded = await service.uploadAttachmentContent(
        "METRO_FLEET",
        "cmp_0908",
        intent.objectKey,
        Readable.from([photo.bytes]),
        "application/octet-stream",
      );
      expect(uploaded).toEqual({
        checksumSha256: photo.sha256,
        fileSize: photo.bytes.length,
        scanState: "clean",
      });

      const contentKey = `document-artifacts/fleet-upload-content/${encodeURIComponent(intent.objectKey)}`;
      const scanKey = `document-artifacts/fleet-upload-scan/${encodeURIComponent(intent.objectKey)}`;
      const gcsContent = cloud.live.get(contentKey)!;
      expect(gcsContent.contentType).toBe(photo.contentType);
      expect(gcsContent.bytes.equals(photo.bytes)).toBe(true);
      expect(gcsContent.size).toBe(String(photo.byteLength));
      expect(gcsContent.md5Hash).toBe(md5(photo.bytes));

      const gcsScan = JSON.parse(
        cloud.live.get(scanKey)!.bytes.toString("utf8"),
      );
      expect(gcsScan).toMatchObject({
        sha256: photo.sha256,
        size: photo.byteLength,
        contentType: photo.contentType,
      });
      expect(
        cloud.requests.filter((url) => url.origin === origin),
      ).toHaveLength(1);

      const utf8Corrupted = Buffer.from(photo.bytes.toString("utf8"), "utf8");
      const utf8CorruptedSha = sha(utf8Corrupted);
      expect(utf8CorruptedSha).not.toBe(photo.sha256);

      await expect(
        createCaseService().confirmAttachmentUpload(
          "METRO_FLEET",
          "cmp_0908",
          "owner",
          {
            ...metadata,
            ...intent,
            checksumSha256: utf8CorruptedSha,
          },
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });
      for (const badMime of ["application/pdf", photo.alternateMime]) {
        await expect(
          createCaseService().confirmAttachmentUpload(
            "METRO_FLEET",
            "cmp_0908",
            "owner",
            {
              ...metadata,
              ...intent,
              contentType: badMime,
              checksumSha256: photo.sha256,
            },
          ),
        ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });
      }

      const record = await createCaseService().confirmAttachmentUpload(
        "METRO_FLEET",
        "cmp_0908",
        "owner",
        {
          ...metadata,
          ...intent,
          checksumSha256: photo.sha256,
        },
      );
      expect(record.contentType).toBe(photo.contentType);
      expect(record.fileSize).toBe(photo.byteLength);

      const secondInstance = createCaseService();
      const grant = await secondInstance.getAttachmentReadUrl(
        "METRO_FLEET",
        "cmp_0908",
        record.attachmentId,
      );
      const params = new URL(grant.downloadUrl, "https://local.invalid")
        .searchParams;
      const ownerRead = await secondInstance.verifyAndGetAttachmentForDownload(
        "METRO_FLEET",
        "cmp_0908",
        record.attachmentId,
        Number(params.get("expiresAt")),
        params.get("sig")!,
      );
      expect(ownerRead.fileContent.equals(photo.bytes)).toBe(true);
      expect(sha(ownerRead.fileContent)).toBe(photo.sha256);
      expect(ownerRead.attachment.contentType).toBe(photo.contentType);
      expect(ownerRead.fileContent.length).toBe(photo.byteLength);

      const thirdInstance = createCaseService();
      const reviewRead = await thirdInstance.downloadAttachmentForReview(
        "cmp_0908",
        record.attachmentId,
      );
      expect(reviewRead.fileContent.equals(photo.bytes)).toBe(true);
      expect(reviewRead.attachment.contentType).toBe(photo.contentType);

      const reviewRes = { setHeader: vi.fn(), send: vi.fn() };
      await controllerFor(createCaseService()).downloadCaseAttachmentForReview(
        "cmp_0908",
        record.attachmentId,
        { ...partnerIdentity, realm: "platform", actorType: "platform_admin" },
        reviewRes,
      );
      expect(reviewRes.send).toHaveBeenCalledWith(photo.bytes);
      expect(reviewRes.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        photo.contentType,
      );
      expect(reviewRes.setHeader).toHaveBeenCalledWith(
        "Content-Length",
        photo.byteLength,
      );

      await expect(
        createCaseService().getAttachmentReadUrl(
          "OTHER",
          "cmp_0908",
          record.attachmentId,
        ),
      ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED" });
      await expect(
        controllerFor(createCaseService()).downloadCaseAttachmentForReview(
          "cmp_0908",
          record.attachmentId,
          partnerIdentity,
          { setHeader: vi.fn(), send: vi.fn() },
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_REVIEW_DENIED" });

      gcsContent.bytes = utf8Corrupted;
      gcsContent.size = String(utf8Corrupted.length);
      gcsContent.md5Hash = md5(utf8Corrupted);
      await expect(
        createCaseService().downloadAttachmentForReview(
          "cmp_0908",
          record.attachmentId,
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });

      gcsContent.bytes = Buffer.from(photo.bytes);
      gcsContent.size = String(photo.byteLength);
      gcsContent.md5Hash = md5(photo.bytes);

      cloud.scanWith((content) =>
        json({
          sha256: sha(content),
          sizeBytes: content.length,
          verdict: "infected",
        }),
      );
      const infected = await service.createAttachmentUploadUrl(
        "METRO_FLEET",
        "cmp_0908",
        "owner",
        metadata,
      );
      await expect(
        service.uploadAttachmentContent(
          "METRO_FLEET",
          "cmp_0908",
          infected.objectKey,
          Readable.from([photo.bytes]),
          "application/octet-stream",
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_SCAN_REJECTED" });
      await expect(
        createCaseService().confirmAttachmentUpload(
          "METRO_FLEET",
          "cmp_0908",
          "owner",
          { ...metadata, ...infected },
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });

      cloud.scanWith((content) =>
        json({
          sha256: "0".repeat(64),
          sizeBytes: content.length,
          verdict: "clean",
        }),
      );
      const mismatchedScan = await service.createAttachmentUploadUrl(
        "METRO_FLEET",
        "cmp_0908",
        "owner",
        metadata,
      );
      await expect(
        service.uploadAttachmentContent(
          "METRO_FLEET",
          "cmp_0908",
          mismatchedScan.objectKey,
          Readable.from([photo.bytes]),
          "application/octet-stream",
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_SCANNER_UNAVAILABLE" });
    },
  );

  it.each(photoFixtures)(
    "composes native GCS factory, multipart client and Cloud Run scanner for Supply other $contentType binary lifecycle across instances",
    async (photo) => {
      assertValidPhotoFixture(photo);
      const cloud = transport();
      const repository = new SupplySubmissionRepository();
      const createStorage = () =>
        new FleetDocumentStorageService(
          createDocumentArtifactStore(documentEnv),
          (storage) =>
            createRemittanceProofScanner(storage, {
              REMITTANCE_PROOF_SCANNER_PROVIDER: "cloud-run-clamd",
              REMITTANCE_PROOF_SCANNER_URL: origin,
            }),
        );
      const createSupplyInstance = () => {
        const submissions = new SupplySubmissionService(
          repository,
          new RegulatoryRegistryService(
            undefined as never,
            undefined as never,
            undefined as never,
          ),
        );
        const documents = new SupplyDocumentService(
          submissions,
          repository,
          createStorage(),
        );
        return { submissions, documents };
      };
      const controllerFor = (documents: SupplyDocumentService) =>
        new FleetPartnerController(
          undefined as never,
          undefined as never,
          documents,
          undefined as never,
          undefined as never,
          undefined,
        );
      const partnerIdentity = { ...fleetIdentity, partnerId: "METRO_FLEET" };
      const firstInstance = createSupplyInstance();
      const draft = await firstInstance.submissions.createDriverDraft(
        "METRO_FLEET",
        "owner",
        {
          name: "Native GCS photo upload test",
          mobile: "+886900111222",
          professionalDriverLicenseNo: "TEST-LICENSE",
          professionalDriverLicenseExpiry: "2027-12-31",
          taxiDriverRegistrationNo: "TEST-REG",
          taxiDriverRegistrationArea: "TPE",
          taxiDriverRegistrationExpiry: "2027-12-31",
          supportedServiceProductCodes: ["taxi_realtime"],
          preferredVehicleSubmissionId: null,
        },
      );
      const submissionId = draft.submission.submissionId;
      const metadata = {
        documentType: "other" as const,
        originalFileName: photo.fileName,
        contentType: photo.contentType,
        expectedRevisionNo: 1,
      };
      const intent = await firstInstance.documents.createUploadUrl(
        "METRO_FLEET",
        submissionId,
        "owner",
        metadata,
      );
      const confirmCommand = {
        ...metadata,
        objectKey: intent.objectKey,
        fileSize: photo.bytes.length,
        checksumSha256: photo.sha256,
      };
      await expect(
        createSupplyInstance().documents.confirmUpload(
          "METRO_FLEET",
          submissionId,
          "owner",
          confirmCommand,
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });

      const uploaded = await firstInstance.documents.uploadContent(
        "METRO_FLEET",
        submissionId,
        intent.objectKey,
        Readable.from([photo.bytes]),
        "application/octet-stream",
      );
      expect(uploaded).toEqual({
        checksumSha256: photo.sha256,
        fileSize: photo.bytes.length,
        scanState: "clean",
      });

      const contentKey = `document-artifacts/fleet-upload-content/${encodeURIComponent(intent.objectKey)}`;
      const scanKey = `document-artifacts/fleet-upload-scan/${encodeURIComponent(intent.objectKey)}`;
      const gcsContent = cloud.live.get(contentKey)!;
      expect(gcsContent.contentType).toBe(photo.contentType);
      expect(gcsContent.bytes.equals(photo.bytes)).toBe(true);
      expect(gcsContent.size).toBe(String(photo.byteLength));
      expect(gcsContent.md5Hash).toBe(md5(photo.bytes));

      const gcsScan = JSON.parse(
        cloud.live.get(scanKey)!.bytes.toString("utf8"),
      );
      expect(gcsScan).toMatchObject({
        sha256: photo.sha256,
        size: photo.byteLength,
        contentType: photo.contentType,
      });
      expect(
        cloud.requests.filter((url) => url.origin === origin),
      ).toHaveLength(1);

      const utf8Corrupted = Buffer.from(photo.bytes.toString("utf8"), "utf8");
      const utf8CorruptedSha = sha(utf8Corrupted);
      await expect(
        createSupplyInstance().documents.confirmUpload(
          "METRO_FLEET",
          submissionId,
          "owner",
          {
            ...confirmCommand,
            checksumSha256: utf8CorruptedSha,
          },
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });
      for (const badMime of ["application/pdf", photo.alternateMime]) {
        await expect(
          createSupplyInstance().documents.confirmUpload(
            "METRO_FLEET",
            submissionId,
            "owner",
            {
              ...confirmCommand,
              contentType: badMime,
            },
          ),
        ).rejects.toMatchObject({ code: "UPLOAD_URL_INVALID" });
      }

      const doc = await createSupplyInstance().documents.confirmUpload(
        "METRO_FLEET",
        submissionId,
        "owner",
        confirmCommand,
      );
      expect(doc.documentType).toBe("other");
      expect(doc.contentType).toBe(photo.contentType);
      expect(doc.fileSize).toBe(photo.byteLength);
      expect(doc.checksumSha256).toBe(photo.sha256);

      const secondRead =
        await createSupplyInstance().documents.downloadDocument(
          "METRO_FLEET",
          submissionId,
          doc.documentId,
        );
      expect(secondRead.bytes.equals(photo.bytes)).toBe(true);
      expect(secondRead.contentType).toBe(photo.contentType);
      expect(secondRead.fileSize).toBe(photo.byteLength);
      expect(secondRead.checksumSha256).toBe(photo.sha256);

      const ownerRes = { setHeader: vi.fn(), send: vi.fn() };
      await controllerFor(
        createSupplyInstance().documents,
      ).downloadSupplyDocument(
        "METRO_FLEET",
        submissionId,
        doc.documentId,
        partnerIdentity,
        ownerRes,
      );
      expect(ownerRes.send).toHaveBeenCalledWith(photo.bytes);
      expect(ownerRes.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        photo.contentType,
      );
      expect(ownerRes.setHeader).toHaveBeenCalledWith(
        "Content-Length",
        photo.byteLength,
      );

      const reviewRes = { setHeader: vi.fn(), send: vi.fn() };
      await controllerFor(
        createSupplyInstance().documents,
      ).downloadSupplyDocumentForReview(
        submissionId,
        doc.documentId,
        { ...partnerIdentity, realm: "platform", actorType: "platform_admin" },
        reviewRes,
      );
      expect(reviewRes.send).toHaveBeenCalledWith(photo.bytes);
      expect(reviewRes.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        photo.contentType,
      );
      expect(reviewRes.setHeader).toHaveBeenCalledWith(
        "Content-Length",
        photo.byteLength,
      );

      await expect(
        createSupplyInstance().documents.downloadDocument(
          "OTHER",
          submissionId,
          doc.documentId,
        ),
      ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
      await expect(
        controllerFor(createSupplyInstance().documents).downloadSupplyDocument(
          "METRO_FLEET",
          submissionId,
          doc.documentId,
          { ...partnerIdentity, realm: "tenant" },
          { setHeader: vi.fn(), send: vi.fn() },
        ),
      ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
      await expect(
        controllerFor(
          createSupplyInstance().documents,
        ).downloadSupplyDocumentForReview(
          submissionId,
          doc.documentId,
          partnerIdentity,
          { setHeader: vi.fn(), send: vi.fn() },
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_REVIEW_DENIED" });

      gcsContent.bytes = utf8Corrupted;
      gcsContent.size = String(utf8Corrupted.length);
      gcsContent.md5Hash = md5(utf8Corrupted);
      await expect(
        createSupplyInstance().documents.downloadDocument(
          "METRO_FLEET",
          submissionId,
          doc.documentId,
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_CONTENT_MISMATCH" });

      gcsContent.bytes = Buffer.from(photo.bytes);
      gcsContent.size = String(photo.byteLength);
      gcsContent.md5Hash = md5(photo.bytes);

      cloud.scanWith((content) =>
        json({
          sha256: sha(content),
          sizeBytes: content.length,
          verdict: "infected",
        }),
      );
      const infectedMetadata = { ...metadata, expectedRevisionNo: 2 };
      const infected = await createSupplyInstance().documents.createUploadUrl(
        "METRO_FLEET",
        submissionId,
        "owner",
        infectedMetadata,
      );
      await expect(
        createSupplyInstance().documents.uploadContent(
          "METRO_FLEET",
          submissionId,
          infected.objectKey,
          Readable.from([photo.bytes]),
          "application/octet-stream",
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_SCAN_REJECTED" });
      await expect(
        createSupplyInstance().documents.confirmUpload(
          "METRO_FLEET",
          submissionId,
          "owner",
          {
            ...infectedMetadata,
            objectKey: infected.objectKey,
            fileSize: photo.bytes.length,
            checksumSha256: photo.sha256,
          },
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_SCANNED" });

      cloud.scanWith((content) =>
        json({
          sha256: "0".repeat(64),
          sizeBytes: content.length,
          verdict: "clean",
        }),
      );
      const mismatchedScan =
        await createSupplyInstance().documents.createUploadUrl(
          "METRO_FLEET",
          submissionId,
          "owner",
          infectedMetadata,
        );
      await expect(
        createSupplyInstance().documents.uploadContent(
          "METRO_FLEET",
          submissionId,
          mismatchedScan.objectKey,
          Readable.from([photo.bytes]),
          "application/octet-stream",
        ),
      ).rejects.toMatchObject({ code: "DOCUMENT_SCANNER_UNAVAILABLE" });
    },
  );
});
