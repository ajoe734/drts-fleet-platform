# ORX-GV-003 Acceptance Packet

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `ORX-GV-003` - glossary, error-copy, and multilingual failure-state consistency  
**Current Owner:** `Codex`  
**Assigned Reviewer:** `Claude2`  
**Parent Owner At Snapshot:** `Claude2`  
**Parent Reviewer At Snapshot:** `Gemini2`  
**Last Revised:** `2026-05-01 (UTC)`  
**Status:** `FINALIZED SUPPORT ARTIFACT — reviewer-approved acceptance framing and hotspot map for ORX-GV-003; support-only and non-canonical.`

---

## 1) Scope Boundary

本 sidecar 只整理 `ORX-GV-003` 的 acceptance framing、dependency map、repo-local evidence anchors、與 reviewer handoff 指引。

- In scope: support-only acceptance framing, dependency closure, glossary/copy hotspot inventory, reviewer checklist.
- Out of scope: 修改 L1 canonical truth、改寫 parent 任務正式 closeout、直接變更 admin/ops/driver/tenant runtime copy、或修改 registry/governance 主線實作。
- Repo boundary note: parent write scope includes `tenant-commute-hub/src`, but that repository is outside this workspace; this packet only audits repo-local evidence plus the machine-truth dependency chain.

---

## 2) Machine-Truth Snapshot

Snapshot 依據：`ai-status.json`、`.orchestrator/task-briefs/ORX-GV-003*.md`、repo-local docs and surfaces.

- Parent `ORX-GV-003`
  - owner=`Claude2`
  - reviewer=`Gemini2`
  - status=`in_progress`
  - acceptance=`shared operational terms have one glossary || failure-state copy no longer contradicts backend semantics || multilingual hotspots are cataloged and normalized`
- Sidecar `ORX-GV-003-SIDECAR-ACCEPTANCE`
  - owner=`Codex`
  - reviewer=`Claude2`
  - status=`review_approved` at closeout snapshot
  - helper kind=`acceptance_packet`
  - support artifact=`support/sidecars/ORX-GV-003/ORX-GV-003-SIDECAR-ACCEPTANCE.md`
  - `mutates_canonical=false`

### Direct Dependencies

| Dep ID       | Status | Commit    | Why it matters to `ORX-GV-003`                                                                                                                                                                                     |
| ------------ | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ORX-GV-001` | `done` | `97e4c63` | Negative-path gates now require UX-visible denial, escalation, timeout, and audit outcomes. ORX-GV-003 must keep failure-state copy aligned with those gate semantics.                                             |
| `ORX-GV-002` | `done` | `8ce6fe5` | Owner / escalation routing for exception, override, rollback, incident, and reconciliation paths is now explicit. ORX-GV-003 must not let UI copy contradict those operator responsibilities or state transitions. |

### Repo-External Follow-Through

| Surface                  | Status                 | Note                                                                                                                                   |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant-commute-hub/src` | `outside current repo` | Parent scope includes tenant and partner wording, but this sidecar cannot verify copy changes there from inside `drts-fleet-platform`. |

---

## 3) Evidence Anchors

### Product And Design Rules

| Area                                                                                                                                                                                       | Evidence                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Operator surfaces may show codes, but user-facing copy must stay consistent and glossary-governed                                                                                          | `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md:557-559` |
| Multilingual operating consistency is still an explicit Phase 1 follow-through item                                                                                                        | `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md:664-665` |
| Shared terminology baseline spans admin, ops, driver, tenant, and operator-facing docs                                                                                                     | `docs/03-runbooks/operational-glossary-and-copy-audit.md:9-17`                        |
| Display-copy policy forbids mixed meaning and Simplified Chinese drift in operator surfaces                                                                                                | `docs/03-runbooks/operational-glossary-and-copy-audit.md:30-37`                       |
| Canonical glossary already freezes `Health & Alerts`, `Recording State`, `Open in dispatch`, `Payer`, `Sponsor`, `Driver payout authority`, `Rollback Hold`, and `Ops` / `Operator` labels | `docs/03-runbooks/operational-glossary-and-copy-audit.md:41-52`                       |

### Dependency-Carried Failure Semantics

