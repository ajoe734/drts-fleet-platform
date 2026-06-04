# Platform Admin Agentic Assistant Architecture Plan

Status: proposed for supervisor dispatch
Date: 2026-06-03
Owner: Codex
Scope: Platform Admin in-system assistant, real LLM gateway, governed system actions, SA/SD generation, and supervisor/auto-worker collaboration

## 1. Executive Summary

The current Platform Admin assistant is a useful UI and API skeleton, but it is
not yet the system-native helper the product needs. Dev must not stop at a mock
gateway. The target is an agentic assistant that lives inside Platform Admin,
understands the current route and visible records, can help fill forms and
complete governed operations, and can convert requested product changes into
SA/SD/task packets for the existing supervisor and auto-worker system.

The architecture should adopt OpenClaw directly as the primary agent runtime
for the Platform Admin assistant and development workers. DRTS still keeps the
policy boundary: OpenClaw owns session/run/tool orchestration, while all system
reads and writes stay behind DRTS API authorization, policy gates, audit
receipts, redaction, reviewer workflow, filesystem guardrails, and human
confirmation for risky actions.

## 2. Current Baseline

The current committed baseline provides these pieces:

| Area              | Current state                                                                                                          | Gap                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| UI overlay        | Floating Platform Admin assistant panel exists on dev.                                                                 | It is still a simple chat client and does not expose rich page/form context or action confirmations. |
| Provider contract | `LLM_GATEWAY_PROVIDER`, model, budget, and secret env vars are documented.                                             | Provider type is effectively mock-only in code; dev must support a real provider.                    |
| Tool registry     | Route/data/docs/action/audit tool families are described.                                                              | Most read tools and write tools are descriptors, not complete executable tool-call loops.            |
| Knowledge layer   | Approved docs retrieval and citation model exist.                                                                      | It is not yet tied into real LLM tool-use/RAG orchestration.                                         |
| Action layer      | `create_platform_notice` and `set_maintenance_mode` execution paths exist.                                             | It needs preview/confirm/execute UX, more domain tools, and action receipts in the chat flow.        |
| Orchestrator      | `.orchestrator` already has supervisor, branch routing, permission broker, tree guard, and worker dispatch primitives. | Platform Admin assistant has no safe bridge to create task packets or dispatch workers.              |

## 3. Product Objective

The assistant should be able to answer and act across two modes.

### 3.1 Operator Mode

Operator mode helps the logged-in Platform Admin user operate the product.

Required capabilities:

- Understand the current page, route, active tab, filters, selected record, form
  values, validation errors, visible table rows, and warnings.
- Read Platform Admin records through caller-scoped API tools only.
- Explain operational risk and cite approved docs/runbooks.
- Draft form values and operator checklists.
- Preview system mutations before execution.
- Execute confirmed operations under the current human actor identity.
- Emit action receipts and audit entries for every write.

### 3.2 Development Collaboration Mode

Development collaboration mode helps convert product-change requests into
engineering work.

Required capabilities:

- Capture a user's feature-change request from the current system/page context.
- Produce SA documents: problem, actors, workflow, data, risk, acceptance
  scenarios, operational impact.
- Produce SD documents: architecture, API contract, state machine, DB/migration
  impact, UI/component plan, tests, rollout, rollback.
- Create supervisor-ready task briefs with owners, reviewers, artifacts,
  dependencies, guardrails, and verification commands.
- Submit signed dispatch packets to the orchestrator bridge.
- Track worker progress, PRs, CI, deploy state, and blockers back in Platform
  Admin.

## 4. Identity, Login, and Account Model

There is no separate LLM user login inside Platform Admin. The assistant is
bound to the current authenticated Platform Admin actor.

| Concern              | Decision                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Human identity       | Use the current control-plane identity (`platform_admin`) from the API request.                       |
| Assistant identity   | Assistant sessions are subordinate to the human actor and cannot widen permissions.                   |
| Provider credentials | Store only in API runtime Secret Manager, never in `platform-admin-web`.                              |
| Dev provider         | Dev should use a real provider when `LLM_GATEWAY_API_KEY` is present. Mock is local/CI fallback only. |
| Production provider  | Fail fast if enabled with a real provider but no key.                                                 |
| Audit actor          | Audit writes include both the human actor and assistant session/run/tool ids.                         |

Dev env target:

