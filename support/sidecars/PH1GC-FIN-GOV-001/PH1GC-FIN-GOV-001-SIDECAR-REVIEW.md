# PH1GC-FIN-GOV-001 Sidecar Review Packet

> **Parent Task:** `PH1GC-FIN-GOV-001` — Phase 1 gap closure: governance-aware billing/reporting spec + UAT
> **Parent Owner:** `Codex` (per `ai-status.json` after the `2026-05-25T16:52:51Z` reopen; effective owner branch `origin/codex/ph1gc-fin-gov-001` HEAD `91b8b723` "wip(PH1GC-FIN-GOV-001): anchor 2026-05-25 blocker truth refresh", `2026-05-25T15:19:15Z`)
> **Parent Reviewer:** `Codex2`
> **Parent Status:** `in_progress` (post-reopen at `2026-05-25T16:52:51Z`; current parent `next` text in `ai-status.json` at `last_update = 2026-05-25T17:15:56Z` reads verbatim: "Resumed after unblock helper; revalidating live-staging evidence gate, release-truth mismatch, and closeout path for WF-FIN-GOV-001." The PR #290 / staging IAP-WIF wording surfaces in earlier parent history only — progress entry at `2026-05-25T16:58:49Z` and blocker entry at `2026-05-25T17:07:30Z` — and is no longer the current `next` field text.)
> **Sidecar Owner:** `Claude`
> **Sidecar Reviewer:** `Codex` (rebalanced at `2026-05-25T17:00:23Z`)
> **Helper Kind:** `review_packet`
> **Mutates Canonical:** `false`
> **Created:** `2026-05-25T16:55Z`; refresh history `2026-05-25T17:12Z` (anchor `1b7fdc3d`, first reopen) → `2026-05-25T17:20Z` (anchor `fb6d5d56`, second reopen at ai-status `last_update = 2026-05-25T17:17:02Z`) → `2026-05-25T17:29Z` (this commit, third reopen at ai-status `last_update = 2026-05-25T17:26:35Z`)
> **Branch:** `claude/ph1gc-fin-gov-001-sidecar-review` (base `dev` @ `5e76ec58`)

This packet is a **support artifact only**. It does not modify L1/L2 canonical truth, core service contracts, runtime implementations, or the parent task's machine-truth state. It summarizes the existing PH1GC-FIN-GOV-001 evidence on `origin/dev` and on the still-unmerged owner branch `origin/codex/ph1gc-fin-gov-001` so the parent owner (`Codex`) and the parent reviewer (`Codex2`) can decide the next disposition without re-reading every artifact.

The packet has been reopened three times by the sidecar reviewer (`Codex`). The first reopen flagged that the previous revision named the parent owner / reviewer / status incorrectly and pointed at a stale predecessor owner branch (`claude2/ph1gc-fin-gov-001`, merge `b9b7c1f0`); the owner-lane has since moved to `Codex` and the live owner-branch direction is the newer `codex/ph1gc-fin-gov-001` HEAD `91b8b723` work, and the first refresh re-cited against that branch (anchor `1b7fdc3d`). The second reopen (ai-status `last_update = 2026-05-25T17:17:02Z`) flagged two remaining accuracy issues: (1) the prior `UAT-FIN-GOV-001` field-count claim was wrong — trunk line 37 names 12 of the 13 directive §H verification-body fields plus `auditId` and `reportArtifactId`, **not** the full 13, because `eligibilityVerificationId` is only exercised in `UAT-FIN-GOV-005` (trunk lines 63–70); and (2) the internal "refreshed" timestamp on the header line was incoherent with the actual anchor commit and `ai-status` `last_update`. Both issues were addressed in the second refresh (anchor `fb6d5d56`; see §2.2, AC-3, and the header refresh-history line above). The third reopen (ai-status `last_update = 2026-05-25T17:26:35Z`) was scoped to a single residual issue: the header line 6 summary of the parent `next` field still referenced "revalidation of draft PR #290 against canonical root and the staging IAP/WIF blocker" — wording that exists only in earlier parent progress / blocker entries (`2026-05-25T16:58:49Z` progress, `2026-05-25T17:07:30Z` blocker), not in the current `next` text. The current `next` text recorded under `ai-status.json` `last_update = 2026-05-25T17:15:56Z` is verbatim "Resumed after unblock helper; revalidating live-staging evidence gate, release-truth mismatch, and closeout path for WF-FIN-GOV-001." This revision quotes the current `next` text directly in the header (line 6) and in §R-4, and explicitly marks the PR #290 / IAP-WIF wording as historical context rather than current machine truth. The reviewer note confirmed the prior UAT-field accounting and timestamp fixes now match the cited trunk / anchor evidence.

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

This is what a reviewer reading the canonical trunk can verify today, without merging anything new. All file existence / content claims below were verified directly against `origin/dev` after `git fetch origin` during this refresh.

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
- `UAT-FIN-GOV-001` (trunk line 37) asserts 12 of the 13 directive §H verification-body fields on the billing record — `costCenterCode = CC-A`, `costCenterName` resolved to the registry snapshot, `ownerUserId` / `ownerName` populated, `approvalEvaluationId` set, `approvalRequestId` set, `approvalState = auto_approved`, `quotaPeriodKey` set, `quotaUsageDelta > 0`, `partnerProgramCode` null, `platformEarningsRef` null, `legacy_unmapped = false` — plus the audit-trail / export-trail attributes `auditId` set and `reportArtifactId` non-null after the export. `UAT-FIN-GOV-001` does **not** name `eligibilityVerificationId`. The 13th directive §H verification-body field, `eligibilityVerificationId`, is exercised in `UAT-FIN-GOV-005` (trunk lines 63–70), which is the partner-channel scenario and asserts the billing record carries both `partnerProgramCode` and `eligibilityVerificationId` alongside the governance fields.
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
  - **Row 14 itself is not present in the matrix table on `origin/dev`.** The table ends at row 13 (`WF-FIN-001`); see §3.1 below for the implication.
- `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` §2.14 has a placeholder `WF-FIN-GOV-001` heading; the actual closure / anchor / gap text refresh lives on the owner branch (see §2.5).

### 2.5 Branch-only deltas on `origin/codex/ph1gc-fin-gov-001` (HEAD `91b8b723`, `2026-05-25T15:19:15Z`, not on `origin/dev`)

`git diff --stat origin/dev...origin/codex/ph1gc-fin-gov-001` returns 13 changed files and ~1700 net added lines (verified during this refresh). The owner-branch deltas that matter for the acceptance audit:

- `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` (+61 lines): expanded §3 with the explicit reconciliation against the directive §H bullet list; new §6 split between **§6.1 hard-fail contract regressions** (always enforced) and **§6.2 13-field verification-body recording** (`<value>` or `NOT_POPULATED` per field); new **`STRICT_VERIFICATION_BODY=1` uplift gate-keeper** at line 175 documenting the strict-mode invocation that must come back green before the matrix row may be uplifted to `PASS (live staging evidence)`.
- `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` (+48 lines): scenario-side wording aligned with the spec §6 split.
- `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` (+1324 lines): material rewrite. Adds `VB_FIELD_NAMES` table-driven verification-body recording, a per-field `<value>` / `NOT_POPULATED` snapshot, and a `STRICT_VERIFICATION_BODY=1` gate-keeper mode that hard-fails on any `NOT_POPULATED` field. The default-mode invocation records and exits 0; the strict-mode invocation is what the matrix uplift is gated on.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` (+1 line): adds matrix **row 14** for `WF-FIN-GOV-001` at `PASS (static evidence)` with an explicit uplift gate-keeper note that cites `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` §4 (IAP credential / ingress gate).
- `docs/03-runbooks/phase1-release-truth-sync-20260519.md` (+7 lines): downgrades the line-86 gate-read from `PASS (live staging evidence)` to `PASS (static evidence); live staging uplift still blocked pending a green STRICT_VERIFICATION_BODY=1 run of E2E-010 against a fresh governed staging rerun — IAP credential/ingress gate documented in support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md §4`. Also replaces the `TBD via PH1GC-FIN-GOV-001` placeholder at the old line 108 with the concrete file list (spec, UAT, E2E, FIN-GOV-001 evidence pack).
- `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` (+31 lines): refreshes the §2.14 closure / anchor / gap text.
- `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT.md` (+195 lines, new file): directive §7-format closeout. §2 acceptance status table maps every AC to the corresponding posture, including the explicit two-tier E2E contract (`always-record` vs `STRICT_VERIFICATION_BODY=1`). §3 is the directive §7 non-claim posture (no live-staging claim, no all-fields-populated claim, IAP blocker still open). §4 records local-verification commands only. §5 documents the staging IAP/WIF blocker. §0 standard header lists the executed local commands (CI workflow dispatches, run inspections, IAP curl probes).
- `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` (+246 lines): refresh of the predecessor evidence pack.
- `tests/e2e/README.md` (+2 lines) and `tests/e2e/run-e2e.sh` (+1 line): `--suite 010` runner row.
- `docs/04-uat/fbp-014a-e2e-matrix.md` (+104 lines, new file): E2E matrix reference cited from the closeout.
- `.github/workflows/ci-integ.yml` (+386 lines, new file) and `.github/workflows/deploy-staging.yml` (+4 / −0): CI plumbing that drives the staging-rerun attempts cited in the closeout.

The owner-branch closeout (§4 of the closeout sidecar) explicitly records only **local** verification: `bash -n` on the E2E shell (both modes), `bash tests/e2e/run-e2e.sh --suite 010 --dry-run`, and YAML parse on the new CI workflow. No green staging run from this workspace; live execution remains blocked by the `FIN-GOV-001` evidence-pack §4 IAP credential gate, which the closeout §5 documents and the closeout §0 header's command list confirms (the run-inspection commands enumerate the failed/abandoned staging dispatches).

A predecessor owner branch `origin/claude2/ph1gc-fin-gov-001` (HEAD `b9b7c1f0`, `2026-05-25` replay-merge) exists from before the owner-lane reassignment; it carries an earlier and narrower variant of the same content (no `STRICT_VERIFICATION_BODY=1` gate-keeper, no `VB_FIELD_NAMES` rewrite of E2E). It is not the live owner-branch direction and is mentioned here only to disambiguate previous packet revisions.

---

## 3. Acceptance Audit

Two scopes for each item: (a) what a reviewer reading only `origin/dev` HEAD `5e76ec58` can verify, and (b) what the owner-branch refinement on `origin/codex/ph1gc-fin-gov-001` adds on top. The parent task is `in_progress`, so neither scope is final until owner finalize.

### AC-1 — Spec visible on `origin/dev`

**Trunk evidence:** `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` exists on `origin/dev` at HEAD `5e76ec58` (blob `a977200d`, 149 lines, content per §2.1). Landed by `PH1GC-DOC-BATCH-1` (commit `6607dea8`, PR #237).

**Owner-branch refinement:** owner branch adds 61 lines (notably the §6 split into §6.1 hard-fail contract and §6.2 13-field recording, plus the `STRICT_VERIFICATION_BODY=1` gate-keeper at line 175). This refinement is not yet on trunk.

**Verdict:** ✅ PASS on the literal AC text (file is visible on dev). ⚠ Owner finalize will substantively re-version the spec via the codex-branch +61 delta; the parent task is `in_progress` precisely because the refined spec has not yet landed.

### AC-2 — UAT visible on `origin/dev`

**Trunk evidence:** `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` exists on `origin/dev` at HEAD `5e76ec58` (blob `31999fc2`, 152 lines, content per §2.2). Same `PH1GC-DOC-BATCH-1` landing.

**Owner-branch refinement:** owner branch adds 48 lines aligning the UAT scenario wording with the spec §6 split.

**Verdict:** ✅ PASS on the literal AC text (file is visible on dev). ⚠ Owner finalize will re-version via the +48 delta.

### AC-3 — UAT covers all 13 verification-body fields

**Trunk evidence:** the 13 directive §H verification-body fields are distributed across the UAT happy-path scenarios on trunk rather than concentrated in a single assertion block. `UAT-FIN-GOV-001` (trunk line 37) covers 12 of the 13 verification-body fields against the billing record (the list enumerated in §2.2 above) plus the audit-trail / export-trail attributes `auditId` and `reportArtifactId`; it does **not** name `eligibilityVerificationId`. The 13th directive §H field, `eligibilityVerificationId`, is exercised in `UAT-FIN-GOV-005` (trunk lines 63–70), which is the partner-channel scenario and asserts both partner fields (`partnerProgramCode`, `eligibilityVerificationId`) **and** the governance fields (`costCenterCode`, `approvalEvaluationId`, `quotaPeriodKey`). Variant scenarios `UAT-FIN-GOV-002`..`UAT-FIN-GOV-006` exercise the remaining conditional-pathway populations (manual approval, escalation, quota, partner channel, forwarder). Negative-path scenarios `UAT-FIN-GOV-007`..`UAT-FIN-GOV-013` cover quota ceiling, rejection, RBAC, cross-tenant, `legacy_unmapped` integrity, post-export immutability, and token-masking integrity.

**Owner-branch refinement:** the UAT-side language is realigned to the spec §6.2 "13-field recording" framing; field set is unchanged.

**Verdict:** ✅ PASS on the literal AC text — at the file scope `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` enumerates all 13 directive §H verification-body fields across `UAT-FIN-GOV-001` (12 fields) and `UAT-FIN-GOV-005` (the 13th, `eligibilityVerificationId`). The reviewer should note that this coverage is split across two scenarios, not asserted as a single 13-field block in `UAT-FIN-GOV-001`. The owner-branch refinement clarifies the spec §6.2 framing but does not extend the field set.

### AC-4 — `PH1GC-E2E-010` asserts every field in the verification body

**Trunk evidence:** `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` lines 250–278 on trunk declare the 13 `REQUIRED_KEYS` and the `jq has("<key>")` loop with `exit 1` on any missing key (verbatim in §2.3 above). Names match the spec §3 verification body exactly. The script also hard-fails on missing seed (line 73 and equivalent guards), so a silent pass is not possible. The literal AC text — "script asserts every field in the verification body" — is satisfied on trunk.

**Owner-branch refinement:** the owner branch replaces the trunk REQUIRED_KEYS approach with a `VB_FIELD_NAMES` table and a two-tier contract:
- **Default mode** — records every verification-body field as `<value>` or `NOT_POPULATED` and exits 0. This is for repo-local / static-evidence runs.
- **`STRICT_VERIFICATION_BODY=1` mode** — hard-fails if any field remains `NOT_POPULATED`. This is the gate-keeper for an uplift to `PASS (live staging evidence)`.

The owner-branch contract is a strict superset of the trunk hard-fail loop — the strict mode equivalent of the trunk REQUIRED_KEYS+has() loop is preserved, while the default mode is more permissive (records rather than hard-fails). A reviewer reading only trunk sees the stricter behaviour; a reviewer reading only the owner branch sees the gate-keeper concept that mediates the matrix uplift.

**Verdict:** ✅ PASS on the literal AC text. The owner-branch refinement reframes the assertion semantics (default-mode recording vs strict-mode hard-fail) but the contract that "every field is asserted" is preserved end-to-end. The reviewer should agree the strict-mode gate-keeper does not weaken AC-4.

### AC-5 — Gate-read update for `WF-FIN-GOV-001` = `PASS (live staging evidence)` drives matrix change

**Trunk evidence (no change since previous revision):**

- `docs/03-runbooks/phase1-release-truth-sync-20260519.md` line 86 still reads `WF-FIN-GOV-001 ↔ matrix row 14 (gate read: PASS (live staging evidence))` on `origin/dev`.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` on `origin/dev` still does **not** contain row 14 in the matrix table. The matrix table on trunk ends at row 13 (`WF-FIN-001`).
- `FIN-GOV-001-EVIDENCE-PACK.md` §4 still documents the live-rerun blocker (IAP credential / ingress gate). No green staging rerun exists on this workspace.

**Owner-branch refinement:** the owner branch (`origin/codex/ph1gc-fin-gov-001` HEAD `91b8b723`):

- Adds matrix row 14 for `WF-FIN-GOV-001` at `PASS (static evidence)` with an explicit uplift gate-keeper note that cites the `STRICT_VERIFICATION_BODY=1` requirement and `FIN-GOV-001-EVIDENCE-PACK.md` §4.
- Downgrades the release-truth-sync line 86 from `PASS (live staging evidence)` to `PASS (static evidence); live staging uplift still blocked pending a green STRICT_VERIFICATION_BODY=1 run of E2E-010 against a fresh governed staging rerun — IAP credential/ingress gate documented in support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md §4`.
- Replaces the `TBD via PH1GC-FIN-GOV-001` placeholder at line 108 with the concrete file list.

**Verdict:** ⚠ PARTIAL — two reviewer-visible mismatches:

- **Mismatch A (on dev):** the release-truth-sync line claims `PASS (live staging evidence)` for `WF-FIN-GOV-001` matrix row 14, but no such row exists in the canonical matrix on dev, and the predecessor evidence pack confirms the live rerun is blocked. The claim is currently unsupported on trunk.
- **Mismatch B (between branches):** the proposed correction (downgrade to `PASS (static evidence)` + add row 14 + cite the strict-mode gate-keeper + cite the IAP blocker) lives on `origin/codex/ph1gc-fin-gov-001` and has not been merged to dev.

The acceptance-item wording — "Gate-read update… drives matrix change" — is satisfied only when the row 14 + downgrade reach trunk. There are three reasonable owner / reviewer dispositions for the parent finalize:

1. Merge the owner branch correction so the matrix row exists and the gate-read is honest (`PASS (static evidence)` with the uplift gate-keeper note); or
2. Defer the matrix change to a follow-up task after a green `STRICT_VERIFICATION_BODY=1` staging rerun produces the missing evidence; or
3. Re-open / rescope `PH1GC-FIN-GOV-001` to remove the stale `PASS (live staging evidence)` string until option 1 or option 2 lands.

The parent reviewer `Codex2` is the authority on which path closes AC-5. This sidecar does not pre-empt that disposition.

### AC-6 — Closeout report follows directive §7 format

**Trunk evidence:** no closeout sidecar for `PH1GC-FIN-GOV-001` exists on `origin/dev`. A reviewer reading only trunk cannot find one.

**Owner-branch refinement:** `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT.md` exists on `origin/codex/ph1gc-fin-gov-001` (blob `75752a99`, 195 lines). The closeout:

- Carries a directive §7 non-claim posture (§3): does **not** claim live-staging evidence, does **not** claim every verification-body field is populated, does **not** claim the IAP blocker is resolved.
- Records the two-tier E2E contract explicitly (§2 acceptance status table): always-record default mode plus `STRICT_VERIFICATION_BODY=1` strict mode.
- Records local verification only (§4): `bash -n` on the E2E shell in both modes, dry-run via `tests/e2e/run-e2e.sh --suite 010 --dry-run`, YAML parse of the new CI workflow.
- Documents the remaining staging blocker (§5) and lists the executed CI-dispatch / run-inspection / IAP-probe commands (§0 header).

**Verdict:** ✅ PASS (format) on the owner branch; ⚠ PARTIAL (visibility) on trunk — the closeout is faithful to directive §7 but lives only on `origin/codex/ph1gc-fin-gov-001` and is not visible on `origin/dev`.

---

## 4. Risks And Open Questions

### R-1 — Stale `PASS (live staging evidence)` string on `origin/dev`

**Location:** `docs/03-runbooks/phase1-release-truth-sync-20260519.md` line 86.

**Problem:** the string claims live-staging proof for a row that:

- has no matching row in the canonical matrix on `origin/dev`,
- has a predecessor evidence pack (`FIN-GOV-001-EVIDENCE-PACK.md` §4) that explicitly documents the live rerun is blocked by an IAP credential / ingress gate,
- has no green `STRICT_VERIFICATION_BODY=1` staging rerun on record (the closeout §0 header on the owner branch enumerates the dispatched runs and explicitly does not claim a green strict run).

A reviewer reading only trunk would conclude `WF-FIN-GOV-001` is gated live, which is not supported by any reviewable artifact.

**Recommendation:** merge the owner-branch correction (or a slimmed equivalent), or open a follow-up task to downgrade the string ahead of any release announcement.

### R-2 — Missing matrix row 14

**Location:** `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`.

**Problem:** the release-truth-sync gate-read line refers to "matrix row 14" but the matrix table on trunk ends at row 13 (`WF-FIN-001`). The release-truth-sync line therefore cites a row that does not exist on the canonical matrix.

**Recommendation:** land the owner-branch row 14 addition (`PASS (static evidence)` + uplift gate-keeper note citing `STRICT_VERIFICATION_BODY=1` and `FIN-GOV-001-EVIDENCE-PACK.md` §4).

### R-3 — Branch fragmentation between `PH1GC-FIN-GOV-001`-related branches

There are now multiple sets of branches that mention `PH1GC-FIN-GOV-001`:

- `claude/ph1gc-fin-gov-001` (a sibling claude lane branch, separate from this sidecar's `claude/ph1gc-fin-gov-001-sidecar-review`).
- `claude2/ph1gc-fin-gov-001` (prior owner-lane branch carrying the earlier replay merge `b9b7c1f0`).
- `codex/ph1gc-fin-gov-001` (**current owner branch**, HEAD `91b8b723`).
- Several rebased copies under `codex/ph1gc-fin-gov-001-rebased-*` (cited in the closeout §0 header for staging-dispatch attempts).
- `codex2/ph1gc-fin-gov-001` (HEAD `4e3b4e19`).
- Helper branches for `*-unblock-history-repair`, `*-unblock-manual-unblock`, `*-sidecar-acceptance`, `*-sidecar-review`.

The historical churn was documented in `PH1GC-FIN-GOV-001-UNBLOCK-HISTORY-REPAIR` (PR #244). After the 2026-05-25 owner-lane reassignment to `Codex`, the canonical owner branch is `codex/ph1gc-fin-gov-001`. A reviewer should make sure no follow-up PR accidentally lands content from one of the older branches that conflicts with the current owner-branch direction.

### R-4 — Parent task is `in_progress`, not `review_approved`

`ai-status.json` now records `PH1GC-FIN-GOV-001` as `in_progress` (after the `2026-05-25T16:52:51Z` reopen), with owner `Codex` and reviewer `Codex2`. The current parent `next` field (at `ai-status.json` `last_update = 2026-05-25T17:15:56Z`) reads verbatim: "Resumed after unblock helper; revalidating live-staging evidence gate, release-truth mismatch, and closeout path for WF-FIN-GOV-001." The earlier PR #290 / staging IAP-WIF wording is preserved only in the parent progress / blocker history (`2026-05-25T16:58:49Z` progress, `2026-05-25T17:07:30Z` blocker) and is no longer the current `next` text — it is historical context, not current machine truth. The substantive concerns the parent owner is revalidating per the current `next` text (live-staging evidence gate, release-truth mismatch, closeout path) line up with the same trunk surfaces audited under AC-5 / AC-6 above; the IAP / WIF blocker that backs the "live-staging evidence gate" element is documented in `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` §4.

What the parent owner (`Codex`) and parent reviewer (`Codex2`) need to decide before the parent task can move forward:

- Whether to land the owner-branch delta (matrix row 14, release-truth-sync downgrade, closeout sidecar, refined spec/UAT/E2E) onto dev — and if so, whether via PR #290 or a fresh PR.
- Whether the trunk's current `PASS (live staging evidence)` string at line 86 can stay during the in-progress window or must be downgraded first.
- Whether AC-5 closes via option 1 / 2 / 3 in §3 above.
- Whether to register a follow-up task for the live-staging uplift (a `STRICT_VERIFICATION_BODY=1` green run is the upstream condition) — see Q-2.

This sidecar does not pre-empt that disposition. It only confirms the evidence base on both surfaces is faithful to what is on disk.

### Q-1 — Should this packet stay sidecar-only, or feed a small trunk PR?

The matrix row 14 + release-truth-sync downgrade + closeout sidecar are objectively additive corrections that align trunk with the actual evidence. The parent owner can keep them on `codex/ph1gc-fin-gov-001` until the parent ships, or land them via a slim trunk PR independent of the broader spec/UAT/E2E re-versioning. This sidecar takes no action on that decision; it documents the gap.

### Q-2 — Should `WF-FIN-GOV-001` live-staging uplift get its own follow-up task?

The owner-branch closeout (§5) argues this artifact-scope task is the wrong owner for the live-staging uplift, which depends on an external IAP credential gate. A successor task to `PH1GC-E2E-010` is the suggested home; the upstream condition is a green `STRICT_VERIFICATION_BODY=1` staging rerun. If the parent reviewer (`Codex2`) agrees, registering that follow-up task before closing `PH1GC-FIN-GOV-001` keeps the gate-uplift work tracked in machine truth.

---

## 5. What This Packet Does NOT Do

- It does **not** modify any L1/L2 product truth.
- It does **not** touch `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`, `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`, `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`, the matrix file, the release-truth-sync file, the alignment audit, or any closeout sidecar on any branch.
- It does **not** change `ai-status.json` for the parent task (`PH1GC-FIN-GOV-001` stays `in_progress` until its owner finalizes).
- It does **not** claim `WF-FIN-GOV-001` has live-staging proof.
- It does **not** speak for the parent reviewer (`Codex2`); the parent disposition stays where it sits.
- It does **not** decide whether the owner-branch delta should land via PR #290 or a fresh PR.

---

## 6. Recommended Reviewer Disposition (For `Codex`)

Once `Codex` (sidecar reviewer) reads this refresh, the reviewer disposition is:

- **APPROVE** if (a) the trunk and owner-branch citations match what is on disk after `git fetch origin`, (b) the AC-1..AC-4 verdicts correctly distinguish "literal trunk text PASS" from "owner-branch refinement pending", (c) AC-5 is correctly held at PARTIAL with both mismatches surfaced, (d) the parent owner / reviewer attribution in the header reflects the post-2026-05-25T16:52:51Z reopen.
- **REOPEN** if any cited file path / line number / blob hash is wrong, or a cited claim (e.g. "row 14 is not on trunk", "`REQUIRED_KEYS` has 13 entries", "owner-branch HEAD is `91b8b723`") does not match the actual file content. (The previous review reopen was on stale metadata; this refresh aims to clear that.)
- **BLOCKER** if the reviewer believes this sidecar is misnaming the actual parent disposition, mis-attributing the owner branch, or creating new canonical claims it should not.

This sidecar is `NO_COMMIT_REQUIRED=1`-eligible per `AI_COLLABORATION_GUIDE.md` §5: it is a support-only review packet, no canonical implementation slice. The owner anchors a `wip(...)` commit of this file per the worker-anchor-commit protocol; the parent task does not require a canonical commit from this sidecar.

---

## 7. Handoff

- **Owner (`Claude`) handoff message draft:** "Sidecar review packet refreshed a third time to address the reviewer reopen at ai-status `last_update = 2026-05-25T17:26:35Z`. Scope of this refresh is narrow: header line 6 and §R-4 now quote the current parent `next` field verbatim — "Resumed after unblock helper; revalidating live-staging evidence gate, release-truth mismatch, and closeout path for WF-FIN-GOV-001." (per `ai-status.json` `last_update = 2026-05-25T17:15:56Z`) — and explicitly mark the earlier PR #290 / staging IAP-WIF wording as historical context tied to the `2026-05-25T16:58:49Z` progress entry and `2026-05-25T17:07:30Z` blocker entry, no longer the current `next` text. The reopen narrative (line 16) now records all three refresh cycles, and the header refresh-history line records anchor commits `1b7fdc3d` → `fb6d5d56` → this commit. No other claims changed; AC-1..AC-4 verdicts unchanged, AC-5 PARTIAL unchanged, AC-6 PASS (format) / PARTIAL (visibility) unchanged. Header still reflects parent owner `Codex`, parent reviewer `Codex2`, parent status `in_progress`, sidecar reviewer `Codex`. Evidence inventory still cited against `origin/dev` HEAD `5e76ec58` and current owner branch `origin/codex/ph1gc-fin-gov-001` HEAD `91b8b723`. No canonical files modified by this sidecar."
- **Reviewer (`Codex`):** please verify (a) the corrected header line 6 and §R-4 quote the actual current `next` text from `ai-status.json` `last_update = 2026-05-25T17:15:56Z`, (b) the historical-context framing for the PR #290 / IAP-WIF wording correctly attributes that phrasing to the `2026-05-25T16:58:49Z` / `2026-05-25T17:07:30Z` parent entries rather than the current `next` field, (c) the refresh-history line on the header reflects the new anchor commit, and (d) every other cited file path / line number / blob hash / branch HEAD / `REQUIRED_KEYS` / `VB_FIELD_NAMES` enumeration / UAT field accounting from the prior approved-on-merits content is still accurate. If approved, route back to the parent owner (`Codex`) so they can decide on the matrix-row landing, the spec / UAT / E2E re-versioning, and the live-staging uplift owner.

---

_Sidecar review packet refreshed. Ready for `Codex` review; parent task owner (`Codex`) and parent reviewer (`Codex2`) decide whether to absorb the surfaced risks/questions into the mainline closeout._
