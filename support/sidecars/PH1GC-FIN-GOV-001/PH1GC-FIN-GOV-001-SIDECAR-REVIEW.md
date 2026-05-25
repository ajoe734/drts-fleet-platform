# PH1GC-FIN-GOV-001 Sidecar Review Packet

> **Parent Task:** `PH1GC-FIN-GOV-001` — Phase 1 gap closure: governance-aware billing/reporting spec + UAT
> **Parent Owner:** `Codex2` (per `ai-status.json`; effective owner-lane handoff to `Claude2` on `claude2/ph1gc-fin-gov-001` per merge `b9b7c1f0`)
> **Parent Reviewer:** `Codex`
> **Parent Status:** `review_approved` (per `ai-status.json` snapshot at `2026-05-22T06:38:54Z`; owner finalize still pending the `claude2/ph1gc-fin-gov-001` merge into `origin/dev`)
> **Sidecar Owner:** `Claude`
> **Sidecar Reviewer:** `Claude2`
> **Helper Kind:** `review_packet`
> **Mutates Canonical:** `false`
> **Created:** `2026-05-25T16:55Z`
> **Branch:** `claude/ph1gc-fin-gov-001-sidecar-review` (base `dev` @ `5e76ec58`)

This packet is a **support artifact only**. It does not modify L1/L2 canonical truth, core service contracts, runtime implementations, or the parent task's machine-truth state. It summarizes the existing PH1GC-FIN-GOV-001 evidence on `origin/dev` and on the still-unmerged `claude2/ph1gc-fin-gov-001` branch so the parent owner / `Claude2` can decide closeout disposition without re-reading every artifact.

---

## 1. Parent Task Summary

`PH1GC-FIN-GOV-001` produces the governance-aware billing/reporting spec + UAT for directive §H — i.e. the verification body for `WF-FIN-GOV-001` (an extension of `WF-FIN-001` that fires when the source booking carries cost-center / approval / quota / partner / forwarder governance attribution).

**Acceptance items** (from `ai-status.json`):

1. `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` visible on `origin/dev`.
2. `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` visible on `origin/dev`.
3. UAT covers all 13 directive §H verification-body fields.
4. `PH1GC-E2E-010` script asserts every field listed in the verification body.
5. Gate-read update for `WF-FIN-GOV-001` = `PASS (live staging evidence)` drives matrix change.
6. Closeout report follows directive §7 format.

**Planning authority:** `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` (directive §H).
**Predecessor evidence:** `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` (governance-aware live staging evidence; live rerun blocked).

---

## 2. Evidence Inventory On `origin/dev` (HEAD `5e76ec58`)

This is what a reviewer reading the canonical trunk can verify today, without merging anything new.

### 2.1 Spec

