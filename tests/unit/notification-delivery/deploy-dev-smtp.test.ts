import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Execute the actual workflow shell block, substituting only Secret Manager.
// No deployment or cloud access takes place in these unit tests.
const workflow = readFileSync(
  resolve(".github/workflows/deploy-dev.yml"),
  "utf8",
);
const block = workflow.slice(
  workflow.indexOf("          # Remote SMTP is opt-in"),
  workflow.indexOf("          # SR-LIVE-PUSH-001"),
);
const outboxBlock = workflow
  .slice(
    workflow.indexOf("          # Enable the durable SMTP outbox"),
    workflow.indexOf("          # End SMTP outbox selection"),
  )
  .replaceAll(
    "${{ steps.api_secrets.outputs.notification_outbox_type }}",
    "${notification_outbox_type}",
  );
const apiEnvBlock = workflow
  .slice(
    workflow.indexOf("      - name: Build API env vars\n"),
    workflow.indexOf("      - name: Deploy — api\n"),
  )
  .split("        run: |\n")[1]!
  .split("\n")
  .map((line) => line.replace(/^ {10}/, ""))
  .join("\n");
const settings = [
  "HOST",
  "PORT",
  "USERNAME",
  "PASSWORD",
  "FROM_EMAIL",
  "RECIPIENT_ALLOWLIST",
];

function parseBatchWithGcloudArgDict(
  rawArgValues: Record<string, string>,
): Record<
  string,
  { ok: true; parsed: Record<string, string> } | { ok: false; error: string }
> {
  const probe = spawnSync(
    "python3",
    [
      "-B",
      "-c",
      `
import json, os, re, sys

for sdk_root in (
    "/snap/google-cloud-cli/current",
    "/opt/google-cloud-sdk",
    "/usr/lib/google-cloud-sdk",
    "/usr/local/share/google-cloud-sdk",
):
    lib = os.path.join(sdk_root, "lib")
    tp = os.path.join(lib, "third_party")
    if os.path.isdir(lib):
        sys.path[:0] = [lib, tp]
        break

inputs = json.loads(sys.argv[1])
results = {}
try:
    from googlecloudsdk.calliope import arg_parsers
    from googlecloudsdk.command_lib.functions.v2.deploy import env_vars_util
    parser = arg_parsers.ArgDict(
        key_type=env_vars_util.EnvVarKeyType,
        value_type=env_vars_util.EnvVarValueType,
    )
    for name, raw in inputs.items():
        try:
            results[name] = {"ok": True, "parsed": dict(parser(raw))}
        except Exception as exc:
            results[name] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
except ImportError:
    for name, raw in inputs.items():
        delim = ","
        arg_value = raw
        if arg_value.startswith("^") and "^" in arg_value[1:]:
            delim, arg_value = arg_value[1:].split("^", 1)
            if not delim:
                results[name] = {"ok": False, "error": "Invalid delimeter."}
                continue
        if not arg_value:
            tokens = []
        else:
            s = arg_value if arg_value.endswith(delim) else arg_value + delim
            tokens = s.split(delim)[:-1]
        parsed = {}
        failed = False
        for token in tokens:
            if "=" not in token:
                err = "Invalid flag value []" if token == "" else f"Bad syntax for dict arg: [{token}]"
                results[name] = {"ok": False, "error": err}
                failed = True
                break
            k, v = token.split("=", 1)
            if not k or not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", k):
                results[name] = {"ok": False, "error": f"Bad syntax for dict arg: [{token}]"}
                failed = True
                break
            parsed[k] = v
        if not failed:
            results[name] = {"ok": True, "parsed": parsed}
print(json.dumps(results))
`,
      JSON.stringify(rawArgValues),
    ],
    { encoding: "utf8" },
  );
  expect(probe.status, probe.stderr).toBe(0);
  return JSON.parse(probe.stdout.trim()) as Record<
    string,
    { ok: true; parsed: Record<string, string> } | { ok: false; error: string }
  >;
}

