import { createHash } from "node:crypto";
import { vi } from "vitest";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import {
  DocumentArtifactRebuildRegistry,
  InMemoryDocumentArtifactStore,
  type DocumentArtifactKind,
} from "../../../apps/api/src/common/document-artifacts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ControlledDownloadController } from "../../../apps/api/src/modules/controlled-download/controlled-download.controller";

export const TENANT = "tenant-pdf-cjk";
export const DRIVER = "drv-pdf-cjk";
export const PERIOD = {
  periodStart: "2026-05-01T00:00:00Z",
  periodEnd: "2026-05-31T23:59:59Z",
};
export const TITLE = "示範租戶股份有限公司（中文）(A)\\B";
export const ADDRESS = "臺中市中山路１２號，財務部 — Finance (2026)\\尾";
export const REASON = "交通補助（核准），中文 (A)\\B — TWD 123.45";

export function identity(
  realm: "platform" | "driver" = "platform",
  actorId = "pa-pdf-finance",
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: realm === "driver" ? "driver_user" : "platform_admin",
    actorId,
    realm,
    tenantId: null,
    roleFamilies: [realm],
    roles: [],
    scopes: [realm === "driver" ? "driver:read" : "billing:write"],
    requestId: null,
  };
}

/** SIM only at DatabaseService.query: the production repository owns all JSONB
 * serialization/load/persistence and the production service owns all business
 * transitions. This does not claim PostgreSQL SQL/concurrency qualification. */
export function canonicalDatabase() {
  const tables = new Map<string, Map<string, unknown>>();
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    const insert = sql.match(/INSERT INTO\s+(\S+)/i);
    if (insert) {
      const record = JSON.parse(String(values.at(-1)));
      const bucket = tables.get(insert[1]!) ?? new Map();
      bucket.set(String(values[0]), structuredClone(record));
      tables.set(insert[1]!, bucket);
      return { rows: [], rowCount: 1 };
    }
    const table = sql.match(/FROM\s+(\S+)/i)?.[1];
    return {
      rows: [...(tables.get(table ?? "")?.values() ?? [])].map((record) => ({
        record: structuredClone(record),
      })),
    };
  });
  const repository = new BillingSettlementRepository({
    isEnabled: () => true,
    query,
  } as unknown as DatabaseService);
  return { tables, query, repository };
}

export function createRuntime(
  database = canonicalDatabase(),
  store = new InMemoryDocumentArtifactStore(),
) {
  const registry = new DocumentArtifactRebuildRegistry();
  const audit = new AuditNotificationService();
  const service = new BillingSettlementService(
    audit,
    database.repository,
    undefined,
    undefined,
    store,
    undefined,
    registry,
  );
  return {
    database,
    store,
    registry,
    audit,
    service,
    controller: new BillingSettlementController(service),
    download: new ControlledDownloadController(store, registry),
  };
}

export async function download(
  runtime: Pick<ReturnType<typeof createRuntime>, "download">,
  kind: DocumentArtifactKind,
  subjectId: string,
  url: string,
) {
  const q = new URL(url, "https://download.example.invalid").searchParams;
  const file = await runtime.download.resolve(
    kind,
    subjectId,
    q.get("signed_at")!,
    q.get("expires_at")!,
    q.get("key_id")!,
    q.get("manifest_hash")!,
    q.get("sig")!,
    q.get("sig_v")!,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
  return { bytes: Buffer.concat(chunks), headers: file.getHeaders() };
}

export const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export const money = (value: { currency: string; amountMinor: number }) =>
  `${value.amountMinor < 0 ? "-" : ""}${value.currency} ${Math.floor(Math.abs(value.amountMinor) / 100)}.${String(Math.abs(value.amountMinor) % 100).padStart(2, "0")}`;

export async function issueDocuments(count = 3, longDescription = false) {
  const runtime = createRuntime();
  await runtime.service.onModuleInit();
  await runtime.service.updateTenantBillingProfile(TENANT, {
    invoiceTitle: TITLE,
    address:
      ADDRESS +
      (longDescription ? "長地址".repeat(1400) + "長地址結束END" : ""),
    taxId: "24567891",
    email: "pdf@example.invalid",
  });
  await runtime.service.publishDriverFeePlan({
    planName: "既有費率",
    version: "費率v1-2026",
    serviceFeeBps: 1500,
    reimbursementMode: "platform_funded",
  });
  for (let index = 0; index < count; index++) {
    await runtime.service.handleOwnedMobilityTripCompleted({
      orderId: `order-pdf-${String(index).padStart(4, "0")}`,
      tenantId: TENANT,
      driverId: DRIVER,
      bookingId: null,
      costCenterCode: null,
      riderId: null,
      eligibilityVerificationId: null,
      completedAt: `2026-05-10T10:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}Z`,
      orderSource: "portal",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "credit_card_airport_transfer",
      grossEarning: { currency: "TWD", amountMinor: 12345 + index },
      partnerEntrySlug: `partner-pdf-${index}`,
      partnerId: "partner-pdf",
      partnerProgramId: "program-pdf",
      benefitReference: "benefit-pdf",
      issuerAuthorizationRef: "issuer-pdf",
    });
  }
  const invoice = await runtime.service.generateTenantInvoice(TENANT, {
    tenantId: TENANT,
    ...PERIOD,
  });
  const generated = await runtime.controller.generateDriverStatements(
    { periodMonth: "2026-05", driverId: DRIVER },
    `pdf-generate-${count}`,
  );
  const statement = runtime.controller.getDriverStatement(
    generated.data.items[0]!.statementId,
    identity("driver", DRIVER),
  ).data;
  const batch = runtime.service.getReimbursementBatch(
    generated.data.reimbursementBatchIds[0]!,
  );
  await runtime.service.approveReimbursementBatch(batch.batchId, {
    statementId: statement.statementId,
  });
  // Existing persisted reason is an unconstrained string. Model legitimate
  // historical Chinese reason data at the external DB boundary, then consume it
  // through the real repository/restart/export, never a private PDF row helper.
  const approved = runtime.service.getReimbursementBatch(batch.batchId);
  approved.items.forEach((item, index) => {
    item.reason = `${REASON} [${index}]`;
  });
  await runtime.database.repository.persistChanges({
    reimbursementBatches: [approved],
  });
  const reloaded = createRuntime(runtime.database, runtime.store);
  await reloaded.service.onModuleInit();
  const receipt = (
    await reloaded.controller.exportReimbursementBatch(
      batch.batchId,
      `pdf-export-${count}`,
      undefined,
      identity(),
    )
  ).data;
  return {
    ...reloaded,
    invoice,
    statement,
    batch: reloaded.service.getReimbursementBatch(batch.batchId),
    receipt,
  };
}
