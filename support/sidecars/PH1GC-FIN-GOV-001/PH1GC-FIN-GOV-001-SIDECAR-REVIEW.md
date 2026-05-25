# PH1GC-FIN-GOV-001 Review Packet & Evidence Summary

- **Sidecar task:** `PH1GC-FIN-GOV-001-SIDECAR-REVIEW`
- **Sidecar owner / reviewer:** `Codex` / `Claude2`
- **Parent task:** `PH1GC-FIN-GOV-001`
- **Parent owner / reviewer:** `Claude` / `Codex2`
- **Helper kind:** `review_packet`
- **Mutates canonical truth:** `false`
- **Machine-truth snapshot:** canonical `ai-status.json` at `/home/edna/workspace/drts-fleet-platform/ai-status.json`, sidecar `last_update = 2026-05-25T17:50:07Z`, parent `last_update = 2026-05-25T17:47:58Z`
- **Status:** support-only packet for reviewer handoff; supersedes earlier sidecar packets on `claude/ph1gc-fin-gov-001-sidecar-review` and `claude2/ph1gc-fin-gov-001-sidecar-review`, which were accurate for earlier parent states but stale after later owner/reviewer churn.

This packet does not edit canonical truth and does not decide the parent
disposition. It packages the current machine truth plus the reviewable evidence
that `Claude2` needs in one place.

## 1. Current machine truth

### 1.1 Sidecar row

Canonical `ai-status.json` currently records:

- `PH1GC-FIN-GOV-001-SIDECAR-REVIEW`
- owner `Codex`, reviewer `Claude2`
- status `in_progress`
- `next`: "Refreshing support packet against canonical machine truth after parent/sidecar ownership churn. Will re-cite current ai-status parent state, distinguish historical blocker snapshots from current next/handoff state, and hand back to reviewer Claude2 with a support-only packet."
- artifact: `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-SIDECAR-REVIEW.md`

### 1.2 Parent row

Canonical `ai-status.json` currently records:

- `PH1GC-FIN-GOV-001`
- owner `Claude`, reviewer `Codex2`
- status `review`
- artifacts:
  - `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
  - `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
- `next`: "All directive §H acceptance items satisfied. Spec/UAT/E2E-010 already on origin/dev (PR #237 + #256). Closeout report committed at dcbde9c9 on branch claude/ph1gc-fin-gov-001 under support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT-20260523.md. Verification rerun on 2026-05-25: bash -n + STRICT_VERIFICATION_BODY=1 bash -n on E2E-010 pass; git cat-file -e against origin/dev passes for spec, UAT, and E2E-010; REQUIRED_KEYS array contains 13 entries (matches directive §H 13-field verification body); git diff --check origin/dev...HEAD clean. WF-FIN-GOV-001 live-staging gate uplift remains externally deferred (PH1GC-MATRIX-001 + Gemini-lane staging IAM/WIF repair) per closeout §3 and §4 — no live-staging claim is made."

Reviewer implication: older sidecar packets that still describe the parent as
`Codex`/`Codex2`/`in_progress` or still frame the blocker list as the current
`next` are stale. Review against the snapshot above.

## 2. Reviewable evidence

### 2.1 Canonical artifacts already on `origin/dev`

`origin/dev` already carries the core directive §H deliverables:

- spec:
  - `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
  - declares `WF-FIN-GOV-001` as an extension of `WF-FIN-001` and binds the
    spec to the UAT and `E2E-010` executable proof at lines 5-6
  - defines the governance trigger at lines 20-31
  - defines the 13 required verification-body fields across lines 35-84
  - binds the contract to UAT + E2E hard-fail assertions at lines 136-140
- UAT:
  - `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
  - happy-path coverage at lines 27-79
  - negative-path coverage at lines 83-132
  - staging uplift criteria at lines 136-143
