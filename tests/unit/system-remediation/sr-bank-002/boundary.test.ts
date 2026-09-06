import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("executes the bank SSR, JSON and download matrix with bank module resolution", () => {
  execFileSync("pnpm", ["exec", "vitest", "run", "--config", "tests/unit/system-remediation/sr-bank-002/vitest.bank.config.ts"], {
    stdio: "inherit",
    timeout: 60_000,
  });
}, 65_000);
