import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
const script = path.resolve(
  __dirname,
  "../../../operations/deployment/provision-billing-monthly-batch-scheduler.sh",
);
function isolated(overrides: Record<string, string> = {}, exists = false) {
  const dir = mkdtempSync(path.join(tmpdir(), "c089-scheduler-stubs-")),
    bin = path.join(dir, "bin"),
    log = path.join(dir, "calls.jsonl");
  mkdirSync(bin);
  const fake = path.join(bin, "gcloud");
  writeFileSync(
    fake,
    `#!/usr/bin/env python3\nimport json,os,sys\nwith open(os.environ['SIM_LOG'],'a') as f:f.write(json.dumps(sys.argv[1:])+'\\n')\nif sys.argv[1:4]==['scheduler','jobs','describe']:sys.exit(0 if os.environ['SIM_EXISTS']=='1' else 1)\n`,
  );
  chmodSync(fake, 0o755);
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      SIM_LOG: log,
      SIM_EXISTS: exists ? "1" : "0",
      PROJECT_ID: "drts-sim-project",
      REGION: "us-central1",
      API_ORIGIN: "https://billing-sim.invalid",
      SCHEDULER_SERVICE_ACCOUNT:
        "monthly-sim@drts-sim-project.iam.gserviceaccount.com",
      TIME_ZONE: "Etc/UTC",
      BILLING_MONTHLY_SCHEDULE: "15 2 1 * *",
      ...overrides,
    },
  });
  const calls = (() => {
    try {
      return readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]);
    } catch {
      return [] as string[][];
    }
  })();
  rmSync(dir, { recursive: true, force: true });
  return { result, calls };
}
describe("C089 prepared scheduler shell with isolated commands only", () => {
  it.each([false, true])(
    "creates/updates only its exact job, existing=%s",
    (exists) => {
      const { result, calls } = isolated({}, exists);
      expect(result.status).toBe(0);
      expect(calls).toHaveLength(2);
      expect(calls[0]!.slice(0, 4)).toEqual([
        "scheduler",
        "jobs",
        "describe",
        "drts-billing-monthly",
      ]);
      expect(calls[1]!.slice(0, 5)).toEqual([
        "scheduler",
        "jobs",
        exists ? "update" : "create",
        "http",
        "drts-billing-monthly",
      ]);
      expect(calls[1]).toEqual(
        expect.arrayContaining([
          "--schedule",
          "15 2 1 * *",
          "--time-zone",
          "Etc/UTC",
          "--uri",
          "https://billing-sim.invalid/api/internal/scheduled-tasks/billing-monthly/run",
          "--oidc-token-audience",
          "https://billing-sim.invalid",
          "--message-body",
          "{}",
        ]),
      );
      expect(
        calls.every((call) => call[0] === "scheduler" && call[1] === "jobs"),
      ).toBe(true);
      expect(
        calls.map((call) => call.slice(0, 3).join(" ")).join("\n"),
      ).not.toMatch(
        /iam|secrets|services|jobs run|mail-outbox|approval-timeout/,
      );
    },
  );
  it.each([
    { TIME_ZONE: "Not/AZone" },
    { BILLING_MONTHLY_SCHEDULE: "* * * *" },
    { BILLING_MONTHLY_SCHEDULE: "60 2 1 * *" },
    { BILLING_MONTHLY_SCHEDULE: "0 0 */0 * *" },
    { API_ORIGIN: "http://billing-sim.invalid" },
    { API_ORIGIN: "https://billing-sim.invalid/path" },
    { SCHEDULER_SERVICE_ACCOUNT: "" },
  ])(
    "rejects invalid explicit configuration before any command: %j",
    (overrides) => {
      const { result, calls } = isolated(overrides);
      expect(result.status).not.toBe(0);
      expect(calls).toEqual([]);
    },
  );
});
