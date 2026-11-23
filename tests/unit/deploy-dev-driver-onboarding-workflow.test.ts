import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const workflowPath = path.join(repoRoot, ".github/workflows/deploy-dev.yml");
const helperPath = path.join(
  repoRoot,
  "operations/deployment/resolve-driver-onboarding-secret-mounts.sh",
);
const workflow = readFileSync(workflowPath, "utf8");
const helperSource = readFileSync(helperPath, "utf8");
const temporaryDirectories: string[] = [];

const GITHUB_ACTIONS_MAX_EXPRESSION_LENGTH = 21000;
const VALID_FINGERPRINT_A = Array.from({ length: 32 }, () => "AA").join(":");
const VALID_FINGERPRINT_B = Array.from({ length: 32 }, () => "bb").join(":");
const VALID_IOS_APP_ID = "ABC123DE45.com.cctechsupport.drts.driver";

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * GitHub Actions compiles any YAML scalar containing `${{ ... }}` into a single
 * `format('...', arg0, arg1, ...)` expression where literal `{` -> `{{`,
 * `}` -> `}}`, and `'` -> `''`. GitHub rejects the workflow file if any
 * compiled expression exceeds 21,000 characters.
 */
function compiledGitHubExpressionLength(scalar: string): number {
  const regex = /\$\{\{\s*([\s\S]*?)\s*\}\}/g;
  const matches = [...scalar.matchAll(regex)];
  if (matches.length === 0) {
    return 0;
  }
  const parts: string[] = [];
  const args: string[] = [];
  let lastIndex = 0;
  for (const [idx, match] of matches.entries()) {
    const start = match.index ?? 0;
    const literal = scalar
      .slice(lastIndex, start)
      .replaceAll("{", "{{")
      .replaceAll("}", "}}")
      .replaceAll("'", "''");
    parts.push(literal, `{${idx}}`);
    args.push(match[1]!.trim());
    lastIndex = start + match[0].length;
  }
  const tail = scalar
    .slice(lastIndex)
    .replaceAll("{", "{{")
    .replaceAll("}", "}}")
    .replaceAll("'", "''");
  parts.push(tail);
  const compiled = `format('${parts.join("")}', ${args.join(", ")})`;
  return compiled.length;
}

function extractStepBlock(source: string, stepName: string): string {
  const marker = `      - name: ${stepName}\n`;
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`Missing workflow step: ${stepName}`);
  }
  const end = source.indexOf("\n      - name:", start + marker.length);
  return source.slice(start, end < 0 ? undefined : end);
}

function extractRunScalar(stepBlock: string): string {
  const marker = "        run: |\n";
  const index = stepBlock.indexOf(marker);
  if (index < 0) {
    throw new Error("Missing run scalar in step block");
  }
  return stepBlock
    .slice(index + marker.length)
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
}