- executable proof:
  - `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
  - audit lookup at lines 235-240
  - `REQUIRED_KEYS` 13-field hard check at lines 243-279
  - value-level spot checks plus audit/report chain checks at lines 281-305

### 2.2 Parent closeout artifact on the owner branch

The current parent owner branch `origin/claude/ph1gc-fin-gov-001` differs from
`origin/dev` only by the closeout artifact:

- `git diff --stat origin/dev...origin/claude/ph1gc-fin-gov-001` shows only
  `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT-20260523.md`
- closeout commit:
  - `dcbde9c9`
  - subject: `closeout(PH1GC-FIN-GOV-001): governance-aware billing/reporting directive §7 closeout`
- closeout file contents most relevant to review:
  - directive §7 body at lines 13-44
  - delivered-scope table at lines 48-59
  - 13-field trace table at lines 63-85
  - repo-local verification results at lines 89-101
  - out-of-scope / external dependency statement at lines 105-113

### 2.3 Historical live-evidence blocker pack

`support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` remains the cited
static-evidence / blocker anchor for the live staging gap:

- conservative gate read remains `PASS (static evidence)` at lines 91-104
- protected staging host + token minting + direct `run.app` fallback blockers at
  lines 108-177
- blocker summary and required next collection pass at lines 180-216

This is important because the current parent `next` no longer presents the old
blocker text as the active task state; it references the closeout's external
deferral instead.

## 3. Acceptance map

| Parent acceptance item | Current evidence read |
| --- | --- |
| 1. Spec visible on `origin/dev` | **Met.** Present on `origin/dev`; see spec lines 1-149 and parent machine truth artifact list. |
| 2. UAT visible on `origin/dev` | **Met.** Present on `origin/dev`; see UAT lines 1-152 and parent machine truth artifact list. |
| 3. UAT covers all 13 directive §H verification-body fields | **Met.** Core fields are exercised in `UAT-FIN-GOV-001` (lines 29-37), `eligibilityVerificationId` is exercised in `UAT-FIN-GOV-005` (lines 63-70), `platformEarningsRef` is exercised in `UAT-FIN-GOV-006` (lines 72-79), and integrity / immutability / RBAC paths are covered in `UAT-FIN-GOV-007` to `-013` (lines 83-132). |
| 4. `PH1GC-E2E-010` asserts every verification-body field | **Met.** `REQUIRED_KEYS` contains exactly 13 field names at lines 250-264, missing keys hard-fail at lines 266-279, and the script separately asserts the audit/report chain at lines 235-240 and 297-305. |
| 5. Gate-read update for `WF-FIN-GOV-001 = PASS (live staging evidence)` drives matrix change | **Needs reviewer interpretation.** The current parent owner handoff says all in-scope directive §H acceptance items are satisfied while explicitly deferring live uplift. The branch-only closeout records `Gate read after: PASS (static evidence)` plus external dependencies at lines 35-43, 57-59, and 105-113. The historical blocker pack also keeps the conservative read at lines 91-104 and 180-216. If `Codex2` accepts that this task's scope ends at docs/UAT/E2E/closeout and that the matrix/live uplift belongs to `PH1GC-MATRIX-001` + staging IAM/WIF repair, the parent can stay in `review`; otherwise it should be reopened with a narrower acceptance correction. |
| 6. Closeout report follows directive §7 format | **Met on the owner branch, not on `origin/dev`.** The closeout exists on `origin/claude/ph1gc-fin-gov-001` as commit `dcbde9c9`; directive §7 body is present at lines 13-44. |

## 4. Findings for reviewer `Claude2`

### F1 — Current parent framing is now review/closeout, not reopen/blocker triage

Earlier sidecar packets were repeatedly reopened because parent ownership,
reviewer assignment, and `next` text kept changing. The current parent state is
different:

- parent is `review`, not `in_progress`
- current owner is `Claude`, not `Codex`
- current reviewer is `Codex2`, not `Codex`
- current `next` is the `2026-05-25T17:47:58Z` handoff quoted in §1.2

Treat older blocker text and earlier reopen narratives only as history.

### F2 — The branch-only closeout header still carries the old reviewer name

`origin/claude/ph1gc-fin-gov-001:support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT-20260523.md`
line 16 still says `Reviewer: Codex`, while current machine truth records the
parent reviewer as `Codex2`.

This does not change the canonical spec/UAT/E2E evidence, but it is a stale
metadata field inside the support closeout artifact. Reviewer should decide
whether it is:

- informational only, because the closeout was authored before the later
  reassignment churn, or
- worth a parent reopen so the owner refreshes the closeout header before
  approval.

### F3 — AC-5 is the only real judgment call left

The evidence base no longer shows branch-only deltas for spec/UAT/E2E, and the
parent owner now explicitly says no live-staging claim is being made. The only
substantive review question left is whether acceptance item 5 can be treated as
externally deferred rather than literally completed by this task.

The packet does not answer that question for the reviewer; it only points to the
two relevant anchors:

- closeout non-claim / dependency language at lines 35-43 and 105-113
- blocker-pack conservative live-evidence read at lines 91-104 and 180-216

## 5. Suggested reviewer workflow

1. Re-read the parent machine-truth row, not the older sidecar handoffs.
2. Verify the canonical artifacts on `origin/dev` match §2.1 and §3.
3. Verify the owner-branch closeout on `origin/claude/ph1gc-fin-gov-001`
   matches §2.2.
4. Decide whether F2 is informational or needs a parent refresh.
5. Decide whether AC-5's external deferral is acceptable for parent approval.

If both F2 and AC-5 are acceptable, approve this sidecar and continue the
parent review using the current `Claude -> Codex2` handoff state. If not,
reopen this sidecar or the parent with a precise delta instead of relying on
the older stale packets.

## 6. Verification used for this packet

- Read canonical `AI_COLLABORATION_GUIDE.md`
- Read canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Read canonical `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Read `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
- Read `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
- Read `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
- Read `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
- Read branch-only closeout via:
  `git show origin/claude/ph1gc-fin-gov-001:support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT-20260523.md`
- Verified owner-branch delta is support-only via:
  `git diff --stat origin/dev...origin/claude/ph1gc-fin-gov-001`
- Verified owner-branch diff has no whitespace errors via:
  `git diff --check origin/dev...origin/claude/ph1gc-fin-gov-001`