```text
PLATFORM_ADMIN_ASSISTANT_ENABLED=true
LLM_GATEWAY_PROVIDER=openai|anthropic|openrouter|ollama
LLM_GATEWAY_API_KEY=Secret Manager: drts-dev-llm-gateway-api-key
LLM_GATEWAY_CHAT_MODEL=<approved model>
LLM_GATEWAY_SUMMARIZER_MODEL=<approved cheaper model>
NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED=true
```

## 5. Target Architecture

```text
Platform Admin Web
  Assistant Overlay
  Page/Form/Table Context Collector
  Action Confirmation UI
        |
        v
Platform Admin API
  Assistant Gateway
  Identity/RBAC/Policy/Redaction/Audit/Budget
  Real LLM Provider Router
  RAG + Tool Orchestrator
        |
        +-- System Operation Tool Bus
        |     route.*, data.*, docs.*, audit.*, action.*
        |
        +-- Development Collaboration Tool Bus
              dev.capture_requirement
              dev.generate_sa
              dev.generate_sd
              dev.create_task_briefs
              dev.submit_dispatch_packet
              dev.track_worker_status
        |
        v
Orchestrator Bridge
  Signed Dispatch Packets
  Permission Broker
  Branch Routing
  Worker Tree Guard
  OpenClaw Runtime Adapter
  Supervisor / Auto Workers
```

## 6. Component Design

### 6.1 Assistant Gateway

API module responsibilities:

- Own provider credentials, model routing, request budgets, and token telemetry.
- Normalize messages into a session/run/tool-call loop.
- Apply prompt-injection defenses before provider calls.
- Merge page context, RAG snippets, and tool outputs into bounded context.
- Return structured assistant responses, citations, action plans, and tool-call
  proposals.
- Persist or audit transcript metadata according to retention policy.

Candidate modules:

```text
apps/api/src/common/llm-gateway/
apps/api/src/modules/platform-admin-assistant/
```

Provider adapter interface:

```ts
interface LlmProviderAdapter {
  kind: "mock" | "openai" | "anthropic" | "openrouter" | "ollama";
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  stream?(request: LlmCompletionRequest): AsyncIterable<LlmStreamEvent>;
}
```

### 6.2 Context Mesh

The assistant needs more than route strings. It should receive a bounded context
packet from the page and from API read tools.

Context packet shape:

```json
{
  "schema": "platform_admin_assistant_context.v2",
  "route": {
    "pathname": "/payments",
    "title": "結算與帳務",
    "activeTab": "tenant-invoices",
    "refreshTier": "T4"
  },
  "page": {
    "visibleTables": [],
    "selectedRecords": [],
    "visibleWarnings": [],
    "availableActions": []
  },
  "forms": [
    {
      "formId": "platform-notice-form",
      "fields": [],
      "dirty": false,
      "validationErrors": []
    }
  ],
  "userIntent": {
    "rawPrompt": "幫我建立公告",
    "locale": "zh"
  }
}
```

Rules:

- Do not scrape arbitrary DOM as truth.
- Components should expose assistant-readable metadata through controlled
  registries and `data-assistant-*` attributes where needed.
- Context must be small and privacy-filtered.
- API read tools remain the source of record for sensitive data.

### 6.3 RAG and Knowledge Layer

Knowledge sources stay allowlisted and citation-backed.

Initial source families:

- Platform Admin design handoff and body parity docs.
- Platform Admin assistant docs.
- Product specs and architecture decisions relevant to Platform Admin.
- Runbooks and UAT matrices.
- Orchestrator task briefs generated by this assistant.

RAG constraints:

- Every answer that relies on docs includes citations.
- Prompt-injection text from docs is treated as untrusted content.
- Secrets, API keys, tokens, private headers, and once-only credentials are
  redacted before provider calls.
- Retrieval emits compact excerpts, not entire docs.

### 6.4 System Operation Tool Bus

Tool families:

| Family     | Mode  | Examples                                                                |
| ---------- | ----- | ----------------------------------------------------------------------- |
| `route.*`  | read  | list navigation nodes, inspect current route contract                   |
| `data.*`   | read  | tenants, partners, payments, pricing, flags, adapters                   |
| `docs.*`   | read  | search policy, fetch cited plan excerpts                                |
| `audit.*`  | audit | actor audit entries, action receipt evidence                            |
| `action.*` | write | create notice, update flags, approve/nudge queues, set maintenance mode |

Tool-call lifecycle:

```text
assistant proposes tool call
  -> API validates schema/RBAC/policy
  -> preview response with risk descriptor
  -> user confirms when required
  -> execute under human actor
  -> domain audit + assistant audit + receipt
  -> assistant summarizes result
```

Risk policy:

