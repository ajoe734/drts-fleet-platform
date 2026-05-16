# TEN-UI-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `TEN-UI-002` - Tenant Console Shell And Information Architecture Materialization
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Codex2`
**Sidecar Reviewer:** `Claude`
**Generated:** `2026-05-09` (UTC) - original draft lineage retained
**Last Refresh:** `2026-05-09` (UTC) - refreshed against the parent task's recorded `done` closeout
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or the parent implementation itself.

This packet is the reviewer-facing acceptance companion for the completed tenant-console shell
slice. It preserves the stable machine-truth anchors, dependency map, acceptance checklist, and
parent closeout evidence while leaving live sidecar lifecycle fields such as `status`, `next`, and
`last_update` authoritative only in `ai-status.json`.

---

## 1. Scope Boundary

In scope:

- capture the accepted tenant-console shell topology that replaced the sunset
  `apps/tenant-portal-web` shell as the in-repo tenant-admin target
- pin the machine-truth dependency chain for `TEN-UI-002`
- summarize the parent task's recorded closeout evidence after `done`
- record the known metadata drift where the parent task's artifact/acceptance fields still cite
  `apps/tenant-portal-web`

Out of scope:

- editing L1/L2 product truth, parent task truth, or `ai-status.json`
- changing the parent implementation, dependency tasks, or reviewer conclusions
- claiming that this packet repairs the stale parent artifact-path metadata; it documents the
  drift only

---

## 2. Machine Truth Anchors

### Sidecar (this task) - `ai-status.json -> TEN-UI-002-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Claude`
- depends_on=`TEN-UI-001`, `XS-UI-001`, `XS-UI-004`
- task_class=`sidecar`
- helper_parent=`TEN-UI-002`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/TEN-UI-002/TEN-UI-002-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

Refresh note:

- Earlier drafts snapshotted the sidecar's transient `in_progress` state and the parent's
  `review_approved` pre-closeout state, which became stale after the parent moved to `done`.
- This refresh keeps only stable sidecar anchors in the packet and defers mutable workflow state
  to `ai-status.json`.

### Parent - `ai-status.json -> TEN-UI-002`

- owner=`Codex2`
- reviewer=`Claude2`
- status=`done`
- depends_on=`TEN-UI-001`, `XS-UI-001`, `XS-UI-004`
- acceptance=`pnpm --filter @drts/tenant-portal-web typecheck`
- artifact field currently still records=`apps/tenant-portal-web`
- recorded closeout evidence:
  - commit=`845f996126b156f2386d8b24644c3c1ebd4094bc`
  - subject=`TEN-UI-002 materialize tenant console shell`
  - push remote=`origin`
  - push branch=`codex/dev-deploy-backend-android`
- current `next` note records finalized evidence:
  `pnpm --filter @drts/tenant-portal-web typecheck PASS`,
  `pnpm --filter @drts/tenant-console-web typecheck PASS`,
  nav longer-href ranking verified,
  sidebar active-state gate verified,
  and root `dev:tenant -> @drts/tenant-console-web` verified.

### Upstream dependencies already satisfied

- `TEN-UI-001` is `done` in `ai-status.json`
- `XS-UI-001` is `done` in `ai-status.json`
- `XS-UI-004` is `done` in `ai-status.json` with recorded closeout commit
  `c48024309e8f94bc235a002ff83cebeb8716f6b9`

### Authoritative supporting documents

- `support/sidecars/TEN-UI-002/TEN-UI-002-SIDECAR-REVIEW.md`
- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`

---

## 3. Dependency Map

