import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(
  __dirname,
  "../../../../tools/system-remediation/ops-proof/ops-proof.sh",
);

const shaHexPattern = /^[a-f0-9]{40}$/;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("SR-OPS-PROOF-001 isolated ops proof harness", () => {
  it("records provenance and explicitly retains live-operation gates", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "ops-proof-"));
    const output = resolve(directory, "inventory.json");
    try {
      execFileSync("bash", [script, "inventory", "--output", output]);
      const evidence = JSON.parse(readFileSync(output, "utf8"));
      expect(evidence.taskId).toBe("SR-OPS-PROOF-001");
      expect(evidence.baseSha).toMatch(shaHexPattern);
      expect(evidence.candidateSha).toMatch(shaHexPattern);
      expect(evidence.liveNotPerformed).toContain("cloud_restore");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed before any restore when target is not an isolated loopback database", () => {
    const result = spawnSync(
      "bash",
      [
        script,
        "restore",
        "--snapshot",
        script,
        "--isolated-database-url",
        "postgresql://ops.example.invalid/drts_fleet_platform",
        "--output",
        "/tmp/ops-proof-should-not-exist.json",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("loopback");
  });

  it("requires all three workload families instead of silently omitting one", () => {
    const result = spawnSync(
      "bash",
      [script, "load", "--booking-url", "http://127.0.0.1:9", "--output", "/tmp/nope.json"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("booking, dispatch, and report");
  });

  it("refuses to turn this preparation harness into a cloud load test", () => {
    const result = spawnSync(
      "bash",
      [
        script,
        "load",
        "--booking-url", "https://load.example.invalid/booking",
        "--dispatch-url", "https://load.example.invalid/dispatch",
        "--report-url", "https://load.example.invalid/report",
        "--output", "/tmp/nope.json",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("SR-LIVE-OPS-001");
  });

  describe("restore destination-override bypass regression", () => {
    let directory: string;
    let fakeBin: string;
    let invokedMarker: string;

    afterEach(() => {
      if (directory) rmSync(directory, { recursive: true, force: true });
    });

    function setUpFakePgRestore(): void {
      directory = mkdtempSync(resolve(tmpdir(), "ops-proof-bypass-"));
      fakeBin = resolve(directory, "bin");
      invokedMarker = resolve(directory, "pg_restore.invoked");
      require("node:fs").mkdirSync(fakeBin);
      writeFileSync(
        resolve(fakeBin, "pg_restore"),
        `#!/usr/bin/env bash\ntouch "${invokedMarker}"\nexit 0\n`,
      );
      writeFileSync(
        resolve(fakeBin, "psql"),
        `#!/usr/bin/env bash\necho '{"trips":0,"billing":0,"audit":0}'\n`,
      );
      chmodSync(resolve(fakeBin, "pg_restore"), 0o755);
      chmodSync(resolve(fakeBin, "psql"), 0o755);
    }

    it("rejects a query-parameter destination override (hostaddr) before invoking pg_restore", () => {
      setUpFakePgRestore();
      const result = spawnSync(
        "bash",
        [
          script,
          "restore",
          "--snapshot",
          script,
          "--manifest",
          script,
          "--isolated-database-url",
          "postgresql://localhost/drts_ops_proof_review?hostaddr=192.0.2.1",
          "--output",
          resolve(directory, "should-not-exist.json"),
        ],
        { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } },
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/query parameter|libpq URI/i);
      expect(existsSync(invokedMarker)).toBe(false);
      expect(existsSync(resolve(directory, "should-not-exist.json"))).toBe(false);
    });

    it("rejects a fragment-based destination override before invoking pg_restore", () => {
      setUpFakePgRestore();
      const result = spawnSync(
        "bash",
        [
          script,
          "restore",
          "--snapshot",
          script,
          "--manifest",
          script,
          "--isolated-database-url",
          "postgresql://localhost/drts_ops_proof_review#hostaddr=192.0.2.1",
          "--output",
          resolve(directory, "should-not-exist.json"),
        ],
        { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } },
      );
      expect(result.status).toBe(2);
      expect(existsSync(invokedMarker)).toBe(false);
    });
  });

  describe("restore manifest reconciliation with stubbed pg_restore/psql", () => {
    let directory: string;
    let fakeBin: string;
    let restoreEnvFile: string;
    let psqlEnvFile: string;
    let snapshotPath: string;
    let snapshotSha256: string;

    afterEach(() => {
      if (directory) rmSync(directory, { recursive: true, force: true });
    });

    function setUp(psqlCounts: string): void {
      directory = mkdtempSync(resolve(tmpdir(), "ops-proof-restore-"));
      fakeBin = resolve(directory, "bin");
      require("node:fs").mkdirSync(fakeBin);
      restoreEnvFile = resolve(directory, "pg_restore.env");
      psqlEnvFile = resolve(directory, "psql.env");
      snapshotPath = resolve(directory, "snapshot.dump");
      writeFileSync(snapshotPath, "fake-pg-dump-content");
      snapshotSha256 = sha256File(snapshotPath);

      writeFileSync(
        resolve(fakeBin, "pg_restore"),
        `#!/usr/bin/env bash\nenv > "${restoreEnvFile}"\nexit 0\n`,
      );
      writeFileSync(
        resolve(fakeBin, "psql"),
        `#!/usr/bin/env bash\nenv > "${psqlEnvFile}"\necho '${psqlCounts}'\n`,
      );
      chmodSync(resolve(fakeBin, "pg_restore"), 0o755);
      chmodSync(resolve(fakeBin, "psql"), 0o755);
    }

    it("succeeds and strips ambient PG* destination env vars when counts match the manifest", () => {
      setUp('{"trips":3,"billing":5,"audit":7}');
      const manifestPath = resolve(directory, "manifest.json");
      writeFileSync(
        manifestPath,
        JSON.stringify({ snapshotSha256, expectedCounts: { trips: 3, billing: 5, audit: 7 } }),
      );
      const output = resolve(directory, "restore.json");

      const result = spawnSync(
        "bash",
        [
          script, "restore",
          "--snapshot", snapshotPath,
          "--manifest", manifestPath,
          "--isolated-database-url", "postgresql://localhost/drts_ops_proof_review",
          "--output", output,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH}`,
            PGHOSTADDR: "192.0.2.1",
            PGHOST: "evil.example.invalid",
          },
        },
      );

      expect(result.status).toBe(0);
      const evidence = JSON.parse(readFileSync(output, "utf8"));
      expect(evidence.countsMatchManifest).toBe(true);
      expect(evidence.readback).toEqual({ trips: 3, billing: 5, audit: 7 });
      expect(evidence.baseSha).toMatch(shaHexPattern);
      expect(evidence.candidateSha).toMatch(shaHexPattern);
      expect(evidence.productionDatabaseTouched).toBe(false);

      const restoreEnv = readFileSync(restoreEnvFile, "utf8");
      const psqlEnv = readFileSync(psqlEnvFile, "utf8");
      for (const forbidden of ["PGHOSTADDR=", "PGHOST="]) {
        expect(restoreEnv).not.toContain(forbidden);
        expect(psqlEnv).not.toContain(forbidden);
      }
    });

    it("fails closed when restored counts do not match the snapshot manifest", () => {
      setUp('{"trips":3,"billing":5,"audit":999}');
      const manifestPath = resolve(directory, "manifest.json");
      writeFileSync(
        manifestPath,
        JSON.stringify({ snapshotSha256, expectedCounts: { trips: 3, billing: 5, audit: 7 } }),
      );
      const output = resolve(directory, "restore.json");

      const result = spawnSync(
        "bash",
        [
          script, "restore",
          "--snapshot", snapshotPath,
          "--manifest", manifestPath,
          "--isolated-database-url", "postgresql://localhost/drts_ops_proof_review",
          "--output", output,
        ],
        { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } },
      );

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("do not match");
      expect(existsSync(output)).toBe(false);
    });

    it("fails closed when the manifest sha256 does not describe the supplied snapshot", () => {
      setUp('{"trips":3,"billing":5,"audit":7}');
      const manifestPath = resolve(directory, "manifest.json");
      writeFileSync(
        manifestPath,
        JSON.stringify({ snapshotSha256: "0".repeat(64), expectedCounts: { trips: 3, billing: 5, audit: 7 } }),
      );
      const output = resolve(directory, "restore.json");

      const result = spawnSync(
        "bash",
        [
          script, "restore",
          "--snapshot", snapshotPath,
          "--manifest", manifestPath,
          "--isolated-database-url", "postgresql://localhost/drts_ops_proof_review",
          "--output", output,
        ],
        { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } },
      );

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("snapshotSha256");
      expect(existsSync(restoreEnvFile)).toBe(false);
    });
  });

  describe("load workload contract fidelity (curl stubbed, no real network I/O)", () => {
    // A real loopback HTTP round-trip is not exercised here: this sandbox's
    // outbound-network approval gate is unavailable in this session and a
    // live curl call hangs indefinitely waiting on it. Stubbing `curl` lets
    // this regression deterministically verify the exact method/headers/body
    // the script sends, without depending on that gate.
    it("sends contract-shaped POST writes and records base/candidate SHA per request", () => {
      const directory = mkdtempSync(resolve(tmpdir(), "ops-proof-load-"));
      const fakeBin = resolve(directory, "bin");
      require("node:fs").mkdirSync(fakeBin);
      const curlLog = resolve(directory, "curl.invocations.jsonl");
      writeFileSync(
        resolve(fakeBin, "curl"),
        [
          "#!/usr/bin/env bash",
          "node -e '",
          "const fs = require(\"fs\");",
          "fs.appendFileSync(process.env.FAKE_CURL_LOG, JSON.stringify(process.argv.slice(1)) + \"\\n\");",
          "' -- \"$@\"",
          'last="${@: -1}"',
          "case \"$last\" in",
          "  *bookings*) echo '201 0.012' ;;",
          "  *dispatch*) echo '201 0.012' ;;",
          "  *reports*) echo '202 0.012' ;;",
          "  *) echo '599 0.012' ;;",
          "esac",
          "",
        ].join("\n"),
      );
      chmodSync(resolve(fakeBin, "curl"), 0o755);
      const output = resolve(directory, "load.jsonl");
      try {
        execFileSync(
          "bash",
          [
            script, "load",
            "--booking-url", "http://127.0.0.1:9/api/tenant/bookings",
            "--dispatch-url", "http://127.0.0.1:9/api/orders/order-1/dispatch",
            "--report-url", "http://127.0.0.1:9/api/reports/jobs",
            "--requests", "1",
            "--output", output,
          ],
          { env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, FAKE_CURL_LOG: curlLog } },
        );
        const lines = readFileSync(output, "utf8").trim().split("\n").map((line) => JSON.parse(line));
        expect(lines).toHaveLength(3);

        const booking = lines.find((line) => line.workload === "booking");
        expect(booking.method).toBe("POST");
        expect(booking.expectedStatus).toBe(201);
        expect(booking.httpStatus).toBe(201);
        expect(booking.success).toBe(true);
        expect(booking.baseSha).toMatch(shaHexPattern);
        expect(booking.candidateSha).toMatch(shaHexPattern);
        expect(booking.requestBody.bookingType).toBe("oneway");
        expect(booking.requestBody.passenger.mobile).toBe("0900000000");

        const dispatch = lines.find((line) => line.workload === "dispatch");
        expect(dispatch.method).toBe("POST");
        expect(dispatch.expectedStatus).toBe(201);
        expect(dispatch.requestBody).toEqual({});

        const report = lines.find((line) => line.workload === "report");
        expect(report.method).toBe("POST");
        expect(report.expectedStatus).toBe(202);
        expect(report.requestBody.jobType).toBe("ops_proof_load_probe");
        expect(report.requestBody.format).toBe("csv");

        const invocations = readFileSync(curlLog, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as string[]);
        expect(invocations).toHaveLength(3);
        for (const args of invocations) {
          expect(args).toContain("--request");
          expect(args[args.indexOf("--request") + 1]).toBe("POST");
          expect(args).toContain("Content-Type: application/json");
          expect(args).toContain("--data");
        }
        const bookingInvocation = invocations.find((args) => args.at(-1)?.includes("/api/tenant/bookings"))!;
        const bookingBody = JSON.parse(bookingInvocation[bookingInvocation.indexOf("--data") + 1]);
        expect(bookingBody.bookingType).toBe("oneway");
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });
});
