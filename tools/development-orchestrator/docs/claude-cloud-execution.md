# Claude cloud execution

A Claude CLI lane can implement its owner tasks in Claude Code cloud sessions
instead of on this VM. The lane keeps its identity, its eligibility and its
canonical lifecycle; only where the code is written changes.

## How a dispatch runs

1. The supervisor dispatches the task as usual: worktree, task branch, brief.
2. `adapters/claude_cli.py` sees `runtime.execution: "cloud"` and, for an owner
   dispatch in execution mode with a task branch, starts a relay instead of a
   worker. The relay is a local `claude -p` session whose prompt is
   `templates/claude-cloud-relay.md` with the original brief appended.
3. The relay rewrites the brief for the cloud (scopes, spec, rules, commit
   trailers, verification, a final `RESULT:` line) and creates one run-once
   routine with RemoteTrigger in the configured cloud environment.
4. It waits with `bin/cloud_relay_tool.py wait`, which returns early when the
   task branch moves on origin, and checks the run with `list_runs` and
   `get_run_log`. Each wait stays under the supervisor's stall clock.
5. On `handoff`, `bin/cloud_relay_tool.py land` checks that origin holds the
   reported SHA and that every changed file is inside `write_scopes`, then
   fast-forwards the local task branch so `github_bus` sees the commits.
6. The relay delivers with the brief's own `ai-status.sh` commands. Review,
   CI, PR and merge continue unchanged.

Reviewer, planning, coordination and chair dispatches stay local. Every
routine a relay creates is recorded under `.orchestrator/cloud-relay/<task>.json`
(`cloud_relay_tool.py record`), and a retry first looks there (`lookup`) and
adopts a routine that has not fired yet or is still running, rather than
starting a second cloud session on the same branch. RemoteTrigger `list` is
not used: it returns every routine on the account with its full prompt.

## Guard rails

- The adapter marks a relay with `ORCH_EXECUTION=cloud_relay` and
  `ORCH_CLOUD_ENVIRONMENT_ID`. Only then does `permission_broker.py` allow
  RemoteTrigger, and only `get`, `list_runs`, `get_run_log` and a
  `create` that is run-once in that environment. Everything else defers.
- The relay may not edit files: the broker denies Edit, Write, MultiEdit and
  NotebookEdit in a relay session.
- Cloud sessions get no MCP connectors (`mcp_connections: []`) and are told
  not to open PRs, run workflows, deploy or touch machine-truth files. Pull
  requests are still opened by `github_bus` from the VM.

## Configuration

In `.orchestrator/config.local.json`, per Claude provider:

```json
{
  "providers": {
    "claude": {
      "runtime": {
        "execution": "cloud",
        "cloud": {
          "environment_id": "env_...",
          "repo_url": "https://github.com/<owner>/<repo>",
          "cloud_model": "claude-opus-5-5",
          "poll_seconds": 200,
          "max_hours": 6
        }
      }
    }
  }
}
```

Optional keys: `roles` (default `["owner"]`), `base_branch` (default `dev`;
the dispatch's own base branch wins), and `relay_model` (default: the lane's
`runtime.model`, because the relay runs on the local CLI, which may not know
the newest model ids the cloud does). The supervisor reads this file only at
startup, so restart it after a change. Removing `execution` returns the lane
to local workers.

The cloud environment must already exist and have access to the repository;
the relay runs under the lane's claude.ai login, so routines and their usage
belong to that account.
