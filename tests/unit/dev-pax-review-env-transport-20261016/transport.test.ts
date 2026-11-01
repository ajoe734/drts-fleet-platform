import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { paymentRuntimeFromEnv } from "../../../apps/api/src/modules/passenger-app/payment/payment-runtime.config";
import { paymentCapturePolicyFromEnv } from "../../../apps/api/src/modules/passenger-app/payment/payment-capture.config";

const root = path.resolve(__dirname, "../../..");
const workflow = readFileSync(
  path.join(root, ".github/workflows/deploy-dev.yml"),
  "utf8",
);
// Frozen verbatim run scalar from 2aed20cee7c80fca77aeb326ab6c8b8377fee0dd.
const oldRun = readFileSync(path.join(__dirname, "old-deploy-api.sh"), "utf8");
const temporaryDirectories: string[] = [];

function step(name: string) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  if (start < 0) throw new Error(`Missing workflow step: ${name}`);
  const end = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, end < 0 ? undefined : end);
}
function runScalar(block: string) {
  const script = block.split("        run: |\n")[1];
  if (!script) throw new Error("Expected literal workflow run scalar");
  return script
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}
function render(script: string, outputs: Record<string, string>) {
  return script.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, key: string) => {
    const value = outputs[key];
    if (value === undefined)
      throw new Error(`Missing expression fixture: ${key}`);
    return value;
  });
}
function flag(args: string[], name: string) {
  expect(args.filter((arg) => arg === name)).toHaveLength(1);
  const value = args[args.indexOf(name) + 1];
  if (value === undefined) throw new Error(`Missing flag value: ${name}`);
  return value;
}
// Fixture decoder for the workflow's explicit ^@^ CLI format, not a substitute
// for gcloud validation. Keep '=' inside base64 values and ',' inside JSON/CSV.
function decodeEnv(value: string): NodeJS.ProcessEnv {
  expect(value.startsWith("^@^")).toBe(true);
  return Object.fromEntries(
    value
      .slice(3)
      .split("@")
      .map((entry) => {
        const separator = entry.indexOf("=");
        expect(separator).toBeGreaterThan(0);
        return [entry.slice(0, separator), entry.slice(separator + 1)];
      }),
  );
}

