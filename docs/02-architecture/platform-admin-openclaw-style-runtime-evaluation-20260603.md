# Platform Admin OpenClaw-Style Runtime Evaluation

Status: proposed recommendation for `PA-AI-OSS-001`
Date: 2026-06-03
Owner: Codex2
Planning ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`

## 1. Scope

This document evaluates whether DRTS should adopt OpenClaw directly, wrap an
OpenClaw-style OSS runtime as a development-side sidecar, or keep a DRTS-owned
runtime while borrowing the architectural pattern.

The decision target is narrow:

- development-side worker and agent-sidecar use only
- no privileged in-process adoption inside `platform-admin-api`
- no change to the DRTS rule that production writes stay behind DRTS API
  authorization, policy, audit, and human confirmation

## 2. Decision Summary

Recommendation:

- Reject direct OpenClaw embedding into the Platform Admin API runtime.
- Allow a bounded POC where an OpenClaw-style OSS runtime runs as an optional
  dev-side sidecar behind the existing `.orchestrator` bridge.
- Keep the long-term control plane DRTS-owned unless a later evaluation proves
  that the OSS runtime can meet DRTS guardrails without weakening isolation,
  auditability, or secret handling.

Decision for `PA-AI-ORCH-001`:

- use OpenClaw-style concepts as reference
- do not make OpenClaw the default worker runtime
- if a POC is pursued, treat it as a replaceable runner behind a DRTS adapter

## 3. Evaluation Criteria

The architecture plan requires these outcomes for any candidate runtime:

1. No privilege widening beyond the current Platform Admin actor.
2. No provider secrets or DRTS service credentials stored in OSS runtime config.
3. Orchestrator writes must stay behind signed dispatch packets, tree guard,
   isolated worktrees, and approved status scripts.
4. Production system actions must stay in DRTS API services, not in an external
   agent runner.
5. The integration must be removable without rewriting the assistant gateway.

## 4. What OpenClaw Currently Provides

Based on OpenClaw public docs and security literature reviewed on 2026-06-03:

- OpenClaw exposes an agent CLI that can run an agent turn through a gateway or
  locally with `--local`, and can fall back from gateway mode to embedded mode.
- OpenClaw's runtime model is a single embedded agent runtime per gateway, with
  one workspace, bootstrap files, session store, and built-in tool surface.
- The built-in tool surface includes file I/O, shell execution, browser
  control, web access, messaging, and sub-agent coordination.
- OpenClaw treats skills as prompt-injected operating guides and plugins as
  packages that can register tools, providers, channels, and other
  capabilities.
- OpenClaw has exec approvals, plugin approval requests, skill gating, and
  allow/deny controls, but these are runtime guardrails inside the OpenClaw
  trust boundary rather than a substitute for DRTS API and orchestrator policy.
- OpenClaw documentation explicitly warns that third-party skills are untrusted
  code and recommends sandboxed runs for untrusted inputs and risky tools.
- Recent security literature describes the OpenClaw attack surface as enlarged
  by persistent memory, high-privilege operations, third-party skills, and
  multi-agent interaction, and recommends layered defenses such as skills,
  plugin enforcement, and decoupled watchers.

Inference from those sources:

- OpenClaw is structurally useful as a reusable agent runner pattern.
- OpenClaw is not, by itself, a sufficient policy boundary for DRTS-sensitive
  actions.

## 5. Option Analysis

### 5.1 Option A: direct adoption inside Platform Admin runtime

Description:

- run OpenClaw or an OpenClaw-derived agent process as part of the Platform
  Admin API request path
- allow the assistant gateway to rely on OpenClaw's runtime/session/tool loop

Benefits:

- faster access to mature session, tool, plugin, and channel abstractions
- lower short-term implementation effort for agent loop mechanics

Risks:

- collapses DRTS policy boundary into an OSS runtime that also owns tools,
  prompts, workspace files, and plugin loading
- raises the blast radius of prompt injection, tool misuse, or skill/plugin
  supply-chain compromise
- increases pressure to place provider and environment credentials into the OSS
  runtime's execution surface
- conflicts with the architecture plan's requirement that production system
  actions remain DRTS-owned API operations

Decision:

- reject

### 5.2 Option B: optional dev-side sidecar behind `.orchestrator`

Description:

- run an OSS runtime in a separate process or container outside the
  `platform-admin-api` runtime
- invoke it only through a DRTS bridge adapter
- keep DRTS as the authority for task creation, approvals, worktree setup,
  status writes, and artifact persistence

Benefits:

- preserves a strong boundary between product runtime and experimentation
- allows rapid evaluation of session/routing/tool orchestration ideas
- makes the runtime replaceable if the POC underperforms or fails review

Risks:

- still inherits OpenClaw-side risks around tool execution, skills, plugins, and
  prompt-layer steering if the sidecar is over-privileged
- requires careful environment scrubbing, command allowlists, transcript
  retention limits, and kill-switch controls
- adds another runtime surface to operate and support

Decision:

- acceptable for POC only, with strict boundary conditions in section 6

### 5.3 Option C: pattern-only, DRTS-owned runtime

Description:

- keep the current `.orchestrator` and future assistant gateway runtime DRTS
  owned
- borrow the architectural concepts only: sessions/runs, tool registry,
  approvals, channel adapters, watcher-style enforcement

Benefits:

- best alignment with existing branch routing, permission broker, tree guard,
  status writer, and task lifecycle contracts
- easiest way to keep DRTS API credentials, audit receipts, and platform action
  semantics inside first-party code
- lowest supply-chain risk

Risks:

- more DRTS implementation work
- slower to reach parity with mature OSS agent ergonomics

Decision:

- recommended default

## 6. Required Security Boundary For Any POC

If DRTS evaluates an OpenClaw-style sidecar, the sidecar must operate under all
of these constraints:

1. No DRTS production or staging API credentials in sidecar config, workspace,
   plugin config, or skill env.
2. No direct calls from the OSS runtime to privileged Platform Admin write
   endpoints.
3. No direct status-file mutation; progress updates must continue through
   `scripts/ai-status.sh` or `python3 scripts/ai_status.py`.
4. No unrestricted `exec` or file write outside the isolated worker worktree.
5. No third-party skill or plugin installation by default.
6. No automatic approval persistence for risky commands.
7. No transcript retention of secrets, tokens, or raw privileged tool outputs.
8. No user-facing claim that the OSS sidecar is the authority for policy,
   approvals, or action execution.

Concrete DRTS mapping:

| Concern | OpenClaw-side capability | DRTS-required outer boundary |
| --- | --- | --- |
| Host exec | exec approvals, allowlists | `.orchestrator` permission broker plus task-specific command scope |
| Plugin action approval | plugin permission requests | DRTS confirmation policy and reviewer-controlled task lifecycle |
| Skill guidance | `SKILL.md` injection | DRTS-owned task guardrails and artifact contracts |
| Workspace isolation | configured workspace / sandbox | isolated git worktree anchored to task branch |
| Session persistence | JSONL session store | DRTS audit/log retention policy, with sidecar treated as ephemeral |
| Tool exposure | tools allow/deny lists | DRTS bridge exposes only adapter-safe tools |

## 7. Recommended POC Shape

The POC should not target Platform Admin write actions first. It should target
development-side documentation and task-slicing support.

### 7.1 POC boundary

- caller: DRTS-owned orchestrator bridge
- callee: optional sidecar runner adapter
- allowed inputs:
  - checked-out repo worktree
  - bounded task brief
  - allowlisted documentation files
  - explicit output path(s)
- allowed outputs:
  - draft SA/SD/task artifacts under known repo paths
  - stdout/stderr evidence for the bridge
- forbidden outputs:
  - direct dashboard mutation
  - direct PR merge or deploy actions
  - direct Platform Admin write actions

### 7.2 POC tool profile

Start with the smallest possible tool surface:

- read-only repo file access
- bounded web fetch/search only if the task explicitly requires latest external
  information
- optional patch/write only into an isolated worktree output directory
- `exec` disabled by default; if enabled for the experiment, allowlist only a
  minimal command set such as `git status`, `git diff`, `find`, `grep`, and
  validation commands selected by the bridge

### 7.3 POC success criteria

The POC is useful only if it proves all of the following:

1. The sidecar can be launched and torn down per task without leaving durable
   credentials behind.
2. The bridge can constrain its workspace, environment, tools, and outputs.
3. The sidecar produces artifacts that are no harder to review than current
   DRTS worker output.
4. Failure or compromise of the sidecar does not let it bypass tree guard,
   status truth, branch strategy, or API write policy.
5. The sidecar can be removed and replaced without changing Platform Admin API
   contracts.

## 8. Adoption Recommendation

For the current architecture wave:

- `PA-AI-ORCH-001` should continue with a DRTS-owned orchestrator bridge.
- The bridge contract should be runner-agnostic so that a future OSS sidecar can
  be plugged in as one implementation.
- OpenClaw-style ideas worth borrowing now:
  - sessions and runs as first-class objects
  - explicit tool registry and approval checkpoints
  - watcher-style runtime intervention
  - channel adapters separated from task logic
- OpenClaw capabilities to avoid coupling to now:
  - workspace bootstrap file semantics as a source of authority
  - direct plugin ecosystem trust
  - embedded fallback modes that blur gateway versus local execution boundaries
  - broad built-in tool exposure as the default operating model

Net recommendation:

- adopt pattern, not platform
- permit a sidecar POC only behind a DRTS adapter and only for dev-side
  artifact generation
- do not route Platform Admin production actions or secrets through OpenClaw

## 9. Evidence Links

Primary sources reviewed on 2026-06-03:

- Architecture plan: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- OpenClaw agent CLI docs: <https://docs.openclaw.ai/cli/agent>
- OpenClaw agent runtime docs: <https://docs.openclaw.ai/agent>
- OpenClaw tools/plugins overview: <https://docs.openclaw.ai/tools/index>
- OpenClaw exec approvals: <https://docs.openclaw.ai/tools/exec-approvals>
- OpenClaw skills/security notes: <https://docs.openclaw.ai/tools/skills>
- OpenClaw plugin permission requests: <https://docs.openclaw.ai/plugins/plugin-permission-requests>
- ClawKeeper paper: <https://arxiv.org/abs/2603.24414>
- Security of OpenClaw Agents survey: <https://arxiv.org/abs/2605.25435>
