# PH1GC-FWD-001 — Sidecar Acceptance Packet

**Sidecar Task ID:** `PH1GC-FWD-001-SIDECAR-ACCEPTANCE`
**Parent Task ID:** `PH1GC-FWD-001`
**Helper Kind:** `acceptance_packet`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Claude`
**Parent Owner:** `Codex` (per `ai-status.json` task `PH1GC-FWD-001`, status `pending`; also row 10 of `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` §4)
**Parent Reviewer:** `Codex2` (per `ai-status.json` task `PH1GC-FWD-001`)
**Collected:** `2026-05-22 (UTC)`
**Revision:** `r2 — refreshed against canonical machine truth after r1 review-reject (stale dependency statuses, non-existent task ids, non-landed file path)`
**Sidecar status:** `support-only artifact — does NOT mutate canonical truth, does NOT itself flip any workflow gate`

> **Authority note for the reviewer:** every dependency / status / path claim in this packet is sourced from one of two places and explicitly labelled where the difference matters:
> - **`ai-status.json` (machine truth)** — single source of truth for task ids, statuses, owners, and reviewers. If a task does not appear in `ai-status.json`, this packet does not treat it as a dependency.
> - **`origin/dev` tree (delivery truth)** — single source of truth for whether a file has actually landed. A task marked `done` in `ai-status.json` whose artifact is not on `origin/dev` is called out explicitly. The status-truth doc (`docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`) explains the divergence and is the reason the `PH1GC-*` namespace exists.
>
> The standalone `.orchestrator/task-briefs/*.md` files are **not** treated as machine truth in this packet. Several brief files (e.g. `FWD-VERIF-001.md`, `BE-FIN-FWD-001.md`) exist on disk but have no matching task in `ai-status.json`; those are listed in §5.2 as non-canonical references only.

---

## 0. Purpose and non-claims

This packet is a **support sidecar** for parent brief `PH1GC-FWD-001` ("Phase 1 gap closure — forwarder sandbox proof set"). It:

1. Restates the 11 `§D FWD-001` proof items so the parent-task owner can use a single checklist.
2. Maps the dependency graph between `PH1GC-FWD-001`, the existing `FWD-*` task family, and the canonical artifacts that gate-read on the result.
3. Pre-fills the `§7 Closeout report` template so the parent owner can paste evidence into the same shape the directive demands.
4. Calls out the items the parent owner cannot skip (real sandbox endpoint, masked credentials, classification labelling) and the failure modes the reviewer should check.

This packet does **not**:

- modify L1 canonical truth (`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`, `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`, `packages/contracts/**`, `apps/api/src/modules/forwarder/**`)
- declare `WF-FWD-001` uplifted from `EXTERNAL-GATED` to `PASS (sandbox evidence)` — that flip belongs to the parent task's evidence drop, not this packet
- replace `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` — that file remains the canonical evidence carrier; this packet only adds an acceptance overlay

If anything below conflicts with the directive at `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` or the status truth at `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`, the directive and status truth win.

---

## 1. Canonical source rollup (for parent owner's reading list)

The parent owner should read these in order before producing the evidence drop. Every row is annotated `LANDED` (file present on `origin/dev` as of 2026-05-22) or `NOT LANDED` (referenced in a brief / state.json but missing from `origin/dev`). `NOT LANDED` sources may inform planning but **must not** be cited as authoritative truth in the evidence pack.

| Layer | Path | Lands on origin/dev? | Why |
| ----- | ---- | -------------------- | --- |
| Directive | `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` §D + §7 | `LANDED` | Defines the 11 proof items and the closeout report format |
| Status truth | `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` §2.4 + §4 (row 10) | `LANDED` | Confirms `support/sidecars/FWD-LIVE-001/` currently has 1 file and lists `PH1GC-FWD-001` as the driving brief; explicitly warns that older `done` markers (incl. FWD-LIVE-001, FWD-SPEC-001) do not imply artifacts on `origin/dev` |
| Parent task record | `ai-status.json` → `PH1GC-FWD-001` | `LANDED` | Authoritative owner/reviewer/status. Currently: owner `Codex`, reviewer `Codex2`, status `pending` |
| Parent brief | `.orchestrator/task-briefs/PH1GC-FWD-001.md` | `LANDED` (brief file only) | Supplementary planning ref. Brief's "Short Summary" mentions a Codex2 reassignment attempt — ignore if it conflicts with `ai-status.json`, since machine truth wins |
| Existing evidence baseline | `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` | `LANDED` | The single file that exists in the `FWD-LIVE-001/` sidecar dir today; records why the 2026-05-19 attempt could not collect sandbox proof (gcloud reauth, 404 host, NXDOMAIN). PH1GC-FWD-001 extends this sidecar, it does not replace it |
| Adapter proof spec | `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md` | **`NOT LANDED`** | Marked `done` under `FWD-SPEC-001` in `ai-status.json` but the file currently exists only on branch `codex2/fwd-spec-001` (commit `34d7f312` / `f249aec`). Parent owner cannot cite this path as authoritative until it merges into `dev`. Until then, fall back to the directive §D wording for proof-item structure |
| Sandbox harness (doc) | `docs/02-architecture/forwarder-sandbox-provider.md` | `LANDED` | Generic forwarder sandbox provider doc — usable for `repo-local FWD-SBX-001 harness` classification |
| Sandbox harness (code) | `apps/api/src/modules/forwarder/sandbox.adapter.ts`, `apps/api/src/modules/forwarder/sandbox.fixtures.ts` | `LANDED` | Shipped under `FWD-SBX-001` (status `done` in `ai-status.json`); usable as the in-repo sandbox source when no external partner sandbox is reachable |
| Real-platform adapter (still stub) | `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts`, `packages/contracts/src/platform-codes.ts` | `LANDED` | Confirms the shipped real adapter is `forwarder_stub` / `mode: "stub"` — sandbox evidence cannot come from the shipped code path; it must come from a real partner sandbox or the `FWD-SBX-001` harness |
| Release-gate truth | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` (line 69 `WF-FWD-001` row) | `LANDED` | Current gate read is `EXTERNAL-GATED`; this is what the parent owner flips, per §3 below |
| Cross-repo gap | `docs/03-runbooks/cross-repo-gap-matrix-20260424.md` (line 45 Grab Taiwan adapter row) | `LANDED` | Currently `external-gated`; references `EXT-002-BLK-001..007` |
| Blocker authority | `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` | `LANDED` | Binding blocker packet for `EXT-002-BLK-001..007` (lines 34–40); the parent owner partially closes these blockers via the sandbox evidence drop |
| E2E entry point | `tests/e2e/E2E-002-forwarded-order.sh` | `LANDED` | Already rewired against the sandbox harness under `FWD-E2E-001` (status `done` in `ai-status.json`). If the parent owner reruns E2E-002, link the run id; do not edit the script |

---

## 2. Acceptance checklist — §D FWD-001 eleven proof items

Each item below mirrors a bullet in directive §D `FWD-001 — Forwarder Sandbox Proof`. The parent owner's evidence drop into `support/sidecars/FWD-LIVE-001/` must satisfy every row. Reviewer (`Codex2`) signs off only when every row is `PASS` or `PASS (repo-local)` with the classification label correctly applied.

> **Classification rule from §D:** if only an internal mock is available, the sidecar README must state `classification = repo-local` and the matrix gate read stays `PASS (repo-local)`. The packet must **not** claim `sandbox` in that case. Purely-local fixtures dressed up as sandbox proof are a hard reject.

| # | Proof item | Required content | Where it lands in the sidecar |
| - | ---------- | ---------------- | ----------------------------- |
| D1 | Platform name + sandbox source | Concrete partner name (e.g. Grab Taiwan sandbox, Gogoro test tenant) **or** explicit `repo-local sandbox provider (FWD-SBX-001)` classification | `FWD-LIVE-001-EVIDENCE-PACK.md` §2 platform identity, plus a top-of-file `Classification:` banner |
| D2 | Credential source / masked reference | Masked credential ID, vault path / Secret Manager ref, who holds the real secret; no raw tokens; if no real credential, say so and downgrade classification | Same evidence pack §3 credential reference |
| D3 | Inbound order sample | Real (masked) inbound order payload + timestamps; corresponding `forwarder_mirror` audit row id; idempotency key visible | New file or pack section — `inbound-order.sample.json` + walkthrough |
| D4 | Accept relay sample | Accept relay request/response captured against the sandbox; driver platform task id; route-locked confirmation | `accept-relay.sample.json` + walkthrough |
| D5 | Lost-race callback | Sandbox lost-race event; expected response (idempotent no-op); audit row id; no duplicate driver assignment | `lost-race.callback.json` + walkthrough |
| D6 | Cancel callback | Sandbox cancel event; mirror lifecycle row id; driver-side task transition; rollback if accept was in flight | `cancel.callback.json` + walkthrough |
| D7 | Complete callback | Sandbox complete event; status sync into DRTS; settlement-prep trigger if applicable | `complete.callback.json` + walkthrough |
| D8 | Settlement sample | Settlement payload + ledger / `platform_earnings` row id; gross / drts-fee / net split; **settlement authority** label (passthrough vs drts fee) | `settlement.sample.json` + ledger row reference (cross-link to `BE-FIN-FWD-001` if landed) |
| D9 | No-owned-assignment proof | Evidence that the forwarded task did **not** create an owned dispatch assignment row; queryable check (`SELECT … FROM dispatch_assignments WHERE source_platform != 'drts'`) and zero-row result | `no-owned-assignment.proof.md` + audit query result |
| D10 | Replay / idempotency proof | Same callback delivered ≥2 times yields one logical state transition + duplicate-event audit row; idempotency key reused; HTTP 2xx both times | `replay-idempotency.proof.md` + both audit rows |
| D11 | Webhook signature proof | Real signature header (masked) for at least one inbound callback; verification path executed; tampered-signature negative test (HTTP 401/403); secret rotation policy referenced | `webhook-signature.proof.md` + verification log excerpt |

### 2.1 Cross-cutting acceptance rules (apply to every item above)

- Every JSON / log sample stripped of raw partner secrets; tokens / API keys masked to last-4 only.
- Every sample timestamped (`collected_at: <RFC3339 UTC>`) and pinned to the partner sandbox host name (real or `FWD-SBX-001` harness host).
- Every item cross-links the corresponding audit row id or DB row id so the reviewer can re-derive the state without re-running the sandbox.
- The top-of-pack `Classification:` banner is exactly one of: `sandbox (external partner)`, `sandbox (repo-local FWD-SBX-001 harness)`, or `repo-local mock only`. The gate-read uplift in §3 follows directly from this banner.

### 2.2 Hard rejects (reviewer must fail the handoff if any apply)

- Banner claims `sandbox (external partner)` but credential reference points only to an internal env var with no vault path.
- Any item references `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts` as the source of behavior — it is `mode: "stub"`, so it cannot produce sandbox evidence on its own; the harness or real partner must be the source.
- Replay proof shows two distinct logical state transitions instead of one.
- No-owned-assignment proof is asserted in prose but the supporting query / row dump is missing.
- Classification banner is `repo-local mock only` but the gate-read uplift in §3 still claims `PASS (sandbox evidence)`.
- Closeout report (§4 below) omits any required field, or `Gate read after:` contradicts `Classification:`.

---

## 3. Gate-read uplift table — what flips and what does not

> **Reminder:** flipping these gate reads is the parent owner's job, not this packet's. This table is the parent owner's pre-write checklist so the changes to canonical truth are minimal, atomic, and reversible.

| Canonical file | Today's read | If classification = sandbox (external or harness) | If classification = repo-local mock only |
| -------------- | ------------ | ------------------------------------------------- | ---------------------------------------- |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` → `WF-FWD-001` row | `EXTERNAL-GATED` | `PASS (sandbox evidence)` | Stay `EXTERNAL-GATED` or move to `PASS (repo-local)` per directive §D acceptance |
| `docs/03-runbooks/cross-repo-gap-matrix-20260424.md` → Grab Taiwan real adapter row | `external-gated` | Update to reflect sandbox proof obtained; keep `external-gated` on the live-prod cell | Leave row unchanged; cite this sidecar as why |
| `docs/04-uat/fbp-014a-e2e-matrix.md` → forwarder rows | Whatever `FWD-E2E-001` already set | No change unless E2E-002 was rerun against the sandbox; if rerun, link the run id | No change |
| `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` | Open blockers `EXT-002-BLK-001..007` | Mark BLK-004..007 closed with link to evidence; BLK-001..003 close only if the partner contract/credential/signature artifacts are real-partner | Mark BLK-001..007 as still open; cite repo-local mock classification |

Any change beyond this table is **out of scope** for the parent task and should be split into a separate brief.

---

## 4. Closeout report template (directive §7) — pre-filled scaffold

The parent owner pastes this into the parent task's closeout note when handing off to `Codex2`. Fields marked `<…>` are owner-supplied; the rest is fixed by this packet.

```text
Task ID: PH1GC-FWD-001
Owner: Codex
Reviewer: Codex2
Branch: <e.g. codex/ph1gc-fwd-001>
PR: <PR number or "n/a — direct dev push (allowed for sidecar evidence)">
Commit: <commit SHA of the evidence drop on dev>
Files changed:
  - support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md   (updated header + sections per §D)
  - support/sidecars/FWD-LIVE-001/inbound-order.sample.json
  - support/sidecars/FWD-LIVE-001/accept-relay.sample.json
  - support/sidecars/FWD-LIVE-001/lost-race.callback.json
  - support/sidecars/FWD-LIVE-001/cancel.callback.json
  - support/sidecars/FWD-LIVE-001/complete.callback.json
  - support/sidecars/FWD-LIVE-001/settlement.sample.json
  - support/sidecars/FWD-LIVE-001/no-owned-assignment.proof.md
  - support/sidecars/FWD-LIVE-001/replay-idempotency.proof.md
  - support/sidecars/FWD-LIVE-001/webhook-signature.proof.md
  - docs/03-runbooks/phase1-workflow-acceptance-release-gates.md   (WF-FWD-001 gate read only)
  - support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md     (BLK status update only)
Verification commands:
  - `ls support/sidecars/FWD-LIVE-001/` shows all 11 §D files
  - `grep -E "^Classification:" support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` returns the chosen classification
  - `grep -n "WF-FWD-001" docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` shows the new gate read
  - For sandbox-classified: replay the callback through the harness and confirm a single logical transition
Evidence artifact: support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md (and the 9 supporting sample / proof files)
Workflow family affected: WF-FWD-001
Gate read before: EXTERNAL-GATED
Gate read after: <PASS (sandbox evidence) | PASS (repo-local) | EXTERNAL-GATED>
Remaining non-claim:
  - Live production partner integration is NOT claimed by this evidence drop.
  - Real Grab Taiwan adapter (apps/api/src/modules/forwarder/grab-taiwan.adapter.ts) remains mode="stub" / productionStatus="stub".
  - WF-FWD-001 production live evidence still owned by EXT-002-BLK-001..007 follow-up work.
External dependencies, if any: <sandbox credential issuer / partner contact / harness reachability>
```

The reviewer rejects the handoff if any line is missing or if `Gate read after:` is inconsistent with the evidence pack `Classification:` banner.

---

## 5. Dependency map

> Every row below cites the actual task entry in `ai-status.json` as machine truth, then separately notes whether the underlying **artifact** is landed on `origin/dev`. The two answers are **not** the same — several `FWD-*` tasks are marked `done` in `ai-status.json` while their target artifacts are not yet on `origin/dev`. This is the central observation of `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` and the reason the `PH1GC-*` namespace exists.

### 5.1 Upstream prerequisites for PH1GC-FWD-001 (machine-truth tasks)

| Task | `ai-status.json` status (2026-05-22) | Owner / Reviewer | Artifact on `origin/dev`? | Why it matters for PH1GC-FWD-001 |
| ---- | ------------------------------------ | ---------------- | ------------------------- | -------------------------------- |
| `FWD-SPEC-001` (Forwarder adapter proof spec) | `done` | Codex2 / Codex | **No** — file `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md` exists only on branch `codex2/fwd-spec-001` (commit `34d7f312` / `f249aec`); never merged into `dev` | Spec would have shaped the proof-item structure. Since it has not landed, **PH1GC-FWD-001 must derive the 11-item structure directly from the directive §D wording**, not from this spec. Cite the directive, not the unmerged spec, when justifying field layouts |
| `FWD-SBX-001` (Generic Forwarder Sandbox Provider harness) | `done` | Codex / Codex2 | **Yes** — `apps/api/src/modules/forwarder/sandbox.adapter.ts`, `apps/api/src/modules/forwarder/sandbox.fixtures.ts`, and `docs/02-architecture/forwarder-sandbox-provider.md` are all on `dev` | The only in-repo source legitimately tagged "sandbox" — used when no external partner sandbox is reachable. Allowed classification: `sandbox (repo-local FWD-SBX-001 harness)`; otherwise fall back to `repo-local mock only` |
| `FWD-E2E-001` (Convert WF-FWD-001 from external-gated to sandbox-proven via E2E-002) | `done` | Codex2 / Codex | **Yes** — `tests/e2e/E2E-002-forwarded-order.sh` is on `dev` | If PH1GC-FWD-001 reruns E2E-002, link the run id; do not modify the script |
| `FWD-LIVE-001` (Forwarder external platform live evidence pack) | `done` | Codex2 / Codex | **Partial** — `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` is on `dev`, but the dir contains only that one file; the 10 supporting proof files demanded by directive §D are missing | This is the gap PH1GC-FWD-001 closes. **Do not re-mark `FWD-LIVE-001` itself** — PH1GC-FWD-001 extends the same sidecar dir |
| `EXT-002` (Real forwarder adapter proof gate) | `done` | Gemini2 / Codex | **Yes** — `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` is on `dev` and lists `EXT-002-BLK-001..007` (lines 34–40) | Defines the seven open blockers. PH1GC-FWD-001's evidence drop partially closes BLK-004..007 (and BLK-001..003 only when real-partner artifacts are present) — see §3 |

### 5.2 Non-machine-truth references (brief files present, no task in `ai-status.json`)

These IDs appear in `.orchestrator/task-briefs/*.md` but **do not exist as tasks in `ai-status.json`**. Treat them as background planning context only; do not list them as dependencies in the evidence pack or closeout report.

| Brief file | What the brief proposed | Why PH1GC-FWD-001 does not depend on it |
| ---------- | ----------------------- | --------------------------------------- |
| `.orchestrator/task-briefs/FWD-VERIF-001.md` | Real-platform integration evidence verification (per `docs/03-runbooks/forwarder-production-adapter-rollout-runbook.md`) | Brief is `review_approved` only on disk; no matching task in `ai-status.json`. The directive §D supplies the verification methodology PH1GC-FWD-001 needs |
| `.orchestrator/task-briefs/BE-FIN-FWD-001.md` | `/api/tenant/reports/settlement-by-platform-source` endpoint | Brief is `backlog` only on disk; no matching task in `ai-status.json`. If the endpoint lands later, D8 (Settlement sample) may optionally cross-link it; PH1GC-FWD-001 is not blocked on it. Until then, D8 cites the raw `platform_earnings` row id |

### 5.3 Downstream tasks that read PH1GC-FWD-001's gate flip

| Task / consumer | `ai-status.json` status | What it watches |
| --------------- | ----------------------- | --------------- |
| `PH1GC-MATRIX-001` (Phase 1 gap closure — release gate matrix reconciliation) | `pending` (Codex2 / Codex) | Re-reads `WF-FWD-001` after the flip; will cross-check all 12 → 16 matrix rows per `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` §2.5. PH1GC-FWD-001 must land before MATRIX-001 reruns its cross-check sweep |
| Directive §10 final checklist row `[ ] support/sidecars/FWD-LIVE-001/` | n/a (checklist row) | Flips from unchecked to checked only when this sidecar contains all 11 §D items |
| Directive §8 condition 7 ("Forwarder 至少 sandbox evidence") | n/a (gate condition) | Satisfied once PH1GC-FWD-001 lands sandbox-classified evidence (external or `FWD-SBX-001` harness) |

### 5.4 Dependency graph (textual, machine-truth aligned)

```
              ai-status.json: FWD-SBX-001 = done (artifact LANDED on dev)
                                       │
                                       ▼
docs/00-context/.../gap-closure-implementation-spec-20260520.md  §D  (LANDED, directive)
                                       │
                                       ▼
            PH1GC-FWD-001  (ai-status.json: pending, owner Codex, reviewer Codex2)
                                       │
                                       ▼
                support/sidecars/FWD-LIVE-001/  (extended with 11 §D items)
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
   WF-FWD-001 gate read     EXT-002-BLK-001..007       PH1GC-MATRIX-001
   (release-gates.md)       (partial close-out)        (pending, re-runs cross-check)
                                                              │
                                                              ▼
                                         directive §10 / §8 condition 7 rolls forward
```

Notes on the graph:

- `FWD-SPEC-001` (status `done`, artifact NOT on `dev`) is intentionally **not** an upstream arrow into PH1GC-FWD-001 — the directive §D wording is the authoritative source for proof-item structure until the spec file actually merges.
- `FWD-VERIF-001` and `BE-FIN-FWD-001` are intentionally **absent** from the graph because they have no machine-truth task entry.
- `FWD-LIVE-001` is the sidecar dir PH1GC-FWD-001 extends, not an upstream arrow — its `done` status in `ai-status.json` is what the status-truth doc explicitly flags as incorrect, and PH1GC-FWD-001 is the corrective work.

---

## 6. Support guidance for the parent owner

These are **strong suggestions** (not directive overrides) to help the parent owner avoid the failure modes the 2026-05-19 attempt hit:

1. **Decide classification first.** Before producing any sample, decide whether the evidence will be `sandbox (external partner)`, `sandbox (repo-local FWD-SBX-001 harness)`, or `repo-local mock only`. Write the banner at the top of `FWD-LIVE-001-EVIDENCE-PACK.md` before writing anything else; every later choice flows from it.
2. **If external sandbox creds are blocked**, do not stall the brief — switch classification to `sandbox (repo-local FWD-SBX-001 harness)` and produce evidence from the harness with `Gate read after: PASS (repo-local)`. `FWD-SBX-001` is `done` in `ai-status.json` and `apps/api/src/modules/forwarder/sandbox.adapter.ts` / `sandbox.fixtures.ts` / `docs/02-architecture/forwarder-sandbox-provider.md` are all already on `origin/dev`, so this path is unblocked today. The 2026-05-19 telemetry (gcloud reauth, 404 host, NXDOMAIN) strongly suggests this is the path of least resistance.
3. **Idempotency / replay (D10) is the most common failure mode.** Capture the second delivery using the exact same idempotency key and signature; both must return HTTP 2xx and must not create a second mirror row. Reviewer will diff the audit rows directly.
4. **No-owned-assignment (D9) requires a SQL query result, not prose.** Run `SELECT id, source_platform, owner FROM dispatch_assignments WHERE forwarded_task_id = '<sample id>'` and paste the (empty) result. If the schema columns differ, cite the actual schema in `apps/api/src/modules/forwarder/**` rather than guessing.
5. **Webhook signature (D11) needs both the positive and the negative path.** Tamper the signature header by one byte and confirm rejection. A single HTTP 200 trace is not enough.
6. **When updating canonical files, keep the diff to the minimum changes listed in §3.** Reviewer will reject sweeping rewrites of `phase1-workflow-acceptance-release-gates.md` or `cross-repo-gap-matrix-20260424.md` in the same commit as the evidence drop. Touch only the `WF-FWD-001` row and the Grab Taiwan adapter row respectively.
7. **Anchor-commit on the parent branch (`codex/ph1gc-fwd-001` or whatever the owner picks) before yielding** — per `docs/ops/branch-strategy.md` §11.1, the canonical files in §3 are fragile-surface; do not leave the diff in working tree across a supervisor cycle.
8. **Do not cite the un-merged FWD-SPEC-001 spec file as authoritative.** `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md` is only on branch `codex2/fwd-spec-001` (commit `34d7f312` / `f249aec`), not on `origin/dev`. Anchor the evidence pack's structure on directive §D (which is landed). If the spec file lands on `dev` mid-task, it is safe to cross-link, but do not treat it as the canonical proof-set definition until then.

---

## 7. Handoff summary for reviewer

When `Codex2` receives the parent task as `review`:

1. Verify `support/sidecars/FWD-LIVE-001/` on `origin/dev` contains a top-of-file `Classification:` banner.
2. Walk the 11 rows in §2 against the actual files in `support/sidecars/FWD-LIVE-001/`; mark each PASS / FAIL.
3. Confirm the closeout report (§4) is complete and the `Gate read after:` is consistent with the classification banner.
4. Re-verify the canonical-truth edits in §3 are scoped exactly as listed and no unrelated lines were touched.
5. If every check passes → `approve`. If any hard reject (§2.2) fires → `reopen` with a citation to this packet's §2.2.

---

## 8. This sidecar's own closeout (for PH1GC-FWD-001-SIDECAR-ACCEPTANCE)

```text
Task ID: PH1GC-FWD-001-SIDECAR-ACCEPTANCE
Owner: Codex
Reviewer: Claude
Branch: codex/ph1gc-fwd-001-sidecar-acceptance
PR: n/a — sidecar acceptance packet, mutates_canonical = false
Revision: r2 — refreshed after r1 review-reject; dependency map now sourced from ai-status.json + origin/dev verification, not from brief files
Commit: <to be filled by closeout commit before done>
Files changed:
  - support/sidecars/PH1GC-FWD-001/PH1GC-FWD-001-SIDECAR-ACCEPTANCE.md (updated, r2)
Verification commands:
  - `ls support/sidecars/PH1GC-FWD-001/` shows this file
  - `grep -n "§D" support/sidecars/PH1GC-FWD-001/PH1GC-FWD-001-SIDECAR-ACCEPTANCE.md` returns the 11-item checklist
  - `python3 -c "import json; d=json.load(open('ai-status.json')); print([(t['id'],t['status']) for t in d['tasks'] if t['id'] in {'FWD-SPEC-001','FWD-SBX-001','FWD-E2E-001','FWD-LIVE-001','EXT-002','PH1GC-FWD-001','PH1GC-MATRIX-001'}])"` confirms the statuses cited in §5 match machine truth
  - `git cat-file -e origin/dev:docs/02-architecture/forwarder-adapter-proof-spec-20260519.md` exits non-zero (file NOT on dev — matches §1 and §5.1 annotations)
Evidence artifact: support/sidecars/PH1GC-FWD-001/PH1GC-FWD-001-SIDECAR-ACCEPTANCE.md
Workflow family affected: none (support sidecar; does not flip a gate)
Gate read before: n/a
Gate read after: n/a
Remaining non-claim:
  - This packet does NOT collect or claim sandbox evidence.
  - WF-FWD-001 remains EXTERNAL-GATED until PH1GC-FWD-001 (parent) lands the evidence drop.
  - Parent task ownership stays with Codex; this packet is read-only support for them.
  - This packet does NOT add or modify any task in ai-status.json (FWD-VERIF-001 and BE-FIN-FWD-001 brief files remain unactioned; this is not the right task to convert them into machine truth).
External dependencies, if any: none
```
