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

const root = path.resolve(__dirname, "../../..");
const deploy = readFileSync(
  path.join(root, ".github/workflows/deploy-dev.yml"),
  "utf8",
);
const domain = readFileSync(
  path.join(root, ".github/workflows/domain-mappings-dev.yml"),
  "utf8",
);
const directories: string[] = [];
const sha = "a".repeat(40);

function step(source: string, name: string): string {
  const start = source.indexOf(`      - name: ${name}\n`);
  if (start < 0) throw new Error(`Missing workflow step: ${name}`);
  const end = source.indexOf("\n      - ", start + 1);
  const block = source.slice(start, end < 0 ? undefined : end);
  const run = block.indexOf("        run: |\n");
  if (run < 0) throw new Error(`Missing executable script: ${name}`);
  return block
    .slice(run + "        run: |\n".length)
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n")
    .split(/\n(?= {2}[a-z][a-z-]+:)/)[0]!;
}

function directory(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pax-deploy-"));
  directories.push(dir);
  return dir;
}

function executable(dir: string, name: string, source: string) {
  const file = path.join(dir, name);
  writeFileSync(file, `#!/usr/bin/env bash\nset -euo pipefail\n${source}\n`);
  chmodSync(file, 0o755);
}

function run(
  script: string,
  env: Record<string, string> = {},
  dir = directory(),
) {
  const output = path.join(dir, "outputs");
  writeFileSync(output, "");
  const result = spawnSync("bash", ["-c", script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      GITHUB_OUTPUT: output,
      ...env,
    },
  });
  return {
    ...result,
    outputs: Object.fromEntries(
      readFileSync(output, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    ),
  };
}

afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const groups = {
  google: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
  line: ["LINE_CHANNEL_ID", "LINE_CHANNEL_SECRET"],
  facebook: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
  otp: ["PASSENGER_OTP_PEPPER"],
  sms: [
    "SMS_PROVIDER_API_KEY",
    "SMS_PROVIDER_SENDER_ID",
    "PASSENGER_OTP_PEPPER",
  ],
  payment: [
    "PSP_MERCHANT_ID",
    "PSP_API_KEY",
    "PSP_SANDBOX",
    "PSP_TOKEN_ENCRYPTION_KEY_NAME",
  ],
  cookie: ["COOKIE_SECRET"],
} as const;

function secretName(setting: string) {
  return `drts-dev-${setting.toLowerCase().replaceAll("_", "-")}`;
}

function resolveSecrets(settings: readonly string[]) {
  const dir = directory();
  const log = path.join(dir, "commands");
  executable(
    dir,
    "gcloud",
    `
printf '%s\\n' "$*" >> "$COMMAND_LOG"
[[ "$1 $2" == 'secrets describe' ]] || exit 90
[[ "$4 $5" == '--project test-project' ]] || exit 91
[[ ",$AVAILABLE_SECRETS," == *",$3,"* ]]
`,
  );
  const result = run(
    step(deploy, "Resolve passenger app optional secret mounts"),
    {
      SECRET_PREFIX: "drts-dev",
      PROJECT_ID: "test-project",
      COMMAND_LOG: log,
      AVAILABLE_SECRETS: settings.map(secretName).join(","),
    },
    dir,
  );
  return { ...result, commands: readFileSync(log, "utf8").trim().split("\n") };
}

