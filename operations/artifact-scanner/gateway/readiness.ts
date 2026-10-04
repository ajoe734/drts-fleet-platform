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
