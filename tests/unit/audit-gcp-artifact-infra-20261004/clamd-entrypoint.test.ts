import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createIsReady, isMarkerFresh } from "../../../operations/artifact-scanner/gateway/readiness";

/**
 * Runs the real, unmodified production
 * `operations/artifact-scanner/clamd-entrypoint.sh` under its own `#!/bin/sh`
 * shebang. Only the external command boundary is mocked (freshclam, clamd,
 * clamdscan) -- the entrypoint's own freshness-publication logic
 * (`newest_signature_file` / `cvd_version` / `publish_marker_from_signatures`)
 * runs for real, against a real temp "signature database directory" and
 * real `stat`/`touch`/`head`/`cut` calls, exactly like the round-2/round-3
 * review's own reproduction method. This VM has no container runtime or
 * real ClamAV engine, so this is the furthest this specific defect (R8)
 * can be reproduced offline; a real freshclam/clamd cold start, and proof
 * that the live engine actually activates a version (clamd-transport.ts's
 * `versionClamd`, exercised in clamd-transport.test.ts and
 * readiness.test.ts), remain hosted-only / Node-side respectively.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ENTRYPOINT = join(REPO_ROOT, "operations/artifact-scanner/clamd-entrypoint.sh");

interface Harness {
  dir: string;
  dbDir: string;
  readyMarker: string;
  readyVersionFile: string;
  modeFile: string;
  logFile: string;
  child: ReturnType<typeof spawn>;
}

function writeMock(path: string, body: string): void {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

/** A minimal, real ClamAV-VDB header: `ClamAV-VDB:<build-time>:<version>:
 * <num-sigs>:<functionality-level>:<md5>:<dsig>:<builder>:<timestamp>` --
 * the same public, plaintext-prefix format `libclamav/cvd.c` parses, and
 * what `cvd_version` in the production entrypoint now requires before it
 * will ever trust a file as a real signature database (R8, round 3). */
function cvdHeader(version: string): string {
  return `ClamAV-VDB:04 Oct 2026 10-00 -0000:${version}:1000:90:deadbeefdeadbeefdeadbeefdeadbeef:deadbeef:sanesecurity:1\n`;
}

type FreshclamMode = "advance" | "noop" | "fail" | "verified";

function startEntrypoint(initialMode: FreshclamMode): Harness {
  const dir = mkdtempSync(join(tmpdir(), "clamd-entrypoint-test-"));
  const binDir = join(dir, "bin");
  const dbDir = join(dir, "db");
  const readyMarker = join(dir, "ready", "ready");
  const readyVersionFile = join(dir, "ready", "ready.version");
  const modeFile = join(dir, "freshclam-mode");
  const logFile = join(dir, "freshclam.log");
  mkdirSync(binDir);
  mkdirSync(dbDir);
  writeFileSync(modeFile, initialMode);
  writeFileSync(logFile, "");

  // Mock freshclam: exit 0 without touching any file and without printing
  // ClamAV's documented per-database outcome line ("noop", simulating
  // libfreshclam's remembered-cooldown success path -- indistinguishable
  // from a real check at the exit-code level alone); genuinely rewrite the
  // daily signature file with new content/version ("advance", simulating a
  // real signature update); fail outright ("fail"); or exit 0 without
  // touching any file but print the real "is up to date" outcome line
  // ("verified", simulating freshclam's genuine up-to-date verification --
  // R8(b), round 4).
  writeMock(
    join(binDir, "freshclam"),
    [
      `mode=$(cat "$FRESHCLAM_MODE_FILE" 2>/dev/null || echo noop)`,
      `echo "invoked mode=$mode" >> "$FRESHCLAM_LOG"`,
      `case "$mode" in`,
      `  advance) cat "$FRESHCLAM_NEXT_SIGNATURE_FILE" > "$CLAMAV_DB_DIR/daily.cvd"; exit 0 ;;`,
      `  fail) exit 1 ;;`,
      `  verified) echo "daily.cvd is up to date (version: 27315, sigs: 2000000, f-level: 90, builder: sanesecurity)"; exit 0 ;;`,
      `  *) exit 0 ;;`,
      `esac`,
    ].join("\n"),
  );
  // Mock clamd: a long-lived process the watchdog's `kill -0` can observe.
  writeMock(join(binDir, "clamd"), `trap 'exit 0' TERM INT\nwhile true; do sleep 1; done`);
  // Mock clamdscan: always answers the --ping check immediately.
  writeMock(join(binDir, "clamdscan"), `exit 0`);

  const nextSignatureFile = join(dir, "next-signature-file");
  writeFileSync(nextSignatureFile, cvdHeader("27316"));

  const child = spawn("sh", [ENTRYPOINT], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CLAMAV_READY_MARKER: readyMarker,
      CLAMAV_DB_DIR: dbDir,
      FRESHCLAM_INTERVAL_SECONDS: "1",
      FRESHCLAM_MODE_FILE: modeFile,
      FRESHCLAM_LOG: logFile,
      FRESHCLAM_NEXT_SIGNATURE_FILE: nextSignatureFile,
    },
    detached: true,
    stdio: "ignore",
  });

  return { dir, dbDir, readyMarker, readyVersionFile, modeFile, logFile, child };
}

