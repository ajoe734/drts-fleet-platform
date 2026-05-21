# UI-HANDOFF-TN-PAGE-PASSENGERS-001 Review Packet

**Sidecar Kind:** `review_packet`  
**Parent Task:** `UI-HANDOFF-TN-PAGE-PASSENGERS-001`  
**Parent Owner:** `Claude`  
**Parent Reviewer:** `Codex`  
**Sidecar Owner:** `Codex2`  
**Sidecar Reviewer:** `Claude`  
**Generated:** `2026-05-21` (UTC)  
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet is a reviewer-facing companion to
`UI-HANDOFF-TN-PAGE-PASSENGERS-001`. It does not modify canonical product
truth or runtime behavior. Its purpose is to pin the evidence chain behind the
already-approved parent handoff, identify what can still be reproduced from the
current branch head `dce03088`, and call out the artifacts that are no longer
present in this workspace.

At packet generation time, the parent task is already in
`review_approved` in canonical machine truth at `2026-05-21T01:31:57Z`.
The approved revision is `dce03088b5e71b2df6001c975476b6f2dfb3474f`, which is
contained by both `origin/claude/ui-handoff-tn-page-passengers-001` and
`origin/dev`.

## 1. Scope Boundary

In scope:

- summarize the parent handoff's approved state from canonical machine truth
- map the tenant passengers page to the file-level evidence available on
  `dce03088`
- provide a reviewer checklist for validating the support packet itself
- record evidence gaps where the original canvas/handoff artifacts are not
  present in this workspace

Out of scope:

- editing `apps/tenant-console-web/app/passengers/page.tsx` or any other
  runtime file
- rewriting `ai-status.json` parent semantics beyond normal lifecycle updates
- recreating missing design-canvas or `/tmp` handoff artifacts
- asserting new product truth beyond what the approved parent review already
  recorded

## 2. Machine-Truth Snapshot

### Sidecar — `UI-HANDOFF-TN-PAGE-PASSENGERS-001-SIDECAR-REVIEW`