| Risk            | Confirmation | Reason   | Execution                                    |
| --------------- | ------------ | -------- | -------------------------------------------- |
| Low             | optional     | optional | can execute from inline confirmation         |
| Medium          | required     | optional | confirmation panel                           |
| High            | required     | required | confirmation panel + receipt + rollback note |
| External/system | required     | required | supervisor or human approval gate            |

### 6.5 Form and Workflow Assistant

The assistant should be able to fill forms, not by directly clicking arbitrary
DOM, but by working through a form registry.

Frontend responsibilities:

- Register forms, fields, validators, labels, help text, and current values.
- Render assistant-proposed field diffs.
- Let users accept all, accept selected fields, or reject.
- Keep final submit behind normal form/API validation.

API responsibilities:

- Validate field proposals against the same command contracts used by normal UI.
- Return structured validation errors the assistant can explain.
- Never bypass domain service policy.

### 6.6 Development Collaboration Tool Bus

New tool family: `dev.*`

| Tool                         | Purpose                                                   | Write target                             |
| ---------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| `dev.capture_requirement`    | Summarize user change request and current system context. | assistant session only                   |
| `dev.generate_sa`            | Draft system analysis document.                           | `docs/02-architecture/`                  |
| `dev.generate_sd`            | Draft system design document.                             | `docs/02-architecture/` or `docs/05-ui/` |
| `dev.create_task_briefs`     | Generate supervisor-ready task briefs.                    | `.orchestrator/task-briefs/`             |
| `dev.submit_dispatch_packet` | Ask orchestrator bridge to queue work.                    | orchestrator event queue                 |
| `dev.track_worker_status`    | Read worker/PR/CI/deploy status.                          | read-only                                |
| `dev.update_progress`        | Update progress/status docs through approved scripts.     | guarded docs/status paths                |

The assistant must not execute shell from the web process. Development writes go
through an orchestrator bridge with isolated worktrees and policy checks.

### 6.7 Orchestrator Bridge

The bridge is a local/control-plane service boundary between the API assistant
and `.orchestrator`.

Bridge responsibilities:

- Accept signed dispatch packets from the API.
- Validate task ids, owners, reviewers, dependencies, and mutation scope.
- Run worker tree guard before dispatching.
- Create or update task briefs.
- Queue supervisor events.
- Track worker lifecycle and return status to Platform Admin.

Dispatch packet:

```json
{
  "schema": "assistant_dispatch_packet.v1",
  "source": "platform-admin-assistant",
  "assistantSessionId": "paas_...",
  "actorId": "pa-admin-001",
  "taskId": "PA-AI-TOOLS-001",
  "title": "Implement Platform Admin assistant read tools",
  "owner": "Claude2",
  "reviewer": "Codex",
  "baseBranch": "dev",
  "artifacts": [],
  "acceptance": [],
  "risk": "medium",
  "createdAt": "2026-06-03T00:00:00Z"
}
```

### 6.8 Direct OpenClaw Runtime Adoption

OpenClaw is the default runtime for both Platform Admin assistant sessions and
DRTS dev workers. DRTS does not re-implement a parallel agent loop. Instead, it
wraps OpenClaw with DRTS-owned identity, policy, and control-plane adapters.

Adoption boundary:

- OpenClaw owns agent sessions, runs, tool-call sequencing, channel adapters,
  skill/plugin loading, and watcher-style runtime intervention.
- DRTS owns actor identity, RBAC, provider secret issuance, action confirmation,
  audit receipts, task lifecycle truth, branch routing, worker tree guard, and
  status scripts.
- OpenClaw must never become an authority for DRTS write policy, task truth, or
  credential storage.

OpenClaw-to-DRTS control-plane mapping:

| OpenClaw runtime concern | DRTS wrapper / owner                                     | Boundary rule                                                                   |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Session / run lifecycle  | Platform Admin assistant gateway + orchestrator bridge   | DRTS creates actor-bound sessions and can terminate runs.                       |
| Tool registry            | DRTS adapter-safe tool bus                               | Only DRTS-approved tool descriptors are exposed.                                |
| Exec / filesystem tools  | `.orchestrator/permission_broker.py` + worker tree guard | No writes outside isolated task worktree; no unrestricted shell.                |
| Skills / plugins         | DRTS allowlist and packaged runtime profile              | Third-party packages disabled by default; only reviewed bundles ship.           |
| Provider access          | DRTS Secret Manager broker                               | Runtime receives ephemeral scoped credentials, never long-lived keys in config. |
| Audit / transcript       | DRTS audit pipeline                                      | Tool calls, confirmations, and writes emit DRTS receipts.                       |
| Task state / progress    | `scripts/ai-status.sh` / `python3 scripts/ai_status.py`  | OpenClaw cannot mutate canonical machine truth directly.                        |
| Worker dispatch          | supervisor + signed dispatch packet                      | Runtime executes only after DRTS dispatch validation.                           |

