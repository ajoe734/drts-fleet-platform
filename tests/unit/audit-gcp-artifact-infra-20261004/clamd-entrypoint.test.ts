import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  createIsReady,
  isMarkerFresh,
} from "../../../operations/artifact-scanner/gateway/readiness";

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

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const DEFAULT_ENTRYPOINT = join(
  REPO_ROOT,
  "operations/artifact-scanner/clamd-entrypoint.sh",
);
const ENTRYPOINT =
  process.env.CLAMD_ENTRYPOINT_UNDER_TEST ?? DEFAULT_ENTRYPOINT;

interface Harness {
  dir: string;
  dbDir: string;
  readyMarker: string;
  readyVersionFile: string;
  modeFile: string;
  logFile: string;
  verifiedMessageFile: string;
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

function startEntrypoint(
  initialMode: FreshclamMode,
  prepare: (paths: Omit<Harness, "child">) => void,
): Harness {
  const dir = mkdtempSync(join(tmpdir(), "clamd-entrypoint-test-"));
  const binDir = join(dir, "bin");
  const dbDir = join(dir, "db");
  const readyMarker = join(dir, "ready", "ready");
  const readyVersionFile = join(dir, "ready", "ready.version");
  const modeFile = join(dir, "freshclam-mode");
  const logFile = join(dir, "freshclam.log");
  const verifiedMessageFile = join(dir, "verified-message");
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
  // touching any file but print a real per-database outcome line read from
  // `FRESHCLAM_VERIFIED_MESSAGE_FILE` if a test has written one, else the
  // real default `check_for_new_database_version` up-to-date wording for
  // `daily.cvd` at version 27315 ("verified", simulating freshclam's
  // genuine verification outcome -- R8(b), round 4/5). The exact wording
  // (including which file/version it names) is test-controlled so the
  // entrypoint's binding of a confirmation to the SELECTED database's own
  // filename/version (round 5) can be exercised both ways.
  writeMock(
    join(binDir, "freshclam"),
    [
      `mode=$(cat "$FRESHCLAM_MODE_FILE" 2>/dev/null || echo noop)`,
      `echo "invoked mode=$mode" >> "$FRESHCLAM_LOG"`,
      `case "$mode" in`,
      `  advance) cat "$FRESHCLAM_NEXT_SIGNATURE_FILE" > "$CLAMAV_DB_DIR/daily.cvd"; exit 0 ;;`,
      `  fail) exit 1 ;;`,
      `  verified)`,
      `    if [ -f "$FRESHCLAM_VERIFIED_MESSAGE_FILE" ]; then`,
      `      cat "$FRESHCLAM_VERIFIED_MESSAGE_FILE"`,
      `    else`,
      `      echo "daily.cvd database is up-to-date (version: 27315, sigs: 2000000, f-level: 90, builder: sanesecurity)"`,
      `    fi`,
      `    exit 0 ;;`,
      `  *) exit 0 ;;`,
      `esac`,
    ].join("\n"),
  );
  // Mock clamd: a long-lived process the watchdog's `kill -0` can observe.
  writeMock(
    join(binDir, "clamd"),
    `trap 'exit 0' TERM INT\nwhile true; do sleep 1; done`,
  );
  // Mock clamdscan: always answers the --ping check immediately.
  writeMock(join(binDir, "clamdscan"), `exit 0`);

  const nextSignatureFile = join(dir, "next-signature-file");
  writeFileSync(nextSignatureFile, cvdHeader("27316"));

  // The child must see the complete initial fixture, including historical
  // mtimes and coexisting CVD/CLD files. Spawning before these synchronous
  // writes lets normal OS scheduling publish a marker from a partial fixture.
  prepare({
    dir,
    dbDir,
    readyMarker,
    readyVersionFile,
    modeFile,
    logFile,
    verifiedMessageFile,
  });

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
      FRESHCLAM_VERIFIED_MESSAGE_FILE: verifiedMessageFile,
    },
    detached: true,
    stdio: "ignore",
  });

  return {
    dir,
    dbDir,
    readyMarker,
    readyVersionFile,
    modeFile,
    logFile,
    verifiedMessageFile,
    child,
  };
}

function setMode(harness: Harness, mode: FreshclamMode): void {
  writeFileSync(harness.modeFile, mode);
}

/** Overrides the exact line "verified" mode's freshclam mock prints, so a
 * test can confirm a specific filename/version (matching or deliberately
 * NOT matching the database `daily_reference_file()` actually selects). */
function setVerifiedMessage(
  harness: Pick<Harness, "verifiedMessageFile">,
  message: string,
): void {
  writeFileSync(harness.verifiedMessageFile, `${message}\n`);
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

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(25);
  }
  return predicate();
}

// touch -r creates the marker before applying the reference timestamps.
// Observe the complete publication before checking its exact provenance.
function hasPublishedMarker(
  harness: Pick<Harness, "readyMarker" | "readyVersionFile">,
  version: string,
  mtimeSec: number,
): boolean {
  return (
    existsSync(harness.readyMarker) &&
    existsSync(harness.readyVersionFile) &&
    readFileSync(harness.readyVersionFile, "utf8").trim() === version &&
    Math.floor(statSync(harness.readyMarker).mtimeMs / 1000) === mtimeSec
  );
}

let activeHarness: Harness | undefined;

afterEach(() => {
  if (activeHarness) {
    stop(activeHarness);
    activeHarness = undefined;
  }
});

describe("clamd-entrypoint.sh freshness provenance (R8, round 3)", () => {
  it("publishes the readiness marker and matching on-disk version from the real signature file at startup, not wall-clock now", async () => {
    const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const harness = startEntrypoint("noop", (harness) => {
      // Seed a pre-existing, two-day-old signature file before the engine
      // ever starts, mirroring a sidecar that boots with signatures already
      // on a shared/persisted volume.
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), pastMtimeSec, pastMtimeSec);
    });
    activeHarness = harness;

    const appeared = await waitUntil(
      () => hasPublishedMarker(harness, "27315", pastMtimeSec),
      5000,
    );
    expect(appeared).toBe(true);
    const markerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    expect(markerMtimeSec).toBe(pastMtimeSec);
    expect(
      Math.abs(markerMtimeSec - Math.floor(Date.now() / 1000)),
    ).toBeGreaterThan(60);
    expect(existsSync(harness.readyVersionFile)).toBe(true);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
  }, 15000);

  it("never renews the marker or version file to wall-clock now when freshclam repeatedly exits 0 without updating any signature file (cooldown fake-success)", async () => {
    const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const harness = startEntrypoint("noop", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), pastMtimeSec, pastMtimeSec);
    });
    activeHarness = harness;

    await waitUntil(() => existsSync(harness.readyMarker), 5000);
    // Let several 1-second periodic cycles run, all under "noop" mode.
    await wait(3500);

    expect(existsSync(harness.readyMarker)).toBe(true);
    const markerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    // The pre-fix code called `touch "$READY_MARKER"` on every freshclam
    // exit-0, which would have advanced this to within ~1s of "now" --
    // the fix ties it to the untouched signature file's real mtime
    // instead, so it must still equal the original two-day-old value.
    expect(markerMtimeSec).toBe(pastMtimeSec);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
    const logInvocations = readFileSync(harness.logFile, "utf8");
    expect(logInvocations.trim().split("\n").length).toBeGreaterThanOrEqual(3);
  }, 15000);

  it("advances the marker and version file together to track a genuine signature update on each periodic refresh", async () => {
    const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const harness = startEntrypoint("noop", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), pastMtimeSec, pastMtimeSec);
    });
    activeHarness = harness;

    await waitUntil(
      () => hasPublishedMarker(harness, "27315", pastMtimeSec),
      5000,
    );
    const firstMarkerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    expect(firstMarkerMtimeSec).toBe(pastMtimeSec);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");

    setMode(harness, "advance");
    const advanced = await waitUntil(() => {
      if (!existsSync(harness.readyMarker)) return false;
      return (
        Math.floor(statSync(harness.readyMarker).mtimeMs / 1000) >
        firstMarkerMtimeSec
      );
    }, 5000);

    expect(advanced).toBe(true);
    const secondMarkerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    expect(
      Math.abs(secondMarkerMtimeSec - Math.floor(Date.now() / 1000)),
    ).toBeLessThan(10);
    // The version file must advance in lockstep with the marker -- the
    // gateway's createIsReady compares this exact value against clamd's
    // own live VERSION reply (R8, round 3).
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27316");
  }, 15000);

  it("removes the readiness marker and version file once a periodic refresh genuinely fails", async () => {
    const harness = startEntrypoint("noop", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
    });
    activeHarness = harness;

    await waitUntil(() => existsSync(harness.readyMarker), 5000);
    expect(existsSync(harness.readyVersionFile)).toBe(true);
    setMode(harness, "fail");
    const removed = await waitUntil(
      // One rm invocation still unlinks its two arguments separately. Wait
      // for the complete outcome instead of observing between those unlinks.
      () =>
        !existsSync(harness.readyMarker) &&
        !existsSync(harness.readyVersionFile),
      5000,
    );
    expect(removed).toBe(true);
    expect(existsSync(harness.readyVersionFile)).toBe(false);
  }, 15000);

  it("never publishes the marker or version file for a signature file with no recognizable ClamAV-VDB header", async () => {
    // R8, round 3: a readiness marker must never be published for a file
    // whose real identity/version cannot be confirmed -- an unparseable
    // file is never trusted as a genuine signature database, even if
    // clamd itself is already answering --ping.
    const harness = startEntrypoint("noop", (harness) => {
      writeFileSync(
        join(harness.dbDir, "daily.cvd"),
        "not-a-real-clamav-database\n",
      );

      // Give the startup loop (which pings clamd up to 60 times) a real
      // chance to run and settle; the marker must never appear.
    });
    activeHarness = harness;

    await wait(1500);
    expect(existsSync(harness.readyMarker)).toBe(false);
    expect(existsSync(harness.readyVersionFile)).toBe(false);
  }, 15000);
});

