import { describe, expect, it } from "vitest";
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
const identity = {
  actorId: "public-info-verified-admin",
  realm: "platform",
} as BootstrapRequestIdentity;
const fields = {
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
class PublicInfoSqlWire {
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

async function fixture() {
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
const publicAudits = (audit: AuditNotificationService) =>
  audit
    .listAuditLogs()
    .filter((row) =>
      [
        "create_public_info_version",
        "publish_public_info_version",
        "delete_draft_public_info_version",
      ].includes(row.actionName),
    );
function command(
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
const cache = (service: PlatformAdminService) =>
  service
    .listPublicInfoVersions()
    .sort((a, b) => a.versionId.localeCompare(b.versionId));

describe("actual PublicInfo Controller → Service → enabled Repository ACK", () => {
  it.each(["create", "publish", "delete"] as const)(
    "keeps %s pending, cache and success audit unchanged until canonical write ACK",
    async (operation) => {
      const h = await fixture();
      const before = cache(h.service);
      const canonical = h.wire.snapshot();
      const gate = h.wire.pause("write");
      let settled = false;
      const pending = Promise.resolve(command(h, operation)).then((value) => {
        settled = true;
        return value;
      });
      try {
        await Promise.race([gate.entered, pending]);
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(cache(h.service)).toEqual(before);
        expect(h.wire.snapshot()).toEqual(canonical);
        expect(publicAudits(h.audit)).toHaveLength(0);
      } finally {
        gate.release();
        await pending;
      }
      expect(publicAudits(h.audit)).toHaveLength(1);
    },
  );

  it.each(["create", "publish", "delete"] as const)(
    "propagates a rejected %s write without changing canonical/cache state or recording success",
    async (operation) => {
      const h = await fixture();
      const before = cache(h.service);
      const canonical = h.wire.snapshot();
      h.wire.failWrite = h.wire.writes + 1;
      await expect(Promise.resolve(command(h, operation))).rejects.toThrow(
        "Controlled canonical write failure",
      );
      expect(cache(h.service)).toEqual(before);
      expect(h.wire.snapshot()).toEqual(canonical);
      expect(publicAudits(h.audit)).toHaveLength(0);
      expect(h.wire.statements).toContain("ROLLBACK");
    },
  );

  it("rolls back both publish-history writes if the second fails, permits a legitimate retry and rejects re-publication", async () => {
    const h = await fixture();
    const before = cache(h.service);
    const canonical = h.wire.snapshot();
    h.wire.failWrite = h.wire.writes + 2;
    await expect(Promise.resolve(command(h, "publish"))).rejects.toThrow(
      "Controlled canonical write failure",
    );
    expect(cache(h.service)).toEqual(before);
    expect(h.wire.snapshot()).toEqual(canonical);
    expect(publicAudits(h.audit)).toHaveLength(0);
    h.wire.failWrite = 0;
    const saved = await command(h, "publish");
    expect(saved.data).toMatchObject({
      versionId: h.draft.versionId,
      status: "published",
      publishedBy: identity.actorId,
    });
    expect(
      await h.repository.getPublicInfoVersionRecord(h.draft.versionId),
    ).toEqual(saved.data);
    const previous = canonical.find((row) => row.status === "published")!;
    expect(
      await h.repository.getPublicInfoVersionRecord(previous.versionId),
    ).toMatchObject({ status: "retired", effectiveTo: saved.data.publishedAt });
    await expect(Promise.resolve(command(h, "publish"))).rejects.toMatchObject({
      code: "PUBLIC_INFO_VERSION_NOT_DRAFT",
    });
    expect(publicAudits(h.audit)).toHaveLength(1);
  });

  it("waits for COMMIT itself before returning an API record or exposing the staged version", async () => {
    const h = await fixture();
    const before = cache(h.service);
    const canonical = h.wire.snapshot();
    const gate = h.wire.pause("COMMIT");
    let settled = false;
    const pending = Promise.resolve(command(h, "create")).then((value) => {
      settled = true;
      return value;
    });
    try {
      const reached = await Promise.race([
        gate.entered.then(() => true),
        pending.then(() => false),
      ]);
      expect(reached).toBe(true);
      expect(settled).toBe(false);
      expect(cache(h.service)).toEqual(before);
      expect(h.wire.snapshot()).toEqual(canonical);
      expect(publicAudits(h.audit)).toHaveLength(0);
    } finally {
      gate.release();
      await pending;
    }
    expect(h.wire.statements).toContain("COMMIT");
  });

  it("returns the committed record with every original field, actual actor and same-version authoritative readback through create/publish/delete", async () => {
    const h = await fixture();
    const created = await h.controller.createPublicInfoVersion(
      fields,
      "req-fields",
    );
    expect(created.data).toMatchObject({
      ...fields,
      title: fields.title.trim(),
      status: "draft",
    });
    expect(
      await h.repository.getPublicInfoVersionRecord(created.data.versionId),
    ).toEqual(created.data);
    const published = await h.controller.publishPublicInfoVersion(
      created.data.versionId,
      { publishedBy: "forged-body" },
      identity,
    );
    expect(published.data).toMatchObject({
      ...fields,
      title: fields.title.trim(),
      status: "published",
      publishedBy: identity.actorId,
    });
    expect(
      h.service
        .listPublicInfoVersions()
        .find((row) => row.versionId === published.data.versionId),
    ).toEqual(
      await h.repository.getPublicInfoVersionRecord(published.data.versionId),
    );
    const deleted = await h.controller.deleteDraftPublicInfoVersion(
      h.draft.versionId,
      identity,
    );
    expect(deleted.data.versionId).toBe(h.draft.versionId);
    expect(
      await h.repository.getPublicInfoVersionRecord(h.draft.versionId),
    ).toBeNull();
    expect(publicAudits(h.audit).map((row) => row.actionName)).toEqual(
      expect.arrayContaining([
        "create_public_info_version",
        "publish_public_info_version",
        "delete_draft_public_info_version",
      ]),
    );
  });

  it("preserves allowed no-repository mode and rejects blank/missing versions, non-draft operations and missing verified publisher", async () => {
    const audit = new AuditNotificationService();
    const service = new PlatformAdminService(audit);
    const controller = new PlatformAdminController(service);
    const draft = await controller.createPublicInfoVersion(fields);
    expect(draft.data.status).toBe("draft");
    await expect(
      Promise.resolve().then(() =>
        controller.createPublicInfoVersion({ title: " " }),
      ),
    ).rejects.toMatchObject({ code: "FIELD_REQUIRED" });
    await expect(
      Promise.resolve().then(() =>
        controller.publishPublicInfoVersion("missing-version", {}, identity),
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_INFO_VERSION_NOT_FOUND" });
    await expect(
      Promise.resolve().then(() =>
        controller.publishPublicInfoVersion(
          draft.data.versionId,
          { publishedBy: "body-only" },
          null,
        ),
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_ADMIN_IDENTITY_REQUIRED" });
    const published = await controller.publishPublicInfoVersion(
      draft.data.versionId,
      {},
      identity,
    );
    expect(published.data.publishedBy).toBe(identity.actorId);
    await expect(
      Promise.resolve().then(() =>
        controller.publishPublicInfoVersion(draft.data.versionId, {}, identity),
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_INFO_VERSION_NOT_DRAFT" });
    await expect(
      Promise.resolve().then(() =>
        controller.deleteDraftPublicInfoVersion(draft.data.versionId, identity),
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_INFO_VERSION_NOT_DRAFT" });
    const removable = await controller.createPublicInfoVersion({
      title: "可刪除草稿",
    });
    await expect(
      Promise.resolve().then(() =>
        controller.deleteDraftPublicInfoVersion(removable.data.versionId, null),
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_ADMIN_IDENTITY_REQUIRED" });
    await controller.deleteDraftPublicInfoVersion(
      removable.data.versionId,
      identity,
    );
    expect(
      service
        .listPublicInfoVersions()
        .some((row) => row.versionId === removable.data.versionId),
    ).toBe(false);
  });
});
