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

const repo = path.resolve(__dirname, "../../..");
const temp: string[] = [];
afterEach(() => {
  for (const dir of temp.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function row(
  id: string,
  resourceType = "audit_test",
  resourceId = id,
  value: Record<string, unknown> | null = null,
  createdAt = "2020-01-01T00:00:00.000Z",
  tenantId = "tenant-a",
) {
  return {
    audit_id: id,
    actor_id: null,
    actor_type: "system",
    tenant_id: tenantId,
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
    expect(r.archived.map((row) => row.audit_id)).toEqual(["free"]);
    expect(r.state.rows.map((row) => row.audit_id).sort()).toEqual(
      data
        .filter((row) => row.audit_id !== "free")
        .map((row) => row.audit_id)
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
    expect(r.archived.map((row) => row.audit_id)).toEqual(["free"]);
    expect(r.state.rows.map((row) => row.audit_id).sort()).toEqual([
      "boundary",
      "late",
    ]);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]!.sql.indexOf("LOCK TABLE admin.audit_logs")).toBeLessThan(
      r.calls[0]!.sql.indexOf("CREATE TEMP TABLE audit_retention_candidates"),
    );
  });
  it("obeys tenant, subject, manifest, release/resolution/expiry and terminal replay history", () => {
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
    const r = run(data);
    expect(r.result.status, r.result.stderr).toBe(0);
    expect(r.state.rows.map((row) => row.audit_id).sort()).toEqual(
      ["held-by-subject", "held-by-manifest", "h1", "h3", "h3-release"].sort(),
    );
    expect(r.archived.map((row) => row.audit_id).sort()).toEqual(
      data
        .filter(
          (row) =>
            ![
              "held-by-subject",
              "held-by-manifest",
              "h1",
              "h3",
              "h3-release",
            ].includes(row.audit_id),
        )
        .map((row) => row.audit_id)
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
    expect(r.archived.map((row) => row.audit_id)).toEqual(["free"]);
  });
  for (const failure of ["sql", "write", "verify"] as const) {
    it(`${failure} failure is nonzero, retains source and cannot print purge success`, () => {
      const r = run([row("free")], { failure });
      expect(r.result.status).not.toBe(0);
      expect(r.state.rows.map((row) => row.audit_id)).toEqual(["free"]);
      expect(r.result.stdout).not.toContain("purge completed successfully");
      expect(
        r.calls.every((call) => call.args.includes("ON_ERROR_STOP=1")),
      ).toBe(true);
    });
  }
  it("archive directory open failure occurs before deletion", () => {
    const r = run([row("free")], { outputFile: true });
    expect(r.result.status).not.toBe(0);
    expect(r.state.rows.map((row) => row.audit_id)).toEqual(["free"]);
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
