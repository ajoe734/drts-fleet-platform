# Codex lane isolation (dual-account, multi-worker, race-free)

Lets the `codex` and `codex2` orchestrator lanes run on SEPARATE ChatGPT
accounts — each with its own quota and each able to run multiple concurrent
worker subprocesses — without the `refresh_token_reused` OAuth race that
historically forced both lanes onto a single shared account.

## Background: two bugs this addresses

1. **Refresh race forced account-sharing.** The codex CLI uses rotating
   single-use refresh tokens. When two `codex exec` subprocesses sharing one
   `auth.json` both hit a token refresh at once, one wins and the other gets
   `401 refresh_token_reused`. The original mitigation (2026-05-20) symlinked
   `~/.codex2/auth.json -> ~/.codex/auth.json` so there was only ONE auth file
   plus a global startup `flock`. Side effect: both lanes burned the SAME
   account's quota, so a heavy wave exhausted it twice as fast and both lanes
   died together.

2. **CODEX_HOME vs HOME path mismatch.** The codex CLI resolves its config
   dir as `$CODEX_HOME` when set, else `$HOME/.codex`. The supervisor launches
   codex2 with `CODEX_HOME=~/.codex2` (reads `~/.codex2/auth.json`), but an
   operator running `HOME=~/.codex2 codex login` writes to
   `~/.codex2/.codex/auth.json`. Login refreshes one file; the supervisor reads
   the other; stale-token 401 loop. (Observed 2026-05-27.)

## The fix

### `scripts/codex-wrapper.sh` — per-CODEX_HOME lock

The refresh race only exists *within* one account's auth file. Two different
accounts can't race each other. The wrapper now derives its flock lockfile
from the effective codex home:

```
CODEX_HOME set  -> lock keyed on "$CODEX_HOME"
otherwise       -> lock keyed on "$HOME/.codex"
```

So `codex` (e.g. `~/.codex`) and `codex2` (`~/.codex2`) serialize their own
refreshes independently and run fully in parallel. An explicit
`CODEX_REFRESH_LOCK` still overrides (back-compat / tests).

### `scripts/repair-codex-symlinks.sh` — `CODEX_LANE_ISOLATION` modes

| `CODEX_LANE_ISOLATION` | Behaviour |
|---|---|
| unset / `0` (default) | **Legacy**: symlink `~/.codex2/auth.json -> ~/.codex/auth.json` (shared account, shared quota). Unchanged from before. |
| `1` | **Isolation**: keep codex2 on its own account; reconcile the CODEX_HOME-view (`~/.codex2/auth.json`) and HOME-view (`~/.codex2/.codex/auth.json`) auth paths (newer promoted to the CODEX_HOME view, HOME view symlinked to it). Never cross-links codex2 to the codex main account. |

## How to switch a deployment to dual-account isolation

1. Ensure each lane has its OWN account logged in:
   ```bash
   # codex main (account A)
   codex login                       # writes ~/.codex/auth.json
   # codex2 (account B) — use CODEX_HOME so it lands where the supervisor reads
   CODEX_HOME=~/.codex2 codex login --device-auth
   ```
   (If you must use `HOME=~/.codex2 codex login`, the isolation-mode repair
   script reconciles the resulting `~/.codex2/.codex/auth.json` back to
   `~/.codex2/auth.json` on next supervisor start.)

2. Export `CODEX_LANE_ISOLATION=1` in the supervisor's environment (e.g. in
   the systemd unit's `Environment=` or before `run-supervisor.sh`). With
   that set, `repair-codex-symlinks.sh` stops cross-linking the accounts.

3. Restart the supervisor. Each lane now serializes its own refreshes via its
   own per-CODEX_HOME lockfile; both can run `max_tasks_per_agent_by_lane`
   workers concurrently without `refresh_token_reused`.

## Verify

```bash
bash ops/codex-isolation/test-codex-lane-isolation.sh   # 10 assertions
# live: confirm distinct lockfiles in use
ls -la /tmp/drts-codex-refresh-*.lock
# live: confirm the two lanes are on different accounts
for h in ~/.codex ~/.codex2; do
  python3 - "$h/auth.json" <<'PY'
import json,sys,base64
a=json.load(open(sys.argv[1])); t=a["tokens"]["id_token"].split(".")[1]
print(sys.argv[1], json.loads(base64.urlsafe_b64decode(t+"="*(-len(t)%4)))["email"])
PY
done
```

## Current deployment note (2026-05-27)

As of this PR landing, BOTH lanes are temporarily pointed at
`ajoe734@cctech-support.com` (the bjoe734 codex account is quota-exhausted
until 2026-05-30). `CODEX_LANE_ISOLATION` is therefore left UNSET for now.
Flip it to `1` and re-login codex main to bjoe734 once that account's quota
resets, to get true double-quota dual-account throughput.
