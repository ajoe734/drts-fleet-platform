# ADM-UI-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `ADM-UI-006` — Partner Detail And Entry Readiness Deep-Page Hardening
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex` (per `ai-status.json` machine truth — design execution packet
originally listed `Claude2`; this packet flags the drift but treats `ai-status.json` as truth.)
**Sidecar Owner:** `Codex` (current closeout owner per `ai-status.json`; original drafting and
prior handoffs were by `Claude`, see §2 lifecycle history.)
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-08` (UTC) — original draft
**Last Refresh:** `2026-05-08` (UTC) — fifth refresh, after sidecar `review_approved` and the
availability-first closeout-owner reassignments at 2026-05-08T21:59:27Z and
2026-05-08T22:02:58Z. This refresh only aligns the packet's own ownership / closeout wording
with current machine truth; the acceptance evidence and parent-finalize facts are unchanged.
For the canonical lifecycle history of revisions, approvals, and reassignments, see §2.
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical truth, the
design execution packet, runtime behavior, or any L1/L2 product surface. For the live machine-truth
status of this sidecar row, read `ai-status.json -> ADM-UI-006-SIDECAR-ACCEPTANCE.status` directly;
this packet does not snapshot it.

This packet is the companion to `support/sidecars/ADM-UI-006/ADM-UI-006-SIDECAR-REVIEW.md`.
The review packet captures evidence; this packet captures the acceptance checklist, the
dependency map, and the retrospective record of the parent-finalize sequence (parent
`ADM-UI-006` is `done` as of 2026-05-08T21:29:12Z, commit `dd5fc76`, pushed to
`origin/codex/dev-deploy-backend-android`).

---

## 1. Scope Boundary

In scope:

- Translate the parent task's `acceptance` field and design-packet `Work` block into a concrete,
  citation-anchored acceptance checklist.
- Pin the dependency map and confirm each upstream slice is `done` in machine truth.
- Record, retrospectively, the parent-finalize sequence that the parent owner (`Codex2`) actually
  ran — commit `dd5fc76`, push to `origin/codex/dev-deploy-backend-android`, artifact-path
  reconciliation to `[entrySlug]`, typecheck PASS — so this support packet is consistent with the
  finalized parent.
- Confirm that the open finalize gaps the review packet originally flagged are now closed in
  machine truth.

Out of scope:

- editing L1/L2 product truth (`phase1_*`, contracts bundle), the design execution packet, or the
  parent task's machine-truth fields (`ai-status.json -> ADM-UI-006`)
- editing `apps/platform-admin-web/app/partners/**`,
  `apps/platform-admin-web/components/partner-governance-shared.tsx`, or
  `apps/platform-admin-web/lib/translations.ts`
