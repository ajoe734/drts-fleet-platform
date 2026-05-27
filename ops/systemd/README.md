# DRTS Supervisor — systemd user service

The supervisor (`.orchestrator/supervisor.py`) historically ran as a
backgrounded `nohup python3 ...` invocation with PPID=1. That pattern
produced several recurring incidents:

- OOM-kill from availability-first thrashing left no traceback and no
  restart, so the orchestration loop silently halted until someone noticed
  the dashboard had stopped advancing.
- Logs were tailed from a single ever-growing file with no rotation or
  retention policy.
- There was no health metric exposed to the host's service manager, so the
  failure mode "supervisor is hung but the process is still alive" required
  manual `tail -f` plus mtime inspection of `.orchestrator/state.json`.

This unit puts the supervisor under `systemd --user` with:

- `Restart=on-failure` — auto-recover from any non-zero exit, SIGKILL, or
  OOM. Capped at 5 starts per 5 minutes to prevent a busted config from
  thrashing the host.
- `MemoryMax=4G` / `MemoryHigh=3G` — soft + hard memory ceilings well
  above the observed steady-state working set (~1 GB) but below the
  pathological 5+ GB seen during prior incidents.
- `WatchdogSec=900` — placeholder for a future `sd_notify(WATCHDOG=1)`
  call inside `supervisor.py`. With that call in place, systemd will SIGKILL
  and restart a supervisor that goes silent for >15 minutes.
- `StandardOutput=journal` — log to `journalctl --user -u drts-supervisor`
  with structured filtering, rotation, and retention. The legacy
  `.orchestrator/logs/supervisor-bg.log` trail continues to be written by
  supervisor itself for compatibility with chair-review scripts.
- `KillMode=mixed` — SIGTERM the supervisor process group on stop, giving
  dispatched worker CLIs a chance to commit before they are reaped.

## Install / refresh

```
scripts/install-supervisor-systemd.sh
```

The installer is idempotent. It substitutes `$HOME` into the templated paths,
installs to `~/.config/systemd/user/drts-supervisor.service`, enables
`loginctl enable-linger` so the service survives SSH logout, and starts (or
restarts) the unit.

## Migrate from a running orphan supervisor

The installer does NOT stop a pre-existing orphan supervisor — that would
mid-tick interrupt any worker dispatch the orphan was holding open. Migrate
in two steps:

1. Run the installer. The systemd unit will start as a second supervisor
   instance, racing the orphan on `.orchestrator/state.json` writes for a
   short window. This is acceptable for the migration cutover only.
2. Verify the systemd unit is healthy:

   ```
   journalctl --user -u drts-supervisor -n 50 -f
   ```

3. Stop the orphan:

   ```
   kill -TERM $(pgrep -f 'supervisor.py' \
     | grep -v "$(systemctl --user show -p MainPID --value drts-supervisor)")
   ```

After this, only the systemd-managed supervisor remains, and any crash or
hang triggers automatic restart.

## Operational reference

| What              | Command                                                     |
| ----------------- | ----------------------------------------------------------- |
| Status            | `systemctl --user status drts-supervisor`                   |
| Restart           | `systemctl --user restart drts-supervisor`                  |
| Stop              | `systemctl --user stop drts-supervisor`                     |
| Tail logs         | `journalctl --user -u drts-supervisor -f`                   |
| Recent logs       | `journalctl --user -u drts-supervisor --since "10 min ago"` |
| Disable autostart | `systemctl --user disable drts-supervisor`                  |
| Memory accounting | `systemctl --user show drts-supervisor -p MemoryCurrent`    |

## Config selection

The unit uses `.orchestrator/config.json` (repo-tracked) by default. Prior
deployments occasionally pointed the orphan supervisor at
`/tmp/drts-supervisor-canonical-root.json`, which is a host-local override
that differs from the in-repo config in a handful of flags (e.g.,
`auto_refresh_provider_capabilities`, absolute vs. relative path style).
To override at the unit level, edit `ExecStart` in the installed unit and
`daemon-reload`. Avoid pointing `ExecStart` at `/tmp/` — anything there can
be wiped on reboot.
