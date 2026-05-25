# PH1GC-FIN-GOV-001 — Sidecar Review Packet

**Parent task:** `PH1GC-FIN-GOV-001` — Phase 1 gap closure — governance-aware billing/reporting spec + UAT
**Parent owner:** `Codex`
**Parent reviewer:** `Codex2`
**Sidecar task:** `PH1GC-FIN-GOV-001-SIDECAR-REVIEW`
**Sidecar owner:** `Claude2` (this packet)
**Sidecar reviewer:** `Codex`
**Helper kind:** `review_packet` (support-only; no canonical truth edits)
**Collected:** `2026-05-25` (UTC)
**Parent gate read at packet time:** `WF-FIN-GOV-001 = PASS (static evidence)` — uplift to live staging is externally blocked (see §5).

---

## 0. Purpose & scope

This packet is a reviewer-facing audit of the parent task's deliverables against the
directive §H acceptance bar. It does **not** modify canonical truth (spec / UAT /
E2E / gate matrix). Reviewer `Codex` should use it as a pre-read before
re-evaluating `PH1GC-FIN-GOV-001` while the parent waits on external infra inputs.

In scope:

- map the 6 parent acceptance criteria to current evidence
- map the 13 verification-body fields (directive §H) to spec §3, UAT scenarios,
  and `E2E-010` `REQUIRED_KEYS`
- record the live-staging blocker chain from the parent's `next` field
- list reviewable findings (non-blocking nits + one consistency call-out)

Out of scope (do not change in this packet):

- the spec, UAT, or `E2E-010` script
- the workflow gate matrix (`PH1GC-MATRIX-001` owns the matrix-row insertion)
- the parent's closeout report (only the parent owner can finalise that at `done` time)

---

## 1. Canonical artifacts under review

| Path                                                                              | Role                          | Last touched                                                                                |
| --------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`        | spec — 13 verification fields | `6607dea8 PH1GC-DOC-BATCH-1` (on `origin/dev`)                                              |
| `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`                  | UAT — 13 acceptance scenarios | `6607dea8 PH1GC-DOC-BATCH-1` (on `origin/dev`)                                              |
| `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`                         | executable proof (323 lines)  | on `origin/dev`                                                                             |
| `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`   | directive §H authority        | reference only                                                                              |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`                    | gate matrix                   | row `WF-FIN-GOV-001` **not yet present**; insertion is `PH1GC-MATRIX-001` responsibility    |

---

## 2. Parent acceptance ↔ current state

| #   | Acceptance bar (verbatim from `ai-status.json`)                                                          | State          | Evidence / note                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | spec file visible on `origin/dev`                                                                        | **Met**        | `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` shipped via `6607dea8 PH1GC-DOC-BATCH-1`.                                                                                                                                           |
| A2  | UAT file visible on `origin/dev`                                                                         | **Met**        | `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` same commit.                                                                                                                                                                                  |
| A3  | UAT covers all 13 directive §H verification-body fields                                                  | **Met**        | See field-cluster ↔ scenario map in §3 below. Every directive §H bullet has at least one UAT scenario (happy and/or negative).                                                                                                                                 |
| A4  | `PH1GC-E2E-010` script asserts every field listed in the verification body                               | **Met (with nit)** | `E2E-010` `REQUIRED_KEYS` (lines 250–264) hard-asserts all 13 spec §3.1–§3.5 keys via `has()` even when their value is null; chain fields `auditId` + `reportArtifactId` are asserted via separate `/audit` and report-export responses (lines 226–240). See finding F2 — `auditId` is not part of the `has()` loop on the billing body, but spec §3.6 locates it on the audit row, so the script's split is consistent. |
| A5  | Gate-read update for `WF-FIN-GOV-001 = PASS (live staging evidence)` drives matrix change                | **Blocked externally** | Parent `next` field (`2026-05-25T17:35:16Z`) records: workflow_dispatch run `26411905501` on `codex/ph1gc-fin-gov-001` still fails before E2E-010 starts; protected staging host still redirects to Google OAuth; known direct `run.app` hosts still return 404; repo still lacks `STAGING_DIRECT_API_ORIGIN`; last successful `Deploy — Staging` run on record remains `2026-04-27`. Current gate read therefore stays `PASS (static evidence)`. **Matrix row insertion itself is owned by `PH1GC-MATRIX-001`, not this task** — once that row lands and the live rerun is green, both can be uplifted in a single matrix change. |
| A6  | Closeout report follows directive §7 format                                                              | **Pending**    | Not yet produced — produced by parent owner at `done` time. §7 scaffold reproduced in §6 below for convenience.                                                                                                                                                |