function parseKeyValueOutput(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const REQUIRED_BASE_SECRETS = [
  "drts-dev-controlled-download-signing-secret",
  "drts-dev-workload-identity-google-service-principals",
  "drts-dev-referral-embed-partner-ingress-key",
] as const;

const SMTP_SECRETS = [
  "drts-dev-smtp-host",
  "drts-dev-smtp-port",
  "drts-dev-smtp-username",
  "drts-dev-smtp-password",
  "drts-dev-smtp-from-email",
  "drts-dev-smtp-recipient-allowlist",
] as const;

const DRIVER_ONBOARDING_SECRETS = [
  "drts-dev-driver-onboarding-code-pepper",
  "drts-dev-driver-onboarding-delivery-key",
  "drts-dev-twilio-account-sid",
  "drts-dev-twilio-api-key-sid",
  "drts-dev-twilio-api-key-secret",
  "drts-dev-twilio-from-number",
] as const;

function runResolveApiSecretMountsStep(options: {
  availableSecrets?: readonly string[];
  env?: Record<string, string | undefined>;
}) {
  const dir = mkdtempSync(path.join(tmpdir(), "drts-driver-onb-secrets-"));
  temporaryDirectories.push(dir);

  const binDir = path.join(dir, "bin");
  spawnSync("mkdir", ["-p", binDir]);
  const gcloudPath = path.join(binDir, "gcloud");
  const callsLog = path.join(dir, "gcloud-calls.log");
  const outputPath = path.join(dir, "github-output");
  writeFileSync(callsLog, "");
  writeFileSync(outputPath, "");

  writeFileSync(
    gcloudPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$GCLOUD_CALLS_LOG"
if [[ "$1" == "secrets" && "$2" == "describe" ]]; then
  secret_name="$3"
  if [[ ",$AVAILABLE_SECRETS," == *",$secret_name,"* ]]; then
    exit 0
  fi
  echo "ERROR: (gcloud.secrets.describe) NOT_FOUND: Secret [$secret_name] not found." >&2
  exit 1
fi
echo "UNEXPECTED_GCLOUD_INVOCATION: $*" >&2
exit 99
`,
  );
  chmodSync(gcloudPath, 0o755);

  const stepRun = extractRunScalar(
    extractStepBlock(workflow, "Resolve API secret mounts"),
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    GCLOUD_CALLS_LOG: callsLog,
    GITHUB_OUTPUT: outputPath,
    SECRET_PREFIX: "drts-dev",
    PROJECT_ID: "drts-dev-devcc-20260825",
    ARTIFACT_PROVIDER_SECRET_SUFFIX:
      ",REMITTANCE_PROOF_S3_ACCESS_KEY_ID=drts-dev-remittance-proof-s3-access-key-id:latest",
    AVAILABLE_SECRETS: (options.availableSecrets ?? REQUIRED_BASE_SECRETS).join(
      ",",
    ),
  };
  delete env.DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED;
  delete env.DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED;
  delete env.DEV_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS;
  delete env.DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS;
  delete env.DEV_DRIVER_ONBOARDING_IOS_APP_ID;
  delete env.DRIVER_ONBOARDING_IOS_APP_ID;
  delete env.DEV_OIDC_CLIENT_ID;

  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  const result = spawnSync("bash", ["-euo", "pipefail", "-c", stepRun], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    timeout: 10000,
  });

  const outputs = parseKeyValueOutput(readFileSync(outputPath, "utf8"));
  const gcloudCalls = readFileSync(callsLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);

  return {
    result,
    outputs,
    gcloudCalls,
  };
}

describe("RELEASE-DEV-WORKFLOW-EXPRESSION-20261123: deploy-dev.yml expression length & DRV-ONB-006 secret mount contract", () => {
  it("reproduces the f7221d8c0 21,000-char expression overflow when driver onboarding secret resolution is inlined with ${{ }} expressions, and verifies the fixed workflow stays well below the limit", () => {
    const currentStepBlock = extractStepBlock(
      workflow,
      "Resolve API secret mounts",
    );
    const currentRunScalar = extractRunScalar(currentStepBlock);

    // Reconstruct the pre-fix f7221d8c0 inline run scalar by substituting the
    // helper body and inline ${{ needs.prepare.outputs.* }} expressions back in.
    const inlinedHelperBody = helperSource
      .slice(helperSource.indexOf("driver_onboarding_raw="))
      .replace(
        'driver_onboarding_mounts="DRIVER_ONBOARDING_CODE_PEPPER=${driver_onboarding_code_pepper_secret}:latest,DRIVER_ONBOARDING_DELIVERY_KEY=${driver_onboarding_delivery_key_secret}:latest${driver_onboarding_twilio_mounts}"\nfi\n\nif [[ -n "${GITHUB_OUTPUT:-}" ]]; then\n  echo "driver_onboarding_notifications_enabled=${driver_onboarding_notifications_enabled}" >> "$GITHUB_OUTPUT"\nfi\n\nprintf \'%s\\n\' "$driver_onboarding_mounts"\n',
        '  secret_args="${secret_args},DRIVER_ONBOARDING_CODE_PEPPER=${driver_onboarding_code_pepper_secret}:latest,DRIVER_ONBOARDING_DELIVERY_KEY=${driver_onboarding_delivery_key_secret}:latest${driver_onboarding_twilio_mounts}"\nfi\necho "driver_onboarding_notifications_enabled=${driver_onboarding_notifications_enabled}" >> "$GITHUB_OUTPUT"',
      )
      .replaceAll(" >&2", "");

    const brokenF7221d8c0RunScalar = currentRunScalar
      .replace(
        'secret_prefix="${SECRET_PREFIX}"\nproject_id="${PROJECT_ID}"',
        'secret_prefix="${{ needs.prepare.outputs.secret_prefix }}"\nproject_id="${{ needs.prepare.outputs.project_id }}"',
      )
      .replace(
        'driver_onboarding_mounts="$(operations/deployment/resolve-driver-onboarding-secret-mounts.sh "$secret_prefix" "$project_id" "$smtp_secret_count")"\nif [[ -n "$driver_onboarding_mounts" ]]; then\n  secret_args="${secret_args},${driver_onboarding_mounts}"\nfi',
        inlinedHelperBody,
      );

    // Verify Against Immutable git baseline f7221d8c0 when present in git history,
    // plus the deterministic reconstruction for shallow clones.
    const gitBaseline = spawnSync(
      "git",
      [
        "show",
        "f7221d8c0c0a61723b77a3fe07a16ad390bc70b5:.github/workflows/deploy-dev.yml",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    if (gitBaseline.status === 0 && gitBaseline.stdout) {
      const f7221d8c0RunScalar = extractRunScalar(
        extractStepBlock(gitBaseline.stdout, "Resolve API secret mounts"),
      );
      expect(compiledGitHubExpressionLength(f7221d8c0RunScalar)).toBe(21133);
      expect(
        compiledGitHubExpressionLength(f7221d8c0RunScalar),
      ).toBeGreaterThan(GITHUB_ACTIONS_MAX_EXPRESSION_LENGTH);
    }

    // Old baseline (f7221d8c0) fails GitHub Actions' 21,000-character expression limit:
    expect(
      compiledGitHubExpressionLength(brokenF7221d8c0RunScalar),
    ).toBeGreaterThan(GITHUB_ACTIONS_MAX_EXPRESSION_LENGTH);

    // Fixed Resolve API secret mounts step has 0 inline ${{ }} expressions in run:
    // and its raw length is ~15.7k (over 5,000 chars below 21,000 even if formatted):
    expect(compiledGitHubExpressionLength(currentRunScalar)).toBe(0);
    expect(currentRunScalar.length).toBeLessThan(17000);
    expect(currentStepBlock).toContain(
      "SECRET_PREFIX: ${{ needs.prepare.outputs.secret_prefix }}",
    );
    expect(currentStepBlock).toContain(
      "PROJECT_ID: ${{ needs.prepare.outputs.project_id }}",
    );

    // Verify every `run:` block across the entire deploy-dev.yml workflow is well
    // below GitHub Actions' 21,000-character compiled expression limit.
    const allRunBlocks = [
      ...workflow.matchAll(/ {8}run: \|\n((?: {10}.*\n|\n)+)/g),
    ];
    expect(allRunBlocks.length).toBeGreaterThan(30);
    for (const match of allRunBlocks) {
      const scalar = match[1]!
        .split("\n")
        .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
        .join("\n");
      expect(compiledGitHubExpressionLength(scalar)).toBeLessThan(
        GITHUB_ACTIONS_MAX_EXPRESSION_LENGTH,
      );
    }
  });

  it("parses deploy-dev.yml as valid YAML and passes bash -n syntax checks on the helper and Resolve API secret mounts step", () => {
    const yamlCheck = spawnSync(
      "python3",
      [
        "-c",
        `
import sys, yaml
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    doc = yaml.safe_load(fh)
assert isinstance(doc, dict) and "jobs" in doc and "deploy" in doc["jobs"]
steps = doc["jobs"]["deploy"]["steps"]
assert any(s.get("id") == "api_secrets" for s in steps)
`,
        workflowPath,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(yamlCheck.status, yamlCheck.stderr).toBe(0);

    const helperSyntax = spawnSync("bash", ["-n", helperPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(helperSyntax.status, helperSyntax.stderr).toBe(0);

    const stepRun = extractRunScalar(
      extractStepBlock(workflow, "Resolve API secret mounts"),
    );
    const stepSyntax = spawnSync("bash", ["-n", "-c", stepRun], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(stepSyntax.status, stepSyntax.stderr).toBe(0);
  });

  it("keeps DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED disabled by default and preserves all existing API/web secret mounts and outputs", () => {
    const { result, outputs, gcloudCalls } = runResolveApiSecretMountsStep({
      availableSecrets: [
        ...REQUIRED_BASE_SECRETS,
        "drts-dev-password-pepper",
        "drts-dev-totp-encryption-key",
        ...SMTP_SECRETS,
      ],
    });

    expect(result.status, result.stderr).toBe(0);
    expect(outputs.driver_onboarding_notifications_enabled).toBe("false");
    expect(outputs.password_login_enabled).toBe("true");
    expect(outputs.notification_outbox_type).toBe("postgres");
    expect(outputs.api).toContain("DATABASE_URL=drts-dev-db-url:latest");
    expect(outputs.api).toContain(
      "CONTROLLED_DOWNLOAD_SIGNING_SECRET=drts-dev-controlled-download-signing-secret:latest",
    );
    expect(outputs.api).toContain(
      "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS=drts-dev-workload-identity-google-service-principals:latest",
    );
    expect(outputs.api).toContain(
      "PASSWORD_PEPPER_SECRETS_JSON=drts-dev-password-pepper:latest,TOTP_ENCRYPTION_KEYS_JSON=drts-dev-totp-encryption-key:latest",
    );
    expect(outputs.api).toContain(
      "NOTIFICATION_FROM_EMAIL=drts-dev-smtp-from-email:latest",
    );
    expect(outputs.api).toContain(
      "REMITTANCE_PROOF_S3_ACCESS_KEY_ID=drts-dev-remittance-proof-s3-access-key-id:latest",
    );
    expect(outputs.api).not.toContain("DRIVER_ONBOARDING_CODE_PEPPER=");
    expect(outputs.api).not.toContain("DRIVER_ONBOARDING_DELIVERY_KEY=");
    expect(outputs.web).toBe(
      "JWT_SECRET=drts-dev-jwt-secret:latest,DRTS_INTERNAL_KEY=drts-dev-jwt-secret:latest",
    );
    expect(
      gcloudCalls.some((call) => call.includes("driver-onboarding-")),
    ).toBe(false);
    expect(
      gcloudCalls.some((call) => call.includes("secrets versions access")),
    ).toBe(false);
  });

  it("ignores invalid association variables when DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED is explicitly false", () => {
    const { result, outputs } = runResolveApiSecretMountsStep({
      env: {
        DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED: "false",
        DEV_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS: "not-a-fingerprint",
        DEV_DRIVER_ONBOARDING_IOS_APP_ID: "invalid-app-id",
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(outputs.driver_onboarding_notifications_enabled).toBe("false");
    expect(outputs.api).not.toContain("DRIVER_ONBOARDING_");
  });

  it.each([
    {
      name: "invalid boolean flag",
      env: {
        DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED: "yes",
      },
      secrets: [...REQUIRED_BASE_SECRETS, ...SMTP_SECRETS],
      expectedError:
        "Invalid DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED value: yes. Use true/false.",
    },
    {
      name: "missing Android and iOS association variables",
      env: {
        DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED: "true",
      },
      secrets: [...REQUIRED_BASE_SECRETS, ...SMTP_SECRETS],
      expectedError:
        "Enabling DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED requires DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS and DRIVER_ONBOARDING_IOS_APP_ID.",
    },
    {
      name: "invalid iOS App ID format",
      env: {
        DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED: "true",
        DEV_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS: VALID_FINGERPRINT_A,
        DEV_DRIVER_ONBOARDING_IOS_APP_ID: "bad.com.cctechsupport.drts.driver",
      },
      secrets: [...REQUIRED_BASE_SECRETS, ...SMTP_SECRETS],
      expectedError:
        "DRIVER_ONBOARDING_IOS_APP_ID must match <TEAMID>.com.cctechsupport.drts.driver.",
    },
    {
      name: "invalid Android SHA-256 certificate fingerprint format",
      env: {
        DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED: "true",
        DEV_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS: "AA:BB:CC",
        DEV_DRIVER_ONBOARDING_IOS_APP_ID: VALID_IOS_APP_ID,
      },
      secrets: [...REQUIRED_BASE_SECRETS, ...SMTP_SECRETS],
      expectedError:
        "DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS must be comma-separated SHA-256 certificate fingerprints (AA:BB:...:FF).",
    },
    {
      name: "absent Remote SMTP secret group",
      env: {
        DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED: "true",
        DEV_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS: VALID_FINGERPRINT_A,
        DEV_DRIVER_ONBOARDING_IOS_APP_ID: VALID_IOS_APP_ID,
      },
      secrets: [...REQUIRED_BASE_SECRETS, ...DRIVER_ONBOARDING_SECRETS],
      expectedError:
        "Enabling DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED requires complete Remote SMTP secrets (REMOTE_SMTP_* and NOTIFICATION_FROM_EMAIL).",
    },
  ])("fails closed on $name", ({ env, secrets, expectedError }) => {
    const { result } = runResolveApiSecretMountsStep({
      availableSecrets: secrets,
      env,
    });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(expectedError);
  });

  it.each(DRIVER_ONBOARDING_SECRETS)(
    "fails closed when required Secret Manager secret %s is absent",
    (missingSecret) => {
      const secrets = [
        ...REQUIRED_BASE_SECRETS,
        ...SMTP_SECRETS,
        ...DRIVER_ONBOARDING_SECRETS.filter((s) => s !== missingSecret),
      ];
      const { result } = runResolveApiSecretMountsStep({
        availableSecrets: secrets,
        env: {
          DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED: "true",
          DEV_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS: VALID_FINGERPRINT_A,
          DEV_DRIVER_ONBOARDING_IOS_APP_ID: VALID_IOS_APP_ID,
        },
      });
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toContain(missingSecret);
    },
  );

  it("mounts DRIVER_ONBOARDING_CODE_PEPPER, DRIVER_ONBOARDING_DELIVERY_KEY, and complete TWILIO_* secrets when enabled and deduplicates shared TWILIO_* mounts in Deploy — api", () => {
    const { result, outputs, gcloudCalls } = runResolveApiSecretMountsStep({
      availableSecrets: [
        ...REQUIRED_BASE_SECRETS,
        ...SMTP_SECRETS,
        ...DRIVER_ONBOARDING_SECRETS,
      ],
      env: {
        DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED: "true",
        DEV_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS: ` ${VALID_FINGERPRINT_A} , ${VALID_FINGERPRINT_B} `,
        DEV_DRIVER_ONBOARDING_IOS_APP_ID: ` ${VALID_IOS_APP_ID} `,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(outputs.driver_onboarding_notifications_enabled).toBe("true");
    expect(outputs.api).toContain(
      "DRIVER_ONBOARDING_CODE_PEPPER=drts-dev-driver-onboarding-code-pepper:latest",
    );
    expect(outputs.api).toContain(
      "DRIVER_ONBOARDING_DELIVERY_KEY=drts-dev-driver-onboarding-delivery-key:latest",
    );
    for (const twilioVar of [
      "TWILIO_ACCOUNT_SID=drts-dev-twilio-account-sid:latest",
      "TWILIO_API_KEY_SID=drts-dev-twilio-api-key-sid:latest",
      "TWILIO_API_KEY_SECRET=drts-dev-twilio-api-key-secret:latest",
      "TWILIO_FROM_NUMBER=drts-dev-twilio-from-number:latest",
    ]) {
      expect(outputs.api).toContain(twilioVar);
    }
    expect(
      gcloudCalls.every((call) => call.startsWith("secrets describe ")),
    ).toBe(true);

    // Verify Deploy — api deduplicates TWILIO_* mounts when passenger_secrets also resolves Twilio SMS.
    const passengerTwilio =
      "TWILIO_ACCOUNT_SID=drts-dev-twilio-account-sid:latest,TWILIO_API_KEY_SID=drts-dev-twilio-api-key-sid:latest,TWILIO_API_KEY_SECRET=drts-dev-twilio-api-key-secret:latest,TWILIO_FROM_NUMBER=drts-dev-twilio-from-number:latest,PASSENGER_OTP_PEPPER=drts-dev-passenger-otp-pepper:latest";
    const dedupeProbe = spawnSync(
      "bash",
      [
        "-euo",
        "pipefail",
        "-c",
        `
        api_secrets="$1"
        passenger_secrets="$2"
        if [[ -n "$passenger_secrets" ]]; then
          api_secrets="\${api_secrets},\${passenger_secrets}"
          api_secrets="$(printf '%s' "$api_secrets" | tr ',' '\\n' | awk 'NF && !seen[$0]++' | paste -sd, -)"
        fi
        printf '%s' "$api_secrets"
        `,
        "_",
        outputs.api!,
        passengerTwilio,
      ],
      { encoding: "utf8" },
    );
    expect(dedupeProbe.status).toBe(0);
    const mergedSecrets = dedupeProbe.stdout.split(",");
    expect(
      mergedSecrets.filter((entry) => entry.startsWith("TWILIO_ACCOUNT_SID=")),
    ).toHaveLength(1);
    expect(
      mergedSecrets.filter((entry) =>
        entry.startsWith("PASSENGER_OTP_PEPPER="),
      ),
    ).toHaveLength(1);
  });
});
