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
  it("stores and returns the exact bytes it was given, with a computable sha256", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("%PDF-1.4 tenant invoice body", "utf8");

    const record = await store.put({
      kind: "tenant-invoice",
      subjectId: "invoice-1",
      mimeType: "application/pdf",
      bytes,
    });

    expect(record.sha256).toBe(sha256(bytes));
    expect(record.byteLength).toBe(bytes.length);
    expect(record.mimeType).toBe("application/pdf");

    const entry = await store.get("tenant-invoice", "invoice-1");
    expect(entry).not.toBeNull();
    expect(entry!.bytes.equals(bytes)).toBe(true);
    expect(entry!.record.sha256).toBe(sha256(bytes));
  });

  it("returns null for a (kind, subjectId) pair that was never stored", async () => {
    const store = new InMemoryDocumentArtifactStore();
    expect(await store.get("tenant-invoice", "does-not-exist")).toBeNull();
  });

  it("keeps kind and subjectId as a composite key: no cross-kind leakage", async () => {
    const store = new InMemoryDocumentArtifactStore();
    await store.put({
      kind: "placard",
      subjectId: "shared-id",
      mimeType: "application/pdf",
      bytes: Buffer.from("placard body"),
    });

    // Same subjectId, different kind: must not resolve to the placard's bytes.
    expect(await store.get("tenant-invoice", "shared-id")).toBeNull();
    expect(await store.get("report", "shared-id")).toBeNull();
    expect(await store.get("placard", "shared-id")).not.toBeNull();
  });

  it("rejects kinds outside this period's scope", async () => {
    const store = new InMemoryDocumentArtifactStore();
    await expect(
      store.put({
        // Filing packages are metadata-only by decision (SD-DP-20260820-012);
        // this store must not become a way to smuggle bytes in for them.
        kind: "filing-pdf" as never,
        subjectId: "x",
        mimeType: "application/pdf",
        bytes: Buffer.from("x"),
      }),
    ).rejects.toThrow(/does not accept kind/);
  });

  it("rejects empty bytes rather than storing a fake empty file", async () => {
    const store = new InMemoryDocumentArtifactStore();
    await expect(
      store.put({
        kind: "report",
        subjectId: "r-1",
        mimeType: "application/pdf",
        bytes: Buffer.alloc(0),
      }),
    ).rejects.toThrow(/non-empty bytes/);
  });

  it("defensively copies bytes on the way in and out", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const original = Buffer.from("original content");
    await store.put({
      kind: "report",
      subjectId: "r-1",
      mimeType: "text/plain",
      bytes: original,
    });

    // Mutating the caller's buffer after put() must not corrupt storage.
    original.write("TAMPERED!!!!!!!!", 0);

    const firstRead = (await store.get("report", "r-1"))!;
    expect(firstRead.bytes.toString("utf8")).toBe("original content");

    // Mutating a buffer returned from get() must not corrupt storage either.
    firstRead.bytes.write("TAMPERED!!!!!!!!", 0);
    const secondRead = (await store.get("report", "r-1"))!;
    expect(secondRead.bytes.toString("utf8")).toBe("original content");
  });

  it("reissuing a link is a client-side act: the stored artifact does not change", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("placard render v1");
    await store.put({
      kind: "placard",
      subjectId: "p-1",
      mimeType: "application/pdf",
      bytes,
    });

    const first = (await store.get("placard", "p-1"))!;
    const second = (await store.get("placard", "p-1"))!;
    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.record.sha256).toBe(second.record.sha256);
  });

  describe("putIfAbsent", () => {
    it("creates the object and reports created:true when nothing exists yet", async () => {
      const store = new InMemoryDocumentArtifactStore();
      const bytes = Buffer.from("first writer's bytes");

      const result = await store.putIfAbsent({
        kind: "tenant-invoice",
        subjectId: "race-1",
        mimeType: "application/pdf",
        bytes,
      });

      expect(result.created).toBe(true);
      expect(result.record.sha256).toBe(sha256(bytes));
      const entry = await store.get("tenant-invoice", "race-1");
      expect(entry!.bytes.equals(bytes)).toBe(true);
    });

    it("preserves an existing object and reports created:false instead of overwriting it", async () => {
      const store = new InMemoryDocumentArtifactStore();
      const winnerBytes = Buffer.from("concurrent winner's bytes");
      await store.put({
        kind: "report",
        subjectId: "race-2",
        mimeType: "application/pdf",
        bytes: winnerBytes,
      });

      const loserBytes = Buffer.from("a different, losing render");
      const result = await store.putIfAbsent({
        kind: "report",
        subjectId: "race-2",
        mimeType: "application/pdf",
        bytes: loserBytes,
      });

      expect(result.created).toBe(false);
      expect(result.record.sha256).toBe(sha256(winnerBytes));
      const entry = await store.get("report", "race-2");
      expect(entry!.bytes.equals(winnerBytes)).toBe(true);
      expect(entry!.bytes.equals(loserBytes)).toBe(false);
    });

    it("validates its input the same way put() does", async () => {
      const store = new InMemoryDocumentArtifactStore();
      await expect(
        store.putIfAbsent({
          kind: "report",
          subjectId: "x",
          mimeType: "application/pdf",
          bytes: Buffer.alloc(0),
        }),
      ).rejects.toThrow(/non-empty bytes/);
    });
  });
});

describe("resolveDocumentArtifact", () => {
  it("reports not_found for an unsupported kind even if the store has entries", async () => {
    const store = new InMemoryDocumentArtifactStore();
    await store.put({
      kind: "report",
      subjectId: "x",
      mimeType: "application/pdf",
      bytes: Buffer.from("x"),
    });

    expect(
      await resolveDocumentArtifact(store, {
        kind: "filing-pdf",
        subjectId: "x",
        manifestHash: "irrelevant",
      }),
    ).toEqual({ status: "not_found" });
  });

  it("reports not_found for an in-scope kind that was never materialised", async () => {
    const store = new InMemoryDocumentArtifactStore();
    expect(
      await resolveDocumentArtifact(store, {
        kind: "tenant-invoice",
        subjectId: "never-produced",
        manifestHash: "abc",
      }),
    ).toEqual({ status: "not_found" });
  });

  it("reports content_mismatch when the link's manifest hash no longer matches the stored bytes", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("current placard render");
    const record = await store.put({
      kind: "placard",
      subjectId: "p-1",
      mimeType: "application/pdf",
      bytes,
    });

    const resolution = await resolveDocumentArtifact(store, {
      kind: "placard",
      subjectId: "p-1",
      manifestHash: "0".repeat(64),
    });

    expect(resolution.status).toBe("content_mismatch");
    if (resolution.status === "content_mismatch") {
      expect(resolution.actualSha256).toBe(record.sha256);
    }
  });

  it("resolves ok with the exact bytes, mime type and a matching sha256 when the manifest hash matches", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const bytes = Buffer.from("tenant invoice PDF bytes");
    const record = await store.put({
      kind: "tenant-invoice",
      subjectId: "invoice-9",
      mimeType: "application/pdf",
      bytes,
    });

    const resolution = await resolveDocumentArtifact(store, {
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