| Dependency   | Status | Why it matters to `TEN-UI-002`                                                                                          |
| ------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-001` | `done` | Selected the tenant shell rewrite direction and rejected reactivating the sunset portal shell.                          |
| `XS-UI-001`  | `done` | Provided the route-to-endpoint framing used to separate tenant-admin navigation from partner booking entry.             |
| `XS-UI-004`  | `done` | Provided the shared `/bookings` query vocabulary: `q`, `status`, `dateField`, `dateFrom`, `dateTo`, `page`, `pageSize`. |

Assertion:

- No dependency reopen is implied by this packet. The parent task already closed with reviewer
  approval and recorded commit/push evidence.

Downstream note:

- The now-closed tenant-console shell is the formal prerequisite for `TEN-UI-003`, `TEN-UI-004`,
  `TEN-UI-005`, `TEN-UI-006`, and `TEN-UI-007`, but this packet does not add or mutate any
  dependency edges in machine truth.

---

## 4. Accepted Delivery Surface

The parent implementation materialized a new app package rooted at:

- `apps/tenant-console-web/package.json`
- `apps/tenant-console-web/app/**`
- `apps/tenant-console-web/components/**`
- `apps/tenant-console-web/lib/**`
- `apps/tenant-console-web/next.config.ts`
- `apps/tenant-console-web/tsconfig.json`
- repo-root `package.json` for the `dev:tenant` entrypoint

Key IA routes present in the delivered shell:

- `/`
- `/bookings`
- `/bookings/new`
- `/bookings/[bookingId]`
- `/api-keys`
- `/webhooks`
- `/audit`
- `/users`
- `/settings`

Reviewer-approved blocker fixes captured in the parent closeout:

- `apps/tenant-console-web/lib/navigation.ts`
  - nav matching ranks longer hrefs first so `/bookings/new` resolves before `/bookings`
- `apps/tenant-console-web/components/tenant-shell.tsx`
  - sidebar active state follows the resolved active item, preventing dual highlight on
    `/bookings/new`
- `package.json`
  - root `dev:tenant` launches `@drts/tenant-console-web`

---

## 5. Acceptance Checklist

Legend: `[REQUIRED]` = direct parent acceptance / reviewer evidence. `[DERIVED]` = reviewer
support gate for this sidecar packet.

### A. Shell and IA materialized `[REQUIRED]`

- [x] A dedicated `apps/tenant-console-web` workspace package exists.
- [x] The shell separates tenant-admin navigation from partner-entry mode instead of reusing the
      retired portal-shell launcher topology.
- [x] The required IA lanes are present: home, bookings, new booking, API keys, webhooks, audit,
      users, settings.

### B. Reviewer blockers resolved `[REQUIRED]`

- [x] `/bookings/new` wins over `/bookings` in nav resolution.
- [x] Sidebar active state marks only the resolved destination.
- [x] Root `dev:tenant` launches the canonical tenant console target instead of the sunset portal
      shell.

### C. Recorded verification evidence `[REQUIRED]`

- [x] `pnpm --filter @drts/tenant-console-web typecheck` passed in the approved parent handoff.
- [x] `pnpm --filter @drts/tenant-portal-web typecheck` passed in the approved parent handoff.
- [x] Parent closeout recorded commit `845f996126b156f2386d8b24644c3c1ebd4094bc` and normal
      push metadata on `origin/codex/dev-deploy-backend-android`.

### D. Sidecar handoff readiness `[DERIVED]`

- [x] This packet now reflects the parent task's current `done` state instead of the earlier
      `review_approved` pre-closeout snapshot.
- [x] This packet explicitly defers live sidecar lifecycle fields to `ai-status.json` so review
      loops do not stale the artifact.
- [x] This packet records the parent artifact/acceptance drift without claiming to fix canonical
      truth.
- [x] The packet remains support-only and does not edit L1 product truth, runtime code, or the
      parent task record.

---

## 6. Evidence Snapshot

Implementation evidence anchors:

- `apps/tenant-console-web/lib/navigation.ts`
- `apps/tenant-console-web/components/tenant-shell.tsx`
- `apps/tenant-console-web/app/bookings/page.tsx`
- `apps/tenant-console-web/app/bookings/new/page.tsx`
- `package.json`

Machine-truth closeout evidence anchors:

- `ai-status.json -> TEN-UI-002 -> status=done`
- `ai-status.json -> TEN-UI-002 -> commit_hash=845f996126b156f2386d8b24644c3c1ebd4094bc`
- `ai-status.json -> TEN-UI-002 -> push_ref=origin/codex/dev-deploy-backend-android`
- `current-work.md` closeout row for `TEN-UI-002` commit `845f996126b156f2386d8b24644c3c1ebd4094bc`

Known record-only drift:

- `ai-status.json -> TEN-UI-002 -> artifacts` still lists `apps/tenant-portal-web`
- `ai-status.json -> TEN-UI-002 -> acceptance` still lists only
  `pnpm --filter @drts/tenant-portal-web typecheck`
- reviewer-approved closeout evidence already confirms the canonical implementation lives in
  `apps/tenant-console-web`; this packet records that discrepancy but does not edit it

---

## 7. Reviewer Focus

For `Claude` reviewing this sidecar:

- confirm the sidecar anchor section keeps only stable assignment/scope fields and defers live
  sidecar workflow state to `ai-status.json`
- confirm the parent section reflects `TEN-UI-002` as `done` with the recorded commit/push
  evidence instead of stale pre-closeout language
- confirm the dependency map and acceptance checklist still match the finalized tenant-console
  shell outcome
- confirm the packet stays support-only and does not rewrite canonical truth

---

## 8. Handoff Summary

This packet is now a narrow acceptance reference for a parent task that is already closed in
machine truth. Its purpose is limited to preserving the dependency map, finalized acceptance
checklist, and closeout evidence in a reviewer-friendly form while leaving transient sidecar
lifecycle truth to `ai-status.json`.
