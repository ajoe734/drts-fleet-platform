import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuditLogRepository } from "../../../apps/api/src/modules/audit-notification/audit-log.repository";

const repo = path.resolve(__dirname, "../../..");
const temp: string[] = [];
afterEach(() => {
  for (const dir of temp.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
// Persisted fixtures use V0009 UUID identities and complete governance records.
const names = new Map<string, string>();
function uuid(name: string) {
  if (/^[0-9a-f]{8}-/i.test(name)) return name;
  const hex = createHash("sha256").update(name).digest("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  names.set(id, name);
  return id;
}
const label = (id: string) => names.get(id) ?? id;
function row(
  id: string,
  resourceType = "audit_test",
  resourceId = id,
  value: Record<string, unknown> | null = null,
  createdAt = "2020-01-01T00:00:00.000Z",
  tenantId: string | null = "tenant-a",
) {
  if (value && resourceType.startsWith("evidence_")) {
    const common = {
      family: "audit_log",
      tenantId: "tenant-a",
      manifestHash: null,
      reasonNote: null,
      ...value,
    };
    value =
      resourceType === "evidence_legal_hold"
        ? {
            holdId: resourceId,
            caseNumber: "CASE-1",
            reasonCode: "regulatory_inquiry",
            status: "active",
            placedByActorId: "admin",
            placedByActorType: "platform_admin",
            placedAt: "2020-01-01T00:00:00.000Z",
            releasedByActorId: null,
            releasedByActorType: null,
            releasedAt: null,
            releaseReason: null,
            ...common,
          }
        : {
            exceptionId: resourceId,
            sourceResourceType: "regulator_packet",
            sourceResourceId: `packet-${resourceId}`,
            expiresAt: "2099-01-01T00:00:00.000Z",
            reasonCode: "regulatory_request",
            reviewerActorId: "admin",
            reviewerActorType: "platform_admin",
            status: "active",
            requestedByActorId: "admin",
            requestedByActorType: "platform_admin",
            requestedAt: "2020-01-01T00:00:00.000Z",
            resolvedByActorId: null,
            resolvedByActorType: null,
            resolvedAt: null,
            resolutionNote: null,
            ...common,
          };
    if (value.tenantId) value.tenantId = uuid(value.tenantId as string);
    if (value.family === "audit_log")
      value.subjectId = uuid(value.subjectId as string);
    if (value.sourceResourceType === "audit_log")
      value.sourceResourceId = uuid(value.sourceResourceId as string);
    if (value.status === "released")
      Object.assign(value, {
        releasedByActorId: "admin",
        releasedByActorType: "platform_admin",
        releasedAt: createdAt,
        releaseReason: "closed",
      });
    if (value.status === "resolved")
      Object.assign(value, {
        resolvedByActorId: "admin",
        resolvedByActorType: "platform_admin",
        resolvedAt: createdAt,
        resolutionNote: "closed",
      });
  }
  return {
    audit_id: uuid(id),
    actor_id: null,
    actor_type: "system",
    tenant_id: tenantId ? uuid(tenantId) : null,
    module_name: "test",
    action_name: "test",
    resource_type: resourceType,
    resource_id: resourceId,
    old_value: null,
    new_value: value,
    request_id: `req-${id}`,
    ip_address: null,
    user_agent: null,
    hash_value: null,
    created_at: createdAt,
  };
}
function hold(
  id: string,
  subjectId: string,
  values: Record<string, unknown> = {},
  time?: string,
) {
  return row(
    id,
    "evidence_legal_hold",
    id,
    {
      holdId: id,
      family: "audit_log",
      subjectId,
      status: "active",
      tenantId: "tenant-a",
      ...values,
    },
    time,
  );
}
function exception(
  id: string,
  subjectId: string,
  values: Record<string, unknown> = {},
  time?: string,
) {
  return row(
    id,
    "evidence_deletion_exception",
    id,
    {
      exceptionId: id,
      family: "audit_log",
      subjectId,
      status: "active",
      tenantId: "tenant-a",
      expiresAt: "2099-01-01T00:00:00.000Z",
      sourceResourceType: "regulator_packet",
      sourceResourceId: `packet-${id}`,
      ...values,
    },
    time,
  );
}
async function replay(rows: ReturnType<typeof row>[]) {
  const repository = new AuditLogRepository({
    isEnabled: () => true,
    query: async (sql: string) => ({
      rows: sql.includes("INSERT INTO") ? [] : rows,
    }),
  } as never);
  const service = new AuditNotificationService(repository);
  await service.onModuleInit();
  return service;
}
function run(
  rows: ReturnType<typeof row>[],
  options: {
    failure?: string;
    concurrent?: ReturnType<typeof row>[];
    dry?: boolean;
    outputFile?: boolean;
  } = {},
) {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-retention-test-"));
  temp.push(dir);
  mkdirSync(path.join(dir, "bin"));
  const client = path.join(dir, "bin/psql");
  copyFileSync(path.join(__dirname, "controlled-psql.py"), client);
  chmodSync(client, 0o755);
  writeFileSync(
    path.join(dir, "state.json"),
    JSON.stringify({ rows, concurrent: options.concurrent ?? [] }),
  );
  const archiveDir = path.join(dir, "archives with spaces");
  if (options.outputFile) writeFileSync(archiveDir, "not a directory");
  const result = spawnSync(
    "bash",
    [
      process.env.RETENTION_SCRIPT ??
        path.join(repo, "operations/database/audit-log-retention-archival.sh"),
      options.dry ? "--dry-run" : "--apply",
      "--export-dir",
      archiveDir,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}/bin:${process.env.PATH}`,
        DATABASE_URL:
          "postgresql://fixture:fixture@socket-free.invalid/fixture",
        RETENTION_FIXTURE: dir,
        RETENTION_SCHEMA: path.join(
          repo,
          "infra/migrations/V0009__admin_reporting_audit_and_integrations.sql",
        ),
        RETENTION_FAILURE: options.failure ?? "",
      },
    },
  );
  const state = JSON.parse(
    readFileSync(path.join(dir, "state.json"), "utf8"),
  ) as { rows: ReturnType<typeof row>[]; selected?: string[] };
  const calls = existsSync(path.join(dir, "calls.jsonl"))
    ? readFileSync(path.join(dir, "calls.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { sql: string; args: string[] })
    : [];
  const files = options.outputFile
    ? []
    : (() => {
        try {
          return readdirSync(archiveDir).filter((name) =>
            name.endsWith(".jsonl"),
          );
        } catch {
          return [];
        }
      })();
  const archived = files.flatMap((name) =>
    readFileSync(path.join(archiveDir, name), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ReturnType<typeof row>),
  );
  if (process.env.RETENTION_TRACE)
    writeFileSync(
      process.env.RETENTION_TRACE,
      JSON.stringify({
        test: expect.getState().currentTestName,
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        selected: state.selected,
        remaining: state.rows.map((row) => row.audit_id),
        archived: archived.map((row) => row.audit_id),
        calls,
      }) + "\n",
      { flag: "a" },
    );
  return { result, state, calls, archived };
}

describe("C100 actual archival shell with controlled client (no PG/socket/server)", () => {
  it("preserves old held/exception targets and active history, purging only lawful rows", () => {
    const data = [
      row("free"),
      row("held"),
      hold("h1", "held"),
      row("exception"),
      exception("e1", "exception"),
      row("reference", "regulator_packet", "packet-e1"),
    ];
    const r = run(data);
    expect(r.result.status, r.result.stderr).toBe(0);
    expect(r.archived.map((row) => label(row.audit_id))).toEqual(["free"]);
    expect(r.state.rows.map((row) => label(row.audit_id)).sort()).toEqual(
      data
        .filter((row) => label(row.audit_id) !== "free")
        .map((row) => label(row.audit_id))
        .sort(),
    );
  });
  it("uses one exact set: boundary crossing and newly visible old rows are preserved", () => {
    const boundary = row(
      "boundary",
      "audit_test",
      "boundary",
      null,
      "2024-10-15T12:00:01.000Z",
    );
    const r = run([row("free"), boundary], { concurrent: [row("late")] });
    expect(r.result.status, r.result.stderr).toBe(0);
    expect(r.archived.map((row) => label(row.audit_id))).toEqual(["free"]);
    expect(r.state.rows.map((row) => label(row.audit_id)).sort()).toEqual([
      "boundary",
      "late",
    ]);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]!.sql.indexOf("LOCK TABLE admin.audit_logs")).toBeLessThan(
      r.calls[0]!.sql.indexOf("CREATE TEMP TABLE audit_retention_candidates"),
    );
  });
  it("obeys tenant, subject, manifest, release/resolution/expiry and terminal replay history", async () => {
    const data = [
      row("held-by-subject", "report_artifact", "artifact", {
        manifestHash: "manifest-a",
      }),
      row("held-by-manifest", "filing_package", "package", {
        manifestHash: "manifest-a",
      }),
      hold("h1", "artifact", {
        family: "report_artifact",
        manifestHash: "manifest-a",
      }),
      row(
        "other-tenant",
        "report_artifact",
        "artifact",
        { manifestHash: "manifest-a" },
        undefined,
        "tenant-b",
      ),
      row("released"),
      hold("h2", "released"),
      row(
        "h2-release",
        "evidence_legal_hold",
        "h2",
        {
          holdId: "h2",
          family: "audit_log",
          subjectId: "released",
          tenantId: "tenant-a",
          status: "released",
        },
        "2021-01-01T00:00:00.000Z",
      ),
      row("expired"),
      exception("e1", "expired", { expiresAt: "2022-01-01T00:00:00.000Z" }),
      row("resolved"),
      exception("e2", "resolved"),
      row(
        "e2-resolve",
        "evidence_deletion_exception",
        "e2",
        {
          exceptionId: "e2",
          family: "audit_log",
          subjectId: "resolved",
          status: "resolved",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        "2021-01-01T00:00:00.000Z",
      ),
      row("recent-release-target"),
      hold("h3", "recent-release-target"),
      row(
        "h3-release",
        "evidence_legal_hold",
        "h3",
        {
          holdId: "h3",
          family: "audit_log",
          subjectId: "recent-release-target",
          status: "released",
        },
        "2026-10-01T00:00:00.000Z",
      ),
    ];
    const before = await replay(data);
    expect(
      before.getEvidenceSubjectGovernance("report_artifact", "artifact")
        .deletionSuppressed,
    ).toBe(true);
    for (const subject of [
      "released",
      "expired",
      "resolved",
      "recent-release-target",
    ])
      expect(
        before.getEvidenceSubjectGovernance("audit_log", uuid(subject))
          .deletionSuppressed,
      ).toBe(false);
    const r = run(data);
    expect(r.result.status, r.result.stderr).toBe(0);
    const after = await replay(r.state.rows);
    expect(
      after.getEvidenceSubjectGovernance("report_artifact", "artifact")
        .deletionSuppressed,
    ).toBe(true);
    expect(
      after.getEvidenceSubjectGovernance(
        "audit_log",
        uuid("recent-release-target"),
      ).deletionSuppressed,
    ).toBe(false);
    expect(r.state.rows.map((row) => label(row.audit_id)).sort()).toEqual(
      ["held-by-subject", "held-by-manifest", "h1", "h3", "h3-release"].sort(),
    );
    expect(r.archived.map((row) => label(row.audit_id)).sort()).toEqual(
      data
        .filter(
          (row) =>
            ![
              "held-by-subject",
              "held-by-manifest",
              "h1",
              "h3",
              "h3-release",
            ].includes(label(row.audit_id)),
        )
        .map((row) => label(row.audit_id))
        .sort(),
    );
  });

  it("retains UUID audit references and subjects whose physical tenant was normalized away", () => {
    const data = [
      row("free"),
      { ...row("unknown-tenant"), tenant_id: null },
      hold("h", "unknown-tenant"),
      row("audit-reference"),
      exception("e", "some-other-subject", {
        sourceResourceType: "audit_log",
        sourceResourceId: "audit-reference",
      }),
    ];
    const r = run(data as ReturnType<typeof row>[]);
    expect(r.result.status, r.result.stderr).toBe(0);
    expect(r.archived.map((row) => label(row.audit_id))).toEqual(["free"]);
  });
  for (const protection of ["hold", "exception", "audit-source"] as const) {
    it(`${protection} uses physical tenant before summary payload and retains null-tenant fallback`, () => {
      const targets = [
        row("physical-a-payload-b", undefined, undefined, {
          tenantId: uuid("tenant-b"),
        }),
        row("physical-a-no-payload"),
        row(
          "physical-b-payload-a",
          undefined,
          undefined,
          {
            tenantId: uuid("tenant-a"),
          },
          undefined,
          "tenant-b",
        ),
        row(
          "null-physical-payload-a",
          undefined,
          undefined,
          {
            tenantId: uuid("tenant-a"),
          },
          undefined,
          null,
        ),
        row(
          "null-physical-payload-b",
          undefined,
          undefined,
          {
            tenantId: uuid("tenant-b"),
          },
          undefined,
          null,
        ),
        row(
          "null-physical-no-payload",
          undefined,
          undefined,
          null,
          undefined,
          null,
        ),
        row(
          "null-physical-normalized-tenant",
          undefined,
          undefined,
          {
            tenantId: "normalized-tenant",
          },
          undefined,
          null,
        ),
      ];
      const protections = targets.map((target) => {
        const id = `protection-${label(target.audit_id)}`;
        const event =
          protection === "hold"
            ? hold(id, target.audit_id)
            : exception(
                id,
                protection === "audit-source"
                  ? "unrelated-subject"
                  : target.audit_id,
                protection === "audit-source"
                  ? {
                      sourceResourceType: "audit_log",
                      sourceResourceId: target.audit_id,
                    }
                  : {},
              );
        // The repository normalizes non-UUID physical tenants to NULL while
        // preserving the original logical tenant in the governance payload.
        if (label(target.audit_id) === "null-physical-normalized-tenant") {
          event.tenant_id = null;
          event.new_value!.tenantId = "normalized-tenant";
        }
        return event;
      });
      const r = run([...targets, ...protections]);
      expect(r.result.status, r.result.stderr).toBe(0);
      expect(r.state.selected?.map(label).sort()).toEqual([
        "null-physical-payload-b",
        "physical-b-payload-a",
      ]);
      expect(r.archived.map((row) => label(row.audit_id)).sort()).toEqual([
        "null-physical-payload-b",
        "physical-b-payload-a",
      ]);
      expect(r.state.rows.map((row) => row.audit_id).sort()).toEqual(
        [...targets, ...protections]
          .filter(
            (target) =>
              !["null-physical-payload-b", "physical-b-payload-a"].includes(
                label(target.audit_id),
              ),
          )
          .map((row) => row.audit_id)
          .sort(),
      );
    });
  }
  for (const protection of ["hold", "exception", "audit-source"] as const) {
    it(`${protection} preserves UUID tenant case variants without folding opaque tenant identities`, () => {
      const tenant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      const cases = [
        { id: "uuid-physical", physical: tenant, payload: null, authority: tenant.toUpperCase(), protected: true },
        { id: "uuid-summary-conflict", physical: tenant, payload: other, authority: tenant.toUpperCase(), protected: true },
        { id: "uuid-other-physical", physical: other, payload: tenant, authority: tenant.toUpperCase(), protected: false },
        { id: "uuid-null-physical", physical: null, payload: tenant.toUpperCase(), authority: tenant, protected: true },
        { id: "uuid-null-other", physical: null, payload: other, authority: tenant.toUpperCase(), protected: false },
        { id: "uuid-unknown", physical: null, payload: null, authority: tenant.toUpperCase(), protected: true },
        { id: "opaque-same", physical: null, payload: "Tenant-A", authority: "Tenant-A", protected: true },
        { id: "opaque-different-case", physical: null, payload: "tenant-a", authority: "Tenant-A", protected: false },
        { id: "opaque-uuid-shape", physical: null, payload: "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa", authority: "AAAAAAAA-AAAA-7AAA-8AAA-AAAAAAAAAAAA", protected: false },
      ];
      const targets = cases.map((c) => row(c.id, undefined, undefined, c.payload ? { tenantId: c.payload } : null, undefined, c.physical));
      const protections = cases.map((c, index) => {
        const subject = targets[index]!.audit_id;
        const event = protection === "hold"
          ? hold(`case-hold-${index}`, subject)
          : exception(`case-exception-${index}`, protection === "audit-source" ? "unrelated" : subject,
              protection === "audit-source" ? { sourceResourceType: "audit_log", sourceResourceId: subject } : {});
        event.tenant_id = c.physical;
        event.new_value!.tenantId = c.authority;
        return event;
      });
      const r = run([...targets, ...protections]);
      const lawful = cases.filter((c) => !c.protected).map((c) => uuid(c.id)).sort();
      expect(r.result.status, r.result.stderr).toBe(0);
      expect(r.state.selected?.sort()).toEqual(lawful);
      expect(r.archived.map((r) => r.audit_id).sort()).toEqual(lawful);
      expect(r.state.rows.map((r) => r.audit_id).sort()).toEqual(
        [...targets, ...protections].filter((r) => !lawful.includes(r.audit_id)).map((r) => r.audit_id).sort(),
      );
    });
  }
  for (const failure of ["sql", "write", "verify"] as const) {
    it(`${failure} failure is nonzero, retains source and cannot print purge success`, () => {
      const r = run([row("free")], { failure });
      expect(r.result.status).not.toBe(0);
      expect(r.state.rows.map((row) => label(row.audit_id))).toEqual(["free"]);
      expect(r.result.stdout).not.toContain("purge completed successfully");
      expect(
        r.calls.every((call) => call.args.includes("ON_ERROR_STOP=1")),
      ).toBe(true);
    });
  }
  it("archive directory open failure occurs before deletion", () => {
    const r = run([row("free")], { outputFile: true });
    expect(r.result.status).not.toBe(0);
    expect(r.state.rows.map((row) => label(row.audit_id))).toEqual(["free"]);
    expect(r.calls.every((call) => !call.sql.includes("DELETE FROM"))).toBe(
      true,
    );
  });
  it("empty lawful set is a real no-op and dry-run never purges", () => {
    const empty = run([row("held"), hold("h", "held")]);
    expect(empty.result.status, empty.result.stderr).toBe(0);
    expect(empty.archived).toEqual([]);
    expect(empty.state.rows).toHaveLength(2);
    expect(empty.result.stdout).toContain("No records eligible");
    const dry = run([row("free")], { dry: true });
    expect(dry.result.status, dry.result.stderr).toBe(0);
    expect(dry.archived).toEqual([]);
    expect(dry.state.rows).toHaveLength(1);
    expect(dry.calls.every((call) => !call.sql.includes("DELETE FROM"))).toBe(
      true,
    );
  });
});
