# Codex lane isolation (worker-named homes, multi-worker, race-free)

Lets the `codex` and `codex2` orchestrator lanes run on SEPARATE ChatGPT
accounts — each with its own quota and each able to run multiple concurrent
worker subprocesses — without the `refresh_token_reused` OAuth race that
historically forced both lanes onto a single shared account.

It also supports a same-account setup where the VS Code ChatGPT chatbox stays
on `~/.codex`, while background worker lanes use clearly named homes such as
`~/.codex-worker` and `~/.codex2-worker`. That protects the chatbox token file
from worker refresh churn even when all three sessions authenticate as the same
OpenAI account.

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
   a worker lane with `CODEX_HOME=<worker home>` (reads `<worker home>/auth.json`),
   but an operator running `HOME=<worker home> codex login` writes to
   `<worker home>/.codex/auth.json`. Login refreshes one file; the supervisor
   reads the other; stale-token 401 loop. (Observed 2026-05-27.)

## The fix

### `scripts/codex-wrapper.sh` — per-CODEX_HOME lock

The refresh race only exists _within_ one account's auth file. Two different
accounts can't race each other. The wrapper now derives its flock lockfile
from the effective codex home:

```
CODEX_HOME set  -> lock keyed on "$CODEX_HOME"
otherwise       -> lock keyed on "$HOME/.codex"
```

So `codex` (for example `~/.codex-worker`) and `codex2`
(`~/.codex2-worker`) serialize their own refreshes independently and run fully
in parallel, while the interactive chatbox can continue using `~/.codex`.
An explicit
`CODEX_REFRESH_LOCK` still overrides (back-compat / tests).

### `scripts/repair-codex-symlinks.sh` — `CODEX_LANE_ISOLATION` modes

| `CODEX_LANE_ISOLATION` | Behaviour                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unset / `0` (default)  | **Legacy**: symlink codex2's auth file to the primary lane auth file (historically `~/.codex2/auth.json -> ~/.codex/auth.json`). Shared account, shared token file, shared quota.                                                                                                                                       |
| `1`                    | **Isolation**: keep codex2 on its own worker home; reconcile the CODEX_HOME-view (`$CODEX2_HOME_DIR/auth.json`) and HOME-view (`$CODEX2_HOME_DIR/.codex/auth.json`) auth paths (newer promoted to the CODEX_HOME view, HOME view symlinked to it). Never cross-links codex2 to the primary chatbox/home account. |

## Same-account isolation: protect chatbox from worker refreshes

Use this mode when `chatbox`, `codex`, and `codex2` all authenticate as the
same OpenAI account, but you still want worker refreshes to stay away from the
interactive extension's `~/.codex/auth.json`.

1. Keep the chatbox / interactive extension on the default home:

   ```bash
   codex login    # writes ~/.codex/auth.json
   ```

2. Point the worker lanes at clearly named homes in
   `.orchestrator/config.local.json`:

   ```json
   {
     "providers": {
       "codex": { "codex": { "config_home": "~/.codex-worker" } },
       "codex2": { "codex": { "config_home": "~/.codex2-worker" } }
     }
   }
   ```

3. Install a user-level systemd drop-in so preflight repair uses the codex2
   worker home instead of the historical `~/.codex2` default:

   ```ini
   # ~/.config/systemd/user/drts-supervisor.service.d/codex-lane-isolation.conf
   [Service]
   Environment=CODEX_LANE_ISOLATION=1
   Environment=CODEX2_HOME_DIR=%h/.codex2-worker
   ```

4. Log the worker lanes in separately, using `CODEX_HOME` so each lane writes
   its own session chain:

   ```bash
   CODEX_HOME=~/.codex-worker codex login --device-auth
   CODEX_HOME=~/.codex2-worker codex login --device-auth
   ```

5. Restart the supervisor. From that point on, worker refreshes touch
   `~/.codex-worker/auth.json` and `~/.codex2-worker/auth.json`, not the
   chatbox extension file at `~/.codex/auth.json`.

This does **not** separate quota. All three sessions still consume the same
OpenAI account allowance; it only separates token files and refresh state.

## Dual-account isolation: separate quota and refresh state

1. Ensure each lane has its OWN account logged in:

   ```bash
   # codex worker (account A)
   CODEX_HOME=~/.codex-worker codex login --device-auth
   # codex2 worker (account B)
   CODEX_HOME=~/.codex2-worker codex login --device-auth
   ```

   Keep the interactive chatbox on its own login under `~/.codex` if you want
   extension usage isolated from worker token refreshes too.

   (If you must use `HOME=~/.codex2-worker codex login`, the isolation-mode
   repair script reconciles the resulting `~/.codex2-worker/.codex/auth.json`
   back to `~/.codex2-worker/auth.json` on next supervisor start, provided the
   systemd drop-in exports `CODEX2_HOME_DIR=%h/.codex2-worker`.)

2. Export `CODEX_LANE_ISOLATION=1` in the supervisor's environment (e.g. in
   the systemd unit's `Environment=` or before `run-supervisor.sh`). If codex2
   uses a worker-named home, also export `CODEX2_HOME_DIR` to match it. With
   that set, `repair-codex-symlinks.sh` stops cross-linking the accounts.

3. Restart the supervisor. Each lane now serializes its own refreshes via its
   own per-CODEX_HOME lockfile; both can run `max_tasks_per_agent_by_lane`
   workers concurrently without `refresh_token_reused`.

## Verify

```bash
bash ops/codex-isolation/test-codex-lane-isolation.sh   # 10 assertions
# live: confirm distinct lockfiles in use
ls -la /tmp/drts-codex-refresh-*.lock
# live: confirm the worker lanes are on the expected accounts
for h in ~/.codex-worker ~/.codex2-worker; do
  python3 - "$h/auth.json" <<'PY'
import json,sys,base64
a=json.load(open(sys.argv[1])); t=a["tokens"]["id_token"].split(".")[1]
print(sys.argv[1], json.loads(base64.urlsafe_b64decode(t+"="*(-len(t)%4)))["email"])
PY
done
```

## Current deployment note (2026-05-27)

As of 2026-05-27, this repo supports both deployment shapes:

- same-account isolation, where chatbox stays on `~/.codex` and workers move
  to `~/.codex-worker` / `~/.codex2-worker`; and
- dual-account isolation, where those worker homes can also authenticate as
  separate OpenAI accounts for double throughput.

The key operational rule is the same in both cases: do not point worker lanes
at the interactive chatbox auth file, and always log worker lanes in with
explicit `CODEX_HOME=... codex login --device-auth`.
