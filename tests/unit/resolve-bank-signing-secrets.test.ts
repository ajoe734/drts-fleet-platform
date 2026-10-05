import { execSync } from "node:child_process";
import * as path from "node:path";

describe("resolve-bank-signing-secrets.sh", () => {
  const scriptPath = path.resolve(
    __dirname,
    "../../operations/deployment/resolve-bank-signing-secrets.sh",
  );

  const execScript = (
    prefix: string,
    projectId: string,
    mockGcloudPaths: Record<string, boolean>,
  ) => {
    // Create a mock gcloud command that exits with 0 if the secret is in mockGcloudPaths, else 1
    const mockGcloud = `
      #!/usr/bin/env bash
      if [[ "$1" == "secrets" && "$2" == "describe" ]]; then
        secret_name="$3"
        ${Object.entries(mockGcloudPaths)
          .map(
            ([name, exists]) =>
              `if [[ "$secret_name" == "${name}" ]]; then exit ${
                exists ? 0 : 1
              }; fi`,
          )
          .join("\n        ")}
        exit 1
      fi
      exit 1
    `;

    const env = {
      ...process.env,
      PATH: `${__dirname}/mock-bin:${process.env.PATH}`,
    };

    // We will write the mock to a temporary directory and put it in PATH
    execSync(`mkdir -p ${__dirname}/mock-bin`);
    execSync(`echo '${mockGcloud}' > ${__dirname}/mock-bin/gcloud`);
    execSync(`chmod +x ${__dirname}/mock-bin/gcloud`);

    try {
      const stdout = execSync(`"${scriptPath}" "${prefix}" "${projectId}"`, {
        env,
        encoding: "utf-8",
        stdio: "pipe",
      });
      return { stdout, error: null };
    } catch (err) {
      const e = err as { stdout?: string | Buffer; stderr?: string | Buffer };
      return { stdout: e.stdout, error: e };
    } finally {
      execSync(`rm -rf ${__dirname}/mock-bin`);
    }
  };

  it("should return the mounts if all 3 secrets are present", () => {
    const res = execScript("drts-dev", "test-project", {
      "drts-dev-bank-signing-private-key": true,
      "drts-dev-bank-signing-public-key": true,
      "drts-dev-bank-signing-key-id": true,
    });
    expect(res.error).toBeNull();
    expect(res.stdout.trim()).toBe(
      "BANK_SIGNING_PRIVATE_KEY=drts-dev-bank-signing-private-key:latest,BANK_SIGNING_PUBLIC_KEY=drts-dev-bank-signing-public-key:latest,BANK_SIGNING_KEY_ID=drts-dev-bank-signing-key-id:latest",
    );
  });

  it("should return empty string and print notice if no secrets are present", () => {
    const res = execScript("drts-dev", "test-project", {
      "drts-dev-bank-signing-private-key": false,
      "drts-dev-bank-signing-public-key": false,
      "drts-dev-bank-signing-key-id": false,
    });
    expect(res.error).toBeNull();
    expect(res.stdout.trim()).toBe("");
  });

  it("should fail and print error if only 1 secret is present", () => {
    const res = execScript("drts-dev", "test-project", {
      "drts-dev-bank-signing-private-key": true,
      "drts-dev-bank-signing-public-key": false,
      "drts-dev-bank-signing-key-id": false,
    });
    expect(res.error).not.toBeNull();
    expect(res.error.stderr.toString()).toContain("::error::Bank signing configuration is partial");
  });

  it("should fail and print error if 2 secrets are present", () => {
    const res = execScript("drts-dev", "test-project", {
      "drts-dev-bank-signing-private-key": true,
      "drts-dev-bank-signing-public-key": true,
      "drts-dev-bank-signing-key-id": false,
    });
    expect(res.error).not.toBeNull();
    expect(res.error.stderr.toString()).toContain("::error::Bank signing configuration is partial");
  });
});
