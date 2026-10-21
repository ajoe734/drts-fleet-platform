import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { persistPrivateJson } from "../../tests/e2e/owned-referral-business-journey/protocol";
import { OPS_ENV_KEY, safeFailure } from "./core";
import {
  prepareHostedOpsFixture,
  validateHostedFixtureEnvironment,
} from "./hosted-fixture";

async function main() {
  const directory = validateHostedFixtureEnvironment(process.env);
  const output = join(directory, `ops-fixture-setup-${randomUUID()}.json`);
  const verified = await prepareHostedOpsFixture(process.env, {
    fetch,
    persist: (journal) => persistPrivateJson(output, journal),
  });
  // This is the original command. Only its private principal reference is new.
  const child = spawn(
    "pnpm",
    [
      "--filter",
      "@drts/ops-console-web",
      "exec",
      "next",
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3202",
    ],
    {
      env: { ...process.env, [OPS_ENV_KEY]: verified.canonicalPrincipalId },
      stdio: "inherit",
      detached: true,
      shell: false,
    },
  );
  const stop = (signal: NodeJS.Signals) => {
    if (child.pid)
      try {
        process.kill(-child.pid, signal);
      } catch {
        /* already stopped */
      }
  };
  let shutdown: ReturnType<typeof setTimeout> | undefined;
  const signal = (name: "SIGTERM" | "SIGINT") => {
    stop(name);
    shutdown ??= setTimeout(() => stop("SIGKILL"), 5_000);
    shutdown.unref();
  };
  const terminate = () => signal("SIGTERM");
  const interrupt = () => signal("SIGINT");
  const onExit = () => stop("SIGKILL");
  process.once("SIGTERM", terminate);
  process.once("SIGINT", interrupt);
  process.once("exit", onExit);
  child.once("error", () => {
    stop("SIGTERM");
    process.exitCode = 1;
  });
  child.once("exit", (code, killedBy) => {
    stop("SIGKILL"); // Also stop descendants if pnpm itself exited first.
    if (shutdown) clearTimeout(shutdown);
    process.removeListener("SIGTERM", terminate);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("exit", onExit);
    process.exitCode = code ?? (killedBy === "SIGTERM" ? 143 : 1);
  });
}

void main().catch((error: unknown) => {
  // Never print raw transport errors, bearer/session/proof values or stack.
  process.stderr.write(`${JSON.stringify({ failure: safeFailure(error) })}\n`);
  process.exitCode = 1;
});