| Dependency output                                                                                                                              | Evidence                                                                                       | Why ORX-GV-003 inherits it                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Negative-path gates now require UX-visible denials, escalation visibility, and audit completeness                                              | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md:101-106`, `:126-137`             | Copy cannot imply silent success or hide denial / escalation outcomes that the release gate now treats as mandatory evidence. |
| Concrete negative-path rows now define `403`, timeout, missing-recording, and override-copy expectations                                       | `docs/04-uat/phase1-uat-checklist.md:235-298`                                                  | Review should compare any new failure-state wording against the actual scenarios that operators and drivers must understand.  |
| Operator routing matrix freezes owner / escalation truth for rollback, recording gate, exception hold, incident escalation, and reconciliation | `docs/02-architecture/phase1-operator-ownership-escalation-matrix-20260501.md:13-33`, `:37-56` | UI wording must match who owns the state and when escalation happens.                                                         |
| Operator routing runbook freezes stop / release rules and preserved trace requirements                                                         | `docs/03-runbooks/phase1-operator-routing-runbook.md:16-25`, `:27-41`, `:78-126`               | Failure-state copy must not blur the difference between explicit hold, formal release, incident handoff, and manual review.   |

### Current Repo-Local Surface Hotspots

| Surface                                                                                                                                                                 | Evidence                                                                                                                   | Reviewer relevance                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform admin health wording is already aligned to `Health & Alerts` / `健康與警示`, but the error banner still renders raw runtime text                               | `apps/platform-admin-web/lib/translations.ts:1312-1345`, `apps/platform-admin-web/app/health/page.tsx:248-255`             | Confirm parent work does not regress glossary terms and decides whether raw backend error text is acceptable in operator-visible failure states.                |
| Platform admin finance wording already freezes payer / sponsor / payout / discount semantics, but page-level error UI still passes through raw text                     | `apps/platform-admin-web/lib/translations.ts:1164-1210`, `apps/platform-admin-web/app/payments/page.tsx:612-619`           | Confirm finance failure copy stays aligned with the glossary and does not drift back to mixed-language or ambiguous sponsor wording.                            |
| Platform-admin localized code labels already freeze `ops`, `operator`, `rollback_hold`, and debranding-related states                                                   | `apps/platform-admin-web/lib/localized-labels.ts:93-105`, `:137-143`                                                       | Parent changes should reuse these shared labels instead of inventing page-local variants.                                                                       |
| Ops callcenter already localizes recording state, `Open in dispatch`, and exception-hold detail copy, but page-level error resolution still prefers raw `error.message` | `apps/ops-console-web/lib/translations.ts:1774-1847`, `apps/ops-console-web/app/callcenter/page.tsx:100-101`, `:1030-1190` | Confirm recording and exception-hold wording remains semantically correct after any copy cleanup, and decide whether raw error passthrough is still acceptable. |
| Ops dispatch renders queue state, exception-hold reason, override actors, timeout reason, and last-failure copy directly from canonical status/code labels              | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:1125-1285`                                                        | This is the most failure-state-dense surface; reviewer should compare wording against ORX-GV-001 / ORX-GV-002 semantics first.                                  |
| Ops localized code labels already freeze recording, timeout, no-supply, escalation-to-ops, and operator-redispatch labels                                               | `apps/ops-console-web/lib/localized-labels.ts:147-203`                                                                     | Parent changes should preserve these one-to-one mappings rather than layering synonyms.                                                                         |
| Ops global error boundary shows localized chrome but still renders raw `error.message` inside the body                                                                  | `apps/ops-console-web/app/error.tsx:35-56`                                                                                 | This is a cross-surface hotspot for backend-semantic leakage into user-facing failure copy.                                                                     |
| Driver incident flow uses Traditional Chinese success copy but still displays raw backend message on failure                                                            | `apps/driver-app/app/incident.tsx:39-55`, `:81-109`                                                                        | Confirms that ORX-GV-003 is not just a web-console task; driver-facing failure states also need normalization.                                                  |
| Driver trip flow parses API envelopes but still falls back to raw English or `Unknown error` copy                                                                       | `apps/driver-app/app/trip.tsx:117-136`                                                                                     | Reviewer should check whether parent work normalizes fallback copy or explicitly records this as remaining drift.                                               |
| Driver settings flow also falls back to raw error message or generic `要求失敗` copy                                                                                    | `apps/driver-app/app/settings.tsx:25-29`                                                                                   | Another concrete multilingual hotspot showing the lack of a centralized driver locale layer.                                                                    |
| Baseline glossary audit already called out the driver-app locale-layer gap as residual risk                                                                             | `docs/03-runbooks/operational-glossary-and-copy-audit.md:75-81`, `:141-145`                                                | If parent patch does not build a locale layer, it should at least catalog the remaining inline-copy hotspots explicitly.                                        |