describe("clamd-entrypoint.sh daily-specific version identity (R8a, round 4/5)", () => {
  it("publishes the daily database's own version even when main/bytecode signature files are newer", async () => {
    // clamd's own VERSION reply only ever reflects the daily database
    // (clamd/session.c#print_ver -> CL_ENGINE_DB_VERSION,
    // libclamav/cvd.c#cli_cvdload's daily branch); main and bytecode carry
    // independent version numbers clamd never exposes. Publishing
    // whichever file merely has the newest mtime -- the round-3 behaviour
    // -- would publish bytecode's version here, which the live engine's
    // VERSION reply can never match, failing /health and /scan forever.
    const nowSec = Math.floor(Date.now() / 1000);
    const harness = startEntrypoint("noop", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), nowSec - 20, nowSec - 20);
      writeFileSync(join(harness.dbDir, "main.cvd"), cvdHeader("62"));
      utimesSync(join(harness.dbDir, "main.cvd"), nowSec - 10, nowSec - 10);
      writeFileSync(join(harness.dbDir, "bytecode.cvd"), cvdHeader("341"));
      utimesSync(join(harness.dbDir, "bytecode.cvd"), nowSec - 5, nowSec - 5);
    });
    activeHarness = harness;

    const appeared = await waitUntil(
      () => existsSync(harness.readyVersionFile),
      5000,
    );
    expect(appeared).toBe(true);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
  }, 15000);

  it("publishes the daily database's own version when every signature file shares the same mtime", async () => {
    // The round-3 selection iterated main/daily/bytecode with a strict
    // `>` comparison, so an exact mtime tie left main.cvd selected
    // (first in iteration order) -- a second, independent way the
    // namespace mismatch surfaced even without any file being genuinely
    // newer than another.
    const harness = startEntrypoint("noop", (harness) => {
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
    });
    activeHarness = harness;

    const appeared = await waitUntil(
      () => existsSync(harness.readyVersionFile),
      5000,
    );
    expect(appeared).toBe(true);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
  }, 15000);

  it("prefers a coexisting daily.cld over daily.cvd when the cld has the HIGHER header version (incremental update supersedes the signed snapshot)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const harness = startEntrypoint("noop", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27310"));
      utimesSync(join(harness.dbDir, "daily.cvd"), nowSec - 100, nowSec - 100);
      writeFileSync(join(harness.dbDir, "daily.cld"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cld"), nowSec - 10, nowSec - 10);
    });
    activeHarness = harness;

    const appeared = await waitUntil(
      () => hasPublishedMarker(harness, "27315", nowSec - 10),
      5000,
    );
    expect(appeared).toBe(true);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
    const markerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    expect(markerMtimeSec).toBe(nowSec - 10);
  }, 15000);

  it("selects a newly downloaded, HIGHER-version daily.cvd over a stale, lower-version daily.cld even though the cld has the newer mtime (R8a, round 5)", async () => {
    // Official ClamAV selection (libclamav/readdb.c#cli_loaddbdir,
    // clamav-1.4.6 lines 5179-5199) is driven by each file's own header
    // version, never by mtime -- an always-prefer-.cld rule (round 4's
    // fix) is wrong whenever a full .cvd download lands with a HIGHER
    // version than a stale, previously-loaded .cld. Giving the stale cld
    // the newer mtime here proves the selection really is version-driven.
    const nowSec = Math.floor(Date.now() / 1000);
    const harness = startEntrypoint("noop", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cld"), cvdHeader("27310"));
      utimesSync(join(harness.dbDir, "daily.cld"), nowSec - 5, nowSec - 5);
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27316"));
      utimesSync(join(harness.dbDir, "daily.cvd"), nowSec - 100, nowSec - 100);
    });
    activeHarness = harness;

    const appeared = await waitUntil(
      () => hasPublishedMarker(harness, "27316", nowSec - 100),
      5000,
    );
    expect(appeared).toBe(true);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27316");
    const markerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    expect(markerMtimeSec).toBe(nowSec - 100);
  }, 15000);

  it("ties an EQUAL-version daily.cvd/daily.cld pair to the cld by file identity, not mtime (R8a, round 5)", async () => {
    // cli_loaddbdir's documented tie rule: the .cld wins only when the
    // versions are EQUAL. The .cvd here has the strictly newer mtime, so
    // a marker mtime matching the .cld (not the .cvd) proves the tie was
    // broken by file identity, not by whichever file happened to be
    // touched more recently.
    const nowSec = Math.floor(Date.now() / 1000);
    const harness = startEntrypoint("noop", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), nowSec - 5, nowSec - 5);
      writeFileSync(join(harness.dbDir, "daily.cld"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cld"), nowSec - 100, nowSec - 100);
    });
    activeHarness = harness;

    const appeared = await waitUntil(
      () => hasPublishedMarker(harness, "27315", nowSec - 100),
      5000,
    );
    expect(appeared).toBe(true);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
    const markerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    expect(markerMtimeSec).toBe(nowSec - 100);
  }, 15000);
});

describe("clamd-entrypoint.sh verified-current freshness, composed with real readiness.ts (R8b, round 4/5)", () => {
  it("advances the marker to wall-clock now on a verified 'database is up-to-date' confirmation naming the selected file/version, keeping readiness live past the file's own stale mtime", async () => {
    // Real freshclam genuinely re-verifies the remote daily version on
    // every run and, when already current, never rewrites any database
    // file (libfreshclam_internal.c's up-to-date branch) -- a
    // file-mtime-only freshness rule cannot tell that outcome apart from
    // a stuck rate-limit cooldown, so a perfectly healthy daily database
    // older than the configured bound would stay permanently not-ready.
    // The real wording (round 5) includes "database" and a hyphenated
    // "up-to-date" -- an invented "is up to date" fixture would no
    // longer match the production regex, so this relies on the mock's
    // real default text rather than overriding it.
    const staleSec = Math.floor(Date.now() / 1000) - 7 * 60 * 60; // 7h old
    const harness = startEntrypoint("verified", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), staleSec, staleSec);
    });
    activeHarness = harness;

    const appeared = await waitUntil(
      () => existsSync(harness.readyMarker),
      5000,
    );
    expect(appeared).toBe(true);
    const markerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    // The on-disk file itself is still 7h old -- the verified confirmation,
    // not the file's own mtime, must be what advances the marker to "now".
    expect(
      Math.abs(markerMtimeSec - Math.floor(Date.now() / 1000)),
    ).toBeLessThan(10);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");

    // Compose the real published marker with the real readiness.ts gate,
    // using a bound shorter than the file's own 7h age: only the
    // verified-now marker mtime -- never the stale file mtime -- can make
    // this read as ready.
    const maxAgeMs = 60 * 60 * 1000; // 1h, well under the file's 7h age
    expect(
      isMarkerFresh(
        statSync(harness.readyMarker).mtimeMs,
        Date.now(),
        maxAgeMs,
      ),
    ).toBe(true);
    const isReady = createIsReady({
      maxAgeMs,
      now: () => Date.now(),
      readMarkerMtimeMs: () => statSync(harness.readyMarker).mtimeMs,
      readExpectedVersion: () =>
        readFileSync(harness.readyVersionFile, "utf8").trim(),
      queryLoadedVersion: async () => "27315",
    });
    await expect(isReady()).resolves.toBe(true);
  }, 15000);

  it("never advances the marker on an unverified cooldown exit-0, so real readiness.ts eventually reads it as stale", async () => {
    const staleSec = Math.floor(Date.now() / 1000) - 7 * 60 * 60; // 7h old
    const harness = startEntrypoint("noop", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), staleSec, staleSec);
    });
    activeHarness = harness;

    const appeared = await waitUntil(
      () => existsSync(harness.readyMarker),
      5000,
    );
    expect(appeared).toBe(true);
    // Let a couple of periodic "noop" cycles run -- an unconfirmed exit 0
    // must never be treated as proof the daily database is still current.
    await wait(2500);
    const markerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    expect(markerMtimeSec).toBe(staleSec);

    // Composed with the real readiness.ts gate: a bound shorter than the
    // genuinely-unverified 7h-old marker must read as not ready.
    const maxAgeMs = 60 * 60 * 1000; // 1h
    expect(
      isMarkerFresh(
        statSync(harness.readyMarker).mtimeMs,
        Date.now(),
        maxAgeMs,
      ),
    ).toBe(false);
    const isReady = createIsReady({
      maxAgeMs,
      now: () => Date.now(),
      readMarkerMtimeMs: () => statSync(harness.readyMarker).mtimeMs,
      readExpectedVersion: () =>
        readFileSync(harness.readyVersionFile, "utf8").trim(),
      queryLoadedVersion: async () => "27315",
    });
    await expect(isReady()).resolves.toBe(false);
  }, 15000);

  it("recognizes the real 'updated' outcome wording (no 'database' word, no hyphen) bound to the selected file, not only the 'database is up-to-date' wording (R8b, round 5)", async () => {
    // libfreshclam_internal.c's updatedb() success path (clamav-1.4.6,
    // lines 2519-2520) logs "<file> updated (version: N, ...)" -- with
    // neither the word "database" nor a hyphen, unlike the up-to-date
    // branch. The match must accept this wording too, still bound to the
    // selected file's own name/version.
    const staleSec = Math.floor(Date.now() / 1000) - 7 * 60 * 60; // 7h old
    const harness = startEntrypoint("verified", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), staleSec, staleSec);
      setVerifiedMessage(
        harness,
        "daily.cvd updated (version: 27315, sigs: 1000, f-level: 90, builder: raynman)",
      );
    });
    activeHarness = harness;

    const appeared = await waitUntil(
      () => existsSync(harness.readyMarker),
      5000,
    );
    expect(appeared).toBe(true);
    const markerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    expect(
      Math.abs(markerMtimeSec - Math.floor(Date.now() / 1000)),
    ).toBeLessThan(10);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27315");
  }, 15000);

  it("does not accept a verified confirmation naming a stale, non-selected sibling file as proof the selected database is current (R8a+R8b linkage, round 5)", async () => {
    // The selected reference is daily.cld (higher header version, 27316)
    // -- but freshclam's captured output here only confirms the STALE,
    // lower-version daily.cvd (27315). That confirmation must never be
    // credited to the selected cld; the marker must stay pinned to cld's
    // own (stale) mtime, and real readiness.ts must still read not-ready.
    const staleSec = Math.floor(Date.now() / 1000) - 7 * 60 * 60; // 7h old
    const harness = startEntrypoint("verified", (harness) => {
      writeFileSync(join(harness.dbDir, "daily.cvd"), cvdHeader("27315"));
      utimesSync(join(harness.dbDir, "daily.cvd"), staleSec, staleSec);
      writeFileSync(join(harness.dbDir, "daily.cld"), cvdHeader("27316"));
      utimesSync(join(harness.dbDir, "daily.cld"), staleSec, staleSec);
      setVerifiedMessage(
        harness,
        "daily.cvd database is up-to-date (version: 27315, sigs: 1000, f-level: 90, builder: raynman)",
      );
    });
    activeHarness = harness;

    const appeared = await waitUntil(
      () => hasPublishedMarker(harness, "27316", staleSec),
      5000,
    );
    expect(appeared).toBe(true);
    expect(readFileSync(harness.readyVersionFile, "utf8").trim()).toBe("27316");
    const markerMtimeSec = Math.floor(
      statSync(harness.readyMarker).mtimeMs / 1000,
    );
    // Must stay pinned to daily.cld's own stale mtime -- never advanced
    // to "now" by a confirmation that named a different file/version.
    expect(markerMtimeSec).toBe(staleSec);

    const maxAgeMs = 60 * 60 * 1000; // 1h, well under the 7h stale age
    expect(
      isMarkerFresh(
        statSync(harness.readyMarker).mtimeMs,
        Date.now(),
        maxAgeMs,
      ),
    ).toBe(false);
    const isReady = createIsReady({
      maxAgeMs,
      now: () => Date.now(),
      readMarkerMtimeMs: () => statSync(harness.readyMarker).mtimeMs,
      readExpectedVersion: () =>
        readFileSync(harness.readyVersionFile, "utf8").trim(),
      queryLoadedVersion: async () => "27316",
    });
    await expect(isReady()).resolves.toBe(false);
  }, 15000);
});