Net read: the **doc + UAT + E2E contract is complete and reviewable**; live-gate uplift
and closeout are downstream of external infra unblocking.

---

## 3. Directive §H 13-field ↔ spec ↔ UAT ↔ E2E-010 trace

Directive §H enumerates 13 verification-body items. Spec §3 expands them into 13
distinct fields (§3.1–§3.5) plus the §3.6 audit/report-linkage pair. `E2E-010`
`REQUIRED_KEYS` (the `has()` loop on the billing body) covers exactly the 13
spec §3.1–§3.5 fields; `auditId` and `reportArtifactId` are covered by separate
API calls in the same script.

| Directive §H field                                | Spec §   | UAT scenarios that exercise it                                                                                  | `E2E-010` assertion site                                                                |
| ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. `costCenterCode`                               | §3.1     | `UAT-FIN-GOV-001`, `-002`, `-003`, `-004`, `-005`, `-006`                                                       | `REQUIRED_KEYS[0]` + spot-check `billing_cc == CC_CODE` (L282–288)                       |
| 2. `costCenterName`                               | §3.1     | `UAT-FIN-GOV-001` (registry snapshot resolution)                                                                | `REQUIRED_KEYS[1]`                                                                       |
| 3. `ownerUserId`                                  | §3.1     | `UAT-FIN-GOV-001` (owner mapping pre-condition §1)                                                              | `REQUIRED_KEYS[2]` + spot-check `billing_owner == OWNER_USER_ID` (L292)                  |
| 4. `ownerName`                                    | §3.1     | `UAT-FIN-GOV-001`                                                                                               | `REQUIRED_KEYS[3]`                                                                       |
| 5. `legacy_unmapped` flag                         | §3.1/§3.7 | `UAT-FIN-GOV-011` (integrity — cannot be flipped on a current-registry tenant)                                  | `REQUIRED_KEYS[4]`                                                                       |
| 6. `approvalEvaluationId`                         | §3.2     | `UAT-FIN-GOV-001`, `-002`, `-003`                                                                               | `REQUIRED_KEYS[5]`                                                                       |
| 7. `approvalRequestId`                            | §3.2     | `UAT-FIN-GOV-001`, `-002`, `-003`, `-008` (rejected — no billing record produced)                               | `REQUIRED_KEYS[6]`                                                                       |
| 8. `approvalState`                                | §3.2     | `UAT-FIN-GOV-001` (`auto_approved`), `-002` (`approved`), `-003` (`escalated_then_approved`), `-008` (`rejected`) | `REQUIRED_KEYS[7]` + spot-check `billing_state == "approved"` (L289)                     |
| 9. `quotaPeriodKey`                               | §3.3     | `UAT-FIN-GOV-001`, `-004` (sum across 3 bookings), `-007` (ceiling negative)                                    | `REQUIRED_KEYS[8]` + spot-check `billing_quota == QUOTA_PERIOD_KEY` (L290)               |
| 10. `quotaUsageDelta`                             | §3.3     | `UAT-FIN-GOV-004`, `-007`, `-012` (post-export immutability — adjustment-record path)                            | `REQUIRED_KEYS[9]` + non-null spot-check (L291)                                          |
| 11. `partnerProgramCode`                          | §3.4     | `UAT-FIN-GOV-005`, `-013` (reference-token masking integrity)                                                   | `REQUIRED_KEYS[10]` (present even when null on non-partner happy path — spec §2 contract) |
| 12. `eligibilityVerificationId`                   | §3.4     | `UAT-FIN-GOV-005`                                                                                               | `REQUIRED_KEYS[11]` (present even when null)                                              |
| 13. `platformEarningsRef` (when forwarded)        | §3.5     | `UAT-FIN-GOV-006`                                                                                               | `REQUIRED_KEYS[12]` (present even when null)                                              |
| §H closing bullet — `auditId / reportArtifactId`  | §3.6     | `UAT-FIN-GOV-001` (audit anchor), implied for every export                                                       | Separate `/audit` query (L235–240) + `reportArtifactId` from `/tenant/reports/governance-export` (L223–231). Not part of the `has()` loop — see finding F2. |

Cross-cutting UAT-only assertions (not blocking field presence but blocking
acceptance of the broader contract):

- `UAT-FIN-GOV-009` — RBAC: non-finance role cannot export (403 + audit row)
- `UAT-FIN-GOV-010` — RBAC: cross-tenant attempt blocked (404, not 403 — avoid existence leakage)
- `UAT-FIN-GOV-013` — `referenceToken` mask integrity (no unmasked token in any export or log line)