function setMode(harness: Harness, mode: FreshclamMode): void {
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

describe("clamd-entrypoint.sh freshness provenance (R8, round 3)", () => {
  it(
    "publishes the readiness marker and matching on-disk version from the real signature file at startup, not wall-clock now",
    async () => {
      const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      // Seed a pre-existing, two-day-old signature file before the engine
      // ever starts, mirroring a sidecar that boots with signatures already
      // on a shared/persisted volume.
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), pastMtimeSec, pastMtimeSec);

      const appeared = await waitUntil(() => existsSync(harness.readyMarker), 5000);
      expect(appeared).toBe(true);
      const markerMtimeSec = Math.floor(statSync(harness.readyMarker).mtimeMs / 1000);
      expect(markerMtimeSec).toBe(pastMtimeSec);
      expect(Math.abs(markerMtimeSec - Math.floor(Date.now() / 1000))).toBeGreaterThan(60);
      expect(existsSync(harness.readyVersionFile)).toBe(true);
      expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
    },
    15000,
  );

  it(
    "never renews the marker or version file to wall-clock now when freshclam repeatedly exits 0 without updating any signature file (cooldown fake-success)",
    async () => {
      const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
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
      expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
      const logInvocations = readFileSync(harness.logFile, "utf8");
      expect(logInvocations.trim().split("\n").length).toBeGreaterThanOrEqual(3);
    },
    15000,
  );

  it(
    "advances the marker and version file together to track a genuine signature update on each periodic refresh",
    async () => {
      const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), pastMtimeSec, pastMtimeSec);

      await waitUntil(() => existsSync(harness.readyMarker), 5000);
      const firstMarkerMtimeSec = Math.floor(statSync(harness.readyMarker).mtimeMs / 1000);
      expect(firstMarkerMtimeSec).toBe(pastMtimeSec);
      expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");

      setMode(harness, "advance");
      const advanced = await waitUntil(() => {
        if (!existsSync(harness.readyMarker)) return false;
        return Math.floor(statSync(harness.readyMarker).mtimeMs / 1000) > firstMarkerMtimeSec;
      }, 5000);

      expect(advanced).toBe(true);
      const secondMarkerMtimeSec = Math.floor(statSync(harness.readyMarker).mtimeMs / 1000);
      expect(Math.abs(secondMarkerMtimeSec - Math.floor(Date.now() / 1000))).toBeLessThan(10);
      // The version file must advance in lockstep with the marker -- the
      // gateway's createIsReady compares this exact value against clamd's
      // own live VERSION reply (R8, round 3).
      expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27316");
    },
    15000,
  );

  it(
    "removes the readiness marker and version file once a periodic refresh genuinely fails",
    async () => {
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));

      await waitUntil(() => existsSync(harness.readyMarker), 5000);
      expect(existsSync(harness.readyVersionFile)).toBe(true);
      setMode(harness, "fail");
      const removed = await waitUntil(() => !existsSync(harness.readyMarker), 5000);
      expect(removed).toBe(true);
      expect(existsSync(harness.readyVersionFile)).toBe(false);
    },
    15000,
  );

  it(
    "never publishes the marker or version file for a signature file with no recognizable ClamAV-VDB header",
    async () => {
      // R8, round 3: a readiness marker must never be published for a file
      // whose real identity/version cannot be confirmed -- an unparseable
      // file is never trusted as a genuine signature database, even if
      // clamd itself is already answering --ping.
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      writeFileSync(join(harness.dbDir, "daily.cvd"), "not-a-real-clamav-database\n");

      // Give the startup loop (which pings clamd up to 60 times) a real
      // chance to run and settle; the marker must never appear.
      await wait(1500);
      expect(existsSync(harness.readyMarker)).toBe(false);
      expect(existsSync(harness.readyVersionFile)).toBe(false);
    },
    15000,
  );
});