- File: `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` (149 lines).
- Landed via `PH1GC-DOC-BATCH-1` (commit `6607dea8`, PR #237).
- Names the workflow family `WF-FIN-GOV-001`, declares it as an extension of `WF-FIN-001` that fires on governance attribution (§1, §2).
- Enumerates the 13-field verification body across §3.1–§3.6:
  1. `costCenterCode`, 2. `costCenterName`, 3. `ownerUserId`, 4. `ownerName`, 5. `legacy_unmapped`,
  6. `approvalEvaluationId`, 7. `approvalRequestId`, 8. `approvalState`,
  9. `quotaPeriodKey`, 10. `quotaUsageDelta`,
  11. `partnerProgramCode`, 12. `eligibilityVerificationId`,
  13. `platformEarningsRef`.
- §3.7 sets the `legacy_unmapped` integrity rule; §4 enumerates invoice + report-export + audit-trail shape; §5 lists forbidden state transitions; §6 binds the spec to `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` and `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`.

### 2.2 UAT

- File: `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` (152 lines).
- Landed in the same `PH1GC-DOC-BATCH-1` (PR #237).
- §1 preconditions are explicit; §2 lists six happy-path scenarios (`UAT-FIN-GOV-001` to `UAT-FIN-GOV-006`); §3 lists seven negative-path scenarios (`UAT-FIN-GOV-007` to `UAT-FIN-GOV-013`).
- `UAT-FIN-GOV-001` enumerates the 13-field assertion explicitly: `costCenterCode`, `costCenterName`, `ownerUserId`, `ownerName`, `approvalEvaluationId`, `approvalRequestId`, `approvalState`, `quotaPeriodKey`, `quotaUsageDelta`, `auditId`, `partnerProgramCode`, `platformEarningsRef`, `legacy_unmapped`. (UAT lists 13 attribution checks against the verification body; `eligibilityVerificationId` is covered in `UAT-FIN-GOV-005` which exercises the partner-channel path.)
- §4 spells out the gate-read uplift acceptance criteria: all happy-path + negative-path scenarios pass on staging, `E2E-010` runs to completion against staging, closeout follows directive §7.

### 2.3 E2E

- File: `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` (323 lines).
- Landed via `PH1GC-E2E-010` (commit `49b49a25`, PR #256).
- Lines 250–264 declare `REQUIRED_KEYS` containing exactly the 13 directive §H verification-body field names in order.
- Lines 266–278 iterate the keys, run `jq '.data | has("<key>")'` per key, accumulate `missing[]`, and `exit 1` on any missing key. This is the hard-fail discipline acceptance item 4 demands.
- Lines 282–305 add value-level spot checks against the seed: `billing.costCenterCode == CC_CODE`, `billing.approvalState == approved`, `billing.quotaPeriodKey` matches the active period, `billing.quotaUsageDelta` is non-null, `billing.ownerUserId` matches the seed user; report row carries `costCenterCode` and `approvalState=approved`; audit row targets the billing record.
- Line 73 (and other guard rails) honour the "no silent passes" rule by `exit 1` on missing setup.

### 2.4 Workflow / matrix references

- `docs/03-runbooks/phase1-release-truth-sync-20260519.md`:
  - Line 86: `WF-FIN-GOV-001 ↔ matrix row 14 (gate read: PASS (live staging evidence))`.
  - Line 108: `WF-FIN-GOV-001 → E2E-010 chain + governance-aware sidecar TBD via PH1GC-FIN-GOV-001`.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`:
  - Line 29: `| E2E-010 | tests/e2e/E2E-010-governance-aware-billing-reporting.sh | WF-FIN-GOV-001 |`.
  - Line 40: "`WF-FIN-001` retains baseline-finance scope. `WF-FIN-GOV-001` is the new governance-aware-finance family. Do not collapse them."
  - Line 44 includes `WF-FIN-GOV-001` in the canonical family list.
  - **Row 14 itself is not present in the matrix table on `origin/dev`.** The table currently ends at row 13 (`WF-FIN-001`) before the table cuts off and the next sections begin (see §3.1 below for the implication).
- `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` §2.14 has a placeholder `WF-FIN-GOV-001` heading; the actual closure / anchor / gap text refresh lives on `claude2/ph1gc-fin-gov-001` (see §2.5).

### 2.5 Branch-only delta on `claude2/ph1gc-fin-gov-001` (commit `b9b7c1f0`, not yet on `origin/dev`)

These additive matrix / audit / sidecar files exist on the owner branch but have **not** been merged to trunk:

- `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT.md` — directive §7-format closeout, written in non-claim posture; acceptance §3 mapping is per-item.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` — proposed row 14 for `WF-FIN-GOV-001` at `PASS (static evidence)` with explicit "live staging uplift blocked" note that cites the IAP/ingress blocker in `FIN-GOV-001-EVIDENCE-PACK.md` §4.
- `docs/03-runbooks/phase1-release-truth-sync-20260519.md` — proposed downgrade of the stale `PASS (live staging evidence)` line on dev (which does not match the actual evidence) and replacement of the `TBD via PH1GC-FIN-GOV-001` placeholder with concrete file references.
- `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` §2.14 — refreshed closure / anchor / gap text.
- `tests/e2e/README.md` and `tests/e2e/run-e2e.sh` — `E2E-010` row + `--suite 010` runner usage.

The owner-branch closeout (§5 of the closeout sidecar) documents local verification only: `bash -n` on the E2E shell, `./tests/e2e/run-e2e.sh --suite 010 --dry-run`, and `grep` confirmation of the `REQUIRED_KEYS` loop. No live staging run; live execution remains blocked by the `FIN-GOV-001` evidence-pack §4 IAP credential gate.

---

## 3. Acceptance Audit

### AC-1 — Spec visible on `origin/dev`

**Evidence:** `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` is on `origin/dev` at HEAD `5e76ec58` (149 lines, content as inventoried in §2.1). Landed by `PH1GC-DOC-BATCH-1` (commit `6607dea8`, PR #237).

**Verdict:** ✅ PASS.

### AC-2 — UAT visible on `origin/dev`

**Evidence:** `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` is on `origin/dev` at HEAD `5e76ec58` (152 lines, content as inventoried in §2.2). Same `PH1GC-DOC-BATCH-1` landing.

**Verdict:** ✅ PASS.

### AC-3 — UAT covers all 13 verification-body fields

**Evidence:** `UAT-FIN-GOV-001` (UAT §2 happy-path) asserts the 13-field shape on the billing record (verbatim names in §2.2 above). Additional UAT scenarios (`UAT-FIN-GOV-002` to `UAT-FIN-GOV-006`) exercise the variant pathways that set or null specific fields (manual approval, escalation, quota, partner channel, forwarder). UAT-FIN-GOV-005 specifically exercises `eligibilityVerificationId`. Negative-path scenarios (`UAT-FIN-GOV-007` to `UAT-FIN-GOV-013`) cover quota ceiling, rejection, RBAC, cross-tenant, `legacy_unmapped` integrity, post-export immutability, and token-masking integrity.

**Verdict:** ✅ PASS — the UAT enumerates the 13 fields in `UAT-FIN-GOV-001` and the variant scenarios exercise the conditional paths.

### AC-4 — `PH1GC-E2E-010` asserts every field in the verification body

**Evidence:** `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` lines 250–278 declare the 13 `REQUIRED_KEYS` and the `jq has("<key>")` loop with `exit 1` on any missing key (cited verbatim in §2.3 above). Names match the spec §3 verification body exactly. The script also hard-fails on missing seed (line 73 and equivalent guards), so a silent pass is not possible.

**Verdict:** ✅ PASS — the hard-fail loop covers every directive §H field.

### AC-5 — Gate-read update for `WF-FIN-GOV-001` = `PASS (live staging evidence)` drives matrix change

**Evidence:**

- `docs/03-runbooks/phase1-release-truth-sync-20260519.md` line 86 currently reads `WF-FIN-GOV-001 ↔ matrix row 14 (gate read: PASS (live staging evidence))` on `origin/dev`.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` on `origin/dev` does **not** yet contain row 14 in the matrix table. The matrix table appears to end at `WF-FIN-001` (row 13). The release-truth-sync gate-read string therefore references a row the canonical matrix has not yet emitted.
- `FIN-GOV-001-EVIDENCE-PACK.md` §4 documents the live rerun blocker (IAP credential / ingress gate) that prevents production of fresh `PASS (live staging evidence)` proof from this workspace.
- The `claude2/ph1gc-fin-gov-001` branch closeout (§4) proposes downgrading the gate-read line to `PASS (static evidence)` with an explicit "live staging uplift blocked" note, and adding the matrix row 14 with the same conservative posture. That branch has not been merged.

**Verdict:** ⚠️ PARTIAL — there are two reviewer-visible mismatches:

- **Mismatch A (on dev):** the release-truth-sync line claims `PASS (live staging evidence)` for `WF-FIN-GOV-001` matrix row 14, but no such row exists in the canonical matrix, and the predecessor evidence pack confirms the live rerun is blocked. The claim is currently unsupported.
- **Mismatch B (between branches):** the proposed correction (downgrade to `PASS (static evidence)` + add row 14 + cite the blocker) lives only on `claude2/ph1gc-fin-gov-001` and has not landed on `origin/dev`.

The parent owner / reviewer should decide whether to:
1. Merge the `claude2/ph1gc-fin-gov-001` correction so the matrix and gate-read align with the actual evidence (`PASS (static evidence)` with blocker note); or
2. Land a separate uplift PR after a live-staging rerun produces the missing evidence; or
3. Re-open `PH1GC-FIN-GOV-001` to remove the stale `PASS (live staging evidence)` string until item 1 or item 2 lands.

The current acceptance-item wording ("Gate-read update… drives matrix change") is satisfied **only** if option 1 lands (i.e. the matrix row is added and the gate-read is honest). Until then, this acceptance item is not safely closed by trunk-only evidence.

### AC-6 — Closeout report follows directive §7 format

**Evidence:** `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT.md` on `claude2/ph1gc-fin-gov-001` (commit `b9b7c1f0`) §3 enumerates each of the seven directive §7 non-claim rules and binds each to the corresponding posture in the delivery. The closeout does not claim live staging evidence; it does not claim every governance field is populated end-to-end; it does not claim the upstream IAP blocker is resolved.

**Verdict:** ✅ PASS (format), ⚠️ PARTIAL (visibility) — the closeout follows the directive §7 format faithfully but exists only on `claude2/ph1gc-fin-gov-001` and has not been merged to `origin/dev`. A reviewer reading only `origin/dev` cannot find it.

---

## 4. Risks And Open Questions

### R-1 — Stale `PASS (live staging evidence)` string on `origin/dev`

**Location:** `docs/03-runbooks/phase1-release-truth-sync-20260519.md` line 86.

**Problem:** the string claims live-staging proof for a row that:
- has no matching row in the canonical matrix,
- has a predecessor evidence pack (`FIN-GOV-001-EVIDENCE-PACK.md` §4) that explicitly documents the live rerun is blocked.

A reviewer who only reads trunk would conclude `WF-FIN-GOV-001` is gated live, which is not supported by any reviewable artifact on trunk.

**Recommendation:** merge the `claude2/ph1gc-fin-gov-001` correction (or a slimmed equivalent), or open a follow-up to downgrade the string.

### R-2 — Missing matrix row 14

**Location:** `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`.

**Problem:** the gate-read line refers to "matrix row 14" but the matrix table on trunk ends at row 13 (`WF-FIN-001`). The release-truth-sync line therefore cites a row that does not exist on the canonical matrix.

**Recommendation:** land the row 14 addition (proposed shape on `claude2/ph1gc-fin-gov-001`: `PASS (static evidence)` + "live staging uplift blocked" note + citation to `FIN-GOV-001-EVIDENCE-PACK.md` §4).

### R-3 — Branch fragmentation between `PH1GC-FIN-GOV-001`-related branches

There are now four sets of branches that mention `PH1GC-FIN-GOV-001`:

- `claude/ph1gc-fin-gov-001` (this review's sibling).
- `claude2/ph1gc-fin-gov-001` (owner branch carrying the closeout + matrix delta).
- `codex/ph1gc-fin-gov-001` (and three rebased copies).
- `codex2/ph1gc-fin-gov-001` (and a sidecar-acceptance branch).

The historical churn was documented in `PH1GC-FIN-GOV-001-UNBLOCK-HISTORY-REPAIR` (PR #244). The owner-lane resume on 2026-05-25 (merge commit `b9b7c1f0`) is the current canonical owner branch. A reviewer should make sure no follow-up PR accidentally lands content from an older branch that conflicts with the `claude2/ph1gc-fin-gov-001` direction.

### R-4 — Parent task `review_approved` but trunk state incomplete

`ai-status.json` records `PH1GC-FIN-GOV-001` as `review_approved` (since `2026-05-22T06:38:54Z`), but the matrix-row / closeout-sidecar / runner-doc deliverables that actually satisfy acceptance items 5 and 6 live on `claude2/ph1gc-fin-gov-001` and have not landed on `origin/dev`. The `next` field on the parent task says "Owner finalize via docs/ph1gc-doc-batch-1-20260522 (PR #237); awaiting merge to dev" — but the `claude2/ph1gc-fin-gov-001` work is a different, later branch (post-merge `b9b7c1f0`) that was not anticipated by that `next` text.

**Recommendation:** before the parent owner moves `PH1GC-FIN-GOV-001` to `done`, they need to either:
- merge `claude2/ph1gc-fin-gov-001` to dev (with a commit message that names this task) and provide `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH`; or
- explicitly drop acceptance items 5/6 to a follow-up task and document that decision; or
- mark the task `blocker` until the gate-read evidence catches up.

This is the disposition the parent reviewer (`Codex`) needs to make. This sidecar does not pre-empt it.

### Q-1 — Should this packet stay sidecar-only, or feed a small trunk PR?

The matrix row 14 + release-truth-sync downgrade + closeout sidecar are objectively additive corrections that align trunk with the actual evidence. The orchestrator can keep them on `claude2/ph1gc-fin-gov-001` until the parent owner ships, or it can land them via a slim trunk PR independent of this sidecar review. This sidecar takes no action on that decision; it documents the gap.

### Q-2 — Should `WF-FIN-GOV-001` live-staging uplift get its own follow-up task?

The closeout on `claude2/ph1gc-fin-gov-001` §7.1 argues this artifact-scope task is the wrong owner for the live-staging uplift (which depends on an external IAP credential gate). A successor task to `PH1GC-E2E-010` (currently `Codex`) is the suggested home. If the reviewer agrees, registering that follow-up task before closing `PH1GC-FIN-GOV-001` keeps the gate-uplift work tracked in machine truth.

---

## 5. What This Packet Does NOT Do

- It does **not** modify any L1/L2 product truth.
- It does **not** touch `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`, `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`, `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`, the matrix file, the release-truth-sync file, the alignment audit, or any closeout sidecar.
- It does **not** change `ai-status.json` for the parent task (`PH1GC-FIN-GOV-001` stays `review_approved` until its owner finalizes).
- It does **not** claim `WF-FIN-GOV-001` has live-staging proof.
- It does **not** speak for the parent reviewer (`Codex`); the parent disposition stays where it sits.

---

## 6. Recommended Reviewer Disposition (For `Claude2`)

Once `Claude2` (sidecar reviewer) reads this packet, the reviewer disposition is:

- **APPROVE** if the inventory and acceptance audit faithfully reflect trunk and `claude2/ph1gc-fin-gov-001`, and the risks/open-questions are reasonable to surface to the parent owner.
- **REOPEN** if any cited file path / line number is wrong, or if a cited claim (e.g. "row 14 is not on trunk", "REQUIRED_KEYS has 13 entries") does not match the actual file content.
- **BLOCKER** if the reviewer believes this sidecar is misnaming the actual parent disposition or is creating new canonical claims it should not.

This sidecar is `NO_COMMIT_REQUIRED=1`-eligible per `AI_COLLABORATION_GUIDE.md` §5: it is a support-only review packet, no canonical implementation slice. (The owner may still anchor-commit a wip(...) snapshot of this file; the parent task does not require a canonical commit from this sidecar.)

---

## 7. Handoff

- **Owner (`Claude`) handoff message draft:** "Sidecar review packet drafted. Inventory verified against `origin/dev` HEAD `5e76ec58` and `claude2/ph1gc-fin-gov-001` merge `b9b7c1f0`. AC-1..AC-4 PASS; AC-5 PARTIAL (stale gate-read on trunk + missing matrix row); AC-6 PASS (format) / PARTIAL (visibility). Two trunk mismatches and two open questions surfaced for the parent owner. No canonical files modified."
- **Reviewer (`Claude2`):** please verify the cited file paths, line numbers, and `REQUIRED_KEYS` enumeration. If accurate, approve and route back to the parent owner so they can decide on the matrix-row landing and the live-staging uplift owner.

---

_Sidecar review packet complete. Ready for `Claude2` review; parent task owner decides whether to absorb the surfaced risks/questions into the mainline closeout._