describe("deploy-dev SMTP secret mounts", () => {
  it("mounts all six references together, preserves zero-secret behavior, and rejects every partial subset", () => {
    expect(block).toContain("smtp_secret_count");
    expect(outboxBlock).toContain("NOTIFICATION_OUTBOX_TYPE");
    const directory = mkdtempSync(join(tmpdir(), "smtp-workflow-"));
    try {
      for (let subset = 0; subset < 64; subset++) {
        const present = settings.filter((_, index) => subset & (1 << index));
        const result = spawnSync(
          "bash",
          [
            "-c",
            `
        set -euo pipefail
        project_id=unit-test-project
        secret_args=EXISTING=existing:latest
        gcloud() {
          [[ "$1 $2" == "secrets describe" ]] || { echo 'UNEXPECTED_SECRET_ACCESS'; return 99; }
          [[ " $PRESENT " == *" $3 "* ]]
        }
        ${block}
        echo "$secret_args"
        notification_outbox_type="$(sed -n 's/^notification_outbox_type=//p' "$GITHUB_OUTPUT")"
        env_vars=EXISTING_ENV=existing
        ${outboxBlock}
        echo "$env_vars"
      `,
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              GITHUB_OUTPUT: join(directory, `outputs-${subset}`),
              PRESENT: present
                .map(
                  (setting) =>
                    `drts-dev-smtp-${setting.toLowerCase().replaceAll("_", "-")}`,
                )
                .join(" "),
            },
          },
        );
        expect(result.stdout + result.stderr).not.toContain(
          "UNEXPECTED_SECRET_ACCESS",
        );
        if (subset === 0) {
          expect(result.status).toBe(0);
          expect(result.stdout.trim()).toBe(
            "EXISTING=existing:latest\nEXISTING_ENV=existing",
          );
        } else if (subset === 63) {
          expect(result.status).toBe(0);
          for (const setting of settings)
            expect(result.stdout).toContain(
              `REMOTE_SMTP_${setting}=drts-dev-smtp-${setting.toLowerCase().replaceAll("_", "-")}:latest`,
            );
          expect(result.stdout).toContain(
            "NOTIFICATION_FROM_EMAIL=drts-dev-smtp-from-email:latest",
          );
          expect(result.stdout).toContain(
            "EXISTING_ENV=existing@NOTIFICATION_OUTBOX_TYPE=postgres",
          );
          expect(result.stdout).not.toContain(
            "REGULATORY_ALERT_RECIPIENT_EMAIL=",
          );
          const recipientCheck = spawnSync(
            "bash",
            [
              "-c",
              `
        set -euo pipefail
        project_id=unit-test-project
        gcloud() {
          [[ "$1 $2" == "secrets describe" ]] || { echo 'UNEXPECTED_SECRET_ACCESS'; return 99; }
          [[ " $PRESENT " == *" $3 "* ]]
        }
        secret_args=EXISTING=existing:latest
        DEV_REGULATORY_ALERT_RECIPIENT_EMAIL=reg-alerts@example.test
        ${block}
        notification_outbox_type="$(sed -n 's/^notification_outbox_type=//p' "$GITHUB_OUTPUT")"
        REGULATORY_ALERT_RECIPIENT_SECRET_MOUNTED="$(sed -n 's/^regulatory_alert_recipient_secret_mounted=//p' "$GITHUB_OUTPUT")"
        env_vars=EXISTING_ENV=existing
        ${outboxBlock}
        echo "ENV_CASE_SECRETS=$secret_args"
        echo "ENV_CASE_VARS=$env_vars"

        : > "$GITHUB_OUTPUT"
        PRESENT="$PRESENT drts-dev-regulatory-alert-recipient-email"
        secret_args=EXISTING=existing:latest
        ${block}
        notification_outbox_type="$(sed -n 's/^notification_outbox_type=//p' "$GITHUB_OUTPUT")"
        REGULATORY_ALERT_RECIPIENT_SECRET_MOUNTED="$(sed -n 's/^regulatory_alert_recipient_secret_mounted=//p' "$GITHUB_OUTPUT")"
        env_vars=EXISTING_ENV=existing
        ${outboxBlock}
        echo "SECRET_CASE_SECRETS=$secret_args"
        echo "SECRET_CASE_VARS=$env_vars"
      `,
            ],
            {
              encoding: "utf8",
              env: {
                ...process.env,
                GITHUB_OUTPUT: join(directory, "outputs-63-recipient"),
                PRESENT: present
                  .map(
                    (setting) =>
                      `drts-dev-smtp-${setting.toLowerCase().replaceAll("_", "-")}`,
                  )
                  .join(" "),
              },
            },
          );
          expect(recipientCheck.status).toBe(0);
          expect(recipientCheck.stdout).not.toContain(
            "ENV_CASE_SECRETS=EXISTING=existing:latest,REMOTE_SMTP_HOST=drts-dev-smtp-host:latest,REMOTE_SMTP_PORT=drts-dev-smtp-port:latest,REMOTE_SMTP_USERNAME=drts-dev-smtp-username:latest,REMOTE_SMTP_PASSWORD=drts-dev-smtp-password:latest,REMOTE_SMTP_FROM_EMAIL=drts-dev-smtp-from-email:latest,REMOTE_SMTP_RECIPIENT_ALLOWLIST=drts-dev-smtp-recipient-allowlist:latest,NOTIFICATION_FROM_EMAIL=drts-dev-smtp-from-email:latest,REGULATORY_ALERT_RECIPIENT_EMAIL=",
          );
          expect(recipientCheck.stdout).toContain(
            "ENV_CASE_VARS=^;^EXISTING_ENV=existing;NOTIFICATION_OUTBOX_TYPE=postgres;REGULATORY_ALERT_RECIPIENT_EMAIL=reg-alerts@example.test",
          );
          expect(recipientCheck.stdout).toContain(
            "REGULATORY_ALERT_RECIPIENT_EMAIL=drts-dev-regulatory-alert-recipient-email:latest",
          );
          expect(recipientCheck.stdout).toContain(
            "SECRET_CASE_VARS=EXISTING_ENV=existing@NOTIFICATION_OUTBOX_TYPE=postgres\n",
          );

          const envCaseRaw = recipientCheck.stdout
            .split("\n")
            .find((line) => line.startsWith("ENV_CASE_VARS="))!
            .slice("ENV_CASE_VARS=".length);
          const secretCaseRaw = recipientCheck.stdout
            .split("\n")
            .find((line) => line.startsWith("SECRET_CASE_VARS="))!
            .slice("SECRET_CASE_VARS=".length);

          // Full "Build API env vars" step with DEV_REGULATORY_ALERT_RECIPIENT_EMAIL,
          // review-demo JSON values, CSV origins, INVOICE_MAIL_PORTAL_ORIGIN, and
          // ARTIFACT_PROVIDER_ENV_SUFFIX
          const renderedApiEnvScript = apiEnvBlock.replace(
            /\$\{\{\s*(.*?)\s*\}\}/g,
            (_, expr: string) => {
              const map: Record<string, string> = {
                "needs.prepare.outputs.tenant_console_service":
                  "drts-dev-tenant",
                "needs.prepare.outputs.enterprise_dispatch_service":
                  "drts-dev-dispatch",
                "needs.prepare.outputs.passenger_app_service":
                  "drts-dev-passenger",
                "needs.prepare.outputs.region": "us-central1",
                "needs.prepare.outputs.project_id": "unit-test-project",
                "needs.prepare.outputs.tenant_console_origin":
                  "https://tenant.example.test",
                "needs.prepare.outputs.enterprise_dispatch_origin":
                  "https://dispatch.example.test",
                "needs.prepare.outputs.ops_console_origin":
                  "https://ops.example.test",
                "needs.build-push.outputs.candidate_sha":
                  "607da93a133e02642ecc9634469adc312c3d921f",
                "steps.api_secrets.outputs.jwt_issuer":
                  "https://auth.local.drts.internal",
                "steps.api_secrets.outputs.jwt_audience":
                  "https://api.local.drts.internal",
                "steps.api_secrets.outputs.llm_provider": "mock",
                "steps.api_secrets.outputs.llm_chat_model": "mock-chat-v1",
                "steps.api_secrets.outputs.llm_summarizer_model":
                  "mock-summary-v1",
                "steps.api_secrets.outputs.map_provider_mode": "mock",
                "steps.api_secrets.outputs.map_provider_mode == 'external' && 'google' || 'mock'":
                  "mock",
                "steps.api_secrets.outputs.oidc_enabled": "false",
                "steps.api_secrets.outputs.notification_outbox_type":
                  "postgres",
                "steps.api_secrets.outputs.llm_base_url": "",
                "steps.api_secrets.outputs.openclaw_auth_provider": "",
                "steps.api_secrets.outputs.openclaw_home": "",
                "steps.passenger_secrets.outputs.otp_mounts_complete": "false",
                "steps.passenger_secrets.outputs.payment_mounts_complete":
                  "false",
                "steps.passenger_secrets.outputs.api": "",
              };
              if (!(expr in map)) {
                throw new Error(`Unmapped expression: ${expr}`);
              }
              return map[expr]!;
            },
          );
          const runFullApiEnvStep = (
            name: string,
            envOverrides: Record<string, string>,
            scriptOverride = renderedApiEnvScript,
          ): string => {
            const outPath = join(directory, `outputs-${name}`);
            const run = spawnSync(
              "bash",
              [
                "-c",
                `
                set -euo pipefail
                gcloud() { echo "\${MOCK_CLOUD_RUN_ORIGIN-https://cloudrun.example.test}"; }
                ${scriptOverride}
              `,
              ],
              {
                encoding: "utf8",
                env: {
                  ...process.env,
                  GITHUB_OUTPUT: outPath,
                  DEV_WORKLOAD_IDENTITY_ISSUER: "https://wif.example.test",
                  DEV_WORKLOAD_IDENTITY_AUDIENCE: "https://api.example.test",
                  DEV_PAX_REVIEW_DEMO_ENABLED: "true",
                  REGULATORY_ALERT_RECIPIENT_SECRET_MOUNTED: "false",
                  DEV_REGULATORY_ALERT_RECIPIENT_EMAIL:
                    "reg-alerts@example.test",
                  ARTIFACT_PROVIDER_ENV_SUFFIX:
                    "@REMITTANCE_PROOF_STORAGE_PROVIDER=unprovisioned@DOCUMENT_ARTIFACT_STORAGE_PROVIDER=unprovisioned",
                  ...envOverrides,
                },
              },
            );
            expect(run.status, run.stderr).toBe(0);
            return readFileSync(outPath, "utf8").trim().replace(/^vars=/, "");
          };

          const fullVarsPayload = runFullApiEnvStep("full-api-env", {});
          const globMailbox = "reg-alerts+*?[0]@example.test";
          const globVarsPayload = runFullApiEnvStep("full-api-env-glob", {
            DEV_REGULATORY_ALERT_RECIPIENT_EMAIL: globMailbox,
          });
          const emptySuffixVarsPayload = runFullApiEnvStep(
            "full-api-env-empty-suffix",
            {
              ARTIFACT_PROVIDER_ENV_SUFFIX: "",
            },
          );
          const renderedApiEnvNoTenantOrigin = renderedApiEnvScript.replaceAll(
            "https://tenant.example.test",
            "",
          );
          const emptyAllTrailingVarsPayload = runFullApiEnvStep(
            "full-api-env-empty-all-trailing",
            {
              ARTIFACT_PROVIDER_ENV_SUFFIX: "",
              MOCK_CLOUD_RUN_ORIGIN: "",
              DEV_PAX_REVIEW_DEMO_ENABLED: "false",
            },
            renderedApiEnvNoTenantOrigin,
          );

          const argDictBatch = parseBatchWithGcloudArgDict({
            brokenAtDelim:
              "^@^NODE_ENV=production@NOTIFICATION_OUTBOX_TYPE=postgres@REGULATORY_ALERT_RECIPIENT_EMAIL=reg-alerts@example.test",
            brokenDoubleAt:
              "^@^NODE_ENV=production@NOTIFICATION_OUTBOX_TYPE=postgres@REGULATORY_ALERT_RECIPIENT_EMAIL=reg-alerts@@example.test",
            envCase: envCaseRaw,
            secretCase: `^@^${secretCaseRaw}`,
            fullApiEnv: fullVarsPayload,
            globApiEnv: globVarsPayload,
            emptySuffixApiEnv: emptySuffixVarsPayload,
            emptyAllTrailingApiEnv: emptyAllTrailingVarsPayload,
          });
          expect(argDictBatch.brokenAtDelim?.ok).toBe(false);
          if (argDictBatch.brokenAtDelim && !argDictBatch.brokenAtDelim.ok) {
            expect(argDictBatch.brokenAtDelim.error).toContain(
              "Bad syntax for dict arg: [example.test]",
            );
          }
          expect(argDictBatch.brokenDoubleAt?.ok).toBe(false);
          if (argDictBatch.brokenDoubleAt && !argDictBatch.brokenDoubleAt.ok) {
            expect(argDictBatch.brokenDoubleAt.error).toContain(
              "Invalid flag value []",
            );
          }
          expect(argDictBatch.envCase).toEqual({
            ok: true,
            parsed: {
              EXISTING_ENV: "existing",
              NOTIFICATION_OUTBOX_TYPE: "postgres",
              REGULATORY_ALERT_RECIPIENT_EMAIL: "reg-alerts@example.test",
            },
          });
          expect(argDictBatch.secretCase).toEqual({
            ok: true,
            parsed: {
              EXISTING_ENV: "existing",
              NOTIFICATION_OUTBOX_TYPE: "postgres",
            },
          });
          const fullApiEnv = argDictBatch.fullApiEnv;
          expect(fullApiEnv?.ok).toBe(true);
          if (fullApiEnv?.ok) {
            const parsedFull = fullApiEnv.parsed;
            expect(parsedFull.REGULATORY_ALERT_RECIPIENT_EMAIL).toBe(
              "reg-alerts@example.test",
            );
            expect(parsedFull.NOTIFICATION_OUTBOX_TYPE).toBe("postgres");
            expect(parsedFull.INVOICE_MAIL_PORTAL_ORIGIN).toBe(
              "https://tenant.example.test",
            );
            expect(parsedFull.AGENCY_INVITATION_ACCEPT_URL_BASE).toBe(
              "https://cloudrun.example.test/invite",
            );
            expect(parsedFull.AUTH_ALLOWED_ORIGINS).toContain(
              "https://cloudrun.example.test",
            );
            expect(parsedFull.REMITTANCE_PROOF_STORAGE_PROVIDER).toBe(
              "unprovisioned",
            );
            expect(() =>
              JSON.parse(parsedFull.PSP_TOKEN_ENCRYPTION_KEY_NAME!),
            ).not.toThrow();
            expect(() =>
              JSON.parse(parsedFull.PAX_PAYMENT_CAPTURE_POLICY!),
            ).not.toThrow();
          }
          const globApiEnv = argDictBatch.globApiEnv;
          expect(globApiEnv?.ok).toBe(true);
          if (globApiEnv?.ok) {
            const parsedGlob = globApiEnv.parsed;
            expect(parsedGlob.REGULATORY_ALERT_RECIPIENT_EMAIL).toBe(
              globMailbox,
            );
            expect(parsedGlob.NOTIFICATION_OUTBOX_TYPE).toBe("postgres");
            expect(parsedGlob.INVOICE_MAIL_PORTAL_ORIGIN).toBe(
              "https://tenant.example.test",
            );
            expect(parsedGlob.REMITTANCE_PROOF_STORAGE_PROVIDER).toBe(
              "unprovisioned",
            );
            expect(parsedGlob.DOCUMENT_ARTIFACT_STORAGE_PROVIDER).toBe(
              "unprovisioned",
            );
          }
          const emptySuffixApiEnv = argDictBatch.emptySuffixApiEnv;
          expect(emptySuffixApiEnv?.ok).toBe(true);
          if (emptySuffixApiEnv?.ok) {
            const parsedEmptySuffix = emptySuffixApiEnv.parsed;
            expect(parsedEmptySuffix.REGULATORY_ALERT_RECIPIENT_EMAIL).toBe(
              "reg-alerts@example.test",
            );
            expect(parsedEmptySuffix.NOTIFICATION_OUTBOX_TYPE).toBe("postgres");
            expect(parsedEmptySuffix.INVOICE_MAIL_PORTAL_ORIGIN).toBe(
              "https://tenant.example.test",
            );
            expect(
              parsedEmptySuffix.REMITTANCE_PROOF_STORAGE_PROVIDER,
            ).toBeUndefined();
            expect(
              parsedEmptySuffix.DOCUMENT_ARTIFACT_STORAGE_PROVIDER,
            ).toBeUndefined();
          }
          const emptyAllTrailingApiEnv = argDictBatch.emptyAllTrailingApiEnv;
          expect(emptyAllTrailingApiEnv?.ok).toBe(true);
          if (emptyAllTrailingApiEnv?.ok) {
            const parsedEmptyAll = emptyAllTrailingApiEnv.parsed;
            expect(parsedEmptyAll.REGULATORY_ALERT_RECIPIENT_EMAIL).toBe(
              "reg-alerts@example.test",
            );
            expect(parsedEmptyAll.NOTIFICATION_OUTBOX_TYPE).toBe("postgres");
            expect(parsedEmptyAll.INVOICE_MAIL_PORTAL_ORIGIN).toBeUndefined();
            expect(
              parsedEmptyAll.REMITTANCE_PROOF_STORAGE_PROVIDER,
            ).toBeUndefined();
          }
        } else {
          expect(result.status).toBe(1);
          expect(result.stdout).toContain(
            "Remote SMTP configuration is partial",
          );
          expect(result.stdout).not.toContain("REMOTE_SMTP_");
          expect(result.stdout).not.toContain("NOTIFICATION_OUTBOX_TYPE");
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
