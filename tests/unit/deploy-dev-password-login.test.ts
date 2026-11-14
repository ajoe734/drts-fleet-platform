import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../.github/workflows/deploy-dev.yml", import.meta.url),
  "utf8",
);

// Mirrors tests/unit/deploy-dev-google-oidc.test.ts: execute the production
// workflow block itself. Only gcloud is mocked.
const secretGateBlock = workflow.slice(
  workflow.indexOf(
    "          # Password login (Argon2id pepper + TOTP envelope-encryption key) is",
  ),
  workflow.indexOf("          # Remote SMTP is opt-in and fail-closed."),
);

function runSecretGate(options: {
  pepperPresent: boolean;
  totpPresent: boolean;
}) {
  const dir = mkdtempSync(join(tmpdir(), "drts-password-login-gate-"));
  try {
    const output = join(dir, "output");
    const script = `set -euo pipefail
gcloud() {
  case "$*" in
    *password-pepper*) [[ "\${MOCK_PEPPER_PRESENT}" == true ]] ;;
    *totp-encryption-key*) [[ "\${MOCK_TOTP_PRESENT}" == true ]] ;;
    *) return 99 ;;
  esac
}
secret_prefix=drts-dev
project_id=test-project
secret_args=BASE=reference
${secretGateBlock}
printf '%s\\n' "$secret_args" >> "$GITHUB_OUTPUT"
`;
    const result = spawnSync("bash", ["-c", script], {
      env: {
        ...process.env,
        MOCK_PEPPER_PRESENT: String(options.pepperPresent),
        MOCK_TOTP_PRESENT: String(options.totpPresent),
        GITHUB_OUTPUT: output,
      },
      encoding: "utf8",
    });
    const values = result.status === 0 ? readFileSync(output, "utf8") : "";
    return { result, values };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("deploy-dev password login (pepper/TOTP) all-or-nothing configuration", () => {
  it.each([
    { pepperPresent: false, totpPresent: false, exit: 0, enabled: false },
    { pepperPresent: true, totpPresent: false, exit: 1, enabled: false },
    { pepperPresent: false, totpPresent: true, exit: 1, enabled: false },
    { pepperPresent: true, totpPresent: true, exit: 0, enabled: true },
  ])(
    "handles pepper present=$pepperPresent, totp present=$totpPresent",
    ({ pepperPresent, totpPresent, exit, enabled }) => {
      const { result, values } = runSecretGate({ pepperPresent, totpPresent });
      expect(result.status, result.stderr).toBe(exit);
      if (exit !== 0) {
        expect(result.stdout).toContain(
          "Password login configuration is partial",
        );
        return;
      }
      expect(values).toContain(`password_login_enabled=${enabled}`);
      expect(
        values.includes(
          "PASSWORD_PEPPER_SECRETS_JSON=drts-dev-password-pepper:latest",
        ),
      ).toBe(enabled);
      expect(
        values.includes(
          "TOTP_ENCRYPTION_KEYS_JSON=drts-dev-totp-encryption-key:latest",
        ),
      ).toBe(enabled);
    },
  );

  it("never calls gcloud secrets versions access (existence check only, never reads values)", () => {
    const { result } = runSecretGate({
      pepperPresent: true,
      totpPresent: true,
    });
    expect(result.status).toBe(0);
    expect(secretGateBlock).not.toContain("secrets versions access");
    expect(secretGateBlock).toContain("secrets describe");
  });
});

describe("deploy-dev password login API service reconciliation", () => {
  const reconcileStep = (() => {
    const start = workflow.indexOf(
      "      - name: Reconcile password login configuration on the API service\n",
    );
    const end = workflow.indexOf("\n      - name:", start + 1);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    return workflow.slice(start, end);
  })();

  function runReconcile(passwordLoginEnabled: boolean, pepperVersionEnv = "") {
    const script = reconcileStep
      .split("        run: |\n")[1]!
      .split("\n")
      .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
      .join("\n")
      .replaceAll(
        "${{ steps.api_secrets.outputs.password_login_enabled }}",
        String(passwordLoginEnabled),
      )
      .replaceAll("${{ needs.prepare.outputs.api_service }}", "drts-dev-api")
      .replaceAll("${{ needs.prepare.outputs.region }}", "us-central1")
      .replaceAll("${{ needs.prepare.outputs.project_id }}", "test-project")
      .replaceAll("${{ needs.prepare.outputs.secret_prefix }}", "drts-dev");

    const wrapped = `
set -euo pipefail
gcloud() { printf '%s\\n' "$*" >> "$CALLS_LOG"; }
${script}
`;
    const dir = mkdtempSync(join(tmpdir(), "drts-password-login-reconcile-"));
    try {
      const callsLog = join(dir, "calls");
      const result = spawnSync("bash", ["-c", wrapped], {
        env: {
          ...process.env,
          CALLS_LOG: callsLog,
          DEV_PASSWORD_PEPPER_CURRENT_VERSION: pepperVersionEnv,
        },
        encoding: "utf8",
      });
      const calls = result.status === 0 ? readFileSync(callsLog, "utf8") : "";
      return { result, calls };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("mounts both secrets and enables the flag when password login is enabled", () => {
    const { result, calls } = runReconcile(true);
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toContain(
      "PASSWORD_PEPPER_SECRETS_JSON=drts-dev-password-pepper:latest,TOTP_ENCRYPTION_KEYS_JSON=drts-dev-totp-encryption-key:latest",
    );
    expect(calls).toContain(
      "PASSWORD_LOGIN_ENABLED=true,PASSWORD_PEPPER_CURRENT_VERSION=v1",
    );
  });

  it("uses an overridden pepper version when provided", () => {
    const { result, calls } = runReconcile(true, "v2");
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toContain("PASSWORD_PEPPER_CURRENT_VERSION=v2");
  });

  it("only sets the disabled flag, never mounting secrets, when password login is disabled", () => {
    const { result, calls } = runReconcile(false);
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toContain("PASSWORD_LOGIN_ENABLED=false");
    expect(calls).not.toContain("PASSWORD_PEPPER_SECRETS_JSON");
    expect(calls).not.toContain("TOTP_ENCRYPTION_KEYS_JSON");
  });
});
