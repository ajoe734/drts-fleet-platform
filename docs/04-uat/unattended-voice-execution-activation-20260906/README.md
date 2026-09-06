# Unattended voice execution activation — 2026-09-06

Task: `UV-DISPATCH-001`

[PR #1608](https://github.com/ajoe734/drts-fleet-platform/pull/1608) merged the SA/SD, two-pass audit, execution packet, 29-task manifest and materializer into `dev` at `a0bd9066dfb25ef609506668139052f835da7240`. The materializer applied that merged source to the canonical task board and subsequent `--verify` confirmed all 29 tasks while preserving their lifecycle and evidence.

The initial dispatch reached `manual_pending`: all six `agents.*` omitted `adapter`, so the runtime selected its `file_inbox` default despite automatic provider delivery modes. Adding the corresponding `antigravity`, `claude_cli` and `codex` adapters and restarting the supervisor enabled its normal recovery and automatic dispatch. Permission, sandbox and skip flags were unchanged.

At the recorded verification time, `UV-EXEC-001` and `UV-EXEC-027` were `in_progress`, with active agy systemd worker units and live processes in their own worktrees. Both process commands selected `gemini-3.1-pro-high`. The remaining tasks were 25 dependency-gated backlog items and two blocked live-validation gates (`028` and `029`). These counts are a timestamped snapshot, not a replacement for the live task board.

The initial assignments place all implementation owners on Gemini/Gemini2 or Claude/Claude2 and all reviewers on Codex/Codex2. The runtime may use its supported helper/fallback routing; this is a role preference, not a newly introduced hard role restriction. Per-lane limits are Gemini/Gemini2 and Claude/Claude2 each 3, Codex/Codex2 each 2; the shared global execution cap remains 12.

## Subsequent model change

After the initial activation, the user requested Gemini 3.8 Flash at its highest available reasoning effort. Both agy lanes now configure `gemini-3.8-flash-high` as their primary model. Fresh account-specific diagnostics expose only `low`, `medium` and `high`, with no level above High. The original 3.1 Pro evidence below remains the historical activation snapshot; [the subsequent model-change record](agy38-model-change-20260906.json) records the new configuration and its activation checks.

## Evidence

- [Worker activation](worker-activation.json): adapter change, configuration hash, supervisor restart, task counts and actual worker processes.
- [agy model and effort](agy-model-effort-20260906.json): both account diagnostics confirm the current Gemini 3.1 Pro variant uses its highest available `high` effort. Gemini 3.8 Flash High is available but was not selected by this task.
- [Codex model configuration](codex-model-change-20260906.json): both lanes select GPT-6 Astra with `ultra` in their respective Codex home configuration, using the complete pinned CLI 0.153.0 bundle.
- [Capacity configuration](capacity-change-20260906.json): requested per-lane capacity and retained shared resource limits.

## Verification boundary

The materializer verification passed after dispatch. Process existence, active worker units, selected command models and the supervisor heartbeat establish automatic worker activation. They do not establish task acceptance, live PSTN/provider quality or production readiness. Tasks `UV-EXEC-028` and `UV-EXEC-029` retain their explicit external evidence requirements.

Runtime configuration and task-board files remain local machine truth. Only sanitized, timestamped delivery evidence is checked in; no credentials or full worker prompts are included.