Runtime packaging model:

- Platform Admin assistant uses OpenClaw through an API-side runtime adapter,
  not by embedding DRTS policy into prompt-only conventions.
- Dev workers launch OpenClaw in isolated task worktrees on task branches.
- The orchestrator bridge injects bounded task context, reviewed skills,
  allowlisted tools, and per-run environment variables.
- Production action tools stay DRTS-owned even when the run loop is OpenClaw.

Detailed adoption plan for dispatch task `PA-AI-OSS-001`:

- `docs/02-architecture/platform-admin-openclaw-style-runtime-evaluation-20260603.md`

## 7. Safety and Governance

Mandatory guardrails:

- Caller-scoped tools only; no privilege widening.
- Provider keys stay in DRTS Secret Manager or short-lived runtime injection
  only; never in checked-in config, plugin bundles, or persistent OpenClaw home.
- Prompt-injection filtering for docs, page content, and tool output.
- Redaction before persistence and before provider calls.
- Rate, token, and daily cost budgets.
- Tool allowlist by environment.
- High-risk action reason and confirmation.
- Domain audit and assistant audit for all writes.
- Orchestrator writes go through bridge + tree guard + isolated worktree.
- OpenClaw filesystem access is constrained to the assigned task worktree and
  explicit output paths.
- OpenClaw exec/tool approvals are subordinate to DRTS permission broker policy.
- Dev/prod behavior differs explicitly; mock mode cannot masquerade as real
  provider mode.

Environment policy:

| Environment | Provider                                                     | Writes                     | Orchestrator dispatch                    |
| ----------- | ------------------------------------------------------------ | -------------------------- | ---------------------------------------- |
| local       | mock by default, real optional                               | sandbox/local only         | optional                                 |
| CI          | mock only                                                    | test fixtures only         | no live dispatch                         |
| dev         | real provider required for acceptance; mock only as degraded | enabled with confirmations | enabled behind OpenClaw adapter + bridge |
| staging     | real provider after approval                                 | limited pilot              | limited OpenClaw pilot                   |
| prod        | approved provider only                                       | strict policy              | disabled unless separately approved      |

## 8. Implementation Phases

### Phase 0: Decision Reset and Runtime Contract

- Update docs, task briefs, and board summaries to state that OpenClaw direct
  adoption is the default runtime direction.
- Freeze the DRTS-owned policy boundary: identity, secret broker, audit,
  confirmation, status truth, and worker tree guard stay first-party.
- Define the OpenClaw runtime profile for Platform Admin and dev workers:
  reviewed skills/plugins only, scoped tools only, isolated filesystem only.

### Phase 1: Dev Worker Pilot

- Run OpenClaw as the default dev worker runtime in isolated task worktrees.
- Map existing supervisor dispatch packets to OpenClaw session/run launches.
- Prove status writes, branch routing, and tree guard stay authoritative outside
  the runtime.
- Acceptance: dispatched worker task runs through OpenClaw with bounded tools
  and no direct machine-truth mutation.

### Phase 2: Real Read-Only Assistant

- Implement real provider gateway.
- Add context mesh v2.
- Connect OpenClaw runtime adapter, RAG, and read-only tools.
- Dev acceptance: ask about current page and visible records with cited answers
  from real provider.

### Phase 3: Governed Operator Actions

- Add preview/confirm/execute lifecycle to chat UI.
- Expand Platform Admin action tools.
- Emit receipts and audit entries.
- Dev acceptance: assistant previews and executes a safe platform action.

### Phase 4: Development Collaboration

- Add SA/SD generation tools.
- Add task brief generator.
- Add progress/status writer through approved scripts.
- Dev acceptance: user request becomes archived SA/SD and task briefs.

### Phase 5: Supervisor / Auto-Worker Bridge

- Add signed dispatch packet endpoint.
- Queue work through existing supervisor primitives and the OpenClaw runtime
  adapter.
- Track PR/CI/deploy state in assistant panel.
- Dev acceptance: assistant creates a task packet and supervisor picks it up.

### Phase 6: Staging Pilot and Hardening

- Add eval scenarios, prompt-injection tests, RBAC tests, budget tests, and live
  smoke.
