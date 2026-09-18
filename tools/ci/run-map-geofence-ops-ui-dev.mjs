#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const OPS_APP_DIR = path.join(ROOT, "apps/ops-console-web");
const API_HOST = process.env.MAP_GEOFENCE_OPS_MOCK_API_HOST ?? "127.0.0.1";
const API_PORT = process.env.MAP_GEOFENCE_OPS_MOCK_API_PORT ?? "3106";
const OPS_HOST = process.env.MAP_GEOFENCE_OPS_UI_HOST ?? "127.0.0.1";
const OPS_PORT = process.env.MAP_GEOFENCE_OPS_UI_PORT ?? "3202";
const API_BASE_URL = `http://${API_HOST}:${API_PORT}`;

try {
  execSync(
    "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build",
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );
} catch (err) {
  console.warn("[run-map-geofence-ops-ui-dev] package prebuild warning", err);
}

const children = new Set();
let shuttingDown = false;

const apiProcess = spawn(
  process.execPath,
  [path.join(ROOT, "tools/ci/serve-map-geofence-ops-mock-api.mjs")],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      MAP_GEOFENCE_OPS_MOCK_API_HOST: API_HOST,
      MAP_GEOFENCE_OPS_MOCK_API_PORT: API_PORT,
    },
    stdio: "inherit",
  },
);
track(apiProcess, "mock-api");

await waitForApiHealth(`${API_BASE_URL}/api/health`);

const nextProcess = spawn(
  "pnpm",
  [
    "exec",
    "next",
    "dev",
    "--webpack",
    "--hostname",
    OPS_HOST,
    "--port",
    OPS_PORT,
  ],
  {
    cwd: OPS_APP_DIR,
    env: {
      ...process.env,
      DRTS_API_URL: API_BASE_URL,
      MAP_PROVIDER_MODE: "mock",
      NEXT_PUBLIC_API_URL: "/control-plane-proxy",
      NEXT_PUBLIC_OPS_ASSISTANT_ENABLED: "false",
    },
    stdio: "inherit",
  },
);
track(nextProcess, "next-dev");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

function track(child, label) {
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      const exitCode = signal ? 1 : (code ?? 1);
      console.error(
        `[map-geofence-ops-ui-dev] ${label} exited with ${signal ?? exitCode}`,
      );
      shutdown(exitCode);
    }
  });
}

async function waitForApiHealth(url) {
  const startedAt = Date.now();
  const timeoutMs = 30_000;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the child process has opened the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 500).unref();
}