function transport(
  options: {
    old?: boolean;
    review?: boolean;
    group?: "absent" | "partial" | "complete";
    liveSecrets?: string[];
  } = {},
) {
  const directory = mkdtempSync(path.join(tmpdir(), "drts-api-env-transport-"));
  temporaryDirectories.push(directory);
  mkdirSync(path.join(directory, "bin"));
  mkdirSync(path.join(directory, "operations/deployment"), { recursive: true });
  mkdirSync(
    path.join(directory, "apps/api/src/modules/passenger-app/review-demo"),
    { recursive: true },
  );
  copyFileSync(
    path.join(
      root,
      "apps/api/src/modules/passenger-app/review-demo/simulation-profile.json",
    ),
    path.join(
      directory,
      "apps/api/src/modules/passenger-app/review-demo/simulation-profile.json",
    ),
  );
  // Execute the real deploy wrapper; only external gcloud is replaced. The stub
  // answers metadata/origin queries and captures final argv, with no sockets.
  // It keeps the live service's secret-backed names and, like gcloud, applies
  // literal env changes before secret changes.
  copyFileSync(
    path.join(root, "operations/deployment/deploy-cloud-run-service.sh"),
    path.join(directory, "operations/deployment/deploy-cloud-run-service.sh"),
  );
  chmodSync(
    path.join(directory, "operations/deployment/deploy-cloud-run-service.sh"),
    0o755,
  );
  const gcloud = path.join(directory, "bin/gcloud");
  writeFileSync(
    gcloud,
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'secrets' && args[1] === 'describe') {
  const present = process.env.TEST_GROUP === 'complete' ||
    (process.env.TEST_GROUP === 'partial' && args[2].endsWith('-psp-merchant-id'));
  process.exit(present ? 0 : 1);
}
const state = process.env.LIVE_SERVICE_STATE;
const value = (name) => args[args.indexOf(name) + 1];
const names = (list) => {
  let delimiter = ',';
  if (list.startsWith('^')) [delimiter, list] = list.slice(1).split(/\\^(.*)/s);
  return list.split(delimiter).map((entry) => entry.split('=')[0]);
};
if (args[0] === 'run' && args[1] === 'services' && args[2] === 'describe') {
  if (!args.includes('--format=json')) {
    console.log('https://' + args[3] + '.example.invalid');
  } else if (fs.existsSync(state)) {
    const env = JSON.parse(fs.readFileSync(state, 'utf8')).map((name) =>
      ({ name, valueFrom: { secretKeyRef: { name: 'synthetic', key: 'latest' } } }));
    console.log(JSON.stringify({ spec: { template: { spec: { containers: [{ env }] } } } }));
  } else { process.exit(1); }
} else if (args[0] === 'run' && args[1] === 'deploy') {
  fs.appendFileSync(process.env.DEPLOY_LOG, JSON.stringify(args) + '\\n');
  let secrets = fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, 'utf8')) : [];
  const clash = args.includes('--set-env-vars') &&
    names(value('--set-env-vars')).find((name) => secrets.includes(name));
  if (clash) {
    console.error('ERROR: (gcloud.run.deploy) Cannot update environment variable [' + clash + '] to string literal because it has already been set with a different type.');
    process.exit(1);
  }
  if (args.includes('--remove-secrets')) {
    const removed = value('--remove-secrets').split(',');
    secrets = secrets.filter((name) => !removed.includes(name));
  }
  if (args.includes('--set-secrets')) secrets = names(value('--set-secrets'));
  fs.writeFileSync(state, JSON.stringify(secrets));
  fs.writeFileSync(process.env.ARGV_CAPTURE, JSON.stringify(args));
} else { throw new Error('Unexpected external CLI call: ' + args.join(' ')); }
`,
  );
  chmodSync(gcloud, 0o755);
  const outputs: Record<string, string> = {
    "needs.prepare.outputs.secret_prefix": "synthetic-dev",
    "needs.prepare.outputs.project_id": "synthetic-project",
    "needs.prepare.outputs.registry": "example.invalid/synthetic",
    "needs.build-push.outputs.image_tag": "synthetic-image",
    "needs.build-push.outputs.candidate_sha":
      "1234567890abcdef1234567890abcdef12345678",
    "needs.prepare.outputs.api_service": "synthetic-api",
    "needs.prepare.outputs.region": "us-central1",
    "needs.prepare.outputs.cloudsql":
      "synthetic-project:us-central1:synthetic-db",
    "needs.prepare.outputs.runtime_service_account": "runtime@example.invalid",
    "needs.prepare.outputs.api_exposure_flag": "--allow-unauthenticated",
    "needs.prepare.outputs.tenant_console_service": "synthetic-tenant",
    "needs.prepare.outputs.enterprise_dispatch_service": "synthetic-dispatch",
    "needs.prepare.outputs.passenger_app_service": "synthetic-passenger",
    "needs.prepare.outputs.tenant_console_origin":
      "https://tenant.example.invalid",
    "needs.prepare.outputs.enterprise_dispatch_origin":
      "https://dispatch.example.invalid",
    "needs.prepare.outputs.ops_console_origin": "https://ops.example.invalid",
    "steps.api_secrets.outputs.api": "BASE=synthetic-reference:latest",
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
  };
  // Deliberately use a minimal environment; local secrets/config cannot affect
  // the original readers or be read by this public-fixture probe.
  const env: NodeJS.ProcessEnv = {
    PATH: `${path.join(directory, "bin")}:${process.env.PATH ?? ""}`,
    ARGV_CAPTURE: path.join(directory, "argv.json"),
    DEPLOY_LOG: path.join(directory, "deploys.jsonl"),
    LIVE_SERVICE_STATE: path.join(directory, "live-secrets.json"),
    TEST_GROUP: options.group ?? "absent",
    SECRET_PREFIX: "synthetic-dev",
    PROJECT_ID: "synthetic-project",
    DEV_PAX_REVIEW_DEMO_ENABLED: String(options.review ?? true),
    DEV_WORKLOAD_IDENTITY_ISSUER: "synthetic-issuer",
    DEV_WORKLOAD_IDENTITY_AUDIENCE: "synthetic-audience",
    ARTIFACT_PROVIDER_ENV_SUFFIX: "@ARTIFACT_PROVIDER=synthetic",
  };
  if (options.liveSecrets)
    writeFileSync(env.LIVE_SERVICE_STATE!, JSON.stringify(options.liveSecrets));
  function execute(script: string, outputName: string) {
    env.GITHUB_OUTPUT = path.join(directory, outputName);
    const result = spawnSync(
      "bash",
      [
        "--noprofile",
        "--norc",
        "-euo",
        "pipefail",
        "-c",
        render(script, outputs),
      ],
      { cwd: directory, env, encoding: "utf8", timeout: 10000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  }
  execute(
    runScalar(step("Resolve passenger app optional secret mounts")),
    "mounts",
  );
  for (const line of readFileSync(env.GITHUB_OUTPUT!, "utf8")
    .trim()
    .split("\n")) {
    const separator = line.indexOf("=");
    outputs[`steps.passenger_secrets.outputs.${line.slice(0, separator)}`] =
      line.slice(separator + 1);
  }
  execute(runScalar(step("Build API env vars")), "api-env");
  const payload = readFileSync(env.GITHUB_OUTPUT!, "utf8")
    .trim()
    .replace(/^vars=/, "");
  outputs["steps.api_env.outputs.vars"] = payload;
  const deploy = step("Deploy — api");
  if (!options.old) {
    // Use the actual step.env binding rather than silently injecting a fix.
    const binding = deploy.match(/^ {10}API_ENV_VARS: (.*)$/m)?.[1];
    expect(binding).toBeDefined();
    env.API_ENV_VARS = render(binding!, outputs);
  }
  execute(options.old ? oldRun : runScalar(deploy), "deploy-output");
  const args: string[] = JSON.parse(readFileSync(env.ARGV_CAPTURE!, "utf8"));
  const transported = flag(args, "--set-env-vars");
  const mounts = outputs["steps.passenger_secrets.outputs.api"];
  if (mounts === undefined) throw new Error("Missing passenger mount output");
  return {
    payload,
    transported,
    env: decodeEnv(transported),
    args,
    mounts,
    deploys: readFileSync(env.DEPLOY_LOG!, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]),
    liveSecrets: JSON.parse(
      readFileSync(env.LIVE_SERVICE_STATE!, "utf8"),
    ) as string[],
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("actual Deploy Dev Bash → argv → original payment readers", () => {
  it("reproduces the immutable old source failure for both JSON readers", () => {
    // Prevent silently changing the historical negative control.
    expect(createHash("sha256").update(oldRun).digest("hex")).toBe(
      "7c064392b10d730d9dbb523f44dc80d0f2c135ea0498eed1109a810db8dc574c",
    );
    const old = transport({ old: true });
    expect(() => JSON.parse(old.env.PSP_TOKEN_ENCRYPTION_KEY_NAME!)).toThrow();
    expect(() => JSON.parse(old.env.PAX_PAYMENT_CAPTURE_POLICY!)).toThrow();
    expect(() => paymentRuntimeFromEnv(old.env)).toThrow(
      "Payment token encryption configuration or envelope is invalid.",
    );
    const runtime = paymentRuntimeFromEnv(decodeEnv(old.payload));
    // Isolate capture-policy failure after the old keyring startup failure.
    expect(() => paymentCapturePolicyFromEnv(old.env, runtime)).toThrow(
      "payment_capture_configuration_invalid",
    );
  });

  it("preserves both JSON values byte-for-byte and exercises the original cipher/capture policy", () => {
    const fixed = transport();
    expect(fixed.transported).toBe(fixed.payload);
    const runtime = paymentRuntimeFromEnv(fixed.env);
    expect(runtime.provider.name).toBe("fake");
    expect(runtime.provider.available).toBe(true);
    const envelope = runtime.cipher!.encrypt(
      "synthetic-token",
      "synthetic-passenger",
      "synthetic-method",
    );
    expect(
      paymentRuntimeFromEnv(fixed.env).cipher!.decrypt(
        envelope,
        "synthetic-passenger",
        "synthetic-method",
      ),
    ).toBe("synthetic-token");
    expect(paymentCapturePolicyFromEnv(fixed.env, runtime)).toEqual({
      retryDelaysMs: [60000],
      retryDefinitiveDeclines: false,
      unknownReadbackDelaysMs: [1000, 3000],
    });
    expect(fixed.env.OAUTH_REDIRECT_ALLOWLIST).toContain(",https://");
    expect(fixed.env.ARTIFACT_PROVIDER).toBe("synthetic");
    expect(flag(fixed.args, "--set-secrets")).toBe(
      "BASE=synthetic-reference:latest",
    );
  });

  it.each(["absent", "partial", "complete"] as const)(
    "keeps the original %s OTP group behavior and the public payment profile",
    (group) => {
      const result = transport({ group });
      expect(result.transported).toBe(result.payload);
      const complete = group === "complete";
      expect(Boolean(result.env.PASSENGER_OTP_PEPPER)).toBe(!complete);
      expect(result.mounts.includes("PASSENGER_OTP_PEPPER=")).toBe(complete);
      // The rehearsal forces the fake provider, so payment references never
      // mount, even when every one exists.
      expect(result.mounts).not.toContain("PSP_");
      expect(result.env.PSP_TOKEN_ENCRYPTION_KEY_NAME).toBeTruthy();
      expect(flag(result.args, "--set-secrets")).toBe(
        `BASE=synthetic-reference:latest${result.mounts ? `,${result.mounts}` : ""}`,
      );
      expect(paymentRuntimeFromEnv(result.env).cipher).not.toBeNull();
      // Complete groups mount references; the CLI stub never reads secret values.
      // Real provider runtime availability remains the original external gate.
    },
  );

  it("still decrypts cards bound with the public profile when payment secrets exist", () => {
    // Shared dev, 2026-10-25: complete ECPay secrets mounted their key ring
    // under the fake provider and every existing rehearsal card failed capture.
    const bound = paymentRuntimeFromEnv(transport({ group: "absent" }).env);
    const envelope = bound.cipher!.encrypt(
      "synthetic-token",
      "synthetic-passenger",
      "synthetic-method",
    );
    const runtime = paymentRuntimeFromEnv(transport({ group: "complete" }).env);
    expect(runtime.provider.name).toBe("fake");
    expect(
      runtime.cipher!.decrypt(
        envelope,
        "synthetic-passenger",
        "synthetic-method",
      ),
    ).toBe("synthetic-token");
  });

  it("releases payment references a rehearsal deploy turns into literals", () => {
    // Shared dev, 2026-11-01: the live API still mounted payment references
    // and gcloud refused to set the public profile literals over them.
    const result = transport({
      group: "complete",
      liveSecrets: [
        "BASE",
        "PSP_MERCHANT_ID",
        "PSP_HASH_KEY",
        "PSP_HASH_IV",
        "PSP_SANDBOX",
        "PSP_TOKEN_ENCRYPTION_KEY_NAME",
      ],
    });
    expect(result.deploys).toHaveLength(2);
    const [release, deploy] = result.deploys;
    expect(flag(release!, "--remove-secrets")).toBe(
      "PSP_MERCHANT_ID,PSP_SANDBOX,PSP_TOKEN_ENCRYPTION_KEY_NAME",
    );
    expect(release).not.toContain("--set-env-vars");
    expect(release).not.toContain("--set-secrets");
    expect(flag(release!, "--image")).toBe(flag(deploy!, "--image"));
    expect(result.liveSecrets.some((name) => name.startsWith("PSP_"))).toBe(
      false,
    );
    expect(paymentRuntimeFromEnv(result.env).provider.name).toBe("fake");
    // The interim revision keeps the remaining references, without a merchant.
    const interim: NodeJS.ProcessEnv = {
      ...result.env,
      PSP_HASH_KEY: "ref",
      PSP_HASH_IV: "ref",
    };
    for (const name of [
      "PSP_MERCHANT_ID",
      "PSP_SANDBOX",
      "PSP_TOKEN_ENCRYPTION_KEY_NAME",
    ])
      delete interim[name];
    expect(paymentRuntimeFromEnv(interim).provider.available).toBe(false);
  });

  it("deploys once when no secret reference becomes a literal", () => {
    const result = transport({
      review: false,
      group: "complete",
      liveSecrets: ["BASE", "PSP_MERCHANT_ID", "PSP_HASH_KEY"],
    });
    expect(result.deploys).toHaveLength(1);
    expect(result.liveSecrets).toContain("PSP_HASH_KEY");
  });

  it("mounts complete payment references outside the rehearsal", () => {
    const result = transport({ review: false, group: "complete" });
    expect(result.mounts).toContain(
      "PSP_TOKEN_ENCRYPTION_KEY_NAME=synthetic-dev-psp-token-encryption-key-name:latest",
    );
    expect(result.mounts).toContain("PSP_HASH_KEY=");
    expect(result.env.PSP_PROVIDER).toBe("ecpay");
    expect(result.env.PSP_TOKEN_ENCRYPTION_KEY_NAME).toBeUndefined();
  });

  it("keeps ordinary non-rehearsal values and unavailable payment behavior", () => {
    const result = transport({ review: false });
    expect(result.transported).toBe(result.payload);
    expect(result.env.PAX_REVIEW_DEMO_ENABLED).toBe("false");
    expect(result.env.PAX_PAYMENT_CAPTURE_POLICY).toBeUndefined();
    expect(result.env.PSP_TOKEN_ENCRYPTION_KEY_NAME).toBeUndefined();
    const runtime = paymentRuntimeFromEnv(result.env);
    expect(runtime.provider.available).toBe(false);
    expect(runtime.cipher).toBeNull();
    expect(paymentCapturePolicyFromEnv(result.env, runtime)).toBeNull();
    expect(result.env.AUTH_MODE).toBe("explicit");
    expect(result.env.DRTS_CANDIDATE_SHA).toBe(
      "1234567890abcdef1234567890abcdef12345678",
    );
  });
});