const CF134_ENTRYPOINT_BLOB = "1168cb5f7d8dd26aad2f82160dda804acbcbccca";
const CF134_ENTRYPOINT_SHA256 =
  "e75026eda1c994a652ef01688f0cb02e5b2733fde85099a37e80585ece4a4974";
const CF134_ENTRYPOINT_BYTES = 12536;

const CF134_TAIL_BLOCK = [
  "attempt=0",
  'while [ "$attempt" -lt 60 ]; do',
  "  if clamdscan --ping 1 --config-file=/etc/clamav/clamd.conf >/dev/null 2>&1; then",
  '    refresh_daily_readiness "$initial_freshclam_output" || echo "clamd is live but no signatures were found yet" >&2',
  "    break",
  "  fi",
  "  attempt=$((attempt + 1))",
  "  sleep 1",
  "done",
  "",
  "# A long-lived instance must never keep serving verdicts against",
  "# definitions that have gone stale (R8): this refreshes signatures on a",
  "# bounded interval and only republishes the readiness marker from the real",
  "# on-disk signature files (never on freshclam's exit status alone), so a",
  "# cooldown-faked success, a failed refresh, or an overdue refresh all leave",
  "# readiness to age out or be removed instead of silently continuing to scan.",
  "# clamd.conf's `SelfCheck` bound independently guards against freshclam's",
  "# update succeeding but its reload notification to clamd silently failing --",
  "# clamd reloads a genuinely changed database directory on its own within",
  "# that bound, well inside MAX_SIGNATURE_AGE_MS.",
  "(",
  '  while kill -0 "$CLAMD_PID" 2>/dev/null; do',
  '    sleep "$FRESHCLAM_INTERVAL_SECONDS"',
  "    if refresh_output=$(freshclam --stdout 2>&1); then",
  "      printf '%s\\n' \"$refresh_output\"",
  '      refresh_daily_readiness "$refresh_output" || true',
  "    else",
  "      printf '%s\\n' \"$refresh_output\"",
  '      echo "freshclam refresh failed; marking not ready" >&2',
  '      rm -f "$READY_MARKER" "$READY_VERSION_FILE"',
  "    fi",
  "  done",
  ") &",
  "WATCHDOG_PID=$!",
  "trap 'kill \"$WATCHDOG_PID\" 2>/dev/null || true' EXIT",
  "",
  'wait "$CLAMD_PID"',
  "",
].join("\n");

function materializeCf134Entrypoint(dir: string): string {
  let content: string | undefined;
  try {
    content = execFileSync("git", ["cat-file", "blob", CF134_ENTRYPOINT_BLOB], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    const candidateContent = readFileSync(DEFAULT_ENTRYPOINT, "utf8");
    const markerIndex = candidateContent.indexOf(
      "\nstartup_ready=0\nattempt=0\n",
    );
    if (markerIndex !== -1) {
      content = `${candidateContent.slice(0, markerIndex + 1)}${CF134_TAIL_BLOCK}`;
    } else {
      content = candidateContent;
    }
  }
  expect(Buffer.byteLength(content, "utf8")).toBe(CF134_ENTRYPOINT_BYTES);
  expect(createHash("sha256").update(content).digest("hex")).toBe(
    CF134_ENTRYPOINT_SHA256,
  );
  const scriptPath = join(dir, "cf134-clamd-entrypoint.sh");
  writeFileSync(scriptPath, content);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

interface TimingBoundaryResult {
  startupPingCalls: number;
  oneSecondSleepCalls: number;
  nextRequestedSleepSeconds: number | null;
  engineReady: boolean;
  readyMarkerExists: boolean;
  expectedVersion: string | null;
  markerMtimeSec: number | null;
  scriptAlive: boolean;
  externalBoundaryPingNowSucceeds: boolean;
}

async function runTimingBoundaryScenario(options: {
  scriptPath: string;
  readyAfterFailedPings: number | "immediately" | "never";
  observeNeverReadyOneSecondSleeps?: number;
  initialMode?: FreshclamMode;
  seedDatabase?: (dbDir: string) => void;
}): Promise<TimingBoundaryResult> {
  const dir = mkdtempSync(join(tmpdir(), "clamd-late-ready-boundary-"));
  const binDir = join(dir, "bin");
  const dbDir = join(dir, "db");
  const stateDir = join(dir, "state");
  const readyMarker = join(dir, "ready", "ready");
  const readyVersionFile = join(dir, "ready", "ready.version");
  mkdirSync(binDir);
  mkdirSync(dbDir);
  mkdirSync(stateDir);

  if (options.seedDatabase) {
    options.seedDatabase(dbDir);
  }

  if (options.readyAfterFailedPings === "immediately") {
    writeFileSync(join(stateDir, "engine_ready"), "");
  }

  const initialMode = options.initialMode ?? "verified";
  writeMock(
    join(binDir, "freshclam"),
    initialMode === "verified"
      ? [
          `if [ ! -f "$CLAMAV_DB_DIR/daily.cvd" ] && [ ! -f "$CLAMAV_DB_DIR/daily.cld" ]; then`,
          `  printf 'ClamAV-VDB:2026-10-21:27315:1:1:fixture:fixture:fixture:fixture\\n' > "$CLAMAV_DB_DIR/daily.cvd"`,
          `fi`,
          `printf 'daily.cvd database is up-to-date (version: 27315, sigs: 1, f-level: 1, builder: fixture)\\n'`,
        ].join("\n")
      : `exit 0`,
  );

  writeMock(
    join(binDir, "clamd"),
    `trap 'exit 0' TERM INT\nwhile true; do /bin/sleep 0.05; done`,
  );

  writeMock(
    join(binDir, "clamdscan"),
    [
      `n=0`,
      `[ ! -f "$DRTS_TIMING_STATE/ping_count" ] || n=$(cat "$DRTS_TIMING_STATE/ping_count")`,
      `n=$((n + 1))`,
      `printf '%s' "$n" > "$DRTS_TIMING_STATE/ping_count"`,
      `[ -f "$DRTS_TIMING_STATE/engine_ready" ]`,
    ].join("\n"),
  );

  const readyAfter =
    typeof options.readyAfterFailedPings === "number"
      ? String(options.readyAfterFailedPings)
      : "";
  const neverReadyCap = String(options.observeNeverReadyOneSecondSleeps ?? 65);

  writeMock(
    join(binDir, "sleep"),
    [
      `printf '%s\\n' "$1" >> "$DRTS_TIMING_STATE/sleeps"`,
      `if [ "$1" = "1" ]; then`,
      `  s=0`,
      `  [ ! -f "$DRTS_TIMING_STATE/one_sec_sleeps" ] || s=$(cat "$DRTS_TIMING_STATE/one_sec_sleeps")`,
      `  s=$((s + 1))`,
      `  printf '%s' "$s" > "$DRTS_TIMING_STATE/one_sec_sleeps"`,
      `  n=0`,
      `  [ ! -f "$DRTS_TIMING_STATE/ping_count" ] || n=$(cat "$DRTS_TIMING_STATE/ping_count")`,
      `  if [ -n "$DRTS_READY_AFTER_FAILED_PINGS" ] && [ "$n" -ge "$DRTS_READY_AFTER_FAILED_PINGS" ]; then`,
      `    : > "$DRTS_TIMING_STATE/engine_ready"`,
      `  fi`,
      `  if [ "$DRTS_NEVER_READY" = "1" ] && [ "$s" -ge "$DRTS_NEVER_READY_SLEEP_CAP" ]; then`,
      `    : > "$DRTS_TIMING_STATE/observed_never_ready_window"`,
      `    exec /bin/sleep 10`,
      `  fi`,
      `  exec /bin/sleep 0.001`,
      `else`,
      `  : > "$DRTS_TIMING_STATE/in_hourly_sleep"`,
      `  exec /bin/sleep 10`,
      `fi`,
    ].join("\n"),
  );

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    CLAMAV_READY_MARKER: readyMarker,
    CLAMAV_DB_DIR: dbDir,
    FRESHCLAM_INTERVAL_SECONDS: "3600",
    DRTS_TIMING_STATE: stateDir,
    DRTS_READY_AFTER_FAILED_PINGS: readyAfter,
    DRTS_NEVER_READY: options.readyAfterFailedPings === "never" ? "1" : "0",
    DRTS_NEVER_READY_SLEEP_CAP: neverReadyCap,
  };

  const child = spawn("sh", [options.scriptPath], {
    env,
    detached: true,
    stdio: "ignore",
  });

  try {
    const targetGateFile =
      options.readyAfterFailedPings === "never"
        ? join(stateDir, "observed_never_ready_window")
        : join(stateDir, "in_hourly_sleep");

    const settled = await waitUntil(() => existsSync(targetGateFile), 5000);
    expect(settled).toBe(true);

    const pingCountRaw = existsSync(join(stateDir, "ping_count"))
      ? readFileSync(join(stateDir, "ping_count"), "utf8").trim()
      : "0";
    const sleepsLines = existsSync(join(stateDir, "sleeps"))
      ? readFileSync(join(stateDir, "sleeps"), "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
      : [];
    const oneSecondSleepCalls = sleepsLines.filter((s) => s === "1").length;
    const nonOneSecSleeps = sleepsLines.filter((s) => s !== "1");
    const nextRequestedSleepSeconds =
      nonOneSecSleeps.length > 0 ? Number(nonOneSecSleeps[0]) : null;
    const engineReady = existsSync(join(stateDir, "engine_ready"));
    const readyMarkerExists = existsSync(readyMarker);
    const expectedVersion = existsSync(readyVersionFile)
      ? readFileSync(readyVersionFile, "utf8").trim()
      : null;
    const markerMtimeSec = readyMarkerExists
      ? Math.floor(statSync(readyMarker).mtimeMs / 1000)
      : null;

    let scriptAlive = false;
    if (child.pid) {
      try {
        process.kill(child.pid, 0);
        scriptAlive = true;
      } catch {
        scriptAlive = false;
      }
    }

    let externalBoundaryPingNowSucceeds = false;
    try {
      execFileSync(
        join(binDir, "clamdscan"),
        ["--ping", "1", "--config-file=/etc/clamav/clamd.conf"],
        {
          env: {
            ...env,
            DRTS_TIMING_STATE: join(dir, "external-probe-state"),
          },
          stdio: "ignore",
        },
      );
    } catch {
      // external probe uses its own counter dir while sharing engine_ready check:
    }
    externalBoundaryPingNowSucceeds = existsSync(
      join(stateDir, "engine_ready"),
    );

    return {
      startupPingCalls: Number(pingCountRaw),
      oneSecondSleepCalls,
      nextRequestedSleepSeconds,
      engineReady,
      readyMarkerExists,
      expectedVersion,
      markerMtimeSec,
      scriptAlive,
      externalBoundaryPingNowSucceeds,
    };
  } finally {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already exited
      }
    }
  }
}

