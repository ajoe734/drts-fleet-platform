import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("enforces ownership before Nest SSE headers, preserves JSON refusals, events and disconnect cleanup", () => {
  const probe = fileURLToPath(
    new URL("./production-sse-probe.cjs", import.meta.url),
  );
  const report = JSON.parse(
    execFileSync(process.execPath, [probe], {
      encoding: "utf8",
      timeout: 30_000,
    }),
  );
  expect(report.failedCases).toBe(0);
  expect(report.passedCases).toBe(12);
}, 30_000);
