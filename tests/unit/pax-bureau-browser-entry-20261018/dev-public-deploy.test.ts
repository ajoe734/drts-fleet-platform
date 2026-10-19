import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const workflow = readFileSync(
  path.join(root, ".github/workflows/deploy-dev.yml"),
  "utf8",
);
const run = workflow.match(
  /- name: Deploy — passenger-app-web\n\s+run: \|\n([\s\S]*?)(?=\n {6}- name:)/,
)?.[1];
if (!run) throw new Error("Original Passenger deployment step is missing");
const opsRun = workflow.match(
  /- name: Deploy — ops-console-web\n\s+run: \|\n([\s\S]*?)(?=\n {6}- name:)/,
)?.[1];
if (!opsRun) throw new Error("Original Ops deployment step is missing");

function deployArgs(publicEntry: boolean, runScript = run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pax-public-deploy-"));
  try {
    const helper = path.join(
      dir,
      "operations/deployment/deploy-cloud-run-service.sh",
    );
    mkdirSync(path.dirname(helper), { recursive: true });
    writeFileSync(helper, '#!/bin/bash\nprintf "%s\\0" "$@" > "$CAPTURE"\n', {
      mode: 0o755,
    });
    const substitutions: Record<string, string> = {
      "needs.prepare.outputs.registry": "registry.example/dev",
      "needs.build-push.outputs.image_tag": "immutable-fixture-sha",
      "needs.build-push.outputs.candidate_sha": "a".repeat(40),
      "steps.api_url.outputs.url": "https://private-api.example",
      "needs.prepare.outputs.passenger_app_service":
        "drts-dev-passenger-app-web",
      "needs.prepare.outputs.ops_console_service": "drts-dev-ops-console-web",
      "needs.prepare.outputs.ops_console_exposure_flag":
        "--no-allow-unauthenticated",
      "steps.api_secrets.outputs.ops": "existing-ops-secrets",
      "steps.web_env.outputs.vars":
        "NODE_ENV=production,DRTS_API_URL=https://private-api.example",
      "needs.prepare.outputs.region": "us-central1",
      "needs.prepare.outputs.runtime_service_account":
        "runtime@example.invalid",
      "needs.prepare.outputs.project_id": "drts-dev-devcc-20260825",
      "needs.prepare.outputs.passenger_app_exposure_flag": publicEntry
        ? "--allow-unauthenticated"
        : "--no-allow-unauthenticated",
    };
    const script = runScript!.replace(
      /\$\{\{\s*([^}]+?)\s*\}\}/g,
      (_, key: string) => {
        const value = substitutions[key.trim()];
        if (value === undefined)
          throw new Error(`Unknown deploy input: ${key}`);
        return value;
      },
    );
    const capture = path.join(dir, "args");
    execFileSync("bash", ["-c", script], {
      cwd: dir,
      env: {
        ...process.env,
        CAPTURE: capture,
        DEV_PAX_REVIEW_DEMO_ENABLED: "true",
        DEV_PAX_BUREAU_ENTRY_HOST: "not-provisioned.example",
      },
    });
    return readFileSync(capture, "utf8").split("\0").filter(Boolean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the real Passenger deploy command couples public access to closed controls", () => {
  it.each([true, false])("public entry = %s", (enabled) => {
    const args = deployArgs(enabled);
    const vars = args[args.indexOf("--set-env-vars") + 1];
    expect(vars).toContain(`PAX_PUBLIC_PASSENGER_ONLY=${enabled}`);
    expect(vars).toContain("PAX_REVIEW_DEMO_ENABLED=true");
    expect(args).toContain(
      enabled ? "--allow-unauthenticated" : "--no-allow-unauthenticated",
    );
    expect(args[0]).toBe("drts-dev-passenger-app-web");
  });

  it("keeps the actual Ops deployment private and enables its original Driver mount", () => {
    const args = deployArgs(true, opsRun);
    expect(args[0]).toBe("drts-dev-ops-console-web");
    expect(args).toContain("--no-allow-unauthenticated");
    const vars = args[args.indexOf("--set-env-vars") + 1];
    expect(vars).toContain("PAX_REVIEW_DEMO_ENABLED=true");
    expect(vars).toContain("PAX_PUBLIC_PASSENGER_ONLY=false");
  });
});
