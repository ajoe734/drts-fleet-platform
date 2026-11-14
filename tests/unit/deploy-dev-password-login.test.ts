import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildPlan,
} = require("../../operations/verification/production-release-rail/rail.cjs");
const {
  fixture: prodFixture,
  SHA: PROD_SHA,
  TAG: PROD_TAG,
  DEPLOYER: PROD_DEPLOYER,
} = require("./sr-prod-full-surface-rail-20261012/fixture.cjs");

const workflow = readFileSync(
  new URL("../../.github/workflows/deploy-dev.yml", import.meta.url),
  "utf8",
);
const prodWorkflow = readFileSync(
  new URL("../../.github/workflows/deploy-prod.yml", import.meta.url),
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

  function runReconcile(
    passwordLoginEnabled: boolean,
    pepperVersionEnv = "",
    rolloutEnv: string | undefined = undefined,
  ) {
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
      const env: Record<string, string> = {
        ...process.env,
        CALLS_LOG: callsLog,
        DEV_PASSWORD_PEPPER_CURRENT_VERSION: pepperVersionEnv,
      };
      if (rolloutEnv === undefined) {
        delete env.DEV_PASSWORD_LOGIN_ENABLED;
      } else {
        env.DEV_PASSWORD_LOGIN_ENABLED = rolloutEnv;
      }
      const result = spawnSync("bash", ["-c", wrapped], {
        env,
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

  // DEV_PASSWORD_LOGIN_ENABLED (SA/SD portal-password-login-20261113 §10) is
  // an independent global rollout input, decoupled from secret presence: it
  // must be able to stay false while both secrets exist (backend deployed,
  // frontend entry still closed), and when false the secrets still mount so
  // existing password/TOTP logins keep working.
  it("still mounts both secrets but reports the flag disabled when the rollout input is explicitly false", () => {
    const { result, calls } = runReconcile(true, "", "false");
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toContain(
      "PASSWORD_PEPPER_SECRETS_JSON=drts-dev-password-pepper:latest,TOTP_ENCRYPTION_KEYS_JSON=drts-dev-totp-encryption-key:latest",
    );
    expect(calls).toContain(
      "PASSWORD_LOGIN_ENABLED=false,PASSWORD_PEPPER_CURRENT_VERSION=v1",
    );
  });

  it("defaults the rollout input to enabled when unset, preserving today's behavior", () => {
    const { result, calls } = runReconcile(true);
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toContain("PASSWORD_LOGIN_ENABLED=true,");
  });

  it("stays enabled when the rollout input is explicitly true", () => {
    const { result, calls } = runReconcile(true, "", "true");
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toContain("PASSWORD_LOGIN_ENABLED=true,");
  });
});

describe("deploy-prod password login (pepper/TOTP) secret mount gate", () => {
  // Mirrors the dev secret-gate test above: execute the actual workflow
  // block, mocking only gcloud.
  const prodSecretGateBlock = prodWorkflow.slice(
    prodWorkflow.indexOf("      - name: Resolve API secret mounts\n"),
    prodWorkflow.indexOf(
      "      - name: Validate public-entry policies and strict startup; freeze secret versions\n",
    ),
  );

  function runProdSecretGate(options: {
    pepperPresent: boolean;
    totpPresent: boolean;
    rollout?: string;
  }) {
    const script = prodSecretGateBlock
      .split("        run: |\n")[1]!
      .split("\n")
      .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
      .join("\n");
    const dir = mkdtempSync(join(tmpdir(), "drts-prod-password-login-gate-"));
    try {
      const output = join(dir, "output");
      const envOutput = join(dir, "env");
      const wrapped = `set -euo pipefail
gcloud() {
  case "$*" in
    *workload-identity-google-service-principals*) return 0 ;;
    *password-pepper*) [[ "\${MOCK_PEPPER_PRESENT}" == true ]] ;;
    *totp-encryption-key*) [[ "\${MOCK_TOTP_PRESENT}" == true ]] ;;
    *) return 99 ;;
  esac
}
SECRET_PREFIX=drts-prod
PROJECT_ID=test-project
${script}
`;
      const env: Record<string, string> = {
        ...process.env,
        MOCK_PEPPER_PRESENT: String(options.pepperPresent),
        MOCK_TOTP_PRESENT: String(options.totpPresent),
        GITHUB_OUTPUT: output,
        GITHUB_ENV: envOutput,
      };
      if (options.rollout === undefined) {
        delete env.PROD_PASSWORD_LOGIN_ENABLED;
      } else {
        env.PROD_PASSWORD_LOGIN_ENABLED = options.rollout;
      }
      const result = spawnSync("bash", ["-c", wrapped], {
        env,
        encoding: "utf8",
      });
      const values = result.status === 0 ? readFileSync(output, "utf8") : "";
      return { result, values };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it.each([
    { pepperPresent: false, totpPresent: false, exit: 0, present: false },
    { pepperPresent: true, totpPresent: false, exit: 1, present: false },
    { pepperPresent: false, totpPresent: true, exit: 1, present: false },
    { pepperPresent: true, totpPresent: true, exit: 0, present: true },
  ])(
    "handles pepper present=$pepperPresent, totp present=$totpPresent",
    ({ pepperPresent, totpPresent, exit, present }) => {
      const { result, values } = runProdSecretGate({
        pepperPresent,
        totpPresent,
      });
      expect(result.status, result.stderr).toBe(exit);
      if (exit !== 0) {
        expect(result.stdout).toContain(
          "Password login configuration is partial",
        );
        return;
      }
      expect(values).toContain(`password_login_secrets_present=${present}`);
    },
  );

  it("never calls gcloud secrets versions access (existence check only, never reads values)", () => {
    expect(prodSecretGateBlock).not.toContain("secrets versions access");
    expect(prodSecretGateBlock).toContain("secrets describe");
  });

  it("fails fast when the rollout input is true but the secrets do not exist yet", () => {
    const { result } = runProdSecretGate({
      pepperPresent: false,
      totpPresent: false,
      rollout: "true",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "PROD_PASSWORD_LOGIN_ENABLED=true requires",
    );
  });

  it("allows the rollout input to be true once both secrets exist", () => {
    const { result, values } = runProdSecretGate({
      pepperPresent: true,
      totpPresent: true,
      rollout: "true",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(values).toContain("password_login_secrets_present=true");
  });
});

describe("production rail password login plan/freeze integration (PWD-LOGIN-010)", () => {
  function prodVars(overrides: Record<string, string | undefined> = {}) {
    const { vars } = prodFixture();
    return { ...vars, ...overrides };
  }
  function apiService(vars: Record<string, string | undefined>) {
    const plan = buildPlan(vars, PROD_SHA, PROD_TAG, PROD_DEPLOYER);
    return plan.services.find((s: { id: string }) => s.id === "api");
  }

  it("mounts neither secret and reports disabled when the secrets are absent", () => {
    const api = apiService(prodVars());
    expect(api.secrets.PASSWORD_PEPPER_SECRETS_JSON).toBeUndefined();
    expect(api.secrets.TOTP_ENCRYPTION_KEYS_JSON).toBeUndefined();
    expect(api.env.PASSWORD_LOGIN_ENABLED).toBe("false");
    expect(api.env.PASSWORD_PEPPER_CURRENT_VERSION).toBeUndefined();
  });

  it("stays silently disabled (never throws) when the rollout flag is true but secrets are absent -- the workflow's own fail-fast check owns that invariant", () => {
    const api = apiService(prodVars({ PROD_PASSWORD_LOGIN_ENABLED: "true" }));
    expect(api.env.PASSWORD_LOGIN_ENABLED).toBe("false");
  });

  it("joins the plan/freeze chain (bare secret names, same as every other service secret) once present, but stays disabled without an explicit rollout", () => {
    const api = apiService(
      prodVars({
        PROD_PASSWORD_LOGIN_SECRETS_PRESENT: "true",
        PROD_PASSWORD_PEPPER_CURRENT_VERSION: "v1",
      }),
    );
    expect(api.secrets.PASSWORD_PEPPER_SECRETS_JSON).toBe(
      "drts-prod-password-pepper",
    );
    expect(api.secrets.TOTP_ENCRYPTION_KEYS_JSON).toBe(
      "drts-prod-totp-encryption-key",
    );
    expect(api.env.PASSWORD_LOGIN_ENABLED).toBe("false");
    expect(api.env.PASSWORD_PEPPER_CURRENT_VERSION).toBe("v1");
  });

  it("enables the flag only once both secrets are present and the rollout input is true", () => {
    const api = apiService(
      prodVars({
        PROD_PASSWORD_LOGIN_SECRETS_PRESENT: "true",
        PROD_PASSWORD_LOGIN_ENABLED: "true",
        PROD_PASSWORD_PEPPER_CURRENT_VERSION: "v1",
      }),
    );
    expect(api.env.PASSWORD_LOGIN_ENABLED).toBe("true");
  });

  it("requires PROD_PASSWORD_PEPPER_CURRENT_VERSION once the secrets are present", () => {
    expect(() =>
      apiService(prodVars({ PROD_PASSWORD_LOGIN_SECRETS_PRESENT: "true" })),
    ).toThrow("PROD_PASSWORD_PEPPER_CURRENT_VERSION");
  });

  it("freezes to a pinned numeric version through the unmodified deployArgs() gate, never :latest", () => {
    const {
      deployArgs,
    } = require("../../operations/verification/production-release-rail/rail.cjs");
    const api = apiService(
      prodVars({
        PROD_PASSWORD_LOGIN_SECRETS_PRESENT: "true",
        PROD_PASSWORD_PEPPER_CURRENT_VERSION: "v1",
      }),
    );
    // preflight.cjs freezes every service.secrets value to "<name>:<version>"
    // before deployArgs() ever runs; simulate that here to prove the two new
    // secrets pass the same pinned-version gate as the other eleven.
    const frozen = {
      ...api,
      secrets: Object.fromEntries(
        Object.entries(api.secrets).map(([k, v]) => [k, `${v}:7`]),
      ),
    };
    const plan = {
      registry: "us-central1-docker.pkg.dev/drts-prod/drts",
      project: "drts-prod",
      region: "us-central1",
      runtime: "drts-prod-runtime@drts-prod.iam.gserviceaccount.com",
      cloudsql: "drts-prod:us-central1:db",
    };
    const image = `${plan.registry}/api@sha256:${"a".repeat(64)}`;
    const args = deployArgs(plan, frozen, image);
    const secretsArg = args[args.indexOf("--set-secrets") + 1] as string;
    expect(secretsArg).toContain(
      "PASSWORD_PEPPER_SECRETS_JSON=drts-prod-password-pepper:7,TOTP_ENCRYPTION_KEYS_JSON=drts-prod-totp-encryption-key:7",
    );
  });
});
