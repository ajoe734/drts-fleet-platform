# PH1GC-FWD-001 — Sidecar Acceptance Packet

**Sidecar Task ID:** `PH1GC-FWD-001-SIDECAR-ACCEPTANCE`
**Parent Task ID:** `PH1GC-FWD-001`
**Helper Kind:** `acceptance_packet`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex`
**Parent Owner:** `Codex` (per `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` §4 row 10)
**Parent Reviewer:** `Codex2` (per `.orchestrator/task-briefs/PH1GC-FWD-001.md`)
**Collected:** `2026-05-22 (UTC)`
**Sidecar status:** `support-only artifact — does NOT mutate canonical truth, does NOT itself flip any workflow gate`

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

The parent owner should read these in order before producing the evidence drop:

| Layer | Path | Why |
| ----- | ---- | --- |
| Directive | `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` §D + §7 | Defines the 11 proof items and the closeout report format |
| Status truth | `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` §2.4 + §4 (row 10) | Confirms `support/sidecars/FWD-LIVE-001/` currently has 1 file and lists `PH1GC-FWD-001` as the driving brief |
| Parent brief | `.orchestrator/task-briefs/PH1GC-FWD-001.md` | Owner = `Codex`, Reviewer = `Codex2`, planning ref = directive |
| Existing evidence | `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` | Baseline that records why the 2026-05-19 attempt could not collect sandbox proof (gcloud reauth, 404 host, NXDOMAIN) |
| Adapter proof spec | `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md` | Authoritative spec for the proof set (separates sandbox harness vs mock-path verification vs live external) |
| Sandbox harness | `docs/02-architecture/forwarder-sandbox-provider.md`, `apps/api/src/modules/forwarder/sandbox.adapter.ts`, `apps/api/src/modules/forwarder/sandbox.fixtures.ts` (in progress under `FWD-SBX-001`) | Generic forwarder sandbox provider — usable as classification = `repo-local` fallback only |
| Real-platform adapter (still stub) | `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts`, `packages/contracts/src/platform-codes.ts` | Confirms the shipped real adapter is `forwarder_stub` / `mode: "stub"` — sandbox evidence cannot come from the shipped code path; it must come from a real partner sandbox or the §D-described sandbox provider |
| Release-gate truth | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` | `WF-FWD-001` row — what the gate read must flip to |
| Cross-repo gap | `docs/03-runbooks/cross-repo-gap-matrix-20260424.md` | Grab Taiwan real adapter classification — currently `external-gated` |
| Blocker authority | `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md` | Binding blocker packet for `EXT-002-BLK-001..007`; the parent owner closes these blockers by producing the sandbox evidence here |

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

### 5.1 Upstream prerequisites for PH1GC-FWD-001

| Task | Status (as of 2026-05-22) | Why it matters |
| ---- | ------------------------- | -------------- |
| `FWD-SPEC-001` (Forwarder adapter proof spec) | `review_approved` | Authoritative spec for the proof set. PH1GC-FWD-001 must conform to this spec rather than inventing new structure. |
| `FWD-SBX-001` (Generic forwarder sandbox provider harness) | `in_progress` (owner Codex) | If a real partner sandbox is unavailable, the only allowed sandbox source is this harness; classification then = `sandbox (repo-local FWD-SBX-001 harness)`. **If FWD-SBX-001 is not yet landed at evidence time, the parent owner must either wait or downgrade to `repo-local mock only`.** |
| `FWD-VERIF-001` (Real-platform integration evidence verification) | `review_approved` | Establishes the verification methodology PH1GC-FWD-001 must follow for mirror / status sync / settlement chain. |
| `FWD-LIVE-001` (Forwarder external platform live evidence pack) | `review_approved` | Existing partial evidence baseline. PH1GC-FWD-001 **extends** this sidecar rather than creating a parallel one. |

### 5.2 Sibling tasks PH1GC-FWD-001 does **not** depend on (but coordinates with)

| Task | Status | Relationship |
| ---- | ------ | ------------ |
| `FWD-E2E-001` (Convert WF-FWD-001 from external-gated to sandbox-proven via E2E-002) | `review_approved` | Already rewired `tests/e2e/E2E-002-forwarded-order.sh` against the sandbox harness. If PH1GC-FWD-001 re-runs E2E-002, link the run id in the evidence pack; do **not** modify the script. |
| `BE-FIN-FWD-001` (Platform-source settlement report endpoint) | `backlog` (owner Codex) | Provides the `/api/tenant/reports/settlement-by-platform-source` endpoint. If landed, link its OpenAPI ref from D8 (Settlement sample). If not landed, D8 still works using the raw `platform_earnings` row id. |
| `EXT-002-BLK-001..007` blockers | Open | Closed (partially) by PH1GC-FWD-001's evidence drop, per §3 above. |

