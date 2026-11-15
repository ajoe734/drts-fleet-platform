import {
  chmodSync,
  mkdirSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

// Execute the actual initial env/deploy run scalars and existing deploy wrapper.
// Only the external gcloud metadata/deploy port is replaced; the later password
// reconcile step is deliberately never executed by this first-revision test.
function firstPasswordApiDeployment(options: {
  present: boolean;
  rollout?: string;
  pepperVersion?: string;
}) {
  const gate = runSecretGate({
    pepperPresent: options.present,
    totpPresent: options.present,
  });
  expect(gate.result.status, gate.result.stderr).toBe(0);
  const lines = gate.values.trim().split("\n");
  const presence = lines
    .find((line) => line.startsWith("password_login_enabled="))
    ?.split("=")[1];
  const mounts = lines.at(-1);
  if (presence === undefined || mounts === undefined)
    throw new Error("Missing actual password secret-gate output");
  function step(name: string) {
    const marker = `      - name: ${name}\n`;
    const start = workflow.indexOf(marker);
    if (start < 0) throw new Error(`Missing workflow step ${name}`);
    const end = workflow.indexOf("\n      - name:", start + marker.length);
    return workflow.slice(start, end < 0 ? undefined : end);
  }
  function runScalar(block: string) {
    const run = block.split("        run: |\n")[1];
    if (!run) throw new Error("Missing original workflow run scalar");
    return run
      .split("\n")
      .map((line) => line.replace(/^ {10}/, ""))
      .join("\n");
  }
  const outputs: Record<string, string> = {
    "needs.prepare.outputs.project_id": "synthetic-project",
    "needs.prepare.outputs.registry": "example.invalid/synthetic",
    "needs.prepare.outputs.region": "us-central1",
    "needs.prepare.outputs.cloudsql":
      "synthetic-project:us-central1:synthetic-db",
    "needs.prepare.outputs.runtime_service_account": "runtime@example.invalid",
    "needs.prepare.outputs.api_service": "synthetic-api",
    "needs.prepare.outputs.api_exposure_flag": "--allow-unauthenticated",
    "needs.prepare.outputs.tenant_console_service": "synthetic-tenant",
    "needs.prepare.outputs.enterprise_dispatch_service": "synthetic-dispatch",
    "needs.prepare.outputs.agency_portal_service": "synthetic-agency",
    "needs.prepare.outputs.agency_portal_origin":
      "https://agency.example.invalid",
    "needs.prepare.outputs.tenant_console_origin":
      "https://tenant.example.invalid",
    "needs.prepare.outputs.enterprise_dispatch_origin":
      "https://dispatch.example.invalid",
    "needs.prepare.outputs.passenger_app_service": "synthetic-passenger",
    "needs.prepare.outputs.ops_console_origin": "https://ops.example.invalid",
    "needs.build-push.outputs.image_tag": "synthetic-image",
    "needs.build-push.outputs.candidate_sha":
      "1234567890abcdef1234567890abcdef12345678",
    "steps.api_secrets.outputs.api": mounts,
    "steps.api_secrets.outputs.password_login_enabled": presence,
    "steps.api_secrets.outputs.jwt_issuer": "synthetic-issuer",
    "steps.api_secrets.outputs.jwt_audience": "synthetic-audience",
    "steps.api_secrets.outputs.llm_provider": "mock",
    "steps.api_secrets.outputs.llm_chat_model": "synthetic",
    "steps.api_secrets.outputs.llm_summarizer_model": "synthetic",
    "steps.api_secrets.outputs.map_provider_mode": "mock",
    "steps.api_secrets.outputs.map_provider_mode == 'external' && 'google' || 'mock'":
      "mock",
    "steps.api_secrets.outputs.oidc_enabled": "false",
    "steps.api_secrets.outputs.notification_outbox_type": "memory",
    "steps.api_secrets.outputs.llm_base_url": "",
    "steps.api_secrets.outputs.openclaw_auth_provider": "",
    "steps.api_secrets.outputs.openclaw_home": "",
    "steps.api_secrets.outputs.regulatory_alert_recipient_secret_mounted":
      "false",
    "steps.artifact_providers.outputs.env_suffix":
      "@ARTIFACT_PROVIDER=synthetic",
    "steps.passenger_secrets.outputs.api": "",
    "steps.passenger_secrets.outputs.otp_mounts_complete": "false",
    "steps.passenger_secrets.outputs.payment_mounts_complete": "false",
  };
  const render = (script: string) =>
    script.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, key: string) => {
      const value = outputs[key];
      if (value === undefined)
        throw new Error(`Missing expression fixture ${key}`);
      return value;
    });
  const dir = mkdtempSync(join(tmpdir(), "drts-password-first-api-"));
  try {
    mkdirSync(join(dir, "bin"));
    mkdirSync(join(dir, "operations/deployment"), { recursive: true });
    const wrapper = join(
      dir,
      "operations/deployment/deploy-cloud-run-service.sh",
    );
    writeFileSync(
      wrapper,
      readFileSync(
        new URL(
          "../../operations/deployment/deploy-cloud-run-service.sh",
          import.meta.url,
        ),
      ),
    );
    chmodSync(wrapper, 0o755);
    const gcloud = join(dir, "bin/gcloud");
    writeFileSync(
      gcloud,
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'run' && args[1] === 'services' && args[2] === 'describe') {
  if (args.includes('--format=json')) process.exit(1);
  console.log('https://' + args[3] + '.example.invalid');
} else if (args[0] === 'run' && args[1] === 'deploy') {
  fs.appendFileSync(process.env.DEPLOY_LOG, JSON.stringify(args) + '\\n');
} else { throw new Error('Unexpected cloud port ' + args.join(' ')); }
`,
    );
    chmodSync(gcloud, 0o755);
    const env: NodeJS.ProcessEnv = {
      PATH: `${join(dir, "bin")}:${process.env.PATH ?? ""}`,
      DEPLOY_LOG: join(dir, "deploys.jsonl"),
      DEV_PAX_REVIEW_DEMO_ENABLED: "false",
      DEV_WORKLOAD_IDENTITY_ISSUER: "synthetic-issuer",
      DEV_WORKLOAD_IDENTITY_AUDIENCE: "synthetic-audience",
    };
    if (options.rollout !== undefined)
      env.DEV_PASSWORD_LOGIN_ENABLED = options.rollout;
    if (options.pepperVersion !== undefined)
      env.DEV_PASSWORD_PEPPER_CURRENT_VERSION = options.pepperVersion;
    const envStep = step("Build API env vars");
    for (const match of envStep
      .split("        run: |\n")[0]!
      .matchAll(/^ {10}([A-Z_]+): (.*)$/gm)) {
      const name = match[1];
      const value = match[2];
      if (name === undefined || value === undefined)
        throw new Error("Malformed actual step env binding");
      env[name] = render(value);
    }
    function execute(script: string, output: string) {
      env.GITHUB_OUTPUT = join(dir, output);
      const result = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-euo", "pipefail", "-c", render(script)],
        { cwd: dir, env, encoding: "utf8", timeout: 10000 },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    }
    execute(runScalar(envStep), "api-env");
    const payload = readFileSync(env.GITHUB_OUTPUT!, "utf8")
      .trim()
      .replace(/^vars=/, "");
    outputs["steps.api_env.outputs.vars"] = payload;
    const deployStep = step("Deploy — api");
    const binding = deployStep.match(/^ {10}API_ENV_VARS: (.*)$/m)?.[1];
    if (binding === undefined)
      throw new Error("Missing actual API_ENV_VARS binding");
    env.API_ENV_VARS = render(binding);
    execute(runScalar(deployStep), "api-deploy");
    const deployments: string[][] = readFileSync(env.DEPLOY_LOG!, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    expect(deployments).toHaveLength(1);
    const args = deployments[0];
    if (args === undefined) throw new Error("No initial API deploy");
    expect(args.filter((arg) => arg === "--set-env-vars")).toHaveLength(1);
    const transported = args[args.indexOf("--set-env-vars") + 1];
    if (transported === undefined)
      throw new Error("Missing initial --set-env-vars");
    expect(transported).toBe(payload);
    expect(transported.startsWith("^@^")).toBe(true);
    const firstEnv = Object.fromEntries(
      transported
        .slice(3)
        .split("@")
        .map((entry) => {
          const separator = entry.indexOf("=");
          if (separator <= 0) throw new Error("Malformed initial env entry");
          return [entry.slice(0, separator), entry.slice(separator + 1)];
        }),
    );
    return { firstEnv, args };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("initial API revision password configuration", () => {
  it.each([
    { rollout: "false", expected: "false", pepperVersion: "v2" },
    { rollout: "true", expected: "true", pepperVersion: "v2" },
    { rollout: undefined, expected: "true", pepperVersion: undefined },
  ])(
    "sets the first revision to rollout=$expected and current pepper=$pepperVersion",
    ({ rollout, expected, pepperVersion }) => {
      const { firstEnv, args } = firstPasswordApiDeployment({
        present: true,
        ...(rollout === undefined ? {} : { rollout }),
        ...(pepperVersion === undefined ? {} : { pepperVersion }),
      });
      expect(firstEnv.PASSWORD_PEPPER_CURRENT_VERSION).toBe(
        pepperVersion ?? "v1",
      );
      expect(firstEnv.PASSWORD_LOGIN_ENABLED).toBe(expected);
      const secrets = args[args.indexOf("--set-secrets") + 1];
      expect(secrets).toContain(
        "PASSWORD_PEPPER_SECRETS_JSON=drts-dev-password-pepper:latest",
      );
      expect(secrets).toContain(
        "TOTP_ENCRYPTION_KEYS_JSON=drts-dev-totp-encryption-key:latest",
      );
    },
  );

  it("sets the first revision disabled with no password mounts when the pair is absent", () => {
    const { firstEnv, args } = firstPasswordApiDeployment({
      present: false,
      rollout: "false",
    });
    expect(firstEnv.PASSWORD_LOGIN_ENABLED ?? "false").toBe("false");
    expect(firstEnv.PASSWORD_PEPPER_CURRENT_VERSION).toBeUndefined();
    const secrets = args[args.indexOf("--set-secrets") + 1];
    expect(secrets).not.toContain("PASSWORD_PEPPER_SECRETS_JSON");
    expect(secrets).not.toContain("TOTP_ENCRYPTION_KEYS_JSON");
  });
});