- re-running parent acceptance or re-opening parent task `ADM-UI-006`; the parent is `done` in
  machine truth and this packet is a passive support record

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> ADM-UI-006-SIDECAR-ACCEPTANCE`

Current row metadata at this refresh:

- owner=`Codex` (current closeout owner; earlier lifecycle entries below record the original
  drafting owner `Claude` and the later finalize reassignments `Claude -> Claude2 -> Codex`)
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`ADM-UI-006`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on: `ADM-UI-002`, `MGMT-UI-004`, `MGMT-UI-005` (mirrors the parent's dependency set)
- artifacts: `support/sidecars/ADM-UI-006/ADM-UI-006-SIDECAR-ACCEPTANCE.md` (this file)

Live status (read directly from machine truth, not from this packet):

- The current values of `ai-status.json -> ADM-UI-006-SIDECAR-ACCEPTANCE.{owner,reviewer,status}`
  are the authoritative present state of this sidecar. This packet intentionally does not
  freeze those live fields in prose, because any such snapshot becomes false the moment the
  sidecar transitions (for example, between owner handoff and reviewer read, between approve
  and done, or after an availability-first reassignment). Earlier revisions did snapshot the
  live state and were correctly flagged as stale; that pattern is now retired.

Lifecycle history (per `ai-activity-log.jsonl`, append-only — does not go stale):

- 2026-05-08T21:16:58Z — assignment created (`backlog`) by supervisor underutilization
  heuristic (auto_created_by=`supervisor-underutilization`).
- 2026-05-08T21:20:37Z — owner `Claude` first handoff to reviewer `Codex2` after initial
  draft.
- 2026-05-08T21:24:36Z — reviewer `Codex2` reopened (review_failed): packet still described
  parent `ADM-UI-006` as `in_progress`, but parent had advanced to `review`.
- 2026-05-08T21:30:14Z — owner `Claude` second handoff to reviewer `Codex2` after refreshing
  the parent snapshot to `review_approved`.
- 2026-05-08T21:34:16Z — reviewer `Codex2` reopened (review_failed): parent had advanced to
  `done`; the packet's `review_approved` snapshot was now stale.
- 2026-05-08T21:41:52Z — owner `Claude` third handoff to reviewer `Codex2` after refreshing
  the parent snapshot to `done` (commit `dd5fc76`, push to
  `origin/codex/dev-deploy-backend-android`).
- 2026-05-08T21:46:50Z — reviewer `Codex2` reopened (review_failed): parent finalize facts
  were correct, but the packet's own sidecar-status sentence still said
  `in_progress after a review_failed reopen ... will move to review on the next handoff`,
  contradicting the live `review` state at the time the reviewer read the packet.
- 2026-05-08T21:57:59Z — reviewer `Codex2` approved; the sidecar entered `review_approved`.
- 2026-05-08T21:59:27Z — owner reassigned `Claude -> Claude2` for closeout via
  availability-first rebalancing.
- 2026-05-08T22:02:58Z — owner reassigned `Claude2 -> Codex` for closeout via
  availability-first rebalancing.
- The current refresh (recorded in `Last Refresh` above) keeps the earlier anti-staleness
  strategy and only updates ownership / closeout wording so the packet stays aligned with the
  live row after the post-approval reassignments. Future state transitions of this sidecar row
  are intentionally not predicted in prose here; they belong in `ai-status.json` and
  `ai-activity-log.jsonl`.

### Parent — `ai-status.json -> ADM-UI-006`

- owner=`Codex2`, reviewer=`Codex`
- status=`done` (per latest snapshot, `last_update=2026-05-08T21:29:12Z`) — parent reviewer
  (`Codex`) approved at 2026-05-08T21:24:13Z and parent owner (`Codex2`) finalized the closeout
  five minutes later. No further parent-side action is required; this packet now closes the
  acceptance support loop against a finalized parent.
- depends_on: `ADM-UI-002`, `MGMT-UI-004`, `MGMT-UI-005`
- artifacts (per ai-status.json): `apps/platform-admin-web/app/partners/[entrySlug]`
  - **Drift resolved:** parent owner reconciled the artifact path during finalize — machine
    truth and working tree now both name `[entrySlug]`. The earlier `[partnerId]` vs
    `[entrySlug]` drift flagged in the review packet is closed.
- acceptance: `pnpm --filter @drts/platform-admin-web typecheck`
- recorded outcome (parent `next` field at this snapshot):
  > "Owner closeout complete: reconciled machine-truth artifact path to
  > apps/platform-admin-web/app/partners/[entrySlug], pushed commit dd5fc76 (ADM-UI-006 harden
  > partner detail readiness page) to origin/codex/dev-deploy-backend-android, and verified
  > pnpm --filter @drts/platform-admin-web typecheck PASS plus git diff --check PASS on the
  > ADM-UI-006 scoped files."
- execution_packet: `MGMT-UI-20260508`
- packet_path: `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
- design_review: `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- design_source: `docs/05-ui/drts.zip`
- commit_hash: `dd5fc76`
- commit_subject: `ADM-UI-006 harden partner detail readiness page`
- push_remote: `origin`
- push_branch: `codex/dev-deploy-backend-android`

### Authoritative source documents

- L1 / L2 product truth — partner channel entry semantics:
  - `phase1_prd_detailed_v1.md`
  - `phase1_service_contracts_v1.md`
- Design execution packet — parent slice spec:
  - `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`,
    section `### ADM-UI-006 — Partner Detail And Entry Readiness Deep-Page Hardening`
