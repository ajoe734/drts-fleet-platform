import { writeFileSync, mkdirSync } from "node:fs";
import { it, expect } from "vitest";
import { issueDocuments, download, hash } from "./production-fixture";

// Explicit provenance generator, run only via capture.vitest.config.ts. Its
// service is loaded verbatim from accepted d9 by before.vitest.config.ts.
it("captures real accepted d9 service/store/download legacy artifacts", async () => {
  const r = await issueDocuments();
  await r.service.updateTenantBillingProfile("tenant-demo-001", {
    invoiceTitle: "ASCII Legacy Ltd.",
    address: "ASCII (A)\\B",
    email: "legacy@example.invalid",
  });
  const ascii = await r.service.generateTenantInvoice("tenant-demo-001", {
    tenantId: "tenant-demo-001",
    periodStart: "2026-03-01T00:00:00Z",
    periodEnd: "2026-03-31T23:59:59Z",
  });
  const docs = [
    {
      kind: "tenant-invoice" as const,
      id: r.invoice.invoiceId,
      url: r.invoice.artifactUrl!,
      expected: r.invoice.artifactDownloadMetadata.manifestHash,
    },
    {
      kind: "tenant-invoice" as const,
      id: ascii.invoiceId,
      url: ascii.artifactUrl!,
      expected: ascii.artifactDownloadMetadata.manifestHash,
    },
    {
      kind: "report" as const,
      id: r.statement.statementId,
      url: r.statement.artifactUrl!,
      expected: r.statement.artifactDownloadMetadata!.manifestHash,
    },
    {
      kind: "report" as const,
      id: r.batch.batchId,
      url: r.receipt.download.downloadUrl,
      expected: r.receipt.manifestHash,
    },
  ];
  const artifacts = [];
  for (const doc of docs) {
    const { bytes } = await download(r, doc.kind, doc.id, doc.url);
    expect(hash(bytes)).toBe(doc.expected);
    expect(bytes.toString("latin1")).not.toContain("/FontFile3");
    artifacts.push({ ...doc, base64: bytes.toString("base64") });
  }
  mkdirSync(
    "tests/unit/billing-pdf-chinese-printable-content-20261016/fixtures",
    { recursive: true },
  );
  writeFileSync(
    "tests/unit/billing-pdf-chinese-printable-content-20261016/fixtures/accepted-d9-legacy.json",
    JSON.stringify(
      {
        accepted: "d9b63d0317475ba79160f8d633df0ab24cf1df64",
        producer:
          "actual unmodified accepted BillingSettlementService -> real repository (query SIM) -> real artifact store -> ControlledDownloadController drained bytes",
        tables: [...r.database.tables].map(([table, rows]) => [
          table,
          [...rows],
        ]),
        artifacts,
      },
      null,
      2,
    ) + "\n",
  );
});