- Run red-team cases for malicious docs/page text/tool output.
- Run a staging pilot with reviewed skill/plugin bundles, ephemeral credentials,
  and audited tool traces.
- Keep rollback documented.

## 9. Parallel Dispatch Plan

These tasks are intentionally split for parallel execution. Dependencies exist
only when a later task consumes an implemented contract.

| Task               | Owner   | Reviewer | Can start now | Depends on                           |
| ------------------ | ------- | -------- | ------------- | ------------------------------------ |
| `PA-AI-REAL-001`   | Gemini  | Claude2  | yes           | none                                 |
| `PA-AI-CTX-001`    | Claude2 | Codex    | yes           | none                                 |
| `PA-AI-RAG-001`    | Codex   | Claude   | yes           | none                                 |
| `PA-AI-TOOLS-001`  | Claude  | Codex2   | yes           | none                                 |
| `PA-AI-SEC-001`    | Codex2  | Claude   | yes           | none                                 |
| `PA-AI-OSS-001`    | Codex2  | Claude   | yes           | none                                 |
| `PA-AI-ACTION-001` | Codex2  | Claude2  | partial       | `PA-AI-TOOLS-001` for full execution |
| `PA-AI-DEV-001`    | Claude  | Codex    | partial       | `PA-AI-RAG-001` for cited generation |
| `PA-AI-ORCH-001`   | Gemini2 | Claude   | partial       | `PA-AI-DEV-001`, `PA-AI-SEC-001`     |
| `PA-AI-E2E-001`    | Gemini  | Codex    | no            | all implementation tasks             |

OpenClaw-specific dependency notes:

- `PA-AI-SEC-001` defines the credential, audit, and tool boundary that
  `PA-AI-ORCH-001` must enforce around OpenClaw.
- `PA-AI-ORCH-001` maps supervisor events and dispatch packets onto OpenClaw
  runtime launches.
- `PA-AI-DEV-001` assumes task brief generation and progress writes happen from
  an OpenClaw worker through approved scripts, not direct status-file mutation.

## 10. Acceptance Matrix

| Capability           | Required evidence                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| Real provider        | Dev runtime reports non-mock provider when key is present; direct prompt returns non-mock response.      |
| Page awareness       | Assistant answer includes current route, active tab, form/table context, and visible entity refs.        |
| Data awareness       | Assistant can call read tools and summarize current tenant/partner/payment records within caller scope.  |
| Governed writes      | Assistant can preview, confirm, execute, and receipt at least two write actions.                         |
| SA/SD generation     | User request produces archived SA and SD docs with citations and task slicing.                           |
| Worker collaboration | Assistant submits signed dispatch packet and supervisor/auto-worker status is visible in Platform Admin. |
| Security             | Prompt-injection, RBAC, redaction, budget, and confirmation tests pass.                                  |
| Dev deploy           | Latest `origin/dev` deploy passes health check and live assistant smoke.                                 |

## 11. Open Questions

- Which real dev provider should be first: OpenAI, Anthropic, OpenRouter, or
  local Ollama?
- Should dev allow autonomous low-risk writes without per-action confirmation,
  or require confirmation for every assistant write during pilot?
- Which Platform Admin modules are first pilot surfaces for write actions:
  notices/maintenance only, or payments/tenants/pricing too?
- Which reviewed OpenClaw skill/plugin bundle should be the minimal production
  profile for Platform Admin and dev workers?

## 12. Decision Recommendation

Proceed with direct OpenClaw runtime adoption under DRTS-owned policy control:

- Use OpenClaw as the default runtime for assistant sessions and dev workers.
- Keep all system actions behind DRTS API policy, confirmation, and audit.
- Keep the existing `.orchestrator` as the control plane, task truth, branch
  router, and guard layer around OpenClaw execution.
- Ship only a reviewed OpenClaw runtime profile with DRTS-owned credential,
  tooling, and filesystem boundaries.
- Roll out in phases: dev worker pilot first, then read-only assistant, then
  governed actions and dispatch.
- Dispatch the parallel task set in section 9 after this plan is accepted.

## 13. External References For PA-AI-OSS-001

These references are evaluation inputs, not adopted architecture by themselves:

- OpenClaw repository: `https://github.com/openclaw/openclaw`
- OpenClaw agent CLI documentation: `https://docs.openclaw.ai/cli/agent`
- ClawKeeper safety paper: `https://arxiv.org/abs/2603.24414`
- OpenClaw security survey: `https://arxiv.org/abs/2605.25435`