describe("clamd-entrypoint.sh late-ready marker recovery after startup probe ceiling", () => {
  it("proves original cf134 entrypoint is red on the 60-failed-probes-then-ready boundary while the candidate entrypoint recovers green before the 3600s sleep", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "clamd-cf134-compare-"));
    const cf134ScriptPath = materializeCf134Entrypoint(tempDir);

    // Positive control on both scripts: immediate readiness publishes marker/version 27315.
    const cf134Immediate = await runTimingBoundaryScenario({
      scriptPath: cf134ScriptPath,
      readyAfterFailedPings: "immediately",
    });
    expect(cf134Immediate).toMatchObject({
      startupPingCalls: 1,
      oneSecondSleepCalls: 0,
      nextRequestedSleepSeconds: 3600,
      engineReady: true,
      readyMarkerExists: true,
      expectedVersion: "27315",
      scriptAlive: true,
      externalBoundaryPingNowSucceeds: true,
    });

    const candidateImmediate = await runTimingBoundaryScenario({
      scriptPath: ENTRYPOINT,
      readyAfterFailedPings: "immediately",
    });
    expect(candidateImmediate).toMatchObject({
      startupPingCalls: 1,
      oneSecondSleepCalls: 0,
      nextRequestedSleepSeconds: 3600,
      engineReady: true,
      readyMarkerExists: true,
      expectedVersion: "27315",
      scriptAlive: true,
      externalBoundaryPingNowSucceeds: true,
    });

    // Boundary case: 60 failed startup pings, engine becomes ready during the 60th sleep.
    // Original cf134 enters the 3600s sleep without re-probing or publishing the marker (RED).
    const cf134LateReady = await runTimingBoundaryScenario({
      scriptPath: cf134ScriptPath,
      readyAfterFailedPings: 60,
    });
    expect(cf134LateReady).toMatchObject({
      startupPingCalls: 60,
      oneSecondSleepCalls: 60,
      nextRequestedSleepSeconds: 3600,
      engineReady: true,
      readyMarkerExists: false,
      expectedVersion: null,
      scriptAlive: true,
      externalBoundaryPingNowSucceeds: true,
    });

    // Candidate probes at the 1s boundary after the 60th sleep, observes readiness on ping 61,
    // and publishes marker/version 27315 before entering the 3600s sleep (GREEN).
    const candidateLateReady = await runTimingBoundaryScenario({
      scriptPath: ENTRYPOINT,
      readyAfterFailedPings: 60,
    });
    expect(candidateLateReady).toMatchObject({
      startupPingCalls: 61,
      oneSecondSleepCalls: 60,
      nextRequestedSleepSeconds: 3600,
      engineReady: true,
      readyMarkerExists: true,
      expectedVersion: "27315",
      scriptAlive: true,
      externalBoundaryPingNowSucceeds: true,
    });
  }, 15000);

  it("recovers readiness on the 1-second probing cadence both within the initial 60-probe window and after multiple post-60 failed probes, preserving signature mtime provenance", async () => {
    // Ready within initial 60 probes (after 5 failed pings):
    const withinWindow = await runTimingBoundaryScenario({
      scriptPath: ENTRYPOINT,
      readyAfterFailedPings: 5,
    });
    expect(withinWindow).toMatchObject({
      startupPingCalls: 6,
      oneSecondSleepCalls: 5,
      nextRequestedSleepSeconds: 3600,
      engineReady: true,
      readyMarkerExists: true,
      expectedVersion: "27315",
    });

    // Ready well past the 60-probe ceiling (after 64 failed pings, i.e. 4 extra 1s recovery sleeps),
    // with unverified initial freshclam output so marker mtime must track the signature file's mtime:
    const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const pastCeiling = await runTimingBoundaryScenario({
      scriptPath: ENTRYPOINT,
      readyAfterFailedPings: 64,
      initialMode: "noop",
      seedDatabase: (dbDir) => {
        writeFileSync(join(dbDir, "daily.cvd"), cvdHeader("27315"));
        utimesSync(join(dbDir, "daily.cvd"), pastMtimeSec, pastMtimeSec);
      },
    });
    expect(pastCeiling).toMatchObject({
      startupPingCalls: 65,
      oneSecondSleepCalls: 64,
      nextRequestedSleepSeconds: 3600,
      engineReady: true,
      readyMarkerExists: true,
      expectedVersion: "27315",
      markerMtimeSec: pastMtimeSec,
    });
  }, 15000);

  it("never publishes a marker or enters fake readiness when clamd never answers ping across a bounded post-60 observation window", async () => {
    const neverReady = await runTimingBoundaryScenario({
      scriptPath: ENTRYPOINT,
      readyAfterFailedPings: "never",
      observeNeverReadyOneSecondSleeps: 65,
    });
    expect(neverReady).toMatchObject({
      startupPingCalls: 65,
      oneSecondSleepCalls: 65,
      nextRequestedSleepSeconds: null,
      engineReady: false,
      readyMarkerExists: false,
      expectedVersion: null,
      scriptAlive: true,
      externalBoundaryPingNowSucceeds: false,
    });
  }, 15000);

  it("continues periodic freshclam refresh on each configured interval even when clamd stays alive and ping never succeeds across virtual seconds 0..72", async () => {
    async function runNeverReadyPeriodicRefreshScenario(scriptPath: string) {
      const dir = mkdtempSync(
        join(tmpdir(), "clamd-never-ready-periodic-virtual-"),
      );
      const binDir = join(dir, "bin");
      const dbDir = join(dir, "db");
      const stateDir = join(dir, "state");
      const readyMarker = join(dir, "ready", "ready");
      mkdirSync(binDir);
      mkdirSync(dbDir);
      mkdirSync(stateDir);
      writeFileSync(join(stateDir, "virtual_seconds"), "0");

      writeMock(
        join(binDir, "freshclam"),
        [
          `n=0; [ ! -f "$DRTS_TIMING_STATE/freshclam_count" ] || n=$(cat "$DRTS_TIMING_STATE/freshclam_count")`,
          `n=$((n + 1)); printf '%s' "$n" > "$DRTS_TIMING_STATE/freshclam_count"`,
          `t=$(cat "$DRTS_TIMING_STATE/virtual_seconds"); printf '%s %s\\n' "$n" "$t" >> "$DRTS_TIMING_STATE/freshclam_events"`,
          `printf 'ClamAV-VDB:2026-10-21:27315:1:1:fixture:fixture:fixture:fixture\\n' > "$CLAMAV_DB_DIR/daily.cvd"`,
          `printf 'daily.cvd database is up-to-date (version: 27315, sigs: 1, f-level: 1, builder: fixture)\\n'`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "clamd"),
        `trap 'exit 0' TERM INT\nwhile true; do /bin/sleep 0.02; done`,
      );
      writeMock(
        join(binDir, "clamdscan"),
        [
          `n=0; [ ! -f "$DRTS_TIMING_STATE/ping_count" ] || n=$(cat "$DRTS_TIMING_STATE/ping_count")`,
          `n=$((n + 1)); printf '%s' "$n" > "$DRTS_TIMING_STATE/ping_count"`,
          `exit 1`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "sleep"),
        [
          `old=$(cat "$DRTS_TIMING_STATE/virtual_seconds")`,
          `new=$((old + $1))`,
          `printf '%s %s %s\\n' "$1" "$old" "$new" >> "$DRTS_TIMING_STATE/sleep_events"`,
          `printf '%s' "$new" > "$DRTS_TIMING_STATE/virtual_seconds"`,
          `if [ "$new" -ge 72 ]; then`,
          `  : > "$DRTS_TIMING_STATE/reached_poststartup_grace"`,
          `  while true; do /bin/sleep 0.02; done`,
          `fi`,
          `exec /bin/sleep 0.001`,
        ].join("\n"),
      );

      const child = spawn("sh", [scriptPath], {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          CLAMAV_READY_MARKER: readyMarker,
          CLAMAV_DB_DIR: dbDir,
          FRESHCLAM_INTERVAL_SECONDS: "2",
          DRTS_TIMING_STATE: stateDir,
        },
        detached: true,
        stdio: "ignore",
      });

      try {
        const checkpointReached = await waitUntil(
          () => existsSync(join(stateDir, "reached_poststartup_grace")),
          5000,
        );
        expect(checkpointReached).toBe(true);

        let scriptAlive = false;
        if (child.pid) {
          try {
            process.kill(child.pid, 0);
            scriptAlive = true;
          } catch {
            scriptAlive = false;
          }
        }

        const totalPingCalls = Number(
          readFileSync(join(stateDir, "ping_count"), "utf8").trim(),
        );
        const virtualSecondAtCheckpoint = Number(
          readFileSync(join(stateDir, "virtual_seconds"), "utf8").trim(),
        );
        const freshclamEvents = readFileSync(
          join(stateDir, "freshclam_events"),
          "utf8",
        )
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [invocation, virtualSecond] = line.trim().split(/\s+/);
            return {
              invocation: Number(invocation),
              virtual_second: Number(virtualSecond),
            };
          });

        return {
          checkpointReached,
          scriptAlive,
          totalPingCalls,
          virtualSecondAtCheckpoint,
          freshclamEvents,
        };
      } finally {
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            // already exited
          }
        }
      }
    }

    const tempDir = mkdtempSync(
      join(tmpdir(), "clamd-cf134-periodic-compare-"),
    );
    const cf134ScriptPath = materializeCf134Entrypoint(tempDir);

    const expectedFreshclamSchedule = [
      { invocation: 1, virtual_second: 0 },
      { invocation: 2, virtual_second: 62 },
      { invocation: 3, virtual_second: 64 },
      { invocation: 4, virtual_second: 66 },
      { invocation: 5, virtual_second: 68 },
      { invocation: 6, virtual_second: 70 },
    ];

    const cf134Result =
      await runNeverReadyPeriodicRefreshScenario(cf134ScriptPath);
    expect(cf134Result).toEqual({
      checkpointReached: true,
      scriptAlive: true,
      totalPingCalls: 60,
      virtualSecondAtCheckpoint: 72,
      freshclamEvents: expectedFreshclamSchedule,
    });

    const candidateResult =
      await runNeverReadyPeriodicRefreshScenario(ENTRYPOINT);
    expect(candidateResult).toEqual({
      checkpointReached: true,
      scriptAlive: true,
      totalPingCalls: 72,
      virtualSecondAtCheckpoint: 72,
      freshclamEvents: expectedFreshclamSchedule,
    });
  }, 15000);

  it("preserves subsequent periodic freshclam advance/fail refresh and corrupt-signature / loaded-version rejection after late-ready recovery", async () => {
    // 1. Corrupt signature file is still rejected even when late-ready ping succeeds after 60 failed probes:
    const corruptLateReady = await runTimingBoundaryScenario({
      scriptPath: ENTRYPOINT,
      readyAfterFailedPings: 60,
      initialMode: "noop",
      seedDatabase: (dbDir) => {
        writeFileSync(join(dbDir, "daily.cvd"), "not-a-valid-vdb-header\n");
      },
    });
    expect(corruptLateReady).toMatchObject({
      startupPingCalls: 61,
      oneSecondSleepCalls: 60,
      nextRequestedSleepSeconds: 3600,
      engineReady: true,
      readyMarkerExists: false,
      expectedVersion: null,
    });

    // 2. After late-ready recovery (60 failed pings), periodic freshclam advance and fail still work cleanly:
    const dir = mkdtempSync(join(tmpdir(), "clamd-late-ready-periodic-"));
    const binDir = join(dir, "bin");
    const dbDir = join(dir, "db");
    const stateDir = join(dir, "state");
    const readyMarker = join(dir, "ready", "ready");
    const readyVersionFile = join(dir, "ready", "ready.version");
    const modeFile = join(dir, "freshclam-mode");
    const logFile = join(dir, "freshclam.log");
    mkdirSync(binDir);
    mkdirSync(dbDir);
    mkdirSync(stateDir);

    const pastMtimeSec = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    writeFileSync(join(dbDir, "daily.cvd"), cvdHeader("27315"));
    utimesSync(join(dbDir, "daily.cvd"), pastMtimeSec, pastMtimeSec);
    writeFileSync(modeFile, "noop");
    writeFileSync(logFile, "");

    const nextSigFile = join(dir, "next-sig");
    writeFileSync(nextSigFile, cvdHeader("27316"));

    writeMock(
      join(binDir, "freshclam"),
      [
        `mode=$(cat "$FRESHCLAM_MODE_FILE" 2>/dev/null || echo noop)`,
        `echo "invoked mode=$mode" >> "$FRESHCLAM_LOG"`,
        `case "$mode" in`,
        `  advance) cat "$FRESHCLAM_NEXT_SIGNATURE_FILE" > "$CLAMAV_DB_DIR/daily.cvd"; exit 0 ;;`,
        `  fail) exit 1 ;;`,
        `  *) exit 0 ;;`,
        `esac`,
      ].join("\n"),
    );
    writeMock(
      join(binDir, "clamd"),
      `trap 'exit 0' TERM INT\nwhile true; do /bin/sleep 0.05; done`,
    );
    writeMock(
      join(binDir, "clamdscan"),
      [
        `n=0`,
        `[ ! -f "$DRTS_TIMING_STATE/ping_count" ] || n=$(cat "$DRTS_TIMING_STATE/ping_count")`,
        `n=$((n + 1))`,
        `printf '%s' "$n" > "$DRTS_TIMING_STATE/ping_count"`,
        `[ -f "$DRTS_TIMING_STATE/engine_ready" ]`,
      ].join("\n"),
    );
    writeMock(
      join(binDir, "sleep"),
      [
        `if [ "$1" = "1" ]; then`,
        `  n=0`,
        `  [ ! -f "$DRTS_TIMING_STATE/ping_count" ] || n=$(cat "$DRTS_TIMING_STATE/ping_count")`,
        `  [ "$n" -lt 60 ] || : > "$DRTS_TIMING_STATE/engine_ready"`,
        `  exec /bin/sleep 0.001`,
        `else`,
        `  exec /bin/sleep 0.15`,
        `fi`,
      ].join("\n"),
    );

    const child = spawn("sh", [ENTRYPOINT], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        CLAMAV_READY_MARKER: readyMarker,
        CLAMAV_DB_DIR: dbDir,
        FRESHCLAM_INTERVAL_SECONDS: "3600",
        FRESHCLAM_MODE_FILE: modeFile,
        FRESHCLAM_LOG: logFile,
        FRESHCLAM_NEXT_SIGNATURE_FILE: nextSigFile,
        DRTS_TIMING_STATE: stateDir,
      },
      detached: true,
      stdio: "ignore",
    });

    try {
      const recovered = await waitUntil(
        () =>
          hasPublishedMarker(
            { readyMarker, readyVersionFile },
            "27315",
            pastMtimeSec,
          ),
        5000,
      );
      expect(recovered).toBe(true);

      // Composed with readiness.ts: matching loaded version 27315 (with fresh bound) passes, mismatch 27314 fails.
      const isReadyMatching = createIsReady({
        maxAgeMs: 3 * 24 * 60 * 60 * 1000,
        now: () => Date.now(),
        readMarkerMtimeMs: () => statSync(readyMarker).mtimeMs,
        readExpectedVersion: () =>
          readFileSync(readyVersionFile, "utf8").trim(),
        queryLoadedVersion: async () => "27315",
      });
      await expect(isReadyMatching()).resolves.toBe(true);

      const isReadyMismatch = createIsReady({
        maxAgeMs: 3 * 24 * 60 * 60 * 1000,
        now: () => Date.now(),
        readMarkerMtimeMs: () => statSync(readyMarker).mtimeMs,
        readExpectedVersion: () =>
          readFileSync(readyVersionFile, "utf8").trim(),
        queryLoadedVersion: async () => "27314",
      });
      await expect(isReadyMismatch()).resolves.toBe(false);

      // Advance periodic freshclam refresh:
      writeFileSync(modeFile, "advance");
      const advanced = await waitUntil(
        () =>
          existsSync(readyVersionFile) &&
          readFileSync(readyVersionFile, "utf8").trim() === "27316" &&
          existsSync(readyMarker) &&
          Math.floor(statSync(readyMarker).mtimeMs / 1000) > pastMtimeSec,
        5000,
      );
      expect(advanced).toBe(true);

      // Fail periodic freshclam refresh:
      writeFileSync(modeFile, "fail");
      const removed = await waitUntil(
        () => !existsSync(readyMarker) && !existsSync(readyVersionFile),
        5000,
      );
      expect(removed).toBe(true);
    } finally {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          // already exited
        }
      }
    }
  }, 15000);

  it("exits cleanly and terminates watchdog/recovery background processes when clamd exits during late-ready recovery or after marker publication", async () => {
    for (const scenario of [
      "exit-during-late-recovery",
      "exit-after-late-ready",
    ] as const) {
      const dir = mkdtempSync(join(tmpdir(), `clamd-exit-${scenario}-`));
      const binDir = join(dir, "bin");
      const dbDir = join(dir, "db");
      const stateDir = join(dir, "state");
      const readyMarker = join(dir, "ready", "ready");
      mkdirSync(binDir);
      mkdirSync(dbDir);
      mkdirSync(stateDir);

      writeFileSync(join(dbDir, "daily.cvd"), cvdHeader("27315"));
      writeMock(join(binDir, "freshclam"), `exit 0`);
      writeMock(
        join(binDir, "clamd"),
        [
          `trap 'exit 0' TERM INT`,
          `while [ ! -f "$DRTS_TIMING_STATE/stop_clamd" ]; do /bin/sleep 0.02; done`,
          `exit 0`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "clamdscan"),
        [
          `n=0`,
          `[ ! -f "$DRTS_TIMING_STATE/ping_count" ] || n=$(cat "$DRTS_TIMING_STATE/ping_count")`,
          `n=$((n + 1))`,
          `printf '%s' "$n" > "$DRTS_TIMING_STATE/ping_count"`,
          `[ -f "$DRTS_TIMING_STATE/engine_ready" ]`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "sleep"),
        [
          `if [ "$1" = "1" ]; then`,
          `  n=0`,
          `  [ ! -f "$DRTS_TIMING_STATE/ping_count" ] || n=$(cat "$DRTS_TIMING_STATE/ping_count")`,
          scenario === "exit-after-late-ready"
            ? `  [ "$n" -lt 60 ] || : > "$DRTS_TIMING_STATE/engine_ready"\n  exec /bin/sleep 0.001`
            : `  if [ "$n" -ge 63 ]; then : > "$DRTS_TIMING_STATE/in_late_recovery"; /bin/sleep 5; exit 0; fi\n  exec /bin/sleep 0.001`,
          `else`,
          `  : > "$DRTS_TIMING_STATE/in_hourly_sleep"`,
          `  /bin/sleep 5`,
          `fi`,
        ].join("\n"),
      );

      const child = spawn("sh", [ENTRYPOINT], {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          CLAMAV_READY_MARKER: readyMarker,
          CLAMAV_DB_DIR: dbDir,
          FRESHCLAM_INTERVAL_SECONDS: "3600",
          DRTS_TIMING_STATE: stateDir,
        },
        detached: true,
        stdio: "ignore",
      });

      let childExited = false;
      child.on("exit", () => {
        childExited = true;
      });

      try {
        const triggerFile =
          scenario === "exit-after-late-ready"
            ? join(stateDir, "in_hourly_sleep")
            : join(stateDir, "in_late_recovery");
        const reached = await waitUntil(() => existsSync(triggerFile), 5000);
        expect(reached).toBe(true);

        if (scenario === "exit-after-late-ready") {
          expect(existsSync(readyMarker)).toBe(true);
        } else {
          expect(existsSync(readyMarker)).toBe(false);
        }

        // Let clamd exit on its own (not via process group kill) and verify the entrypoint
        // and all background watchdog/sleep children exit cleanly.
        writeFileSync(join(stateDir, "stop_clamd"), "1");
        const exited = await waitUntil(() => childExited, 5000);
        expect(exited).toBe(true);

        const groupEmpty = await waitUntil(() => {
          if (!child.pid) return true;
          try {
            process.kill(-child.pid, 0);
            return false;
          } catch {
            return true;
          }
        }, 2000);
        expect(groupEmpty).toBe(true);
      } finally {
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            // already exited
          }
        }
      }
    }
  }, 15000);

  const CANDIDATE_760260_BLOB = "0ec2e3de12c1bd95c8e0c2197d07a37dff65fc50";
  const CANDIDATE_760260_SHA256 =
    "a19ddaf16cc99aec92621254cba8c36f0be3e968e123c843cf98e1af38192d85";
  const CANDIDATE_760260_BYTES = 14210;

  const CANDIDATE_760260_TAIL_BLOCK = [
    "startup_ready=0",
    "attempt=0",
    'while [ "$attempt" -lt 60 ]; do',
    "  if clamdscan --ping 1 --config-file=/etc/clamav/clamd.conf >/dev/null 2>&1; then",
    '    refresh_daily_readiness "$initial_freshclam_output" || echo "clamd is live but no signatures were found yet" >&2',
    "    startup_ready=1",
    "    break",
    "  fi",
    "  attempt=$((attempt + 1))",
    "  sleep 1",
    "done",
    "",
    "# A long-lived instance must never keep serving verdicts against",
    "# definitions that have gone stale (R8): this refreshes signatures on a",
    "# bounded interval and only republishes the readiness marker from the real",
    "# on-disk signature files (never on freshclam's exit status alone), so a",
    "# cooldown-faked success, a failed refresh, or an overdue refresh all leave",
    "# readiness to age out or be removed instead of silently continuing to scan.",
    "# clamd.conf's `SelfCheck` bound independently guards against freshclam's",
    "# update succeeding but its reload notification to clamd silently failing --",
    "# clamd reloads a genuinely changed database directory on its own within",
    "# that bound, well inside MAX_SIGNATURE_AGE_MS.",
    "#",
    "# If the initial 60-probe window exhausted while clamd is still alive and",
    "# finishing a slow cold-start signature load, continue 1-second readiness",
    "# probing until clamd answers a live ping and initial readiness is published,",
    "# while still running the periodic freshclam refresh on each configured",
    "# FRESHCLAM_INTERVAL_SECONDS boundary without waiting for ping readiness.",
    "run_periodic_freshclam_refresh() {",
    "  if refresh_output=$(freshclam --stdout 2>&1); then",
    "    printf '%s\\n' \"$refresh_output\"",
    '    initial_freshclam_output="$refresh_output"',
    "    last_freshclam_ok=1",
    '    refresh_daily_readiness "$refresh_output" || true',
    "  else",
    "    printf '%s\\n' \"$refresh_output\"",
    "    last_freshclam_ok=0",
    '    echo "freshclam refresh failed; marking not ready" >&2',
    '    rm -f "$READY_MARKER" "$READY_VERSION_FILE"',
    "  fi",
    "}",
    "",
    "(",
    '  SLEEP_PID=""',
    "  last_freshclam_ok=1",
    "  refresh_elapsed=0",
    '  trap \'if [ -n "$SLEEP_PID" ]; then pkill -P "$SLEEP_PID" 2>/dev/null || true; kill "$SLEEP_PID" 2>/dev/null || true; fi; exit 0\' TERM INT',
    '  while [ "$startup_ready" -ne 1 ] && kill -0 "$CLAMD_PID" 2>/dev/null; do',
    "    if clamdscan --ping 1 --config-file=/etc/clamav/clamd.conf >/dev/null 2>&1; then",
    '      if [ "$last_freshclam_ok" -eq 1 ]; then',
    '        refresh_daily_readiness "$initial_freshclam_output" || echo "clamd is live but no signatures were found yet" >&2',
    "      fi",
    "      startup_ready=1",
    "      break",
    "    fi",
    '    kill -0 "$CLAMD_PID" 2>/dev/null || break',
    "    sleep 1 &",
    "    SLEEP_PID=$!",
    '    wait "$SLEEP_PID" 2>/dev/null || true',
    '    SLEEP_PID=""',
    '    kill -0 "$CLAMD_PID" 2>/dev/null || break',
    "    refresh_elapsed=$((refresh_elapsed + 1))",
    '    if [ "$refresh_elapsed" -ge "$FRESHCLAM_INTERVAL_SECONDS" ]; then',
    "      refresh_elapsed=0",
    "      run_periodic_freshclam_refresh",
    "    fi",
    "  done",
    '  while kill -0 "$CLAMD_PID" 2>/dev/null; do',
    '    sleep "$FRESHCLAM_INTERVAL_SECONDS" &',
    "    SLEEP_PID=$!",
    '    wait "$SLEEP_PID" 2>/dev/null || true',
    '    SLEEP_PID=""',
    '    kill -0 "$CLAMD_PID" 2>/dev/null || break',
    "    run_periodic_freshclam_refresh",
    "  done",
    ") &",
    "WATCHDOG_PID=$!",
    'trap \'kill "$WATCHDOG_PID" 2>/dev/null || true; wait "$WATCHDOG_PID" 2>/dev/null || true\' EXIT',
    "",
    'wait "$CLAMD_PID"',
    "",
  ].join("\n");

  function materialize760260Entrypoint(dir: string): string {
    const candidateContent = readFileSync(DEFAULT_ENTRYPOINT, "utf8");
    const markerIndex = candidateContent.indexOf(
      "\nstartup_ready=0\nattempt=0\n",
    );
    const reconstructed =
      markerIndex !== -1
        ? `${candidateContent.slice(0, markerIndex + 1)}${CANDIDATE_760260_TAIL_BLOCK}`
        : candidateContent;
    expect(Buffer.byteLength(reconstructed, "utf8")).toBe(
      CANDIDATE_760260_BYTES,
    );
    expect(createHash("sha256").update(reconstructed).digest("hex")).toBe(
      CANDIDATE_760260_SHA256,
    );
    let content = reconstructed;
    try {
      content = execFileSync(
        "git",
        ["cat-file", "blob", CANDIDATE_760260_BLOB],
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
    } catch {
      content = reconstructed;
    }
    expect(Buffer.byteLength(content, "utf8")).toBe(CANDIDATE_760260_BYTES);
    expect(createHash("sha256").update(content).digest("hex")).toBe(
      CANDIDATE_760260_SHA256,
    );
    const scriptPath = join(dir, "760260-clamd-entrypoint.sh");
    writeFileSync(scriptPath, content);
    chmodSync(scriptPath, 0o755);
    return scriptPath;
  }

  it("proves 760260 is red by falsely publishing marker/version on periodic freshclam refresh when clamd never answers ping across virtual seconds 0..72 while the candidate keeps periodic refresh running without publishing marker or version (N1)", async () => {
    async function runNeverReadyMarkerScenario(scriptPath: string) {
      const dir = mkdtempSync(join(tmpdir(), "clamd-n1-never-ready-marker-"));
      const binDir = join(dir, "bin");
      const dbDir = join(dir, "db");
      const stateDir = join(dir, "state");
      const readyMarker = join(dir, "ready", "ready");
      const readyVersionFile = `${readyMarker}.version`;
      mkdirSync(binDir);
      mkdirSync(dbDir);
      mkdirSync(stateDir);
      writeFileSync(join(stateDir, "virtual_seconds"), "0");

      writeMock(
        join(binDir, "freshclam"),
        [
          `n=0; [ ! -f "$DRTS_TIMING_STATE/freshclam_count" ] || n=$(cat "$DRTS_TIMING_STATE/freshclam_count")`,
          `n=$((n + 1)); printf '%s' "$n" > "$DRTS_TIMING_STATE/freshclam_count"`,
          `t=$(cat "$DRTS_TIMING_STATE/virtual_seconds"); printf '%s %s\\n' "$n" "$t" >> "$DRTS_TIMING_STATE/freshclam_events"`,
          `printf 'ClamAV-VDB:2026-10-21:27315:1:1:fixture:fixture:fixture:fixture\\n' > "$CLAMAV_DB_DIR/daily.cvd"`,
          `printf 'daily.cvd database is up-to-date (version: 27315, sigs: 1, f-level: 1, builder: fixture)\\n'`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "clamd"),
        `trap 'exit 0' TERM INT\nwhile true; do /bin/sleep 0.02; done`,
      );
      writeMock(
        join(binDir, "clamdscan"),
        [
          `n=0; [ ! -f "$DRTS_TIMING_STATE/ping_count" ] || n=$(cat "$DRTS_TIMING_STATE/ping_count")`,
          `n=$((n + 1)); printf '%s' "$n" > "$DRTS_TIMING_STATE/ping_count"`,
          `exit 1`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "sleep"),
        [
          `old=$(cat "$DRTS_TIMING_STATE/virtual_seconds")`,
          `new=$((old + $1))`,
          `printf '%s %s %s\\n' "$1" "$old" "$new" >> "$DRTS_TIMING_STATE/sleep_events"`,
          `printf '%s' "$new" > "$DRTS_TIMING_STATE/virtual_seconds"`,
          `if [ "$new" -ge 72 ]; then`,
          `  : > "$DRTS_TIMING_STATE/reached_poststartup_grace"`,
          `  while true; do /bin/sleep 0.02; done`,
          `fi`,
          `exec /bin/sleep 0.001`,
        ].join("\n"),
      );

      const child = spawn("sh", [scriptPath], {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          CLAMAV_READY_MARKER: readyMarker,
          CLAMAV_READY_VERSION_FILE: readyVersionFile,
          CLAMAV_DB_DIR: dbDir,
          FRESHCLAM_INTERVAL_SECONDS: "2",
          DRTS_TIMING_STATE: stateDir,
        },
        detached: true,
        stdio: "ignore",
      });

      try {
        const checkpointReached = await waitUntil(
          () => existsSync(join(stateDir, "reached_poststartup_grace")),
          5000,
        );
        expect(checkpointReached).toBe(true);

        const freshclamEvents = readFileSync(
          join(stateDir, "freshclam_events"),
          "utf8",
        )
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [invocation, virtualSecond] = line.trim().split(/\s+/);
            return {
              invocation: Number(invocation),
              virtual_second: Number(virtualSecond),
            };
          });

        return {
          totalFailedPings: Number(
            readFileSync(join(stateDir, "ping_count"), "utf8").trim(),
          ),
          virtualSecond: Number(
            readFileSync(join(stateDir, "virtual_seconds"), "utf8").trim(),
          ),
          freshclamEvents,
          readyMarkerExists: existsSync(readyMarker),
          expectedVersionFileExists: existsSync(readyVersionFile),
          expectedVersion: existsSync(readyVersionFile)
            ? readFileSync(readyVersionFile, "utf8").trim()
            : null,
        };
      } finally {
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            // already exited
          }
        }
      }
    }

    const tempDir = mkdtempSync(join(tmpdir(), "clamd-n1-760260-compare-"));
    const script760260 = materialize760260Entrypoint(tempDir);

    const expectedFreshclamSchedule = [
      { invocation: 1, virtual_second: 0 },
      { invocation: 2, virtual_second: 62 },
      { invocation: 3, virtual_second: 64 },
      { invocation: 4, virtual_second: 66 },
      { invocation: 5, virtual_second: 68 },
      { invocation: 6, virtual_second: 70 },
    ];

    // 760260 is RED on N1: it falsely publishes the ready marker and version 27315
    // on periodic freshclam refresh even though all 72 clamdscan --ping calls failed.
    const result760260 = await runNeverReadyMarkerScenario(script760260);
    expect(result760260).toEqual({
      totalFailedPings: 72,
      virtualSecond: 72,
      freshclamEvents: expectedFreshclamSchedule,
      readyMarkerExists: true,
      expectedVersionFileExists: true,
      expectedVersion: "27315",
    });

    // Candidate is GREEN on N1: periodic freshclam refresh still runs on schedule,
    // all 72 pings are attempted, and neither marker nor version file is ever published.
    const candidateResult = await runNeverReadyMarkerScenario(ENTRYPOINT);
    expect(candidateResult).toEqual({
      totalFailedPings: 72,
      virtualSecond: 72,
      freshclamEvents: expectedFreshclamSchedule,
      readyMarkerExists: false,
      expectedVersionFileExists: false,
      expectedVersion: null,
    });
  }, 15000);

  it("proves 760260 is red when a pending periodic freshclam refresh blocks 1-second late-ready probing and marker recovery while the candidate recovers readiness during the pending refresh and completes the refresh cleanly upon release (N2)", async () => {
    async function runPendingRefreshLateReadyScenario(
      scriptPath: string,
      releaseVersion = "27315",
    ) {
      const dir = mkdtempSync(join(tmpdir(), "clamd-n2-pending-refresh-"));
      const binDir = join(dir, "bin");
      const dbDir = join(dir, "db");
      const stateDir = join(dir, "state");
      const readyMarker = join(dir, "ready", "ready");
      const readyVersionFile = `${readyMarker}.version`;
      mkdirSync(binDir);
      mkdirSync(dbDir);
      mkdirSync(stateDir);
      writeFileSync(join(stateDir, "virtual_seconds"), "0");

      writeMock(
        join(binDir, "freshclam"),
        [
          `n=0; [ ! -f "$STATE/freshclam_count" ] || n=$(cat "$STATE/freshclam_count")`,
          `n=$((n + 1)); printf '%s' "$n" > "$STATE/freshclam_count"`,
          `printf 'ClamAV-VDB:2026-10-21:27315:1:1:fixture:fixture:fixture:fixture\\n' > "$CLAMAV_DB_DIR/daily.cvd"`,
          `if [ "$n" -eq 2 ]; then`,
          `  : > "$STATE/engine_ready"`,
          `  : > "$STATE/second_refresh_pending"`,
          `  while [ ! -f "$STATE/release_refresh" ]; do /bin/sleep 0.01; done`,
          `  printf 'ClamAV-VDB:2026-10-21:${releaseVersion}:1:1:fixture:fixture:fixture:fixture\\n' > "$CLAMAV_DB_DIR/daily.cvd"`,
          `  printf 'daily.cvd database is up-to-date (version: ${releaseVersion}, sigs: 1, f-level: 1, builder: fixture)\\n'`,
          `  exit 0`,
          `fi`,
          `printf 'daily.cvd database is up-to-date (version: 27315, sigs: 1, f-level: 1, builder: fixture)\\n'`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "clamd"),
        `trap 'exit 0' TERM INT\nwhile true; do /bin/sleep 0.02; done`,
      );
      writeMock(
        join(binDir, "clamdscan"),
        [
          `n=0; [ ! -f "$STATE/ping_count" ] || n=$(cat "$STATE/ping_count")`,
          `n=$((n + 1)); printf '%s' "$n" > "$STATE/ping_count"`,
          `[ -f "$STATE/engine_ready" ]`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "sleep"),
        [
          `old=$(cat "$STATE/virtual_seconds"); new=$((old + $1)); printf '%s' "$new" > "$STATE/virtual_seconds"`,
          `if [ "$1" != 1 ]; then : > "$STATE/entered_regular_periodic_wait"; while true; do /bin/sleep 0.02; done; fi`,
          `exec /bin/sleep 0.001`,
        ].join("\n"),
      );

      const child = spawn("sh", [scriptPath], {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          CLAMAV_DB_DIR: dbDir,
          CLAMAV_READY_MARKER: readyMarker,
          CLAMAV_READY_VERSION_FILE: readyVersionFile,
          FRESHCLAM_INTERVAL_SECONDS: "2",
          STATE: stateDir,
        },
        detached: true,
        stdio: "ignore",
      });

      try {
        const pendingReached = await waitUntil(
          () => existsSync(join(stateDir, "second_refresh_pending")),
          5000,
        );
        expect(pendingReached).toBe(true);

        const pingCountBefore = Number(
          readFileSync(join(stateDir, "ping_count"), "utf8").trim(),
        );
        await wait(1200);
        const pingCountAfter = Number(
          readFileSync(join(stateDir, "ping_count"), "utf8").trim(),
        );
        const whilePending = {
          enginePingReady: existsSync(join(stateDir, "engine_ready")),
          freshclamCall2Pending: !existsSync(join(stateDir, "release_refresh")),
          pingCountBefore,
          pingCountAfter,
          newPingCalls: pingCountAfter - pingCountBefore,
          readyMarkerExists: existsSync(readyMarker),
          expectedVersion: existsSync(readyVersionFile)
            ? readFileSync(readyVersionFile, "utf8").trim()
            : null,
        };

        writeFileSync(join(stateDir, "release_refresh"), "1");
        const resumed = await waitUntil(
          () => existsSync(join(stateDir, "entered_regular_periodic_wait")),
          5000,
        );
        expect(resumed).toBe(true);

        const afterRelease = {
          pingCount: Number(
            readFileSync(join(stateDir, "ping_count"), "utf8").trim(),
          ),
          freshclamCount: Number(
            readFileSync(join(stateDir, "freshclam_count"), "utf8").trim(),
          ),
          readyMarkerExists: existsSync(readyMarker),
          expectedVersion: existsSync(readyVersionFile)
            ? readFileSync(readyVersionFile, "utf8").trim()
            : null,
        };

        return { whilePending, afterRelease };
      } finally {
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            // already exited
          }
        }
      }
    }

    const tempDir = mkdtempSync(join(tmpdir(), "clamd-n2-760260-compare-"));
    const script760260 = materialize760260Entrypoint(tempDir);

    // 760260 is RED on N2: while periodic freshclam call #2 is pending and the engine
    // is already ping-ready, synchronous refresh blocks 1s probing (newPingCalls: 0, readyMarkerExists: false).
    const result760260 = await runPendingRefreshLateReadyScenario(script760260);
    expect(result760260.whilePending).toEqual({
      enginePingReady: true,
      freshclamCall2Pending: true,
      pingCountBefore: 62,
      pingCountAfter: 62,
      newPingCalls: 0,
      readyMarkerExists: false,
      expectedVersion: null,
    });
    expect(result760260.afterRelease).toEqual({
      pingCount: 63,
      freshclamCount: 2,
      readyMarkerExists: true,
      expectedVersion: "27315",
    });

    // Candidate is GREEN on N2: while periodic freshclam call #2 is still pending,
    // 1-second readiness probing advances ping_count from 62 to 63 and publishes marker/version 27315;
    // after release, freshclam call #2 finishes cleanly without duplicate invocations.
    const candidateResult =
      await runPendingRefreshLateReadyScenario(ENTRYPOINT);
    expect(candidateResult.whilePending).toEqual({
      enginePingReady: true,
      freshclamCall2Pending: true,
      pingCountBefore: 62,
      pingCountAfter: 63,
      newPingCalls: 1,
      readyMarkerExists: true,
      expectedVersion: "27315",
    });
    expect(candidateResult.afterRelease).toEqual({
      pingCount: 63,
      freshclamCount: 2,
      readyMarkerExists: true,
      expectedVersion: "27315",
    });

    // Also verify that if the pending periodic refresh writes an updated daily database (27316)
    // upon release, the candidate publishes 27315 during the pending window and then cleanly
    // advances to 27316 on release without duplicate freshclam runs or stale-state overwrite:
    const candidateAdvanceOnRelease = await runPendingRefreshLateReadyScenario(
      ENTRYPOINT,
      "27316",
    );
    expect(candidateAdvanceOnRelease.whilePending).toEqual({
      enginePingReady: true,
      freshclamCall2Pending: true,
      pingCountBefore: 62,
      pingCountAfter: 63,
      newPingCalls: 1,
      readyMarkerExists: true,
      expectedVersion: "27315",
    });
    expect(candidateAdvanceOnRelease.afterRelease).toEqual({
      pingCount: 63,
      freshclamCount: 2,
      readyMarkerExists: true,
      expectedVersion: "27316",
    });
  }, 15000);

  it("proves 760260 is red when clamd exits or entrypoint receives SIGTERM while periodic freshclam is pending whereas the candidate exits within the 5s shutdown window without waiting for refresh release and leaves no background processes (N3)", async () => {
    async function runEngineExitDuringPendingRefreshScenario(
      scriptPath: string,
      observeShutdownWindowMs: number,
    ) {
      const dir = mkdtempSync(join(tmpdir(), "clamd-n3-exit-pending-refresh-"));
      const binDir = join(dir, "bin");
      const dbDir = join(dir, "db");
      const stateDir = join(dir, "state");
      const readyMarker = join(dir, "ready", "ready");
      const readyVersionFile = `${readyMarker}.version`;
      mkdirSync(binDir);
      mkdirSync(dbDir);
      mkdirSync(stateDir);
      writeFileSync(join(stateDir, "virtual_seconds"), "0");

      writeMock(
        join(binDir, "freshclam"),
        [
          `n=0; [ ! -f "$STATE/freshclam_count" ] || n=$(cat "$STATE/freshclam_count")`,
          `n=$((n + 1)); printf '%s' "$n" > "$STATE/freshclam_count"`,
          `printf 'ClamAV-VDB:2026-10-21:27315:1:1:fixture:fixture:fixture:fixture\\n' > "$CLAMAV_DB_DIR/daily.cvd"`,
          `if [ "$n" -eq 2 ]; then`,
          `  : > "$STATE/engine_ready"`,
          `  : > "$STATE/second_refresh_pending"`,
          `  while [ ! -f "$STATE/release_refresh" ]; do /bin/sleep 0.01; done`,
          `fi`,
          `printf 'daily.cvd database is up-to-date (version: 27315, sigs: 1, f-level: 1, builder: fixture)\\n'`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "clamd"),
        [
          `trap 'exit 0' TERM INT`,
          `while [ ! -f "$STATE/stop_clamd" ]; do /bin/sleep 0.02; done`,
          `: > "$STATE/clamd_exited"`,
          `exit 0`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "clamdscan"),
        [
          `n=0; [ ! -f "$STATE/ping_count" ] || n=$(cat "$STATE/ping_count")`,
          `n=$((n + 1)); printf '%s' "$n" > "$STATE/ping_count"`,
          `[ -f "$STATE/engine_ready" ]`,
        ].join("\n"),
      );
      writeMock(
        join(binDir, "sleep"),
        [
          `old=$(cat "$STATE/virtual_seconds"); new=$((old + $1)); printf '%s' "$new" > "$STATE/virtual_seconds"`,
          `if [ "$1" != 1 ]; then : > "$STATE/entered_regular_periodic_wait"; while true; do /bin/sleep 0.02; done; fi`,
          `exec /bin/sleep 0.001`,
        ].join("\n"),
      );

      const child = spawn("sh", [scriptPath], {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          CLAMAV_DB_DIR: dbDir,
          CLAMAV_READY_MARKER: readyMarker,
          CLAMAV_READY_VERSION_FILE: readyVersionFile,
          FRESHCLAM_INTERVAL_SECONDS: "2",
          STATE: stateDir,
        },
        detached: true,
        stdio: "ignore",
      });

      let childExited = false;
      child.on("exit", () => {
        childExited = true;
      });

      try {
        const pendingReached = await waitUntil(
          () => existsSync(join(stateDir, "second_refresh_pending")),
          5000,
        );
        expect(pendingReached).toBe(true);

        writeFileSync(join(stateDir, "stop_clamd"), "1");
        const clamdExited = await waitUntil(
          () => existsSync(join(stateDir, "clamd_exited")),
          2000,
        );
        expect(clamdExited).toBe(true);

        const exitedWithoutRelease = await waitUntil(
          () => childExited,
          observeShutdownWindowMs,
        );
        const externalRefreshStillPending = !existsSync(
          join(stateDir, "release_refresh"),
        );

        let exitedAfterRelease = exitedWithoutRelease;
        if (!exitedWithoutRelease) {
          writeFileSync(join(stateDir, "release_refresh"), "1");
          exitedAfterRelease = await waitUntil(() => childExited, 5000);
        }

        const groupEmpty = await waitUntil(() => {
          if (!child.pid) return true;
          try {
            process.kill(-child.pid, 0);
            return false;
          } catch {
            return true;
          }
        }, 2000);

        return {
          clamdOwnExitCompleted: clamdExited,
          entrypointExitedWithoutRelease: exitedWithoutRelease,
          externalRefreshStillPending,
          entrypointExitedAfterRelease: exitedAfterRelease,
          groupEmpty,
        };
      } finally {
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            // already exited
          }
        }
      }
    }

    const tempDir = mkdtempSync(join(tmpdir(), "clamd-n3-760260-compare-"));
    const script760260 = materialize760260Entrypoint(tempDir);

    // 760260 is RED on N3: when clamd exits on its own while periodic freshclam call #2
    // is pending, the entrypoint remains blocked in `wait "$WATCHDOG_PID"` across the
    // 5-second shutdown window until the external freshclam barrier is released.
    const result760260 = await runEngineExitDuringPendingRefreshScenario(
      script760260,
      5000,
    );
    expect(result760260).toEqual({
      clamdOwnExitCompleted: true,
      entrypointExitedWithoutRelease: false,
      externalRefreshStillPending: true,
      entrypointExitedAfterRelease: true,
      groupEmpty: true,
    });

    // Candidate is GREEN on N3: when clamd exits on its own while periodic freshclam call #2
    // is pending, the entrypoint terminates its watchdog and in-flight freshclam/sleep children
    // and exits within the 5-second shutdown window without waiting for release_refresh.
    const candidateResult = await runEngineExitDuringPendingRefreshScenario(
      ENTRYPOINT,
      5000,
    );
    expect(candidateResult).toEqual({
      clamdOwnExitCompleted: true,
      entrypointExitedWithoutRelease: true,
      externalRefreshStillPending: true,
      entrypointExitedAfterRelease: true,
      groupEmpty: true,
    });

    // Also verify direct SIGTERM to the candidate entrypoint PID while periodic freshclam is pending:
    const dir = mkdtempSync(join(tmpdir(), "clamd-n3-direct-sigterm-"));
    const binDir = join(dir, "bin");
    const dbDir = join(dir, "db");
    const stateDir = join(dir, "state");
    const readyMarker = join(dir, "ready", "ready");
    mkdirSync(binDir);
    mkdirSync(dbDir);
    mkdirSync(stateDir);
    writeFileSync(join(stateDir, "virtual_seconds"), "0");

    writeMock(
      join(binDir, "freshclam"),
      [
        `n=0; [ ! -f "$STATE/freshclam_count" ] || n=$(cat "$STATE/freshclam_count")`,
        `n=$((n + 1)); printf '%s' "$n" > "$STATE/freshclam_count"`,
        `printf 'ClamAV-VDB:2026-10-21:27315:1:1:fixture:fixture:fixture:fixture\\n' > "$CLAMAV_DB_DIR/daily.cvd"`,
        `if [ "$n" -eq 2 ]; then`,
        `  : > "$STATE/second_refresh_pending"`,
        `  while [ ! -f "$STATE/release_refresh" ]; do /bin/sleep 0.01; done`,
        `fi`,
        `printf 'daily.cvd database is up-to-date (version: 27315, sigs: 1, f-level: 1, builder: fixture)\\n'`,
      ].join("\n"),
    );
    writeMock(
      join(binDir, "clamd"),
      `trap 'exit 0' TERM INT\nwhile true; do /bin/sleep 0.02; done`,
    );
    writeMock(join(binDir, "clamdscan"), `exit 1`);
    writeMock(
      join(binDir, "sleep"),
      [
        `old=$(cat "$STATE/virtual_seconds"); new=$((old + $1)); printf '%s' "$new" > "$STATE/virtual_seconds"`,
        `if [ "$new" -gt 62 ]; then /bin/sleep 5; exit 0; fi`,
        `exec /bin/sleep 0.001`,
      ].join("\n"),
    );

    const child = spawn("sh", [ENTRYPOINT], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        CLAMAV_DB_DIR: dbDir,
        CLAMAV_READY_MARKER: readyMarker,
        FRESHCLAM_INTERVAL_SECONDS: "2",
        STATE: stateDir,
      },
      detached: true,
      stdio: "ignore",
    });

    let directTermExited = false;
    child.on("exit", () => {
      directTermExited = true;
    });

    try {
      const pendingReached = await waitUntil(
        () => existsSync(join(stateDir, "second_refresh_pending")),
        5000,
      );
      expect(pendingReached).toBe(true);
      expect(child.pid).toBeDefined();
      process.kill(child.pid!, "SIGTERM");

      const exited = await waitUntil(() => directTermExited, 5000);
      expect(exited).toBe(true);

      const groupEmpty = await waitUntil(() => {
        if (!child.pid) return true;
        try {
          process.kill(-child.pid, 0);
          return false;
        } catch {
          return true;
        }
      }, 2000);
      expect(groupEmpty).toBe(true);
    } finally {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          // already exited
        }
      }
    }
  }, 15000);
});
