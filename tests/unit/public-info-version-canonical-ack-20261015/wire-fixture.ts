import type { PublicInfoVersionRecord } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminController } from "../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { PlatformAdminRepository } from "../../../apps/api/src/modules/platform-admin/platform-admin.repository";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const clone = (record: PublicInfoVersionRecord) => ({ ...record });
export const identity = {
  actorId: "public-info-verified-admin",
  realm: "platform",
} as BootstrapRequestIdentity;
export const fields = {
  title: "  公開電話與車資版本  ",
  callPhone: "0800-000-001",
  complaintPhone: "0800-000-002",
  callRateText: "依核定方式計費",
  fareText: "公告車資規則",
  paymentMethodText: "現金、電子票證",
  effectiveFrom: "2026-10-01T00:00:00Z",
  effectiveTo: "2026-12-31T23:59:59Z",
};

// Only the SQL/socket boundary is modeled. Real Repository SQL, transaction
// wrapper, Service validations/cache/audit and Controller envelopes execute.
// Each connection owns a staged map; readers outside it see committed rows.
export class PublicInfoSqlWire {
  readonly records = new Map<string, PublicInfoVersionRecord>();
  readonly statements: string[] = [];
  writes = 0;
  failWrite = 0;
  private hold: {
    stage: "write" | "COMMIT";
    entered: ReturnType<typeof deferred>;
    release: ReturnType<typeof deferred>;
  } | null = null;
  constructor(records: readonly PublicInfoVersionRecord[]) {
    for (const row of records) this.records.set(row.versionId, clone(row));
  }
  isEnabled() {
    return true;
  }
  pause(stage: "write" | "COMMIT") {
    const hold = { stage, entered: deferred(), release: deferred() };
    this.hold = hold;
    return { entered: hold.entered.promise, release: hold.release.resolve };
  }
  snapshot() {
    return [...this.records.values()]
      .map(clone)
      .sort((a, b) => a.versionId.localeCompare(b.versionId));
  }
  async query(sql: string, values: readonly unknown[] = []) {
    return this.run(sql, values);
  }
  async connect() {
    const connection = {
      staged: null as Map<string, PublicInfoVersionRecord> | null,
    };
    return {
      query: (sql: string, values: readonly unknown[] = []) =>
        this.run(sql, values, connection),
      release() {},
    };
  }
  private async run(
    sql: string,
    values: readonly unknown[],
    connection?: { staged: Map<string, PublicInfoVersionRecord> | null },
  ) {
    const text = sql.replace(/\s+/g, " ").trim();
    this.statements.push(text);
    if (text === "BEGIN") {
      if (!connection) throw new Error("BEGIN requires its connection");
      connection.staged = new Map(
        this.snapshot().map((row) => [row.versionId, row]),
      );
      return { rows: [] };
    }
    if (text === "ROLLBACK") {
      if (connection) connection.staged = null;
      return { rows: [] };
    }
    if (text === "COMMIT") {
      await this.wait("COMMIT");
      if (!connection?.staged) throw new Error("COMMIT requires a transaction");
      this.records.clear();
      for (const [id, row] of connection.staged)
        this.records.set(id, clone(row));
      connection.staged = null;
      return { rows: [] };
    }
    const rows = connection?.staged ?? this.records;
    if (
      /^(INSERT INTO|DELETE FROM) admin\.phase1_public_info_versions\b/.test(
        text,
      )
    ) {
      this.writes += 1;
      const ordinal = this.writes;
      await this.wait("write");
      if (ordinal === this.failWrite)
        throw new Error("Controlled canonical write failure");
      if (text.startsWith("DELETE")) {
        const row = rows.get(String(values[0]));
        rows.delete(String(values[0]));
        return {
          rows: row && /RETURNING/.test(text) ? [{ record: clone(row) }] : [],
          rowCount: row ? 1 : 0,
        };
      }
      const row = JSON.parse(String(values[4])) as PublicInfoVersionRecord;
      rows.set(row.versionId, clone(row));
      return {
        rows: /RETURNING/.test(text) ? [{ record: clone(row) }] : [],
        rowCount: 1,
      };
    }
    if (/^SELECT record FROM admin\.phase1_public_info_versions\b/.test(text)) {
      const selected = text.includes("WHERE version_id = $1")
        ? [...rows.values()].filter((row) => row.versionId === values[0])
        : [...rows.values()];
      return { rows: selected.map((row) => ({ record: clone(row) })) };
    }
    if (/^(SET LOCAL|LOCK TABLE)/.test(text)) return { rows: [] };
    // Existing module hydration also reads/seeds unrelated adapters/placards.
    if (
      /phase1_(platform_tenants|placard_versions|platform_adapters)/.test(text)
    )
      return { rows: [] };
    throw new Error(`Unsupported controlled SQL: ${text}`);
  }
  private async wait(stage: "write" | "COMMIT") {
    if (this.hold?.stage !== stage) return;
    const hold = this.hold;
    this.hold = null;
    hold.entered.resolve();
    await hold.release.promise;
  }
}

export async function fixture() {
  const preparation = new PlatformAdminService(new AuditNotificationService());
  const draft = await preparation.createPublicInfoVersion({
    title: "原草稿",
    callPhone: "0800-000-003",
  });
  const wire = new PublicInfoSqlWire(preparation.listPublicInfoVersions());
  const repository = new PlatformAdminRepository(
    wire as unknown as DatabaseService,
  );
  const audit = new AuditNotificationService();
  const service = new PlatformAdminService(audit, repository);
  await service.onModuleInit();
  const controller = new PlatformAdminController(service);
  return { wire, repository, audit, service, controller, draft };
}
export const publicAudits = (audit: AuditNotificationService) =>
  audit
    .listAuditLogs()
    .filter((row) =>
      [
        "create_public_info_version",
        "publish_public_info_version",
        "delete_draft_public_info_version",
      ].includes(row.actionName),
    );
export function command(
  h: Awaited<ReturnType<typeof fixture>>,
  operation: "create" | "publish" | "delete",
) {
  if (operation === "create")
    return h.controller.createPublicInfoVersion(fields, "req-public-create");
  if (operation === "publish")
    return h.controller.publishPublicInfoVersion(
      h.draft.versionId,
      { publishedBy: "untrusted-body-actor" },
      identity,
      "req-public-publish",
    );
  return h.controller.deleteDraftPublicInfoVersion(
    h.draft.versionId,
    identity,
    "req-public-delete",
  );
}
export const cache = (service: PlatformAdminService) =>
  service
    .listPublicInfoVersions()
    .sort((a, b) => a.versionId.localeCompare(b.versionId));
