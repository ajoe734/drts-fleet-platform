# Orchestrator integration — branch strategy hook points

This guide tells the orchestrator (supervisor + adapters) **where** to call
`branch_routing.route_task()` so that every dispatched worker lands its
branch on the correct integration trunk.

The integration is intentionally narrow: one new module
(`.orchestrator/branch_routing.py`) and ~3 small hooks. The 272 KB
`supervisor.py` is **not** restructured.

---

## 1. The single API

```python
from branch_routing import route_task, RouteDecision

decision: RouteDecision = route_task(task_id, config=config)
decision.base_branch        # "merge/backend-dev-into-main" or "merge/frontend-dev-into-main"
decision.publish_branch     # "backend-dev-publish" / "frontend-dev-publish"
decision.track              # "backend" / "frontend"
decision.matched_rule_index # -1 if it fell through to the default
decision.as_dict()          # JSON-serialisable for ai-status.json
```

Pure function. No I/O. Safe to call from any code path.

---

## 2. Hook point A — worker dispatch (supervisor)

**Where:** `.orchestrator/supervisor.py`, wherever a worker is created and its
`base_branch` is set. (Search for `base_branch` — currently only
`.orchestrator/adapters/copilot_cloud.py` honours it; other adapters default
to `main`.)

**What to add:**

```python
from branch_routing import route_task

decision = route_task(task["id"], config=config)
worker_record["base_branch"] = decision.base_branch
worker_record["track"] = decision.track
worker_record["gate_layer"] = "merge"          # see hook C
worker_record["routing_matched_rule"] = decision.matched_rule_index
```

Then when the adapter is invoked, pass `worker_record["base_branch"]` down.
For Codex/Claude/Gemini local CLI adapters that currently checkout `main`,
change the checkout to use this value.

---

## 3. Hook point B — adapters that open PRs

**Where:**
- `.orchestrator/adapters/copilot_cloud.py` — already accepts `base_branch`
  via `cloud.get("base_branch")`. Make sure the supervisor populates the
  cloud config block with the routed value (or override at call site).
- `.orchestrator/adapters/codex.py`, `.orchestrator/adapters/gemini.py`,
  `.orchestrator/adapters/claude*.py` — when invoking `gh pr create`, add
  `--base "$BASE_BRANCH"` from the worker record.

The orchestrator already shells out for PR creation; no new dependency.

---

## 4. Hook point C — ai-status.json `gate_layer` field

Workers move through layers: `merge → publish → release → main`. Adding a
`gate_layer` field per task lets the dashboard and any consumers see at a
glance which integration layer a given task is currently in.

**Where:** wherever task status is written into `ai-status.json` (search
`scripts/ai_status.py` and `.orchestrator/runtime_state.py`).

**What to add:** an optional `gate_layer` string per task entry:

```jsonc
{
  "tasks": {
    "BE-APR-NOTIFY-001": {
      "status": "review_approved",
      "owner": "Codex",
      "gate_layer": "merge",          // <-- new
      "track": "backend",             // <-- new
      "base_branch": "merge/backend-dev-into-main"
      // ...
    }
  }
}
```

Suggested state machine for `gate_layer`:

| When                                                                 | Set to    |
| -------------------------------------------------------------------- | --------- |
| Worker dispatched, PR not yet open                                   | `feat`    |
| PR open against `merge/*`                                            | `merge`   |
| Squashed into `merge/*`                                              | `integrated` |
| Promotion PR open against `*-publish`                                 | `publish-pr` |
| Merged into `*-publish`                                              | `publish` |
| Pulled into a `release/*` branch                                     | `release` |
| Merged to `main`                                                     | `main`    |

The orchestrator already polls PR state via the GitHub bus; extending it to
update this field is a small additive change.

---

## 5. Config

Add this block to `.orchestrator/config.json` (or leave absent to use
defaults from `branch_routing.DEFAULTS`):

```jsonc
{
  "branch_strategy": {
    "tracks": {
      "backend":  "merge/backend-dev-into-main",
      "frontend": "merge/frontend-dev-into-main"
    },
    "publish_branches": {
      "backend":  "backend-dev-publish",
      "frontend": "frontend-dev-publish"
    },
    "default_track": "backend"
    // track_rules omitted → uses the defaults shipped in branch_routing.DEFAULTS
  }
}
```

If a new task family appears that needs its own track, edit the defaults in
`branch_routing.DEFAULTS` (so triage scripts pick it up too) and add tests
in `test_branch_routing.py`.

---

## 6. Permissions

Add an entry in `provider_permissions.py` (or its data table) for the new
long-lived branches so that workers can push to them when authorised:

```python
LONG_LIVED_PUSH_ALLOWED = {
    "merge/backend-dev-into-main": ["supervisor", "release_manager"],
    "merge/frontend-dev-into-main": ["supervisor", "release_manager"],
    "backend-dev-publish": ["release_manager"],
    "frontend-dev-publish": ["release_manager"],
}
```

Workers themselves never push directly to these — they push their
`codex/*` / `claude/*` / `gemini/*` head and open a PR; the supervisor (or a
human reviewer) does the merge.

---

## 7. Testing the integration

Once hooks A-C are in:

```bash
# Verify routing is deterministic and stable:
python3 .orchestrator/test_branch_routing.py

# Dry-run dispatch a fake task and inspect the worker record:
python3 -c "
import json
from branch_routing import route_task
print(json.dumps(route_task('BE-APR-NOTIFY-001').as_dict(), indent=2))
print(json.dumps(route_task('OPS-UI-APR-001').as_dict(), indent=2))
"
```

Expected: backend tasks → `merge/backend-dev-into-main`, frontend tasks →
`merge/frontend-dev-into-main`. Unknown prefixes fall through to backend
with `matched_rule_index: -1` — a signal to add a rule or rename the task.

---

## 8. Migration notes

- Existing workers with `base_branch: main` continue to function — they just
  bypass the new gates. After cutover, re-dispatch them so they pick up the
  routed branch.
- The legacy `merge/W1a..W3f` wave branches are not in the routing table.
  Any worker still pointing at them must be manually migrated using
  `scripts/branch-strategy/triage-branches.sh` as the source of truth.
