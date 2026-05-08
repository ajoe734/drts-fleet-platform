# ADM-UI-006 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `ADM-UI-006` — Partner Detail And Entry Readiness Deep-Page Hardening
**Owner (parent):** `Codex2`
**Assigned Reviewer (parent):** `Codex` (per `ai-status.json`; the design execution packet originally
named `Claude2` — this packet flags that drift but treats `ai-status.json` as machine truth.)
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-08` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical truth or product/runtime
behavior.

---

## 1. Scope Boundary

This packet exists only to help the assigned reviewer close `ADM-UI-006-SIDECAR-REVIEW` and to
preserve a compact, citation-anchored record of the parent task `ADM-UI-006` review state.

- In scope:
  - machine-truth snapshot for parent + sidecar
  - evidence summary of the partner-detail deep-page work
  - reviewer conclusion framing for the sidecar packet itself
  - explicit notes on remaining commit/push gaps so the parent owner knows what is still required
    before parent `done`
- Out of scope:
  - editing L1/L2 truth, the design execution packet, or any other canonical document
  - editing `apps/platform-admin-web/app/partners/**`, `apps/platform-admin-web/components/partner-governance-shared.tsx`,
    or `apps/platform-admin-web/lib/translations.ts`
  - approving or finalizing the parent task; the parent reviewer (`Codex`) still owns parent
    approval, and the parent owner (`Codex2`) still owns the parent commit/push/done finalize

---

## 2. Current Machine Truth Snapshot

### Sidecar task

`ai-status.json -> ADM-UI-006-SIDECAR-REVIEW`

- owner=`Claude`
- reviewer=`Codex2`
- status (at packet write): `in_progress` (started by Claude); will move to `review` on handoff
- task_class=`sidecar`
- helper_parent=`ADM-UI-006`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- depends_on: `ADM-UI-002`, `MGMT-UI-004`, `MGMT-UI-005` (all `done` in `ai-status.json`)
- artifacts: `support/sidecars/ADM-UI-006/ADM-UI-006-SIDECAR-REVIEW.md` (this file)

### Parent task

`ai-status.json -> ADM-UI-006`

- owner=`Codex2`
- reviewer=`Codex`
- status=`review`
- depends_on: `ADM-UI-002`, `MGMT-UI-004`, `MGMT-UI-005` (all `done`)
- artifacts (per ai-status.json): `apps/platform-admin-web/app/partners/[partnerId]`
  - **Drift note:** the working tree implements the route at
    `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`; the `[partnerId]` form is the
    placeholder used in the design execution packet. The parent owner should reconcile this when
    finalizing — either align the artifact path in machine truth to `[entrySlug]` or rename the
    route. This packet does not change either side.
- acceptance: `pnpm --filter @drts/platform-admin-web typecheck`
- next field records: typecheck PASS, deep-page hardening landed.
- commit_hash: `None`
- push_remote: `None`
- push_branch: `None`
- execution_packet: `MGMT-UI-20260508`
- packet_path: `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`

Interpretation rule: parent is currently `review`, **not** `done`. There is no parent commit hash
on file. This packet therefore frames evidence around the working-tree state and the parent's
recorded acceptance verification, and explicitly flags the remaining commit/push gap as a parent-owner
finalize step — not as a sidecar deliverable.

---

## 3. Evidence Summary

### Working-tree artifact evidence (uncommitted at packet write)

`git diff --stat HEAD` against the parent's write scope shows the following pending changes on
branch `codex/dev-deploy-backend-android`:

```
apps/platform-admin-web/app/partners/[entrySlug]/page.tsx              | 226 ++++++++++++++++++++-
apps/platform-admin-web/components/partner-governance-shared.tsx       |  19 ++
apps/platform-admin-web/lib/translations.ts                            |   4 +
3 files changed, 247 insertions(+), 2 deletions(-)
```

These are the files that materialize the parent task's deep-page hardening. They have not yet been
captured in a parent-scoped commit; the parent owner must commit and push as part of parent `done`.

### Deep-page surface landed by the parent

Code evidence in the working tree shows the parent extended the partner detail route to cover the
seven sections required by the execution packet:

- overview — preserved via existing `WorkflowPanel` + `DetailMetadataGrid` with detail items
  (`apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`).
- auth — new `authTitle` / `authSubtitle` panel + `authItems` (`auth-mode`, `dispatch-subtype`,
  `active-flag`, `credential-coverage` with warning tone when `partner_api_key` has zero active
  credentials).
- eligibility — new `eligibilityTitle` / `eligibilitySubtitle` panel + `eligibilityItems`
  (`eligibility-mode`, `contract-id`, `adapter-kind`, `manual-fallback` derived from
  `entry.eligibilityContract.manualFallbackPolicy`).
- credentials — preserved existing credentials panel; readiness now gates on active credential
  count when `authMode === "partner_api_key"`.
- audit — new `auditTitle` / `auditSubtitle` panel + `auditItems` covering audit source, request
  ID, created-by/updated-by with timestamps, revoked-at, revoke reason.
- readiness — new `readinessBlocked` / `readinessReady` `CalloutBanner` driven by
  `readinessComplete` (`readinessItems.every((item) => item.ready)`); banner tone escalates to
  `danger` when the entry is already `active` but readiness is incomplete.
- branding — preserved via existing detail items / panels; readiness checklist still gates on the
  branding package row.

`apps/platform-admin-web/components/partner-governance-shared.tsx` extends
`buildPartnerReadinessItems` to take an `activeCredentialCount` option and adds two new readiness
rows:

- `partners.readiness.contract` — required when `eligibilityMode !== "none"`, ready when the
  contract has a non-empty `contractId`.
- `partners.readiness.credentials` — required when `authMode === "partner_api_key"`, ready when
  `activeCredentialCount > 0`.

`apps/platform-admin-web/lib/translations.ts` adds the matching `partners.readiness.contract` and
`partners.readiness.credentials` keys in both `en` and `zh`. No translation keys are removed; no
existing keys are renamed.

### Authority / scope boundary evidence

The diff does **not** add tenant-side controls, generic-tenant detail clones, or routing surfaces
outside the partner-detail page. Authority framing copy (`authSubtitle`,
`eligibilitySubtitle`, `auditSubtitle`, `readinessBlocked`) keeps rollout authority explicitly
platform-side, matching the execution packet's instruction:

> Keep partner-entry authority and rollout semantics explicit; do not blur this page into a
> generic tenant detail clone.

### Acceptance evidence

Parent acceptance per `ai-status.json -> ADM-UI-006`:

- `pnpm --filter @drts/platform-admin-web typecheck` — recorded as PASS in the parent task's
  `next` field.

This sidecar packet does not re-run the typecheck; it relies on the parent owner's recorded
verification. Reviewer (`Codex`) of the parent task is responsible for re-validating acceptance
before parent approval.

---

## 4. Reviewer Assessment (sidecar scope only)

Review result for **this sidecar packet**:

- The packet is support-only. It adds a single file under
  `support/sidecars/ADM-UI-006/` and changes nothing in `packages/**`, `apps/**`,
  `phase1_*` truth, the design execution packet, or any state file beyond
  `ai-status.json` lifecycle transitions performed via `scripts/ai-status.sh`.
- Evidence anchors are specific enough for later audit:
  - parent + sidecar state in `ai-status.json`
  - working-tree diff stat against the parent's write scope
  - per-section code anchors in `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`,
    `apps/platform-admin-web/components/partner-governance-shared.tsx`, and
    `apps/platform-admin-web/lib/translations.ts`
  - design-packet anchor: `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
    section `### ADM-UI-006 — Partner Detail And Entry Readiness Deep-Page Hardening`
- Two open notes for the parent owner (out of scope for the sidecar):
  1. Parent task still needs a parent-scoped commit and a normal non-force push before parent
     `done`; commit subject must include `ADM-UI-006`, body trailers must include
     `LLM-Agent: Codex2`, `Task-ID: ADM-UI-006`, `Reviewer: Codex`, and the verification line.
  2. The parent task's `artifacts` field in `ai-status.json` lists
     `apps/platform-admin-web/app/partners/[partnerId]`; the working tree implements
     `[entrySlug]`. Parent owner should reconcile during finalize.

Reviewer conclusion (this sidecar):

- approve `ADM-UI-006-SIDECAR-REVIEW` once this packet is recorded; no canonical truth was
  modified, the parent state is faithfully summarized, and the open finalize gaps are surfaced for
  the parent owner.
- if drift appears later (e.g., parent gets reopened, artifacts field changes, the typecheck
  re-runs differently), `reopen` this sidecar with a specific drift note instead of approving.

---

## 5. Reviewer Handoff Commands

Approve (sidecar only — does not approve the parent):

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve ADM-UI-006-SIDECAR-REVIEW "Review packet aligned with current machine truth: parent ADM-UI-006 is in review with Codex2 owner / Codex reviewer, partner detail page now covers overview/auth/eligibility/credentials/audit/readiness/branding via apps/platform-admin-web/app/partners/[entrySlug]/page.tsx and partner-governance-shared.tsx with matching translations, and the packet flags the open parent-owner finalize gaps (parent commit + push, [partnerId] vs [entrySlug] artifact reconciliation) without modifying canonical truth."
```

Reopen if drift is found instead:

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen ADM-UI-006-SIDECAR-REVIEW "packet needs revision: [specify machine-truth drift, evidence gap, or support-scope violation]"
```

---

## 6. Closeout Note

This sidecar is `task_class=sidecar` with `mutates_canonical=false`, so per the AI Collaboration
Guide §5 commit evidence rule, owner closeout may use `NO_COMMIT_REQUIRED=1` after sidecar
approval. The parent task `ADM-UI-006` is **not** a sidecar — it still requires the full
commit/push/done sequence with parent-scoped trailers before it can be marked `done`. Nothing in
this packet substitutes for that parent finalization.