---

## 4) Parent Acceptance Expansion

The parent task is still `in_progress`, so the statuses below are reviewer targets, not a claim that the acceptance already passes.

### AC-1: Shared operational terms have one glossary

**Reviewer target:** `PENDING PARENT CLOSEOUT`

- A repo-local glossary baseline already exists and is specific, not generic: `docs/03-runbooks/operational-glossary-and-copy-audit.md:41-52`.
- Platform admin already reflects `Health & Alerts`, `Ops`, `Rollback Hold`, `Payer`, `Sponsor`, and `Driver payout authority`: `apps/platform-admin-web/lib/translations.ts:1164-1210`, `:1312-1345`, `apps/platform-admin-web/lib/localized-labels.ts:93-105`.
- Ops console already reflects `Recording State`, `Open in dispatch`, `營運`, and exception / timeout state labels: `apps/ops-console-web/lib/translations.ts:1774-1847`, `apps/ops-console-web/lib/localized-labels.ts:147-203`.
- Reviewer should fail this AC if parent changes reintroduce stale wording such as `Health & Quotas`, mixed `營運` / `運營`, or page-local synonyms for the same workflow state.

### AC-2: Failure-state copy no longer contradicts backend semantics

**Reviewer target:** `PENDING PARENT CLOSEOUT`

- ORX-GV-001 established that denial, timeout, and escalation outcomes must be visible and auditable at the UX level: `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md:101-106`, `:126-137`, `docs/04-uat/phase1-uat-checklist.md:242-298`.
- ORX-GV-002 established that `recording_pending`, `exception_hold`, override approval, incident handoff, and rollback are owned workflows with explicit stop / release rules: `docs/02-architecture/phase1-operator-ownership-escalation-matrix-20260501.md:21-33`, `docs/03-runbooks/phase1-operator-routing-runbook.md:27-41`, `:78-126`.
- Review should fail this AC if copy implies a silent release, hides who owns escalation, or shows raw backend wording that changes the meaning of a state transition.
- The highest-risk repo-local hotspots are the raw `error.message` passthroughs in platform-admin, ops-console, and driver-app surfaces: `apps/platform-admin-web/app/health/page.tsx:248-255`, `apps/platform-admin-web/app/payments/page.tsx:612-619`, `apps/ops-console-web/app/callcenter/page.tsx:100-101`, `apps/ops-console-web/app/error.tsx:35-56`, `apps/driver-app/app/incident.tsx:53-55`, `apps/driver-app/app/trip.tsx:117-136`, `apps/driver-app/app/settings.tsx:25-29`.

### AC-3: Multilingual hotspots are cataloged and normalized

**Reviewer target:** `PENDING PARENT CLOSEOUT`

- The baseline audit already cataloged glossary-sensitive surfaces and left a clear residual-risk note for driver locale drift: `docs/03-runbooks/operational-glossary-and-copy-audit.md:89-130`, `:141-145`.
- Parent closeout should either:
  - normalize the remaining repo-local hotspots directly, or
  - explicitly catalog unresolved hotspots with surface-by-surface ownership and a no-silent-success explanation.
- This AC is not repo-local only: reviewer should verify that the tenant / partner surface follow-through is either implemented in the sibling repo or called out as a remaining external follow-up, not silently omitted.

---

## 5) Verification Evidence

### Static Audit Commands Actually Run On 2026-05-01

```bash
rg -n "ORX-GV-003|glossary|error-copy|failure-state|multilingual" docs/03-runbooks/phase1-operational-remediation-execution-packet-20260430.md docs/03-runbooks
rg -n "Health & Alerts|健康與警示|Open in dispatch|在派車台開啟|錄音狀態|營運|付款方|贊助方|司機付款權責|Rollback Hold|回滾保留|退場|除標識" apps/platform-admin-web apps/ops-console-web apps/driver-app docs/04-uat docs/03-runbooks
rg -n "Alert\\.alert|error|錯誤|失敗|逾時|待處理|待附錄音|exception_hold|override" apps/driver-app/app apps/ops-console-web/app apps/platform-admin-web/app
```

### What Those Checks Confirmed