Note on `E2E-010` scope discipline (script comment lines 30–41): the script
intentionally focuses on the **verification-body contract** (UAT-FIN-GOV-001 +
004); negative paths UAT-FIN-GOV-002/003/005/006/007/008/009 are assigned to
the UAT pack and to `E2E-005` negative paths. Reviewer should confirm this
split is acceptable for the gate uplift — see finding F4.

---

## 4. Findings

### F1 — Numbering / counting convention difference (informational; no action needed)

Directive §H counts 12 bullets where `ownerUserId / ownerName` is bullet 3 (a
pair) and `auditId / reportArtifactId` is bullet 13 (a pair). The spec §3
expands `ownerUserId` and `ownerName` into two separate fields and treats
`auditId` + `reportArtifactId` in §3.6 outside the "13 required fields" framing.
The `E2E-010` `REQUIRED_KEYS` array of 13 matches spec §3.1–§3.5 (so
`ownerUserId` and `ownerName` count separately, and `auditId` /
`reportArtifactId` are asserted via separate calls). All three documents arrive
at the same set of fields by different paths. **No change needed**, but
reviewer may want to add a one-line cross-reference in the spec header noting
that "13 fields = spec §3.1–§3.5; §3.6 adds 2 chain anchors asserted via the
audit row / export response."

### F2 — `auditId` is not in the billing-body `has()` loop

The `E2E-010` `REQUIRED_KEYS` loop asserts the 13 spec §3.1–§3.5 fields on the
billing body but does not assert `has("auditId")` or `has("reportArtifactId")`
on the billing body itself. Both are instead validated by:

- separate `GET /audit?resourceType=billing&resourceId=$BILLING_ID` (lines 234–240) — asserts a non-empty `auditId` on the audit row, then `audit_target == BILLING_ID` (line 304–306)
- `reportArtifactId` from the `/tenant/reports/governance-export` response (line 229–231)

This is **consistent with spec §3.6** ("Every governance-aware billing or
report event emits an audit row" — i.e. `auditId` lives on the audit row, not
on the billing body). If `Codex` reads §H bullet 13 as requiring `auditId` on
the billing record itself, the `has()` loop would need extension; otherwise
the current split is honored. **Recommendation:** record the resolution
explicitly in the eventual closeout (either as "auditId is chain-asserted via
/audit, not on the billing body — by design per spec §3.6", or as a single-line
script patch to add both keys to `REQUIRED_KEYS`).

### F3 — Matrix-row insertion is owned by a sibling task, not this one

`PH1GC-MATRIX-001` (per `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`
row "Add new `WF-FIN-GOV-001`") owns the matrix-row insertion into
`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`. As of
`2026-05-25` that file still has no `WF-FIN-GOV-001` row (only `WF-FIN-001`).
Acceptance #5 on this parent task therefore cannot be closed by this task
alone — it requires both `PH1GC-MATRIX-001` (row insertion) and the
external-infra unblocking captured in §5 (live-staging rerun for the uplift).
**Recommendation:** when the live rerun goes green, coordinate the matrix
update so `PH1GC-FIN-GOV-001` and `PH1GC-MATRIX-001` close in a coherent
single-commit window.

### F4 — Negative paths are assigned to `E2E-005`, not `E2E-010`

`E2E-010` script comment (lines 39–41) explicitly defers
`UAT-FIN-GOV-002/003/005/006/007/008/009` to the UAT pack + `E2E-005`
negatives. Acceptance #4 ("PH1GC-E2E-010 script asserts every field listed in
the verification body") is satisfied because all 13 **field-presence**
assertions live in `E2E-010`; the **scenario semantics** for the negative
paths live elsewhere. Reviewer should confirm this is the intended split for
the gate uplift bar in UAT §4.

### F5 — STRICT_VERIFICATION_BODY=1 / hard-fail-on-missing-seed posture is honored

Per directive §0.2 / §10, the script must hard-fail when seed is absent (no
silent skip). `E2E-010` enforces this in the pre-flight block (lines 67–84):

- `require_env "E2E_BASE_URL"` and `require_env "E2E_TENANT_ADMIN_TOKEN"` exit 1 on absence
- `E2E_TENANT_FINANCE_TOKEN`, `E2E_TENANT_APPROVER_TOKEN`, `E2E_TENANT_DRIVER_TOKEN` use bash `${VAR:?msg}` (hard-fail)
- `set -euo pipefail` at line 43

The missing-key path also hard-fails (lines 274–278 — `exit 1` with the
missing-key list dumped to stderr). **Met.**

---

