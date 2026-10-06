import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";

describe("resolve-bank-signing-secrets.sh", () => {
  const scriptPath = path.resolve(
    __dirname,
    "../../operations/deployment/resolve-bank-signing-secrets.sh",
  );

  const execScript = (
    prefix: string,
    projectId: string,
    mockGcloudPaths: Record<string, string>,
  ) => {
    // Create a mock gcloud command
    const mockGcloud = `
      #!/usr/bin/env bash
      if [[ "$1" == "secrets" && "$2" == "describe" ]]; then
        secret_name="$3"
        ${Object.entries(mockGcloudPaths)
          .map(([name, status]) => {
            if (status === "exists") {
              return `if [[ "$secret_name" == "${name}" ]]; then exit 0; fi`;
            } else if (status === "NOT_FOUND") {
              return `if [[ "$secret_name" == "${name}" ]]; then echo "NOT_FOUND" >&2; exit 1; fi`;
            } else if (status === "PERMISSION_DENIED") {
              return `if [[ "$secret_name" == "${name}" ]]; then echo "PERMISSION_DENIED" >&2; exit 1; fi`;
            }
            return "";
          })
          .join("\n        ")}
        echo "NOT_FOUND" >&2
        exit 1
      fi
      exit 1
    `;

    const tmpDir = path.join(
      os.tmpdir(),
      `mock-bin-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    const env = {
      ...process.env,
      PATH: `${tmpDir}:${process.env.PATH}`,
    };

    execSync(`mkdir -p ${tmpDir}`);
    execSync(`echo '${mockGcloud.replace(/'/g, "'\\''")}' > ${tmpDir}/gcloud`);
    execSync(`chmod +x ${tmpDir}/gcloud`);

    try {
      const stdout = execSync(`"${scriptPath}" "${prefix}" "${projectId}"`, {
        env,
        encoding: "utf-8",
        stdio: "pipe",
      });
      return { stdout, error: null };
    } catch (err: unknown) {
      const e = err as { stdout?: string | Buffer; stderr?: string | Buffer };
      const stdoutStr = Buffer.isBuffer(e.stdout)
        ? e.stdout.toString("utf-8")
        : e.stdout || "";
      const stderrStr = Buffer.isBuffer(e.stderr)
        ? e.stderr.toString("utf-8")
        : e.stderr || "";
      return { stdout: stdoutStr, error: { ...e, stderr: stderrStr } };
    } finally {
      execSync(`rm -rf ${tmpDir}`);
    }
  };

  const secrets = [
    "drts-dev-bank-artifact-signing-private-key",
    "drts-dev-bank-artifact-signing-public-key",
    "drts-dev-bank-artifact-signing-key-id",
  ] as const;

  describe("all 8 subsets of presence", () => {
    const allCombinations = [
      [false, false, false],
      [false, false, true],
      [false, true, false],
      [false, true, true],
      [true, false, false],
      [true, false, true],
      [true, true, false],
      [true, true, true],
    ];

    allCombinations.forEach((combo) => {
      const presentCount = combo.filter(Boolean).length;
      it(`handles subset with ${presentCount} secrets present (${combo.join(
        ",",
      )})`, () => {
        const mockPaths = {
          [secrets[0]]: combo[0] ? "exists" : "NOT_FOUND",
          [secrets[1]]: combo[1] ? "exists" : "NOT_FOUND",
          [secrets[2]]: combo[2] ? "exists" : "NOT_FOUND",
        };
        const res = execScript("drts-dev", "test-project", mockPaths);

        if (presentCount === 3) {
          expect(res.error).toBeNull();
          expect(res.stdout.trim()).toBe(
            `BANK_ARTIFACT_SIGNING_PRIVATE_KEY=${secrets[0]}:latest,BANK_ARTIFACT_SIGNING_PUBLIC_KEY=${secrets[1]}:latest,BANK_ARTIFACT_SIGNING_KEY_ID=${secrets[2]}:latest`,
          );
        } else if (presentCount === 0) {
          expect(res.error).toBeNull();
          expect(res.stdout.trim()).toBe("");
        } else {
          expect(res.error).not.toBeNull();
          expect(res.error?.stderr).toContain(
            "::error::Bank signing configuration is partial",
          );
        }
      });
    });
  });

  describe("metadata lookup errors", () => {
    it("should fail and print error if gcloud returns an error other than NOT_FOUND (PERMISSION_DENIED)", () => {
      const res = execScript("drts-dev", "test-project", {
        [secrets[0]]: "PERMISSION_DENIED",
        [secrets[1]]: "PERMISSION_DENIED",
        [secrets[2]]: "PERMISSION_DENIED",
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.stderr).toContain("::error::Failed to describe secret");
      expect(res.error?.stderr).toContain("PERMISSION_DENIED");
    });

    it("should fail if 1 secret is PERMISSION_DENIED and others are NOT_FOUND", () => {
      const res = execScript("drts-dev", "test-project", {
        [secrets[0]]: "NOT_FOUND",
        [secrets[1]]: "PERMISSION_DENIED",
        [secrets[2]]: "NOT_FOUND",
      });
      expect(res.error).not.toBeNull();
      expect(res.error?.stderr).toContain("::error::Failed to describe secret");
      expect(res.error?.stderr).toContain("PERMISSION_DENIED");
    });
  });
});
