# PA-AI-E2E-001 — Acceptance Packet & Dependency Map (Sidecar)

- Sidecar task: `PA-AI-E2E-001-SIDECAR-ACCEPTANCE`
- Parent task: `PA-AI-E2E-001` — *Platform Admin agentic assistant live dev E2E and OpenClaw eval pack*
- Parent owner / reviewer: `Codex` / `Claude`
- Sidecar owner / reviewer: `Claude` / `Codex`
- Helper kind: `acceptance_packet`
- Date: 2026-06-03
- Status of this artifact: **support material only — does not mutate L1 canonical truth, contracts, or runtime/registry/governance code.**

> Scope note: This is a parallel-support slice. It organizes the acceptance
> surface and dependency readiness for the parent E2E task so the parent owner
> (`Codex`) can pick up execution faster. It is **not** the E2E implementation
> and it changes no canonical truth. The parent owner decides whether to absorb
> any of this into the mainline E2E work.

---

## 1. Purpose

`PA-AI-E2E-001` is the final acceptance + safety-eval task for the Platform
Admin agentic assistant wave (`platform-admin-agentic-assistant-20260603`). It
validates the whole vertical — real provider gateway, page context, caller-scoped
reads, form-fill confirm, governed action preview/execute, SA/SD/task-brief
generation, supervisor dispatch packet, and the security/prompt-injection eval —
against a live dev runtime.

This packet provides three things the parent owner needs before/while executing:

1. A **dependency readiness map** (which upstream slices are `done`, which gate E2E).
2. A normalized **acceptance checklist** that reconciles the two authoritative
   sources of the parent's acceptance (the live `ai-status.json` record and the
   committed task brief).
3. A **support/evidence plan** — how each acceptance line should be proven, and
   which lines are `EXTERNAL-GATED` (cannot run without a live dev provider key).

Authoritative sources used (precedence per `AI_COLLABORATION_GUIDE.md` §2):

- Live machine truth: `ai-status.json` record for `PA-AI-E2E-001` (read via
  `scripts/ai-status.sh show PA-AI-E2E-001`).