- Companion review packet:
  - `support/sidecars/ADM-UI-006/ADM-UI-006-SIDECAR-REVIEW.md`

---

## 3. Dependency Map

The parent task's `depends_on` set is `ADM-UI-002`, `MGMT-UI-004`, `MGMT-UI-005`. All three are
`done` in `ai-status.json` at packet write.

| Dep ID        | Title                                                                      | Owner  | Reviewer | Status (truth)            | What this slice provides to ADM-UI-006                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------- | ------ | -------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADM-UI-002`  | Platform Admin Governance Home And Tenant / Partner / User Materialization | Codex2 | Codex    | `done` (commit `42aa889`) | Partner list and entry routing in `apps/platform-admin-web/app/partners/**`; without this, the deep page has no list-drill entry surface.                                                                             |
| `MGMT-UI-004` | Shared Table Filter And Status System Hardening                            | Codex2 | Codex    | `done` (commit `8f5e5ea`) | `StatusChip`, dense table, filter pills, authority badges in `packages/ui-web/src/index.tsx` reused by readiness rows, lifecycle chips, and credential rows.                                                          |
| `MGMT-UI-005` | Shared Stepper Timeline And Detail Metadata Hardening                      | Claude | Codex2   | `done` (commit `3cde573`) | `WorkflowPanel`, `WorkflowSplitLayout`, `DetailMetadataGrid`, `KpiRow`, `KpiCard`, `CalloutBanner`, `PageHeader` primitives that the deep page composes for overview / auth / eligibility / audit / readiness panels. |

Dependency assertion:

- The parent's deep-page hardening is a pure composition layer over the three upstream slices. No
  upstream slice needs to reopen for parent acceptance.
- If any upstream slice later reopens (e.g., shared primitives change shape), this dependency map
  must be re-validated and the parent typecheck re-run before the parent can return to `done`.

Reverse dependents (for context, not acceptance gates):

- `OPS-UI-007` (Dispatch Detail Workflow Hardening) and other deep-page slices in the
  Management Console Design Materialization phase share the `MGMT-UI-005` primitives the parent
  exercises here; surprises in `WorkflowSplitLayout` collapse behavior or `DetailMetadataGrid`
  semantics found while finalizing ADM-UI-006 should be flagged back into those slices.

---

## 4. Acceptance Checklist

Each item below is the acceptance gate for parent `ADM-UI-006` rephrased into a concrete,
citation-anchored check. The parent reviewer (`Codex`) signed off at 2026-05-08T21:24:13Z
(`review_approved`) and the parent owner (`Codex2`) finalized at 2026-05-08T21:29:12Z (`done`).
This checklist is the post-hoc support map for that review and for the parent owner's
finalize self-check, kept in sync with current machine truth.

Legend: `[REQUIRED]` = explicit gate from the design packet or `ai-status.json -> acceptance`.
`[DERIVED]` = unwritten but implied by the design packet's `Work` block; the parent reviewer may
treat these as informational.

### A. Deep-page surface coverage `[REQUIRED]`

Design packet states the route must support: overview, branding, auth, eligibility, credentials,
audit, readiness checklist. Status against the working tree:

- [x] **overview** — `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:612-617`
      (`WorkflowPanel` + `DetailMetadataGrid` driven by `detailItems`).
- [x] **auth** — `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:619-624`
      (`authTitle` / `authSubtitle` panel + `authItems`: `auth-mode`, `dispatch-subtype`,
      `active-flag`, `credential-coverage` with warning tone when
      `authMode === "partner_api_key"` and `activeCredentialCount === 0`,
      `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:319-371`).
- [x] **eligibility** — `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:626-634`
      (`eligibilityTitle` / `eligibilitySubtitle` panel + `eligibilityItems`: `eligibility-mode`,
      `contract-id`, `adapter-kind`, `manual-fallback` derived from
      `entry.eligibilityContract.manualFallbackPolicy`,
      `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:373-423`).
- [x] **credentials** — `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:776-870`
      (existing rotate/revoke panel preserved; readiness now gates on active credential count when
      `authMode === "partner_api_key"`, see `partner-governance-shared.tsx`).
- [x] **audit** — `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:707-712`
      (`auditTitle` / `auditSubtitle` panel + `auditItems` covering audit source, request ID,
      created-by/updated-by with timestamps, revoked-at, revoke reason,
      `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:425-465`).
- [x] **readiness** — `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:556-568`
      (top-level `CalloutBanner` whose tone escalates to `danger` when the entry is already `active`
      but readiness is incomplete, plus the side-panel readiness list at lines 669-705 driven by
      `readinessItems`).
- [x] **branding** — preserved via existing detail items / panels and the
      `partners.readiness.branding` row in `buildPartnerReadinessItems`.

### B. Authority semantics `[REQUIRED]`

Design packet rule: "Keep partner-entry authority and rollout semantics explicit; do not blur this
page into a generic tenant detail clone."

- [x] Partner detail does **not** add tenant-side controls or generic-tenant detail clones; the
      diff is contained to the partner route, `partner-governance-shared`, and `translations.ts`.
- [x] Authority framing copy stays platform-side: `authSubtitle`, `eligibilitySubtitle`,
      `auditSubtitle`, `readinessBlocked` all reinforce "platform-governed" / "rollout authority"
      language (`apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:71-128`).
- [x] Rollout flag is surfaced as `Rollout flag` / `Rollout 旗標` (`active-flag` row,
      `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:347-355`), keeping rollout-vs-status
      distinction visible to platform reviewers.

### C. Readiness checklist semantics `[REQUIRED]`

- [x] `buildPartnerReadinessItems` extended with `activeCredentialCount` option
      (`apps/platform-admin-web/components/partner-governance-shared.tsx:188-260`).
- [x] New `partners.readiness.contract` row — required when `eligibilityMode !== "none"`, ready
      when `entry.eligibilityContract?.contractId` is non-empty.
- [x] New `partners.readiness.credentials` row — required when `authMode === "partner_api_key"`,
      ready when `activeCredentialCount > 0`. When `activeCredentialCount` is `undefined` (caller did
      not pass it), the row gracefully defaults to `ready: true` so list pages without credential
      context do not flicker into `warning`.
- [x] Translation keys added for both new rows in `en` and `zh`
      (`apps/platform-admin-web/lib/translations.ts`); no existing keys removed or renamed.
- [x] List page (`apps/platform-admin-web/app/partners/page.tsx`, untouched here) continues to
      call `buildPartnerReadinessItems` without `activeCredentialCount` and is not destabilized — see
      the parent task's `next` field, which records the post-review fix to preserve `/partners`
      attention semantics while still gating credential readiness on the detail page.

### D. Recorded acceptance command `[REQUIRED]`

`ai-status.json -> ADM-UI-006 -> acceptance`:

- [x] `pnpm --filter @drts/platform-admin-web typecheck`
  - Parent reviewer (`Codex`) recorded PASS in the parent task's `next` field at the moment of
    `review_approved` (2026-05-08T21:24:13Z): "...pnpm --filter @drts/platform-admin-web
    typecheck passes."
  - Parent owner (`Codex2`) re-confirmed PASS at finalize (2026-05-08T21:29:12Z): "verified
    pnpm --filter @drts/platform-admin-web typecheck PASS plus git diff --check PASS on the
    ADM-UI-006 scoped files." Both checks were against the final pre-commit state captured by
    commit `dd5fc76`.
  - This includes the post-review regression fix: `buildPartnerReadinessItems` now treats
    credential coverage as optional unless `activeCredentialCount` is explicitly supplied, so
    the `/partners` list and attention filter do not regress when credential inventory is not
    available to the caller.
  - This sidecar does **not** re-run the typecheck; the reviewer-recorded and owner-confirmed
    PASS in machine truth is the authoritative signal.

### E. Translation parity `[DERIVED]`

- [x] All new copy strings have `en` and `zh` forms in either the `copy` map of
      `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:57-132` or the i18n table at
      `apps/platform-admin-web/lib/translations.ts`. No string is added in only one locale.

### F. Scope containment `[DERIVED]`

- [x] `git diff --stat HEAD` against the parent's write scope shows changes only in:
  - `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
  - `apps/platform-admin-web/components/partner-governance-shared.tsx`
  - `apps/platform-admin-web/lib/translations.ts`
- [x] No edits leak into `phase1_*` truth, the design packet, the contracts bundle, the
      ops-console app, the tenant app, or other admin routes.

### G. Finalize gaps closed at parent `done` `[REQUIRED]`

All finalize gaps the original review packet flagged are closed in machine truth as of the
parent `done` snapshot at 2026-05-08T21:29:12Z. This section is now a closeout receipt rather
than an open checklist.

- [x] Parent owner (`Codex2`) created a parent-scoped commit:
  - `commit_hash`: `dd5fc76`
  - `commit_subject`: `ADM-UI-006 harden partner detail readiness page`
  - the commit subject includes the parent task id `ADM-UI-006` per the L0 commit-evidence rule.
  - reviewers can confirm the trailers (`LLM-Agent: Codex2`, `Task-ID: ADM-UI-006`,
    `Reviewer: Codex`) and the `Verification: pnpm --filter @drts/platform-admin-web typecheck`
    line by inspecting the commit body directly with `git show dd5fc76`. This packet does not
    re-render the body to avoid inventing claims about trailer text it did not produce; if the
    re-reviewer of this sidecar finds a trailer drift, treat that as a parent-task concern, not
    a sidecar concern.
- [x] Parent owner pushed the task-scoped commit with a normal non-force push:
  - `push_remote`: `origin`
  - `push_branch`: `codex/dev-deploy-backend-android`
- [x] Artifact-path drift between `ai-status.json -> ADM-UI-006 -> artifacts` and the working
      tree is reconciled. `ai-status.json` now records
      `apps/platform-admin-web/app/partners/[entrySlug]` (matches the route at
      `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`). The earlier `[partnerId]`
      recording is no longer present in machine truth.
- [x] Post-review list-page regression note already addressed in parent owner's work. Recorded
      in parent `next` history as: `buildPartnerReadinessItems` treats credential coverage as
      optional unless `activeCredentialCount` is explicitly supplied, preserving `/partners`
      attention semantics. No further reviewer round was required for this regression.
- [x] Parent acceptance command re-confirmed at finalize: `pnpm --filter
@drts/platform-admin-web typecheck` PASS, plus `git diff --check` PASS on the ADM-UI-006
      scoped files (parent owner closeout statement, 2026-05-08T21:29:12Z).

---

## 5. Parent Finalize Gate — Retrospective Record

Parent `ADM-UI-006` is `done` in machine truth as of 2026-05-08T21:29:12Z. The original
finalize gate is preserved here as a record of what the parent owner (`Codex2`) actually ran,
so the support packet stays useful as a post-finalize reference rather than as a forward-looking
checklist.

Recorded order of operations (executed by parent owner `Codex2`):

1. Parent reviewer (`Codex`) approved at 2026-05-08T21:24:13Z with `pnpm --filter
@drts/platform-admin-web typecheck` PASS recorded in the parent's `next` field.
2. Parent owner re-confirmed `pnpm --filter @drts/platform-admin-web typecheck` PASS plus
   `git diff --check` PASS on the ADM-UI-006 scoped files
   (`apps/platform-admin-web/app/partners/**`,
   `apps/platform-admin-web/components/partner-governance-shared.tsx`,
   `apps/platform-admin-web/lib/translations.ts`) on the final pre-commit state.
3. Parent owner created the task-scoped commit `dd5fc76` with subject `ADM-UI-006 harden
partner detail readiness page`.
4. Parent owner pushed `dd5fc76` to `origin/codex/dev-deploy-backend-android` with a normal
   non-force push.
5. Parent owner reconciled the `ai-status.json -> ADM-UI-006 -> artifacts` path to
   `apps/platform-admin-web/app/partners/[entrySlug]` so machine truth matches the working-tree
   route.
6. Parent owner ran the `done` transition for the parent task with the captured fields, the
   equivalent of:

   ```bash
   AI_NAME=Codex2 \
     COMMIT_HASH=dd5fc76 \
     COMMIT_SUBJECT="ADM-UI-006 harden partner detail readiness page" \
     PUSH_REMOTE=origin \
     PUSH_BRANCH=codex/dev-deploy-backend-android \
     ./scripts/ai-status.sh done ADM-UI-006 \
     "Owner closeout complete: reconciled machine-truth artifact path to apps/platform-admin-web/app/partners/[entrySlug], pushed commit dd5fc76 to origin/codex/dev-deploy-backend-android, and verified pnpm --filter @drts/platform-admin-web typecheck PASS plus git diff --check PASS on the ADM-UI-006 scoped files."
   ```

7. Sidecar tasks follow their own sidecar closeout. `ADM-UI-006-SIDECAR-REVIEW` is already
   `done` (owner `Claude`, reviewer `Codex2`, `last_update=2026-05-08T21:12:20Z`). This packet
   (`ADM-UI-006-SIDECAR-ACCEPTANCE`) is governed by its own sidecar lifecycle row in
   `ai-status.json`; the sequence of revisions and review rounds this packet has already been
   through is recorded in §2 (Lifecycle history) rather than predicted in this section, since
   §5 is a retrospective record of the parent finalize gate, not a forward-looking sidecar
   plan. Both sidecars are `task_class=sidecar` with `mutates_canonical=false`, so
   `NO_COMMIT_REQUIRED=1` is allowed for sidecar `done`. Neither sidecar substitutes for,
   modifies, or revisits parent finalization — `ADM-UI-006` is closed in machine truth.

---

## 6. Reviewer Handoff Commands

Approve (sidecar only — parent `ADM-UI-006` is already `done` in machine truth and is not
re-touched by this approval):

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh approve ADM-UI-006-SIDECAR-ACCEPTANCE \
  "Acceptance packet aligned with current machine truth: parent ADM-UI-006 is status=done as of 2026-05-08T21:29:12Z with commit dd5fc76 (ADM-UI-006 harden partner detail readiness page) pushed to origin/codex/dev-deploy-backend-android, artifact path reconciled to apps/platform-admin-web/app/partners/[entrySlug], pnpm --filter @drts/platform-admin-web typecheck PASS and git diff --check PASS confirmed by parent owner Codex2 at finalize. Dependency map (ADM-UI-002, MGMT-UI-004, MGMT-UI-005 all done) is correct; deep-page surface coverage (overview/branding/auth/eligibility/credentials/audit/readiness) is anchored to apps/platform-admin-web/app/partners/[entrySlug]/page.tsx and partner-governance-shared.tsx; the previously-open finalize gaps (parent commit + push, [partnerId] vs [entrySlug] artifact reconciliation) are now closed in machine truth, recorded retrospectively in §5 of this packet."
```

Reopen if drift is found instead:

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh reopen ADM-UI-006-SIDECAR-ACCEPTANCE \
  "packet needs revision: [specify machine-truth drift vs ai-status.json -> ADM-UI-006, dependency-map error, missing acceptance gate, or support-scope violation]"
```

Note: do **not** use `reopen` to relitigate the parent task itself — `ADM-UI-006` is `done`
and is reviewed under its own task lifecycle. Reopens of this sidecar should be limited to
sidecar-document accuracy.

---

## 7. Closeout Note

This sidecar is `task_class=sidecar` with `mutates_canonical=false`, so per
`AI_COLLABORATION_GUIDE.md` §5 commit evidence rule, owner closeout (currently `Codex`; earlier
drafting owner `Claude`) may use `NO_COMMIT_REQUIRED=1` after sidecar approval. The parent task
`ADM-UI-006` is **not** a sidecar — its full commit / push / done sequence has already been
executed by parent owner `Codex2` (commit `dd5fc76`, push to
`origin/codex/dev-deploy-backend-android`, `done` at 2026-05-08T21:29:12Z; see §2 and §5).
Nothing in this packet retroactively changes that finalization, nothing in this packet
authorizes any change to L1 / L2 truth or the design execution packet, and nothing in this
packet can re-open `ADM-UI-006` — re-opening the parent would require a fresh canonical task,
not a sidecar action.
