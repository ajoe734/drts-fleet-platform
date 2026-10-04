/**
 * A readiness marker that merely exists is not sufficient: clamd's
 * signatures go stale over time, and an engine that failed (or never ran)
 * its periodic freshclam refresh must never keep reporting ready just
 * because the sidecar process is still up. `clamd-entrypoint.sh` publishes
 * this marker's mtime from the real, on-disk signature database file's own
 * mtime -- never from wall-clock "now" and never merely from freshclam's
 * exit code -- so a freshclam call that reports success without genuinely
 * updating any database file (e.g. ClamAV's own remembered rate-limit
 * cooldown) leaves this age check unmoved instead of renewing it (R8,
 * round 2). This pure age check is what turns either an overdue refresh or
 * an unverified one into a real "not ready" instead of a permanently-clean
 * illusion.
 */
export function isMarkerFresh(
  mtimeMs: number,
  nowMs: number,
  maxAgeMs: number,
): boolean {
  return nowMs - mtimeMs <= maxAgeMs;
}

/**
 * A fresh on-disk signature file is still not proof that the RUNNING
 * clamd engine has actually loaded it (R8, round 3): clamd retains its
 * previous engine on a failed reload, and freshclam's own notify() to
 * clamd after a genuine update can silently fail. `expectedVersion` is the
 * version `clamd-entrypoint.sh` parsed from the exact on-disk file this
 * readiness marker was published for; `loadedVersion` is clamd's own live
 * `VERSION` reply (`versionClamd`). Readiness must require these to match
 * -- a reload that is pending, lost, or failed leaves `loadedVersion`
 * trailing the newer `expectedVersion`, which must read as not ready, not
 * as a successful activation merely because a file was written, a reload
 * was requested, or `SelfCheck` was scheduled.
 */
export function isEngineActivated(
  loadedVersion: string | null,
  expectedVersion: string | null,
): boolean {
  return (
    loadedVersion !== null &&
    expectedVersion !== null &&
    loadedVersion === expectedVersion
  );
}

export interface ReadinessDeps {
  maxAgeMs: number;
  now: () => number;
  /** Reads the readiness marker's mtime, or `null` if it does not exist. */
  readMarkerMtimeMs: () => number | null;
  /** Reads the on-disk version `clamd-entrypoint.sh` published alongside
   * the marker, or `null` if missing/unreadable. */
  readExpectedVersion: () => string | null;
  /** Live `VERSION` query against clamd (`versionClamd`); `null` if
   * unreachable, malformed or timed out. */
  queryLoadedVersion: () => Promise<string | null>;
}

/**
 * Composes the full readiness gate: marker exists and is fresh, AND the
 * live engine has actually activated the exact on-disk version that
 * freshness was computed against (R8, round 3). Injectable deps keep this
 * testable without a real filesystem or socket -- the same pattern as
 * `clamd-transport.ts`'s injectable `connect`.
 */
export function createIsReady(deps: ReadinessDeps): () => Promise<boolean> {
  return async () => {
    const mtimeMs = deps.readMarkerMtimeMs();
    if (mtimeMs === null) return false;
    if (!isMarkerFresh(mtimeMs, deps.now(), deps.maxAgeMs)) return false;
    const expectedVersion = deps.readExpectedVersion();
    if (expectedVersion === null) return false;
    const loadedVersion = await deps.queryLoadedVersion();
    return isEngineActivated(loadedVersion, expectedVersion);
  };
}