describe("clamd-entrypoint.sh daily-specific version identity (R8a, round 4)", () => {
  it(
    "publishes the daily database's own version even when main/bytecode signature files are newer",
    async () => {
      // clamd's own VERSION reply only ever reflects the daily database
      // (clamd/session.c#print_ver -> CL_ENGINE_DB_VERSION,
      // libclamav/cvd.c#cli_cvdload's daily branch); main and bytecode carry
      // independent version numbers clamd never exposes. Publishing
      // whichever file merely has the newest mtime -- the round-3 behaviour
      // -- would publish bytecode's version here, which the live engine's
      // VERSION reply can never match, failing /health and /scan forever.
      const nowSec = Math.floor(Date.now() / 1000);
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), nowSec - 20, nowSec - 20);
      writeFileSync(join(harness.dbDir, "main.cvd"), cvdHeader("62"));
      utimesSync(join(harness.dbDir, "main.cvd"), nowSec - 10, nowSec - 10);
      writeFileSync(join(harness.dbDir, "bytecode.cvd"), cvdHeader("341"));
      utimesSync(join(harness.dbDir, "bytecode.cvd"), nowSec - 5, nowSec - 5);

      const appeared = await waitUntil(() => existsSync(harness.readyVersionFile), 5000);
      expect(appeared).toBe(true);
      expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
    },
    15000,
  );

  it(
    "publishes the daily database's own version when every signature file shares the same mtime",
    async () => {
      // The round-3 selection iterated main/daily/bytecode with a strict
      // `>` comparison, so an exact mtime tie left main.cvd selected
      // (first in iteration order) -- a second, independent way the
      // namespace mismatch surfaced even without any file being genuinely
      // newer than another.
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      const tieSec = Math.floor(Date.now() / 1000) - 30;
      const files: Array<[string, string]> = [
        ["main.cvd", "62"],
        ["daily.cvd", "27315"],
        ["bytecode.cvd", "341"],
      ];
      for (const [name, version] of files) {
        writeFileSync(join(harness.dbDir, name), cvdHeader(version));
        utimesSync(join(harness.dbDir, name), tieSec, tieSec);
      }

      const appeared = await waitUntil(() => existsSync(harness.readyVersionFile), 5000);
      expect(appeared).toBe(true);
      expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
    },
    15000,
  );

  it(
    "prefers daily.cld over a coexisting, older daily.cvd (incremental update supersedes the signed snapshot)",
    async () => {
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      const nowSec = Math.floor(Date.now() / 1000);
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27310"));
      utimesSync(join(harness.dbDir, "daily.cvd"), nowSec - 100, nowSec - 100);
      writeFileSync(join(harness.dbDir, "daily.cld"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cld"), nowSec - 10, nowSec - 10);

      const appeared = await waitUntil(() => existsSync(harness.readyMarker), 5000);
      expect(appeared).toBe(true);
      expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
      const markerMtimeSec = Math.floor(statSync(harness.readyMarker).mtimeMs / 1000);
      expect(markerMtimeSec).toBe(nowSec - 10);
    },
    15000,
  );
});

