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
decision.base_branch        # "backend-dev" or "frontend-dev"
decision.publish_branch     # "backend-staging" / "frontend-staging"
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

## 4. Candidate evidence in ai-status.json

The candidate lifecycle already exposes the integration facts required by the
dashboard. Do not add a second `gate_layer` state machine.

**Where:** `scripts/ai_status.py`, written by the candidate transaction and the
GitHub bus reconciliation path.

**Fields:**

```jsonc
{
  "tasks": {
    "BE-APR-NOTIFY-001": {
      "status": "integrating",
      "owner": "Codex",
      "candidate_sha": "<immutable reviewed SHA>",
      "candidate_branch": "codex/be-apr-notify-001",
      "reviewed_sha": "<same SHA>",
      "ci_sha": "<same SHA>",
      "ci_status": "running",
      "pr_url": "https://github.com/org/repo/pull/123",
      // ...
    },
  },
}
```

The only transition sequence is `review -> integrating -> acceptance -> done`.
Any new PR head returns the task to `in_progress`; CI or merge evidence from a
different SHA is never reused.

At the start of reconciliation, the supervisor migrates only task records that
do not yet carry `candidate_lifecycle_version=1`. The migration uses the same
status transaction, reopens unbound legacy approvals, and does not run again
for already migrated or newly created tasks.

---

## 5. Config

Add this block to `.orchestrator/config.json` (or leave absent to use
defaults from `branch_routing.DEFAULTS`):

```jsonc
{
  "branch_strategy": {
    "tracks": {
      "backend": "backend-dev",
      "frontend": "frontend-dev",
    },
    "publish_branches": {
      "backend": "backend-staging",
      "frontend": "frontend-staging",
    },
    "default_track": "backend",
    // track_rules omitted → uses the defaults shipped in branch_routing.DEFAULTS
  },
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
    "backend-dev": ["supervisor", "release_manager"],
    "frontend-dev": ["supervisor", "release_manager"],
    "backend-staging": ["release_manager"],
    "frontend-staging": ["release_manager"],
}
```

Workers themselves never push directly to these long-lived branches. They push
their `codex/*` / `claude/*` / `gemini/*` head and open a PR. They must not merge
before reviewer approval, green required CI, and no unresolved blocking feedback;
after those gates pass, an integration-authorized worker, supervisor, release
manager, or human reviewer may perform the merge.

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

Expected: backend tasks → `backend-dev`, frontend tasks →
`frontend-dev`. Unknown prefixes fall through to backend
with `matched_rule_index: -1` — a signal to add a rule or rename the task.

---

## 8. Migration notes

- Existing workers with `base_branch: main` continue to function — they just
  bypass the new gates. After cutover, re-dispatch them so they pick up the
  routed branch.
- The legacy `merge/W1a..W3f` wave branches are not in the routing table.
  Any worker still pointing at them must be manually migrated using
  `scripts/branch-strategy/triage-branches.sh` as the source of truth.