- owner=`Codex2`
- reviewer=`Claude`
- status at drafting=`in_progress`
- helper_parent=`UI-HANDOFF-TN-PAGE-PASSENGERS-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=
  `support/sidecars/UI-HANDOFF-TN-PAGE-PASSENGERS-001/UI-HANDOFF-TN-PAGE-PASSENGERS-001-SIDECAR-REVIEW.md`

### Parent — `UI-HANDOFF-TN-PAGE-PASSENGERS-001`

- owner=`Claude`
- reviewer=`Codex`
- status=`review_approved`
- last_update=`2026-05-21T01:31:57Z`
- artifact=`apps/tenant-console-web/app/passengers/page.tsx`
- acceptance:
  - visual layout matches `TN_Passengers`
  - use canvas primitives from `packages/ui-web`
  - preserve existing server fetch and `lib/i18n` keys
  - JSX-only replacement
  - `pnpm --filter @drts/tenant-console-web typecheck + lint + build` pass
  - side-by-side parity target against
    `/tmp/driver-app-handoff/driver-app/project/TN_Passengers.html`

### Parent approval note

Canonical machine truth records the following approved outcome in the parent
task's `next` field:

- reviewer audited `origin/claude/ui-handoff-tn-page-passengers-001` at
  `dce03088`
- the page matched the intended handoff structure:
  `CanvasPageHeader` with tabs/actions, padded `CanvasCard`, and a
  `CanvasTable` with `NAME / EMP ID / DEPT / MOBILE / EMAIL / STATE`
  columns plus `CanvasPill` state badges
- the server-side tenant fetch flow was preserved
- reviewer verification reran:
  `pnpm --filter @drts/contracts build`,
  `pnpm --filter @drts/ui-tokens build`,
  `pnpm --filter @drts/tenant-console-web lint`,
  `pnpm --filter @drts/tenant-console-web typecheck`,
  `pnpm --filter @drts/tenant-console-web build`

## 3. Evidence Map

### A. Runtime page on approved revision

`apps/tenant-console-web/app/passengers/page.tsx` on `dce03088` shows:

- canvas primitives imported from `@drts/ui-web` at
  `page.tsx:4-14`
- server-side tenant fetch via `getTenantClient()` and
  `client.listPassengers()` at `page.tsx:134-150`
- tab model and filter routing at `page.tsx:71-76`, `161-185`
- `CanvasTable` columns exactly for `NAME`, `EMP ID`, `DEPT`, `MOBILE`,
  `EMAIL`, `STATE` at `page.tsx:200-238`
- `CanvasPageHeader` with tabs/actions at `page.tsx:242-258`
- padded body + `CanvasCard` + `CanvasBanner` error handling at
  `page.tsx:25-30`, `42-50`, `260-280`

This aligns with the parent review note recorded in machine truth.

### B. Tenant navigation anchor

`apps/tenant-console-web/lib/navigation.ts:59-65` keeps `/passengers` in the
tenant console's `通訊錄` section as:

- `key: "passengers"`
- `href: "/passengers"`
- `label: "乘客"`

### C. Backing contract surface

The reviewed page still sits on pre-existing tenant passenger APIs:

- API client:
  `packages/api-client/src/index.ts:1305-1310`
  - `listPassengers()`
  - `upsertPassenger(command)`
- backend controller:
  `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:398-418`
  - `GET /api/tenant/passengers`
  - `POST /api/tenant/passengers`

### D. Historical design and parity references

The current branch does not carry a live `TN_Passengers` source file under
`docs/05-ui/drts-design-canvas`, but the shipped tenant redesign documents
still cite it:

- `docs/05-ui/tenant-console-parity-decisions-20260510.md:297-369`
  records the contract-safe decision for `TEN-UI-RD-011`, including the
  `TN_Passengers` target and the explicit guardrail not to invent
  consent-version, CSV-import, or dedicated visitor-contract semantics
- `docs/05-ui/tenant-console-redesign-closeout-20260514.md:205-213`
  records the earlier `TEN-UI-RD-011` closeout against the same route family
  and the same read-only contract posture

These are not substitutes for the original canvas file, but they are the
best in-repo durable references still present in this workspace.

## 4. Reproducibility Notes

Reproducible from this workspace:

- approved branch head: `dce03088`
- current page structure and line-level evidence
- navigation entry
- API client/controller bindings
- historical parity decision and redesign closeout docs

Not reproducible from this workspace:

- `/tmp/driver-app-handoff/driver-app/project/TN_Passengers.html`
  was not present at packet generation time
- a live `TN_Passengers` source file under
  `docs/05-ui/drts-design-canvas/*` was not present on this branch
- `packages/ui-web/src/tenant-passengers.stories.tsx` was not present on this
  branch, despite being cited by older redesign docs

Reviewer implication:

- this sidecar packet should be reviewed as a control-plane/evidence artifact,
  not as a fresh parity certification replacing the parent review
- the authoritative approval for runtime correctness remains the parent
  task's `review_approved` event at `2026-05-21T01:31:57Z`

## 5. Reviewer Checklist

- confirm canonical machine truth still shows
  `UI-HANDOFF-TN-PAGE-PASSENGERS-001` in `review_approved`
- confirm `dce03088` is still contained by
  `origin/claude/ui-handoff-tn-page-passengers-001` and `origin/dev`
- confirm the packet's page-level claims match:
  - `apps/tenant-console-web/app/passengers/page.tsx:134-150`
  - `apps/tenant-console-web/app/passengers/page.tsx:200-280`
  - `apps/tenant-console-web/lib/navigation.ts:59-65`
  - `packages/api-client/src/index.ts:1305-1310`
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:398-418`
- confirm the packet accurately flags the missing `/tmp` handoff HTML and
  missing in-branch `TN_Passengers` source artifacts instead of overstating
  what is still reproducible

## 6. Handoff Recommendation

For `Claude` as sidecar reviewer:

- approve this sidecar if the evidence summary accurately mirrors the current
  parent `review_approved` state and the cited file anchors
- reopen only if this packet misstates the approved revision, omits a material
  evidence gap, or claims a still-available artifact that is absent from the
  branch