describe("clamd-entrypoint.sh verified-current freshness, composed with real readiness.ts (R8b, round 4)", () => {
  it(
    "advances the marker to wall-clock now on a verified 'is up to date' confirmation, keeping readiness live past the file's own stale mtime",
    async () => {
      // Real freshclam genuinely re-verifies the remote daily version on
      // every run and, when already current, never rewrites any database
      // file (libfreshclam_internal.c's up-to-date branch) -- a
      // file-mtime-only freshness rule cannot tell that outcome apart from
      // a stuck rate-limit cooldown, so a perfectly healthy daily database
      // older than the configured bound would stay permanently not-ready.
      const staleSec = Math.floor(Date.now() / 1000) - 7 * 60 * 60; // 7h old
      const harness = startEntrypoint("verified");
      activeHarness = harness;
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), staleSec, staleSec);

      const appeared = await waitUntil(() => existsSync(harness.readyMarker), 5000);
      expect(appeared).toBe(true);
      const markerMtimeSec = Math.floor(statSync(harness.readyMarker).mtimeMs / 1000);
      // The on-disk file itself is still 7h old -- the verified confirmation,
      // not the file's own mtime, must be what advances the marker to "now".
      expect(Math.abs(markerMtimeSec - Math.floor(Date.now() / 1000))).toBeLessThan(10);
      expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");

      // Compose the real published marker with the real readiness.ts gate,
      // using a bound shorter than the file's own 7h age: only the
      // verified-now marker mtime -- never the stale file mtime -- can make
      // this read as ready.
      const maxAgeMs = 60 * 60 * 1000; // 1h, well under the file's 7h age
      expect(isMarkerFresh(statSync(harness.readyMarker).mtimeMs, Date.now(), maxAgeMs)).toBe(true);
      const isReady = createIsReady({
        maxAgeMs,
        now: () => Date.now(),
        readMarkerMtimeMs: () => statSync(harness.readyMarker).mtimeMs,
        readExpectedVersion: () => readFileSync(harness.readyVersionFile, "utf8").trim(),
        queryLoadedVersion: async () => "27315",
      });
      await expect(isReady()).resolves.toBe(true);
    },
    15000,
  );

  it(
    "never advances the marker on an unverified cooldown exit-0, so real readiness.ts eventually reads it as stale",
    async () => {
      const staleSec = Math.floor(Date.now() / 1000) - 7 * 60 * 60; // 7h old
      const harness = startEntrypoint("noop");
      activeHarness = harness;
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), staleSec, staleSec);

      const appeared = await waitUntil(() => existsSync(harness.readyMarker), 5000);
      expect(appeared).toBe(true);
      // Let a couple of periodic "noop" cycles run -- an unconfirmed exit 0
      // must never be treated as proof the daily database is still current.
      await wait(2500);
      const markerMtimeSec = Math.floor(statSync(harness.readyMarker).mtimeMs / 1000);
      expect(markerMtimeSec).toBe(staleSec);

      // Composed with the real readiness.ts gate: a bound shorter than the
      // genuinely-unverified 7h-old marker must read as not ready.
      const maxAgeMs = 60 * 60 * 1000; // 1h
      expect(isMarkerFresh(statSync(harness.readyMarker).mtimeMs, Date.now(), maxAgeMs)).toBe(false);
      const isReady = createIsReady({
        maxAgeMs,
        now: () => Date.now(),
        readMarkerMtimeMs: () => statSync(harness.readyMarker).mtimeMs,
        readExpectedVersion: () => readFileSync(harness.readyVersionFile, "utf8").trim(),
        queryLoadedVersion: async () => "27315",
      });
      await expect(isReady()).resolves.toBe(false);
    },
    15000,
  );
});