### 5.3 Downstream tasks that read PH1GC-FWD-001's gate flip

| Task / consumer | What it watches |
| --------------- | --------------- |
| `PH1GC-MATRIX-001` | Re-reads `WF-FWD-001` after this flip; will cross-check all 11/12 → 16 rows. PH1GC-FWD-001 must land before MATRIX-001 re-runs its cross-check sweep. |
| Directive §10 final checklist row `[ ] support/sidecars/FWD-LIVE-001/` | Flips from unchecked to checked only when this sidecar contains all 11 §D items. |
| `final phase1-business-flow-complete-closeout.md` (per directive §8 condition 7) | "Forwarder 至少 sandbox evidence" condition is satisfied here. |

### 5.4 Dependency graph (textual)

```
                FWD-VERIF-001 (review_approved, methodology)
                       │
                       ▼
FWD-SPEC-001 (review_approved) ──► PH1GC-FWD-001 ◄── FWD-SBX-001 (in_progress, harness)
                                       │
                                       ▼
                       support/sidecars/FWD-LIVE-001/ (extended with 11 §D items)
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
   WF-FWD-001 gate read      EXT-002-BLK-001..007       PH1GC-MATRIX-001
   (release-gates.md)        (partial close-out)        (re-runs cross-check)
                                                              │
                                                              ▼
                                         directive §10 / §8.7 final readiness rolls forward
```

---

## 6. Support guidance for the parent owner

These are **strong suggestions** (not directive overrides) to help the parent owner avoid the failure modes the 2026-05-19 attempt hit:

1. **Decide classification first.** Before producing any sample, decide whether the evidence will be `sandbox (external partner)`, `sandbox (repo-local FWD-SBX-001 harness)`, or `repo-local mock only`. Write the banner at the top of `FWD-LIVE-001-EVIDENCE-PACK.md` before writing anything else; every later choice flows from it.
2. **If external sandbox creds are blocked**, do not stall the brief — switch classification to `repo-local FWD-SBX-001 harness` (assuming FWD-SBX-001 landed) and produce evidence from the harness with `Gate read after: PASS (repo-local)`. The directive permits this; partial / blocked sandbox creds is the most likely path given the 2026-05-19 telemetry.
3. **Idempotency / replay (D10) is the most common failure mode.** Capture the second delivery using the exact same idempotency key and signature; both must return HTTP 2xx and must not create a second mirror row. Reviewer will diff the audit rows directly.
4. **No-owned-assignment (D9) requires a SQL query result, not prose.** Run `SELECT id, source_platform, owner FROM dispatch_assignments WHERE forwarded_task_id = '<sample id>'` and paste the (empty) result. If the schema columns differ, cite the actual schema in `apps/api/src/modules/forwarder/**` rather than guessing.
5. **Webhook signature (D11) needs both the positive and the negative path.** Tamper the signature header by one byte and confirm rejection. A single HTTP 200 trace is not enough.
6. **When updating canonical files, keep the diff to the minimum changes listed in §3.** Reviewer will reject sweeping rewrites of `phase1-workflow-acceptance-release-gates.md` or `cross-repo-gap-matrix-20260424.md` in the same commit as the evidence drop. Touch only the `WF-FWD-001` row and the Grab Taiwan adapter row respectively.
7. **Anchor-commit on the parent branch (`codex/ph1gc-fwd-001` or whatever the owner picks) before yielding** — per `docs/ops/branch-strategy.md` §11.1, the canonical files in §3 are fragile-surface; do not leave the diff in working tree across a supervisor cycle.

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
Owner: Claude
Reviewer: Codex
Branch: claude/ph1gc-fwd-001-sidecar-acceptance
PR: n/a — sidecar acceptance packet, mutates_canonical = false
Commit: <to be filled by anchor commit before handoff>
Files changed:
  - support/sidecars/PH1GC-FWD-001/PH1GC-FWD-001-SIDECAR-ACCEPTANCE.md (new)
Verification commands:
  - `ls support/sidecars/PH1GC-FWD-001/` shows this file
  - `grep -n "§D" support/sidecars/PH1GC-FWD-001/PH1GC-FWD-001-SIDECAR-ACCEPTANCE.md` returns the 11-item checklist
Evidence artifact: support/sidecars/PH1GC-FWD-001/PH1GC-FWD-001-SIDECAR-ACCEPTANCE.md
Workflow family affected: none (support sidecar; does not flip a gate)
Gate read before: n/a
Gate read after: n/a
Remaining non-claim:
  - This packet does NOT collect or claim sandbox evidence.
  - WF-FWD-001 remains EXTERNAL-GATED until PH1GC-FWD-001 (parent) lands the evidence drop.
  - Parent task ownership stays with Codex; this packet is read-only support for them.
External dependencies, if any: none
```