describe("passenger dev workflow executable contracts", () => {
  it("deploys with optional credentials absent without creating or accessing secrets", () => {
    const result = resolveSecrets([]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs.api).toBe("");
    expect(result.outputs.web).toBe("");
    for (const group of Object.keys(groups))
      expect(result.outputs[`${group}_configured`]).toBe("false");
    expect(
      result.commands.every((command) =>
        command.startsWith("secrets describe "),
      ),
    ).toBe(true);
  });

  for (const [group, settings] of Object.entries(groups)) {
    it(`mounts the complete ${group} group only on its intended server`, () => {
      const result = resolveSecrets(settings);
      expect(result.status, result.stderr).toBe(0);
      expect(result.outputs[`${group}_configured`]).toBe("true");
      for (const setting of settings) {
        expect(result.outputs.api).toContain(
          `${setting}=${secretName(setting)}:latest`,
        );
        if (group === "cookie")
          expect(result.outputs.web).toContain("COOKIE_SECRET=");
        else expect(result.outputs.web).toBe("");
      }
    });
    for (const missing of settings) {
      it(`disables ${group} with ${missing} absent while another provider remains configured`, () => {
        const independent = group === "google" ? groups.line : groups.google;
        const result = resolveSecrets([
          ...settings.filter((setting) => setting !== missing),
          ...independent,
        ]);
        expect(result.status, result.stderr).toBe(0);
        expect(result.outputs[`${group}_configured`]).toBe("false");
        for (const setting of settings) {
          // Email can independently use the pepper when SMS is incomplete.
          if (setting !== "PASSENGER_OTP_PEPPER")
            expect(result.outputs.api).not.toContain(`${setting}=`);
        }
        expect(
          result.outputs[
            group === "google" ? "line_configured" : "google_configured"
          ],
        ).toBe("true");
        expect(result.outputs.web).toBe("");
      });
    }
  }

  it("deduplicates the shared OTP pepper when all groups are configured", () => {
    const result = resolveSecrets(Object.values(groups).flat());
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs.api.match(/PASSENGER_OTP_PEPPER=/g)).toHaveLength(1);
    expect(result.outputs.web).toBe(
      "COOKIE_SECRET=drts-dev-cookie-secret:latest",
    );
  });

  it.each([
    ["", 0],
    ["drts-dev-passenger-app-web", 0],
    ["drts-passenger-web", 1],
    ["drts-dev-passenger-web", 1],
    ["rogue-service", 1],
  ])("resolves passenger target '%s' with exit %i", (target, status) => {
    const result = run(step(deploy, "Resolve dev config"), {
      DEV_GCP_PROJECT_ID: "test-project",
      DEV_GCP_REGION: "us-central1",
      DEV_GCP_CLOUDSQL_INSTANCE: "test-project:us-central1:db",
      DEV_GCP_RUNTIME_SERVICE_ACCOUNT_VAR:
        "runtime@test-project.iam.gserviceaccount.com",
      DEV_WIF_SERVICE_ACCOUNT: "deployer@test-project.iam.gserviceaccount.com",
      DEV_WIF_PROVIDER: "test-provider",
      DEV_WORKLOAD_IDENTITY_ISSUER: "issuer",
      DEV_WORKLOAD_IDENTITY_AUDIENCE: "audience",
      GITHUB_EVENT_NAME: "push",
      GITHUB_SHA: sha,
      DEV_GCP_PASSENGER_APP_SERVICE: target,
      DEV_PASSENGER_APP_ALLOW_UNAUTHENTICATED: "",
    });
    expect(result.status, result.stderr).toBe(status);
    if (status === 0) {
      expect(result.outputs.passenger_app_service).toBe(
        "drts-dev-passenger-app-web",
      );
      expect(result.outputs.passenger_app_exposure_flag).toBe(
        "--no-allow-unauthenticated",
      );
      expect(result.outputs.source_ref).toBe(sha);
    }
  });

  it.each([
    ["200", sha, 0],
    ["302", sha, 1],
    ["200", "b".repeat(40), 1],
    ["404", sha, 1],
  ])(
    "checks / and /fares using exact 200 and candidate headers (%s, %s)",
    (status, servedSha, expectedExit) => {
      const dir = directory();
      const log = path.join(dir, "commands");
      executable(
        dir,
        "curl",
        `
printf '%s\\n' "$*" >> "$COMMAND_LOG"
while (($#)); do
  if [[ "$1" == '--dump-header' ]]; then
    printf 'HTTP/2 %s\\r\\nx-drts-candidate-sha: %s\\r\\n' "$MOCK_STATUS" "$MOCK_SHA" > "$2"
  fi
  shift
done
printf '%s' "$MOCK_STATUS"
`,
      );
      const result = run(
        step(deploy, "Verify passenger app endpoints"),
        {
          PASSENGER_APP_ID_TOKEN: "test-token",
          PASSENGER_APP_URL: "https://passenger.test",
          CANDIDATE_SHA: sha,
          MOCK_STATUS: status,
          MOCK_SHA: servedSha,
          COMMAND_LOG: log,
        },
        dir,
      );
      expect(result.status, result.stderr).toBe(expectedExit);
      const commands = readFileSync(log, "utf8");
      expect(commands).toContain("Authorization: Bearer test-token");
      expect(commands).not.toContain("--location");
      if (expectedExit === 0)
        expect(commands).toContain("https://passenger.test/fares");
    },
  );

  it("wires image, private BFF, readiness, and smoke without restoring retired apps", () => {
    expect(deploy).toContain("file: apps/passenger-app-web/Dockerfile");
    expect(deploy).toContain(
      "cache-to: type=gha,scope=passenger-app-web,mode=min",
    );
    expect(deploy).toContain(
      "steps.existing.outputs.passenger-app-web != 'true'",
    );
    const deployStep = step(deploy, "Deploy — passenger-app-web");
    expect(deployStep).toContain("--port 3009");
    expect(deployStep).toContain("secret_flags=(--clear-secrets)");
    expect(deployStep).toContain(
      "DRTS_API_AUTH_AUDIENCE=${{ steps.api_url.outputs.url }}",
    );
    expect(deployStep).not.toMatch(
      /JWT_SECRET|NEXT_PUBLIC|CLIENT_SECRET|PSP_API_KEY/,
    );
    expect(deploy).toContain("Enforce no public access — passenger-app-web");
    expect(step(deploy, "Wait for services to be Ready")).toContain(
      "needs.prepare.outputs.passenger_app_service",
    );
    expect(deploy).toContain(
      "id_token_audience: ${{ steps.urls.outputs.passenger_app }}",
    );
    expect(deploy).toContain(
      "CANDIDATE_SHA: ${{ needs.deploy.outputs.candidate_sha }}",
    );
    expect(deploy).not.toMatch(/(?:Deploy|Build & push) — passenger-web\n/);
    expect(deploy).toContain(
      "./operations/deployment/cleanup-retired-dev-service.sh",
    );
    expect(deploy).toContain(
      'export DRTS_DEV_PASSENGER_BASE_URL="https://drts-dev-passenger-web-${cloud_run_suffix}"',
    );
    expect(deploy).not.toContain("Deploy — partner-booking-web");
    expect(domain).toContain("map-domain-service.sh ride.smarttransport.tw");
    expect(domain).not.toContain(
      "map-domain-service.sh book.smarttransport.tw",
    );
    expect(
      readFileSync(
        path.join(root, "apps/passenger-app-web/next.config.ts"),
        "utf8",
      ),
    ).toContain('output: "standalone"');
  });
});