- Committed brief: `.orchestrator/task-briefs/PA-AI-E2E-001.md`.
- Architecture plan: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`.

---

## 2. Dependency Readiness Map

Status captured 2026-06-03 from `scripts/ai-status.sh show <id>`.

| # | Dependency | Title (short) | Owner | Reviewer | Status |
| - | --- | --- | --- | --- | --- |
| 1 | `PA-AI-REAL-001` | Real provider gateway | Codex | Claude | ✅ `done` |
| 2 | `PA-AI-CTX-001` | Page/form/table context mesh v2 | Codex | Claude | ✅ `done` |
| 3 | `PA-AI-RAG-001` | RAG + citation integration | Codex | Codex2 | ✅ `done` |
| 4 | `PA-AI-TOOLS-001` | Caller-scoped read tools | Codex2 | Claude | ✅ `done` |
| 5 | `PA-AI-ACTION-001` | Governed action execution | Codex2 | Claude | ✅ `done` |
| 6 | `PA-AI-DEV-001` | SA/SD + task-brief generation | Codex | Claude | ✅ `done` |
| 7 | `PA-AI-ORCH-001` | OpenClaw supervisor bridge | Codex2 | Claude | ✅ `done` |
| 8 | `PA-AI-SEC-001` | Safety policy / redaction / eval | Codex2 | Codex | ✅ `done` |
| 9 | `PA-AI-INTG-001` | OpenClaw OSS bootstrap & repo integration | Codex2 | Claude | ⏳ **`in_progress`** |

Related (not a parent dependency, context only):

| Task | Title (short) | Status |
| --- | --- | --- |
| `PA-AI-OSS-001` | OpenClaw direct runtime adoption plan (docs) | ✅ `done` |

### 2.1 Readiness verdict

- **8 of 9 listed dependencies are `done`.**
- The **only open gate is `PA-AI-INTG-001`** (OpenClaw OSS fetch/pin/bootstrap +
  first guarded smoke). The parent's live `next` field states this explicitly:
  > "Dependency tightened: E2E must wait for `PA-AI-INTG-001` so validation runs
  > against the repo-pinned OpenClaw bootstrap/runtime path rather than an ad hoc
  > local install."
- Therefore **E2E is dependency-blocked on exactly one slice.** Once
  `PA-AI-INTG-001` reaches `done` and the OpenClaw runtime can boot in isolated
  mode against the repo-pinned bootstrap, the parent's full dependency set is
  satisfied and E2E execution can begin.

### 2.2 ⚠️ Dependency-list discrepancy to reconcile

There is a mismatch between three records that the parent owner / reviewer should
reconcile (this packet does **not** change canonical truth, it only flags it):

- This sidecar's `depends_on` (8 ids) and the **committed** parent brief
  `.orchestrator/task-briefs/PA-AI-E2E-001.md` (8 deps) **both omit**
  `PA-AI-INTG-001`.
- The **live** `ai-status.json` record for `PA-AI-E2E-001` lists **9 deps,
  including `PA-AI-INTG-001`**, and its `next` field names `PA-AI-INTG-001` as
  the active blocker.

Resolution guidance (live machine truth wins per §2 precedence): treat
`PA-AI-INTG-001` as a real E2E gate. The committed brief and this sidecar's dep
list are stale on that one id; the parent owner may refresh the brief, but no
acceptance line below depends on closing that paperwork gap.

---

## 3. Acceptance Checklist (normalized)

The parent has **two** authoritative acceptance phrasings. The live
`ai-status.json` acceptance is OpenClaw-explicit (the runtime provider is
OpenClaw-backed); the committed brief is provider-agnostic. They map 1:1 except
for the OpenClaw wording and the orchestrator-vs-OpenClaw dispatch phrasing.
The table below uses the **live record** as the controlling text and notes the
brief variant where it differs.

| # | Acceptance line (live record controlling) | Maps to plan §10 row | Primary upstream dep(s) | Run class |
| - | --- | --- | --- | --- |
| A1 | Live dev smoke proves the **OpenClaw-backed** runtime provider is **non-mock** when a key is configured. *(brief: "runtime provider is non-mock")* | Real provider | `PA-AI-REAL-001`, `PA-AI-INTG-001` | **EXTERNAL-GATED** |
| A2 | E2E asks about `/payments`, verifies **page context** appears in the OpenClaw answer, receives **cited** guidance. | Page awareness + RAG | `PA-AI-CTX-001`, `PA-AI-RAG-001` | EXTERNAL-GATED (real answer) / mock-skippable |
| A3 | E2E invokes ≥1 **caller-scoped read tool** through OpenClaw, verifies **bounded** output. | Data awareness | `PA-AI-TOOLS-001` | EXTERNAL-GATED / partial mock |
| A4 | E2E proposes **form fills**, applies only after **user confirmation**. | Governed writes (form) | `PA-AI-CTX-001`, `PA-AI-ACTION-001` | UI E2E (mockable) |
| A5 | E2E **previews and executes** one safe Platform Admin action, verifies **receipt + audit**. | Governed writes (action) | `PA-AI-ACTION-001` | UI/API E2E |
| A6 | E2E generates **SA/SD/task-brief dry-run** artifacts from a feature-change request. | SA/SD generation | `PA-AI-DEV-001` | API E2E (dry-run) |
| A7 | E2E submits an **OpenClaw-backed supervisor dispatch packet** (or dev worker run) in **dry-run** mode and reads status. *(brief: "orchestrator dispatch packet in dry-run mode")* | Worker collaboration | `PA-AI-ORCH-001`, `PA-AI-INTG-001` | API E2E (dry-run) |
| A8 | E2E captures **watcher, guardrail, and prompt-injection** evidence for the direct-adoption safety eval. *(brief: prompt injection, forbidden scope, missing provider key, budget exceeded, high-risk action without reason)* | Security | `PA-AI-SEC-001` | API/unit eval (mockable) |
| A9 | Latest `origin/dev` deploy passes health check and **live assistant smoke**. *(plan §10 "Dev deploy" row — implied integration close)* | Dev deploy | all + dev deploy | **EXTERNAL-GATED + INTEGRATION** |

> A9 is from plan §10 (acceptance matrix) and the parent summary's "live dev"
> framing; it is the integration-layer close, not a per-test assertion. Track it
> via `INTEGRATION_STATUS`, not as a unit/E2E assertion.

### 3.1 Guardrails the E2E suite must honor (from parent brief)

- Do **not** require production credentials for tests.
- Live dev tests must be **skippable** with explicit `EXTERNAL-GATED` output when
  the real provider key is absent (do not fail the suite — mark gated).
- Do **not** mutate irreversible records in dev E2E (use safe/reversible actions
  and dry-run dispatch only).

---

## 4. Support / Evidence Plan

How each acceptance line should be proven, and where to put the evidence. Target
artifact homes are the parent's declared artifacts:
`tests/e2e/platform-admin-assistant-overlay.spec.ts`, `tests/e2e/`,
`apps/api/tests/`, `docs/04-uat/`.

| Acc | Suggested evidence form | Gated? |
| --- | --- | --- |
| A1 | Dev runtime health/provider endpoint reports `provider != mock`; a direct prompt returns a non-canned response. Capture provider name + run id. | Yes — needs `LLM_GATEWAY_API_KEY` + booted OpenClaw runtime |
| A2 | E2E spec navigates `/payments`, sends a context-bearing prompt, asserts the answer references current route/tab/visible records **and** includes ≥1 citation. | Real answer gated; structure assertions mockable |
| A3 | Spec triggers a `data.*` read tool, asserts output is scoped to caller and bounded (row cap / excerpt, no privilege widening). | Partly gated |
| A4 | Playwright: assistant proposes field diff on a form, asserts no value applied until explicit confirm, then asserts applied values match accepted fields. | No (UI behavior) |
| A5 | Pick a reversible action (e.g. create a test platform notice, or `set_maintenance_mode` toggle in dev sandbox); assert preview → confirm → execute → receipt id + audit entry (human actor + assistant session/run/tool ids). | No (use reversible action) |
| A6 | API dry-run of `dev.generate_sa` / `dev.generate_sd` / `dev.create_task_briefs`; assert artifacts produced with citations + task slicing; assert dry-run wrote nothing irreversibly. | No (dry-run) |
| A7 | Submit `assistant_dispatch_packet.v1` in dry-run through the orchestrator bridge; assert it validates task id/owner/reviewer/deps/scope and returns a readable status without queuing live work. | No (dry-run) |
| A8 | Eval cases: (1) prompt-injection in doc/page/tool output is neutralized; (2) forbidden scope rejected; (3) missing provider key → graceful `EXTERNAL-GATED`/degraded, not crash; (4) budget exceeded → blocked; (5) high-risk action without reason → blocked. Capture watcher + guardrail evidence. | No (fixtures) |
| A9 | `Deploy - Dev` run URL + SHA, health check pass, one live assistant smoke. Record under `INTEGRATION_STATUS=dev_deployed` only with that evidence. | Yes — integration |

### 4.1 EXTERNAL-GATED summary

- Lines that **cannot fully pass** without a live dev provider key + booted
  OpenClaw runtime: **A1, A2 (real-answer assertions), A3 (real-answer), A9**.
- Lines that are **runnable in CI/mock** without a key: **A4, A5, A6, A7, A8**,
  plus the structural (non-answer) assertions of A2/A3.
- The suite must emit explicit `EXTERNAL-GATED` markers for skipped live lines so
  a green run with the key absent is not mistaken for full acceptance.

---

## 5. Go / No-Go for parent E2E execution

**Conditional GO.** All capability dependencies that feed the *testable* assertions
(A2–A8) are `done`. The remaining gate is the **runtime bootstrap**
(`PA-AI-INTG-001`), which unblocks the EXTERNAL-GATED live lines (A1, A2/A3 real
answers, A9).

Recommended sequencing for the parent owner:

1. **Now (no key needed):** scaffold the E2E + eval suite and land the mockable
   lines A4–A8 plus structural A2/A3 — these have all deps `done`.
2. **On `PA-AI-INTG-001` → `done`:** enable the OpenClaw-backed live path and run
   A1 + A2/A3 real-answer + A7 OpenClaw dispatch against the repo-pinned runtime.
3. **On dev deploy:** close A9 and record `INTEGRATION_STATUS`.

No blocker is created by this packet; the single real blocker (`PA-AI-INTG-001`)
already exists and is owned (`Codex2`, reviewer `Claude`).

---

## 6. Notes for the reviewer (`Codex`)

- This artifact is the sole output of the sidecar; it adds no code and edits no
  canonical truth, contracts, runtime, registry, or governance files.
- Two items for the parent owner's attention are flagged above:
  - §2.2 — `PA-AI-INTG-001` is missing from the committed brief's + this
    sidecar's `depends_on`, but is a live gate; live machine truth controls.
  - §3 — the live acceptance text is OpenClaw-explicit while the committed brief
    is provider-agnostic; A1/A7 wording differs. No conflict in intent, just
    phrasing — captured so the E2E spec uses the controlling (live) wording.
- Dependency statuses are a 2026-06-03 snapshot; re-confirm `PA-AI-INTG-001` at
  E2E execution time via `scripts/ai-status.sh show PA-AI-INTG-001`.
