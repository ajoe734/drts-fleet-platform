/**
 * A readiness marker that merely exists is not sufficient: clamd's
 * signatures go stale over time, and an engine that failed (or never ran)
 * its periodic freshclam refresh must never keep reporting ready just
 * because the sidecar process is still up. `clamd-entrypoint.sh` only
 * refreshes the marker's mtime on a genuine freshclam success -- this pure
 * age check is what turns an overdue refresh into a real "not ready"
 * instead of a permanently-clean illusion (R8).
 */
export function isMarkerFresh(
  mtimeMs: number,
  nowMs: number,
  maxAgeMs: number,
): boolean {
  return nowMs - mtimeMs <= maxAgeMs;
}
