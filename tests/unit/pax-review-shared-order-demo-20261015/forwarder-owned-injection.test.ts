import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);

it.each(["direct", "app", "app-db-error"])(
  "the production CommonJS graph injects the owned task reader: %s",
  async (mode) => {
    const result = await execute(
      process.execPath,
      [
        "tests/unit/pax-review-shared-order-demo-20261015/forwarder-owned-injection-probe.cjs",
        mode,
      ],
      { timeout: 60_000, maxBuffer: 2_000_000 },
    ).catch((error: unknown) => {
      const failure = error as { stdout?: string; stderr?: string };
      throw new Error(
        `${failure.stdout ?? ""}\n${failure.stderr ?? String(error)}`,
      );
    });
    const report = JSON.parse(result.stdout.trim());
    expect(report.ownedInjected).toBe(true);
    expect(report.startedServers).toBe(0);
    expect(report.initHooksInvoked).toBe(0);
    expect(report.databaseBoundary).toContain(
      "no PostgreSQL/runtime acceptance credit",
    );
  },
  65_000,
);
