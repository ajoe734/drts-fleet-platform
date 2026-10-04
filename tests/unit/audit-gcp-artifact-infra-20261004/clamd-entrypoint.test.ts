import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

/**
 * Runs the real, unmodified production
 * `operations/artifact-scanner/clamd-entrypoint.sh` under its own `#!/bin/sh`
 * shebang. Only the external command boundary is mocked (freshclam, clamd,
 * clamdscan) -- the entrypoint's own freshness-publication logic
 * (`newest_signature_file` / `publish_marker_from_signatures`) runs for
 * real, against a real temp "signature database directory" and real
 * `stat`/`touch` calls, exactly like the round-2 review's own reproduction
 * method. This VM has no container runtime or real ClamAV engine, so this
 * is the furthest this specific defect (R8) can be reproduced offline; a
 * real freshclam/clamd cold start remains hosted-only.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ENTRYPOINT = join(REPO_ROOT, "operations/artifact-scanner/clamd-entrypoint.sh");

interface Harness {
  dir: string;
  dbDir: string;
  readyMarker: string;
  modeFile: string;
  logFile: string;
  child: ReturnType<typeof spawn>;
}

function writeMock(path: string, body: string): void {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

function startEntrypoint(initialMode: "advance" | "noop" | "fail"): Harness {
  const dir = mkdtempSync(join(tmpdir(), "clamd-entrypoint-test-"));
  const binDir = join(dir, "bin");
  const dbDir = join(dir, "db");
  const readyMarker = join(dir, "ready", "ready");
  const modeFile = join(dir, "freshclam-mode");
  const logFile = join(dir, "freshclam.log");
  mkdirSync(binDir);
  mkdirSync(dbDir);
  writeFileSync(modeFile, initialMode);
  writeFileSync(logFile, "");

  // Mock freshclam: exit 0 without touching any file ("noop", simulating
  // libfreshclam's remembered-cooldown success path), genuinely touch the
  // newest signature file ("advance"), or fail ("fail").
  writeMock(
    join(binDir, "freshclam"),
    [
      `mode=$(cat "$FRESHCLAM_MODE_FILE" 2>/dev/null || echo noop)`,
      `echo "invoked mode=$mode" >> "$FRESHCLAM_LOG"`,
      `case "$mode" in`,
      `  advance) touch "$CLAMAV_DB_DIR/daily.cvd"; exit 0 ;;`,
      `  fail) exit 1 ;;`,
      `  *) exit 0 ;;`,
      `esac`,
    ].join("\n"),
  );
  // Mock clamd: a long-lived process the watchdog's `kill -0` can observe.
  writeMock(join(binDir, "clamd"), `trap 'exit 0' TERM INT\nwhile true; do sleep 1; done`);
  // Mock clamdscan: always answers the --ping check immediately.
  writeMock(join(binDir, "clamdscan"), `exit 0`);

  const child = spawn("sh", [ENTRYPOINT], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CLAMAV_READY_MARKER: readyMarker,
      CLAMAV_DB_DIR: dbDir,
      FRESHCLAM_INTERVAL_SECONDS: "1",
      FRESHCLAM_MODE_FILE: modeFile,
      FRESHCLAM_LOG: logFile,
    },
    detached: true,
    stdio: "ignore",
  });

  return { dir, dbDir, readyMarker, modeFile, logFile, child };
}

function setMode(harness: Harness, mode: "advance" | "noop" | "fail"): void {
  writeFileSync(harness.modeFile, mode);
}

function stop(harness: Harness): void {
  if (harness.child.pid) {
    try {
      process.kill(-harness.child.pid, "SIGTERM");
    } catch {
      // already exited
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(25);
  }
  return predicate();
}

let activeHarness: Harness | undefined;

afterEach(() => {
  if (activeHarness) {
    stop(activeHarness);
    activeHarness = undefined;
  }
});

describe("clamd-entrypoint.sh freshness provenance (R8, round 2)", () => {
  it(
    "publishes the readiness marker from the real signature file's mtime at startup, not wall-clock now",
    async () => {
      const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      // Seed a pre-existing, two-day-old signature file before the engine
      // ever starts, mirroring a sidecar that boots with signatures already
      // on a shared/persisted volume.
      writeFileSync(join(harness.dbDir, "daily.cvd"), "stub-signature-content");
      utimesSync(join(harness.dbDir, "daily.cvd"), pastMtimeSec, pastMtimeSec);

      const appeared = await waitUntil(() => existsSync(harness.readyMarker), 5000);
      expect(appeared).toBe(true);
      const markerMtimeSec = Math.floor(statSync(harness.readyMarker).mtimeMs / 1000);
      expect(markerMtimeSec).toBe(pastMtimeSec);
      expect(Math.abs(markerMtimeSec - Math.floor(Date.now() / 1000))).toBeGreaterThan(60);
    },
    15000,
  );

  it(
    "never renews the marker to wall-clock now when freshclam repeatedly exits 0 without updating any signature file (cooldown fake-success)",
    async () => {
      const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      writeFileSync(join(harness.dbDir, "daily.cvd"), "stub-signature-content");
      utimesSync(join(harness.dbDir, "daily.cvd"), pastMtimeSec, pastMtimeSec);

      await waitUntil(() => existsSync(harness.readyMarker), 5000);
      // Let several 1-second periodic cycles run, all under "noop" mode.
      await wait(3500);

      expect(existsSync(harness.readyMarker)).toBe(true);
      const markerMtimeSec = Math.floor(statSync(harness.readyMarker).mtimeMs / 1000);
      // The pre-fix code called `touch "$READY_MARKER"` on every freshclam
      // exit-0, which would have advanced this to within ~1s of "now" --
      // the fix ties it to the untouched signature file's real mtime
      // instead, so it must still equal the original two-day-old value.
      expect(markerMtimeSec).toBe(pastMtimeSec);
      const logInvocations = (await import("node:fs")).readFileSync(harness.logFile, "utf8");
      expect(logInvocations.trim().split("\n").length).toBeGreaterThanOrEqual(3);
    },
    15000,
  );

  it(
    "advances the marker to track a genuine signature update on each periodic refresh",
    async () => {
      const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      writeFileSync(join(harness.dbDir, "daily.cvd"), "stub-signature-content");
      utimesSync(join(harness.dbDir, "daily.cvd"), pastMtimeSec, pastMtimeSec);

      await waitUntil(() => existsSync(harness.readyMarker), 5000);
      const firstMarkerMtimeSec = Math.floor(statSync(harness.readyMarker).mtimeMs / 1000);
      expect(firstMarkerMtimeSec).toBe(pastMtimeSec);

      setMode(harness, "advance");
      const advanced = await waitUntil(() => {
        if (!existsSync(harness.readyMarker)) return false;
        return Math.floor(statSync(harness.readyMarker).mtimeMs / 1000) > firstMarkerMtimeSec;
      }, 5000);

      expect(advanced).toBe(true);
      const secondMarkerMtimeSec = Math.floor(statSync(harness.readyMarker).mtimeMs / 1000);
      expect(Math.abs(secondMarkerMtimeSec - Math.floor(Date.now() / 1000))).toBeLessThan(10);
    },
    15000,
  );

  it(
    "removes the readiness marker once a periodic refresh genuinely fails",
    async () => {
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      writeFileSync(join(harness.dbDir, "daily.cvd"), "stub-signature-content");

      await waitUntil(() => existsSync(harness.readyMarker), 5000);
      setMode(harness, "fail");
      const removed = await waitUntil(() => !existsSync(harness.readyMarker), 5000);
      expect(removed).toBe(true);
    },
    15000,
  );
});