## 5. External blockers (verbatim from parent `next`, `2026-05-25T17:35:16Z`)

The parent task records the following live-gate blockers; this packet does
not duplicate or paraphrase them as if they were resolved.

1. workflow_dispatch run `26411905501` on branch `codex/ph1gc-fin-gov-001` still fails before `E2E-010` starts (so the script's verification body never gets to run live)
2. protected staging host still redirects to Google OAuth (IAP gate active; no non-interactive token mintable from the workspace per the existing `FIN-GOV-001` evidence pack §4.2)
3. known direct `run.app` hosts still return 404 (the historical Cloud Run fallback URL is gone — same as `FIN-GOV-001` evidence pack §4.3)
4. repo still lacks `STAGING_DIRECT_API_ORIGIN` secret needed by the live job
5. the latest successful `Deploy — Staging` run on record remains `2026-04-27` (no recent staging deploy to test against)
6. consequently `WF-FIN-GOV-001` stays `PASS (static evidence)` until operator / IAM / IAP / direct-origin inputs unblock a green `STRICT_VERIFICATION_BODY=1` rerun

These are all infra/credential-class blockers; no spec, UAT, or `E2E-010`
script change is required for them to clear. Per directive §9 ("不得把
external credential 缺失寫成『完成』"), the gate must remain `PASS (static
evidence)` until the live rerun is green.

---

## 6. §7 closeout scaffold (for parent owner)

When the live rerun succeeds, the parent owner should produce a §7-format
closeout. The required scaffold (parent owner to fill in, not this packet):

```text
Task ID: PH1GC-FIN-GOV-001
Owner: Codex
Reviewer: Codex2
Branch: codex/ph1gc-fin-gov-001
PR: <fill at done>
Commit: <fill at done — must include trailers LLM-Agent / Task-ID / Reviewer>
Files changed:
  - docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
  - docs/04-uat/governance-aware-billing-reporting-uat-20260519.md
  - tests/e2e/E2E-010-governance-aware-billing-reporting.sh
  - docs/03-runbooks/phase1-workflow-acceptance-release-gates.md (coordinated with PH1GC-MATRIX-001)
Verification commands:
  - bash tests/e2e/E2E-010-governance-aware-billing-reporting.sh   # against staging w/ STRICT_VERIFICATION_BODY=1
  - workflow_dispatch run <new-run-id> green
Evidence artifact:
  - <staging run URL>
  - reportArtifactId, billingId, auditId from a representative governed booking
Workflow family affected: WF-FIN-GOV-001 (new row)
Gate read before: PASS (static evidence)
Gate read after:  PASS (live staging evidence)
Remaining non-claim:
  - subsidy chargeback ledger between DRTS and partner programs is out of scope (WF-PARTNER-001 post-pilot)
  - cross-period reconciliation deferred to Phase 2
  - real-time governance dashboards deferred to Phase 2
External dependencies, if any:
  - PH1GC-MATRIX-001 for the matrix-row insertion (coordinated single-window)
```

This scaffold is sourced from `phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
§7 and is reproduced here for reviewer convenience; the parent owner remains
the authority for the actual closeout text.

---

## 7. Reviewer handoff checklist for `Codex`

When this sidecar lands as `review`, the reviewer should confirm:

- [ ] §2 acceptance ↔ state read matches your independent reading of the parent task
- [ ] §3 trace matrix is accurate against the spec / UAT / E2E (all 13 directive fields are accounted for)
- [ ] §4 findings F1–F5 are correctly characterised as informational / non-blocking
- [ ] §5 external-blocker list is consistent with the parent's `next` field on the day you review (do **not** trust this packet if `parent.next` has moved on; re-pull and compare)
- [ ] §6 §7 closeout scaffold is acceptable as a starting point for the parent owner at `done` time

If any of the above is wrong, `reopen` this sidecar to `Claude2` with a one-line
diff request. If all pass, `approve` and the sidecar will close as `done` with
`NO_COMMIT_REQUIRED=1` (sidecar review packet — support artifact only per
`AI_COLLABORATION_GUIDE.md` §5 sidecar carve-out).

---

## 8. Non-goals for this packet

- This packet does **not** modify the spec, UAT, or `E2E-010` script.
- This packet does **not** insert the `WF-FIN-GOV-001` row into the gate matrix (`PH1GC-MATRIX-001`'s responsibility).
- This packet does **not** mint or rerun any live-staging evidence (blocked per §5).
- This packet does **not** finalise the parent's §7 closeout (parent owner does that at `done` time).
- This packet does **not** override or summarise machine truth; the authority remains `ai-status.json` for state and the canonical files listed in §1 for content.
