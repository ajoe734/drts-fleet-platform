import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import type { DocumentArtifactKind } from "../../../apps/api/src/common/document-artifacts";
import {
  canonicalDatabase,
  createRuntime,
  download,
  hash,
  identity,
} from "./production-fixture";
import { parsePdf } from "./pdf-parser";

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/accepted-d9-legacy.json", import.meta.url),
    "utf8",
  ),
) as {
  accepted: string;
  tables: [string, [string, unknown][]][];
  artifacts: {
    kind: DocumentArtifactKind;
    id: string;
    url: string;
    expected: string;
    base64: string;
  }[];
};

function database() {
  const db = canonicalDatabase();
  fixture.tables.forEach(([table, records]) =>
    db.tables.set(table, new Map(structuredClone(records))),
  );
  return db;
}

afterEach(() => vi.useRealTimers());

it("keeps actual accepted legacy ASCII/question-mark bytes and signed hashes across fresh reads, profile changes and re-signing in all three families", async () => {
  expect(fixture.accepted).toBe("d9b63d0317475ba79160f8d633df0ab24cf1df64");
  const runtime = createRuntime(database());
  await runtime.service.onModuleInit();
  const firstSigned = new URL(
    fixture.artifacts[0]!.url,
    "https://download.example.invalid",
  ).searchParams.get("signed_at")!;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(firstSigned));
  for (const doc of fixture.artifacts) {
    const bytes = Buffer.from(doc.base64, "base64");
    expect(hash(bytes)).toBe(doc.expected);
    await runtime.store.put({
      kind: doc.kind,
      subjectId: doc.id,
      mimeType: "application/pdf",
      bytes,
    });
    expect((await download(runtime, doc.kind, doc.id, doc.url)).bytes).toEqual(
      bytes,
    );
  }
  const texts = await Promise.all(
    fixture.artifacts
      .slice(0, 2)
      .map((doc) => parsePdf(Buffer.from(doc.base64, "base64"))),
  );
  expect(texts[0]!.text).toContain("??????????");
  expect(texts[1]!.text).toContain("ASCII Legacy Ltd.");
  await runtime.service.updateTenantBillingProfile("tenant-pdf-cjk", {
    invoiceTitle: "新名稱不可改舊檔",
    email: "new@example.invalid",
  });
  const cold = createRuntime(runtime.database, runtime.store);
  await cold.service.onModuleInit();
  vi.setSystemTime(new Date(Date.parse(firstSigned) + 30 * 60 * 1000));
  const put = vi.spyOn(cold.store, "put");
  const conditionalPut = vi.spyOn(cold.store, "putIfAbsent");
  for (const doc of fixture.artifacts) {
    let url: string;
    if (doc.kind === "tenant-invoice") {
      const record = [
        ...cold.database.tables.get("billing.phase1_tenant_invoices")!.values(),
      ].find(
        (value) => (value as { invoiceId: string }).invoiceId === doc.id,
      ) as { tenantId: string };
      url = cold.service.getTenantInvoice(record.tenantId, doc.id).artifactUrl!;
    } else if (doc.id.startsWith("statement-")) {
      url = cold.service.getDriverStatement(doc.id).artifactUrl!;
    } else {
      const receipt = await cold.service.exportReimbursementBatch(
        doc.id,
        identity(),
      );
      expect(receipt.manifestHash).toBe(doc.expected);
      url = receipt.download.downloadUrl;
    }
    expect(url).not.toBe(doc.url);
    expect((await download(cold, doc.kind, doc.id, url)).bytes).toEqual(
      Buffer.from(doc.base64, "base64"),
    );
    expect((await cold.store.get(doc.kind, doc.id))!.record.sha256).toBe(
      doc.expected,
    );
  }
  expect(put).not.toHaveBeenCalled();
  expect(conditionalPut).not.toHaveBeenCalled();
});

it("does not pretend new Unicode bytes reproduce an absent legacy immutable hash for any of the three families", async () => {
  const runtime = createRuntime(database());
  await runtime.service.onModuleInit();
  vi.useFakeTimers({ toFake: ["Date"] });
  const signedAt = new URL(
    fixture.artifacts[0]!.url,
    "https://download.example.invalid",
  ).searchParams.get("signed_at")!;
  vi.setSystemTime(new Date(signedAt));
  const put = vi.spyOn(runtime.store, "put");
  const conditionalPut = vi.spyOn(runtime.store, "putIfAbsent");
  for (const doc of fixture.artifacts) {
    await expect(
      download(runtime, doc.kind, doc.id, doc.url),
    ).rejects.toMatchObject({ code: "CONTROLLED_DOWNLOAD_CONTENT_MISMATCH" });
    expect((await runtime.store.get(doc.kind, doc.id))!.record.sha256).not.toBe(
      doc.expected,
    );
  }
  expect(put).not.toHaveBeenCalled();
  // The existing controller retries registered recovery once on mismatch;
  // both attempts remain conditional and cannot overwrite the first object.
  expect(conditionalPut).toHaveBeenCalledTimes(8);
});