- `ORX-GV-003` acceptance is correctly derived from the remediation execution packet and is intentionally downstream of `ORX-GV-001` and `ORX-GV-002`.
- The glossary baseline is already present across runbooks and repo-local surfaces for the canonical terms most likely to drift.
- Repo-local failure-state hotspots still include raw `error.message` passthroughs across admin, ops, and driver surfaces, which makes them high-value review targets for the parent task.
- `apps/driver-app` still relies on inline copy rather than a centralized locale layer, exactly as the baseline glossary audit warned.

### Important Verification Note

This sidecar did **not** run product builds or app tests. It is a support-only static audit packet, and the parent task is still actively changing UI copy. Reviewer reruns should happen after the parent patch stabilizes.

### Recommended Reviewer Reruns After Parent Patch

```bash
rg -n "Health & Quotas|運營|Unknown error|error.message|Open in dispatch|在派車台開啟|錄音狀態|Rollback Hold|回滾保留" apps/platform-admin-web apps/ops-console-web apps/driver-app docs/03-runbooks docs/04-uat
rg -n "403 Forbidden|401 Unauthorized|NP-DSP|NP-FIN|NP-COM|NP-OVR|recording_pending|exception_hold|dispatch_timeout" docs/04-uat docs/03-runbooks apps/ops-console-web apps/driver-app apps/platform-admin-web
```

---

## 6) Review Notes And Non-Blocking Gaps

- Parent `ORX-GV-003` is still `in_progress`; this packet is review support, not a declaration that the parent already satisfies all three acceptance criteria.
- The tenant / partner portal surface is only represented here through repo-local docs and task scope metadata because `/home/edna/workspace/tenant-commute-hub/src` is outside this repository.
- ORX-GV-003 should build on the existing glossary baseline instead of duplicating a second competing glossary table in new canonical docs unless the parent task explicitly records a delta audit.
- If raw backend error messages remain visible after the parent patch, the reviewer should require either normalized UI copy or an explicit note explaining why that surface is intentionally diagnostic-only.

---

## 7) Absorption Hotspots For `Claude2`

1. Check that the parent patch covers both label drift and raw failure-message drift; fixing only translation tables is not enough if operators and drivers still see backend error strings directly.
2. Compare any rewritten copy against the actual negative-path and routing semantics from `ORX-GV-001` and `ORX-GV-002`, especially around recording gaps, exception holds, override approval, timeout escalation, and rollback hold.
3. Treat `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` and `apps/ops-console-web/app/callcenter/page.tsx` as the highest-risk repo-local semantics hotspots before reviewing lower-risk wording cleanups.
4. Ensure the parent closeout explicitly says what happened to the tenant / partner surface follow-through, since that scope sits outside this repo and can otherwise disappear from the final narrative.

---

## 8) Handoff Commands

### Owner -> Reviewer (`Codex` -> `Claude2`)

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff ORX-GV-003-SIDECAR-ACCEPTANCE Claude2 "ORX-GV-003 acceptance packet is ready at support/sidecars/ORX-GV-003/ORX-GV-003-SIDECAR-ACCEPTANCE.md. It freezes the dependency chain on ORX-GV-001 and ORX-GV-002, catalogs the repo-local glossary and failure-state copy hotspots across platform-admin, ops-console, and driver-app, and marks the tenant/partner surface as an external follow-through item. Support artifact only; no canonical truth or runtime implementations changed."
```

### Reviewer Approve (`Claude2`)

```bash
AI_NAME=Claude2 REVIEW_FILE=support/sidecars/ORX-GV-003/ORX-GV-003-SIDECAR-ACCEPTANCE.md python3 scripts/ai_status.py approve ORX-GV-003-SIDECAR-ACCEPTANCE "審查通過：ORX-GV-003 sidecar acceptance packet 已整理 dependency closure、glossary baseline、negative-path / routing semantics，以及 repo-local multilingual hotspot map。此 packet 明確標示 parent ORX-GV-003 仍在進行中，且沒有把 tenant-commute-hub 外部 follow-through 靜默忽略。support artifact only；回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 做 done closeout。"
```

### Owner Done Closeout (`Codex`)

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done ORX-GV-003-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; the ORX-GV-003 support-only acceptance packet is filed at support/sidecars/ORX-GV-003/ORX-GV-003-SIDECAR-ACCEPTANCE.md for Claude2 to absorb into the parent review flow without changing canonical truth."
```
