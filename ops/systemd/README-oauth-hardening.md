# OAuth lane hardening — systemd timer + health probe

This unit suite hardens the Claude Code OAuth-as-backend pattern that the
supervisor relies on. It supersedes the legacy `*/30 * * * *
claude2-keepalive.sh` crontab entry installed via PR #292.

## Why not switch to API keys?

Personal Claude Max subscriptions are a flat fee; their token usage is
"included" within the subscription's allowance. A 24/7 backend workload
that does many UI rebuild attempts can run hundreds of dollars per month
on API key billing vs. zero incremental cost on a Max subscription.
OAuth is therefore the economically correct backend auth choice — the
operational problem is keeping the token alive, not the auth model
itself.

This unit suite is the bridge between "OAuth is fine for backend" and
"OAuth tokens decay if no client is exercising them".

## What it does

`drts-claude-keepalive.timer` fires the `.service` unit every 30 minutes
(and 60 seconds after each boot, persisting across missed runs). The
service runs two scripts in sequence:

1. `scripts/claude-lane-keepalive.sh` — issues a single haiku `--print`
   call against each named lane under the lane-specific env
   (`CLAUDE_CONFIG_DIR=~/.claude-autoworker` for the main `claude` lane,
   `HOME=~/.claude2-home` for `claude2`). This forces the CLI's in-band
   OAuth refresh path, keeping the refresh token warm.
2. `scripts/lane-health.sh` — reads `expiresAt` from each lane's
   `credentials.json` and emits a JSON line to
   `.orchestrator/logs/lane-health.jsonl`. Exits non-zero if any lane
   has < 30 minutes of TTL remaining, so the systemd service surfaces
   degradation in `systemctl --user status` before the supervisor
   actually hits a 401 in production dispatch.

## Why systemd timer, not cron?

| | cron | systemd timer |
|---|---|---|
| Logging | Caller's stdout/stderr redirect; opaque | `journalctl --user -u drts-claude-keepalive` with timestamps, structured filtering, retention |
| Failure visibility | Silent unless you read the log | `systemctl --user status` shows last-fail + reason inline |
| Missed runs | Lost; cron only fires at wall-clock interval | `Persistent=true` catches up after the host is awake |
| Boot trigger | None — first fire is at the next wall-clock minute matching the pattern | `OnBootSec=60s` exercises lanes before any backend dispatch can use them |
| Dependencies | None | Can `After=` other units (e.g., the supervisor service) |

## What we do NOT do here

- **Auto-pause failover.** Detecting a 401 in `lane-health.jsonl` does
  not automatically write `provider_pauses` in `state.json`. That
  read-side support belongs in `supervisor.py` and is intentionally a
  separate change: the supervisor's pause-mutation path is already
  fragile (see `feedback_supervisor_race_clear_pause`) and combining
  observer + mutator in one PR widens the blast radius if anything
  regresses.
- **Reauth automation.** When a refresh token genuinely dies (e.g.,
  user rotated their Anthropic password elsewhere), only an interactive
  `claude auth login` round-trip restores the lane. The keepalive only
  prevents *idle* decay; it cannot rescue an externally revoked token.
- **Codex/Gemini lane keepalives.** Codex uses a separate OAuth
  (ChatGPT) handled by `repair-codex-symlinks.sh`. Gemini's `gemini2`
  lane uses Google Cloud Application Default Credentials with quota
  limits, not refresh-token decay. Adding either lane to this timer is
  a follow-up if their failure modes turn out to overlap.

## Install / refresh

```
scripts/install-claude-keepalive-systemd.sh
```

The installer is idempotent. It:

1. Installs both `.service` and `.timer` units (templated paths
   substituted for `%h`).
2. Removes any prior `claude2-keepalive.sh` / `claude-lane-keepalive.sh`
   crontab entry to prevent double-firing.
3. Enables and starts the timer.

## Operational reference

| What | Command |
|------|---------|
| Status | `systemctl --user status drts-claude-keepalive.timer` |
| Last run | `systemctl --user list-timers drts-claude-keepalive.timer` |
| Tail logs | `journalctl --user -u drts-claude-keepalive -f` |
| Exercise now | `systemctl --user start drts-claude-keepalive.service` |
| Disable | `systemctl --user disable --now drts-claude-keepalive.timer` |
| Inspect lane TTLs | `tail -10 .orchestrator/logs/lane-health.jsonl` |

## Migration from PR #292's cron entry

The installer's crontab pruning step is heuristic — it greps for the
script basename. If your crontab has additional comments or wrappers
around the keepalive line, inspect with `crontab -l` after running the
installer and `crontab -e` to remove anything residual.
