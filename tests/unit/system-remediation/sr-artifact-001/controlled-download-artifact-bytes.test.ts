import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { createControlledDownloadMetadata } from "../../../../apps/api/src/common/controlled-download";
import { InMemoryDocumentArtifactStore } from "../../../../apps/api/src/common/document-artifacts";
import { ControlledDownloadController } from "../../../../apps/api/src/modules/controlled-download/controlled-download.controller";

// Structural stand-in for `@nestjs/common`'s `StreamableFile`. The root
// tsconfig's `tests/**/*.ts` compile has no path to apps/api's own
// `node_modules/@nestjs/common` (pnpm keeps it package-local), so a type-only
// `import("@nestjs/common")` resolves fine from apps/api but fails under the
// root `tsc -p tsconfig.json` pass. The controller still returns a real
// `StreamableFile` at runtime; this just avoids naming its package for typing.
type StreamableFileLike = {
  getStream(): NodeJS.ReadableStream;
  getHeaders(): { type?: string };
};

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function issue(
  kind: string,
  subjectId: string,
  manifestHash: string,
  overrides: { createdAt?: string; ttlMinutes?: number } = {},
) {
  return createControlledDownloadMetadata({
    kind,
    subjectId,
    manifestHash,
    ...overrides,
  });
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

function statusOf(call: () => unknown): number {
  try {
    call();
  } catch (error) {
    return (error as ApiRequestError).getStatus();
  }
  throw new Error("expected the call to throw");
}

describe("controlled download serves real bytes for materialised artifacts", () => {
  it("returns the exact bytes and correct MIME type for an existing tenant invoice, with a computable sha256", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("%PDF-1.4 tenant invoice bytes", "utf8");
    const record = store.put({
      kind: "tenant-invoice",
      subjectId: "invoice-42",
      mimeType: "application/pdf",
      bytes,
    });

    const controller = new ControlledDownloadController(store);
    const params = paramsOf(
      issue("tenant-invoice", "invoice-42", record.sha256).downloadUrl,
    );

    const file = resolve(controller, "tenant-invoice", "invoice-42", params);
    expect(file).toHaveProperty("getStream");

    const streamable = file as StreamableFileLike;
    const returnedBytes = await drain(streamable.getStream());

    expect(returnedBytes.equals(bytes)).toBe(true);
    expect(sha256(returnedBytes)).toBe(record.sha256);
    expect(streamable.getHeaders().type).toBe("application/pdf");
  });

  it("returns the exact bytes for an existing placard", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("placard render bytes");
    const record = store.put({
      kind: "placard",
      subjectId: "placard-7",
      mimeType: "application/pdf",
      bytes,
    });

    const controller = new ControlledDownloadController(store);
    const params = paramsOf(
      issue("placard", "placard-7", record.sha256).downloadUrl,
    );

    const streamable = resolve(
      controller,
      "placard",
      "placard-7",
      params,
    ) as StreamableFileLike;
    expect((await drain(streamable.getStream())).equals(bytes)).toBe(true);
  });

  it("still fails explicitly for a kind/subjectId that was never materialised", () => {
    const store = new InMemoryDocumentArtifactStore();
    const controller = new ControlledDownloadController(store);
    const params = paramsOf(
      issue("tenant-invoice", "invoice-does-not-exist", "irrelevant-hash")
        .downloadUrl,
    );

    expect(
      codeOf(() =>
        resolve(controller, "tenant-invoice", "invoice-does-not-exist", params),
      ),
    ).toBe("ARTIFACT_NOT_MATERIALISED");
  });

  it("rejects an expired link even though the artifact exists", () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("report bytes");
    const record = store.put({
      kind: "report",
      subjectId: "report-1",
      mimeType: "application/pdf",
      bytes,
    });
    const controller = new ControlledDownloadController(store);
    const params = paramsOf(
      issue("report", "report-1", record.sha256, {
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        ttlMinutes: 1,
      }).downloadUrl,
    );

    expect(
      codeOf(() => resolve(controller, "report", "report-1", params)),
    ).toBe("CONTROLLED_DOWNLOAD_EXPIRED");
  });

  it("rejects a tampered link (subject swapped after signing) even though both subjects exist", () => {
    const store = new InMemoryDocumentArtifactStore();
    const recordA = store.put({
      kind: "tenant-invoice",
      subjectId: "invoice-A",
      mimeType: "application/pdf",
      bytes: Buffer.from("invoice A"),
    });
    store.put({
      kind: "tenant-invoice",
      subjectId: "invoice-B",
      mimeType: "application/pdf",
      bytes: Buffer.from("invoice B"),
    });
    const controller = new ControlledDownloadController(store);
    const params = paramsOf(
      issue("tenant-invoice", "invoice-A", recordA.sha256).downloadUrl,
    );

    expect(
      codeOf(() => resolve(controller, "tenant-invoice", "invoice-B", params)),
    ).toBe("CONTROLLED_DOWNLOAD_SIGNATURE_INVALID");
  });

  it("rejects cross-kind (cross-scope) access: a valid link for one kind cannot read another kind's artifact at the same subjectId", () => {
    const store = new InMemoryDocumentArtifactStore();
    store.put({
      kind: "placard",
      subjectId: "shared-id",
      mimeType: "application/pdf",
      bytes: Buffer.from("placard body"),
    });
    const controller = new ControlledDownloadController(store);

    // A link genuinely signed for kind="tenant-invoice", subjectId="shared-id" --
    // there is no tenant-invoice artifact at that id, only a placard one.
    const params = paramsOf(
      issue("tenant-invoice", "shared-id", "0".repeat(64)).downloadUrl,
    );

    expect(
      codeOf(() => resolve(controller, "tenant-invoice", "shared-id", params)),
    ).toBe("ARTIFACT_NOT_MATERIALISED");
  });

  it("rejects a verified, unexpired link whose manifest hash no longer matches the stored artifact", () => {
    const store = new InMemoryDocumentArtifactStore();
    store.put({
      kind: "placard",
      subjectId: "placard-9",
      mimeType: "application/pdf",
      bytes: Buffer.from("current placard render, v2"),
    });
    const controller = new ControlledDownloadController(store);

    // Signed honestly over a stale hash (e.g. the placard was regenerated
    // after this link's manifestHash was computed).
    const staleHash = sha256(Buffer.from("placard render, v1 -- superseded"));
    const params = paramsOf(
      issue("placard", "placard-9", staleHash).downloadUrl,
    );

    expect(
      codeOf(() => resolve(controller, "placard", "placard-9", params)),
    ).toBe("CONTROLLED_DOWNLOAD_CONTENT_MISMATCH");
    expect(
      statusOf(() => resolve(controller, "placard", "placard-9", params)),
    ).toBe(409);
  });

  it("reissuing a URL for the same artifact does not change the bytes served", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("stable invoice bytes across reissue");
    const record = store.put({
      kind: "tenant-invoice",
      subjectId: "invoice-stable",
      mimeType: "application/pdf",
      bytes,
    });
    const controller = new ControlledDownloadController(store);

    const firstLink = issue(
      "tenant-invoice",
      "invoice-stable",
      record.sha256,
    ).downloadUrl;
    // A later reissue: different signedAt/expiresAt, same subject and hash.
    const secondLink = issue(
      "tenant-invoice",
      "invoice-stable",
      record.sha256,
      { createdAt: new Date(Date.now() + 1_000).toISOString() },
    ).downloadUrl;

    const first = resolve(
      controller,
      "tenant-invoice",
      "invoice-stable",
      paramsOf(firstLink),
    ) as StreamableFileLike;
    const second = resolve(
      controller,
      "tenant-invoice",
      "invoice-stable",
      paramsOf(secondLink),
    ) as StreamableFileLike;

    const firstBytes = await drain(first.getStream());
    const secondBytes = await drain(second.getStream());
    expect(firstBytes.equals(bytes)).toBe(true);
    expect(secondBytes.equals(bytes)).toBe(true);
  });

  it("falls back to its own local store when constructed with no arguments, preserving prior behaviour", () => {
    const controller = new ControlledDownloadController();
    const params = paramsOf(
      issue("tenant-invoice", "invoice-1", "e3b0c44298fc1c14").downloadUrl,
    );

    expect(
      codeOf(() => resolve(controller, "tenant-invoice", "invoice-1", params)),
    ).toBe("ARTIFACT_NOT_MATERIALISED");
  });
});
