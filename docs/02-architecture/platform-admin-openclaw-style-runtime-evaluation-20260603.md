# Platform Admin OpenClaw Direct Runtime Adoption Plan

Status: proposed recommendation for `PA-AI-OSS-001`
Date: 2026-06-03
Owner: Codex2
Planning ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`

## 1. Scope

This document resets the earlier evaluation and defines the direct adoption plan
for OpenClaw as the primary runtime for:

- Platform Admin assistant sessions
- development-side DRTS workers
- future orchestrator-launched agent runs

The adoption is runtime-direct, not policy-direct. DRTS keeps authority over
identity, credentials, task truth, approvals, audit, and filesystem scope.

## 2. Decision Summary

Decision:

- Adopt OpenClaw directly as the default agent runtime.
- Do not treat pattern-only reuse as the default recommendation.
- Do not allow unrestricted OpenClaw execution to become the DRTS policy
  boundary.

Meaning:

- OpenClaw is responsible for the run loop: sessions, runs, tool sequencing,
  skills/plugins, and channel interaction.
- DRTS is responsible for the control plane: actor binding, dispatch approval,
  permission broker, worker tree guard, audit receipts, and canonical task
  status updates.

Decision for downstream tasks:

- `PA-AI-ORCH-001` should implement an OpenClaw runtime adapter, not a parallel
  DRTS-owned agent loop.
- `PA-AI-SEC-001` defines the outer policy boundary that OpenClaw must obey.
- `PA-AI-DEV-001` and worker tasks assume progress/status writes continue
  through approved DRTS scripts.

## 3. Why Direct Adoption Now

Direct adoption is preferred because OpenClaw already provides the runtime
primitives DRTS needs:

- agent sessions and run state
- tool-call orchestration
- skill/plugin packaging
- channel-oriented interaction
- watcher/intervention hooks
- guarded exec/file/browser/web primitives

Re-creating those primitives inside DRTS would duplicate runtime complexity
without reducing the need for DRTS policy guardrails. The better boundary is:

- reuse OpenClaw for runtime mechanics
- keep DRTS for policy and system authority

## 4. Non-Negotiable Security Boundary

Direct adoption is allowed only with all of these outer controls:

1. OpenClaw cannot widen the current Platform Admin or worker actor identity.
2. Provider/API credentials must be injected ephemerally by DRTS; no long-lived
   secrets in OpenClaw config, plugin config, workspace files, or persistent
   runtime homes.
3. OpenClaw cannot write canonical task truth directly; status changes must
   continue through `tools/development-orchestrator/bin/ai-status.sh` or `python3 tools/development-orchestrator/bin/ai_status.py`.
4. OpenClaw filesystem access must stay inside the assigned task worktree plus
   explicit output paths approved by the bridge.
5. OpenClaw exec access must remain subordinate to `.orchestrator`
   permission-broker policy and per-task command scope.
6. Third-party skills/plugins are disabled by default; only reviewed bundles may
   ship in the DRTS runtime profile.
7. Platform Admin write actions stay behind DRTS API confirmation, policy, and
   audit, even if OpenClaw proposes the action.
8. Transcript retention must redact secrets, tokens, private headers, and raw
   privileged outputs before persistence.

## 5. OpenClaw-to-DRTS Control-Plane Mapping

| OpenClaw capability       | DRTS owner / wrapper                    | Required boundary                                                    |
| ------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Session and run lifecycle | assistant gateway + orchestrator bridge | DRTS creates actor-bound sessions and can terminate them.            |
| Tool exposure             | DRTS adapter-safe tool registry         | Only reviewed tool families are surfaced.                            |
| File access               | worker tree guard                       | No writes outside task branch/worktree scope.                        |
| Exec approvals            | permission broker                       | Runtime approval cannot bypass DRTS command policy.                  |
| Skills/plugins            | reviewed runtime profile                | Third-party installation disabled by default.                        |
| Provider routing          | DRTS secret broker + gateway config     | Runtime receives only scoped ephemeral credentials.                  |
| Audit trail               | DRTS audit pipeline                     | Tool calls and writes emit DRTS receipts with actor/session/run ids. |
| Status/progress updates   | approved scripts                        | Canonical machine truth remains DRTS-owned.                          |
| Worker dispatch           | supervisor + signed dispatch packet     | OpenClaw run starts only after task validation.                      |

## 6. Credential and Tooling Model

### 6.1 Credentials

- Platform Admin provider keys stay in Secret Manager.
- Worker credentials are injected per run through the orchestrator bridge.
- OpenClaw runtime homes must be scrubbed of durable DRTS secrets after run
  completion.
- No shared credential file may be written into the repo worktree.

### 6.2 Tooling profile

Default tool profile for dev workers:

- repo file read/write inside assigned worktree
- bounded shell commands needed for git/doc/test workflows
- bounded web access only when the task explicitly requires current external
  information
- no unreviewed plugin installation
- no direct status JSON mutation

Default tool profile for Platform Admin assistant:

- route/data/docs/audit/action tool buses through DRTS APIs
- no raw shell
- no direct filesystem mutation outside reviewed artifact generation flows
- confirmation gates before medium/high-risk writes

## 7. Audit and Filesystem Guard Model

Required audit fields for OpenClaw-backed runs:

- human actor id
- assistant session id
- runtime run id
- tool name
- tool risk level
- confirmation receipt id when applicable
- task id / dispatch packet id for worker runs

Filesystem rules:

- each worker run executes in an isolated task worktree on the task branch
- branch routing remains DRTS-owned
- writes to fragile surfaces require anchor commits per branch strategy
- the runtime must not access canonical root status files except through
  approved status commands

## 8. Adoption Phases

### Phase 0: Contract reset

- Update architecture docs, task briefs, and board summaries to state that
  OpenClaw direct adoption is the default runtime plan.
- Freeze DRTS-owned outer boundaries for identity, credentials, audit, and
  machine truth.

### Phase 1: Dev worker pilot

- Launch OpenClaw as the default runtime for a bounded worker task in an
  isolated worktree.
- Verify permission-broker, tree-guard, and status-script enforcement.

### Phase 2: Read-only Platform Admin assistant

- Run the assistant gateway through the OpenClaw runtime adapter.
- Expose only read/citation tools and redacted context packets.

### Phase 3: Governed action pilot

- Add confirmation-backed Platform Admin write tools.
- Require DRTS receipts for all writes proposed by OpenClaw.

### Phase 4: Supervisor bridge integration

- Map dispatch packets, worker status, and artifact outputs onto OpenClaw run
  lifecycle primitives.
- Keep supervisor task truth and reviewer workflow unchanged.

### Phase 5: Staging hardening

- Validate prompt-injection defense, credential scrubbing, audit trace
  completeness, and rollback.
- Run the reviewed runtime profile only; no ad hoc skill/plugin drift.

## 9. Rollback Position

Direct adoption must remain removable at the adapter layer.

If OpenClaw fails hardening or operational review:

- keep DRTS control-plane contracts unchanged
- replace only the runtime adapter implementation
- preserve the same task truth, audit, and secret boundary

## 10. Required Task Alignment

The following artifacts must align to this decision:

- `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- `.orchestrator/task-briefs/PA-AI-OSS-001.md`
- any downstream security/orchestrator briefs that still describe OpenClaw as
  optional sidecar or pattern-only guidance

## 11. Net Recommendation

Adopt OpenClaw directly as the runtime. Keep DRTS as the governing shell around
it. The architecture should optimize for a thin DRTS adapter over a mature agent
runtime, not for a new first-party runtime that duplicates OpenClaw mechanics.
