# Velocity / health probe

Single answer to "is development moving forward?" without anyone having
to grep logs or read `state.json` by hand.

## CLI

```
scripts/health.sh                  # human-readable color output
scripts/health.sh --json           # structured JSON snapshot
scripts/health.sh --quiet          # silent, only exit code
```

Exit code:

| Code | Meaning |
|------|---------|
| 0 | Healthy — every metric within threshold |
| 1 | Degraded — at least one WARN (heartbeat lag, supersede rate, lane TTL low, …) |
| 2 | Critical — supervisor not running, or `state.json` missing |

The script is exit-code-driven on purpose so a systemd timer can call
it and surface failures via `systemctl --user status drts-health`
without any separate alerting plumbing.

## What it reports

| Section | Source | Notes |
|---------|--------|-------|
| supervisor | `pgrep` + `/proc/<pid>/status` + state.json | PID, RSS, uptime, heartbeat lag (from supervisor.state or state.json mtime fallback) |
| workers | state.json `workers.running` | Per-lane task + age |
| velocity | state.json done tasks | Count in last 1h / 24h, last completed task ID + age |
| failures | state.json + supervisor log | supersede rate (last 1h), dispatch pauses, blockers, paused provider lanes |
| lanes | `.orchestrator/logs/lane-health.jsonl` | OAuth token TTL per lane (populated by drts-claude-keepalive.timer) |

## Tunables (env vars consumed by the script)

| Var | Default | Effect |
|-----|---------|--------|
| `HEALTH_HEARTBEAT_LAG_WARN` | `300` | Heartbeat lag (seconds) above which the script emits WARN |
| `HEALTH_DONE_GAP_WARN` | `1800` | Seconds since last `done` above which the script emits WARN |
| `HEALTH_SUPERSEDE_RATE_WARN` | `8` | Supersedes per hour above which the script emits WARN |

## Timer

The systemd `.timer` runs the probe every 5 minutes (also 30s after
each boot, persistent across missed runs). Status is visible via:

```
systemctl --user status drts-health.timer    # next scheduled run
systemctl --user status drts-health          # last probe's exit + output
journalctl --user -u drts-health -f          # live tail
```

## Install / refresh

```
scripts/install-health-systemd.sh
```

Idempotent. Enables linger is NOT required for this timer — it's a
short oneshot that runs alongside the supervisor service (which itself
needs linger; see ops/systemd/README.md).

## Why a custom probe instead of Prometheus / Grafana?

Both Prometheus and Grafana would be appropriate at scale; this probe
is intentionally a single-file zero-dep python script because:

- The metrics needed to answer "is development moving forward?" come
  from a handful of plain files that the script already has on-disk
  read access to (state.json, supervisor log, lane-health jsonl).
  Spinning up a metrics pipeline would be ceremony for a 1-host setup.
- Exit-code-driven alerting via `systemctl status` is enough for the
  current dev environment; the moment we run on >1 host we should
  replace this probe with a real Prometheus exporter.

## Supervisor log timezone gotcha

`supervisor.py` hardcodes `LOCAL_TZ = ZoneInfo("Asia/Taipei")` for its
log timestamps regardless of host timezone. The probe parses
supersede-line timestamps with that explicit zone so the count is
correct on hosts in UTC (or any other tz). If supervisor.py ever drops
that hardcode, the `SUPERVISOR_LOG_TZ` constant in `scripts/health.py`
must be updated to match.
