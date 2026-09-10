import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  InMemoryDocumentArtifactStore,
  resolveDocumentArtifact,
} from "../../../../apps/api/src/common/document-artifacts";

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("InMemoryDocumentArtifactStore", () => {
  it("stores and returns the exact bytes it was given, with a computable sha256", () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("%PDF-1.4 tenant invoice body", "utf8");

    const record = store.put({
      kind: "tenant-invoice",
      subjectId: "invoice-1",
      mimeType: "application/pdf",
      bytes,
    });

    expect(record.sha256).toBe(sha256(bytes));
    expect(record.byteLength).toBe(bytes.length);
    expect(record.mimeType).toBe("application/pdf");

    const entry = store.get("tenant-invoice", "invoice-1");
    expect(entry).not.toBeNull();
    expect(entry!.bytes.equals(bytes)).toBe(true);
    expect(entry!.record.sha256).toBe(sha256(bytes));
  });

  it("returns null for a (kind, subjectId) pair that was never stored", () => {
    const store = new InMemoryDocumentArtifactStore();
    expect(store.get("tenant-invoice", "does-not-exist")).toBeNull();
  });

  it("keeps kind and subjectId as a composite key: no cross-kind leakage", () => {
    const store = new InMemoryDocumentArtifactStore();
    store.put({
      kind: "placard",
      subjectId: "shared-id",
      mimeType: "application/pdf",
      bytes: Buffer.from("placard body"),
    });

    // Same subjectId, different kind: must not resolve to the placard's bytes.
    expect(store.get("tenant-invoice", "shared-id")).toBeNull();
    expect(store.get("report", "shared-id")).toBeNull();
    expect(store.get("placard", "shared-id")).not.toBeNull();
  });

  it("rejects kinds outside this period's scope", () => {
    const store = new InMemoryDocumentArtifactStore();
    expect(() =>
      store.put({
        // Filing packages are metadata-only by decision (SD-DP-20260820-012);
        // this store must not become a way to smuggle bytes in for them.
        kind: "filing-pdf" as never,
        subjectId: "x",
        mimeType: "application/pdf",
        bytes: Buffer.from("x"),
      }),
    ).toThrow(/does not accept kind/);
  });

  it("rejects empty bytes rather than storing a fake empty file", () => {
    const store = new InMemoryDocumentArtifactStore();
    expect(() =>
      store.put({
        kind: "report",
        subjectId: "r-1",
        mimeType: "application/pdf",
        bytes: Buffer.alloc(0),
      }),
    ).toThrow(/non-empty bytes/);
  });

  it("defensively copies bytes on the way in and out", () => {
    const store = new InMemoryDocumentArtifactStore();
    const original = Buffer.from("original content");
    store.put({
      kind: "report",
      subjectId: "r-1",
      mimeType: "text/plain",
      bytes: original,
    });

    // Mutating the caller's buffer after put() must not corrupt storage.
    original.write("TAMPERED!!!!!!!!", 0);

    const firstRead = store.get("report", "r-1")!;
    expect(firstRead.bytes.toString("utf8")).toBe("original content");

    // Mutating a buffer returned from get() must not corrupt storage either.
    firstRead.bytes.write("TAMPERED!!!!!!!!", 0);
    const secondRead = store.get("report", "r-1")!;
    expect(secondRead.bytes.toString("utf8")).toBe("original content");
  });

  it("reissuing a link is a client-side act: the stored artifact does not change", () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("placard render v1");
    store.put({
      kind: "placard",
      subjectId: "p-1",
      mimeType: "application/pdf",
      bytes,
    });

    const first = store.get("placard", "p-1")!;
    const second = store.get("placard", "p-1")!;
    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.record.sha256).toBe(second.record.sha256);
  });
});

describe("resolveDocumentArtifact", () => {
  it("reports not_found for an unsupported kind even if the store has entries", () => {
    const store = new InMemoryDocumentArtifactStore();
    store.put({
      kind: "report",
      subjectId: "x",
      mimeType: "application/pdf",
      bytes: Buffer.from("x"),
    });

    expect(
      resolveDocumentArtifact(store, {
        kind: "filing-pdf",
        subjectId: "x",
        manifestHash: "irrelevant",
      }),
    ).toEqual({ status: "not_found" });
  });

  it("reports not_found for an in-scope kind that was never materialised", () => {
    const store = new InMemoryDocumentArtifactStore();
    expect(
      resolveDocumentArtifact(store, {
        kind: "tenant-invoice",
        subjectId: "never-produced",
        manifestHash: "abc",
      }),
    ).toEqual({ status: "not_found" });
  });

  it("reports content_mismatch when the link's manifest hash no longer matches the stored bytes", () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("current placard render");
    const record = store.put({
      kind: "placard",
      subjectId: "p-1",
      mimeType: "application/pdf",
      bytes,
    });

    const resolution = resolveDocumentArtifact(store, {
      kind: "placard",
      subjectId: "p-1",
      manifestHash: "0".repeat(64),
    });

    expect(resolution.status).toBe("content_mismatch");
    if (resolution.status === "content_mismatch") {
      expect(resolution.actualSha256).toBe(record.sha256);
    }
  });

  it("resolves ok with the exact bytes, mime type and a matching sha256 when the manifest hash matches", () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("tenant invoice PDF bytes");
    const record = store.put({
      kind: "tenant-invoice",
      subjectId: "invoice-9",
      mimeType: "application/pdf",
      bytes,
    });

    const resolution = resolveDocumentArtifact(store, {
      kind: "tenant-invoice",
      subjectId: "invoice-9",
      manifestHash: record.sha256,
    });

    expect(resolution.status).toBe("ok");
    if (resolution.status === "ok") {
      expect(resolution.bytes.equals(bytes)).toBe(true);
      expect(resolution.mimeType).toBe("application/pdf");
      expect(resolution.sha256).toBe(sha256(bytes));
      expect(resolution.byteLength).toBe(bytes.length);
    }
  });
});
