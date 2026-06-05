#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const args = [
  "exec",
  "playwright",
  "test",
  "tests/e2e/i18n-locale.spec.ts",
  "--project=ops-assistant-on",
  "--project=platform-admin-assistant-on",
  ...process.argv.slice(2),
];

const result = spawnSync("pnpm", args, {
  stdio: "inherit",
  env: process.env,
});

if (result.status === 0) {
  console.log("i18n-guard: 0 violations");
  process.exit(0);
}

console.error("i18n-guard: violations detected");
process.exit(result.status ?? 1);
